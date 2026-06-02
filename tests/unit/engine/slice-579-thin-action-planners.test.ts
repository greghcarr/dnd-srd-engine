// Slice 579: four thin action planners — Search / Study / Influence /
// Utilize. Each consumes the Action and emits an AbilityCheckRolled
// via the shared planActionCheck helper. RAW PHB 2024 ch.7 Actions
// lists each as a discrete action; the consumer can now invoke them
// by name instead of remembering to bundle ActionEconomyConsumed +
// AbilityCheckRolled manually.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type { AbilityCheckRolledEvent } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

const buildFighter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aria',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 14, CON: 12, INT: 12, WIS: 14, CHA: 12 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const setupSoloEncounter = (engine: ReturnType<typeof createEngine>, character: Character) => {
  let campaign = engine.createCampaign({ name: 'thin-actions' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, {
    combatantIds: [character.id],
    name: 'solo',
  });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return { campaign, encounterId: enc.encounterId };
};

describe('Thin action planners (slice 579)', () => {
  describe('planSearch', () => {
    it('emits ActionEconomyConsumed(action) + AbilityCheckRolled(WIS, perception default)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.search(campaign.state, {
        characterId: aria.id,
        dc: 12,
      });
      const econ = events.find((e): e is ActionEconomyConsumedEvent =>
        (e as { type: string }).type === 'ActionEconomyConsumed');
      expect(econ?.kind).toBe('action');
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.ability).toBe('WIS');
      expect(check?.skill).toBe('perception');
      expect(check?.dc).toBe(12);
    });

    it('accepts a consumer-supplied skill (RAW: Insight / Medicine / Perception / Survival)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.search(campaign.state, {
        characterId: aria.id,
        skill: 'survival',
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.skill).toBe('survival');
    });
  });

  describe('planStudy', () => {
    it('emits ActionEconomyConsumed(action) + AbilityCheckRolled(INT, investigation default)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.study(campaign.state, {
        characterId: aria.id,
        dc: 15,
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.ability).toBe('INT');
      expect(check?.skill).toBe('investigation');
      expect(check?.dc).toBe(15);
    });

    it('accepts an Arcana / History / Nature / Religion alternative', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.study(campaign.state, {
        characterId: aria.id,
        skill: 'arcana',
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.skill).toBe('arcana');
    });
  });

  describe('planInfluence', () => {
    it('emits ActionEconomyConsumed(action) + AbilityCheckRolled(CHA, persuasion default)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.influence(campaign.state, {
        characterId: aria.id,
        dc: 13,
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.ability).toBe('CHA');
      expect(check?.skill).toBe('persuasion');
    });

    it('accepts an Intimidation / Deception / Animal Handling / Performance alternative', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.influence(campaign.state, {
        characterId: aria.id,
        skill: 'intimidation',
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.skill).toBe('intimidation');
    });
  });

  describe('planUtilize', () => {
    it('emits ActionEconomyConsumed(action) + AbilityCheckRolled(STR default)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.utilize(campaign.state, {
        characterId: aria.id,
        dc: 10,
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.ability).toBe('STR');
    });

    it('accepts a DEX or INT ability for object-specific checks', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      const { campaign } = setupSoloEncounter(engine, aria);
      const { events } = engine.plan.utilize(campaign.state, {
        characterId: aria.id,
        ability: 'DEX',
        dc: 12,
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check?.ability).toBe('DEX');
    });
  });

  describe('shared validation', () => {
    it('double-Action throws on the second action planner call', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      let { campaign } = setupSoloEncounter(engine, aria);
      campaign = commit(
        campaign,
        engine.plan.search(campaign.state, { characterId: aria.id }).events,
      );
      expect(() =>
        engine.plan.study(campaign.state, { characterId: aria.id }),
      ).toThrow(/already used their action/);
    });

    it('Incapacitated combatant cannot use thin action planners', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = CharacterSchema.parse({
        ...buildFighter(),
        appliedConditions: [{
          id: 'aaaaaaaaaaaaaaaaaaaaaaaaaa' as never,
          conditionId: 'incapacitated',
          appliedAt: isoTimestamp(),
        }],
      });
      const { campaign } = setupSoloEncounter(engine, aria);
      expect(() =>
        engine.plan.influence(campaign.state, { characterId: aria.id }),
      ).toThrow();
    });

    it('out-of-encounter use bypasses the action-economy event (returns just the check)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const aria = buildFighter();
      let campaign = engine.createCampaign({ name: 'oop' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: aria } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.search(campaign.state, {
        characterId: aria.id,
      });
      expect(events.some((e) => (e as { type: string }).type === 'ActionEconomyConsumed')).toBe(false);
      expect(events.some((e) => (e as { type: string }).type === 'AbilityCheckRolled')).toBe(true);
    });
  });
});
