// The tactical enemy AI's movement policy — pure, RNG-free decision
// logic. Relocated from scripts/tactical/policy.ts into the package in
// slice 706 so a consumer (the dnd-web interactive viewer) can drive an
// AI combatant by importing from the package, not from scripts/. The
// fuzz harness re-exports this module via scripts/tactical/policy.ts, so
// behavior is unchanged.
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

import { reachableCells, feetToCell, cellToFeet } from '../derive/pathing.js';
import { chebyshevDistanceFeet, hasLineOfSight, terrainAt } from '../derive/terrain.js';
import {
  DEFAULT_CELL_SIZE_FEET,
  type LocationMap,
  type Door,
} from '../schemas/runtime/location.js';
import type { Position } from '../schemas/runtime/encounter.js';
import type { ContentPack } from '../content/pack.js';
import type { Weapon } from '../schemas/content/item.js';
import {
  FLEE_HP_FRACTION,
  MELEE_THREAT_DISTANCE_FEET,
  MELEE_REACH_FEET,
  REACH_WEAPON_FEET,
  RANGED_WEAPON_DEFAULT_RANGE_FEET,
  CASTER_CANTRIP_RANGE_FEET,
  LOS_BREAK_BONUS,
  KITE_IN_RANGE_BONUS,
  COVER_ADJACENT_BONUS,
  CORNER_TIEBREAK_WEIGHT,
} from './tactical-constants.js';

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
}

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
  const currentDist = distFeet(fromCell);

  let scoreOf: (cell: Position) => number;
  let disengage = false;

  if (lowHp) {
    // Flee: maximize distance, strongly preferring to break line of sight.
    disengage = true;
    scoreOf = (cell) => (los(cell) ? 0 : LOS_BREAK_BONUS) + distFeet(cell);
  } else if (ranged && (currentDist <= MELEE_THREAT_DISTANCE_FEET || !los(fromCell))) {
    // Kite: reposition to a cell that keeps line of sight and stays in
    // range, maximizing distance; prefer cover. Cells with LoS-and-in-range
    // beat LoS-only, which beat no-LoS.
    scoreOf = (cell) => {
      const d = distFeet(cell);
      if (!los(cell)) return -1;
      const inRange = d <= input.effectiveRangeFeet;
      return (inRange ? KITE_IN_RANGE_BONUS : 0) + d + (coverAdjacent(input.map, cell) ? COVER_ADJACENT_BONUS : 0);
    };
  } else if (!ranged && currentDist > input.reachFeet) {
    // Close: minimize distance to the enemy; tiebreak toward cornering
    // (fewer open neighbours ≈ nearer a wall/edge/cover).
    scoreOf = (cell) => -distFeet(cell) + CORNER_TIEBREAK_WEIGHT * (8 - openNeighbours(input.map, cell));
  } else {
    return null; // already well-positioned: stay and act.
  }

  const best = pickByTotalOrder(cells, scoreOf);
  if (best === null || (best.x === fromCell.x && best.y === fromCell.y)) return null;
  return { to: cellToFeet(best, cellSize), disengage };
};
