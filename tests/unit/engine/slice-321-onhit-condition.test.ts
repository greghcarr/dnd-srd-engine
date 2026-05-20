// Slice 321 — unconditional on-hit condition riders. An `onHit` rider
// can carry `applyConditionId`; on a hit (where the rider's slice-318
// gate passes) the planner applies that condition with no save — the
// 2024 poison-bite shape. Canonical user: a Couatl's Bite (Poisoned on
// every hit).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const WEAPON_ID = 'couatl-bite';

const buildAttacker = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Couatl', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
    inventory: [weaponId], equipped: { mainHand: weaponId },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 8,
  });

const firstHitEvents = (): { events: ReadonlyArray<Event>; attackerId: string; targetId: string } | undefined => {
  const weapon = makeItemInstance(WEAPON_ID);
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const attacker = buildAttacker(weapon.id);
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: `oc-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, { attackerId: attacker.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit === true) return { events, attackerId: attacker.id, targetId: target.id };
  }
  return undefined;
};

describe('slice 321: Couatl Bite unconditional on-hit condition rider', () => {
  it('applies Poisoned on a hit, with no save rolled', () => {
    const hit = firstHitEvents();
    expect(hit, 'expected a hit').toBeDefined();
    const { events, attackerId, targetId } = hit!;
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
    const cond = events.find((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied');
    expect(cond, 'expected an on-hit Poisoned application').toBeDefined();
    expect(cond!.conditionId).toBe('poisoned');
    expect(cond!.targetId).toBe(targetId);
    expect(cond!.sourceCharacterId).toBe(attackerId);
    // The base piercing damage still lands.
    const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled');
    expect(damage!.rolls.some((r) => r.type === 'piercing')).toBe(true);
  });

  it('does not apply the condition on a miss', () => {
    const weapon = makeItemInstance(WEAPON_ID);
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const attacker = buildAttacker(weapon.id);
      // High-AC target so the claw misses.
      const target = CharacterSchema.parse({
        id: newCharacterId(), name: 'Armored', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 50, max: 50, temp: 0 }, armorClass: 25,
      });
      let campaign: Campaign = engine.createCampaign({ name: `miss-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, { attackerId: attacker.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
      const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== false) continue;
      expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
      return;
    }
    throw new Error('no miss found within the seed budget');
  });
});
