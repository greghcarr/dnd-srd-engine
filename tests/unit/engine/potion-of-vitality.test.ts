// Slice 283 — Potion of Vitality + two new ConsumeAction variants:
// RemoveConditions + RemoveExhaustion.
//
// RAW: "When you drink this potion, it removes any Exhaustion you
// are suffering and cures any disease or Poison affecting you. For
// the next 24 hours, you regain the maximum number of Hit Points
// for any Hit Die you spend." Pre-283 the potion shipped
// `onConsume: []`. This slice ships the first arm via two new
// ConsumeAction variants. The 24-hour max-HD-spend rider stays
// deferred.
//
// Two variants instead of one combined "cleanse" because the shapes
// are mechanically distinct: RemoveConditions walks
// `character.appliedConditions` and emits ConditionRemoved per
// matched instance; RemoveExhaustion emits a single
// ExhaustionChanged from current → 0 on the numeric `exhaustion`
// level (a separate state slot, not a condition).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ConditionRemovedEvent,
  ExhaustionChangedEvent,
} from '../../../src/schemas/events/combat.js';
import type { ItemConsumedEvent } from '../../../src/schemas/events/inventory.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildHero = (
  opts: { exhaustion?: number; poisoned?: boolean } = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    exhaustion: opts.exhaustion ?? 0,
    appliedConditions: opts.poisoned
      ? [{ id: newAppliedConditionId(), conditionId: 'poisoned', appliedAt: isoTimestamp() }]
      : [],
  });

describe('slice 283: Potion of Vitality + RemoveConditions / RemoveExhaustion ConsumeAction variants', () => {
  it('a poisoned exhausted drinker has both cleared after consuming Potion of Vitality', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(283) });
    const potion = makeItemInstance('potion-of-vitality');
    const baseHero = buildHero({ exhaustion: 3, poisoned: true });
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'vitality' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, {
      characterId: hero.id,
      instanceId: potion.id,
    });
    const exhaustionChanged = events.find((e) => e.type === 'ExhaustionChanged') as ExhaustionChangedEvent | undefined;
    const condRemoved = events.find(
      (e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'poisoned',
    ) as ConditionRemovedEvent | undefined;
    const consumed = events.find((e) => e.type === 'ItemConsumed') as ItemConsumedEvent | undefined;
    expect(exhaustionChanged).toBeDefined();
    expect(exhaustionChanged!.fromLevel).toBe(3);
    expect(exhaustionChanged!.toLevel).toBe(0);
    expect(condRemoved).toBeDefined();
    expect(condRemoved!.targetId).toBe(hero.id);
    expect(consumed).toBeDefined();
  });

  it('after consuming, the drinker has 0 exhaustion and no poisoned condition', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(283) });
    const potion = makeItemInstance('potion-of-vitality');
    const baseHero = buildHero({ exhaustion: 2, poisoned: true });
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'vitality-state' });
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
    expect(after.exhaustion).toBe(0);
    expect(after.appliedConditions.some((c) => c.conditionId === 'poisoned')).toBe(false);
  });

  it('a drinker with 0 exhaustion and no poison: no ExhaustionChanged / ConditionRemoved emitted, but ItemConsumed still fires', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(283) });
    const potion = makeItemInstance('potion-of-vitality');
    const baseHero = buildHero();
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'vitality-noop' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, {
      characterId: hero.id,
      instanceId: potion.id,
    });
    expect(events.some((e) => e.type === 'ExhaustionChanged')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(false);
    expect(events.some((e) => e.type === 'ItemConsumed')).toBe(true);
  });

  it('only exhaustion present: emits ExhaustionChanged but no ConditionRemoved', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(283) });
    const potion = makeItemInstance('potion-of-vitality');
    const baseHero = buildHero({ exhaustion: 4 });
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'vitality-exh-only' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, {
      characterId: hero.id,
      instanceId: potion.id,
    });
    expect(events.some((e) => e.type === 'ExhaustionChanged')).toBe(true);
    expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(false);
  });

  it('only poisoned present: emits ConditionRemoved but no ExhaustionChanged', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(283) });
    const potion = makeItemInstance('potion-of-vitality');
    const baseHero = buildHero({ poisoned: true });
    const hero: Character = { ...baseHero, inventory: [potion.id] };
    let campaign: Campaign = engine.createCampaign({ name: 'vitality-pois-only' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: potion },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hero } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.consumeItem(campaign.state, {
      characterId: hero.id,
      instanceId: potion.id,
    });
    expect(events.some((e) => e.type === 'ExhaustionChanged')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(true);
  });
});
