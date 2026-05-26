// Slice 467: Savage Attacker (Origin Feat) per-attack damage-dice
// reroll.
//
// RAW (SRD 5.2.1 Savage Attacker): "You've trained to deal
// particularly damaging strikes. Once per turn when you hit a target
// with a weapon, you can roll the weapon's damage dice twice and use
// either roll against the target."
//
// Wiring path:
// - AttackIntent.useSavageAttacker?: boolean signals consumer opt-in.
// - Validation up front in resolveAttack: attacker has 'savage-
//   attacker' on the effective feat list (slice 466 auto-projects it
//   from the background's originFeatId). In an active encounter, the
//   turnUsage.savageAttackerUsedThisTurn flag must be false.
// - At the damage roll site: two sets of weapon dice are rolled, the
//   higher-sum set is kept, the discarded set rides on the new
//   SavageAttackerUsed event.
// - The reroll only fires on a HIT (the damage path); a miss with the
//   flag set does NOT consume the per-turn use (RAW "when you hit").
// - The SavageAttackerUsed reducer sets the turnUsage flag in-encounter.
//   Out-of-encounter, the flag is omitted and use is unbounded
//   (consumer responsibility, mirror of Stunning Strike's gate).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SavageAttackerUsedEvent } from '../../../src/schemas/events/action-economy.js';

const PACK = loadStarterPack();

// A Soldier (background) auto-gets 'savage-attacker' via slice 466.
const buildSoldier = (
  overrides: Partial<{ name: string; backgroundId: string }> = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: overrides.name ?? 'Recruit',
    speciesId: 'human',
    backgroundId: overrides.backgroundId ?? 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 14, max: 14, temp: 0 },
    featsTaken: [],
  });

const buildDummy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 8, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
  });

describe('Savage Attacker (slice 467)', () => {
  it('on a hit: emits SavageAttackerUsed with a non-empty discardedRolls', () => {
    // Seed-search for a hit; the reroll fires only on a hit.
    let attempt = 0;
    let proven = false;
    while (attempt < 40 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const soldier = buildSoldier();
      const dummy = buildDummy();
      const longsword = makeItemInstance('longsword');
      let campaign: Campaign = engine.createCampaign({ name: 'savage-attacker' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: soldier } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: soldier.id,
        targetId: dummy.id,
        weaponInstanceId: longsword.id,
        useSavageAttacker: true,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const sa = events.find((e) => e.type === 'SavageAttackerUsed') as
        | SavageAttackerUsedEvent
        | undefined;
      expect(sa, 'on hit, expected SavageAttackerUsed to be emitted').toBeDefined();
      expect(sa!.attackerId).toBe(soldier.id);
      expect(sa!.targetId).toBe(dummy.id);
      expect(sa!.weaponInstanceId).toBe(longsword.id);
      expect(sa!.discardedRolls.length).toBeGreaterThan(0);
      // Out-of-encounter (no active encounter): event omits combatant info.
      expect(sa!.encounterId).toBeUndefined();
      expect(sa!.combatantId).toBeUndefined();
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });

  it('on a miss: does NOT emit SavageAttackerUsed (no per-turn use spent)', () => {
    // Seed-search for a miss. Use very-high-AC dummy to bias toward miss.
    const dummyAC = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'IronDummy',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 10, DEX: 20, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 200, max: 200, temp: 0 },
      naturalArmorAC: 25,
    });
    let attempt = 0;
    let proven = false;
    while (attempt < 40 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1000 + attempt) });
      const soldier = buildSoldier();
      const longsword = makeItemInstance('longsword');
      let campaign: Campaign = engine.createCampaign({ name: 'savage-attacker-miss' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: soldier } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummyAC } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: soldier.id,
        targetId: dummyAC.id,
        weaponInstanceId: longsword.id,
        useSavageAttacker: true,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== false) continue;
      const sa = events.find((e) => e.type === 'SavageAttackerUsed');
      expect(sa, 'on miss, SavageAttackerUsed should NOT be emitted').toBeUndefined();
      proven = true;
    }
    expect(proven, `no miss in ${attempt} seeds`).toBe(true);
  });

  it('rejects useSavageAttacker for a character without the feat', () => {
    // A Sage character does NOT auto-get savage-attacker (their origin
    // feat is magic-initiate-wizard). Featless attempt to opt in is
    // rejected with a clear message before any roll fires.
    const sage = buildSoldier({ backgroundId: 'sage' });
    const dummy = buildDummy();
    const longsword = makeItemInstance('longsword');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
    let campaign: Campaign = engine.createCampaign({ name: 'savage-attacker-reject' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sage } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.attack(campaign.state, {
        attackerId: sage.id,
        targetId: dummy.id,
        weaponInstanceId: longsword.id,
        useSavageAttacker: true,
      }),
    ).toThrow(/does not have the Savage Attacker feat/);
  });

  it('reroll picks the higher-sum set (out of two rolled sets)', () => {
    // Deterministic check: with a fixed seed that produces a hit, the
    // damageRolls on the DamageRolled event sum to >= the discarded
    // set's sum (Savage Attacker always picks the higher).
    let attempt = 0;
    let proven = false;
    while (attempt < 40 && !proven) {
      attempt += 1;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(attempt) });
      const soldier = buildSoldier();
      const dummy = buildDummy();
      const longsword = makeItemInstance('longsword');
      let campaign: Campaign = engine.createCampaign({ name: 'sa-higher-sum' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: soldier } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: soldier.id,
        targetId: dummy.id,
        weaponInstanceId: longsword.id,
        useSavageAttacker: true,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attack?.hit !== true) continue;
      const damage = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      const sa = events.find((e) => e.type === 'SavageAttackerUsed') as
        | SavageAttackerUsedEvent
        | undefined;
      expect(damage).toBeDefined();
      expect(sa).toBeDefined();
      // The weapon-dice payload is the first roll on DamageRolled (the
      // base weapon damage, before riders and extra-damage dice).
      const keptSum = damage!.rolls[0]!.rolls.reduce((s, v) => s + v, 0);
      const discardedSum = sa!.discardedRolls.reduce((s, v) => s + v, 0);
      expect(keptSum).toBeGreaterThanOrEqual(discardedSum);
      proven = true;
    }
    expect(proven, `no hit in ${attempt} seeds`).toBe(true);
  });
});
