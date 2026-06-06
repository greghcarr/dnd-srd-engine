// Slice 695: unit tests for the pure tactical decision logic. No engine,
// no RNG — hand-built maps and positions exercise the heuristic cascade
// (flee / kite / close / stay), the total-order selection, and role
// classification.

import { describe, expect, it } from 'vitest';
import {
  classifyTacticalRole,
  planTacticalMove,
  pickByTotalOrder,
  type TacticalMoveInput,
} from '../../scripts/tactical/policy.js';
import { hasLineOfSight } from '../../src/derive/terrain.js';
import { feetToCell } from '../../src/derive/pathing.js';
import type { ContentPack } from '../../src/content/pack.js';
import type { LocationMap, TerrainKind } from '../../src/schemas/runtime/location.js';
import type { Position } from '../../src/schemas/runtime/encounter.js';

const CELL = 5;
const feet = (cx: number, cy: number): Position => ({ x: cx * CELL, y: cy * CELL });
const distFeet = (a: Position, b: Position): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const openMap = (w: number, h: number, impassable: Array<[number, number]> = []): LocationMap => {
  const terrain: TerrainKind[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, (): TerrainKind => 'normal'),
  );
  for (const [x, y] of impassable) terrain[y]![x] = 'impassable';
  return { widthCells: w, heightCells: h, cellSizeFeet: CELL, terrain };
};

const baseInput = (over: Partial<TacticalMoveInput>): TacticalMoveInput => ({
  map: openMap(12, 5),
  doors: [],
  fromFeet: feet(5, 2),
  enemyFeet: feet(6, 2),
  occupiedFeet: [],
  speedFeet: 30,
  role: 'melee',
  effectiveRangeFeet: 5,
  reachFeet: 5,
  hpFraction: 1,
  ...over,
});

const fakePack = (items: Array<Record<string, unknown>>): ContentPack =>
  ({ items } as unknown as ContentPack);

describe('classifyTacticalRole (slice 695)', () => {
  it('ranged weapon -> ranged with its range', () => {
    const pack = fakePack([{ id: 'bow', itemKind: 'weapon', attackKind: 'ranged', properties: [], rangeNormal: 150 }]);
    expect(classifyTacticalRole(pack, 'bow', [])).toMatchObject({
      role: 'ranged',
      effectiveRangeFeet: 150,
      reachFeet: 5,
    });
  });

  it('cantrips -> ranged (caster) even behind a melee weapon', () => {
    const pack = fakePack([{ id: 'staff', itemKind: 'weapon', attackKind: 'melee', properties: [] }]);
    expect(classifyTacticalRole(pack, 'staff', ['fire-bolt']).role).toBe('ranged');
  });

  it('melee weapon, no cantrips -> melee; a reach weapon bumps reach to 10', () => {
    const pack = fakePack([
      { id: 'axe', itemKind: 'weapon', attackKind: 'melee', properties: [] },
      { id: 'glaive', itemKind: 'weapon', attackKind: 'melee', properties: ['reach'] },
    ]);
    expect(classifyTacticalRole(pack, 'axe', [])).toMatchObject({ role: 'melee', reachFeet: 5 });
    expect(classifyTacticalRole(pack, 'glaive', [])).toMatchObject({
      role: 'melee',
      reachFeet: 10,
      effectiveRangeFeet: 10,
    });
  });
});

describe('pickByTotalOrder (slice 695)', () => {
  it('is independent of input order', () => {
    const cells: Position[] = [{ x: 1, y: 1 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 0 }];
    const score = (c: Position): number => -(c.x + c.y);
    const chosen = pickByTotalOrder(cells, score);
    for (const perm of [[...cells].reverse(), [cells[3]!, cells[0]!, cells[4]!, cells[1]!, cells[2]!]]) {
      expect(pickByTotalOrder(perm, score)).toEqual(chosen);
    }
  });

  it('breaks score ties by (x asc, then y asc)', () => {
    const cells: Position[] = [{ x: 3, y: 1 }, { x: 1, y: 3 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(pickByTotalOrder([...cells].reverse(), () => 0)).toEqual({ x: 1, y: 1 });
  });
});

describe('planTacticalMove (slice 695)', () => {
  it('melee far from enemy: closes the distance, no disengage', () => {
    const input = baseInput({ role: 'melee', fromFeet: feet(1, 2), enemyFeet: feet(10, 2) });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    expect(move!.disengage).toBe(false);
    expect(distFeet(move!.to, input.enemyFeet)).toBeLessThan(distFeet(input.fromFeet, input.enemyFeet));
  });

  it('melee already adjacent: stays put (null)', () => {
    expect(planTacticalMove(baseInput({ role: 'melee', fromFeet: feet(5, 2), enemyFeet: feet(6, 2) }))).toBeNull();
  });

  it('ranged with enemy adjacent: kites away keeping LoS, no disengage', () => {
    const input = baseInput({ role: 'ranged', fromFeet: feet(5, 2), enemyFeet: feet(6, 2), effectiveRangeFeet: 80 });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    expect(move!.disengage).toBe(false);
    expect(distFeet(move!.to, input.enemyFeet)).toBeGreaterThan(distFeet(input.fromFeet, input.enemyFeet));
  });

  it('ranged at a safe distance with LoS: stays put (null)', () => {
    expect(
      planTacticalMove(baseInput({ role: 'ranged', fromFeet: feet(1, 2), enemyFeet: feet(10, 2), effectiveRangeFeet: 80 })),
    ).toBeNull();
  });

  it('low HP: flees to max distance and disengages', () => {
    const input = baseInput({ role: 'melee', fromFeet: feet(5, 2), enemyFeet: feet(6, 2), hpFraction: 0.2 });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    expect(move!.disengage).toBe(true);
    expect(distFeet(move!.to, input.enemyFeet)).toBeGreaterThan(distFeet(input.fromFeet, input.enemyFeet));
  });

  it('low HP near cover: flees to a cell that breaks line of sight', () => {
    // Pillar at (3,2) sits between the enemy (right) and the cells to its
    // left on row 2, so fleeing behind it breaks LoS.
    const map = openMap(12, 5, [[3, 2]]);
    const input = baseInput({
      map,
      role: 'melee',
      fromFeet: feet(5, 2),
      enemyFeet: feet(10, 2),
      hpFraction: 0.2,
    });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    const toCell = feetToCell(move!.to, CELL);
    const enemyCell = feetToCell(input.enemyFeet, CELL);
    expect(hasLineOfSight(map, [], toCell, enemyCell)).toBe(false);
  });

  it('is deterministic across repeated calls', () => {
    const input = baseInput({ role: 'ranged', fromFeet: feet(5, 2), enemyFeet: feet(6, 2), effectiveRangeFeet: 80 });
    expect(planTacticalMove(input)).toEqual(planTacticalMove(input));
  });
});
