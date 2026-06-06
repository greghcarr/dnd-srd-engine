// Slice 695: the tactical movement policy — pure, RNG-free decision logic.
//
// `planTacticalMove` picks a destination (in feet) for the active
// combatant via a heuristic cascade (flee / kite / close / stay), built on
// the engine's reachableCells / hasLineOfSight / chebyshevDistanceFeet
// primitives. It is deterministic: reachableCells returns cells in
// arbitrary order, so every choice goes through `pickByTotalOrder`, an
// argmax with an explicit (score desc, then x asc, y asc) total order. No
// Math.random / Date / Map-Set iteration order.
//
// Geometry runs in cell-coords (reachableCells returns cells; the terrain
// helpers expect cells), converting to feet only at the boundary —
// reachableCells takes feet, plan.move takes feet.

import { reachableCells, feetToCell, cellToFeet } from '../../src/derive/pathing.js';
import { chebyshevDistanceFeet, hasLineOfSight, terrainAt } from '../../src/derive/terrain.js';
import {
  DEFAULT_CELL_SIZE_FEET,
  type LocationMap,
  type Door,
} from '../../src/schemas/runtime/location.js';
import type { Position } from '../../src/schemas/runtime/encounter.js';
import type { ContentPack } from '../../src/content/pack.js';
import type { Weapon } from '../../src/schemas/content/item.js';
import {
  FLEE_HP_FRACTION,
  MELEE_REACH_FEET,
  REACH_WEAPON_FEET,
  RANGED_KITE_STANDOFF_FEET,
  RANGED_WEAPON_DEFAULT_RANGE_FEET,
  CASTER_CANTRIP_RANGE_FEET,
  INITIAL_STANDOFF_FEET,
  CLOSE_RATE_FEET_PER_ROUND,
  MIN_STANDOFF_FEET,
  LOS_PREFERENCE_BONUS,
  FLEE_BREAK_LOS_BONUS,
  COVER_ADJACENT_BONUS,
  CORNER_TIEBREAK_WEIGHT,
  STAY_BIAS_BONUS,
} from './constants.js';

export type TacticalRoleKind = 'ranged' | 'melee';

export interface TacticalRole {
  readonly role: TacticalRoleKind;
  readonly effectiveRangeFeet: number;
  readonly reachFeet: number;
}

// Classify a combatant's role from its weapon + cantrips. A ranged weapon
// or any cantrip ⇒ ranged (most damaging cantrips are ranged spell
// attacks; a melee class carries no cantrips). Binary by design — a
// thrown-weapon hybrid may misclassify, which only changes kite-vs-close
// flavour, acceptable for a fuzz harness.
export const classifyTacticalRole = (
  pack: ContentPack,
  weaponDefinitionId: string,
  cantripIds: ReadonlyArray<string>,
): TacticalRole => {
  const item = pack.items.find((i) => i.id === weaponDefinitionId);
  const weapon = item?.itemKind === 'weapon' ? (item as Weapon) : undefined;
  const reachFeet = weapon?.properties.includes('reach') ? REACH_WEAPON_FEET : MELEE_REACH_FEET;
  if (weapon?.attackKind === 'ranged') {
    return { role: 'ranged', effectiveRangeFeet: weapon.rangeNormal ?? RANGED_WEAPON_DEFAULT_RANGE_FEET, reachFeet };
  }
  if (cantripIds.length > 0) {
    return { role: 'ranged', effectiveRangeFeet: CASTER_CANTRIP_RANGE_FEET, reachFeet };
  }
  return { role: 'melee', effectiveRangeFeet: reachFeet, reachFeet };
};

// Argmax over cells by score, with a deterministic (x asc, then y asc)
// tiebreak. Independent of the input order, so a caller can pass
// reachableCells' arbitrary-order output and still get a stable choice.
export const pickByTotalOrder = (
  cells: ReadonlyArray<Position>,
  scoreOf: (cell: Position) => number,
): Position | null => {
  let best: Position | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    const score = scoreOf(cell);
    if (
      best === null ||
      score > bestScore ||
      (score === bestScore && (cell.x < best.x || (cell.x === best.x && cell.y < best.y)))
    ) {
      best = cell;
      bestScore = score;
    }
  }
  return best;
};

