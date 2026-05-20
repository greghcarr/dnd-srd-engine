// Slice 351 - Draconic Sorcery L14 Dragon Wings.
//
// RAW 2024: as a Bonus Action, gain a Fly Speed of 60 feet (1 hour).
// planDragonWings applies the dragon-wings-active condition (ModifySpeed
// fly set 60), observable via getEffectiveFlySpeed. Works in or out of
// combat; the Bonus Action is consumed only when the sorcerer is the
// active combatant in an encounter. Duration / dismissal / once-per-LR
// (3-SP restore) are consumer-managed.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { getEffectiveFlySpeed } from '../../../src/engine/plan/_actor-state.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);
const DRAGON_WINGS_FLY_SPEED = 60;

const buildSorcerer = (level: number, subclass: string | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ember',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'sorcerer', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 84, max: 84, temp: 0 },
  });

const flySpeed = (campaign: Campaign, id: string): number =>
  getEffectiveFlySpeed({
    character: campaign.state.characters[id]!,
    content: CONTENT,
    itemInstances: campaign.state.itemInstances,
  });

describe('slice 351: Dragon Wings', () => {
  it('out of combat: grants Fly Speed 60 with no action-economy event', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const sorcerer = buildSorcerer(14, 'draconic-sorcery');
    let campaign: Campaign = engine.createCampaign({ name: 'dw' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sorcerer } satisfies CharacterCreatedEvent,
    ]);
    expect(flySpeed(campaign, sorcerer.id)).toBe(0);
    const { events } = engine.plan.dragonWings(campaign.state, { sorcererId: sorcerer.id });
    expect(events.some((e) => e.type === 'ActionEconomyConsumed')).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(true);
    campaign = commit(campaign, events as ReadonlyArray<Event>);
    expect(flySpeed(campaign, sorcerer.id)).toBe(DRAGON_WINGS_FLY_SPEED);
  });

  it('in combat: consumes the Bonus Action and grants the fly speed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const sorcerer = buildSorcerer(14, 'draconic-sorcery');
    let campaign: Campaign = engine.createCampaign({ name: 'dw-combat' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sorcerer } satisfies CharacterCreatedEvent,
    ]);
    const created = engine.plan.createEncounter(campaign.state, { combatantIds: [sorcerer.id] });
    campaign = commit(campaign, created.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events);
    const { events } = engine.plan.dragonWings(campaign.state, { sorcererId: sorcerer.id });
    expect(events.some((e) => e.type === 'ActionEconomyConsumed' && e.kind === 'bonusAction')).toBe(true);
    campaign = commit(campaign, events as ReadonlyArray<Event>);
    expect(flySpeed(campaign, sorcerer.id)).toBe(DRAGON_WINGS_FLY_SPEED);
  });

  it('rejects a sorcerer without Draconic Sorcery at level 14', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const under = buildSorcerer(13, 'draconic-sorcery');
    let campaign: Campaign = engine.createCampaign({ name: 'dw-guard' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: under } satisfies CharacterCreatedEvent,
    ]);
    expect(() => engine.plan.dragonWings(campaign.state, { sorcererId: under.id })).toThrow(/Dragon Wings/);
  });
});
