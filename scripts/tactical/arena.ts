// Slice 694 / 700: deterministic arena generation for the tactical fuzz
// mode. Pure function — the only randomness is `seededRNG(seed).fork(MAP_SALT)`,
// a fresh stream independent of the engine's roll RNG, so the map can never
// perturb battle outcomes and is only built in tactical mode.
//
// Slice 700 adds variety: an irregular rock border (a smooth per-edge random
// walk, so the playable shape differs by seed), reduced impassable cover,
// passable `difficult` + `water` terrain, and an occasional fenced-in pen
// (an impassable ring with a one-cell gate) on the larger map.
//
// Connectivity is structural, not retried. A "protected corridor" — each
// spawn column from its team's spawns to a horizontal connector at the top
// spawn row — is never allowed to hold impassable terrain. That corridor
// links every spawn, so no border / fence / pillar can disconnect A from B.
// A single findPath check asserts the invariant as a guard.

import { seededRNG, type SeededRNG } from '../../src/rng/seeded.js';
import { findPath, cellToFeet } from '../../src/derive/pathing.js';
import {
  DEFAULT_CELL_SIZE_FEET,
  type LocationMap,
  type TerrainKind,
} from '../../src/schemas/runtime/location.js';
import type { Position } from '../../src/schemas/runtime/encounter.js';
import {
  MAP_SALT,
  ARENA_DIMS,
  SPAWN_COLUMN_INSET_CELLS,
  BORDER_MIN_THICKNESS_CELLS,
  BORDER_MAX_EXTRA_CELLS,
  SPAWN_CLEARANCE_RADIUS_CELLS,
  IMPASSABLE_COVER_DENSITY,
  DIFFICULT_TERRAIN_DENSITY,
  WATER_DENSITY,
  FENCE_CHANCE,
  FENCE_MIN_INTERIOR_WIDTH_CELLS,
  FENCE_SIDE_MIN_CELLS,
  FENCE_SIDE_MAX_CELLS,
} from './constants.js';

export interface ArenaMap {
  readonly map: LocationMap;
  readonly spawnsA: ReadonlyArray<Position>;
  readonly spawnsB: ReadonlyArray<Position>;
}

const key = (x: number, y: number): string => `${x},${y}`;
const randInt = (rng: SeededRNG, n: number): number => Math.floor(rng.next() * n);

// A smooth random walk of per-position rock depth along one edge, in
// [BORDER_MIN, BORDER_MIN + BORDER_MAX_EXTRA]. Adjacent positions differ by
// at most one, so the border reads as an organic edge rather than noise.
const edgeDepths = (length: number, rng: SeededRNG): number[] => {
  const depths: number[] = [];
  let depth = BORDER_MIN_THICKNESS_CELLS + randInt(rng, BORDER_MAX_EXTRA_CELLS + 1);
  for (let i = 0; i < length; i += 1) {
    depth = Math.max(
      BORDER_MIN_THICKNESS_CELLS,
      Math.min(BORDER_MIN_THICKNESS_CELLS + BORDER_MAX_EXTRA_CELLS, depth + randInt(rng, 3) - 1),
    );
    depths.push(depth);
  }
  return depths;
};

