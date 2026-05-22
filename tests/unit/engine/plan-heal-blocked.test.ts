import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId, newAppliedConditionId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { HealedEvent, ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, loadPhbExtrasTestPack } from '../../fixtures/index.js';

// Slice 98 — heal-blocking primitive.
//
// 1. A target with `healing-blocked-active` (or any condition carrying
//    BlockHealing) receives Healed events with amount=0; the reducer's
//    amount<=0 short-circuit keeps HP unchanged.
// 2. The Healed event still fires (audit trail) with a "(blocked)"
//    annotation in `source`.
// 3. Spirit Shroud's hit rider applies `healing-blocked-active` to
//    the damaged target via the new ApplyCondition TriggerAction
//    dispatch path. Duration is consumer-managed (no auto-expiry).

const PACK = loadStarterPack();

const longsword = (): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Healer',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 35, max: 35, temp: 0 },
    featsTaken: [],
    preparedSpells: ['cure-wounds', 'spirit-shroud'],
  });

const buildWoundedAlly = (sword?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wounded',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 40, temp: 0 },
    featsTaken: [],
    ...(sword !== undefined
      ? { inventory: [sword], equipped: { mainHand: sword, attuned: [] } }
      : {}),
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 16, WIS: 14, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
  });

describe('healing-block primitive', () => {
  it('cure-wounds on a blocked target emits Healed with amount=0 and blocked annotation', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(1) });
    const cleric = buildCleric();
    const ally = buildWoundedAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'heal-blocked' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    // Seed the heal-block condition directly so we exercise the
    // primitive without depending on Spirit Shroud's hit chain.
    const seedEvent: ConditionAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: ally.id,
      conditionId: 'healing-blocked-active',
      appliedConditionId: newAppliedConditionId(),
    };
    campaign = commit(campaign, [seedEvent]);
    const hpBefore = campaign.state.characters[ally.id]!.hp.current;

    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id,
      spellId: 'cure-wounds',
      slotLevel: 1,
      targetIds: [ally.id],
    }).events;
    const heal = castEvents.find(
      (e): e is HealedEvent =>
        e.type === 'Healed' && (e as HealedEvent).targetId === ally.id,
    );
    expect(heal).toBeDefined();
    expect(heal!.amount).toBe(0);
    expect(heal!.source).toBe('cure-wounds (blocked)');

    campaign = commit(campaign, castEvents);
    expect(campaign.state.characters[ally.id]!.hp.current).toBe(hpBefore);
  });

  it('cure-wounds on an unblocked target heals normally', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(2) });
    const cleric = buildCleric();
    const ally = buildWoundedAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'heal-normal' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    const castEvents = engine.plan.castSpell(campaign.state, {
      characterId: cleric.id,
      spellId: 'cure-wounds',
      slotLevel: 1,
      targetIds: [ally.id],
    }).events;
    const heal = castEvents.find(
      (e): e is HealedEvent =>
        e.type === 'Healed' && (e as HealedEvent).targetId === ally.id,
    );
    expect(heal).toBeDefined();
    expect(heal!.amount).toBeGreaterThan(0);
    expect(heal!.source).toBe('cure-wounds');
  });
});

describe('Spirit Shroud applies healing-blocked-active on hit', () => {
  it('emits ConditionApplied(healing-blocked-active) targeting the hit creature', () => {
    // Seed a scene where the warrior (with Spirit Shroud cold active)
    // attacks a target with a longsword. Walk seeds until we get a hit.
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const sword = longsword();
      const warrior = buildWoundedAlly(sword.id);
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `shroud-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warrior } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      // Seed spirit-shroud-cold-active directly on warrior (skip the
      // cast pipeline so the test stays focused on the rider).
      const seedShroud: ConditionAppliedEvent = {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ConditionApplied',
        targetId: warrior.id,
        conditionId: 'spirit-shroud-cold-active',
        appliedConditionId: newAppliedConditionId(),
        sourceCharacterId: warrior.id,
      };
      campaign = commit(campaign, [seedShroud]);

      const attackEvents = engine.plan.attack(campaign.state, {
        attackerId: warrior.id,
        targetId: target.id,
        weaponInstanceId: sword.id,
      }).events;
      const rolled = attackEvents.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (!rolled?.hit) continue;
      const applied = attackEvents.find(
        (e): e is ConditionAppliedEvent =>
          e.type === 'ConditionApplied'
          && (e as ConditionAppliedEvent).conditionId === 'healing-blocked-active',
      );
      expect(applied).toBeDefined();
      expect(applied!.targetId).toBe(target.id);
      expect(applied!.sourceCharacterId).toBe(warrior.id);
      return;
    }
    throw new Error('no seed produced a hit for Spirit Shroud rider test');
  });
});
