// Slice 694 / 700: unit tests for the pure arena generator. Covers
// dimension scaling, spawn placement + clearance, the irregular rock border,
// the difficult / water terrain types, the occasional fenced pen, structural
// A<->B connectivity, and seed-determinism. scripts/** isn't coverage-gated,
// so these dedicated tests are how the generator stays honest.

import { describe, expect, it } from 'vitest';
import { generateArenaMap } from '../../scripts/tactical/arena.js';
import { ARENA_DIMS } from '../../scripts/tactical/constants.js';
import { findPath, feetToCell, cellToFeet } from '../../src/derive/pathing.js';
import { DEFAULT_CELL_SIZE_FEET } from '../../src/schemas/runtime/location.js';
import type { LocationMap } from '../../src/schemas/runtime/location.js';

const SEEDS = [1, 2, 3, 7, 19, 42, 100, 777, 5, 10];
const cell = (p: { x: number; y: number }) => feetToCell(p, DEFAULT_CELL_SIZE_FEET);

// Find a fenced pen: a 4-6 cell box whose perimeter is impassable except a
// single gate, with an all-open interior. Returns the box, or null.
const findFence = (m: LocationMap): { x: number; y: number; w: number; h: number } | null => {
  const t = m.terrain;
  for (let y = 0; y + 4 <= m.heightCells; y += 1) {
    for (let x = 0; x + 4 <= m.widthCells; x += 1) {
      for (let h = 4; h <= 6 && y + h <= m.heightCells; h += 1) {
        for (let w = 4; w <= 6 && x + w <= m.widthCells; w += 1) {
          let perim = 0;
          let perimTotal = 0;
          let interiorOpen = true;
          for (let i = 0; i < w; i += 1) for (const yy of [y, y + h - 1]) { perimTotal += 1; if (t[yy]![x + i] === 'impassable') perim += 1; }
          for (let j = 1; j < h - 1; j += 1) for (const xx of [x, x + w - 1]) { perimTotal += 1; if (t[y + j]![xx] === 'impassable') perim += 1; }
          for (let j = 1; j < h - 1; j += 1) for (let i = 1; i < w - 1; i += 1) if (t[y + j]![x + i] === 'impassable') interiorOpen = false;
          if (interiorOpen && perim === perimTotal - 1) return { x, y, w, h };
        }
      }
    }
  }
  return null;
};

describe('generateArenaMap (slice 700)', () => {
  it('scales dimensions with team size (>2 clamps to squad)', () => {
    expect(generateArenaMap(1, 1).map).toMatchObject(ARENA_DIMS.duel);
    expect(generateArenaMap(1, 2).map).toMatchObject(ARENA_DIMS.squad);
    expect(generateArenaMap(1, 3).map).toMatchObject(ARENA_DIMS.squad);
  });

  it('places spawns on clean ground, distinct, A left of B, with a clear radius', () => {
    for (const teamSize of [1, 2]) {
      for (const seed of SEEDS) {
        const { map, spawnsA, spawnsB } = generateArenaMap(seed, teamSize);
        expect(spawnsA).toHaveLength(teamSize);
        expect(spawnsB).toHaveLength(teamSize);
        const spawnCells = [...spawnsA, ...spawnsB].map(cell);
        expect(new Set(spawnCells.map((c) => `${c.x},${c.y}`)).size).toBe(spawnCells.length);
        for (const c of spawnCells) {
          expect(map.terrain[c.y]![c.x], `seed ${seed} spawn on clean ground`).toBe('normal');
          // 1-cell clearance: no impassable orthogonally/diagonally adjacent.
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            const t = map.terrain[c.y + dy]?.[c.x + dx];
            if (t !== undefined) expect(t).not.toBe('impassable');
          }
        }
        for (const a of spawnsA) for (const b of spawnsB) expect(a.x).toBeLessThan(b.x);
      }
    }
  });

  it('walls the whole outer ring with rock', () => {
    for (const seed of SEEDS) {
      const { map } = generateArenaMap(seed, 2);
      for (let x = 0; x < map.widthCells; x += 1) {
        expect(map.terrain[0]![x]).toBe('impassable');
        expect(map.terrain[map.heightCells - 1]![x]).toBe('impassable');
      }
      for (let y = 0; y < map.heightCells; y += 1) {
        expect(map.terrain[y]![0]).toBe('impassable');
        expect(map.terrain[y]![map.widthCells - 1]).toBe('impassable');
      }
    }
  });

  it('uses all four terrain kinds across the seed set (impassable + difficult + water)', () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      for (const row of generateArenaMap(seed, 2).map.terrain) for (const t of row) kinds.add(t);
    }
    expect(kinds).toContain('normal');
    expect(kinds).toContain('impassable');
    expect(kinds).toContain('difficult');
    expect(kinds).toContain('water');
  });

  it('guarantees an A<->B path for every spawn pair, every seed/team size', () => {
    for (const teamSize of [1, 2]) {
      for (const seed of SEEDS) {
        const { map, spawnsA, spawnsB } = generateArenaMap(seed, teamSize);
        for (const a of spawnsA) for (const b of spawnsB) expect(findPath(map, [], a, b)).not.toBeNull();
      }
    }
  });

  it('includes a fenced pen occasionally on the larger map (not always, not never)', () => {
    let fenced = 0;
    for (let seed = 1; seed <= 100; seed += 1) if (findFence(generateArenaMap(seed, 2).map) !== null) fenced += 1;
    expect(fenced).toBeGreaterThan(0);
    expect(fenced).toBeLessThan(100);
  });

  it('every fenced pen has a working entrance: its interior is reachable from a spawn', () => {
    let checked = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const { map, spawnsA } = generateArenaMap(seed, 2);
      const fence = findFence(map);
      if (fence === null) continue;
      checked += 1;
      const interior = cellToFeet(
        { x: fence.x + Math.floor(fence.w / 2), y: fence.y + Math.floor(fence.h / 2) },
        DEFAULT_CELL_SIZE_FEET,
      );
      expect(findPath(map, [], spawnsA[0]!, interior), `seed ${seed} fence interior unreachable`).not.toBeNull();
    }
    expect(checked, 'no fenced pen found to check').toBeGreaterThan(0);
  });

  it('is deterministic: same seed/size yields a deep-equal arena', () => {
    for (const seed of SEEDS) {
      expect(generateArenaMap(seed, 2)).toEqual(generateArenaMap(seed, 2));
      expect(generateArenaMap(seed, 1)).toEqual(generateArenaMap(seed, 1));
    }
  });
});
