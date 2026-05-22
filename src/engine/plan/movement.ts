import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { Position } from '../../schemas/runtime/encounter.js';
import type { Combatant } from '../../schemas/runtime/encounter.js';
import type {
  CombatantMovedEvent,
  DashedEvent,
  DisengagedEvent,
  OpportunityAvailableEvent,
} from '../../schemas/events/movement.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { SpellCastDeclaredEvent, SpellSlotConsumedEvent } from '../../schemas/events/spellcasting.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, rollExpression } from '../../rng/dice.js';
import { D20_SIDES } from '../../internal/constants.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { applyAll } from '../apply.js';
import { newAppliedConditionId } from '../../ids.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';
import { assertActorCanAct, getEffectiveSpeed, findActorBlockingCondition } from './_actor-state.js';
import { bresenhamCells, movementCostAt } from '../../derive/terrain.js';
import { DEFAULT_CELL_SIZE_FEET } from '../../schemas/runtime/location.js';

export interface MoveIntent {
  readonly type: 'Move';
  readonly combatantId: string;
  readonly to: Position;
  readonly at?: string;
}

export interface DashIntent {
  readonly type: 'Dash';
  readonly combatantId: string;
  readonly at?: string;
}

export interface DisengageIntent {
  readonly type: 'Disengage';
  readonly combatantId: string;
  readonly at?: string;
}

export const chebyshevDistance = (a: Position, b: Position): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const findCombatant = (
  state: CampaignState,
  combatantId: string,
): { encounterId: string; combatant: Combatant; isActive: boolean } => {
  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) {
    throw new Error('Movement requires an active encounter');
  }
  const encounter = state.encounters[encounterId];
  if (!encounter || encounter.status !== 'active') {
    throw new Error('Movement requires an active encounter');
  }
  const combatant = encounter.combatants.find((c) => c.combatantId === combatantId);
  if (!combatant) {
    throw new Error(`Combatant ${combatantId} not in active encounter`);
  }
  const isActive = encounter.combatants[encounter.activeIndex]?.combatantId === combatantId;
  return { encounterId, combatant, isActive };
};