export interface TacticalMoveInput {
  readonly map: LocationMap;
  readonly doors: ReadonlyArray<Door>;
  readonly fromFeet: Position;
  readonly enemyFeet: Position;
  readonly occupiedFeet: ReadonlyArray<Position>;
  readonly speedFeet: number;
  readonly role: TacticalRoleKind;
  readonly effectiveRangeFeet: number;
  readonly reachFeet: number;
  readonly hpFraction: number;
  // Slice 697: the 1-based encounter round drives the standoff leash that
  // forces convergence. Round 1 = the loosest leash.
  readonly round: number;
}

// Slice 697: the maximum standoff a combatant may keep from its enemy this
// round. Shrinks each round so the gap trends down to melee.
export const maxStandoffFeet = (round: number): number =>
  Math.max(MIN_STANDOFF_FEET, INITIAL_STANDOFF_FEET - CLOSE_RATE_FEET_PER_ROUND * (round - 1));

export interface TacticalMove {
  readonly to: Position; // feet-coords destination
  readonly disengage: boolean; // Disengage first (flee only) to avoid the OA
}

const openNeighbours = (map: LocationMap, cell: Position): number => {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const t = terrainAt(map, cell.x + dx, cell.y + dy);
      if (t !== undefined && t !== 'impassable') count += 1;
    }
  }
  return count;
};

const coverAdjacent = (map: LocationMap, cell: Position): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (terrainAt(map, cell.x + dx, cell.y + dy) === 'impassable') return true;
    }
  }
  return false;
};

export const planTacticalMove = (input: TacticalMoveInput): TacticalMove | null => {
  const cellSize = input.map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const fromCell = feetToCell(input.fromFeet, cellSize);
  const enemyCell = feetToCell(input.enemyFeet, cellSize);
  const { cells } = reachableCells(input.map, input.doors, input.fromFeet, input.speedFeet, {
    occupiedFeet: input.occupiedFeet,
  });

  const distFeet = (cell: Position): number => chebyshevDistanceFeet(cell, enemyCell, cellSize);
  const los = (cell: Position): boolean => hasLineOfSight(input.map, input.doors, cell, enemyCell);

  const lowHp = input.hpFraction < FLEE_HP_FRACTION;
  const ranged = input.role === 'ranged';
  const leashFeet = maxStandoffFeet(input.round);

  // Desired distance to the enemy this turn. Melee wants reach (adjacency);
  // ranged wants its kite standoff (capped by weapon range); a fleeing
  // combatant backs off to the leash edge. Every desired distance is then
  // capped by the round leash, which shrinks each round, so a held standoff
  // cannot outlast the battle: by the time the leash reaches its floor, even
  // a kiter or fleer is forced to engage. This is the convergence guarantee.
  const desiredFeet = lowHp
    ? leashFeet
    : Math.min(ranged ? Math.min(RANGED_KITE_STANDOFF_FEET, input.effectiveRangeFeet) : input.reachFeet, leashFeet);

  // Score: among reachable cells, the one nearest the desired distance wins.
  // An attacking combatant strongly prefers line of sight (it must see the
  // enemy to shoot). A fleer takes only a sub-one-cell bonus for breaking
  // line of sight, so it still backs off to the leash edge rather than
  // sprinting to a distant sightless corner. Cover (and, for a closing melee
  // combatant, cornering the enemy against terrain) breaks remaining ties.
  const scoreOf = (cell: Position): number => {
    // Hold rather than shuffle sideways when the current cell is already
    // optimal (smallest tiebreak, so a better cell still wins).
    const stay = cell.x === fromCell.x && cell.y === fromCell.y ? STAY_BIAS_BONUS : 0;
    const distance = -Math.abs(distFeet(cell) - desiredFeet);
    const cover = coverAdjacent(input.map, cell) ? COVER_ADJACENT_BONUS : 0;
    if (lowHp) {
      return distance + (los(cell) ? 0 : FLEE_BREAK_LOS_BONUS) + cover + stay;
    }
    const losBonus = los(cell) ? LOS_PREFERENCE_BONUS : 0;
    const corner = ranged ? 0 : CORNER_TIEBREAK_WEIGHT * (8 - openNeighbours(input.map, cell));
    return losBonus + distance + cover + corner + stay;
  };

  const best = pickByTotalOrder(cells, scoreOf);
  if (best === null || (best.x === fromCell.x && best.y === fromCell.y)) return null;
  // Disengage only when fleeing: it won't attack this turn anyway, so avoid
  // the opportunity attack. Closing / kiting accept the OA (which exercises
  // the OA-resolution path).
  return { to: cellToFeet(best, cellSize), disengage: lowHp };
};
