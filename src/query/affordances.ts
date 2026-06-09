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
import { computeTotalLevel } from '../schemas/runtime/character.js';
import type { Weapon } from '../schemas/content/item.js';
import { DEFAULT_CELL_SIZE_FEET, type Door, type LocationMap } from '../schemas/runtime/location.js';
import { reachableCells, findPath, feetToCell, cellToFeet } from '../derive/pathing.js';
import { isInRangeFeet, hasLineOfSight, chebyshevDistanceFeet, terrainAt } from '../derive/terrain.js';
import { getEffectiveSpeed } from '../derive/speed.js';
import { computeActionEconomyBudget } from '../derive/action-economy.js';
import { computeAvailableSpellSlots } from '../derive/spell-slots.js';
import type { AbilityScore } from '../schemas/primitives.js';
import type { Spell, SpellAreaShape } from '../schemas/content/spell.js';
// cantripExtraDice: the beam-count tiers (Eldritch Blast → 1/2/3/4 beams),
// reused so maxTargets matches the cast-spell beam-scaling gate exactly.
import { cantripExtraDice } from '../schemas/content/spell.js';
// The same precondition check the planners throw on (assertActorCanAct),
// but returning the blocking-condition id instead of throwing.
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';
// parseSpellRange / enforceableSpellRangeFeet: the same range parser +
// gate-distance the cast-spell spatial gate uses.
import { parseSpellRange, enforceableSpellRangeFeet } from '../engine/plan/_spatial-gates.js';

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
// main-hand weapon (unarmed = 5 ft melee). For ranged weapons this is the
// LONG range — an attack to long range is legal (with Disadvantage), and the
// attack planner's range gate caps at `rangeLong ?? rangeNormal`
// (assertWeaponInRange). Using normal range here would omit legal long-range
// targets the planner accepts.
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
    return weapon.rangeLong ?? weapon.rangeNormal ?? RANGED_FALLBACK_RANGE_FEET;
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

// ── legalSpellTargets ───────────────────────────────────────────────
//
// The legal targets for a specific spell at a specific slot, honoring
// range + line of effect + the spell's target kind. Discriminated to
// mirror the `castableSpells` target descriptor so the UI renders the
// right picker. `slotLevel` is accepted for API symmetry + future
// slot-scaled targeting; the pack's range/targeting don't scale by slot
// today, so it does not change the target set yet.
export type LegalSpellTargets =
  | { readonly kind: 'self' }
  | {
      readonly kind: 'creatures';
      readonly candidates: ReadonlyArray<TargetCandidate>;
      readonly maxTargets: number;
    }
  | { readonly kind: 'points'; readonly cells: ReadonlyArray<Position> };

// Combatants within `gateFeet` (chebyshev; undefined = no limit, for Self /
// Sight / Unlimited ranges) of the caster with line of effect. Parallel to
// legalTargets' in-range loop but parameterized by range + an includeSelf
// flag (beneficial spells may target the caster) + an includeDefeated flag.
// Defeated (0-HP) creatures are excluded by default, but a healing spell can
// target a dying ally (its primary combat use), so `includeDefeated` keeps
// them in. Kept separate so legalTargets stays byte-identical.
const creatureCandidatesInRange = (
  state: CampaignState,
  encounterId: string,
  casterId: string,
  gateFeet: number | undefined,
  includeSelf: boolean,
  includeDefeated: boolean,
): TargetCandidate[] => {
  const encounter = state.encounters[encounterId];
  if (encounter === undefined) return [];
  const self = encounter.combatants.find((c) => c.combatantId === casterId);
  if (self === undefined) return [];
  const pool = encounter.combatants.filter(
    (c) =>
      (includeSelf || c.combatantId !== casterId) &&
      (includeDefeated || !isDefeated(state, c.combatantId)),
  );

  const locationId = state.characterLocations[casterId];
  const map = locationId !== undefined ? state.locations[locationId]?.map : undefined;
  if (map === undefined || self.position === undefined) {
    return [...pool]
      .map((c) => ({ combatantId: c.combatantId, position: c.position, distanceFeet: 0 }))
      .sort((a, b) => (a.combatantId < b.combatantId ? -1 : a.combatantId > b.combatantId ? 1 : 0));
  }
  const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const doors = (state.locations[locationId!]?.doorIds ?? [])
    .map((id) => state.doors[id])
    .filter((d): d is Door => d !== undefined);
  const selfCell = feetToCell(self.position, cellSize);

  const candidates: TargetCandidate[] = [];
  for (const c of pool) {
    if (c.combatantId === casterId) {
      candidates.push({ combatantId: casterId, position: self.position, distanceFeet: 0 });
      continue;
    }
    if (c.position === undefined) continue;
    const targetCell = feetToCell(c.position, cellSize);
    if (gateFeet !== undefined && !isInRangeFeet(selfCell, targetCell, gateFeet, cellSize)) continue;
    if (!hasLineOfSight(map, doors, selfCell, targetCell)) continue;
    candidates.push({
      combatantId: c.combatantId,
      position: c.position,
      distanceFeet: chebyshevDistanceFeet(selfCell, targetCell, cellSize),
    });
  }
  candidates.sort(
    (a, b) =>
      a.distanceFeet - b.distanceFeet ||
      (a.combatantId < b.combatantId ? -1 : a.combatantId > b.combatantId ? 1 : 0),
  );
  return candidates;
};

