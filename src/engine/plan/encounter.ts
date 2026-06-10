import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  EncounterCreatedEvent,
  EncounterEndedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  InitiativeRoll,
  InitiativeSwappedEvent,
  RoundEndedEvent,
  TurnEndedEvent,
  TurnStartedEvent,
} from '../../schemas/events/encounter.js';
import type {
  ConditionRemovedEvent,
  DeathSaveRolledEvent,
} from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId, newEncounterId } from '../../ids.js';
import { abilityModifier } from '../../derive/ability.js';
import { buildEffectStack, getEffectiveFeatIds } from '../../derive/effect-stack.js';
import { feetToCell } from '../../derive/pathing.js';
import { DEFAULT_CELL_SIZE_FEET } from '../../schemas/runtime/location.js';
import { D20_SIDES, NAT_20 } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import type { Character } from '../../schemas/runtime/character.js';
import { planBreathWeaponRechargeAtTurnStart } from './breath-weapon.js';
import { applyHalflingLuckFromFlag, applyHalflingLuckForCharacter } from './_halfling-luck.js';
import { planRegenerationAtTurnStart } from './regeneration.js';

const DEATH_SAVE_SUCCESS_THRESHOLD = 10;
const DEATH_SAVE_FAILURES_TO_DIE = 3;
const DEATH_SAVE_SUCCESSES_TO_STABILIZE = 3;

/**
 * At the start of a combatant's turn, sweep every character's applied
 * conditions for entries whose `sourceCharacterId` is the combatant
 * starting the turn, whose `expiryTrigger` is 'turnStart' (or
 * unspecified — the slice-102 default for trigger-applied conditions),
 * and whose `expiresOnRound` has now arrived. RAW shape this models:
 * "until the start of the source's next turn" — Spirit Shroud's
 * heal-block, future similar riders stamped via durationRounds on
 * ApplyCondition trigger actions.
 *
 * Conditions stamped with `expiryTrigger: 'turnEnd'` (Blade Ward and
 * future "1 round" buffs) are handled by `planAutoExpireConditionsAtTurnEnd`
 * instead.
 */
const planAutoExpireConditionsAtTurnStart = (
  state: CampaignState,
  content: ResolvedContent,
  sourceCharacterId: string,
  round: number,
  causedByEventId: ULID,
  at: string,
): ReadonlyArray<ConditionRemovedEvent> => {
  const events: ConditionRemovedEvent[] = [];
  for (const character of Object.values(state.characters)) {
    for (const applied of character.appliedConditions) {
      // Slice 623: by default key the expiry on `sourceCharacterId`
      // (so a condition with source = caster expires on the caster's
      // turn). Conditions with `expirySourceFromBearer: true` key on
      // the BEARER instead (Vex: source = vexed target for the
      // consumeOnAttack filter, but expiry RAW is "end of YOUR next
      // turn" — the vexer's, which is the bearer).
      const expirySource = content.conditions.get(applied.conditionId)?.autoExpiry?.expirySourceFromBearer === true
        ? character.id
        : applied.sourceCharacterId;
      if (expirySource !== sourceCharacterId) continue;
      if (applied.expiresOnRound === undefined) continue;
      if (applied.expiresOnRound > round) continue;
      if (applied.expiryTrigger === 'turnEnd') continue;
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionRemoved',
        targetId: character.id as ULID,
        conditionId: applied.conditionId,
        causedByEventId,
      });
    }
  }
  return events;
};

/**
 * Mirror of `planAutoExpireConditionsAtTurnStart` for turn-end-keyed
 * auto-expiry. RAW shape: "until the end of your next turn" /
 * "for 1 round" — Blade Ward's 1-round self-buff is the canonical
 * user. Called from `planAdvanceTurn` after the TurnEnded event so
 * the condition is still active during the combatant's just-finished
 * turn and only lifts when that turn's resolution wraps up.
 */
