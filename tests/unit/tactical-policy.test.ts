// Slice 695 + 697: unit tests for the pure tactical decision logic. No
// engine, no RNG — hand-built maps and positions exercise the leashed
// desired-distance model (slice 697), the round standoff leash, the
// total-order selection, and role classification.

import { describe, expect, it } from 'vitest';
import {
  classifyTacticalRole,
  planTacticalMove,
  pickByTotalOrder,
  maxStandoffFeet,
  type TacticalMoveInput,
} from '../../scripts/tactical/policy.js';
import {
  INITIAL_STANDOFF_FEET,
  CLOSE_RATE_FEET_PER_ROUND,
  MIN_STANDOFF_FEET,
} from '../../scripts/tactical/constants.js';
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
  map: openMap(18, 8),
  doors: [],
  fromFeet: feet(5, 4),
  enemyFeet: feet(6, 4),
  occupiedFeet: [],
  speedFeet: 30,
  role: 'melee',
  effectiveRangeFeet: 5,
  reachFeet: 5,
  hpFraction: 1,
  round: 1,
  ...over,
});

const fakePack = (items: Array<Record<string, unknown>>): ContentPack =>
  ({ items } as unknown as ContentPack);

describe('classifyTacticalRole (slice 695)', () => {
  it('ranged weapon -> ranged with its range', () => {
    const pack = fakePack([{ id: 'bow', itemKind: 'weapon', attackKind: 'ranged', properties: [], rangeNormal: 150 }]);
    expect(classifyTacticalRole(pack, 'bow', [])).toMatchObject({ role: 'ranged', effectiveRangeFeet: 150, reachFeet: 5 });
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
    expect(classifyTacticalRole(pack, 'glaive', [])).toMatchObject({ role: 'melee', reachFeet: 10, effectiveRangeFeet: 10 });
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

describe('maxStandoffFeet — round standoff leash (slice 697)', () => {
  it('starts at INITIAL and shrinks CLOSE_RATE per round, floored at MIN', () => {
    expect(maxStandoffFeet(1)).toBe(INITIAL_STANDOFF_FEET);
    expect(maxStandoffFeet(2)).toBe(INITIAL_STANDOFF_FEET - CLOSE_RATE_FEET_PER_ROUND);
    expect(maxStandoffFeet(50)).toBe(MIN_STANDOFF_FEET);
  });

  it('is monotonically non-increasing in the round', () => {
    for (let r = 1; r < 25; r += 1) {
      expect(maxStandoffFeet(r + 1)).toBeLessThanOrEqual(maxStandoffFeet(r));
    }
  });
});

describe('planTacticalMove — leashed desired distance (slice 697)', () => {
  it('melee far from enemy closes the distance, no disengage', () => {
    const input = baseInput({ role: 'melee', fromFeet: feet(1, 4), enemyFeet: feet(16, 4) });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    expect(move!.disengage).toBe(false);
    expect(distFeet(move!.to, input.enemyFeet)).toBeLessThan(distFeet(input.fromFeet, input.enemyFeet));
  });

  it('melee already adjacent stays put (null)', () => {
    expect(planTacticalMove(baseInput({ role: 'melee', fromFeet: feet(5, 4), enemyFeet: feet(6, 4) }))).toBeNull();
  });

  it('ranged with enemy adjacent kites out to its standoff, no disengage', () => {
    const input = baseInput({ role: 'ranged', fromFeet: feet(6, 4), enemyFeet: feet(5, 4), effectiveRangeFeet: 80 });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    expect(move!.disengage).toBe(false);
    expect(distFeet(move!.to, input.enemyFeet)).toBeGreaterThan(distFeet(input.fromFeet, input.enemyFeet));
  });

  it('ranged beyond its standoff closes toward it (no edge-camping)', () => {
    // 65 ft out at round 1: the desired standoff is ~30 ft, so it advances.
    const input = baseInput({ role: 'ranged', fromFeet: feet(1, 4), enemyFeet: feet(14, 4), effectiveRangeFeet: 80 });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    expect(distFeet(move!.to, input.enemyFeet)).toBeLessThan(distFeet(input.fromFeet, input.enemyFeet));
  });

  it('round pressure: a ranged combatant holds its standoff early but is forced to close late', () => {
    const at = (round: number): TacticalMoveInput =>
      baseInput({ role: 'ranged', fromFeet: feet(4, 4), enemyFeet: feet(10, 4), effectiveRangeFeet: 80, round });
    // Round 3 (leash 30 ft): sitting at 30 ft is the desired standoff -> hold.
    expect(planTacticalMove(at(3))).toBeNull();
    // Round 8 (leash at its floor): forced to close to melee.
    const late = planTacticalMove(at(8));
    expect(late).not.toBeNull();
    expect(distFeet(late!.to, feet(10, 4))).toBeLessThan(distFeet(feet(4, 4), feet(10, 4)));
  });

  it('low HP backs off toward the leash edge and disengages (early round)', () => {
    const input = baseInput({ role: 'melee', fromFeet: feet(8, 4), enemyFeet: feet(9, 4), hpFraction: 0.2, round: 1 });
    const move = planTacticalMove(input);
    expect(move).not.toBeNull();
    expect(move!.disengage).toBe(true);
    expect(distFeet(move!.to, input.enemyFeet)).toBeGreaterThan(distFeet(input.fromFeet, input.enemyFeet));
  });

  it('low HP flee is bounded by the leash: cannot retreat once the leash has closed (late round)', () => {
    // Round 8 leash is at the floor (~5 ft); a wounded combatant already at
    // 5 ft cannot run -- the slice-695 unbounded-flee draw is gone.
    const input = baseInput({ role: 'melee', fromFeet: feet(8, 4), enemyFeet: feet(9, 4), hpFraction: 0.2, round: 8 });
    expect(planTacticalMove(input)).toBeNull();
  });

  it('is deterministic across repeated calls', () => {
    const input = baseInput({ role: 'ranged', fromFeet: feet(6, 4), enemyFeet: feet(5, 4), effectiveRangeFeet: 80, round: 2 });
    expect(planTacticalMove(input)).toEqual(planTacticalMove(input));
  });
});
