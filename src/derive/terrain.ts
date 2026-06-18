import type {
  Door,
  LocationMap,
  TerrainKind,
} from '../schemas/runtime/location.js';
import {
  DEFAULT_CELL_SIZE_FEET,
  DIFFICULT_MOVEMENT_COST,
  NORMAL_MOVEMENT_COST,
} from '../schemas/runtime/location.js';
import type { Position } from '../schemas/runtime/encounter.js';

export const terrainAt = (map: LocationMap, x: number, y: number): TerrainKind | undefined => {
  if (x < 0 || x >= map.widthCells) return undefined;
  if (y < 0 || y >= map.heightCells) return undefined;
  return map.terrain[y]?.[x];
};

export const movementCostFor = (terrain: TerrainKind): number => {
  switch (terrain) {
    case 'normal':
      return NORMAL_MOVEMENT_COST;
    case 'water':
    case 'difficult':
      return DIFFICULT_MOVEMENT_COST;
    case 'impassable':
      return Number.POSITIVE_INFINITY;
  }
};

export const movementCostAt = (map: LocationMap, x: number, y: number): number => {
  const terrain = terrainAt(map, x, y);
  if (terrain === undefined) return Number.POSITIVE_INFINITY;
  return movementCostFor(terrain);
};

const chebyshevSteps = (a: Position, b: Position): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const chebyshevDistanceFeet = (
  a: Position,
  b: Position,
  cellSizeFeet: number = DEFAULT_CELL_SIZE_FEET,
): number => chebyshevSteps(a, b) * cellSizeFeet;

export const isInRangeFeet = (
  from: Position,
  to: Position,
  rangeFeet: number,
  cellSizeFeet: number = DEFAULT_CELL_SIZE_FEET,
): boolean => chebyshevDistanceFeet(from, to, cellSizeFeet) <= rangeFeet;

interface RayCell {
  readonly x: number;
  readonly y: number;
}

export const bresenhamCells = (from: Position, to: Position): RayCell[] => {
  const cells: RayCell[] = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    cells.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
};

const doorBlocksSight = (door: Door): boolean =>
  door.state === 'closed' || door.state === 'locked';

// A cell stops both sight and effect when it is off-map (a map edge is a wall),
// impassable terrain, or holds a closed/locked door. In the current terrain
// vocabulary every blocker stops BOTH — nothing is see-through-but-solid (a
// glass wall) nor solid-but-see-through (magical darkness) — so line of sight
// and line of effect are the identical test (see `hasLineOfEffect`).
const cellBlocks = (
  map: LocationMap,
  doors: ReadonlyArray<Door>,
  x: number,
  y: number,
): boolean => {
  const terrain = terrainAt(map, x, y);
  if (terrain === undefined || terrain === 'impassable') return true;
  for (const door of doors) {
    if (door.position.x === x && door.position.y === y && doorBlocksSight(door)) return true;
  }
  return false;
};

// Corner-aware line-of-sight / line-of-effect, in DOUBLED cell coordinates so a
// cell's four corners and centre are all integer lattice points: cell (x,y)
// occupies the scaled square [2x, 2x+2] × [2y, 2y+2], with centre (2x+1, 2y+1)
// and corners at the even points (2x|2x+2, 2y|2y+2). Treating the SRD's "point
// of origin" as a single point (the source cell's centre) and "a location" /
// "the whole target" as a space (the target cell's centre + four corners), a
// target space is reachable iff at least one straight line from the origin
// centre to one of those five target points is unobstructed — i.e. it is
// blocked only when EVERY such line is blocked (rules-glossary "Cover": Total
// Cover "covers the whole target"; "area of effect": a location is excluded
// only "if all straight lines extending from the point of origin … are
// blocked").

// Comparison of fractions n1/d1 vs n2/d2 with POSITIVE denominators: returns a
// negative / zero / positive sign for less / equal / greater. Magnitudes stay
// small (doubled combat-grid coordinates), so the cross-products are exact.
const cmpFrac = (n1: number, d1: number, n2: number, d2: number): number => n1 * d2 - n2 * d1;