const planAutoExpireConditionsAtTurnEnd = (
  state: CampaignState,
  content: ResolvedContent,
  sourceCharacterId: string,
  round: number,
  causedByEventId: ULID,
  at: string,
): ReadonlyArray<ConditionRemovedEvent> => {
  const events: ConditionRemovedEvent[] = [];
  for (const character of Object.values(state.characters)) {
    for (const applied of character.appliedConditions) {
      // Slice 623: see planAutoExpireConditionsAtTurnStart -- same
      // expirySourceFromBearer override.
      const expirySource = content.conditions.get(applied.conditionId)?.autoExpiry?.expirySourceFromBearer === true
        ? character.id
        : applied.sourceCharacterId;
      if (expirySource !== sourceCharacterId) continue;
      if (applied.expiresOnRound === undefined) continue;
      if (applied.expiresOnRound > round) continue;
      if (applied.expiryTrigger !== 'turnEnd') continue;
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionRemoved',
        targetId: character.id as ULID,
        conditionId: applied.conditionId,
        causedByEventId,
      });
    }
  }
  return events;
};

/**
 * RAW 2024 PHB ch.1: at the start of an unconscious creature's turn at 0 HP,
 * if it's neither stable nor already dead (3 failures), it rolls a death save.
 * The roll is part of the turn-start event chain.
 */
const planDeathSaveAtTurnStart = (
  character: Character | undefined,
  rng: RNG,
  causedByEventId: ULID,
  at: string,
  state: CampaignState,
  content: ResolvedContent,
): ReadonlyArray<DeathSaveRolledEvent> => {
  if (!character) return [];
  if (character.hp.current > 0) return [];
  if (character.deathSaves.stable) return [];
  if (character.deathSaves.failures >= DEATH_SAVE_FAILURES_TO_DIE) return [];
  if (character.deathSaves.successes >= DEATH_SAVE_SUCCESSES_TO_STABILIZE) return [];
  // Slice 679: death-save advantage from the bearer's effect stack
  // (Beacon of Hope's GrantDeathSaveAdvantage marker). When set,
  // roll 2d20 and take the higher per RAW advantage rules.
  const effects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const advantage = effects.hasDeathSaveAdvantage();
  const first = rollDie(D20_SIDES, rng);
  const rolls: number[] = [first];
  let chosen = first;
  if (advantage) {
    const second = rollDie(D20_SIDES, rng);
    rolls.push(second);
    chosen = Math.max(first, second);
  }
  // Slice 543: Halfling Luck on death save (reroll-on-nat-1).
  const d20 = applyHalflingLuckForCharacter(chosen, character.id, state, content, rolls, rng);
  const success = d20 >= DEATH_SAVE_SUCCESS_THRESHOLD;
  const critical = d20 === NAT_20;
  const save: DeathSaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'DeathSaveRolled',
    targetId: character.id as ULID,
    d20,
    success,
    critical,
    causedByEventId,
  };
  return [save];
};

export interface CreateEncounterCombatant {
  readonly characterId: string;
  // Slice 683: optional starting position for the combatant on the
  // encounter's battle map. When omitted, the combatant joins
  // positionless (mid-encounter placement via planPlaceCombatant
  // can set it later).
  readonly position?: { x: number; y: number };
}

export interface CreateEncounterIntent {
  readonly type: 'CreateEncounter';
  // Slice 683: prefer `combatants` for placement-aware encounters.
  // `combatantIds` is retained for back-compat (no positions).
  // Exactly one of the two must be supplied.
  readonly combatants?: ReadonlyArray<CreateEncounterCombatant>;
  readonly combatantIds?: ReadonlyArray<string>;
  readonly name?: string;
  readonly encounterId?: string;
  readonly at?: string;
}

