// Slice 684: pathfinding helpers (findPath, reachableCells) +
// shortest-path move-cost contract.
//
// What this audit pins:
//   1. findPath on an open map returns the diagonal-Chebyshev
//      cost.
//   2. findPath routes AROUND an impassable wall, costing more
//      than the straight Chebyshev line.
//   3. findPath returns null when no legal path exists (sealed
//      destination).
//   4. A closed/locked door BLOCKS movement through its cell.
//   5. reachableCells respects budgetFeet (cells exceeding cost
//      are excluded).
//   6. Occupied cells are not stepped onto OR routed through.
//   7. feetToCell / cellToFeet round-trip correctly.

import { describe, expect, it } from 'vitest';
import type { LocationMap, Door } from '../../../src/schemas/runtime/location.js';
import {
  findPath,
  reachableCells,
  feetToCell,
  cellToFeet,
} from '../../../src/derive/pathing.js';

const buildOpenMap = (size = 6): LocationMap => ({
  widthCells: size,
  heightCells: size,
  cellSizeFeet: 5,
  terrain: Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 'normal' as const),
  ),
});

// 6x6 with a horizontal impassable wall at cell-y 2 spanning x 0..4
// (cell x=5 is open — the only path through).
const buildWalledMap = (): LocationMap => ({
  widthCells: 6,
  heightCells: 6,
  cellSizeFeet: 5,
  terrain: [
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ['impassable', 'impassable', 'impassable', 'impassable', 'impassable', 'normal'],
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
  ],
});

// 6x6 fully sealed (impassable ring around cell (3,3)).
const buildSealedMap = (): LocationMap => ({
  widthCells: 6,
  heightCells: 6,
  cellSizeFeet: 5,
  terrain: [
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
    ['normal', 'normal', 'impassable', 'impassable', 'impassable', 'normal'],
    ['normal', 'normal', 'impassable', 'normal', 'impassable', 'normal'],
    ['normal', 'normal', 'impassable', 'impassable', 'impassable', 'normal'],
    ['normal', 'normal', 'normal', 'normal', 'normal', 'normal'],
  ],
});

describe('slice 684: pathing helpers', () => {
  it('feetToCell / cellToFeet round-trip correctly', () => {
    expect(feetToCell({ x: 12, y: 7 }, 5)).toEqual({ x: 2, y: 1 });
    expect(feetToCell({ x: 0, y: 0 }, 5)).toEqual({ x: 0, y: 0 });
    expect(cellToFeet({ x: 2, y: 1 }, 5)).toEqual({ x: 10, y: 5 });
  });

  it('findPath: open 6x6 — diagonal Chebyshev cost', () => {
    const map = buildOpenMap();
    const result = findPath(map, [], { x: 0, y: 0 }, { x: 25, y: 25 });
    expect(result, 'open-map path should exist').not.toBeNull();
    // (0,0) → (5,5): Chebyshev 5 cells × 5 ft = 25 ft.
    expect(result!.costFeet).toBe(25);
  });

  it('findPath: routes AROUND an impassable wall (longer than straight Chebyshev)', () => {
    const map = buildWalledMap();
    // Path from cell (0,0) (feet 0,0) to cell (0,5) (feet 0,25).
    // Straight Chebyshev would be 5 cells but goes through the wall.
    // Detour via the open column at cell-x=5 forces a longer path.
    const result = findPath(map, [], { x: 0, y: 0 }, { x: 0, y: 25 });
    expect(result, 'walled-map detour path should exist').not.toBeNull();
    // Straight Chebyshev (5 cells × 5 ft = 25 ft) is impossible
    // because of the wall; the detour must cost more.
    expect(result!.costFeet).toBeGreaterThan(25);
  });

  it('findPath: returns null when destination is sealed off', () => {
    const map = buildSealedMap();
    // Inside the impassable ring is cell (3, 3) at feet (15, 15).
    const result = findPath(map, [], { x: 0, y: 0 }, { x: 15, y: 15 });
    expect(result).toBeNull();
  });

  it('findPath: a closed door on the path is treated as a blocker', () => {
    const map = buildOpenMap();
    const doors: Door[] = [
      // Closed door at cell (2, 0).
      {
        id: '01HXXXXXXXXXXXXXXXXXXXXXXX',
        locationId: '01HYYYYYYYYYYYYYYYYYYYYYYY',
        position: { x: 2, y: 0 },
        state: 'closed',
      },
    ];
    // (0, 0) → (4, 0): the straight east path passes through (2,0)
    // which is closed; pathing must route around (via (1,1) etc.).
    const result = findPath(map, doors, { x: 0, y: 0 }, { x: 20, y: 0 });
    expect(result, 'should find detour around closed door').not.toBeNull();
    // The path must NOT include cell (2, 0).
    expect(
      result!.path.some((c) => c.x === 2 && c.y === 0),
      'path goes through closed door cell',
    ).toBe(false);
  });

  it('findPath: occupied cells are not stepped onto', () => {
    const map = buildOpenMap();
    // (0,0) → (10,0) (cell (2,0)). Cell (1,0) is occupied.
    const result = findPath(map, [], { x: 0, y: 0 }, { x: 10, y: 0 }, {
      occupiedFeet: [{ x: 5, y: 0 }], // feet 5 → cell (1, 0)
    });
    expect(result, 'should find detour around occupied cell').not.toBeNull();
    expect(
      result!.path.some((c) => c.x === 1 && c.y === 0),
      'path goes through occupied cell',
    ).toBe(false);
  });

  it('findPath: destination cell is occupied → null', () => {
    const map = buildOpenMap();
    const result = findPath(map, [], { x: 0, y: 0 }, { x: 5, y: 0 }, {
      occupiedFeet: [{ x: 5, y: 0 }],
    });
    expect(result).toBeNull();
  });

  it('reachableCells: respects budgetFeet', () => {
    const map = buildOpenMap();
    // 10 ft budget → 2 cells reach (origin + 8 diagonal/orthogonal
    // neighbors at cost 1 + 16 cells at cost 2 = up to 25 cells).
    const r10 = reachableCells(map, [], { x: 0, y: 0 }, 10);
    // At cost ≤ 2 cells: the origin + all 8 neighbors at cost 1 +
    // the ring at cost 2. Should NOT include cell (3, 3) (cost 3).
    expect(r10.cells.some((c) => c.x === 3 && c.y === 3)).toBe(false);
    expect(r10.cells.some((c) => c.x === 1 && c.y === 0)).toBe(true);
  });

  it('reachableCells: zero budget includes only the origin cell', () => {
    const map = buildOpenMap();
    const r = reachableCells(map, [], { x: 12, y: 7 }, 0);
    expect(r.cells.length).toBe(1);
    expect(r.cells[0]).toEqual({ x: 2, y: 1 }); // feet (12,7) → cell (2,1)
  });

  it('reachableCells: per-cell cost map matches feetFromCellKey', () => {
    const map = buildOpenMap();
    const r = reachableCells(map, [], { x: 0, y: 0 }, 15);
    // Origin should have cost 0.
    expect(r.costFeetByCellKey.get('0,0')).toBe(0);
    // Adjacent cell (1, 0) should have cost 5 ft.
    expect(r.costFeetByCellKey.get('1,0')).toBe(5);
  });
});
