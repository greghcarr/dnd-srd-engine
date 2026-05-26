// Slice 469: Magic Initiate x 2 (Cleric + Wizard) - the Sage and
// Acolyte backgrounds light up end-to-end.
//
// RAW (SRD 5.2.1 Magic Initiate):
// - Two Cantrips: "Learn two cantrips of your choice from the Cleric,
//   Druid, or Wizard spell list. Intelligence, Wisdom, or Charisma is
//   your spellcasting ability for this feat's spells."
// - Level 1 Spell: "Choose a level 1 spell from the same list... You
//   always have that spell prepared. You can cast it once without a
//   spell slot, and you regain the ability to cast it in that way
//   when you finish a Long Rest. You can also cast the spell using
//   any spell slots you have."
// - Repeatable: different list each time. The pack ships separate
//   `magic-initiate-cleric` and `magic-initiate-wizard` feats, one
//   per list. Each background's Origin Feat fixes the list:
//   Acolyte -> Cleric list, Sage -> Wizard list.
//
// Wiring (matches the slice-466 / 467 / 468 origin-feat pattern):
// - Each feat ships two OfferChoice effects (oneOf:2 cantrips +
//   oneOf:1 L1 spell), each option carrying GrantSpell with the
//   appropriate preparation. The cantrip options use
//   'always-prepared'; the L1 spell options use 'oncePerLongRest'
//   (the engine's slice-219 free-cast marker; the spell still
//   appears in effectiveSpellList so it's also castable via slots
//   per RAW). spellcastingAbility is hard-coded to the canonical
//   default per RAW (WIS for Cleric list, INT for Wizard list);
//   the player choice across INT/WIS/CHA is deferred.
//
// The slice-466 auto-projection delivers each background's origin
// feat to the effect stack without explicit `featsTaken` seeding.

import { describe, expect, it } from 'vitest';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { effectiveSpellList } from '../../../src/derive/effective-spell-list.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
} from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildAcolyte = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Solace',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    featsTaken: [],
  });

const buildSage = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mira',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 14, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    featsTaken: [],
  });

// Seed an OfferChoice resolution for a given choiceId picking the
// named option(s). The options array is the same one shipped on the
// feat, faithfully copied so the ChoiceRequired event matches.
const seedChoice = (
  characterId: string,
  choiceId: string,
  prompt: string,
  options: ReadonlyArray<{ id: string; label: string; effects: ReadonlyArray<unknown> }>,
  selected: ReadonlyArray<string>,
  oneOf: number,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const cid = newChoiceId();
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId: cid,
      characterId,
      promptKey: choiceId,
      prompt,
      options: options as never,
      oneOf,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId: cid,
      characterId,
      selectedOptionIds: [...selected],
    },
  ];
};

const featOfferChoice = (featId: string, choiceId: string) => {
  const feat = PACK.feats.find((f) => f.id === featId)!;
  const oc = feat.effects.find(
    (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === choiceId,
  );
  if (!oc || oc.kind !== 'OfferChoice') throw new Error(`OfferChoice ${choiceId} not on ${featId}`);
  return oc;
};

describe('Magic Initiate (Cleric) - Acolyte (slice 469)', () => {
  it('Acolyte starts with two cantrip + one L1 OfferChoice requirements (unresolved)', () => {
    const acolyte = buildAcolyte();
    const acc = buildEffectStack({
      character: acolyte,
      content: CONTENT,
      itemInstances: {},
    });
    // No granted spells before the choices are resolved.
    expect(acc.grantedSpells()).toHaveLength(0);
  });

  it('Acolyte who picks Sacred Flame + Guidance + Cure Wounds has them granted to the effect stack', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const acolyte = buildAcolyte();
    const cantrips = featOfferChoice('magic-initiate-cleric', 'magic-initiate-cleric-cantrips');
    const l1 = featOfferChoice('magic-initiate-cleric', 'magic-initiate-cleric-l1');
    let campaign: Campaign = engine.createCampaign({ name: 'magic-initiate-cleric' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: acolyte } satisfies CharacterCreatedEvent,
      ...seedChoice(acolyte.id, 'magic-initiate-cleric-cantrips', cantrips.prompt, cantrips.options, ['sacred-flame', 'guidance'], 2),
      ...seedChoice(acolyte.id, 'magic-initiate-cleric-l1', l1.prompt, l1.options, ['cure-wounds'], 1),
    ]);
    const stored = campaign.state.characters[acolyte.id]!;
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells();
    const grantedIds = granted.map((g) => g.spellId).sort();
    expect(grantedIds).toEqual(['cure-wounds', 'guidance', 'sacred-flame']);
    // Cantrips: always-prepared. L1 spell: oncePerLongRest (RAW free cast).
    expect(granted.find((g) => g.spellId === 'sacred-flame')?.preparation).toBe('always-prepared');
    expect(granted.find((g) => g.spellId === 'guidance')?.preparation).toBe('always-prepared');
    expect(granted.find((g) => g.spellId === 'cure-wounds')?.preparation).toBe('oncePerLongRest');
    // Spellcasting ability defaults to WIS for the Cleric list.
    for (const g of granted) expect(g.spellcastingAbility).toBe('WIS');
  });

  it('Acolyte-granted L1 spell is castable via effectiveSpellList (RAW: also castable via slots)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const acolyte = buildAcolyte();
    const cantrips = featOfferChoice('magic-initiate-cleric', 'magic-initiate-cleric-cantrips');
    const l1 = featOfferChoice('magic-initiate-cleric', 'magic-initiate-cleric-l1');
    let campaign: Campaign = engine.createCampaign({ name: 'magic-initiate-cleric-list' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: acolyte } satisfies CharacterCreatedEvent,
      ...seedChoice(acolyte.id, 'magic-initiate-cleric-cantrips', cantrips.prompt, cantrips.options, ['light', 'mending'], 2),
      ...seedChoice(acolyte.id, 'magic-initiate-cleric-l1', l1.prompt, l1.options, ['bless'], 1),
    ]);
    const stored = campaign.state.characters[acolyte.id]!;
    const list = effectiveSpellList({
      character: stored,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(list).toContain('light');
    expect(list).toContain('mending');
    expect(list).toContain('bless');
  });
});