// Slice 683 / 684: per-combatant placement validation. When the
// associated location has a map, the position (in FEET-coords, per
// the engine-wide convention plan.move uses) is converted to cell-
// coords via `feetToCell` and validated: (a) in cell bounds,
// (b) not on impassable terrain, and (c) not overlapping any other
// combatant in the same CELL. Cross-batch collision checks
// (e.g., against existing combatants placed earlier) live in
// planPlaceCombatant below.
const validatePlacementAgainstMap = (
  state: CampaignState,
  characterId: string,
  position: { x: number; y: number },
  otherPositions: ReadonlyArray<{ characterId: string; position: { x: number; y: number } }>,
): void => {
  const locationId = state.characterLocations[characterId];
  const map = locationId !== undefined ? state.locations[locationId]?.map : undefined;
  if (map !== undefined) {
    const cell = feetToCell(position, map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET);
    if (cell.x < 0 || cell.x >= map.widthCells || cell.y < 0 || cell.y >= map.heightCells) {
      throw new Error(
        `Combatant ${characterId} placement (${position.x},${position.y}) is out of bounds for the location map`,
      );
    }
    const terrain = map.terrain[cell.y]?.[cell.x];
    if (terrain === 'impassable') {
      throw new Error(
        `Combatant ${characterId} placement (${position.x},${position.y}) is on impassable terrain`,
      );
    }
  }
  // Per-batch / cross-batch collision: compare in cell-space (two
  // positions in the same cell collide even if their feet-coords
  // differ within the cell). Falls back to exact-feet comparison
  // when no map is present.
  const cellSize = map?.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const myCell = map !== undefined ? feetToCell(position, cellSize) : position;
  for (const other of otherPositions) {
    if (other.characterId === characterId) continue;
    const theirCell = map !== undefined ? feetToCell(other.position, cellSize) : other.position;
    if (myCell.x === theirCell.x && myCell.y === theirCell.y) {
      throw new Error(
        `Combatant ${characterId} placement (${position.x},${position.y}) collides with combatant ${other.characterId}`,
      );
    }
  }
};

export const planCreateEncounter = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: CreateEncounterIntent,
): { events: ReadonlyArray<Event>; encounterId: string } => {
  if (intent.combatants === undefined && intent.combatantIds === undefined) {
    throw new Error('CreateEncounterIntent requires either `combatants` or `combatantIds`');
  }
  if (intent.combatants !== undefined && intent.combatantIds !== undefined) {
    throw new Error(
      'CreateEncounterIntent: pass `combatants` (placement-aware) OR `combatantIds` (legacy), not both',
    );
  }
  const encounterId = intent.encounterId ?? newEncounterId();
  const at = intent.at ?? nowIso();

  if (intent.combatants !== undefined) {
    // Validate placements against location maps + per-batch collision.
    const placed: { characterId: string; position: { x: number; y: number } }[] = intent.combatants
      .filter((c): c is CreateEncounterCombatant & { position: { x: number; y: number } } =>
        c.position !== undefined,
      )
      .map((c) => ({ characterId: c.characterId, position: c.position }));
    for (const entry of placed) {
      validatePlacementAgainstMap(state, entry.characterId, entry.position, placed);
    }
    const event: EncounterCreatedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'EncounterCreated',
      encounterId,
      ...(intent.name !== undefined ? { name: intent.name } : {}),
      combatants: intent.combatants.map((c) => ({
        characterId: c.characterId,
        ...(c.position !== undefined ? { position: { x: c.position.x, y: c.position.y } } : {}),
      })),
    };
    return { events: [event], encounterId };
  }

  const event: EncounterCreatedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'EncounterCreated',
    encounterId,
    ...(intent.name !== undefined ? { name: intent.name } : {}),
    combatantIds: [...intent.combatantIds!],
  };
  return { events: [event], encounterId };
};

// Slice 683: mid-encounter placement / teleport / dimension-door.
// Sets the named combatant's position on the encounter. Validates
// against the location map (in-bounds, not impassable) and against
// other combatants currently in the encounter (no collision).
export interface PlaceCombatantIntent {
  readonly type: 'PlaceCombatant';
  readonly encounterId: string;
  readonly combatantId: string;
  readonly position: { x: number; y: number };
  readonly at?: string;
}

export const planPlaceCombatant = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: PlaceCombatantIntent,
): ReadonlyArray<Event> => {
  const encounter = state.encounters[intent.encounterId];
  if (encounter === undefined) {
    throw new Error(`Encounter ${intent.encounterId} not found`);
  }
  const combatant = encounter.combatants.find((c) => c.combatantId === intent.combatantId);
  if (combatant === undefined) {
    throw new Error(
      `Combatant ${intent.combatantId} not in encounter ${intent.encounterId}`,
    );
  }
  // Cross-combatant collision: gather every OTHER combatant's
  // position (excluding the moving combatant itself, so a re-place
  // to the same cell is OK).
  const others = encounter.combatants
    .filter((c) => c.combatantId !== intent.combatantId && c.position !== undefined)
    .map((c) => ({ characterId: c.combatantId, position: c.position! }));
  validatePlacementAgainstMap(state, intent.combatantId, intent.position, others);

  const at = intent.at ?? nowIso();
  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'CombatantPlaced',
      encounterId: intent.encounterId as ULID,
      combatantId: intent.combatantId as ULID,
      position: { x: intent.position.x, y: intent.position.y },
    },
  ];
};

