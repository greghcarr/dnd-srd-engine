import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

// Tests Slow Fall (Monk L4 class feature). Bug this prevents: a Monk
// L4 should be able to spend their reaction to reduce falling damage
// by 5 × monk level. Without the wiring planFalling ignores Monk levels
// entirely and applies full falling damage.

const PACK = loadStarterPack();

const buildMonk = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `Monk L${level}`,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
    featsTaken: [],
  });

const buildFighter = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `Fighter L${level}`,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
    featsTaken: [],
  });

const buildCampaignWith = (character: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(0) });
  let campaign: Campaign = engine.createCampaign({ name: 'fall-test' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('Slow Fall (Monk L4)', () => {
  it('a Monk L4 reduces 30ft falling damage to 0 (3d6 max 18 < reduction 20)', () => {
    const monk = buildMonk(4);
    const { engine, campaign } = buildCampaignWith(monk);
    const events = engine.plan.falling(campaign.state, {
      characterId: monk.id,
      distanceFeet: 30,
      useSlowFall: true,
    }).events;
    // Slice 882: damage is now ROLLED (3d6, max 18); the 5×4=20 reduction
    // clamps any roll to 0 → no DamageApplied. Out of encounter, no reaction
    // event either, so the whole plan is empty for any seed.
    expect(events).toEqual([]);
  });

  it('a Monk L8 reduces a 60ft fall to 0 (6d6 max 36 < cap 5×8=40)', () => {
    const monk = buildMonk(8);
    const { engine, campaign } = buildCampaignWith(monk);
    const events = engine.plan.falling(campaign.state, {
      characterId: monk.id,
      distanceFeet: 60,
      useSlowFall: true,
    }).events;
    // 6d6 (max 36) is always below the L8 cap of 40 → 0 for any roll. (L4's
    // 20 reduction could NOT zero this fall, so the level-scaled cap shows.)
    expect(events).toEqual([]);
  });

  it('a Monk L4 falling 200ft takes the rolled 20d6 minus the 20 reduction', () => {
    // Roll-agnostic: a fresh seed-0 campaign WITHOUT Slow Fall rolls the same
    // 20d6 (dice are drawn first, before the reduction / concentration check),
    // so the Slow-Fall total is exactly that raw minus 5×4=20 (20d6 >= 20, so
    // the reduction never clamps to 0 here). No bludgeoning resistance → no
    // mitigation in between.
    const monkNoSlow = buildMonk(4);
    const noSlow = buildCampaignWith(monkNoSlow);
    const rawEvents = noSlow.engine.plan.falling(noSlow.campaign.state, {
      characterId: monkNoSlow.id,
      distanceFeet: 200,
    }).events;
    const rawDamage = (rawEvents.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent)
      .components.reduce((sum, c) => sum + c.amount, 0);

    const monk = buildMonk(4);
    const { engine, campaign } = buildCampaignWith(monk);
    const events = engine.plan.falling(campaign.state, {
      characterId: monk.id,
      distanceFeet: 200,
      useSlowFall: true,
    }).events;
    const damageApplied = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    expect(damageApplied).toBeDefined();
    const totalDamage = damageApplied!.components.reduce((sum, c) => sum + c.amount, 0);
    expect(totalDamage).toBe(rawDamage - 20);
    // Sanity: 20d6 lands in [20, 120], so the reduced total is in [0, 100].
    expect(totalDamage).toBeGreaterThanOrEqual(0);
    expect(totalDamage).toBeLessThanOrEqual(100);
  });

  it('a Monk L4 without useSlowFall takes full falling damage', () => {
    const monk = buildMonk(4);
    const { engine, campaign } = buildCampaignWith(monk);
    const events = engine.plan.falling(campaign.state, {
      characterId: monk.id,
      distanceFeet: 30,
    }).events;
    const damageApplied = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    expect(damageApplied).toBeDefined();
    const totalDamage = damageApplied!.components.reduce((sum, c) => sum + c.amount, 0);
    expect(totalDamage).toBeGreaterThan(0);
  });

  it('a Monk L3 attempting Slow Fall throws (requires L4+)', () => {
    const monk = buildMonk(3);
    const { engine, campaign } = buildCampaignWith(monk);
    expect(() =>
      engine.plan.falling(campaign.state, {
        characterId: monk.id,
        distanceFeet: 30,
        useSlowFall: true,
      }),
    ).toThrow(/Slow Fall/);
  });

  it('a non-Monk attempting Slow Fall throws', () => {
    const fighter = buildFighter(10);
    const { engine, campaign } = buildCampaignWith(fighter);
    expect(() =>
      engine.plan.falling(campaign.state, {
        characterId: fighter.id,
        distanceFeet: 30,
        useSlowFall: true,
      }),
    ).toThrow(/Slow Fall/);
  });

  it('in an active encounter, Slow Fall emits ActionEconomyConsumed { kind: reaction }', () => {
    const monk = buildMonk(4);
    const other = buildFighter(1);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(0) });
    let campaign: Campaign = engine.createCampaign({ name: 'fall-in-encounter' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: other } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [monk.id, other.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

    const events = engine.plan.falling(campaign.state, {
      characterId: monk.id,
      distanceFeet: 200,
      useSlowFall: true,
    }).events;
    const reaction = events.find((e) => e.type === 'ActionEconomyConsumed') as ActionEconomyConsumedEvent | undefined;
    expect(reaction).toBeDefined();
    expect(reaction!.kind).toBe('reaction');
    expect(reaction!.combatantId).toBe(monk.id);
  });

  it('rejects when the reaction was already used this round', () => {
    const monk = buildMonk(4);
    const other = buildFighter(1);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(0) });
    let campaign: Campaign = engine.createCampaign({ name: 'fall-no-reaction' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: other } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [monk.id, other.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

    // Consume the monk's reaction via a first Slow Fall.
    campaign = commit(
      campaign,
      engine.plan.falling(campaign.state, {
        characterId: monk.id,
        distanceFeet: 30,
        useSlowFall: true,
      }).events,
    );

    expect(() =>
      engine.plan.falling(campaign.state, {
        characterId: monk.id,
        distanceFeet: 30,
        useSlowFall: true,
      }),
    ).toThrow(/already used their reaction/);
  });
});
