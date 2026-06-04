// Slice 571: planHelp. RAW PHB 2024 ch.7 Help action — both modes
// (Attack distracts a foe; Ability Check momentarily helps an ally).

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
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { AbilityCheckRolledEvent } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

const buildHumanFighter = (name: string, weaponInstanceId?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    ...(weaponInstanceId !== undefined
      ? { inventory: [weaponInstanceId], equipped: { mainHand: weaponInstanceId, attuned: [] } }
      : {}),
  });

const findCondApplied = (events: ReadonlyArray<unknown>, conditionId: string) =>
  events.find((e): e is ConditionAppliedEvent =>
    (e as { type: string }).type === 'ConditionApplied'
    && (e as { conditionId?: string }).conditionId === conditionId);

describe('planHelp (slice 571)', () => {
  describe('pack declaration', () => {
    it('helped-against-active condition ships with GrantAdvantageToAttackers + consumeOnIncomingAttack + autoExpiry turnEnd', () => {
      const cond = PACK.conditions?.find((c) => c.id === 'helped-against-active');
      expect(cond).toBeDefined();
      expect(cond?.consumeOnIncomingAttack).toBe(true);
      expect(cond?.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnEnd' });
      expect(cond?.effects.some((e) => e.kind === 'GrantAdvantageToAttackers')).toBe(true);
    });

    it('helped-on-check-active condition ships with SetAdvantage on check + autoExpiry', () => {
      const cond = PACK.conditions?.find((c) => c.id === 'helped-on-check-active');
      expect(cond).toBeDefined();
      expect(cond?.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnEnd' });
      const setAdv = cond?.effects.find((e) => e.kind === 'SetAdvantage') as
        | { on: { kind: string }; mode: string }
        | undefined;
      expect(setAdv?.on?.kind).toBe('check');
      expect(setAdv?.mode).toBe('advantage');
    });
  });

  describe('Help (Attack mode)', () => {
    it('applies helped-against-active to the foe with sourceCharacterId = helper', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const helper = buildHumanFighter('Helper');
      const foe = buildHumanFighter('Foe');
      let campaign = engine.createCampaign({ name: 'help-attack' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: helper } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foe } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.help(campaign.state, {
        helperId: helper.id,
        targetId: foe.id,
        mode: 'attack',
      });
      const applied = findCondApplied(events, 'helped-against-active');
      expect(applied).toBeDefined();
      expect(applied!.targetId).toBe(foe.id);
      expect(applied!.sourceCharacterId).toBe(helper.id);
    });

    it("ally attacking the helped-against foe rolls with Advantage; second attack does not", () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const helperSword = makeItemInstance('longsword');
      const allySword = makeItemInstance('longsword');
      const helper = buildHumanFighter('Helper', helperSword.id);
      const ally = buildHumanFighter('Ally', allySword.id);
      const foe = buildHumanFighter('Foe');
      let campaign = engine.createCampaign({ name: 'help-attack-flow' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: helperSword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: allySword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: helper } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: foe } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.help(campaign.state, { helperId: helper.id, targetId: foe.id, mode: 'attack' }).events,
      );
      const first = engine.plan.attack(campaign.state, {
        attackerId: ally.id,
        targetId: foe.id,
        weaponInstanceId: allySword.id,
      });
      const firstAttack = first.events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      expect(firstAttack?.used).toBe('advantage');
      campaign = commit(campaign, first.events);
      // Condition should have been consumed by the first incoming attack.
      const foeAfter = campaign.state.characters[foe.id]!;
      expect(foeAfter.appliedConditions.some((c) => c.conditionId === 'helped-against-active')).toBe(false);
      // Second attack: no longer advantage.
      const second = engine.plan.attack(campaign.state, {
        attackerId: ally.id,
        targetId: foe.id,
        weaponInstanceId: allySword.id,
      });
      const secondAttack = second.events.find((e): e is AttackRolledEvent =>
        (e as { type: string }).type === 'AttackRolled');
      expect(secondAttack?.used).toBe('none');
    });
  });

  describe('Help (Ability Check mode)', () => {
    it('applies helped-on-check-active to the ally', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const helper = buildHumanFighter('Helper');
      const ally = buildHumanFighter('Ally');
      let campaign = engine.createCampaign({ name: 'help-check' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: helper } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.help(campaign.state, {
        helperId: helper.id,
        targetId: ally.id,
        mode: 'check',
      });
      const applied = findCondApplied(events, 'helped-on-check-active');
      expect(applied).toBeDefined();
      expect(applied!.targetId).toBe(ally.id);
    });

    it("ally with helped-on-check-active rolls an ability check with Advantage", () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const helper = buildHumanFighter('Helper');
      const ally = buildHumanFighter('Ally');
      let campaign = engine.createCampaign({ name: 'help-check-flow' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: helper } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.help(campaign.state, { helperId: helper.id, targetId: ally.id, mode: 'check' }).events,
      );
      const { events } = engine.plan.abilityCheck(campaign.state, {
        characterId: ally.id,
        ability: 'STR',
      });
      const checkEvent = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(checkEvent?.used).toBe('advantage');
    });
  });

  describe('validation', () => {
    it('helping yourself throws', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const helper = buildHumanFighter('Helper');
      let campaign = engine.createCampaign({ name: 'help-self' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: helper } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.help(campaign.state, { helperId: helper.id, targetId: helper.id, mode: 'attack' }),
      ).toThrow(/cannot Help themself/i);
    });

    it('an Incapacitated helper cannot Help', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const incapacitatedHelper = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'KO Helper',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 10, max: 10, temp: 0 },
        appliedConditions: [{
          id: 'aaaaaaaaaaaaaaaaaaaaaaaaaa' as never,
          conditionId: 'incapacitated',
          appliedAt: isoTimestamp(),
        }],
      });
      const ally = buildHumanFighter('Ally');
      let campaign = engine.createCampaign({ name: 'help-incap' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: incapacitatedHelper } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.help(campaign.state, { helperId: incapacitatedHelper.id, targetId: ally.id, mode: 'check' }),
      ).toThrow(/Help/i);
    });
  });
});
