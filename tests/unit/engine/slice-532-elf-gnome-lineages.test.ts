// Slice 532: Elf + Gnome Lineage choices.
//
// RAW (SRD 5.2.1):
//   Elven Lineage:
//     Drow (L1): Darkvision range 120 + Dancing Lights cantrip
//     High Elf (L1): Prestidigitation cantrip
//     Wood Elf (L1): Speed 35 ft + Druidcraft cantrip
//   Gnomish Lineage:
//     Forest Gnome (L1): Minor Illusion cantrip + Speak with
//       Animals (PB uses per long rest)
//     Rock Gnome (L1): Mending + Prestidigitation cantrips +
//       Tiny Clockwork Device (narrative)
//
// Pure content slice. Reuses OfferChoice + GrantSense (Drow's max-
// range override) + ModifySpeed (Wood Elf's 35-ft walk) +
// GrantSpell at-will.
//
// Documented RAW deviations:
//   - Forest Gnome Speak with Animals: wired as `at-will` instead
//     of "PB uses per long rest." The spell is mechanically pure-
//     narrative (consumer-managed talk-to-animals roleplay); the
//     per-day envelope is cosmetic at the engine level. Will tighten
//     when the per-day-uses primitive ships (slice 530-ish).
//   - High Elf cantrip-swap on Long Rest: not modeled (narrative).
//   - Rock Gnome Tiny Clockwork Device: narrative (consumer
//     manages the device entity).
//   - L3 + L5 Elven Lineage spells (Faerie Fire / Darkness for
//     Drow; Detect Magic / Misty Step for High Elf; Longstrider /
//     Pass without Trace for Wood Elf): L3+ scope.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { getEffectiveSpeed } from '../../../src/engine/plan/_actor-state.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { Effect } from '../../../src/schemas/effects.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildElf = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aldra',
    speciesId: 'elf',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 16, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 6, max: 6, temp: 0 },
  });

const buildGnome = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pip',
    speciesId: 'gnome',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 6, max: 6, temp: 0 },
  });

const seedChoicePick = (
  characterId: string,
  choiceId: string,
  optionId: string,
  effects: ReadonlyArray<Effect>,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const cid = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId: cid,
      characterId, promptKey: choiceId, prompt: 'Pick.',
      options: [{ id: optionId, label: optionId, effects: [...effects] }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId: cid,
      characterId, selectedOptionIds: [optionId],
    },
  ];
};

describe('Elf + Gnome Lineages (slice 532)', () => {
  it('elf species ships an elf-elven-lineage OfferChoice with 3 lineages', () => {
    const sp = PACK.species.find((s) => s.id === 'elf')!;
    const offer = sp.traits.find((t) => t.kind === 'OfferChoice' && (t as { choiceId?: string }).choiceId === 'elf-elven-lineage');
    expect(offer).toBeDefined();
    const ids = ((offer as { options: ReadonlyArray<{ id: string }> }).options).map((o) => o.id).sort();
    expect(ids).toEqual(['drow', 'high-elf', 'wood-elf']);
  });

  it('gnome species ships a gnome-gnomish-lineage OfferChoice with 2 lineages', () => {
    const sp = PACK.species.find((s) => s.id === 'gnome')!;
    const offer = sp.traits.find((t) => t.kind === 'OfferChoice' && (t as { choiceId?: string }).choiceId === 'gnome-gnomish-lineage');
    expect(offer).toBeDefined();
    const ids = ((offer as { options: ReadonlyArray<{ id: string }> }).options).map((o) => o.id).sort();
    expect(ids).toEqual(['forest-gnome', 'rock-gnome']);
  });

  it('Drow lineage: Darkvision range becomes 120 (overrides base 60) and grants Dancing Lights', () => {
    const elf = buildElf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(532) });
    let campaign: Campaign = engine.createCampaign({ name: 'drow' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: elf } satisfies CharacterCreatedEvent,
      ...seedChoicePick(elf.id, 'elf-elven-lineage', 'drow', [
        { kind: 'GrantSense', sense: 'darkvision', range: 120 },
        { kind: 'GrantSpell', spellId: 'dancing-lights', preparation: 'at-will', spellcastingAbility: 'CHA' },
      ]),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[elf.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.senseRange('darkvision')).toBe(120);
    expect(acc.grantedSpells().some((g) => g.spellId === 'dancing-lights' && g.preparation === 'at-will')).toBe(true);
  });

  it('Wood Elf lineage: walking speed becomes 35 ft and grants Druidcraft', () => {
    const elf = buildElf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(533) });
    let campaign: Campaign = engine.createCampaign({ name: 'wood-elf' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: elf } satisfies CharacterCreatedEvent,
      ...seedChoicePick(elf.id, 'elf-elven-lineage', 'wood-elf', [
        { kind: 'ModifySpeed', mode: 'walk', op: 'set', value: 35 },
        { kind: 'GrantSpell', spellId: 'druidcraft', preparation: 'at-will', spellcastingAbility: 'WIS' },
      ]),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[elf.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.grantedSpells().some((g) => g.spellId === 'druidcraft')).toBe(true);
    // getEffectiveSpeed reads the effect stack's ModifySpeed contributions
    const speed = getEffectiveSpeed({
      character: campaign.state.characters[elf.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(speed).toBe(35);
  });

  it('High Elf lineage: grants Prestidigitation cantrip', () => {
    const elf = buildElf();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(534) });
    let campaign: Campaign = engine.createCampaign({ name: 'high-elf' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: elf } satisfies CharacterCreatedEvent,
      ...seedChoicePick(elf.id, 'elf-elven-lineage', 'high-elf', [
        { kind: 'GrantSpell', spellId: 'prestidigitation', preparation: 'at-will', spellcastingAbility: 'INT' },
      ]),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[elf.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.grantedSpells().some((g) => g.spellId === 'prestidigitation')).toBe(true);
  });

  it('Forest Gnome lineage: grants Minor Illusion + Speak with Animals', () => {
    const gnome = buildGnome();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(535) });
    let campaign: Campaign = engine.createCampaign({ name: 'forest-gnome' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: gnome } satisfies CharacterCreatedEvent,
      ...seedChoicePick(gnome.id, 'gnome-gnomish-lineage', 'forest-gnome', [
        { kind: 'GrantSpell', spellId: 'minor-illusion', preparation: 'at-will', spellcastingAbility: 'INT' },
        { kind: 'GrantSpell', spellId: 'speak-with-animals', preparation: 'at-will', spellcastingAbility: 'INT' },
      ]),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[gnome.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const ids = acc.grantedSpells().map((g) => g.spellId);
    expect(ids).toContain('minor-illusion');
    expect(ids).toContain('speak-with-animals');
  });

  it('Rock Gnome lineage: grants Mending + Prestidigitation', () => {
    const gnome = buildGnome();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(536) });
    let campaign: Campaign = engine.createCampaign({ name: 'rock-gnome' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: gnome } satisfies CharacterCreatedEvent,
      ...seedChoicePick(gnome.id, 'gnome-gnomish-lineage', 'rock-gnome', [
        { kind: 'GrantSpell', spellId: 'mending', preparation: 'at-will', spellcastingAbility: 'INT' },
        { kind: 'GrantSpell', spellId: 'prestidigitation', preparation: 'at-will', spellcastingAbility: 'INT' },
      ]),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[gnome.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const ids = acc.grantedSpells().map((g) => g.spellId);
    expect(ids).toContain('mending');
    expect(ids).toContain('prestidigitation');
  });
});
