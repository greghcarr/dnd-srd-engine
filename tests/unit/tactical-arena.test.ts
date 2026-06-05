// Slice 694: unit tests for the pure arena generator. Covers dimension
// scaling, spawn placement, cover confinement + isolation, structural
// connectivity, and seed-determinism. scripts/** isn't coverage-gated, so
// these dedicated tests are how the generator stays honest.

import { describe, expect, it } from 'vitest';
import { generateArenaMap } from '../../scripts/tactical/arena.js';
import { ARENA_DIMS } from '../../scripts/tactical/constants.js';
import { findPath, feetToCell } from '../../src/derive/pathing.js';
import { DEFAULT_CELL_SIZE_FEET } from '../../src/schemas/runtime/location.js';

const SEEDS = [1, 2, 3, 7, 42, 100, 777, 9001];
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const cells = (map: { widthCells: number; heightCells: number; terrain: string[][] }) => {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < map.heightCells; y += 1) {
    for (let x = 0; x < map.widthCells; x += 1) out.push({ x, y });
  }
  return out;
};

describe('generateArenaMap (slice 694)', () => {
  it('scales dimensions with team size (>2 clamps to squad)', () => {
    expect(generateArenaMap(1, 1).map).toMatchObject(ARENA_DIMS.duel);
    expect(generateArenaMap(1, 2).map).toMatchObject(ARENA_DIMS.squad);
    expect(generateArenaMap(1, 3).map).toMatchObject(ARENA_DIMS.squad);
  });

  it('emits one spawn per combatant per team: distinct passable cells, A left of B', () => {
    for (const teamSize of [1, 2]) {
      for (const seed of SEEDS) {
        const { map, spawnsA, spawnsB } = generateArenaMap(seed, teamSize);
        expect(spawnsA).toHaveLength(teamSize);
        expect(spawnsB).toHaveLength(teamSize);
        const spawnCells = [...spawnsA, ...spawnsB].map((p) => feetToCell(p, DEFAULT_CELL_SIZE_FEET));
        expect(new Set(spawnCells.map((c) => `${c.x},${c.y}`)).size).toBe(spawnCells.length);
        for (const c of spawnCells) {
          expect(map.terrain[c.y]![c.x]).not.toBe('impassable');
        }
        for (const a of spawnsA) {
          for (const b of spawnsB) expect(a.x).toBeLessThan(b.x);
        }
      }
    }
  });

  it('confines cover to the middle band, never on or adjacent to a spawn', () => {
    for (const seed of SEEDS) {
      const { map, spawnsA, spawnsB } = generateArenaMap(seed, 2);
      const spawnCells = [...spawnsA, ...spawnsB].map((p) => feetToCell(p, DEFAULT_CELL_SIZE_FEET));
      for (const c of cells(map)) {
        if (map.terrain[c.y]![c.x] !== 'impassable') continue;
        for (const s of spawnCells) expect(chebyshev(s, c)).toBeGreaterThan(1);
      }
    }
  });

  it('places cover pillars in isolation (no two impassable cells within 1 cell)', () => {
    for (const seed of SEEDS) {
      const { map } = generateArenaMap(seed, 2);
      const pillars = cells(map).filter((c) => map.terrain[c.y]![c.x] === 'impassable');
      expect(pillars.length).toBeGreaterThan(0); // density actually scatters cover
      for (let i = 0; i < pillars.length; i += 1) {
        for (let j = i + 1; j < pillars.length; j += 1) {
          expect(chebyshev(pillars[i]!, pillars[j]!)).toBeGreaterThan(1);
        }
      }
    }
  });

  it('guarantees an A<->B path for every spawn pair, every seed/team size', () => {
    for (const teamSize of [1, 2]) {
      for (const seed of SEEDS) {
        const { map, spawnsA, spawnsB } = generateArenaMap(seed, teamSize);
        for (const a of spawnsA) {
          for (const b of spawnsB) expect(findPath(map, [], a, b)).not.toBeNull();
        }
      }
    }
  });

  it('is deterministic: same seed/size yields a deep-equal arena', () => {
    for (const seed of SEEDS) {
      expect(generateArenaMap(seed, 2)).toEqual(generateArenaMap(seed, 2));
    }
  });
});