describe('Magic Initiate (Wizard) - Sage (slice 469)', () => {
  it('Sage who picks Fire Bolt + Mage Hand + Magic Missile has them granted (INT ability)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const sage = buildSage();
    const cantrips = featOfferChoice('magic-initiate-wizard', 'magic-initiate-wizard-cantrips');
    const l1 = featOfferChoice('magic-initiate-wizard', 'magic-initiate-wizard-l1');
    let campaign: Campaign = engine.createCampaign({ name: 'magic-initiate-wizard' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sage } satisfies CharacterCreatedEvent,
      ...seedChoice(sage.id, 'magic-initiate-wizard-cantrips', cantrips.prompt, cantrips.options, ['fire-bolt', 'mage-hand'], 2),
      ...seedChoice(sage.id, 'magic-initiate-wizard-l1', l1.prompt, l1.options, ['magic-missile'], 1),
    ]);
    const stored = campaign.state.characters[sage.id]!;
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: {},
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells();
    const ids = granted.map((g) => g.spellId).sort();
    expect(ids).toEqual(['fire-bolt', 'mage-hand', 'magic-missile']);
    expect(granted.find((g) => g.spellId === 'fire-bolt')?.preparation).toBe('always-prepared');
    expect(granted.find((g) => g.spellId === 'mage-hand')?.preparation).toBe('always-prepared');
    expect(granted.find((g) => g.spellId === 'magic-missile')?.preparation).toBe('oncePerLongRest');
    for (const g of granted) expect(g.spellcastingAbility).toBe('INT');
  });

  it('Sage cantrips appear on the effective spell list (castable via cast-spell planner)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
    const sage = buildSage();
    const cantrips = featOfferChoice('magic-initiate-wizard', 'magic-initiate-wizard-cantrips');
    const l1 = featOfferChoice('magic-initiate-wizard', 'magic-initiate-wizard-l1');
    let campaign: Campaign = engine.createCampaign({ name: 'magic-initiate-wizard-list' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: sage } satisfies CharacterCreatedEvent,
      ...seedChoice(sage.id, 'magic-initiate-wizard-cantrips', cantrips.prompt, cantrips.options, ['ray-of-frost', 'prestidigitation'], 2),
      ...seedChoice(sage.id, 'magic-initiate-wizard-l1', l1.prompt, l1.options, ['shield'], 1),
    ]);
    const stored = campaign.state.characters[sage.id]!;
    const list = effectiveSpellList({
      character: stored,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(list).toContain('ray-of-frost');
    expect(list).toContain('prestidigitation');
    expect(list).toContain('shield');
  });
});

describe('Magic Initiate feat catalog conformance (slice 469)', () => {
  it('magic-initiate-cleric carries cantrip + L1 OfferChoices over the SRD Cleric lists', () => {
    const feat = PACK.feats.find((f) => f.id === 'magic-initiate-cleric')!;
    const cantripChoice = feat.effects.find(
      (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === 'magic-initiate-cleric-cantrips',
    );
    const l1Choice = feat.effects.find(
      (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === 'magic-initiate-cleric-l1',
    );
    expect(cantripChoice).toBeDefined();
    expect(l1Choice).toBeDefined();
    if (cantripChoice?.kind === 'OfferChoice') {
      expect(cantripChoice.oneOf).toBe(2);
      // SRD 5.2.1 ships 7 Cleric cantrips on the starter pack.
      expect(cantripChoice.options.length).toBe(7);
    }
    if (l1Choice?.kind === 'OfferChoice') {
      expect(l1Choice.oneOf).toBe(1);
      // SRD 5.2.1 ships 15 Cleric L1 spells on the starter pack.
      expect(l1Choice.options.length).toBe(15);
    }
  });

  it('magic-initiate-wizard carries cantrip + L1 OfferChoices over the SRD Wizard lists', () => {
    const feat = PACK.feats.find((f) => f.id === 'magic-initiate-wizard')!;
    const cantripChoice = feat.effects.find(
      (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === 'magic-initiate-wizard-cantrips',
    );
    const l1Choice = feat.effects.find(
      (e) => e.kind === 'OfferChoice' && (e as { choiceId?: string }).choiceId === 'magic-initiate-wizard-l1',
    );
    expect(cantripChoice).toBeDefined();
    expect(l1Choice).toBeDefined();
    if (cantripChoice?.kind === 'OfferChoice') {
      expect(cantripChoice.oneOf).toBe(2);
      // SRD 5.2.1 ships 15 Wizard cantrips on the starter pack.
      expect(cantripChoice.options.length).toBe(15);
    }
    if (l1Choice?.kind === 'OfferChoice') {
      expect(l1Choice.oneOf).toBe(1);
      // SRD 5.2.1 ships 30 Wizard L1 spells on the starter pack.
      expect(l1Choice.options.length).toBe(30);
    }
  });
});
