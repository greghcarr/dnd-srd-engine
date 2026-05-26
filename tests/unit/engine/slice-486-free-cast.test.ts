// Slice 486: once-per-long-rest free-cast resource tracking.
//
// RAW (SRD 5.2.1 Magic Initiate): "You can cast it once without a
// spell slot, and you regain the ability to cast it in that way when
// you finish a Long Rest." Until this slice the free cast was
// consumer-managed (engine accepted noSlotCost: true without tracking
// usage). This slice adds:
//   - `useFreeCast: true` opt-in on CastSpellIntent.
//   - Validation: spell must be GrantSpell'd with oncePerLongRest AND
//     not already in character.usedFreeCastSpellIds.
//   - Emits FreeCastUsed; reducer records the consumption.
//   - LongRestEnded clears the consumed list.
//
// The same gate also closes Warlock Contact Patron and any future
// oncePerLongRest grant.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
} from '../../../src/schemas/events/level-up.js';
import type {
  LongRestEndedEvent,
  LongRestStartedEvent,
} from '../../../src/schemas/events/index.js';
import type { FreeCastUsedEvent } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

// A level-1 cleric (acolyte background -> Magic Initiate (Cleric) Origin Feat).
// Using a spellcasting class keeps this slice focused on free-cast tracking;
// the parallel "Magic Initiate works for non-spellcasters" gap (planCastSpell
// requires a spellcasting class today) is a separate engine fix tracked
// elsewhere.
const buildAcolyte = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Solace',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ally',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 5, max: 20, temp: 0 },
  });

// Resolve the Acolyte's two Magic Initiate (Cleric) OfferChoice
// requirements by picking two cantrips + Cure Wounds for the L1 grant.
const seedAcolyteChoices = (characterId: string): ReadonlyArray<ChoiceRequiredEvent | ChoiceResolvedEvent> => {
  const feat = PACK.feats.find((f) => f.id === 'magic-initiate-cleric')!;
  const cantripsOC = feat.effects.find(
    (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === 'magic-initiate-cleric-cantrips',
  )!;
  const l1OC = feat.effects.find(
    (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === 'magic-initiate-cleric-l1',
  )!;
  if (cantripsOC.kind !== 'OfferChoice' || l1OC.kind !== 'OfferChoice') throw new Error('unexpected feat shape');
  const cantripsCID = newChoiceId();
  const l1CID = newChoiceId();
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId: cantripsCID,
      characterId,
      promptKey: 'magic-initiate-cleric-cantrips',
      prompt: cantripsOC.prompt,
      options: cantripsOC.options as never,
      oneOf: 2,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId: cantripsCID,
      characterId,
      selectedOptionIds: ['sacred-flame', 'guidance'],
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId: l1CID,
      characterId,
      promptKey: 'magic-initiate-cleric-l1',
      prompt: l1OC.prompt,
      options: l1OC.options as never,
      oneOf: 1,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId: l1CID,
      characterId,
      selectedOptionIds: ['cure-wounds'],
    },
  ];
};

describe('once-per-long-rest free-cast tracking (slice 486)', () => {
  it('a Magic Initiate cleric can cast Cure Wounds with useFreeCast: emits FreeCastUsed, no SpellSlotConsumed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const acolyte = buildAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'free-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: acolyte } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedAcolyteChoices(acolyte.id),
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: acolyte.id,
      spellId: 'cure-wounds',
      slotLevel: 1,
      targetIds: [ally.id],
      useFreeCast: true,
    }).events;
    const freeCastUsed = events.find((e) => e.type === 'FreeCastUsed') as FreeCastUsedEvent | undefined;
    expect(freeCastUsed).toBeDefined();
    expect(freeCastUsed?.spellId).toBe('cure-wounds');
    expect(freeCastUsed?.characterId).toBe(acolyte.id);
    expect(events.some((e) => e.type === 'SpellSlotConsumed')).toBe(false);
    expect(events.some((e) => e.type === 'PactSlotConsumed')).toBe(false);
  });

  it('after using the free cast, the bearer.usedFreeCastSpellIds tracks the spell', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const acolyte = buildAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'tracker' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: acolyte } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedAcolyteChoices(acolyte.id),
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: acolyte.id,
      spellId: 'cure-wounds',
      slotLevel: 1,
      targetIds: [ally.id],
      useFreeCast: true,
    }).events);
    expect(campaign.state.characters[acolyte.id]?.usedFreeCastSpellIds).toEqual(['cure-wounds']);
  });

  it('casting again with useFreeCast before a long rest throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const acolyte = buildAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'repeat' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: acolyte } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedAcolyteChoices(acolyte.id),
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: acolyte.id,
      spellId: 'cure-wounds',
      slotLevel: 1,
      targetIds: [ally.id],
      useFreeCast: true,
    }).events);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: acolyte.id,
        spellId: 'cure-wounds',
        slotLevel: 1,
        targetIds: [ally.id],
        useFreeCast: true,
      }),
    ).toThrow(/already used the free cast/i);
  });

  it('useFreeCast on a spell that lacks an oncePerLongRest grant throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const acolyte = buildAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'no-grant' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: acolyte } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedAcolyteChoices(acolyte.id),
    ]);
    // Sacred Flame is granted as always-prepared (cantrip), NOT oncePerLongRest.
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: acolyte.id,
        spellId: 'sacred-flame',
        slotLevel: 0,
        targetIds: [ally.id],
        useFreeCast: true,
      }),
    ).toThrow(/no oncePerLongRest grant/i);
  });

  it('completing a long rest clears usedFreeCastSpellIds and re-enables the free cast', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const acolyte = buildAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'long-rest' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: acolyte } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedAcolyteChoices(acolyte.id),
    ]);
    campaign = commit(campaign, engine.plan.castSpell(campaign.state, {
      characterId: acolyte.id,
      spellId: 'cure-wounds',
      slotLevel: 1,
      targetIds: [ally.id],
      useFreeCast: true,
    }).events);
    expect(campaign.state.characters[acolyte.id]?.usedFreeCastSpellIds).toEqual(['cure-wounds']);
    // Drop the ally's HP so Cure Wounds has somewhere to heal post-rest.
    const lrStartId = eventId();
    const longRestStarted: LongRestStartedEvent = {
      id: lrStartId,
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [acolyte.id, ally.id],
    };
    const longRestEnded: LongRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestEnded',
      causedByEventId: lrStartId,
    };
    campaign = commit(campaign, [longRestStarted, longRestEnded]);
    expect(campaign.state.characters[acolyte.id]?.usedFreeCastSpellIds).toEqual([]);
    // Now the free cast is available again.
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: acolyte.id,
        spellId: 'cure-wounds',
        slotLevel: 1,
        targetIds: [ally.id],
        useFreeCast: true,
      }),
    ).not.toThrow();
  });
});
