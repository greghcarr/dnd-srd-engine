// Slice 684: pathfinding + reachability helpers over a LocationMap.
//
// Dijkstra over per-cell `movementCostAt` (slice 600-era helper).
// Respects:
//   - Impassable terrain (cost = Infinity; skipped as neighbor).
//   - Closed / locked doors (treated as blockers on the cell).
//   - Occupied cells (consumer-supplied; the searcher's own cell is
//     NEVER considered occupied for the purposes of the start of the
//     path).
//
// Coordinate convention: `Position` is FEET-coords when a map is
// present (matches the engine-wide plan.move convention since the
// slice 600 spatial cohort). Helpers in this file accept feet-coord
// positions and convert to cell-coords internally via `feetToCell`.
// Slice 684 also exposes `feetToCell` so callers (planners, the
// dnd-web viewer) can do the conversion uniformly.

import type { Door, LocationMap } from '../schemas/runtime/location.js';
import { DEFAULT_CELL_SIZE_FEET } from '../schemas/runtime/location.js';
import type { Position } from '../schemas/runtime/encounter.js';
import { movementCostAt } from './terrain.js';

// Slice 684: feet → cell coordinate conversion. Centralized here so
// every spatial helper (and planner) uses the same flooring rule.
// Returns integer cell coordinates; consumers compare cell.x against
// `map.widthCells` and cell.y against `map.heightCells`.
export const feetToCell = (
  pos: Position,
  cellSizeFeet: number = DEFAULT_CELL_SIZE_FEET,
): Position => ({
  x: Math.floor(pos.x / cellSizeFeet),
  y: Math.floor(pos.y / cellSizeFeet),
});

export const cellToFeet = (
  cell: Position,
  cellSizeFeet: number = DEFAULT_CELL_SIZE_FEET,
): Position => ({
  x: cell.x * cellSizeFeet,
  y: cell.y * cellSizeFeet,
});

const NEIGHBORS_8: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },                     { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
];

const doorBlocksMovement = (door: Door): boolean =>
  door.state === 'closed' || door.state === 'locked';

const cellKey = (p: Position): string => `${p.x},${p.y}`;

interface DijkstraOptions {
  readonly goal?: Position;
  readonly budgetCells?: number;
  readonly occupiedCells?: ReadonlySet<string>;
}

interface DijkstraResult {
  readonly costs: Map<string, number>;
  readonly cameFrom: Map<string, Position>;
}

// Cells whose cost > Number.POSITIVE_INFINITY-cap are clamped out
// of the queue; we use Infinity as the "impassable" sentinel and
// skip enqueueing any neighbor with non-finite step cost.
const dijkstra = (
  map: LocationMap,
  doors: ReadonlyArray<Door>,
  fromCell: Position,
  options: DijkstraOptions,
): DijkstraResult => {
  const costs = new Map<string, number>();
  const cameFrom = new Map<string, Position>();
  costs.set(cellKey(fromCell), 0);

  // Pre-compute door-cell blockers for O(1) lookup.
  const doorBlocks = new Set<string>();
  for (const door of doors) {
    if (doorBlocksMovement(door)) doorBlocks.add(cellKey(door.position));
  }

  // Tiny priority queue: array kept sorted by cost on each pop. Adequate
  // for combat-scale maps (small N). For larger maps a binary heap would
  // be the next refinement.
  const queue: { pos: Position; cost: number }[] = [{ pos: fromCell, cost: 0 }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    if (options.goal !== undefined &&
        current.pos.x === options.goal.x &&
        current.pos.y === options.goal.y) {
      break;
    }
    // Stale entry (a cheaper path was already recorded).
    const recordedCost = costs.get(cellKey(current.pos));
    if (recordedCost !== undefined && current.cost > recordedCost) continue;
    for (const { dx, dy } of NEIGHBORS_8) {
      const next = { x: current.pos.x + dx, y: current.pos.y + dy };
      const nextKey = cellKey(next);
      if (next.x < 0 || next.x >= map.widthCells) continue;
      if (next.y < 0 || next.y >= map.heightCells) continue;
      if (doorBlocks.has(nextKey)) continue;
      if (options.occupiedCells?.has(nextKey)) continue;
      const stepCost = movementCostAt(map, next.x, next.y);
      if (!Number.isFinite(stepCost)) continue;
      const newCost = current.cost + stepCost;
      if (options.budgetCells !== undefined && newCost > options.budgetCells) continue;
      const existing = costs.get(nextKey);
      if (existing === undefined || newCost < existing) {
        costs.set(nextKey, newCost);
        cameFrom.set(nextKey, current.pos);
        queue.push({ pos: next, cost: newCost });
      }
    }
  }
  return { costs, cameFrom };
};

