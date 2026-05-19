// Slice 284 — Oil of Sharpness + Poison Basic via new ApplyItemBuff
// ConsumeAction variant.
//
// RAW Oil of Sharpness: "For 1 hour, the coated item is magical and
// has a +3 bonus to attack and damage rolls."
// RAW Poison Basic: "A coated weapon or ammunition deals an extra
// 1d4 Poison damage when it hits a creature."
//
// Both wire via the same new variant: stamps `temporaryBuff` on a
// target weapon via the slice-76 shape. The attack planner picks up
// the buff automatically (attack-bonus + damage-bonus on the
// breakdown; extra dice on hit; magical = true for resistance
// bypass via slice 112's isMagicWeaponAttack).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemBuffAppliedEvent } from '../../../src/schemas/events/inventory.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildHero = (longswordId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    inventory: [longswordId],
    equipped: { mainHand: longswordId, attuned: [] },
  });

describe('slice 284: ApplyItemBuff ConsumeAction variant + Oil of Sharpness + Poison Basic', () => {
  describe('Oil of Sharpness', () => {
    it('drinking Oil of Sharpness stamps +3/+3 temporaryBuff on the equipped main-hand weapon', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(284) });
      const longsword = makeItemInstance('longsword');
      const oil = makeItemInstance('oil-of-sharpness');
      const baseHero = buildHero(longsword.id);
      const hero: Character = { ...baseHero, inventory: [longsword.id, oil.id] };
      let campaign: Campaign = engine.createCampaign({ name: 'oil-sharpness' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: oil },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.consumeItem(campaign.state, {
        characterId: hero.id,
        instanceId: oil.id,
      });
      const buff = events.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
      expect(buff).toBeDefined();
      expect(buff!.instanceId).toBe(longsword.id);
      expect(buff!.attackBonus).toBe(3);
      expect(buff!.damageBonus).toBe(3);
      expect(buff!.extraDamageDice).toBeUndefined();
      expect(buff!.source).toBe('item:oil-of-sharpness');
    });

    it('after applying, the weapon carries the temporaryBuff and the oil is consumed', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(284) });
      const longsword = makeItemInstance('longsword');
      const oil = makeItemInstance('oil-of-sharpness');
      const baseHero = buildHero(longsword.id);
      const hero: Character = { ...baseHero, inventory: [longsword.id, oil.id] };
      let campaign: Campaign = engine.createCampaign({ name: 'oil-state' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: oil },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.consumeItem(campaign.state, {
          characterId: hero.id,
          instanceId: oil.id,
        }).events,
      );
      const buff = campaign.state.itemInstances[longsword.id]!.temporaryBuff;
      expect(buff).toBeDefined();
      expect(buff!.attackBonus).toBe(3);
      expect(buff!.damageBonus).toBe(3);
      expect(campaign.state.itemInstances[oil.id]).toBeUndefined();
    });

    it('explicit targetWeaponInstanceId overrides equipped main hand', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(284) });
      const longsword = makeItemInstance('longsword');
      const dagger = makeItemInstance('dagger');
      const oil = makeItemInstance('oil-of-sharpness');
      const baseHero = buildHero(longsword.id);
      const hero: Character = {
        ...baseHero,
        inventory: [longsword.id, dagger.id, oil.id],
      };
      let campaign: Campaign = engine.createCampaign({ name: 'oil-target-override' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: oil },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.consumeItem(campaign.state, {
          characterId: hero.id,
          instanceId: oil.id,
          targetWeaponInstanceId: dagger.id,
        }).events,
      );
      // Dagger got the buff; longsword did not.
      expect(campaign.state.itemInstances[dagger.id]!.temporaryBuff).toBeDefined();
      expect(campaign.state.itemInstances[longsword.id]!.temporaryBuff).toBeUndefined();
    });
  });

  describe('Poison Basic', () => {
    it('applying Poison Basic stamps a 1d4 poison extra-damage rider on the equipped main-hand weapon', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(284) });
      const longsword = makeItemInstance('longsword');
      const poison = makeItemInstance('poison-basic');
      const baseHero = buildHero(longsword.id);
      const hero: Character = { ...baseHero, inventory: [longsword.id, poison.id] };
      let campaign: Campaign = engine.createCampaign({ name: 'poison-basic' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: poison },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.consumeItem(campaign.state, {
        characterId: hero.id,
        instanceId: poison.id,
      });
      const buff = events.find((e) => e.type === 'ItemBuffApplied') as ItemBuffAppliedEvent | undefined;
      expect(buff).toBeDefined();
      expect(buff!.instanceId).toBe(longsword.id);
      expect(buff!.attackBonus).toBe(0);
      expect(buff!.damageBonus).toBe(0);
      expect(buff!.extraDamageDice).toBe('1d4');
      expect(buff!.extraDamageType).toBe('poison');
      expect(buff!.source).toBe('item:poison-basic');
    });
  });

  describe('error paths', () => {
    it('throws when no target weapon is specified and the actor has no main-hand', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(284) });
      const oil = makeItemInstance('oil-of-sharpness');
      const noWeapon = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Empty Hands',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
        inventory: [oil.id],
      });
      let campaign: Campaign = engine.createCampaign({ name: 'oil-no-weapon' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: oil },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: noWeapon } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.consumeItem(campaign.state, {
          characterId: noWeapon.id,
          instanceId: oil.id,
        }),
      ).toThrow(/no target weapon/);
    });

    it('throws when the target instance is not a weapon', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(284) });
      const longsword = makeItemInstance('longsword');
      const oil = makeItemInstance('oil-of-sharpness');
      // Use the oil itself as the (invalid) target weapon.
      const baseHero = buildHero(longsword.id);
      const hero: Character = { ...baseHero, inventory: [longsword.id, oil.id] };
      let campaign: Campaign = engine.createCampaign({ name: 'oil-bad-target' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: oil },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.consumeItem(campaign.state, {
          characterId: hero.id,
          instanceId: oil.id,
          targetWeaponInstanceId: oil.id,
        }),
      ).toThrow(/not a weapon/);
    });
  });
});
