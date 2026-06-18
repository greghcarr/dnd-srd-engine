// Slice 901 — `los-equals-loe`.
//
// `hasLineOfSight` / `hasLineOfEffect` used a single centre-to-centre Bresenham
// ray, which diverges from RAW: the SRD treats the origin as a point and the
// target as a SPACE — a location is excluded from an area of effect only "if
// all straight lines extending from the point of origin … are blocked"
// (rules-glossary, "Area of Effect"), and Total Cover is an obstruction that
// "covers the whole target" (rules-glossary, "Cover"). Both reduce to: a target
// space is blocked only when EVERY line from the origin centre to the target's
// centre-or-a-corner is blocked. The corner-aware test now models that, with a
// "both shoulders" rule so a sightline never leaks through the seam of a solid
// wall (the diagonal-squeeze case).
//
// The sight-vs-effect half of the audit row is moot in the current terrain
// vocabulary: every blocker (impassable, closed/locked door, off-map) stops
// BOTH sight and effect and nothing stops only one, so the two functions stay a
// deliberate, documented identity.

import { describe, expect, it } from 'vitest';
import { hasLineOfSight, hasLineOfEffect } from '../../../src/derive/terrain.js';
import type { Door, LocationMap, TerrainKind } from '../../../src/schemas/runtime/location.js';

const map = (
  width: number,
  height: number,
  impassable: ReadonlyArray<readonly [number, number]> = [],
): LocationMap => {
  const terrain: TerrainKind[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): TerrainKind => 'normal'),
  );
  for (const [x, y] of impassable) terrain[y]![x] = 'impassable';
  return { widthCells: width, heightCells: height, cellSizeFeet: 5, terrain };
};

const door = (x: number, y: number, state: Door['state']): Door => ({
  id: `door-${x}-${y}`,
  locationId: 'loc',
  position: { x, y },
  state,
});

describe('slice 901: corner-aware line of sight / line of effect', () => {
  it('is clear on an open map (centre and far diagonal)', () => {
    expect(hasLineOfSight(map(5, 5), [], { x: 0, y: 0 }, { x: 4, y: 4 })).toBe(true);
    expect(hasLineOfSight(map(5, 5), [], { x: 0, y: 4 }, { x: 4, y: 0 })).toBe(true);
  });

  it('is clear between the same cell and between adjacent cells', () => {
    expect(hasLineOfSight(map(5, 5), [], { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(true);
    expect(hasLineOfSight(map(5, 5), [], { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });

  it('sees a target whose corner pokes past a single blocker (the old single ray did not)', () => {
    // From (0,0) to (4,1) with a wall at (2,1): a line from the source centre to
    // the target's top edge stays in row 0 and clears the wall, so the target is
    // reachable. The old centre-to-centre Bresenham corner-cut into (2,1) and
    // wrongly reported this blocked.
    const m = map(6, 3, [[2, 1]]);
    expect(hasLineOfSight(m, [], { x: 0, y: 0 }, { x: 4, y: 1 })).toBe(true);
  });

  it('is blocked by a wall directly between with no room to go around', () => {
    // One-row corridor: the only path crosses the wall; the map edge seals the
    // flanks, so no straight line gets through.
    expect(hasLineOfSight(map(3, 1, [[1, 0]]), [], { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  it('is blocked by a solid wall column but clear through an aligned gap in it', () => {
    const wall = map(5, 5, [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
    ]);
    expect(hasLineOfSight(wall, [], { x: 0, y: 2 }, { x: 4, y: 2 })).toBe(false);

    const gapped = map(5, 5, [
      [2, 0],
      [2, 1],
      // (2,2) left open — the gap
      [2, 3],
      [2, 4],
    ]);
    expect(hasLineOfSight(gapped, [], { x: 0, y: 2 }, { x: 4, y: 2 })).toBe(true);
  });

  it('does not leak through the seam between two diagonally-adjacent walls', () => {
    // Walls at (1,0) and (0,1) meet at the corner shared with the open cells
    // (0,0) and (1,1). A diagonal sightline (0,0)->(2,2) would pass exactly
    // through that corner; the "both shoulders" rule seals it.
    const m = map(3, 3, [
      [1, 0],
      [0, 1],
    ]);
    expect(hasLineOfSight(m, [], { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
  });

  it('treats closed and locked doors as blockers and open doors as clear', () => {
    const m = map(3, 1);
    expect(hasLineOfSight(m, [door(1, 0, 'closed')], { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(hasLineOfSight(m, [door(1, 0, 'locked')], { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(hasLineOfSight(m, [door(1, 0, 'open')], { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('hasLineOfEffect is the same test as hasLineOfSight', () => {
    const m = map(6, 3, [[2, 1]]);
    const from = { x: 0, y: 0 };
    const to = { x: 4, y: 1 };
    expect(hasLineOfEffect(m, [], from, to)).toBe(hasLineOfSight(m, [], from, to));

    const blocked = map(3, 1, [[1, 0]]);
    expect(hasLineOfEffect(blocked, [], { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(
      hasLineOfSight(blocked, [], { x: 0, y: 0 }, { x: 2, y: 0 }),
    );
  });
});