// Legal AOE placement / aim cells: cells within `radiusFeet` (chebyshev) of
// the caster that are in-bounds, not impassable, and have line of effect.
// `radiusFeet` = the spell range for ranged-placed areas (Fireball 150 ft),
// or the area size for self-origin areas (Burning Hands cone — candidate
// AIM cells, since a cone needs a direction). Returns FEET positions sorted
// by (x, y).
//
// Scope (engine-scope.md, "Spell area target selection"): computing WHICH
// creatures a cone/sphere/line actually covers from positions is the
// consumer's spatial query — the cast-spell planner takes `targetIds` from
// the app. This returns origin/aim candidates the consumer can preview the
// shape around; it deliberately does NOT enumerate the affected cells of a
// specific cone direction (that geometry lives in the consumer).
const aoePlacementPoints = (
  state: CampaignState,
  encounterId: string,
  casterId: string,
  radiusFeet: number,
): Position[] => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === casterId);
  const locationId = state.characterLocations[casterId];
  const map = locationId !== undefined ? state.locations[locationId]?.map : undefined;
  if (map === undefined || self?.position === undefined) return [];
  const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const doors = (state.locations[locationId!]?.doorIds ?? [])
    .map((id) => state.doors[id])
    .filter((d): d is Door => d !== undefined);
  const fromCell = feetToCell(self.position, cellSize);
  const radiusCells = Math.ceil(radiusFeet / cellSize);
  const points: Position[] = [];
  for (let x = fromCell.x - radiusCells; x <= fromCell.x + radiusCells; x += 1) {
    for (let y = fromCell.y - radiusCells; y <= fromCell.y + radiusCells; y += 1) {
      if (x < 0 || x >= map.widthCells || y < 0 || y >= map.heightCells) continue;
      const cell = { x, y };
      if (chebyshevDistanceFeet(fromCell, cell, cellSize) > radiusFeet) continue;
      if (terrainAt(map, x, y) === 'impassable') continue;
      if (!hasLineOfSight(map, doors, fromCell, cell)) continue;
      points.push(cellToFeet(cell, cellSize));
    }
  }
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  return points;
};