export interface RollInitiativeIntent {
  readonly type: 'RollInitiative';
  readonly encounterId: string;
  readonly at?: string;
  // Slice 802: combatant ids the consumer designates as Surprised
  // (caught unawares at the start of combat). RAW 2024 (rules-glossary
  // "Surprise"): a Surprised creature has Disadvantage on its Initiative
  // roll. The engine has no stealth / awareness model, so the consumer
  // supplies who's surprised (same consumer-coordinated-fact shape as
  // positions / line of sight). Omitted → nobody surprised (unchanged).
  readonly surprisedCombatantIds?: ReadonlyArray<string>;
}

export const planRollInitiative = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: RollInitiativeIntent,
): ReadonlyArray<Event> => {
  const encounter = state.encounters[intent.encounterId];
  if (!encounter) throw new Error(`Unknown encounter ${intent.encounterId}`);
  const at = intent.at ?? nowIso();
  const rolls: InitiativeRoll[] = encounter.combatants.map((c) => {
    const character = state.characters[c.combatantId];
    const dexMod = character ? abilityModifier(character.abilityScores.DEX) : 0;
    // Barbarian Feral Instinct (and similar): advantage on initiative.
    // Slice 468: also fold the effect stack's 'initiative' AddModifier
    // sum into the roll (Alert's "+PB to initiative" arm; future
    // initiative-bonus content plugs in the same way).
    let d20: number;
    let effectModifier = 0;
    if (character !== undefined) {
      const effects = buildEffectStack({
        character,
        content,
        itemInstances: state.itemInstances,
        pendingChoices: state.pendingChoices,
      });
      const adv = effects.advantageFor('initiative');
      // Slice 802: a Surprised combatant rolls Initiative with
      // Disadvantage (RAW 2024). OR it into the effect-stack disadvantage;
      // advantage + surprise cancel to a straight roll per the normal
      // advantage/disadvantage interaction.
      const surprised = intent.surprisedCombatantIds?.includes(c.combatantId) === true;
      const hasAdvantage = adv.advantage;
      const hasDisadvantage = adv.disadvantage || surprised;
      const rolls: number[] = [];
      if (hasAdvantage && !hasDisadvantage) {
        const a = rollDie(D20_SIDES, rng);
        const b = rollDie(D20_SIDES, rng);
        rolls.push(a, b);
        d20 = Math.max(a, b);
      } else if (hasDisadvantage && !hasAdvantage) {
        const a = rollDie(D20_SIDES, rng);
        const b = rollDie(D20_SIDES, rng);
        rolls.push(a, b);
        d20 = Math.min(a, b);
      } else {
        d20 = rollDie(D20_SIDES, rng);
        rolls.push(d20);
      }
      // Slice 543: Halfling Luck on initiative.
      if (d20 === 1 && effects.hasHalflingLuck()) {
        d20 = applyHalflingLuckFromFlag(d20, true, rolls, rng);
      }
      effectModifier = effects.modifierSum('initiative', new Map());
    } else {
      d20 = rollDie(D20_SIDES, rng);
    }
    const modifier = dexMod + effectModifier;
    return {
      combatantId: c.combatantId,
      d20,
      modifier,
      total: d20 + modifier,
    };
  });
  const event: InitiativeRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'InitiativeRolled',
    encounterId: intent.encounterId,
    rolls,
  };
  return [event];
};

