// Slice 705 (A1): intent-shaped affordance queries.
//
// "What can this combatant legally do right now?" answered in
// INTENT-shaped terms (move here, attack that, dash/disengage/dodge),
// so a UI renders the answers directly and never reconstructs rules
// from primitives. Every function is pure + read-only and wraps the
// existing derive helpers (pathing, terrain, action-economy, speed,
// spell-slots) and the planner precondition guard — it does not
// duplicate their logic. All list outputs use an explicit total order
// (never Map/Set iteration order) so results are deterministic.
//
// Surfaced on the engine as `engine.query.*` (content closed over),
// mirroring `engine.derive.*`.

import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Position } from '../schemas/runtime/encounter.js';
import type { Character } from '../schemas/runtime/character.js';
import type { Weapon } from '../schemas/content/item.js';
import { DEFAULT_CELL_SIZE_FEET, type Door, type LocationMap } from '../schemas/runtime/location.js';
import { reachableCells, findPath, feetToCell, cellToFeet } from '../derive/pathing.js';
import { isInRangeFeet, hasLineOfSight, chebyshevDistanceFeet } from '../derive/terrain.js';
import { getEffectiveSpeed } from '../derive/speed.js';
import { computeActionEconomyBudget } from '../derive/action-economy.js';
import { computeAvailableSpellSlots } from '../derive/spell-slots.js';
// The same precondition check the planners throw on (assertActorCanAct),
// but returning the blocking-condition id instead of throwing.
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';

// ── Named constants ─────────────────────────────────────────────────
const UNARMED_REACH_FEET = 5;
const MELEE_REACH_FEET = 5;
const REACH_PROPERTY_BONUS_FEET = 5; // a 'reach' weapon adds 5 ft → 10
const RANGED_FALLBACK_RANGE_FEET = 30; // a ranged weapon with no rangeNormal authored
const SPELL_LEVEL_MAX = 9;

// ── legalMoveDestinations ───────────────────────────────────────────
export interface MoveDestination {
  /** Destination in FEET coords (pass straight to `engine.plan.move({ to })`). */
  readonly position: Position;
  /** Path cost in feet (difficult terrain already weighted). */
  readonly costFeet: number;
  /** Cell-by-cell route in FEET coords, origin → destination. */
  readonly path: ReadonlyArray<Position>;
}

interface PositionedContext {
  readonly character: Character;
  readonly position: Position;
  readonly map: LocationMap;
  readonly doors: ReadonlyArray<Door>;
  readonly cellSizeFeet: number;
  readonly otherPositions: ReadonlyArray<Position>;
  readonly turnUsage: {
    readonly dashed: boolean;
    readonly feetMovedThisTurn: number;
    readonly speedZeroUntilEndOfTurn: boolean;
    readonly actionUsed: boolean;
    readonly bonusActionUsed: boolean;
    readonly reactionUsedThisRound: boolean;
    readonly attacksMadeThisTurn: number;
  };
}

const resolvePositioned = (
  state: CampaignState,
  encounterId: string,
  combatantId: string,
): PositionedContext | undefined => {
  const encounter = state.encounters[encounterId];
  if (encounter === undefined) return undefined;
  const self = encounter.combatants.find((c) => c.combatantId === combatantId);
  if (self === undefined || self.position === undefined) return undefined;
  const character = state.characters[combatantId];
  if (character === undefined) return undefined;
  const locationId = state.characterLocations[combatantId];
  const location = locationId !== undefined ? state.locations[locationId] : undefined;
  const map = location?.map;
  if (map === undefined) return undefined;
  const doors = (location?.doorIds ?? [])
    .map((id) => state.doors[id])
    .filter((d): d is Door => d !== undefined);
  const otherPositions = encounter.combatants
    .filter((c) => c.combatantId !== combatantId && c.position !== undefined)
    .map((c) => c.position!);
  return {
    character,
    position: self.position,
    map,
    doors,
    cellSizeFeet: map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET,
    otherPositions,
    turnUsage: self.turnUsage,
  };
};