const characterWalkSpeed = (
  state: CampaignState,
  content: ResolvedContent,
  characterId: string,
): number => {
  const character = state.characters[characterId];
  if (!character) return 30;
  return getEffectiveSpeed({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
};

export const planMove = (
  state: CampaignState,
  content: ResolvedContent,
  intent: MoveIntent,
): ReadonlyArray<Event> => {
  const { encounterId, combatant, isActive } = findCombatant(state, intent.combatantId);
  if (!isActive) {
    throw new Error('Only the active combatant may move on their turn');
  }
  const character = state.characters[intent.combatantId];
  if (character) assertActorCanAct(character, 'Move');
  if (combatant.position === undefined) {
    throw new Error('Combatant has no position set');
  }
  // RAW Appendix "Frightened": "while frightened by a source, you
  // can't willingly move closer to the source of your fear." If the
  // mover carries a Frightened condition with a sourceCharacterId set,
  // and the destination is closer (Chebyshev) to that source than the
  // current position, reject the move.
  if (character !== undefined) {
    const frightenedBy = character.appliedConditions.find(
      (c) => c.conditionId === 'frightened' && c.sourceCharacterId !== undefined,
    );
    if (frightenedBy?.sourceCharacterId !== undefined) {
      const sourceCb = state.encounters[encounterId]?.combatants.find(
        (c) => c.combatantId === frightenedBy.sourceCharacterId,
      );
      if (sourceCb?.position !== undefined) {
        const before = chebyshevDistance(combatant.position, sourceCb.position);
        const after = chebyshevDistance(intent.to, sourceCb.position);
        if (after < before) {
          const sourceName =
            state.characters[frightenedBy.sourceCharacterId]?.name ??
            frightenedBy.sourceCharacterId;
          throw new Error(
            `${character.name} is Frightened by ${sourceName} and cannot move closer to them`,
          );
        }
      }
    }
  }
  // RAW PHB ch.1 "Difficult Terrain": each foot of movement through
  // difficult terrain costs 1 extra foot. If the moving character is
  // associated with a Location that has a map, walk Bresenham cells
  // from the start to the destination and sum per-cell costs (skipping
  // the starting cell, since RAW counts ENTRY into a difficult cell).
  // Without a location-map context, falls back to plain Chebyshev.
  const locationId = state.characterLocations[intent.combatantId];
  const map =
    locationId !== undefined ? state.locations[locationId]?.map : undefined;
  let distance: number;
  if (map !== undefined) {
    const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
    const fromCell = {
      x: Math.floor(combatant.position.x / cellSize),
      y: Math.floor(combatant.position.y / cellSize),
    };
    const toCell = {
      x: Math.floor(intent.to.x / cellSize),
      y: Math.floor(intent.to.y / cellSize),
    };
    const cells = bresenhamCells(fromCell, toCell);
    // Sum cost for each cell ENTERED (everything past the starting cell).
    let costInCells = 0;
    for (let i = 1; i < cells.length; i++) {
      const cell = cells[i]!;
      costInCells += movementCostAt(map, cell.x, cell.y);
    }
    if (!Number.isFinite(costInCells)) {
      throw new Error(
        `Path crosses impassable terrain between (${combatant.position.x},${combatant.position.y}) and (${intent.to.x},${intent.to.y})`,
      );
    }
    distance = costInCells * cellSize;
  } else {
    distance = chebyshevDistance(combatant.position, intent.to);
  }
  const baseSpeed = characterWalkSpeed(state, content, intent.combatantId);
  if (baseSpeed === 0) {
    throw new Error(
      `${character?.name ?? intent.combatantId} cannot move (speed reduced to 0 by Restrained / Grappled)`,
    );
  }
  const maxThisTurn = combatant.turnUsage.dashed ? baseSpeed * 2 : baseSpeed;
  const remaining = maxThisTurn - combatant.turnUsage.feetMovedThisTurn;
  // RAW PHB ch.1 "Prone → Standing Up": "Standing up takes more
  // effort; doing so costs an amount of movement equal to half your
  // speed." The engine treats a Move while Prone as an implicit
  // stand-up-then-walk: half-speed surcharge added to the move's cost,
  // ConditionRemoved(prone) emitted before CombatantMoved so the
  // condition is gone for any downstream geometry checks.
  const isProne = character?.appliedConditions.some((c) => c.conditionId === 'prone') ?? false;
  const standUpCost = isProne ? Math.floor(baseSpeed / 2) : 0;
  const totalCost = distance + standUpCost;
  if (totalCost > remaining) {
    const detail = isProne
      ? `${distance}ft move + ${standUpCost}ft stand-up`
      : `${distance}ft`;
    throw new Error(
      `Move (${detail}) exceeds remaining movement (${remaining}ft of ${maxThisTurn}ft)`,
    );
  }
  // RAW 2024 PHB "Moving Around Other Creatures": you can pass through
  // a nonhostile creature's space (treated as difficult terrain for
  // same-size creatures), but you cannot willingly end a move in
  // another creature's space, friend or foe. The engine only models
  // the destination of a move, not the path, so this check rejects
  // moves that *end* on an occupied square. Pass-through is permitted
  // implicitly since intermediate squares aren't simulated.
  const blocker = state.encounters[encounterId]?.combatants.find(
    (c) =>
      c.combatantId !== intent.combatantId &&
      c.position !== undefined &&
      c.position.x === intent.to.x &&
      c.position.y === intent.to.y,
  );
  if (blocker !== undefined) {
    const occupier = state.characters[blocker.combatantId];
    const name = occupier?.name ?? blocker.combatantId;
    throw new Error(
      `Destination (${intent.to.x},${intent.to.y}) is occupied by ${name}; you can't end a move in another creature's space`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  if (isProne) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: intent.combatantId,
      conditionId: 'prone',
    });
  }
  const moved: CombatantMovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'CombatantMoved',
    encounterId,
    combatantId: intent.combatantId,
    fromPosition: { ...combatant.position },
    toPosition: { ...intent.to },
    // Charge the stand-up overhead against the move's feetTraveled so
    // the CombatantMoved reducer drains feetMovedThisTurn by the full
    // RAW cost. The actual travel distance is `distance`; the prone
    // stand-up surcharge bumps it up to the total movement spent.
    feetTraveled: totalCost,
  };
  events.push(moved);
  // RAW 2024 PHB ch.1 "Opportunity Attack": moving out of a creature's
  // Reach provokes an opportunity attack from that creature. The
  // engine emits one OpportunityAvailable per eligible reactor so the
  // consumer can decide (per reactor) whether to dispatch
  // engine.plan.opportunityAttack. Disengage suppresses these for the
  // rest of the turn. Rogue Withdraw (Cunning Strike) instead grants a
  // no-provoke distance budget: movement that keeps cumulative travel
  // within `noProvokeMovementUpToFeet` doesn't provoke, but movement
  // past that high-water-mark does.
  const withinNoProvokeBudget =
    combatant.turnUsage.feetMovedThisTurn + distance <=
    combatant.turnUsage.noProvokeMovementUpToFeet;
  if (!combatant.turnUsage.disengaged && !withinNoProvokeBudget) {
    const fromPos = combatant.position;
    const toPos = intent.to;
    const MELEE_REACH = 5;
    const enc = state.encounters[encounterId];
    if (enc) {
      for (const other of enc.combatants) {
        if (other.combatantId === intent.combatantId) continue;
        if (!other.position) continue;
        const wasInReach =
          Math.max(Math.abs(other.position.x - fromPos.x), Math.abs(other.position.y - fromPos.y)) <=
          MELEE_REACH;
        const stillInReach =
          Math.max(Math.abs(other.position.x - toPos.x), Math.abs(other.position.y - toPos.y)) <=
          MELEE_REACH;
        if (!wasInReach || stillInReach) continue;
        const reactorChar = state.characters[other.combatantId];
        // Unconscious / Incapacitated / Stunned / Paralyzed / Petrified
        // creatures can't take reactions.
        if (!reactorChar || findActorBlockingCondition(reactorChar) !== undefined) continue;
        // Reaction already spent this round → no opportunity.
        if (other.turnUsage.reactionUsedThisRound) continue;
        const oa: OpportunityAvailableEvent = {
          id: newEventId() as ULID,
          at,
          type: 'OpportunityAvailable',
          encounterId,
          moverId: intent.combatantId,
          reactorId: other.combatantId,
          reactorPosition: { ...other.position },
          fromPosition: { ...fromPos },
          toPosition: { ...toPos },
        };
        events.push(oa);
      }
    }
  }
  return events;
};