// Slice 468: Alert (Origin Feat) Initiative Swap. RAW (SRD 5.2.1):
// "Immediately after you roll Initiative, you can swap your Initiative
// with the Initiative of one willing ally in the same combat. You can't
// make this swap if you or the ally has the Incapacitated condition."
// Consumer-driven (the player chooses to invoke the swap), so this
// ships as a separate planner rather than a planRollInitiative side
// effect. The "willing ally" predicate is consumer-modeled (the engine
// has no party / allegiance graph); the planner trusts the consumer's
// designation. Encounter status must still be 'planning' (RAW
// "immediately after you roll Initiative" — before combat starts).
const ALERT_FEAT_ID = 'alert';
const INCAPACITATED_CONDITION_ID = 'incapacitated';

export interface SwapInitiativeIntent {
  readonly type: 'SwapInitiative';
  readonly encounterId: string;
  readonly swapperId: string;
  readonly allyId: string;
  readonly at?: string;
}

export const planSwapInitiative = (
  state: CampaignState,
  content: ResolvedContent,
  intent: SwapInitiativeIntent,
): ReadonlyArray<Event> => {
  const encounter = state.encounters[intent.encounterId];
  if (!encounter) throw new Error(`Unknown encounter ${intent.encounterId}`);
  if (encounter.status !== 'planning') {
    throw new Error('Initiative swap requires planning status (use immediately after rolling)');
  }
  const swapper = state.characters[intent.swapperId];
  if (!swapper) throw new Error(`Unknown swapper ${intent.swapperId}`);
  const ally = state.characters[intent.allyId];
  if (!ally) throw new Error(`Unknown ally ${intent.allyId}`);
  if (intent.swapperId === intent.allyId) {
    throw new Error('Cannot swap initiative with self');
  }
  if (!getEffectiveFeatIds(swapper, content).includes(ALERT_FEAT_ID)) {
    throw new Error(`${swapper.name} does not have the Alert feat`);
  }
  const swapperCb = encounter.combatants.find((c) => c.combatantId === intent.swapperId);
  if (!swapperCb) throw new Error(`${swapper.name} is not in encounter ${intent.encounterId}`);
  const allyCb = encounter.combatants.find((c) => c.combatantId === intent.allyId);
  if (!allyCb) throw new Error(`${ally.name} is not in encounter ${intent.encounterId}`);
  const hasIncapacitated = (c: Character): boolean =>
    c.appliedConditions.some((ac) => ac.conditionId === INCAPACITATED_CONDITION_ID);
  if (hasIncapacitated(swapper)) {
    throw new Error(`${swapper.name} cannot swap initiative while Incapacitated`);
  }
  if (hasIncapacitated(ally)) {
    throw new Error(`${ally.name} cannot swap initiative while Incapacitated`);
  }
  const event: InitiativeSwappedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'InitiativeSwapped',
    encounterId: intent.encounterId,
    swapperId: intent.swapperId as ULID,
    allyId: intent.allyId as ULID,
    swapperPreviousTotal: swapperCb.initiative,
    allyPreviousTotal: allyCb.initiative,
  };
  return [event];
};

export interface StartEncounterIntent {
  readonly type: 'StartEncounter';
  readonly encounterId: string;
  readonly at?: string;
}

export const planStartEncounter = (
  _state: CampaignState,
  _content: ResolvedContent,
  intent: StartEncounterIntent,
): ReadonlyArray<Event> => {
  const event: EncounterStartedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'EncounterStarted',
    encounterId: intent.encounterId,
  };
  return [event];
};

export interface AdvanceTurnIntent {
  readonly type: 'AdvanceTurn';
  readonly encounterId: string;
  readonly at?: string;
}

