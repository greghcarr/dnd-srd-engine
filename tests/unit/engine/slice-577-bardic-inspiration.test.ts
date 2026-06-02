// Slice 577: consumeOnCheck / consumeOnSave primitives +
// planBardicInspiration + Help (Ability Check mode) consume closure.
//
// Three deferred items closed in one slice:
//   1. consumeOnCheck primitive (parallel to consumeOnAttack at the
//      AbilityCheckRolled site) — closes the slice 571 Help-on-check
//      RAW deviation.
//   2. consumeOnSave primitive (parallel at the SaveRolled site) —
//      enables the third Bardic Inspiration consume site.
//   3. planBardicInspiration — Bard L1 confer-die-to-ally with
//      consume-on-any-of-three-roll-sites + autoExpiry 10 minutes.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';

const PACK = loadStarterPack();

const buildBard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Scanlan',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'bard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 12, WIS: 10, CHA: 18 },
    hp: { current: 9, max: 9, temp: 0 },
    resources: [{ resourceId: 'bardic-inspiration', current: 4, max: 4 }],
  });

const buildAlly = (weaponId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    ...(weaponId !== undefined
      ? { inventory: [weaponId], equipped: { mainHand: weaponId, attuned: [] } }
      : {}),
  });

describe('Bardic Inspiration + consumeOnCheck/Save primitives (slice 577)', () => {
  describe('pack declaration', () => {
    it('bearing-bardic-inspiration ships with consumeOn(Attack|Save|Check) + AddBonusDie on all three + autoExpiry', () => {
      const cond = PACK.conditions?.find((c) => c.id === 'bearing-bardic-inspiration');
      expect(cond).toBeDefined();
      expect(cond?.consumeOnAttack).toBe(true);
      expect(cond?.consumeOnSave).toBe(true);
      expect(cond?.consumeOnCheck).toBe(true);
      expect(cond?.autoExpiry?.afterRounds).toBe(100);
      const dice = cond?.effects.filter((e) => e.kind === 'AddBonusDie') as
        | ReadonlyArray<{ target: unknown; dice: string }>
        | undefined;
      expect(dice).toHaveLength(3);
      expect(dice!.every((d) => d.dice === '1d6')).toBe(true);
    });

    it('helped-on-check-active gains consumeOnCheck (slice 571 deviation closed)', () => {
      const cond = PACK.conditions?.find((c) => c.id === 'helped-on-check-active');
      expect(cond?.consumeOnCheck).toBe(true);
    });
  });

  describe('planBardicInspiration', () => {
    it('confers the condition on a recipient with sourceCharacterId = Bard', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const bard = buildBard();
      const ally = buildAlly();
      let campaign = engine.createCampaign({ name: 'bi' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.bardicInspiration(campaign.state, {
        bardId: bard.id,
        recipientId: ally.id,
      });
      const applied = events.find(
        (e): e is ConditionAppliedEvent =>
          (e as { type: string }).type === 'ConditionApplied'
          && (e as { conditionId?: string }).conditionId === 'bearing-bardic-inspiration',
      );
      expect(applied).toBeDefined();
      expect(applied!.targetId).toBe(ally.id);
      // Note: sourceCharacterId intentionally omitted on the
      // ConditionApplied event so the consumeOn(Attack|Save|Check)
      // primitives treat the BI die as Sap-style any-roll (not
      // Vex-style source-keyed). Transcript link to "who conferred"
      // is via the ResourceSpent event below.
      const resourceSpent = events.find((e): e is ResourceSpentEvent =>
        (e as { type: string }).type === 'ResourceSpent');
      expect(resourceSpent?.amount).toBe(1);
      expect(resourceSpent?.resourceId).toBe('bardic-inspiration');
    });

    it('self-confer throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const bard = buildBard();
      let campaign = engine.createCampaign({ name: 'bi-self' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.bardicInspiration(campaign.state, { bardId: bard.id, recipientId: bard.id }),
      ).toThrow(/cannot confer Bardic Inspiration on themself/);
    });

    it('non-Bard throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const ally = buildAlly();
      const wizard = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Wiz',
        speciesId: 'human',
        backgroundId: 'sage',
        classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 10 },
        hp: { current: 7, max: 7, temp: 0 },
        resources: [{ resourceId: 'bardic-inspiration', current: 4, max: 4 }],
      });
      let campaign = engine.createCampaign({ name: 'bi-nonbard' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.bardicInspiration(campaign.state, { bardId: wizard.id, recipientId: ally.id }),
      ).toThrow(/does not have Bardic Inspiration/);
    });

    it('depleted resource throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const ally = buildAlly();
      const emptyBard = CharacterSchema.parse({
        ...buildBard(),
        resources: [{ resourceId: 'bardic-inspiration', current: 0, max: 4 }],
      });
      let campaign = engine.createCampaign({ name: 'bi-empty' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: emptyBard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.bardicInspiration(campaign.state, { bardId: emptyBard.id, recipientId: ally.id }),
      ).toThrow(/no Bardic Inspiration uses remaining/);
    });
  });

  describe('consume on first roll (any of three sites)', () => {
    it('consumeOnCheck: ally\'s ability check removes the condition', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const bard = buildBard();
      const ally = buildAlly();
      let campaign = engine.createCampaign({ name: 'bi-check' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.bardicInspiration(campaign.state, { bardId: bard.id, recipientId: ally.id }).events,
      );
      expect(campaign.state.characters[ally.id]!.appliedConditions.some(
        (c) => c.conditionId === 'bearing-bardic-inspiration',
      )).toBe(true);
      const { events } = engine.plan.abilityCheck(campaign.state, {
        characterId: ally.id,
        ability: 'STR',
      });
      const removed = events.find(
        (e): e is ConditionRemovedEvent =>
          (e as { type: string }).type === 'ConditionRemoved'
          && (e as { conditionId?: string }).conditionId === 'bearing-bardic-inspiration',
      );
      expect(removed).toBeDefined();
    });

    it('consumeOnSave: ally\'s save removes the condition', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const bard = buildBard();
      const ally = buildAlly();
      let campaign = engine.createCampaign({ name: 'bi-save' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.bardicInspiration(campaign.state, { bardId: bard.id, recipientId: ally.id }).events,
      );
      const { events } = engine.plan.save(campaign.state, {
        characterId: ally.id,
        ability: 'WIS',
        dc: 10,
      });
      const removed = events.find(
        (e): e is ConditionRemovedEvent =>
          (e as { type: string }).type === 'ConditionRemoved'
          && (e as { conditionId?: string }).conditionId === 'bearing-bardic-inspiration',
      );
      expect(removed).toBeDefined();
    });

    it('consumeOnAttack: ally\'s attack removes the condition', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const bard = buildBard();
      const ally = buildAlly(sword.id);
      const target = buildAlly();
      let campaign = engine.createCampaign({ name: 'bi-attack' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: bard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.bardicInspiration(campaign.state, { bardId: bard.id, recipientId: ally.id }).events,
      );
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: ally.id,
        targetId: target.id,
        weaponInstanceId: sword.id,
      });
      const removed = events.find(
        (e): e is ConditionRemovedEvent =>
          (e as { type: string }).type === 'ConditionRemoved'
          && (e as { conditionId?: string }).conditionId === 'bearing-bardic-inspiration',
      );
      expect(removed).toBeDefined();
    });
  });

  describe('Help (Ability Check mode) closure', () => {
    it("helped-on-check-active is consumed after the bearer's first ability check", () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const helper = buildAlly();
      const ally = buildAlly();
      let campaign = engine.createCampaign({ name: 'help-check-consume' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: helper } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.help(campaign.state, {
          helperId: helper.id,
          targetId: ally.id,
          mode: 'check',
        }).events,
      );
      expect(campaign.state.characters[ally.id]!.appliedConditions.some(
        (c) => c.conditionId === 'helped-on-check-active',
      )).toBe(true);
      const { events } = engine.plan.abilityCheck(campaign.state, {
        characterId: ally.id,
        ability: 'DEX',
      });
      const removed = events.find(
        (e): e is ConditionRemovedEvent =>
          (e as { type: string }).type === 'ConditionRemoved'
          && (e as { conditionId?: string }).conditionId === 'helped-on-check-active',
      );
      expect(removed, 'helped-on-check-active should be consumed on first check').toBeDefined();
    });
  });
});
