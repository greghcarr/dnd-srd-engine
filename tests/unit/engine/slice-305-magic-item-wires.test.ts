// Slice 305 — magic-item buff sweep. Five clean wires using existing
// primitives, no engine changes. Each is pinned by a test below.
//
// Wearables (passive `effects[]` projection, slice 132):
// - Ring of Feather Falling: GrantFallingProtection (attuned) →
//   planFalling short-circuits to no falling damage.
// - Gloves of Thievery: AddModifier skill:sleight-of-hand +5 (no
//   attunement) → surfaces in the ability-check modifier sum.
//
// Consumables (converted from a miscategorized itemKind 'magic' to
// 'consumable' so they carry onConsume; the other pack potions were
// already 'consumable'):
// - Potion of Invulnerability: ApplyCondition →
//   potion-of-invulnerability-active (GrantResistance all).
// - Potion of Gaseous Form: ApplyCondition → the existing slice-287
//   gaseous-form-active condition.
// - Elixir of Health: RemoveConditions [blinded, deafened, paralyzed,
//   poisoned] via the slice-283 ConsumeAction variant.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent, ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHero = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    ...overrides,
  });

describe('slice 305: Ring of Feather Falling (GrantFallingProtection)', () => {
  it('an attuned wearer takes no falling damage', () => {
    const ring = makeItemInstance('ring-of-feather-falling');
    const hero = buildHero({
      inventory: [ring.id],
      equipped: { attuned: [ring.id] as never },
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(305) });
    let campaign: Campaign = engine.createCampaign({ name: 'feather-ring' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: ring },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.falling(campaign.state, {
      characterId: hero.id,
      distanceFeet: 200,
    });
    expect(events).toEqual([]);
  });

  it('without the ring, the same fall produces damage (control)', () => {
    const hero = buildHero();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(305) });
    let campaign: Campaign = engine.createCampaign({ name: 'feather-control' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.falling(campaign.state, {
      characterId: hero.id,
      distanceFeet: 200,
    });
    expect(events.some((e) => e.type === 'DamageApplied')).toBe(true);
  });

  it('does not project from inventory without attunement', () => {
    const ring = makeItemInstance('ring-of-feather-falling');
    const hero = buildHero({ inventory: [ring.id] });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(305) });
    let campaign: Campaign = engine.createCampaign({ name: 'feather-unattuned' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: ring },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.falling(campaign.state, {
      characterId: hero.id,
      distanceFeet: 200,
    });
    const damage = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    expect(damage).toBeDefined();
  });
});

describe('slice 305: Gloves of Thievery (+5 Sleight of Hand)', () => {
  it('adds +5 to the Sleight of Hand modifier sum while worn (no attunement)', () => {
    const gloves = makeItemInstance('gloves-of-thievery');
    const hero = buildHero({ inventory: [gloves.id] });
    const effects = buildEffectStack({
      character: hero,
      itemInstances: { [gloves.id]: gloves },
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.modifierSum({ kind: 'skill', skill: 'sleight-of-hand' })).toBe(5);
  });

  it('does not affect other skills', () => {
    const gloves = makeItemInstance('gloves-of-thievery');
    const hero = buildHero({ inventory: [gloves.id] });
    const effects = buildEffectStack({
      character: hero,
      itemInstances: { [gloves.id]: gloves },
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.modifierSum({ kind: 'skill', skill: 'stealth' })).toBe(0);
  });
});

describe('slice 305: Potion of Invulnerability (Resistance to all damage)', () => {
  it('consuming applies potion-of-invulnerability-active, granting resistance to all', () => {
    const potion = makeItemInstance('potion-of-invulnerability');
    const hero = buildHero({ inventory: [potion.id] });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(305) });
    let campaign: Campaign = engine.createCampaign({ name: 'invuln' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(
      campaign,
      engine.plan.consumeItem(campaign.state, { characterId: hero.id, instanceId: potion.id }).events,
    );
    const after = campaign.state.characters[hero.id]!;
    expect(after.appliedConditions.some((c) => c.conditionId === 'potion-of-invulnerability-active')).toBe(true);
    const effects = buildEffectStack({
      character: after,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.hasResistance('fire')).toBe(true);
    expect(effects.hasResistance('bludgeoning')).toBe(true);
    expect(effects.hasResistance('necrotic')).toBe(true);
  });
});

describe('slice 305: Potion of Gaseous Form', () => {
  it('consuming applies the existing gaseous-form-active condition', () => {
    const potion = makeItemInstance('potion-of-gaseous-form');
    const hero = buildHero({ inventory: [potion.id] });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(305) });
    let campaign: Campaign = engine.createCampaign({ name: 'gaseous' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(
      campaign,
      engine.plan.consumeItem(campaign.state, { characterId: hero.id, instanceId: potion.id }).events,
    );
    const after = campaign.state.characters[hero.id]!;
    expect(after.appliedConditions.some((c) => c.conditionId === 'gaseous-form-active')).toBe(true);
  });
});

describe('slice 305: Elixir of Health (RemoveConditions)', () => {
  it('consuming ends Blinded, Deafened, Paralyzed, and Poisoned', () => {
    const elixir = makeItemInstance('elixir-of-health');
    const hero = buildHero({
      inventory: [elixir.id],
      appliedConditions: [
        { id: newAppliedConditionId(), conditionId: 'blinded' },
        { id: newAppliedConditionId(), conditionId: 'deafened' },
        { id: newAppliedConditionId(), conditionId: 'paralyzed' },
        { id: newAppliedConditionId(), conditionId: 'poisoned' },
      ],
    });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(305) });
    let campaign: Campaign = engine.createCampaign({ name: 'elixir' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: elixir },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, { characterId: hero.id, instanceId: elixir.id });
    const removed = events
      .filter((e): e is ConditionRemovedEvent => e.type === 'ConditionRemoved')
      .map((e) => e.conditionId)
      .sort();
    expect(removed).toEqual(['blinded', 'deafened', 'paralyzed', 'poisoned']);
    campaign = commit(campaign, events);
    const after = campaign.state.characters[hero.id]!;
    expect(after.appliedConditions).toEqual([]);
  });

  it('is a no-op clear for an unafflicted drinker but still consumes the item', () => {
    const elixir = makeItemInstance('elixir-of-health');
    const hero = buildHero({ inventory: [elixir.id] });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(305) });
    let campaign: Campaign = engine.createCampaign({ name: 'elixir-noop' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: elixir },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, { characterId: hero.id, instanceId: elixir.id });
    expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(false);
    expect(events.some((e) => e.type === 'ItemConsumed')).toBe(true);
  });
});
