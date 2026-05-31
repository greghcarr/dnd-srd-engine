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
import { D20_SIDES, NAT_20 } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import type { Character } from '../../schemas/runtime/character.js';
import { planBreathWeaponRechargeAtTurnStart } from './breath-weapon.js';
import { applyHalflingLuckFromFlag } from './_halfling-luck.js';
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
  sourceCharacterId: string,
  round: number,
  causedByEventId: ULID,
  at: string,
): ReadonlyArray<ConditionRemovedEvent> => {
  const events: ConditionRemovedEvent[] = [];
  for (const character of Object.values(state.characters)) {
    for (const applied of character.appliedConditions) {
      if (applied.sourceCharacterId !== sourceCharacterId) continue;
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
  sourceCharacterId: string,
  round: number,
  causedByEventId: ULID,
  at: string,
): ReadonlyArray<ConditionRemovedEvent> => {
  const events: ConditionRemovedEvent[] = [];
  for (const character of Object.values(state.characters)) {
    for (const applied of character.appliedConditions) {
      if (applied.sourceCharacterId !== sourceCharacterId) continue;
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
): ReadonlyArray<DeathSaveRolledEvent> => {
  if (!character) return [];
  if (character.hp.current > 0) return [];
  if (character.deathSaves.stable) return [];
  if (character.deathSaves.failures >= DEATH_SAVE_FAILURES_TO_DIE) return [];
  if (character.deathSaves.successes >= DEATH_SAVE_SUCCESSES_TO_STABILIZE) return [];
  const d20 = rollDie(D20_SIDES, rng);
  // Slice 543 deferral: Halfling Luck on death saves not wired
  // here. planDeathSaveAtTurnStart's 3 callers would all need
  // state + content threading; documented as a sweep follow-up.
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

export interface CreateEncounterIntent {
  readonly type: 'CreateEncounter';
  readonly combatantIds: ReadonlyArray<string>;
  readonly name?: string;
  readonly encounterId?: string;
  readonly at?: string;
}

export const planCreateEncounter = (
  _state: CampaignState,
  _content: ResolvedContent,
  intent: CreateEncounterIntent,
): { events: ReadonlyArray<Event>; encounterId: string } => {
  const encounterId = intent.encounterId ?? newEncounterId();
  const at = intent.at ?? nowIso();
  const event: EncounterCreatedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'EncounterCreated',
    encounterId,
    ...(intent.name !== undefined ? { name: intent.name } : {}),
    combatantIds: [...intent.combatantIds],
  };
  return { events: [event], encounterId };
};

export interface RollInitiativeIntent {
  readonly type: 'RollInitiative';
  readonly encounterId: string;
  readonly at?: string;
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
      const rolls: number[] = [];
      if (adv.advantage && !adv.disadvantage) {
        const a = rollDie(D20_SIDES, rng);
        const b = rollDie(D20_SIDES, rng);
        rolls.push(a, b);
        d20 = Math.max(a, b);
      } else if (adv.disadvantage && !adv.advantage) {
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
    );
    const expired = planAutoExpireConditionsAtTurnStart(
      state,
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
  );
  const expired = planAutoExpireConditionsAtTurnStart(
    state,
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