// Feet of movement still available this turn (0 if Steady-Aim-zeroed).
const remainingMovementFeet = (
  state: CampaignState,
  content: ResolvedContent,
  character: Character,
  turnUsage: PositionedContext['turnUsage'],
): number => {
  if (turnUsage.speedZeroUntilEndOfTurn) return 0;
  const speed = getEffectiveSpeed({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const maxThisTurn = turnUsage.dashed ? speed * 2 : speed;
  return Math.max(0, maxThisTurn - turnUsage.feetMovedThisTurn);
};

// The fear source's position when the combatant is Frightened by a
// positioned source (RAW: can't willingly move closer to it).
const frightenedSourceFeet = (
  state: CampaignState,
  encounterId: string,
  character: Character,
): Position | undefined => {
  const frightenedBy = character.appliedConditions.find(
    (c) => c.conditionId === 'frightened' && c.sourceCharacterId !== undefined,
  );
  if (frightenedBy?.sourceCharacterId === undefined) return undefined;
  const sourceCb = state.encounters[encounterId]?.combatants.find(
    (c) => c.combatantId === frightenedBy.sourceCharacterId,
  );
  return sourceCb?.position;
};

export const legalMoveDestinations = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  combatantId: string,
): ReadonlyArray<MoveDestination> => {
  const ctx = resolvePositioned(state, encounterId, combatantId);
  if (ctx === undefined) return [];
  const budgetFeet = remainingMovementFeet(state, content, ctx.character, ctx.turnUsage);
  if (budgetFeet <= 0) return [];

  const { cells, costFeetByCellKey } = reachableCells(
    ctx.map,
    ctx.doors,
    ctx.position,
    budgetFeet,
    { occupiedFeet: ctx.otherPositions },
  );
  const fromCell = feetToCell(ctx.position, ctx.cellSizeFeet);
  // chebyshevDistanceFeet works in CELL coords; convert the fear source.
  const fearSource = frightenedSourceFeet(state, encounterId, ctx.character);
  const fearCell = fearSource !== undefined ? feetToCell(fearSource, ctx.cellSizeFeet) : undefined;
  const fearDistanceNow =
    fearCell !== undefined ? chebyshevDistanceFeet(fromCell, fearCell, ctx.cellSizeFeet) : undefined;

  const destinations: MoveDestination[] = [];
  for (const cell of cells) {
    if (cell.x === fromCell.x && cell.y === fromCell.y) continue; // not the origin
    const positionFeet = cellToFeet(cell, ctx.cellSizeFeet);
    // RAW Frightened: drop any cell that moves closer to the fear source.
    if (fearCell !== undefined && fearDistanceNow !== undefined) {
      const distAt = chebyshevDistanceFeet(cell, fearCell, ctx.cellSizeFeet);
      if (distAt < fearDistanceNow) continue;
    }
    const costFeet = costFeetByCellKey.get(`${cell.x},${cell.y}`);
    if (costFeet === undefined) continue;
    const path =
      findPath(ctx.map, ctx.doors, ctx.position, positionFeet, {
        occupiedFeet: ctx.otherPositions,
      })?.path.map((c) => cellToFeet(c, ctx.cellSizeFeet)) ?? [positionFeet];
    destinations.push({ position: positionFeet, costFeet, path });
  }
  // Deterministic total order: x asc, then y asc.
  destinations.sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  return destinations;
};

// ── actionEconomy ───────────────────────────────────────────────────
export interface ActionEconomyView {
  readonly actionAvailable: boolean;
  readonly bonusActionAvailable: boolean;
  readonly reactionAvailable: boolean;
  readonly movement: {
    readonly totalFeet: number;
    readonly usedFeet: number;
    readonly remainingFeet: number;
  };
  readonly attacks: {
    readonly perAction: number;
    readonly madeThisTurn: number;
    readonly remaining: number;
  };
  /** Extra Actions this turn (e.g. Action Surge); the single `actionAvailable` boolean does not encode these. */
  readonly extraActionsPerTurn: number;
  readonly extraBonusActionsPerTurn: number;
}

export const actionEconomy = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  combatantId: string,
): ActionEconomyView | undefined => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === combatantId);
  const character = state.characters[combatantId];
  if (self === undefined || character === undefined) return undefined;
  const budget = computeActionEconomyBudget({
    character,
    itemInstances: state.itemInstances,
    content,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const u = self.turnUsage;
  const speed = getEffectiveSpeed({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const totalFeet = u.speedZeroUntilEndOfTurn ? 0 : u.dashed ? speed * 2 : speed;
  const remainingFeet = Math.max(0, totalFeet - u.feetMovedThisTurn);
  return {
    actionAvailable: !u.actionUsed,
    bonusActionAvailable: !u.bonusActionUsed,
    reactionAvailable: !u.reactionUsedThisRound,
    movement: { totalFeet, usedFeet: u.feetMovedThisTurn, remainingFeet },
    attacks: {
      perAction: budget.maxAttacksPerAction,
      madeThisTurn: u.attacksMadeThisTurn,
      remaining: Math.max(0, budget.maxAttacksPerAction - u.attacksMadeThisTurn),
    },
    extraActionsPerTurn: budget.extraActionsPerTurn,
    extraBonusActionsPerTurn: budget.extraBonusActionsPerTurn,
  };
};

// ── legalTargets ────────────────────────────────────────────────────
export type AffordanceActionId = 'move' | 'attack' | 'dash' | 'disengage' | 'dodge';

export interface TargetCandidate {
  readonly combatantId: string;
  readonly position: Position | undefined;
  readonly distanceFeet: number;
}

// The attacker's effective weapon reach/range in feet, from the
// main-hand weapon (unarmed = 5 ft melee).
const weaponRangeFeet = (
  state: CampaignState,
  content: ResolvedContent,
  character: Character,
): number => {
  const instanceId = character.equipped?.mainHand;
  const instance = instanceId !== undefined ? state.itemInstances[instanceId] : undefined;
  const def = instance !== undefined ? content.items.get(instance.definitionId) : undefined;
  if (def === undefined || def.itemKind !== 'weapon') return UNARMED_REACH_FEET;
  const weapon = def as Weapon;
  if (weapon.attackKind === 'ranged') {
    return weapon.rangeNormal ?? RANGED_FALLBACK_RANGE_FEET;
  }
  return weapon.properties.includes('reach')
    ? MELEE_REACH_FEET + REACH_PROPERTY_BONUS_FEET
    : MELEE_REACH_FEET;
};

const isDefeated = (state: CampaignState, combatantId: string): boolean =>
  (state.characters[combatantId]?.hp.current ?? 0) <= 0;

export const legalTargets = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  combatantId: string,
  action: AffordanceActionId,
): ReadonlyArray<TargetCandidate> => {
  // Only Attack has targets among the milestone intents; Dash /
  // Disengage / Dodge / Move are self-scoped.
  if (action !== 'attack') return [];
  const encounter = state.encounters[encounterId];
  if (encounter === undefined) return [];
  const self = encounter.combatants.find((c) => c.combatantId === combatantId);
  const attacker = state.characters[combatantId];
  if (self === undefined || attacker === undefined) return [];

  const others = encounter.combatants.filter(
    (c) => c.combatantId !== combatantId && !isDefeated(state, c.combatantId),
  );

  // Positionless mode (no map / no positions): every living other
  // combatant is a legal target (the engine resolves positionless
  // attacks against anyone), distance unknown → 0.
  const locationId = state.characterLocations[combatantId];
  const map = locationId !== undefined ? state.locations[locationId]?.map : undefined;
  if (map === undefined || self.position === undefined) {
    return [...others]
      .map((c) => ({ combatantId: c.combatantId, position: c.position, distanceFeet: 0 }))
      .sort((a, b) => (a.combatantId < b.combatantId ? -1 : a.combatantId > b.combatantId ? 1 : 0));
  }

  const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const doors = (locationId !== undefined ? state.locations[locationId]?.doorIds ?? [] : [])
    .map((id) => state.doors[id])
    .filter((d): d is Door => d !== undefined);
  const rangeFeet = weaponRangeFeet(state, content, attacker);
  // isInRangeFeet / chebyshevDistanceFeet / hasLineOfSight all work in
  // CELL coords (door positions are cell coords too); combatant.position
  // is feet, so convert at the boundary.
  const selfCell = feetToCell(self.position, cellSize);

  const candidates: TargetCandidate[] = [];
  for (const c of others) {
    if (c.position === undefined) continue;
    const targetCell = feetToCell(c.position, cellSize);
    if (!isInRangeFeet(selfCell, targetCell, rangeFeet, cellSize)) continue;
    if (!hasLineOfSight(map, doors, selfCell, targetCell)) continue;
    candidates.push({
      combatantId: c.combatantId,
      position: c.position,
      distanceFeet: chebyshevDistanceFeet(selfCell, targetCell, cellSize),
    });
  }
  // Deterministic total order: nearest first, then combatant id.
  candidates.sort(
    (a, b) =>
      a.distanceFeet - b.distanceFeet ||
      (a.combatantId < b.combatantId ? -1 : a.combatantId > b.combatantId ? 1 : 0),
  );
  return candidates;
};

// ── availableActions ────────────────────────────────────────────────
export interface AvailableAction {
  readonly action: AffordanceActionId;
  readonly enabled: boolean;
  /**
   * Machine-readable reason when `enabled` is false: a blocking-condition
   * id ('stunned', 'paralyzed', 'incapacitated', ...), or one of
   * 'action-used' / 'no-target-in-range' / 'no-movement' / 'speed-zero'.
   */
  readonly reason?: string;
}

const ACTION_INTENTS: ReadonlyArray<Exclude<AffordanceActionId, 'move'>> = [
  'attack',
  'dash',
  'disengage',
  'dodge',
];

export const availableActions = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  combatantId: string,
): ReadonlyArray<AvailableAction> => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === combatantId);
  const character = state.characters[combatantId];
  if (self === undefined || character === undefined) return [];

  const blocker = findActorBlockingCondition(character); // undefined ⇒ can act
  const u = self.turnUsage;
  const out: AvailableAction[] = [];

  // Move: gated on remaining movement, not the Action.
  if (u.speedZeroUntilEndOfTurn) {
    out.push({ action: 'move', enabled: false, reason: 'speed-zero' });
  } else {
    const remaining = remainingMovementFeet(state, content, character, u);
    out.push(
      remaining > 0
        ? { action: 'move', enabled: true }
        : { action: 'move', enabled: false, reason: 'no-movement' },
    );
  }

  // Action-cost intents.
  for (const action of ACTION_INTENTS) {
    if (blocker !== undefined) {
      out.push({ action, enabled: false, reason: blocker });
      continue;
    }
    if (u.actionUsed) {
      out.push({ action, enabled: false, reason: 'action-used' });
      continue;
    }
    if (action === 'attack' && legalTargets(state, content, encounterId, combatantId, 'attack').length === 0) {
      out.push({ action, enabled: false, reason: 'no-target-in-range' });
      continue;
    }
    out.push({ action, enabled: true });
  }
  return out;
};