export const legalSpellTargets = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  casterId: string,
  spellId: string,
  slotLevel: number,
): LegalSpellTargets => {
  const spell = content.spells.get(spellId);
  if (spell === undefined) return { kind: 'creatures', candidates: [], maxTargets: 0 };
  const caster = state.characters[casterId];
  const casterLevel = caster !== undefined ? computeTotalLevel(caster) : 0;
  const { resolves } = spellResolves(spell);
  // Slot-scaled maxTargets (Magic Missile gains a dart per slot above base).
  const maxTargets = spellMaxTargets(spell, casterLevel, slotLevel);
  const desc = spellTarget(spell, resolves, maxTargets);

  if (desc.kind === 'self') return { kind: 'self' };
  if (desc.kind === 'point') {
    const r = parseSpellRange(spell.range);
    const radiusFeet = r.kind === 'feet' ? r.feet : desc.sizeFeet;
    return { kind: 'points', cells: aoePlacementPoints(state, encounterId, casterId, radiusFeet) };
  }
  const gate = enforceableSpellRangeFeet(parseSpellRange(spell.range));
  const includeSelf = desc.allow !== 'enemies';
  // A spell that helps a downed (0-HP) creature must keep it in the legal
  // targets — otherwise the target picker is empty for exactly the cast that
  // matters. Two cases: a heal/temp-hp spell (Healing Word / Cure Wounds
  // reviving a dying ally), and a `stabilize` spell (Spare the Dying), whose
  // ONLY valid target is a 0-HP creature (the planner requires hp.current === 0).
  const includeDefeated =
    resolves === 'heal' || spell.mechanicalEffects.some((m) => m.kind === 'stabilize');
  return {
    kind: 'creatures',
    candidates: creatureCandidatesInRange(state, encounterId, casterId, gate, includeSelf, includeDefeated),
    maxTargets,
  };
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

  // Attack uses the multiattack-aware budget (Extra Attack lets a Fighter
  // attack again after the action is spent), so it can't be gated on
  // `actionUsed` alone like the once-per-action intents below.
  const budget = computeActionEconomyBudget({
    character,
    itemInstances: state.itemInstances,
    content,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });

  // Action-cost intents.
  for (const action of ACTION_INTENTS) {
    if (blocker !== undefined) {
      out.push({ action, enabled: false, reason: blocker });
      continue;
    }
    if (action === 'attack') {
      // Mirror planActionEconomyForAttack: blocked only when the action was
      // spent on a non-attack (actionUsed with no attacks yet) or the
      // per-action attack budget is exhausted — NOT merely because the
      // action is used (a second attack within Extra Attack is legal).
      if (
        (u.actionUsed && u.attacksMadeThisTurn === 0) ||
        u.attacksMadeThisTurn >= budget.maxAttacksPerAction
      ) {
        out.push({ action, enabled: false, reason: 'action-used' });
        continue;
      }
      if (legalTargets(state, content, encounterId, combatantId, 'attack').length === 0) {
        out.push({ action, enabled: false, reason: 'no-target-in-range' });
        continue;
      }
      out.push({ action, enabled: true });
      continue;
    }
    // Dash / Disengage / Dodge — once per action (Action Surge resets
    // `actionUsed`, so a surged second action re-enables these naturally).
    if (u.actionUsed) {
      out.push({ action, enabled: false, reason: 'action-used' });
      continue;
    }
    out.push({ action, enabled: true });
  }
  return out;
};

// ── castableSpells ──────────────────────────────────────────────────
//
// Each entry carries enough content-derived metadata for a UI to bucket
// the spell into a menu (by `castingTime`) and drive targeting (`target`
// + `rangeFeet` + `resolves`), so the UI parses no spell text.

/** Where the spell goes in the action economy (parsed from `castingTime`). */
export type SpellCastingTime = 'action' | 'bonus-action' | 'reaction' | 'other';
/** Range: a feet number, or self / touch, or 'unbounded' (Sight / Unlimited / miles). */
export type SpellRangeFeet = number | 'self' | 'touch' | 'unbounded';
/** How the cast resolves — what (if any) roll the UI must drive. */
export type SpellResolves = 'attack' | 'save' | 'auto' | 'heal' | 'buff';
/** Who the spell may target (a UI hint; the engine doesn't hard-enforce friend/foe). */
export type SpellTargetAllow = 'enemies' | 'allies' | 'any';

export type SpellTargetDescriptor =
  | { readonly kind: 'self' }
  | { readonly kind: 'creatures'; readonly maxTargets: number; readonly allow: SpellTargetAllow }
  | { readonly kind: 'point'; readonly shape: SpellAreaShape; readonly sizeFeet: number };

export interface CastableSpell {
  readonly spellId: string;
  /** The spell's own level (0 = cantrip). */
  readonly minLevel: number;
  /** Slot levels usable to cast it now (cantrips → [0]); empty ⇒ not castable. */
  readonly levelOptions: ReadonlyArray<number>;
  readonly castingTime: SpellCastingTime;
  readonly rangeFeet: SpellRangeFeet;
  readonly target: SpellTargetDescriptor;
  readonly resolves: SpellResolves;
  /** Present only when `resolves === 'save'`: the ability the target rolls. */
  readonly saveAbility?: AbilityScore;
  readonly concentration: boolean;
}

const parseCastingTime = (castingTime: string): SpellCastingTime => {
  const s = castingTime.toLowerCase();
  if (s.includes('bonus action')) return 'bonus-action';
  if (s.includes('reaction')) return 'reaction';
  if (s.includes('action')) return 'action';
  return 'other';
};

const spellRangeFeet = (spell: Spell): SpellRangeFeet => {
  const r = parseSpellRange(spell.range);
  switch (r.kind) {
    case 'self':
      return 'self';
    case 'touch':
      return 'touch';
    case 'feet':
      return r.feet;
    case 'unenforced':
      return 'unbounded';
  }
};