export const planDash = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: DashIntent,
): ReadonlyArray<Event> => {
  const { encounterId, combatant, isActive } = findCombatant(state, intent.combatantId);
  if (!isActive) {
    throw new Error('Only the active combatant may Dash on their turn');
  }
  const dasher = state.characters[intent.combatantId];
  if (dasher) assertActorCanAct(dasher, 'Dash');
  if (combatant.turnUsage.actionUsed) {
    throw new Error('Action already used this turn');
  }
  if (combatant.turnUsage.dashed) {
    throw new Error('Already dashed this turn');
  }
  const at = intent.at ?? nowIso();
  const actionConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.combatantId,
    kind: 'action',
  };
  const dashed: DashedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'Dashed',
    encounterId,
    combatantId: intent.combatantId,
  };
  return [actionConsumed, dashed];
};

const MISTY_STEP_RANGE_FEET = 30;
const MISTY_STEP_MIN_SLOT_LEVEL = 2;

export interface MistyStepIntent {
  readonly type: 'MistyStep';
  readonly casterId: string;
  readonly to: Position;
  readonly slotLevel?: number;
  readonly at?: string;
}

/**
 * RAW 2024 Misty Step: bonus action, 2nd-level conjuration, teleport up
 * to 30 feet to an unoccupied space you can see. Range is enforced by
 * Chebyshev distance against the caster's current position; obstacle /
 * occupancy checks are the consumer's responsibility (the engine doesn't
 * model line-of-sight beyond the locations grid).
 *
 * Emits SpellCastDeclared, SpellSlotConsumed(2+), ActionEconomyConsumed
 * (bonus), and CombatantMoved.
 */
