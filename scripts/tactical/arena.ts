// Slice 694: deterministic arena generation for the tactical fuzz mode.
//
// Pure function. Given a seed + team size, returns a LocationMap with
// scattered impassable cover and spread-out spawn points for the two
// teams. The only randomness is `seededRNG(seed).fork(MAP_SALT)` — a fresh
// stream independent of the engine's roll RNG (fork reads but never
// advances its source), so it cannot perturb battle outcomes and is only
// constructed in tactical mode.
//
// Connectivity is structural, not retried: cover pillars are placed so no
// two are within one cell of each other (isolation). A set of pairwise
// non-adjacent impassable cells cannot form a wall, so the passable region
// stays 8-connected and an A<->B path always exists. A single findPath
// check asserts this as a guard against future edits — it is not a
// regenerate-on-miss loop.

import { seededRNG } from '../../src/rng/seeded.js';
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
  COVER_BAND_MARGIN_CELLS,
  COVER_DENSITY,
} from './constants.js';

export interface ArenaMap {
  readonly map: LocationMap;
  readonly spawnsA: ReadonlyArray<Position>;
  readonly spawnsB: ReadonlyArray<Position>;
}

const cellKey = (x: number, y: number): string => `${x},${y}`;

export const generateArenaMap = (seed: number, teamSize: number): ArenaMap => {
  const { widthCells, heightCells } = teamSize <= 1 ? ARENA_DIMS.duel : ARENA_DIMS.squad;
  const rng = seededRNG(seed).fork(MAP_SALT);

  // All-normal terrain grid, indexed terrain[y][x].
  const terrain: TerrainKind[][] = Array.from({ length: heightCells }, () =>
    Array.from({ length: widthCells }, (): TerrainKind => 'normal'),
  );

  // Spawn columns: team A near the left edge, team B mirrored on the right.
  // n spawns per team, spread evenly down the column.
  const spawnColA = SPAWN_COLUMN_INSET_CELLS;
  const spawnColB = widthCells - 1 - SPAWN_COLUMN_INSET_CELLS;
  const spawnRows = Array.from({ length: teamSize }, (_, i) =>
    Math.floor(((i + 1) * heightCells) / (teamSize + 1)),
  );
  const spawnsA = spawnRows.map((row) => cellToFeet({ x: spawnColA, y: row }, DEFAULT_CELL_SIZE_FEET));
  const spawnsB = spawnRows.map((row) => cellToFeet({ x: spawnColB, y: row }, DEFAULT_CELL_SIZE_FEET));

  // Cover band: columns kept clear of the spawn columns + their neighbours.
  const bandStart = spawnColA + COVER_BAND_MARGIN_CELLS;
  const bandEnd = spawnColB - COVER_BAND_MARGIN_CELLS;
  const candidates: Array<{ x: number; y: number }> = [];
  for (let x = bandStart; x <= bandEnd; x += 1) {
    for (let y = 0; y < heightCells; y += 1) {
      candidates.push({ x, y });
    }
  }
  // Deterministic Fisher-Yates over the band cells using the arena RNG.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }
  // Greedily place isolated pillars: a candidate becomes cover only if no
  // existing pillar sits in its 3x3 neighbourhood. Isolation is what makes
  // connectivity structural.
  const targetPillars = Math.round(candidates.length * COVER_DENSITY);
  const pillars = new Set<string>();
  for (const c of candidates) {
    if (pillars.size >= targetPillars) break;
    let isolated = true;
    for (let dy = -1; dy <= 1 && isolated; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (pillars.has(cellKey(c.x + dx, c.y + dy))) {
          isolated = false;
          break;
        }
      }
    }
    if (!isolated) continue;
    pillars.add(cellKey(c.x, c.y));
    terrain[c.y]![c.x] = 'impassable';
  }

  const map: LocationMap = {
    widthCells,
    heightCells,
    cellSizeFeet: DEFAULT_CELL_SIZE_FEET,
    terrain,
  };

  // Structural guarantee, asserted once. Throwing (rather than looping to
  // regenerate) surfaces a broken placement rule instead of masking it.
  if (findPath(map, [], spawnsA[0]!, spawnsB[0]!) === null) {
    throw new Error(
      `generateArenaMap: no A<->B path for seed ${seed}, teamSize ${teamSize}`,
    );
  }

  return { map, spawnsA, spawnsB };
};