export const generateArenaMap = (seed: number, teamSize: number): ArenaMap => {
  const dims = teamSize <= 1 ? ARENA_DIMS.duel : ARENA_DIMS.squad;
  const { widthCells: W, heightCells: H } = dims;
  const isSquad = dims === ARENA_DIMS.squad;
  const rng = seededRNG(seed).fork(MAP_SALT);

  const terrain: TerrainKind[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, (): TerrainKind => 'normal'),
  );

  // Spawns: team A on a left column, team B mirrored on the right, spread
  // evenly down each column.
  const spawnColA = SPAWN_COLUMN_INSET_CELLS;
  const spawnColB = W - 1 - SPAWN_COLUMN_INSET_CELLS;
  const spawnRows = Array.from({ length: teamSize }, (_, i) =>
    Math.floor(((i + 1) * H) / (teamSize + 1)),
  );
  const spawnsA = spawnRows.map((row) => cellToFeet({ x: spawnColA, y: row }, DEFAULT_CELL_SIZE_FEET));
  const spawnsB = spawnRows.map((row) => cellToFeet({ x: spawnColB, y: row }, DEFAULT_CELL_SIZE_FEET));

  // Protected corridor (never impassable): each spawn column between its
  // team's top and bottom spawn, plus a horizontal connector at the top spawn
  // row linking the two columns. This is the structural connectivity backbone.
  const connectorRow = Math.min(...spawnRows);
  const bottomSpawnRow = Math.max(...spawnRows);
  const noImpassable = new Set<string>();
  for (let y = connectorRow; y <= bottomSpawnRow; y += 1) {
    noImpassable.add(key(spawnColA, y));
    noImpassable.add(key(spawnColB, y));
  }
  for (let x = spawnColA; x <= spawnColB; x += 1) noImpassable.add(key(x, connectorRow));

  // Spawn clearance (never any obstacle): the spawn cells + a small radius.
  const clearStart = new Set<string>();
  for (const row of spawnRows) {
    for (const col of [spawnColA, spawnColB]) {
      for (let dy = -SPAWN_CLEARANCE_RADIUS_CELLS; dy <= SPAWN_CLEARANCE_RADIUS_CELLS; dy += 1) {
        for (let dx = -SPAWN_CLEARANCE_RADIUS_CELLS; dx <= SPAWN_CLEARANCE_RADIUS_CELLS; dx += 1) {
          clearStart.add(key(col + dx, row + dy));
        }
      }
    }
  }

  const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  const setImpassable = (x: number, y: number): void => {
    if (inBounds(x, y) && !noImpassable.has(key(x, y)) && !clearStart.has(key(x, y))) {
      terrain[y]![x] = 'impassable';
    }
  };
  const hasImpassableNeighbour = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (inBounds(x + dx, y + dy) && terrain[y + dy]![x + dx] === 'impassable') return true;
      }
    }
    return false;
  };

  // --- Rock border: irregular depth per edge position (the seed-varied shape).
  const topD = edgeDepths(W, rng);
  const botD = edgeDepths(W, rng);
  const leftD = edgeDepths(H, rng);
  const rightD = edgeDepths(H, rng);
  for (let x = 0; x < W; x += 1) {
    for (let d = 0; d < topD[x]!; d += 1) setImpassable(x, d);
    for (let d = 0; d < botD[x]!; d += 1) setImpassable(x, H - 1 - d);
  }
  for (let y = 0; y < H; y += 1) {
    for (let d = 0; d < leftD[y]!; d += 1) setImpassable(d, y);
    for (let d = 0; d < rightD[y]!; d += 1) setImpassable(W - 1 - d, y);
  }

  // --- Fenced pen: an impassable ring with one gate, in the lower interior
  // (below the connector, away from the corridor + spawns). Only on the larger
  // map and only sometimes.
  if (isSquad && W >= FENCE_MIN_INTERIOR_WIDTH_CELLS && rng.next() < FENCE_CHANCE) {
    const maxBorder = BORDER_MIN_THICKNESS_CELLS + BORDER_MAX_EXTRA_CELLS;
    const regionX0 = spawnColA + 2;
    const regionX1 = spawnColB - 2;
    const regionY0 = connectorRow + 2;
    const regionY1 = H - 1 - maxBorder - 1;
    const span = (lo: number, hi: number, min: number, max: number): number =>
      Math.min(max, hi - lo + 1, min + randInt(rng, Math.max(1, max - min + 1)));
    const fw = span(regionX0, regionX1, FENCE_SIDE_MIN_CELLS, FENCE_SIDE_MAX_CELLS);
    const fh = span(regionY0, regionY1, FENCE_SIDE_MIN_CELLS, FENCE_SIDE_MAX_CELLS);
    if (fw >= FENCE_SIDE_MIN_CELLS && fh >= FENCE_SIDE_MIN_CELLS && regionX1 - fw >= regionX0 && regionY1 - fh >= regionY0) {
      const fx = regionX0 + randInt(rng, regionX1 - fw - regionX0 + 1);
      const fy = regionY0 + randInt(rng, regionY1 - fh - regionY0 + 1);
      // Perimeter cells of the pen, flagged for corner. The gate (a single
      // open cell that makes the entrance) is always a non-corner side cell,
      // so it is a clean orthogonal doorway rather than a diagonal corner
      // squeeze — the pen always has a real way in.
      const perimeter: Array<{ x: number; y: number; corner: boolean }> = [];
      for (let x = fx; x < fx + fw; x += 1) {
        const corner = x === fx || x === fx + fw - 1;
        perimeter.push({ x, y: fy, corner });
        perimeter.push({ x, y: fy + fh - 1, corner });
      }
      for (let y = fy + 1; y < fy + fh - 1; y += 1) {
        perimeter.push({ x: fx, y, corner: false });
        perimeter.push({ x: fx + fw - 1, y, corner: false });
      }
      const sides = perimeter.filter((c) => !c.corner);
      const gate = sides[randInt(rng, sides.length)]!;
      for (const c of perimeter) {
        if (c.x !== gate.x || c.y !== gate.y) setImpassable(c.x, c.y);
      }
    }
  }

  // --- Impassable cover pillars: sparse and isolated (no impassable
  // neighbour at placement), so they never merge into a wall.
  const openCells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (terrain[y]![x] === 'normal' && !noImpassable.has(key(x, y)) && !clearStart.has(key(x, y))) {
        openCells.push({ x, y });
      }
    }
  }
  const shuffle = (cells: Array<{ x: number; y: number }>): void => {
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = randInt(rng, i + 1);
      const tmp = cells[i]!;
      cells[i] = cells[j]!;
      cells[j] = tmp;
    }
  };
  const pillarTarget = Math.round(openCells.length * IMPASSABLE_COVER_DENSITY);
  const pillarCandidates = [...openCells];
  shuffle(pillarCandidates);
  let pillars = 0;
  for (const c of pillarCandidates) {
    if (pillars >= pillarTarget) break;
    if (hasImpassableNeighbour(c.x, c.y)) continue;
    setImpassable(c.x, c.y);
    pillars += 1;
  }

  // --- Soft terrain: difficult (scattered) + water (small ponds). Passable,
  // so it never affects connectivity; placed only on still-normal cells,
  // never on a spawn clearance.
  const setSoft = (x: number, y: number, kind: 'difficult' | 'water'): boolean => {
    if (!inBounds(x, y) || terrain[y]![x] !== 'normal' || clearStart.has(key(x, y))) return false;
    terrain[y]![x] = kind;
    return true;
  };
  const softCandidates = [...openCells];
  shuffle(softCandidates);
  let softIdx = 0;
  let difficultPlaced = 0;
  const difficultTarget = Math.round(openCells.length * DIFFICULT_TERRAIN_DENSITY);
  while (difficultPlaced < difficultTarget && softIdx < softCandidates.length) {
    const c = softCandidates[softIdx]!;
    softIdx += 1;
    if (setSoft(c.x, c.y, 'difficult')) difficultPlaced += 1;
  }
  let waterPlaced = 0;
  const waterTarget = Math.round(openCells.length * WATER_DENSITY);
  const orthogonal = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  while (waterPlaced < waterTarget && softIdx < softCandidates.length) {
    const c = softCandidates[softIdx]!;
    softIdx += 1;
    if (!setSoft(c.x, c.y, 'water')) continue;
    waterPlaced += 1;
    // Grow a small pond into one or two orthogonal neighbours.
    for (const { dx, dy } of orthogonal) {
      if (waterPlaced >= waterTarget) break;
      if (randInt(rng, 2) === 0 && setSoft(c.x + dx, c.y + dy, 'water')) waterPlaced += 1;
    }
  }

  const map: LocationMap = { widthCells: W, heightCells: H, cellSizeFeet: DEFAULT_CELL_SIZE_FEET, terrain };

  // Structural guarantee, asserted once (the protected corridor makes it a
  // tautology). Every A spawn must reach every B spawn.
  for (const a of spawnsA) {
    for (const b of spawnsB) {
      if (findPath(map, [], a, b) === null) {
        throw new Error(`generateArenaMap: no A<->B path for seed ${seed}, teamSize ${teamSize}`);
      }
    }
  }

  return { map, spawnsA, spawnsB };
};