// ── castableSpells (scaffold) ───────────────────────────────────────
export interface CastableSpell {
  readonly spellId: string;
  /** The spell's own level (0 = cantrip). */
  readonly minLevel: number;
  /** Slot levels usable to cast it now (cantrips → [0]); empty ⇒ not castable. */
  readonly levelOptions: ReadonlyArray<number>;
}

export const castableSpells = (
  state: CampaignState,
  content: ResolvedContent,
  characterId: string,
): ReadonlyArray<CastableSpell> => {
  const character = state.characters[characterId];
  if (character === undefined) return [];
  const slots = computeAvailableSpellSlots(character, content.classes);
  const spellIds = Array.from(new Set([...character.preparedSpells, ...character.knownSpells]));

  const result: CastableSpell[] = [];
  for (const spellId of spellIds) {
    const spell = content.spells.get(spellId);
    if (spell === undefined) continue;
    const level = spell.level;
    if (level === 0) {
      result.push({ spellId, minLevel: 0, levelOptions: [0] });
      continue;
    }
    const levelOptions: number[] = [];
    for (let slotLevel = level; slotLevel <= SPELL_LEVEL_MAX; slotLevel += 1) {
      if ((slots.standardByLevel[slotLevel - 1] ?? 0) > 0) levelOptions.push(slotLevel);
    }
    if (slots.pact !== undefined && slots.pact.count > 0 && slots.pact.level >= level) {
      if (!levelOptions.includes(slots.pact.level)) levelOptions.push(slots.pact.level);
    }
    if (levelOptions.length > 0) {
      levelOptions.sort((a, b) => a - b);
      result.push({ spellId, minLevel: level, levelOptions });
    }
  }
  result.sort((a, b) => (a.spellId < b.spellId ? -1 : a.spellId > b.spellId ? 1 : 0));
  return result;
};
