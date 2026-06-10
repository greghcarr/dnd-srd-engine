// Slice 782: 2024 Heavy-weapon disadvantage (STR/DEX-13), replacing the
// removed 2014 Small-creature-Heavy rule.
//
// SRD 5.2.1 Equipment, Heavy property: "You have Disadvantage on attack rolls
// with a Heavy weapon if it's a Melee weapon and your Strength score isn't at
// least 13, or if it's a Ranged weapon and your Dexterity score isn't at
// least 13." Canon: references/srd-markdown/equipment.md.
//
// Covers both arms + the threshold boundary; the size-decoupling
// (Small + STR>=13 -> no disadvantage) is asserted in slice-560.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

type Scores = { STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number };
const BASE: Scores = { STR: 16, DEX: 16, CON: 14, INT: 10, WIS: 10, CHA: 10 };

// Plan a single attack with `weaponId` by an attacker with `scores` and
// return the AttackRolled `used` state. No encounter/positions are created,
// so the Heavy-weapon rule under test is the only disadvantage source in play
// (ranged-in-melee needs a positioned encounter; it can't fire here).
const usedFor = (seed: number, weaponId: string, scores: Scores): string | undefined => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const weapon = makeItemInstance(weaponId);
  const attacker = CharacterSchema.parse({
    id: newCharacterId(), name: 'Attacker', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: scores,
    hp: { current: 28, max: 28, temp: 0 },
    inventory: [weapon.id], equipped: { mainHand: weapon.id },
  });
  const target = CharacterSchema.parse({
    id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });
  let campaign = engine.createCampaign({ name: 'heavy-2024' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon } satisfies ItemAcquiredEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  const { events } = engine.plan.attack(campaign.state, {
    attackerId: attacker.id, targetId: target.id, weaponInstanceId: weapon.id,
  });
  const ar = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
  return ar?.used;
};

describe('2024 Heavy-weapon STR/DEX-13 disadvantage (slice 782)', () => {
  it('melee Heavy + STR 12 → disadvantage', () => {
    expect(usedFor(1, 'greataxe', { ...BASE, STR: 12 })).toBe('disadvantage');
  });

  it('melee Heavy + STR 13 (threshold) → no disadvantage', () => {
    expect(usedFor(2, 'greataxe', { ...BASE, STR: 13 })).toBe('none');
  });

  it('ranged Heavy + DEX 12 → disadvantage (checks DEX, not STR)', () => {
    expect(usedFor(3, 'longbow', { ...BASE, DEX: 12, STR: 8 })).toBe('disadvantage');
  });

  it('ranged Heavy + DEX 13 (threshold) → no disadvantage', () => {
    expect(usedFor(4, 'longbow', { ...BASE, DEX: 13, STR: 8 })).toBe('none');
  });

  it('non-Heavy weapon ignores the rule (STR 8 + longsword → no disadvantage)', () => {
    expect(usedFor(5, 'longsword', { ...BASE, STR: 8 })).toBe('none');
  });
});