export const planAdvanceTurn = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: AdvanceTurnIntent,
): ReadonlyArray<Event> => {
  const encounter = state.encounters[intent.encounterId];
  if (!encounter) throw new Error(`Unknown encounter ${intent.encounterId}`);
  const at = intent.at ?? nowIso();
  const current = encounter.combatants[encounter.activeIndex];
  if (!current) throw new Error('No active combatant');
  const turnEnd: TurnEndedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'TurnEnded',
    encounterId: intent.encounterId,
    combatantId: current.combatantId,
    round: encounter.round,
  };
  // Sweep `expiryTrigger: 'turnEnd'` conditions for the combatant
  // whose turn is ending (slice 109; Blade Ward, future "1 round"
  // self-buffs). Conditions are still active during the just-finished
  // turn; the sweep emits ConditionRemoved here so they're gone for
  // the next combatant's actions.
  const endTurnExpired = planAutoExpireConditionsAtTurnEnd(
    state,
    content,
    current.combatantId,
    encounter.round,
    turnEnd.id,
    at,
  );
  const isLast = encounter.activeIndex >= encounter.combatants.length - 1;
  if (isLast) {
    const roundEnd: RoundEndedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'RoundEnded',
      encounterId: intent.encounterId,
      round: encounter.round,
    };
    const first = encounter.combatants[0];
    if (!first) throw new Error('No combatants');
    const nextTurn: TurnStartedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'TurnStarted',
      encounterId: intent.encounterId,
      combatantId: first.combatantId,
      round: encounter.round + 1,
    };
    const deathSave = planDeathSaveAtTurnStart(
      state.characters[first.combatantId],
      rng,
      nextTurn.id,
      at,
      state,
      content,
    );
    const expired = planAutoExpireConditionsAtTurnStart(
      state,
      content,
      first.combatantId,
      encounter.round + 1,
      nextTurn.id,
      at,
    );
    const recharge = planBreathWeaponRechargeAtTurnStart(
      state,
      content,
      rng,
      first.combatantId,
      at,
    );
    const regen = planRegenerationAtTurnStart(state, content, first.combatantId, at);
    return [turnEnd, ...endTurnExpired, roundEnd, nextTurn, ...deathSave, ...expired, ...recharge, ...regen];
  }
  const next = encounter.combatants[encounter.activeIndex + 1];
  if (!next) throw new Error('Bad combatant index');
  const nextTurn: TurnStartedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'TurnStarted',
    encounterId: intent.encounterId,
    combatantId: next.combatantId,
    round: encounter.round,
  };
  const deathSave = planDeathSaveAtTurnStart(
    state.characters[next.combatantId],
    rng,
    nextTurn.id,
    at,
    state,
    content,
  );
  const expired = planAutoExpireConditionsAtTurnStart(
    state,
    content,
    next.combatantId,
    encounter.round,
    nextTurn.id,
    at,
  );
  const recharge = planBreathWeaponRechargeAtTurnStart(
    state,
    content,
    rng,
    next.combatantId,
    at,
  );
  const regen = planRegenerationAtTurnStart(state, content, next.combatantId, at);
  return [turnEnd, ...endTurnExpired, nextTurn, ...deathSave, ...expired, ...recharge, ...regen];
};

export interface BeginFirstTurnIntent {
  readonly type: 'BeginFirstTurn';
  readonly encounterId: string;
  readonly at?: string;
}

export const planBeginFirstTurn = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: BeginFirstTurnIntent,
): ReadonlyArray<Event> => {
  const encounter = state.encounters[intent.encounterId];
  if (!encounter) throw new Error(`Unknown encounter ${intent.encounterId}`);
  const first = encounter.combatants[0];
  if (!first) throw new Error('No combatants');
  const at = intent.at ?? nowIso();
  const turnStart: TurnStartedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'TurnStarted',
    encounterId: intent.encounterId,
    combatantId: first.combatantId,
    round: encounter.round,
  };
  const deathSave = planDeathSaveAtTurnStart(
    state.characters[first.combatantId],
    rng,
    turnStart.id,
    at,
    state,
    content,
  );
  const recharge = planBreathWeaponRechargeAtTurnStart(
    state,
    content,
    rng,
    first.combatantId,
    at,
  );
  const regen = planRegenerationAtTurnStart(state, content, first.combatantId, at);
  return [turnStart, ...deathSave, ...recharge, ...regen];
};

export interface EndEncounterIntent {
  readonly type: 'EndEncounter';
  readonly encounterId: string;
  readonly outcome: 'victory' | 'defeat' | 'fled' | 'parley';
  readonly at?: string;
}

export const planEndEncounter = (
  _state: CampaignState,
  _content: ResolvedContent,
  intent: EndEncounterIntent,
): ReadonlyArray<Event> => {
  const event: EncounterEndedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'EncounterEnded',
    encounterId: intent.encounterId,
    outcome: intent.outcome,
  };
  return [event];
};
