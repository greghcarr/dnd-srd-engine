// Planner-level tests for spell summons.
//
// The cast-spell pipeline gains a new `summon` mechanic branch that
// emits CompanionSummoned. These tests pin down the contract:
//
// - HP scales as hpBase + (slotLevel - baseSlotLevel) * hpPerSlotAbove.
// - Concentration summons carry the same effectInstanceId as their
//   ConcentrationStarted event so the auto-dismiss path can match.
// - Non-concentration summons (ritual spells like Find Familiar) leave
//   the effectInstanceId unset.
// - planDismissCompanion emits a CompanionDismissed event and the
//   reducer removes the companion.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { loadPhbExtrasPack } from '../../../src/content/packs/extras.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  CompanionSummonedEvent,
  CompanionDismissedEvent,
} from '../../../src/schemas/events/summons.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';

const buildCaster = (spellId: string, level = 5): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Summoner',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: [spellId],
  });

describe('planCastSpell: summon mechanic', () => {
  it('emits CompanionSummoned with base HP at base slot', () => {
    const PACK = loadStarterPack();
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(1) });
    const caster = buildCaster('find-familiar');
    let campaign = engine.createCampaign({ name: 'find-familiar-base' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'find-familiar',
      slotLevel: 1,
      targetIds: [],
    }).events;
    const summoned = events.find((e) => e.type === 'CompanionSummoned') as
      | CompanionSummonedEvent
      | undefined;
    expect(summoned).toBeDefined();
    expect(summoned!.hp).toBe(10); // hpBase, no scaling
    expect(summoned!.ac).toBe(13);
    expect(summoned!.controllerId).toBe(caster.id);
    expect(summoned!.spellId).toBe('find-familiar');
    expect(summoned!.effectInstanceId).toBeUndefined(); // not concentration
  });

  it('scales HP by hpPerSlotAbove when cast at a higher slot', () => {
    const PACK = loadStarterPack();
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(1) });
    const caster = buildCaster('summon-beast', 5);
    let campaign = engine.createCampaign({ name: 'summon-beast-up' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ]);
    // Bestial Spirit: hpBase 30, +5 per slot above 2. At slot 3: 30 + 1*5 = 35.
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'summon-beast',
      slotLevel: 3,
      targetIds: [],
    }).events;
    const summoned = events.find((e) => e.type === 'CompanionSummoned') as
      | CompanionSummonedEvent
      | undefined;
    expect(summoned).toBeDefined();
    expect(summoned!.hp).toBe(35);
    expect(summoned!.slotLevel).toBe(3);
  });

  it('ties concentration summons to the same effectInstanceId as ConcentrationStarted', () => {
    const PACK = loadStarterPack();
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(1) });
    const caster = buildCaster('summon-beast');
    let campaign = engine.createCampaign({ name: 'summon-beast-conc' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'summon-beast',
      slotLevel: 2,
      targetIds: [],
    }).events;
    const summoned = events.find((e) => e.type === 'CompanionSummoned') as
      | CompanionSummonedEvent
      | undefined;
    const conc = events.find((e) => e.type === 'ConcentrationStarted') as
      | ConcentrationStartedEvent
      | undefined;
    expect(summoned).toBeDefined();
    expect(conc).toBeDefined();
    expect(summoned!.effectInstanceId).toBeDefined();
    expect(summoned!.effectInstanceId).toBe(conc!.effectInstanceId);
  });
});

describe('planDismissCompanion', () => {
  it('emits CompanionDismissed and the reducer removes the companion', () => {
    const PACK = loadStarterPack();
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(1) });
    const caster = buildCaster('find-familiar');
    let campaign = engine.createCampaign({ name: 'dismiss' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ]);
    const cast = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'find-familiar',
      slotLevel: 1,
      targetIds: [],
    });
    campaign = commit(campaign, cast.events);
    const summoned = cast.events.find((e) => e.type === 'CompanionSummoned') as
      | CompanionSummonedEvent
      | undefined;
    expect(summoned).toBeDefined();
    const companionId = summoned!.companionId;
    expect(campaign.state.characters[companionId]).toBeDefined();
    const dismiss = engine.plan.dismissCompanion(campaign.state, { companionId });
    const dismissed = dismiss.events.find((e) => e.type === 'CompanionDismissed') as
      | CompanionDismissedEvent
      | undefined;
    expect(dismissed?.companionId).toBe(companionId);
    campaign = commit(campaign, dismiss.events);
    expect(campaign.state.characters[companionId]).toBeUndefined();
  });

  it('throws when the companion is not a summoned creature', () => {
    const PACK = loadStarterPack();
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasPack()], rng: seededRNG(1) });
    const caster = buildCaster('find-familiar');
    let campaign = engine.createCampaign({ name: 'dismiss-pc' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.dismissCompanion(campaign.state, { companionId: caster.id }),
    ).toThrow(/not a summoned companion/);
  });
});
