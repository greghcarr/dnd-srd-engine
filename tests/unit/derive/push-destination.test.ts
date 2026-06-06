// Slice 698: forced-movement destination clamping. A Push / shove must land
// the target on a legal cell (in-bounds, non-impassable, unoccupied),
// stopping against an obstacle, and stay grid-aligned. Before slice 698 the
// weapon-mastery / Open Hand Push computed a raw off-grid vector (cell count
// added to a feet coordinate), which could land off the map or on cover.

import { describe, expect, it } from 'vitest';
import { pushDestination } from '../../../src/derive/pathing.js';
import type { LocationMap, TerrainKind } from '../../../src/schemas/runtime/location.js';
import type { Position } from '../../../src/schemas/runtime/encounter.js';

const feet = (cx: number, cy: number): Position => ({ x: cx * 5, y: cy * 5 });
const openMap = (w: number, h: number, impassable: Array<[number, number]> = []): LocationMap => {
  const terrain: TerrainKind[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, (): TerrainKind => 'normal'),
  );
  for (const [x, y] of impassable) terrain[y]![x] = 'impassable';
  return { widthCells: w, heightCells: h, cellSizeFeet: 5, terrain };
};

describe('pushDestination (slice 698)', () => {
  it('moves the full distance, grid-aligned, on open ground', () => {
    expect(pushDestination(feet(2, 3), { dx: 1, dy: 0 }, 10, { map: openMap(10, 6) })).toEqual(feet(4, 3));
  });

  it('clamps at the map edge instead of going out of bounds', () => {
    expect(pushDestination(feet(8, 3), { dx: 1, dy: 0 }, 10, { map: openMap(10, 6) })).toEqual(feet(9, 3));
  });

  it('stops before impassable cover', () => {
    expect(pushDestination(feet(3, 3), { dx: 1, dy: 0 }, 10, { map: openMap(10, 6, [[5, 3]]) })).toEqual(feet(4, 3));
  });

  it('stops before an occupied cell', () => {
    expect(
      pushDestination(feet(3, 3), { dx: 1, dy: 0 }, 10, { map: openMap(10, 6), occupiedFeet: [feet(5, 3)] }),
    ).toEqual(feet(4, 3));
  });

  it('returns the origin when the very first cell is blocked', () => {
    expect(pushDestination(feet(3, 3), { dx: 1, dy: 0 }, 10, { map: openMap(10, 6, [[4, 3]]) })).toEqual(feet(3, 3));
  });

  it('clamps a diagonal shove cell-by-cell', () => {
    // Pillar one cell up-right blocks the diagonal at step 1 -> no move.
    expect(pushDestination(feet(3, 3), { dx: 1, dy: -1 }, 10, { map: openMap(10, 6, [[4, 2]]) })).toEqual(feet(3, 3));
  });

  it('without a map returns the raw grid-aligned destination', () => {
    expect(pushDestination(feet(3, 3), { dx: -1, dy: -1 }, 10, {})).toEqual(feet(1, 1));
  });
});