export const planMistyStep = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: MistyStepIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const slotLevel = intent.slotLevel ?? MISTY_STEP_MIN_SLOT_LEVEL;
  invariant(slotLevel >= MISTY_STEP_MIN_SLOT_LEVEL, 'Misty Step is a 2nd-level spell');
  const knowsSpell =
    caster.knownSpells.includes('misty-step') || caster.preparedSpells.includes('misty-step');
  invariant(knowsSpell, `Caster ${intent.casterId} does not know Misty Step`);

  const { encounterId, combatant, isActive } = findCombatant(state, intent.casterId);
  if (!isActive) {
    throw new Error('Only the active combatant may cast Misty Step on their turn');
  }
  assertActorCanAct(caster, 'cast Misty Step');
  if (combatant.position === undefined) {
    throw new Error('Combatant has no position set');
  }
  if (combatant.turnUsage.bonusActionUsed) {
    throw new Error('Bonus action already used this turn');
  }
  const distance = chebyshevDistance(combatant.position, intent.to);
  if (distance > MISTY_STEP_RANGE_FEET) {
    throw new Error(`Misty Step destination is ${distance}ft away (max 30ft)`);
  }
  // RAW spell text: "teleport up to 30 feet to an unoccupied space."
  // Reject if any other combatant occupies the destination.
  const blocker = state.encounters[encounterId]?.combatants.find(
    (c) =>
      c.combatantId !== intent.casterId &&
      c.position !== undefined &&
      c.position.x === intent.to.x &&
      c.position.y === intent.to.y,
  );
  if (blocker !== undefined) {
    const occupier = state.characters[blocker.combatantId];
    const name = occupier?.name ?? blocker.combatantId;
    throw new Error(
      `Misty Step destination (${intent.to.x},${intent.to.y}) is occupied by ${name}; teleport requires an unoccupied space`,
    );
  }

  const at = intent.at ?? nowIso();
  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'misty-step',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.casterId],
    castAsRitual: false,
  };
  const slotConsumed: SpellSlotConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel,
  };
  const bonusConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.casterId,
    kind: 'bonusAction',
  };
  const moved: CombatantMovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'CombatantMoved',
    encounterId,
    combatantId: intent.casterId,
    fromPosition: { ...combatant.position },
    toPosition: { ...intent.to },
    // RAW: teleportation doesn't consume the caster's normal movement.
    feetTraveled: 0,
  };
  return [declared, slotConsumed, bonusConsumed, moved];
};

const THUNDER_STEP_RANGE_FEET = 90;
const THUNDER_STEP_MIN_SLOT_LEVEL = 3;
const THUNDER_STEP_AOE_RADIUS_FEET = 10;
const THUNDER_STEP_ALLY_PROXIMITY_FEET = 5;
const THUNDER_STEP_BASE_DAMAGE_DICE = '3d10';
const THUNDER_STEP_DICE_PER_EXTRA_SLOT = 1;
const THUNDER_STEP_SLOT_DIE_SIDES = 10;
const THUNDER_STEP_DAMAGE_TYPE = 'thunder';

export interface ThunderStepIntent {
  readonly type: 'ThunderStep';
  readonly casterId: string;
  readonly to: Position;
  readonly slotLevel?: number;
  // Optional second teleportee. RAW: "You and one willing creature you
  // can see within 5 feet of you teleport up to 90 feet to unoccupied
  // spaces you can see." The ally must be a combatant currently within
  // 5 ft of the caster; the ally's destination is the caller's choice
  // (a separate unoccupied space, also within 90 ft of the origin).
  readonly ally?: {
    readonly combatantId: string;
    readonly to: Position;
  };
  readonly at?: string;
}

const findCastingClassForCaster = (
  caster: Character,
  content: ResolvedContent,
): string => {
  for (const enrollment of caster.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (cls?.spellcasting !== undefined) return enrollment.classId;
  }
  throw new Error(`Caster ${caster.id} has no spellcasting class for Thunder Step`);
};

