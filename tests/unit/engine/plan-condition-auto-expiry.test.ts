import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { eventId, isoTimestamp, loadPhbExtrasTestPack } from '../../fixtures/index.js';

// Slice 102 — auto-expiry for trigger-applied conditions.
//
// Slice 98 stamped `durationRounds` metadata on ApplyCondition trigger
// actions (Spirit Shroud's heal-block rider) but never converted it to
// state the engine could expire. This slice closes that loop:
//
// 1. fireApplyCondition (inside an active encounter) stamps
//    `expiresOnRound = currentRound + durationRounds` on the emitted
//    ConditionApplied. Outside an encounter the field stays undefined
//    (consumer-managed, as before).
// 2. planAdvanceTurn, when the next combatant becomes active, walks
//    every character's appliedConditions and emits ConditionRemoved
//    for any whose `sourceCharacterId` is the new active combatant
//    and whose `expiresOnRound` is <= the new round.

const PACK = loadStarterPack();

const longsword = (): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });

const buildWarrior = (sword?: string, name = 'Warrior'): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
    ...(sword !== undefined
      ? { inventory: [sword], equipped: { mainHand: sword, attuned: [] } }
      : {}),
  });

const buildTarget = (name = 'Target'): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 16, WIS: 14, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
  });

describe('fireApplyCondition stamps expiresOnRound when inside an active encounter', () => {
  it('Spirit Shroud hit inside an encounter sets expiresOnRound = currentRound + 1', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const sword = longsword();
      const warrior = buildWarrior(sword.id);
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `shroud-expiry-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warrior } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
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

      // Spin up the encounter so dispatch has a currentRound to stamp.
      const created = engine.plan.createEncounter(campaign.state, {
        combatantIds: [warrior.id, target.id],
      });
      campaign = commit(campaign, created.events);
      campaign = commit(
        campaign,
        engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events,
      );
      campaign = commit(
        campaign,
        engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events,
      );
      campaign = commit(
        campaign,
        engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events,
      );
      const startRound = campaign.state.encounters[created.encounterId]!.round;

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
      expect(applied!.expiresOnRound).toBe(startRound + 1);
      return;
    }
    throw new Error('no seed produced a hit for Spirit Shroud auto-expiry test');
  });

  it('Spirit Shroud hit outside an active encounter leaves expiresOnRound undefined', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const sword = longsword();
      const warrior = buildWarrior(sword.id);
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `shroud-no-encounter-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warrior } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConditionApplied',
          targetId: warrior.id,
          conditionId: 'spirit-shroud-cold-active',
          appliedConditionId: newAppliedConditionId(),
          sourceCharacterId: warrior.id,
        } satisfies ConditionAppliedEvent,
      ]);
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
      expect(applied!.expiresOnRound).toBeUndefined();
      return;
    }
    throw new Error('no seed produced a hit for Spirit Shroud no-encounter test');
  });
});

describe('planAdvanceTurn auto-expires conditions at the start of the source character turn', () => {
  // Common setup: two warriors in an encounter; seed a condition on B
  // whose source is A and whose expiresOnRound equals the encounter's
  // starting round + 1.
  const seedScene = () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(7) });
    const a = buildWarrior(undefined, 'A');
    const b = buildWarrior(undefined, 'B');
    let campaign: Campaign = engine.createCampaign({ name: 'auto-expire' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
    ]);
    const created = engine.plan.createEncounter(campaign.state, {
      combatantIds: [a.id, b.id],
    });
    campaign = commit(campaign, created.events);
    campaign = commit(
      campaign,
      engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events,
    );
    campaign = commit(
      campaign,
      engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events,
    );
    const round = campaign.state.encounters[created.encounterId]!.round;
    const seed: ConditionAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ConditionApplied',
      targetId: b.id,
      conditionId: 'healing-blocked-active',
      appliedConditionId: newAppliedConditionId(),
      sourceCharacterId: a.id,
      expiresOnRound: round + 1,
    };
    campaign = commit(campaign, [seed]);
    return { engine, campaign, encounterId: created.encounterId, aId: a.id, bId: b.id };
  };

  it('emits ConditionRemoved when the source character becomes the active combatant on the expiry round', () => {
    const { engine, campaign, encounterId, aId, bId } = seedScene();
    // The encounter started with whichever combatant has the higher
    // initiative roll. Walk turns until A is up again on the next
    // round and assert the heal-block on B lifts.
    let c = campaign;
    let removed: ConditionRemovedEvent | undefined;
    for (let step = 0; step < 6 && removed === undefined; step += 1) {
      const events = engine.plan.advanceTurn(c.state, { encounterId }).events;
      removed = events.find(
        (e): e is ConditionRemovedEvent =>
          e.type === 'ConditionRemoved'
          && (e as ConditionRemovedEvent).targetId === bId
          && (e as ConditionRemovedEvent).conditionId === 'healing-blocked-active',
      );
      c = commit(c, events);
    }
    expect(removed).toBeDefined();
    // After the removal, B's appliedConditions no longer carries the
    // heal-block.
    expect(
      c.state.characters[bId]!.appliedConditions.find(
        (a) => a.conditionId === 'healing-blocked-active',
      ),
    ).toBeUndefined();
    // No removal on A (A had no heal-block).
    expect(aId in c.state.characters).toBe(true);
  });

  it('does not emit ConditionRemoved on within-round turn advances before the expiry round', () => {
    // The first advanceTurn within a round bumps activeIndex but
    // doesn't bump encounter.round — so expiresOnRound (= startRound
    // + 1) hasn't been reached regardless of which combatant takes
    // the next turn. Removal fires only at the round wrap, on the
    // source's turn.
    const { engine, campaign, encounterId, bId } = seedScene();
    const eventsTurn1 = engine.plan.advanceTurn(campaign.state, { encounterId }).events;
    const removed = eventsTurn1.find(
      (e): e is ConditionRemovedEvent =>
        e.type === 'ConditionRemoved'
        && (e as ConditionRemovedEvent).targetId === bId,
    );
    expect(removed).toBeUndefined();
  });
});
