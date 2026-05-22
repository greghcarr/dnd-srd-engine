// Slice 122 — Armor of Agathys.
//
// Two pieces shipped together:
//   1. New `gt` / `gte` numeric-comparison predicates (schema +
//      evaluator) so OnEvent filters can compare facts against
//      numeric thresholds.
//   2. New `bearer.tempHp` fact populated by the trigger dispatcher
//      so retaliation riders can gate on "while temp HP > 0."
//
// Canonical user: Armor of Agathys (L1 Warlock). Cast emits a
// TempHPGranted event for 5 + 5/slot temp HP plus a ConditionApplied
// for `armor-of-agathys-active`. The condition carries an OnEvent
// rider that fires on any hit against the bearer while their temp
// HP is above 0, emitting 5 cold damage on the attacker via
// AddDamageToAttacker.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { loadPhbExtrasPack } from '../../../src/content/packs/extras.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionAppliedEvent,
  DamageAppliedEvent,
  TempHPGrantedEvent,
} from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildWarlock = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hexer',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: 24, max: 24, temp: 0 },
    featsTaken: [],
    knownSpells: ['armor-of-agathys'],
  });

const buildAttacker = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 11, max: 11, temp: 0 },
    featsTaken: [],
    inventory: [weaponId],
    equipped: { mainHand: weaponId, attuned: [] },
  });

describe('Armor of Agathys', () => {
  it('cast at slot 2 (warlock L3 pact slot) grants 10 temp HP + applies the buff condition', () => {
    // 5 base + 5 per slot above 1 → 10 temp HP at slot 2. Warlocks
    // only have access to their highest pact-slot level, so L3
    // warlock can only cast at slot 2.
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(1) });
    const warlock = buildWarlock();
    let campaign: Campaign = engine.createCampaign({ name: 'aoa-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
    ]);
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: warlock.id,
      spellId: 'armor-of-agathys',
      slotLevel: 2,
      targetIds: [warlock.id],
    }).events;
    const temp = castEvents.find(
      (e): e is TempHPGrantedEvent => e.type === 'TempHPGranted',
    );
    expect(temp).toBeDefined();
    expect(temp!.amount).toBe(10);
    const applied = castEvents.find(
      (e): e is ConditionAppliedEvent =>
        e.type === 'ConditionApplied' && e.conditionId === 'armor-of-agathys-active',
    );
    expect(applied).toBeDefined();
  });

  it("an attacker hitting the warded warlock takes 5 cold retaliation while temp HP > 0", () => {
    // Seed the warded condition + manual temp HP so the test doesn't
    // depend on rolling a hit through a cast first. Then have a goblin
    // attack the warlock; the rider should emit a DamageApplied of
    // type 'cold' targeting the attacker.
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const warlock = buildWarlock();
      const attacker = buildAttacker(longsword.id);
      let campaign: Campaign = engine.createCampaign({ name: `aoa-retal-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      ]);
      const seedTempHp: TempHPGrantedEvent = {
        id: eventId(),
        at: isoTimestamp(),
        type: 'TempHPGranted',
        targetId: warlock.id,
        amount: 5,
        source: 'armor-of-agathys',
      };
      const seedWard: ConditionAppliedEvent = {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ConditionApplied',
        targetId: warlock.id,
        conditionId: 'armor-of-agathys-active',
        appliedConditionId: newAppliedConditionId(),
      };
      campaign = commit(campaign, [seedTempHp, seedWard]);

      const attackEvents = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: warlock.id,
        weaponInstanceId: longsword.id,
      }).events;
      const rolled = attackEvents.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== true) continue;
      // Retaliation damage targets the attacker, not the warlock.
      const retaliation = attackEvents.find(
        (e): e is DamageAppliedEvent =>
          e.type === 'DamageApplied'
          && e.targetId === attacker.id
          && e.components.some((c) => c.type === 'cold'),
      );
      expect(retaliation).toBeDefined();
      const cold = retaliation!.components.find((c) => c.type === 'cold');
      // The rider rolls "5" — parsed as a flat 5. The cold component
      // amount should be 5 (unless the goblin has cold resistance,
      // which it doesn't).
      expect(cold!.amount).toBe(5);
      return;
    }
    throw new Error('no hit landed in 80 seeds for AoA retaliation test');
  });

  it('does NOT retaliate when temp HP is 0', () => {
    // Same scene but no temp HP seeded. The OnEvent rider's gate
    // `bearer.tempHp > 0` evaluates false → no rider damage.
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const warlock = buildWarlock();
      const attacker = buildAttacker(longsword.id);
      let campaign: Campaign = engine.createCampaign({ name: `aoa-zero-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      ]);
      // Ward applied, but no temp HP (bearer.tempHp = 0).
      const seedWard: ConditionAppliedEvent = {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ConditionApplied',
        targetId: warlock.id,
        conditionId: 'armor-of-agathys-active',
        appliedConditionId: newAppliedConditionId(),
      };
      campaign = commit(campaign, [seedWard]);
      const attackEvents = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: warlock.id,
        weaponInstanceId: longsword.id,
      }).events;
      const rolled = attackEvents.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== true) continue;
      const retaliation = attackEvents.find(
        (e): e is DamageAppliedEvent =>
          e.type === 'DamageApplied'
          && e.targetId === attacker.id
          && e.components.some((c) => c.type === 'cold'),
      );
      expect(retaliation).toBeUndefined();
      return;
    }
    throw new Error('no hit landed in 80 seeds for AoA zero-temp-HP test');
  });

  it('does NOT retaliate against a ranged hit (slice 123)', () => {
    // Ward + temp HP both present, but the attacker wields a shortbow.
    // The slice-123 `event.attackKind === melee` filter clause should
    // suppress the rider on every hit.
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(seed) });
      const bow = makeItemInstance('shortbow');
      const warlock = buildWarlock();
      const attacker = buildAttacker(bow.id);
      let campaign: Campaign = engine.createCampaign({ name: `aoa-ranged-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      ]);
      const seedTempHp: TempHPGrantedEvent = {
        id: eventId(),
        at: isoTimestamp(),
        type: 'TempHPGranted',
        targetId: warlock.id,
        amount: 5,
        source: 'armor-of-agathys',
      };
      const seedWard: ConditionAppliedEvent = {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ConditionApplied',
        targetId: warlock.id,
        conditionId: 'armor-of-agathys-active',
        appliedConditionId: newAppliedConditionId(),
      };
      campaign = commit(campaign, [seedTempHp, seedWard]);

      const attackEvents = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: warlock.id,
        weaponInstanceId: bow.id,
      }).events;
      const rolled = attackEvents.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== true) continue;
      const retaliation = attackEvents.find(
        (e): e is DamageAppliedEvent =>
          e.type === 'DamageApplied'
          && e.targetId === attacker.id
          && e.components.some((c) => c.type === 'cold'),
      );
      expect(retaliation).toBeUndefined();
      return;
    }
    throw new Error('no ranged hit landed in 80 seeds for AoA ranged test');
  });
});