const resolveDestination = (
  state: CampaignState,
  encounterId: string,
  origin: Position,
  destination: Position,
  selfCombatantId: string,
  alsoVacatingCombatantId: string | undefined,
  label: string,
): void => {
  const distance = chebyshevDistance(origin, destination);
  if (distance > THUNDER_STEP_RANGE_FEET) {
    throw new Error(
      `Thunder Step ${label} destination is ${distance}ft from caster's origin (max ${THUNDER_STEP_RANGE_FEET}ft)`,
    );
  }
  const blocker = state.encounters[encounterId]?.combatants.find(
    (c) =>
      c.combatantId !== selfCombatantId &&
      c.combatantId !== alsoVacatingCombatantId &&
      c.position !== undefined &&
      c.position.x === destination.x &&
      c.position.y === destination.y,
  );
  if (blocker !== undefined) {
    const occupier = state.characters[blocker.combatantId];
    const name = occupier?.name ?? blocker.combatantId;
    throw new Error(
      `Thunder Step ${label} destination (${destination.x},${destination.y}) is occupied by ${name}`,
    );
  }
};

/**
 * RAW 2024 Thunder Step: 3rd-level conjuration, Action, range Self.
 * Caster + one willing creature within 5 ft teleport up to 90 ft to
 * unoccupied spaces. Each creature within 10 ft of the origin square
 * (caster and ally excluded) makes a CON save against the caster's
 * spell save DC, taking 3d10 thunder on a failed save or half on
 * success. Higher levels: +1d10 per slot above 3rd.
 *
 * Event order: SpellCastDeclared, SpellSlotConsumed, ActionEconomyConsumed
 * (action), SaveRolled + DamageApplied per creature within the AoE,
 * CombatantMoved (caster), optional CombatantMoved (ally).
 */
