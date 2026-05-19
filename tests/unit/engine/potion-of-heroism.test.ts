// Slice 282 — Potion of Heroism + new GrantTempHP ConsumeAction
// variant.
//
// RAW: "For 1 hour, the drinker gains 10 Temporary Hit Points and
// the Blessed condition." Pre-282 Potion of Heroism shipped with
// `onConsume: []` — the engine had no shape for "flat temp HP grant
// on consume." This slice adds a new `GrantTempHP { amount }`
// variant to the slice-235 ConsumeAction union, populated by
// planConsumeItem to emit a TempHPGranted event. The existing
// slice-236 ApplyCondition variant covers the Blessed half. The
// 1-hour duration is consumer-managed per the ConsumeAction doc
// comment.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionAppliedEvent,
  TempHPGrantedEvent,
} from '../../../src/schemas/events/combat.js';
import type { ItemConsumedEvent } from '../../../src/schemas/events/inventory.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildHero = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
  });

describe('slice 282: Potion of Heroism + GrantTempHP ConsumeAction variant', () => {
  it('drinking Potion of Heroism emits TempHPGranted (10) + ConditionApplied (blessed) + ItemConsumed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(282) });
    const potion = makeItemInstance('potion-of-heroism');
    const baseHero = buildHero();
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'heroism' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, {
      characterId: hero.id,
      instanceId: potion.id,
    });
    const tempHP = events.find((e) => e.type === 'TempHPGranted') as TempHPGrantedEvent | undefined;
    const condApplied = events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'blessed',
    ) as ConditionAppliedEvent | undefined;
    const consumed = events.find((e) => e.type === 'ItemConsumed') as ItemConsumedEvent | undefined;
    expect(tempHP).toBeDefined();
    expect(tempHP!.amount).toBe(10);
    expect(tempHP!.targetId).toBe(hero.id);
    expect(tempHP!.source).toBe('item:potion-of-heroism');
    expect(condApplied).toBeDefined();
    expect(condApplied!.targetId).toBe(hero.id);
    expect(condApplied!.sourceCharacterId).toBe(hero.id);
    expect(consumed).toBeDefined();
    expect(consumed!.instanceId).toBe(potion.id);
  });

  it('after consuming, the potion is removed from inventory + state.itemInstances', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(282) });
    const potion = makeItemInstance('potion-of-heroism');
    const baseHero = buildHero();
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'heroism-retire' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(
      campaign,
      engine.plan.consumeItem(campaign.state, {
        characterId: hero.id,
        instanceId: potion.id,
      }).events,
    );
    expect(campaign.state.itemInstances[potion.id]).toBeUndefined();
    expect(campaign.state.characters[hero.id]!.inventory).not.toContain(potion.id);
  });

  it('after consuming, the drinker carries 10 temp HP and the blessed condition', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(282) });
    const potion = makeItemInstance('potion-of-heroism');
    const baseHero = buildHero();
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'heroism-state' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(
      campaign,
      engine.plan.consumeItem(campaign.state, {
        characterId: hero.id,
        instanceId: potion.id,
      }).events,
    );
    const after = campaign.state.characters[hero.id]!;
    expect(after.hp.temp).toBe(10);
    expect(after.appliedConditions.some((c) => c.conditionId === 'blessed')).toBe(true);
  });

  it('feeding a Potion of Heroism to an ally grants the ally 10 temp HP + blessed (targetId override)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(282) });
    const potion = makeItemInstance('potion-of-heroism');
    const drinker = buildHero();
    const recipient = buildHero();
    const hero: Character = { ...drinker, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'heroism-feed' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: recipient } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(
      campaign,
      engine.plan.consumeItem(campaign.state, {
        characterId: hero.id,
        instanceId: potion.id,
        targetId: recipient.id,
      }).events,
    );
    expect(campaign.state.characters[recipient.id]!.hp.temp).toBe(10);
    expect(campaign.state.characters[hero.id]!.hp.temp).toBe(0);
    expect(
      campaign.state.characters[recipient.id]!.appliedConditions.some((c) => c.conditionId === 'blessed'),
    ).toBe(true);
  });
});
