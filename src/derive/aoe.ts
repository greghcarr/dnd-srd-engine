import type { Position } from '../schemas/runtime/encounter.js';
import type { SpellAreaShape } from '../schemas/content/spell.js';
import { DEFAULT_CELL_SIZE_FEET } from '../schemas/runtime/location.js';

// ── Area-of-effect rasterizer (the canonical grid template) ──────────────
//
// Maps an SRD area of effect (cone / cube / line / sphere / cylinder /
// emanation + a size) to the set of grid cells it covers, so every consumer
// gets ONE answer instead of hand-rolling geometry that disagrees with an
// expert's template. Pure geometry — no campaign state, no line-of-effect;
// `creaturesInSpellArea` (query/aoe.ts) layers state + LoE on top.
//
// Convention (documented so it's a deliberate, single answer):
//   • A cell is covered iff its CENTER lies within the continuous shape —
//     the standard VTT "template" model. This is distinct from the engine's
//     range/placement gating, which stays on the chebyshev metric (a
//     separate question: can you reach the point, not which cells the
//     template covers).
//   • Origin inclusion follows the SRD rules-glossary "Area of Effect"
//     entries: a Sphere and a Cylinder include the point of origin; a Cone,
//     Cube, Line, and Emanation exclude it "unless its creator decides
//     otherwise" (override with `includeOrigin`).
//   • Cone width at distance d equals d (RAW): a cell is in the cone if its
//     axial distance t ∈ (0, length] and its perpendicular offset ≤ t / 2.
//   • Cube: an n×n axis-aligned block (n = side / cell), near face flush
//     with the origin cell, extended toward the aim's dominant cardinal and
//     centered on the perpendicular axis.
//   • The 2024 Cylinder's height and the 2D grid are orthogonal; a Cylinder
//     rasterizes as its circular base (same as a Sphere of that radius).

// Floating-point slack for boundary inclusion. Distances are multiples of
// the cell size, but euclidean radii and the cone half-width introduce
// sqrt(), so an exact-boundary cell (e.g. a center exactly `radius` feet
// away) must still count as inside.
const AOE_EPSILON = 1e-9;
const HALF = 2;

// SRD rules-glossary "Area of Effect": which shapes include their point of
// origin by default.
const RAW_INCLUDES_ORIGIN: Readonly<Record<SpellAreaShape, boolean>> = {
  sphere: true,
  cylinder: true,
  cone: false,
  cube: false,
  line: false,
  emanation: false,
};

export interface AreaOfEffectSpec {
  readonly shape: SpellAreaShape;
  /** Sphere/Cylinder/Emanation: radius. Cone/Line: length. Cube: side. In feet. */
  readonly sizeFeet: number;
  /** The point of origin, in CELL coordinates. */
  readonly origin: Position;
  /**
   * A reference cell that fixes the shape's direction (Cone, Line, Cube) or
   * is unused (Sphere/Cylinder/Emanation extend in all directions). Required
   * for the directional shapes; if omitted (or equal to the origin) they
   * cover nothing.
   */
  readonly aim?: Position;
  /** Defaults to {@link DEFAULT_CELL_SIZE_FEET}. */
  readonly cellSizeFeet?: number;
  /** Line width, in feet. Defaults to one cell. */
  readonly widthFeet?: number;
  /** Override the RAW per-shape origin-inclusion default. */
  readonly includeOrigin?: boolean;
}

const cellCenterFeet = (cell: Position, cs: number): Position => ({
  x: cell.x * cs + cs / HALF,
  y: cell.y * cs + cs / HALF,
});

interface Direction {
  readonly ux: number;
  readonly uy: number;
}

// Unit vector (in feet space) from origin toward aim, or null when there is
// no usable direction (no aim, or aim coincident with the origin cell).
const aimDirection = (origin: Position, aim: Position | undefined, cs: number): Direction | null => {
  if (aim === undefined) return null;
  const o = cellCenterFeet(origin, cs);
  const a = cellCenterFeet(aim, cs);
  const dx = a.x - o.x;
  const dy = a.y - o.y;
  const len = Math.hypot(dx, dy);
  if (len <= AOE_EPSILON) return null;
  return { ux: dx / len, uy: dy / len };
};

const radialCovers = (p: Position, o: Position, radiusFeet: number): boolean =>
  Math.hypot(p.x - o.x, p.y - o.y) <= radiusFeet + AOE_EPSILON;