export const planThunderStep = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ThunderStepIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const slotLevel = intent.slotLevel ?? THUNDER_STEP_MIN_SLOT_LEVEL;
  invariant(
    slotLevel >= THUNDER_STEP_MIN_SLOT_LEVEL,
    'Thunder Step is a 3rd-level spell',
  );
  invariant(
    caster.knownSpells.includes('thunder-step') || caster.preparedSpells.includes('thunder-step'),
    `Caster ${intent.casterId} does not know Thunder Step`,
  );

  const { encounterId, combatant, isActive } = findCombatant(state, intent.casterId);
  if (!isActive) {
    throw new Error('Only the active combatant may cast Thunder Step on their turn');
  }
  assertActorCanAct(caster, 'cast Thunder Step');
  if (combatant.position === undefined) {
    throw new Error('Combatant has no position set');
  }
  if (combatant.turnUsage.actionUsed) {
    throw new Error('Action already used this turn');
  }

  const origin = combatant.position;

  // RAW: ally must be a willing creature within 5 ft of the caster
  // before the teleport. Look up their position from the encounter.
  let allyCombatant: Combatant | undefined;
  if (intent.ally !== undefined) {
    allyCombatant = state.encounters[encounterId]?.combatants.find(
      (c) => c.combatantId === intent.ally!.combatantId,
    );
    if (allyCombatant === undefined || allyCombatant.position === undefined) {
      throw new Error(
        `Thunder Step ally ${intent.ally.combatantId} is not in the active encounter or has no position`,
      );
    }
    const allyDistance = chebyshevDistance(origin, allyCombatant.position);
    if (allyDistance > THUNDER_STEP_ALLY_PROXIMITY_FEET) {
      throw new Error(
        `Thunder Step ally is ${allyDistance}ft from caster (RAW: must be within ${THUNDER_STEP_ALLY_PROXIMITY_FEET}ft)`,
      );
    }
  }

  resolveDestination(state, encounterId, origin, intent.to, intent.casterId, allyCombatant?.combatantId, 'caster');
  if (intent.ally !== undefined && allyCombatant !== undefined) {
    resolveDestination(
      state,
      encounterId,
      origin,
      intent.ally.to,
      allyCombatant.combatantId,
      intent.casterId,
      'ally',
    );
    if (intent.ally.to.x === intent.to.x && intent.ally.to.y === intent.to.y) {
      throw new Error('Thunder Step ally cannot teleport to the same space as the caster');
    }
  }

  const at = intent.at ?? nowIso();
  const targetIds: ULID[] = [intent.casterId as ULID];
  if (intent.ally !== undefined) targetIds.push(intent.ally.combatantId as ULID);
  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'thunder-step',
    slotLevel,
    slotSource: 'standard',
    targetIds,
    castAsRitual: false,
  };
  const slotConsumed: SpellSlotConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel,
  };
  const actionConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.casterId,
    kind: 'action',
  };
  const events: Event[] = [declared, slotConsumed, actionConsumed];

  // Per PHB 2024 "Areas of Effect": damage is rolled once for the
  // spell and applied to every affected creature (halved on save).
  const castingClassId = findCastingClassForCaster(caster, content);
  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    classId: castingClassId,
    characters: state.characters,
  });
  const extraSlots = slotLevel - THUNDER_STEP_MIN_SLOT_LEVEL;
  const baseRolled = rollExpression(THUNDER_STEP_BASE_DAMAGE_DICE, rng);
  let bonusTotal = 0;
  for (let i = 0; i < extraSlots * THUNDER_STEP_DICE_PER_EXTRA_SLOT; i++) {
    bonusTotal += rollDie(THUNDER_STEP_SLOT_DIE_SIDES, rng);
  }
  const fullDamage = baseRolled.total + bonusTotal;
  const halfDamage = Math.floor(fullDamage / 2);

  const allyId = intent.ally?.combatantId;
  const affectedCombatants = state.encounters[encounterId]?.combatants.filter((c) => {
    if (c.combatantId === intent.casterId) return false;
    if (allyId !== undefined && c.combatantId === allyId) return false;
    if (c.position === undefined) return false;
    return chebyshevDistance(origin, c.position) <= THUNDER_STEP_AOE_RADIUS_FEET;
  }) ?? [];

  let stagedState = applyAll(state, events);
  for (const aff of affectedCombatants) {
    const target = state.characters[aff.combatantId];
    if (target === undefined) continue;
    const saveDerivation = computeSavingThrow({
      character: target,
      itemInstances: state.itemInstances,
      content,
      ability: 'CON',
      characters: state.characters,
    });
    const d20 = rollDie(D20_SIDES, rng);
    const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
    const bonus = saveDerivation.total + saveBonus.total;
    const total = d20 + bonus;
    const success = total >= dcResult.total;
    const saveEvent: SaveRolledEvent = {
      id: newEventId() as ULID,
      at,
      type: 'SaveRolled',
      targetId: aff.combatantId as ULID,
      ability: 'CON',
      dc: dcResult.total,
      d20: [d20],
      used: 'none',
      bonus,
      total,
      success,
      breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
    };
    events.push(saveEvent);
    stagedState = applyAll(stagedState, [saveEvent]);

    const rawAmount = success ? halfDamage : fullDamage;
    if (rawAmount <= 0) continue;
    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: rawAmount, type: THUNDER_STEP_DAMAGE_TYPE }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: stagedState,
      content,
      targetId: aff.combatantId,
      mitigatedComponents: mitigated,
      causedByEventId: saveEvent.id,
      at,
    });
    const damage: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId: aff.combatantId as ULID,
      components: intercept.components,
      sourceCharacterId: intent.casterId as ULID,
      source: 'spell:thunder-step',
      causedByEventId: saveEvent.id,
    };
    events.push(damage);
    events.push(...intercept.extraEvents);
    stagedState = applyAll(stagedState, [damage, ...intercept.extraEvents]);
  }

  const casterMoved: CombatantMovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'CombatantMoved',
    encounterId,
    combatantId: intent.casterId,
    fromPosition: { ...origin },
    toPosition: { ...intent.to },
    // RAW: teleportation doesn't consume the caster's normal movement.
    feetTraveled: 0,
  };
  events.push(casterMoved);

  if (intent.ally !== undefined && allyCombatant !== undefined) {
    const allyMoved: CombatantMovedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'CombatantMoved',
      encounterId,
      combatantId: intent.ally.combatantId,
      fromPosition: { ...allyCombatant.position! },
      toPosition: { ...intent.ally.to },
      feetTraveled: 0,
    };
    events.push(allyMoved);
  }

  return events;
};

const DIMENSION_DOOR_RANGE_FEET = 500;
const DIMENSION_DOOR_MIN_SLOT_LEVEL = 4;
const DIMENSION_DOOR_ALLY_PROXIMITY_FEET = 5; // ally must start within 5 ft of the caster
const DIMENSION_DOOR_ALLY_ARRIVAL_FEET = 5; // ally arrives within 5 ft of the caster's destination

