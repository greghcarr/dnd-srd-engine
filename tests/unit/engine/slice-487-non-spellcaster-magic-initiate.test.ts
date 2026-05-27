// Slice 487: planCastSpell accepts non-spellcaster casters when the
// spell is reachable via a GrantSpell entry. Closes the gap documented
// at slice 486: a Magic Initiate Fighter / Rogue / Barbarian carries
// the oncePerLongRest grant + the always-prepared cantrip grants, but
// pre-487 the planner threw "Character has no spellcasting class" the
// moment they tried to cast.
//
// The slice routes DC / attack-bonus computation through the
// GrantSpell entry's `spellcastingAbility` when no class with
// spellcasting is enrolled (slice-487 `resolveCastingAbility` +
// `castingAbility` option on ComputeSpellDCInput). Spellcasters with a
// class still take the existing class-derived path.

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
import type { FreeCastUsedEvent } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

// A level-1 Fighter (no spellcasting class) with the Acolyte
// background's Magic Initiate (Cleric) Origin Feat auto-projected by
// slice 466.
const buildFighterAcolyte = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Solace',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 13, INT: 10, WIS: 16, CHA: 8 },
    hp: { current: 12, max: 12, temp: 0 },
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

const seedMagicInitiateCleric = (
  characterId: string,
  cantripIds: ReadonlyArray<string>,
  l1Id: string,
): ReadonlyArray<ChoiceRequiredEvent | ChoiceResolvedEvent> => {
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
      selectedOptionIds: [...cantripIds],
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
      selectedOptionIds: [l1Id],
    },
  ];
};

describe('non-spellcaster Magic Initiate cast (slice 487)', () => {
  it('a Fighter with Magic Initiate (Cleric) can cast Sacred Flame (cantrip via always-prepared GrantSpell)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const fighter = buildFighterAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'fighter-cantrip' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedMagicInitiateCleric(fighter.id, ['sacred-flame', 'guidance'], 'cure-wounds'),
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: fighter.id,
        spellId: 'sacred-flame',
        slotLevel: 0,
        targetIds: [ally.id],
      }),
    ).not.toThrow();
  });

  it("the Fighter's Sacred Flame DC is computed from WIS (the GrantSpell's spellcastingAbility), not from the Fighter class", () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const fighter = buildFighterAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'dc-wis' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedMagicInitiateCleric(fighter.id, ['sacred-flame', 'guidance'], 'cure-wounds'),
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: fighter.id,
      spellId: 'sacred-flame',
      slotLevel: 0,
      targetIds: [ally.id],
    }).events;
    // Sacred Flame is a DEX save (a SaveRolled event is emitted with the
    // DC). WIS 16 -> +3 mod, PB +2, base 8 -> DC 13.
    const save = events.find((e) => e.type === 'SaveRolled') as { dc?: number } | undefined;
    expect(save?.dc).toBe(13);
  });

  it('the Fighter can free-cast Cure Wounds via useFreeCast (oncePerLongRest grant)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const fighter = buildFighterAcolyte();
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'fighter-free-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      ...seedMagicInitiateCleric(fighter.id, ['sacred-flame', 'guidance'], 'cure-wounds'),
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: fighter.id,
      spellId: 'cure-wounds',
      slotLevel: 1,
      targetIds: [ally.id],
      useFreeCast: true,
    }).events;
    const freeCastUsed = events.find((e) => e.type === 'FreeCastUsed') as FreeCastUsedEvent | undefined;
    expect(freeCastUsed?.spellId).toBe('cure-wounds');
    expect(events.some((e) => e.type === 'SpellSlotConsumed')).toBe(false);
  });

  it('a Fighter WITHOUT Magic Initiate gets the slice-487 ability error when bypassing the preparation gate', () => {
    // Fighter has no spellcasting class; sacred-flame is in their
    // preparedSpells (manually added) so the slice-220 ignorePreparation
    // bypass also lets through the slice-219-style consumer flow. Reaches
    // the slice-487 resolveCastingAbility gate, which throws.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const fighter = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Plain Fighter',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 12, CON: 13, INT: 10, WIS: 12, CHA: 8 },
      hp: { current: 12, max: 12, temp: 0 },
      preparedSpells: ['sacred-flame'],
    });
    const ally = buildAlly();
    let campaign: Campaign = engine.createCampaign({ name: 'no-feat' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: fighter.id,
        spellId: 'sacred-flame',
        slotLevel: 0,
        targetIds: [ally.id],
      }),
    ).toThrow(/no spellcasting class and no GrantSpell entry/i);
  });
});