export interface PathResult {
  readonly path: ReadonlyArray<Position>;
  readonly costFeet: number;
}

// Finds the shortest legal path between two FEET-coord positions on
// the given map. Returns the cell-coord path + total cost in feet,
// or null when no path exists (impassable terrain, doors closed,
// destination occupied, etc.).
//
// The starting cell is NEVER treated as occupied (the searcher is
// "in" their own cell and may step out of it).
export const findPath = (
  map: LocationMap,
  doors: ReadonlyArray<Door>,
  fromFeet: Position,
  toFeet: Position,
  options: { occupiedFeet?: ReadonlyArray<Position> } = {},
): PathResult | null => {
  const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const fromCell = feetToCell(fromFeet, cellSize);
  const toCell = feetToCell(toFeet, cellSize);
  if (toCell.x < 0 || toCell.x >= map.widthCells) return null;
  if (toCell.y < 0 || toCell.y >= map.heightCells) return null;

  // Destination occupancy: if the goal cell is occupied (other than
  // the start), no path.
  const occupied = new Set<string>();
  for (const p of options.occupiedFeet ?? []) {
    const c = feetToCell(p, cellSize);
    const key = cellKey(c);
    if (key === cellKey(fromCell)) continue; // searcher's own cell
    occupied.add(key);
  }
  if (occupied.has(cellKey(toCell))) return null;
  if (!Number.isFinite(movementCostAt(map, toCell.x, toCell.y))) return null;

  // Trivial: starting cell IS the goal.
  if (cellKey(fromCell) === cellKey(toCell)) {
    return { path: [fromCell], costFeet: 0 };
  }

  const { costs, cameFrom } = dijkstra(map, doors, fromCell, {
    goal: toCell,
    occupiedCells: occupied,
  });
  const finalCost = costs.get(cellKey(toCell));
  if (finalCost === undefined) return null;
  // Reconstruct path.
  const path: Position[] = [toCell];
  let cursor = toCell;
  while (cameFrom.has(cellKey(cursor))) {
    cursor = cameFrom.get(cellKey(cursor))!;
    path.unshift(cursor);
  }
  return { path, costFeet: finalCost * cellSize };
};

// Returns every cell reachable from `fromFeet` within the supplied
// feet-budget, given the map, doors, and (optional) occupied cells.
// The starting cell is included (cost 0). Cells are returned in
// arbitrary order; the cost map is also returned for consumers who
// want per-cell reach distances.
export interface ReachableResult {
  readonly cells: ReadonlyArray<Position>;
  readonly costFeetByCellKey: ReadonlyMap<string, number>;
}

export const reachableCells = (
  map: LocationMap,
  doors: ReadonlyArray<Door>,
  fromFeet: Position,
  budgetFeet: number,
  options: { occupiedFeet?: ReadonlyArray<Position> } = {},
): ReachableResult => {
  const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const fromCell = feetToCell(fromFeet, cellSize);
  const occupied = new Set<string>();
  for (const p of options.occupiedFeet ?? []) {
    const c = feetToCell(p, cellSize);
    const key = cellKey(c);
    if (key === cellKey(fromCell)) continue;
    occupied.add(key);
  }
  const budgetCells = budgetFeet / cellSize;
  const { costs } = dijkstra(map, doors, fromCell, {
    budgetCells,
    occupiedCells: occupied,
  });
  const cells: Position[] = [];
  const costFeetByCellKey = new Map<string, number>();
  for (const [key, cost] of costs) {
    if (cost > budgetCells) continue;
    const [xStr, yStr] = key.split(',');
    cells.push({ x: Number(xStr), y: Number(yStr) });
    costFeetByCellKey.set(key, cost * cellSize);
  }
  return { cells, costFeetByCellKey };
};