export interface DimensionDoorIntent {
  readonly type: 'DimensionDoor';
  readonly casterId: string;
  readonly to: Position;
  readonly slotLevel?: number;
  // Optional second teleportee. RAW: "You can also teleport one willing
  // creature. The creature must be within 5 feet of you when you
  // teleport, and it teleports to a space within 5 feet of your
  // destination space."
  readonly ally?: {
    readonly combatantId: string;
    readonly to: Position;
  };
  readonly at?: string;
}

/**
 * RAW 2024 Dimension Door: 4th-level conjuration, Action, range 500 ft.
 * Teleport to a location within range; optionally bring one willing
 * creature that starts within 5 ft, arriving within 5 ft of the
 * destination. No save / no damage in the wired path: the RAW 4d6 Force
 * "arrive in an occupied space" clause is modeled by *rejecting* an
 * occupied destination (same stance as Misty Step / Thunder Step, which
 * the engine treats as the consumer's positioning responsibility rather
 * than dealing failure damage).
 *
 * Event order: SpellCastDeclared, SpellSlotConsumed, ActionEconomyConsumed
 * (action), CombatantMoved (caster), optional CombatantMoved (ally).
 * Consumes no RNG.
 */
export const planDimensionDoor = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: DimensionDoorIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const slotLevel = intent.slotLevel ?? DIMENSION_DOOR_MIN_SLOT_LEVEL;
  invariant(slotLevel >= DIMENSION_DOOR_MIN_SLOT_LEVEL, 'Dimension Door is a 4th-level spell');
  invariant(
    caster.knownSpells.includes('dimension-door') || caster.preparedSpells.includes('dimension-door'),
    `Caster ${intent.casterId} does not know Dimension Door`,
  );

  const { encounterId, combatant, isActive } = findCombatant(state, intent.casterId);
  if (!isActive) {
    throw new Error('Only the active combatant may cast Dimension Door on their turn');
  }
  assertActorCanAct(caster, 'cast Dimension Door');
  if (combatant.position === undefined) {
    throw new Error('Combatant has no position set');
  }
  if (combatant.turnUsage.actionUsed) {
    throw new Error('Action already used this turn');
  }

  const origin = combatant.position;
  const casterDistance = chebyshevDistance(origin, intent.to);
  if (casterDistance > DIMENSION_DOOR_RANGE_FEET) {
    throw new Error(
      `Dimension Door destination is ${casterDistance}ft away (max ${DIMENSION_DOOR_RANGE_FEET}ft)`,
    );
  }

  let allyCombatant: Combatant | undefined;
  if (intent.ally !== undefined) {
    allyCombatant = state.encounters[encounterId]?.combatants.find(
      (c) => c.combatantId === intent.ally!.combatantId,
    );
    if (allyCombatant === undefined || allyCombatant.position === undefined) {
      throw new Error(
        `Dimension Door ally ${intent.ally.combatantId} is not in the active encounter or has no position`,
      );
    }
    const allyStartDistance = chebyshevDistance(origin, allyCombatant.position);
    if (allyStartDistance > DIMENSION_DOOR_ALLY_PROXIMITY_FEET) {
      throw new Error(
        `Dimension Door ally is ${allyStartDistance}ft from caster (RAW: must be within ${DIMENSION_DOOR_ALLY_PROXIMITY_FEET}ft)`,
      );
    }
    const allyArrivalDistance = chebyshevDistance(intent.to, intent.ally.to);
    if (allyArrivalDistance > DIMENSION_DOOR_ALLY_ARRIVAL_FEET) {
      throw new Error(
        `Dimension Door ally destination is ${allyArrivalDistance}ft from the caster's destination (RAW: must be within ${DIMENSION_DOOR_ALLY_ARRIVAL_FEET}ft)`,
      );
    }
    if (intent.ally.to.x === intent.to.x && intent.ally.to.y === intent.to.y) {
      throw new Error('Dimension Door ally cannot teleport to the same space as the caster');
    }
  }

  const allyId = allyCombatant?.combatantId;
  const assertUnoccupied = (dest: Position, selfId: string, otherVacatingId: string | undefined, label: string): void => {
    const blocker = state.encounters[encounterId]?.combatants.find(
      (c) =>
        c.combatantId !== selfId &&
        c.combatantId !== otherVacatingId &&
        c.position !== undefined &&
        c.position.x === dest.x &&
        c.position.y === dest.y,
    );
    if (blocker !== undefined) {
      const name = state.characters[blocker.combatantId]?.name ?? blocker.combatantId;
      throw new Error(
        `Dimension Door ${label} destination (${dest.x},${dest.y}) is occupied by ${name}`,
      );
    }
  };
  assertUnoccupied(intent.to, intent.casterId, allyId, 'caster');
  if (intent.ally !== undefined && allyId !== undefined) {
    assertUnoccupied(intent.ally.to, allyId, intent.casterId, 'ally');
  }

  const at = intent.at ?? nowIso();
  const targetIds: ULID[] = [intent.casterId as ULID];
  if (intent.ally !== undefined) targetIds.push(intent.ally.combatantId as ULID);
  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'dimension-door',
    slotLevel,
    slotSource: 'standard',
    targetIds,
    castAsRitual: false,
  };
  const slotConsumed: SpellSlotConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel,
  };
  const actionConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.casterId,
    kind: 'action',
  };
  const casterMoved: CombatantMovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'CombatantMoved',
    encounterId,
    combatantId: intent.casterId,
    fromPosition: { ...origin },
    toPosition: { ...intent.to },
    feetTraveled: 0,
  };
  const events: Event[] = [declared, slotConsumed, actionConsumed, casterMoved];
  if (intent.ally !== undefined && allyCombatant !== undefined) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'CombatantMoved',
      encounterId,
      combatantId: intent.ally.combatantId,
      fromPosition: { ...allyCombatant.position! },
      toPosition: { ...intent.ally.to },
      feetTraveled: 0,
    });
  }
  return events;
};