// resolves: scan the spell's mechanics in a fixed priority. A spell can
// carry several mechanics (an attack plus a buff rider); the highest-
// priority one names how the cast resolves for the UI.
const spellResolves = (spell: Spell): { resolves: SpellResolves; saveAbility?: AbilityScore } => {
  const kinds = new Set(spell.mechanicalEffects.map((m) => m.kind));
  if (kinds.has('attack') || kinds.has('weaponAttack')) return { resolves: 'attack' };
  const save = spell.mechanicalEffects.find((m) => m.kind === 'save');
  if (save !== undefined) return { resolves: 'save', saveAbility: (save as { ability: AbilityScore }).ability };
  if (kinds.has('heal') || kinds.has('temp-hp')) return { resolves: 'heal' };
  if (kinds.has('auto-hit')) return { resolves: 'auto' };
  if (kinds.has('buff') || kinds.has('remove-condition')) return { resolves: 'buff' };
  // Residual (zone / summon / trap / create-item / stabilize / narrative):
  // no player-driven attack or save roll — the UI just picks the target/point.
  return { resolves: 'auto' };
};

// maxTargets: how many DISTINCT creatures the cast may pick. Slice 716:
// derived from the spell's own mechanics, matching the cast-spell gate —
//   - beam-scaling cantrips (Eldritch Blast): 1 + cantripExtraDice(level),
//     i.e. 1/2/3/4 beams at character L1/5/11/17;
//   - dart spells (Magic Missile, `auto-hit`): dartsAtBaseSlot +
//     extraDartsPerSlotLevel per slot above the spell's base level;
//   - everything else: 1.
// RAW lets darts/beams pile on one creature, so this is the UPPER bound a
// UI may select. A multi-ray spell the pack authors as a single attack
// (Scorching Ray today) stays 1 until its content models the extra rays.
const spellMaxTargets = (spell: Spell, characterLevel: number, slotLevel: number): number => {
  const auto = spell.mechanicalEffects.find((m) => m.kind === 'auto-hit') as
    | { dartsAtBaseSlot: number; extraDartsPerSlotLevel: number }
    | undefined;
  if (auto !== undefined) {
    const slotsAbove = Math.max(0, slotLevel - spell.level);
    return auto.dartsAtBaseSlot + auto.extraDartsPerSlotLevel * slotsAbove;
  }
  const hasBeamScaling = spell.mechanicalEffects.some(
    (m) => m.kind === 'attack' && m.cantripBeamScaling === true,
  );
  if (hasBeamScaling) return 1 + cantripExtraDice(characterLevel);
  return 1;
};

const spellTarget = (
  spell: Spell,
  resolves: SpellResolves,
  maxTargets: number,
): SpellTargetDescriptor => {
  // An authored AOE (shape + size) is always a positioned-area spell.
  if (spell.targeting !== undefined) {
    return { kind: 'point', shape: spell.targeting.shape, sizeFeet: spell.targeting.size };
  }
  if (parseSpellRange(spell.range).kind === 'self') return { kind: 'self' };
  // Single- or multi-creature target. Beneficial spells point at allies.
  const allow: SpellTargetAllow = resolves === 'heal' || resolves === 'buff' ? 'allies' : 'enemies';
  return { kind: 'creatures', maxTargets, allow };
};

const spellMetadata = (
  spell: Spell,
  characterLevel: number,
): Omit<CastableSpell, 'spellId' | 'minLevel' | 'levelOptions'> => {
  const { resolves, saveAbility } = spellResolves(spell);
  return {
    castingTime: parseCastingTime(spell.castingTime),
    rangeFeet: spellRangeFeet(spell),
    // Base maxTargets at the spell's own level (cantrips scale by character
    // level); legalSpellTargets recomputes per chosen slot.
    target: spellTarget(spell, resolves, spellMaxTargets(spell, characterLevel, spell.level)),
    resolves,
    ...(saveAbility !== undefined ? { saveAbility } : {}),
    concentration: spell.concentration,
  };
};

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
    const levelOptions: number[] = [];
    if (level === 0) {
      levelOptions.push(0);
    } else {
      for (let slotLevel = level; slotLevel <= SPELL_LEVEL_MAX; slotLevel += 1) {
        if ((slots.standardByLevel[slotLevel - 1] ?? 0) > 0) levelOptions.push(slotLevel);
      }
      if (slots.pact !== undefined && slots.pact.count > 0 && slots.pact.level >= level) {
        if (!levelOptions.includes(slots.pact.level)) levelOptions.push(slots.pact.level);
      }
    }
    if (levelOptions.length === 0) continue;
    levelOptions.sort((a, b) => a - b);
    result.push({ spellId, minLevel: level, levelOptions, ...spellMetadata(spell, computeTotalLevel(character)) });
  }
  result.sort((a, b) => (a.spellId < b.spellId ? -1 : a.spellId > b.spellId ? 1 : 0));
  return result;
};