// Does the OPEN segment (ax,ay)→(bx,by) pass through the OPEN interior of the
// scaled square of cell (cx,cy)? All inputs are integers in doubled-cell
// coordinates, so this is exact: it intersects the open t-intervals on which
// x(t) and y(t) are each strictly inside the cell's slab with the open segment
// domain (0,1), and reports a non-empty intersection.
const segEntersCellInterior = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean => {
  // Lower / upper bounds on t, as fractions (num/den, den > 0). Seed with (0,1).
  const lows: Array<readonly [number, number]> = [[0, 1]];
  const highs: Array<readonly [number, number]> = [[1, 1]];

  const clipAxis = (a: number, b: number, lo: number, hi: number): boolean => {
    const d = b - a;
    if (d === 0) return a > lo && a < hi; // parallel: inside the open slab or never
    // t at the two slab faces is (lo-a)/d and (hi-a)/d; normalise each fraction
    // to a positive denominator, then order them into the low/high bound lists.
    const norm = (num: number): readonly [number, number] => (d > 0 ? [num, d] : [-num, -d]);
    const t1 = norm(lo - a);
    const t2 = norm(hi - a);
    if (cmpFrac(t1[0], t1[1], t2[0], t2[1]) <= 0) {
      lows.push(t1);
      highs.push(t2);
    } else {
      lows.push(t2);
      highs.push(t1);
    }
    return true;
  };

  if (!clipAxis(ax, bx, 2 * cx, 2 * cx + 2)) return false;
  if (!clipAxis(ay, by, 2 * cy, 2 * cy + 2)) return false;

  let lo = lows[0]!;
  for (const f of lows) if (cmpFrac(f[0], f[1], lo[0], lo[1]) > 0) lo = f;
  let hi = highs[0]!;
  for (const f of highs) if (cmpFrac(f[0], f[1], hi[0], hi[1]) < 0) hi = f;
  return cmpFrac(lo[0], lo[1], hi[0], hi[1]) < 0; // strict: a touched edge/corner isn't interior
};

// The "both shoulders" seam rule: where a ray passes EXACTLY through a cell
// corner (an even,even lattice vertex) it crosses between two diagonally
// opposite cells without entering either's interior. That diagonal is sealed —
// no line truly fits through — iff the two flanking "shoulder" cells are both
// blockers (e.g. two stacked walls meeting at the vertex). Without this a ray
// would leak through the seam of a solid wall.
const rayBlockedAtSeam = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  blocks: (x: number, y: number) => boolean,
): boolean => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 || dy === 0) return false; // axis-aligned rays here never hit a vertex
  const xLo = Math.min(ax, bx);
  const xHi = Math.max(ax, bx);
  for (let vx = xLo % 2 === 0 ? xLo + 2 : xLo + 1; vx < xHi; vx += 2) {
    const numer = (vx - ax) * dy; // y(t)·dx at this vertical line
    if (numer % dx !== 0) continue; // y not an integer here → not a vertex
    const vy = ay + numer / dx;
    if (vy % 2 !== 0) continue; // vertex requires an even (corner) y
    const k = vx / 2;
    const m = vy / 2;
    // Shoulders are the two cells off the ray's travel diagonal.
    const sameSign = dx > 0 === dy > 0;
    const s1x = sameSign ? k : k - 1;
    const s2x = sameSign ? k - 1 : k;
    if (blocks(s1x, m - 1) && blocks(s2x, m)) return true;
  }
  return false;
};

export const hasLineOfSight = (
  map: LocationMap,
  doorsAtLocation: ReadonlyArray<Door>,
  from: Position,
  to: Position,
): boolean => {
  if (from.x === to.x && from.y === to.y) return true;

  // A blocker seals a line only if it is neither endpoint's own cell.
  const blocks = (x: number, y: number): boolean =>
    !(x === from.x && y === from.y) &&
    !(x === to.x && y === to.y) &&
    cellBlocks(map, doorsAtLocation, x, y);

  const ax = 2 * from.x + 1;
  const ay = 2 * from.y + 1;
  const targets: ReadonlyArray<readonly [number, number]> = [
    [2 * to.x + 1, 2 * to.y + 1], // centre
    [2 * to.x, 2 * to.y], // corners
    [2 * to.x + 2, 2 * to.y],
    [2 * to.x, 2 * to.y + 2],
    [2 * to.x + 2, 2 * to.y + 2],
  ];

  const loX = Math.min(from.x, to.x);
  const hiX = Math.max(from.x, to.x);
  const loY = Math.min(from.y, to.y);
  const hiY = Math.max(from.y, to.y);

  for (const [bx, by] of targets) {
    let clear = true;
    for (let cx = loX; cx <= hiX && clear; cx++) {
      for (let cy = loY; cy <= hiY; cy++) {
        if (blocks(cx, cy) && segEntersCellInterior(ax, ay, bx, by, cx, cy)) {
          clear = false;
          break;
        }
      }
    }
    if (clear && !rayBlockedAtSeam(ax, ay, bx, by, blocks)) return true;
  }
  return false;
};

// Line of effect is the same test as line of sight: see `cellBlocks` — the
// current terrain vocabulary has no blocker that stops one but not the other.
// Kept as a named alias so a future see-through-but-solid (or solid-but-see-
// through) blocker has an obvious split point.
export const hasLineOfEffect = hasLineOfSight;