export interface DodgeIntent {
  readonly type: 'Dodge';
  readonly combatantId: string;
  readonly at?: string;
}

/**
 * RAW 2024 Dodge action: until the start of your next turn, attack
 * rolls against you have disadvantage (if you can see the attacker)
 * and you have advantage on Dexterity saving throws. Lost if you're
 * incapacitated or your speed drops to 0.
 *
 * Wires through as: ActionEconomyConsumed('action') + ConditionApplied
 * ('dodged'). The `dodged` condition carries
 * `ImposeDisadvantageOnAttackers` and `SetAdvantage` (on DEX saves);
 * `planAttack` consults the target's effect stack and lowers its own
 * roll to disadvantage. The condition is cleared at the start of the
 * dodger's next turn — the engine doesn't auto-clear, so the consumer
 * emits `ConditionRemoved` at the appropriate turn boundary.
 */
export const planDodge = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: DodgeIntent,
): ReadonlyArray<Event> => {
  const { encounterId, combatant, isActive } = findCombatant(state, intent.combatantId);
  if (!isActive) {
    throw new Error('Only the active combatant may Dodge on their turn');
  }
  const dodger = state.characters[intent.combatantId];
  if (dodger) assertActorCanAct(dodger, 'Dodge');
  if (combatant.turnUsage.actionUsed) {
    throw new Error('Action already used this turn');
  }
  const at = intent.at ?? nowIso();
  const actionConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.combatantId,
    kind: 'action',
  };
  const conditionApplied: ConditionAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.combatantId,
    conditionId: 'dodged',
    appliedConditionId: newAppliedConditionId(),
  };
  return [actionConsumed, conditionApplied];
};

export const planDisengage = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: DisengageIntent,
): ReadonlyArray<Event> => {
  const { encounterId, combatant, isActive } = findCombatant(state, intent.combatantId);
  if (!isActive) {
    throw new Error('Only the active combatant may Disengage on their turn');
  }
  const disengager = state.characters[intent.combatantId];
  if (disengager) assertActorCanAct(disengager, 'Disengage');
  if (combatant.turnUsage.actionUsed) {
    throw new Error('Action already used this turn');
  }
  if (combatant.turnUsage.disengaged) {
    throw new Error('Already disengaged this turn');
  }
  const at = intent.at ?? nowIso();
  const actionConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.combatantId,
    kind: 'action',
  };
  const disengaged: DisengagedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'Disengaged',
    encounterId,
    combatantId: intent.combatantId,
  };
  return [actionConsumed, disengaged];
};
