// Slice 786: the AoE rasterizer (pure geometry). `coveredCells` maps an SRD
// area of effect (cone/cube/line/sphere/cylinder/emanation + size) to the
// grid cells it covers, using the "cell center within the continuous shape"
// template model and the RAW per-shape origin-inclusion rules.

import { describe, expect, it } from 'vitest';
import { coveredCells } from '../../../src/derive/aoe.js';
import type { Position } from '../../../src/schemas/runtime/encounter.js';

const has = (cells: Position[], x: number, y: number): boolean =>
  cells.some((c) => c.x === x && c.y === y);

describe('coveredCells — sphere (slice 786)', () => {
  // Fireball: 20-ft radius, 5-ft cells → reaches 4 cells out; the far
  // diagonal corner (28 ft away) is excluded — the circular template.
  const cells = coveredCells({ shape: 'sphere', sizeFeet: 20, origin: { x: 0, y: 0 } });

  it('includes the point of origin (RAW: a Sphere includes its origin)', () => {
    expect(has(cells, 0, 0)).toBe(true);
  });
  it('reaches exactly the radius along an axis, not beyond', () => {
    expect(has(cells, 4, 0)).toBe(true);
    expect(has(cells, -4, 0)).toBe(true);
    expect(has(cells, 0, 4)).toBe(true);
    expect(has(cells, 5, 0)).toBe(false);
  });
  it('excludes the far diagonal corner (euclidean circle, not a square)', () => {
    expect(has(cells, 4, 4)).toBe(false);
  });
  it('is symmetric and returned in stable (x,y) order', () => {
    const sorted = [...cells].sort((a, b) => a.x - b.x || a.y - b.y);
    expect(cells).toEqual(sorted);
  });
});

describe('coveredCells — cone (slice 786)', () => {
  // Burning Hands: 15-ft cone aimed +x. Width at distance d equals d.
  const east = coveredCells({ shape: 'cone', sizeFeet: 15, origin: { x: 0, y: 0 }, aim: { x: 3, y: 0 } });

  it('excludes the point of origin (RAW: a Cone excludes its origin)', () => {
    expect(has(east, 0, 0)).toBe(false);
  });
  it('covers the axis out to the length but not beyond', () => {
    expect(has(east, 1, 0)).toBe(true);
    expect(has(east, 3, 0)).toBe(true);
    expect(has(east, 4, 0)).toBe(false);
  });
  it('widens with distance (width = distance from origin)', () => {
    expect(has(east, 1, 1)).toBe(false); // half-width 2.5 ft at 5 ft out
    expect(has(east, 3, 1)).toBe(true); // half-width 7.5 ft at 15 ft out
    expect(has(east, 3, 2)).toBe(false); // 10 ft off-axis > 7.5
  });
  it('follows the aim direction', () => {
    const north = coveredCells({ shape: 'cone', sizeFeet: 15, origin: { x: 0, y: 0 }, aim: { x: 0, y: 3 } });
    expect(has(north, 0, 3)).toBe(true);
    expect(has(north, 1, 3)).toBe(true);
    expect(has(north, 3, 0)).toBe(false);
  });
  it('covers nothing without a direction', () => {
    expect(coveredCells({ shape: 'cone', sizeFeet: 15, origin: { x: 0, y: 0 } })).toEqual([]);
  });
});

describe('coveredCells — line (slice 786)', () => {
  // 20-ft line, default one-cell width, aimed +x.
  const cells = coveredCells({ shape: 'line', sizeFeet: 20, origin: { x: 0, y: 0 }, aim: { x: 2, y: 0 } });

  it('excludes the origin and runs straight to the length', () => {
    expect(has(cells, 0, 0)).toBe(false);
    expect(has(cells, 1, 0)).toBe(true);
    expect(has(cells, 4, 0)).toBe(true);
    expect(has(cells, 5, 0)).toBe(false);
  });
  it('stays one cell wide by default', () => {
    expect(has(cells, 1, 1)).toBe(false);
    expect(has(cells, 4, 1)).toBe(false);
  });
  it('honors an explicit wider width', () => {
    const wide = coveredCells({ shape: 'line', sizeFeet: 20, origin: { x: 0, y: 0 }, aim: { x: 2, y: 0 }, widthFeet: 15 });
    expect(has(wide, 2, 1)).toBe(true);
    expect(has(wide, 2, -1)).toBe(true);
  });
});

describe('coveredCells — cube (slice 786)', () => {
  // Thunderwave: 15-ft cube (3×3 cells) originating at the caster, aimed +x.
  const cells = coveredCells({ shape: 'cube', sizeFeet: 15, origin: { x: 0, y: 0 }, aim: { x: 3, y: 0 } });

  it('is a 3×3 block flush with the origin, minus the excluded origin cell', () => {
    expect(cells).toHaveLength(8);
    expect(has(cells, 0, 0)).toBe(false); // origin excluded (RAW)
    expect(has(cells, 0, 1)).toBe(true);
    expect(has(cells, 0, -1)).toBe(true);
    expect(has(cells, 2, 1)).toBe(true);
    expect(has(cells, 2, -1)).toBe(true);
  });
  it('does not extend past the side length, and aims the right way', () => {
    expect(has(cells, 3, 0)).toBe(false); // n=3, so x∈{0,1,2}
    expect(has(cells, 0, 2)).toBe(false); // perpendicular span is 3 too
  });
  it('covers nothing without a direction', () => {
    expect(coveredCells({ shape: 'cube', sizeFeet: 15, origin: { x: 0, y: 0 } })).toEqual([]);
  });
});

describe('coveredCells — origin inclusion rules (slice 786)', () => {
  it('Cylinder includes its origin (rasterizes like a Sphere of that radius)', () => {
    const cyl = coveredCells({ shape: 'cylinder', sizeFeet: 10, origin: { x: 5, y: 5 } });
    const sph = coveredCells({ shape: 'sphere', sizeFeet: 10, origin: { x: 5, y: 5 } });
    expect(cyl).toEqual(sph);
    expect(has(cyl, 5, 5)).toBe(true);
  });
  it('Emanation excludes its origin (it surrounds the creature)', () => {
    const cells = coveredCells({ shape: 'emanation', sizeFeet: 10, origin: { x: 0, y: 0 } });
    expect(has(cells, 0, 0)).toBe(false);
    expect(has(cells, 1, 0)).toBe(true);
    expect(has(cells, 2, 0)).toBe(true);
    expect(has(cells, 3, 0)).toBe(false); // radius 10 ft = 2 cells
  });
  it('includeOrigin overrides the per-shape default', () => {
    const noOrigin = coveredCells({ shape: 'sphere', sizeFeet: 5, origin: { x: 0, y: 0 }, includeOrigin: false });
    expect(has(noOrigin, 0, 0)).toBe(false);
    const withOrigin = coveredCells({ shape: 'cone', sizeFeet: 15, origin: { x: 0, y: 0 }, aim: { x: 3, y: 0 }, includeOrigin: true });
    expect(has(withOrigin, 0, 0)).toBe(true);
  });
});
