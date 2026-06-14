import { describe, expect, it } from 'vitest';
import { computeEncumbrance } from '../../../src/derive/encumbrance.js';
import { computeCarryingCapacity } from '../../../src/derive/carrying-capacity.js';
import { buildFighter, makeItemInstance, TEST_CONTENT } from '../../fixtures/index.js';
import type { ItemInstance } from '../../../src/schemas/runtime/item-instance.js';

const itemsRecord = (...items: ItemInstance[]): Record<string, ItemInstance> => {
  const out: Record<string, ItemInstance> = {};
  for (const i of items) out[i.id] = i;
  return out;
};

describe('computeCarryingCapacity', () => {
  it('STR 10 -> 150 lbs', () => {
    const character = buildFighter({ STR: 10 });
    expect(computeCarryingCapacity(character, TEST_CONTENT).capacity).toBe(150);
  });

  it('STR 18 -> 270 lbs', () => {
    const character = buildFighter({ STR: 18 });
    expect(computeCarryingCapacity(character, TEST_CONTENT).capacity).toBe(270);
  });
});

describe('computeEncumbrance', () => {
  it('empty inventory is unencumbered', () => {
    const character = buildFighter({ STR: 14 });
    const result = computeEncumbrance({
      character,
      itemInstances: {},
      content: TEST_CONTENT,
    });
    expect(result.overCapacity).toBe(false);
    expect(result.carriedWeight).toBe(0);
  });

  it('items without weight contribute zero', () => {
    const character = buildFighter({ STR: 10 });
    const longsword = makeItemInstance('longsword');
    character.inventory.push(longsword.id);
    const result = computeEncumbrance({
      character,
      itemInstances: itemsRecord(longsword),
      content: TEST_CONTENT,
    });
    expect(result.carriedWeight).toBe(0);
    expect(result.overCapacity).toBe(false);
  });
});
