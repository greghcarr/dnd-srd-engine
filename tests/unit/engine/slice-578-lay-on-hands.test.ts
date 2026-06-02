// Slice 578: planLayOnHands — Paladin L1 BA spend mechanic.
//
// Pre-slice the lay-on-hands resource was granted by Favored Enemy's
// sibling Paladin L1 feature wiring (`GrantResource { resourceId:
// 'lay-on-hands', max: 5 × paladin level, recharge: 'longRest' }`)
// but no planner existed to spend it. RAW PHB 2024 Lay On Hands:
//
//   "You have a pool of healing power that replenishes when you
//   finish a Long Rest. With that pool, you can restore a total
//   number of Hit Points equal to five times your Paladin level.
//
//   As a Bonus Action, you can touch a creature (which could be
//   yourself) and draw power from the pool of healing to restore
//   a number of Hit Points to that creature, up to the maximum
//   amount remaining in the pool.
//
//   You can also expend 5 Hit Points from the pool of healing
//   power to remove the Poisoned condition from the creature; those
//   points don't also restore Hit Points to the creature."

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import type { HealedEvent, ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildPaladin = (poolCurrent = 5): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pike',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: 12, max: 12, temp: 0 },
    resources: [{ resourceId: 'lay-on-hands', current: poolCurrent, max: 5 }],
  });

const buildAlly = (hpCurrent: number, hpMax: number, poisoned = false): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hpCurrent, max: hpMax, temp: 0 },
    ...(poisoned
      ? {
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'poisoned',
          appliedAt: isoTimestamp(),
        }],
      }
      : {}),
  });

describe('planLayOnHands (slice 578)', () => {
  describe('heal mode', () => {
    it('heals N HP from the pool; emits ResourceSpent + Healed', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const paladin = buildPaladin(5);
      const ally = buildAlly(3, 12);
      let campaign = engine.createCampaign({ name: 'loh-heal' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.layOnHands(campaign.state, {
        paladinId: paladin.id,
        targetId: ally.id,
        mode: 'heal',
        amount: 4,
      });
      const spent = events.find((e): e is ResourceSpentEvent =>
        (e as { type: string }).type === 'ResourceSpent');
      expect(spent?.resourceId).toBe('lay-on-hands');
      expect(spent?.amount).toBe(4);
      const healed = events.find((e): e is HealedEvent =>
        (e as { type: string }).type === 'Healed');
      expect(healed?.targetId).toBe(ally.id);
      expect(healed?.amount).toBe(4);
      campaign = commit(campaign, events);
      expect(campaign.state.characters[ally.id]!.hp.current).toBe(7);
      expect(campaign.state.characters[paladin.id]!.resources.find((r) => r.resourceId === 'lay-on-hands')!.current).toBe(1);
    });

    it('Paladin can heal themself', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const paladin = CharacterSchema.parse({
        ...buildPaladin(5),
        hp: { current: 4, max: 12, temp: 0 },
      });
      let campaign = engine.createCampaign({ name: 'loh-self' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.layOnHands(campaign.state, {
        paladinId: paladin.id,
        targetId: paladin.id,
        mode: 'heal',
        amount: 3,
      });
      campaign = commit(campaign, events);
      expect(campaign.state.characters[paladin.id]!.hp.current).toBe(7);
    });

    it('over-pool heal throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const paladin = buildPaladin(3);
      const ally = buildAlly(3, 12);
      let campaign = engine.createCampaign({ name: 'loh-over' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.layOnHands(campaign.state, {
          paladinId: paladin.id,
          targetId: ally.id,
          mode: 'heal',
          amount: 4,
        }),
      ).toThrow(/insufficient/);
    });

    it('zero-amount heal throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const paladin = buildPaladin(5);
      const ally = buildAlly(3, 12);
      let campaign = engine.createCampaign({ name: 'loh-zero' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.layOnHands(campaign.state, {
          paladinId: paladin.id,
          targetId: ally.id,
          mode: 'heal',
          amount: 0,
        }),
      ).toThrow(/amount >= 1/);
    });
  });

  describe('cure-poison mode', () => {
    it('spends 5 pool points + removes poisoned (NO Healed event)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const paladin = buildPaladin(5);
      const ally = buildAlly(10, 12, true);
      let campaign = engine.createCampaign({ name: 'loh-cure' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.layOnHands(campaign.state, {
        paladinId: paladin.id,
        targetId: ally.id,
        mode: 'cure-poison',
      });
      const spent = events.find((e): e is ResourceSpentEvent =>
        (e as { type: string }).type === 'ResourceSpent');
      expect(spent?.amount).toBe(5);
      const removed = events.find((e): e is ConditionRemovedEvent =>
        (e as { type: string }).type === 'ConditionRemoved');
      expect(removed?.conditionId).toBe('poisoned');
      const healed = events.find((e) => (e as { type: string }).type === 'Healed');
      expect(healed, 'cure-poison should NOT emit Healed (RAW)').toBeUndefined();
      campaign = commit(campaign, events);
      expect(campaign.state.characters[ally.id]!.appliedConditions.some((c) => c.conditionId === 'poisoned')).toBe(false);
      expect(campaign.state.characters[ally.id]!.hp.current).toBe(10);
    });

    it('insufficient pool throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const paladin = buildPaladin(3);
      const ally = buildAlly(10, 12, true);
      let campaign = engine.createCampaign({ name: 'loh-cure-low' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.layOnHands(campaign.state, {
          paladinId: paladin.id,
          targetId: ally.id,
          mode: 'cure-poison',
        }),
      ).toThrow(/requires 5 pool points/);
    });

    it('non-poisoned target throws (waste prevention)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const paladin = buildPaladin(5);
      const ally = buildAlly(10, 12, false);
      let campaign = engine.createCampaign({ name: 'loh-not-poisoned' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: paladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.layOnHands(campaign.state, {
          paladinId: paladin.id,
          targetId: ally.id,
          mode: 'cure-poison',
        }),
      ).toThrow(/not Poisoned/);
    });
  });

  describe('validation', () => {
    it('non-Paladin throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const fighter = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Fighter',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
        resources: [{ resourceId: 'lay-on-hands', current: 5, max: 5 }],
      });
      const ally = buildAlly(3, 12);
      let campaign = engine.createCampaign({ name: 'loh-non-paladin' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.layOnHands(campaign.state, {
          paladinId: fighter.id,
          targetId: ally.id,
          mode: 'heal',
          amount: 3,
        }),
      ).toThrow(/does not have Lay on Hands/);
    });

    it('Incapacitated Paladin cannot use Lay on Hands', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const koPaladin = CharacterSchema.parse({
        ...buildPaladin(5),
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'incapacitated',
          appliedAt: isoTimestamp(),
        }],
      });
      const ally = buildAlly(3, 12);
      let campaign = engine.createCampaign({ name: 'loh-incap' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: koPaladin } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.layOnHands(campaign.state, {
          paladinId: koPaladin.id,
          targetId: ally.id,
          mode: 'heal',
          amount: 3,
        }),
      ).toThrow(/Lay on Hands/i);
    });
  });
});