const coneCovers = (p: Position, o: Position, dir: Direction, lengthFeet: number): boolean => {
  const rx = p.x - o.x;
  const ry = p.y - o.y;
  const t = rx * dir.ux + ry * dir.uy; // axial distance along the aim
  if (t <= AOE_EPSILON || t > lengthFeet + AOE_EPSILON) return false;
  const perp = Math.abs(rx * dir.uy - ry * dir.ux); // perpendicular offset
  return perp <= t / HALF + AOE_EPSILON; // cone width at distance t is t
};

const lineCovers = (
  p: Position,
  o: Position,
  dir: Direction,
  lengthFeet: number,
  widthFeet: number,
): boolean => {
  const rx = p.x - o.x;
  const ry = p.y - o.y;
  const t = rx * dir.ux + ry * dir.uy;
  if (t <= AOE_EPSILON || t > lengthFeet + AOE_EPSILON) return false;
  const perp = Math.abs(rx * dir.uy - ry * dir.ux);
  return perp <= widthFeet / HALF + AOE_EPSILON;
};

// Axis-aligned n×n block, near face flush with the origin cell, extended
// toward the aim's dominant cardinal, centered on the perpendicular axis.
const cubeCells = (
  origin: Position,
  aim: Position | undefined,
  sideFeet: number,
  cs: number,
): Position[] => {
  if (aim === undefined) return [];
  const n = Math.max(1, Math.round(sideFeet / cs));
  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  let ex = 0;
  let ey = 0;
  if (Math.abs(dx) >= Math.abs(dy)) ex = Math.sign(dx) || 1;
  else ey = Math.sign(dy) || 1;
  // Perpendicular span centered on the origin (odd n is symmetric; even n
  // biases toward the higher index).
  const lo = -Math.floor((n - 1) / HALF);
  const hi = Math.ceil((n - 1) / HALF);
  const cells: Position[] = [];
  for (let k = 0; k < n; k += 1) {
    for (let perp = lo; perp <= hi; perp += 1) {
      const cell =
        ex !== 0
          ? { x: origin.x + k * ex, y: origin.y + perp }
          : { x: origin.x + perp, y: origin.y + k * ey };
      cells.push(cell);
    }
  }
  return cells;
};

/**
 * The grid cells covered by an area of effect. Cells are returned in stable
 * (x, then y) order and may fall outside any map's bounds — geometry is map-
 * agnostic; clipping to terrain/line-of-effect is the query layer's job.
 */
export const coveredCells = (spec: AreaOfEffectSpec): Position[] => {
  const cs = spec.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const includeOrigin = spec.includeOrigin ?? RAW_INCLUDES_ORIGIN[spec.shape];
  const isOriginCell = (c: Position): boolean => c.x === spec.origin.x && c.y === spec.origin.y;

  const withOriginRule = (cells: Position[]): Position[] => {
    const out = cells.filter((c) => includeOrigin || !isOriginCell(c));
    if (includeOrigin && !out.some(isOriginCell)) out.push({ ...spec.origin });
    out.sort((a, b) => a.x - b.x || a.y - b.y);
    return out;
  };

  if (spec.shape === 'cube') {
    return withOriginRule(cubeCells(spec.origin, spec.aim, spec.sizeFeet, cs));
  }

  const o = cellCenterFeet(spec.origin, cs);
  const dir = aimDirection(spec.origin, spec.aim, cs);
  const widthFeet = spec.widthFeet ?? cs;
  const reachCells = Math.ceil(spec.sizeFeet / cs) + 1;
  const covers = (p: Position): boolean => {
    switch (spec.shape) {
      case 'sphere':
      case 'cylinder':
      case 'emanation':
        return radialCovers(p, o, spec.sizeFeet);
      case 'cone':
        return dir !== null && coneCovers(p, o, dir, spec.sizeFeet);
      case 'line':
        return dir !== null && lineCovers(p, o, dir, spec.sizeFeet, widthFeet);
      case 'cube':
        return false; // handled above
    }
  };

  const cells: Position[] = [];
  for (let x = spec.origin.x - reachCells; x <= spec.origin.x + reachCells; x += 1) {
    for (let y = spec.origin.y - reachCells; y <= spec.origin.y + reachCells; y += 1) {
      if (covers(cellCenterFeet({ x, y }, cs))) cells.push({ x, y });
    }
  }
  return withOriginRule(cells);
};
