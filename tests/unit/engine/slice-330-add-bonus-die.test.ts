// Slice 330 — AddBonusDie primitive on attack rolls. Bless adds a fresh
// 1d4 to each attack roll (RAW, replacing the old flat +2 approximation);
// Bane subtracts a fresh 1d4. The die is rolled in the planner and baked
// into AttackRolled (folded into `attackBonus`, detailed in `bonusDice`),
// so apply()/replay never re-rolls.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFighter = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Alyx', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    inventory: [weaponId], equipped: { mainHand: weaponId },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 12,
  });

// Plans one attack on seed 7 with an optional condition applied to the
// attacker; returns the AttackRolled event.
const attackWith = (conditionId?: string): AttackRolledEvent => {
  const weapon = makeItemInstance('longsword');
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
  const fighter = buildFighter(weapon.id);
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'bonus-die' });
  const setup = [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ];
  if (conditionId !== undefined) {
    setup.push({
      id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
      targetId: fighter.id, conditionId, appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent as never);
  }
  campaign = commit(campaign, setup as never);
  const events = engine.plan.attack(campaign.state, { attackerId: fighter.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
  return events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled')!;
};

describe('slice 330: AddBonusDie on attack rolls', () => {
  it('a plain attack carries no bonusDice', () => {
    const a = attackWith();
    expect(a.bonusDice).toBeUndefined();
    // The folded-bonus invariant always holds.
    expect(a.total).toBe((a.d20[0] ?? 0) + a.attackBonus);
  });

  it('Bless adds a fresh 1d4 (1-4) folded into the attack total', () => {
    const plain = attackWith();
    const blessed = attackWith('blessed');
    expect(blessed.bonusDice).toHaveLength(1);
    const die = blessed.bonusDice![0]!;
    expect(die.dice).toBe('1d4');
    expect(die.subtract).toBe(false);
    expect(die.rolls).toHaveLength(1);
    expect(die.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(die.rolls[0]).toBeLessThanOrEqual(4);
    expect(die.total).toBe(die.rolls[0]);
    // Same seed -> same d20 + same static bonus; Bless adds exactly the die.
    expect(blessed.d20[0]).toBe(plain.d20[0]);
    expect(blessed.attackBonus).toBe(plain.attackBonus + die.total);
    expect(blessed.total).toBe((blessed.d20[0] ?? 0) + blessed.attackBonus);
  });

  it('Bane subtracts a fresh 1d4', () => {
    const plain = attackWith();
    const baned = attackWith('baned');
    expect(baned.bonusDice).toHaveLength(1);
    const die = baned.bonusDice![0]!;
    expect(die.dice).toBe('1d4');
    expect(die.subtract).toBe(true);
    expect(die.total).toBeLessThanOrEqual(-1);
    expect(die.total).toBeGreaterThanOrEqual(-4);
    expect(baned.attackBonus).toBe(plain.attackBonus + die.total);
    expect(baned.total).toBe((baned.d20[0] ?? 0) + baned.attackBonus);
  });
});
