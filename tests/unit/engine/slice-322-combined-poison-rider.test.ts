// Slice 322 — content sweep of poison natural weapons exercising the
// combined onHit rider: a single rider carrying BOTH extra damage
// (slice 316 dice) and an unconditional condition (slice 321
// applyConditionId). Canonical user: a Wyvern's Sting (+7d6 poison AND
// Poisoned on every hit).
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

const buildAttacker = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Wyvern', speciesId: 'human', backgroundId: 'sage',
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
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 8,
  });

const firstHit = (weaponId: string): { events: ReadonlyArray<Event>; attackerId: string; targetId: string } | undefined => {
  const weapon = makeItemInstance(weaponId);
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const attacker = buildAttacker(weapon.id);
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: `cp-${seed}` });
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

describe('slice 322: combined damage + condition poison riders', () => {
  it("Wyvern's Sting deals base piercing + extra poison AND applies Poisoned, no save", () => {
    const hit = firstHit('wyvern-sting');
    expect(hit, 'expected a hit').toBeDefined();
    const { events, attackerId, targetId } = hit!;
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
    const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled')!;
    expect(damage.rolls.some((r) => r.type === 'piercing')).toBe(true);
    const poison = damage.rolls.find((r) => r.type === 'poison');
    expect(poison, 'expected an extra poison component').toBeDefined();
    expect(poison!.expression).toBe('7d6');
    const cond = events.find((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied');
    expect(cond!.conditionId).toBe('poisoned');
    expect(cond!.targetId).toBe(targetId);
    expect(cond!.sourceCharacterId).toBe(attackerId);
  });

  it("Ettercap's Bite also carries both arms (1d4 poison + Poisoned)", () => {
    const hit = firstHit('ettercap-bite');
    expect(hit, 'expected a hit').toBeDefined();
    const { events } = hit!;
    const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled')!;
    expect(damage.rolls.some((r) => r.type === 'poison' && r.expression === '1d4')).toBe(true);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(true);
  });

  it("Merrow's Bite applies Poisoned with no extra damage component", () => {
    const hit = firstHit('merrow-bite');
    expect(hit, 'expected a hit').toBeDefined();
    const { events } = hit!;
    const damage = events.find((e): e is DamageRolledEvent => e.type === 'DamageRolled')!;
    expect(damage.rolls.some((r) => r.type === 'poison')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(true);
  });
});
