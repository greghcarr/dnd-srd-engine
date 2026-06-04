// Slice 513: Warlock Eldritch Invocations content sweep - 6 new
// at-will / sense invocations + the at-will GrantSpell slot bypass.
//
// New invocations (each authored as `category: 'invocation'` Feat
// content rows):
//   - Armor of Shadows  -> GrantSpell mage-armor   at-will
//   - Devil's Sight     -> GrantSense darkvision 120 ft
//   - Fiendish Vigor    -> GrantSpell false-life   at-will
//   - Mask of Many Faces-> GrantSpell disguise-self at-will
//   - Misty Visions     -> GrantSpell silent-image  at-will
//   - Otherworldly Leap -> GrantSpell jump          at-will
//
// Engine extension: cast-spell now bypasses spell-slot consumption when
// the bearer has an at-will GrantSpell for the cast spell id. Previously
// `preparation: 'at-will'` was schema-recognized but not load-bearing —
// the cast still consumed a slot unless the consumer explicitly passed
// `noSlotCost: true`. Now any at-will-granted spell casts free.
//
// Documented RAW deviations:
//   - Devil's Sight: the "see through magical darkness" arm is not
//     modeled (the engine has no magical-darkness obscurement
//     enforcement to bypass). Standard darkvision 120 ft IS granted.
//   - Mask of Many Faces / Misty Visions / Disguise Self illusion arms:
//     consumer-managed (the engine doesn't model perception checks vs
//     the illusion).

import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const NEW_INVOCATIONS = [
  { featId: 'armor-of-shadows', spellId: 'mage-armor' },
  { featId: 'fiendish-vigor', spellId: 'false-life' },
  { featId: 'mask-of-many-faces', spellId: 'disguise-self' },
  { featId: 'misty-visions', spellId: 'silent-image' },
  { featId: 'otherworldly-leap', spellId: 'jump' },
] as const;

const buildWarlock = (knownSpells: string[] = ['eldritch-blast']): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells,
    preparedSpells: knownSpells,
  });

const seedInvocationPick = (characterId: string, featId: string): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId,
      characterId, promptKey: 'eldritch-invocations-l1', prompt: 'Pick an invocation.',
      options: [{ id: featId, label: featId, effects: [{ kind: 'GrantFeat', featId }] }],
      oneOf: 1,
    },
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId,
      characterId, selectedOptionIds: [featId],
    },
  ];
};

describe('Warlock invocations content sweep (slice 513)', () => {
  it('ships the slice-513 batch of 6 invocations alongside earlier wires', () => {
    const ids = PACK.feats.filter((f) => f.category === 'invocation').map((f) => f.id);
    // Slice 513 added these 6 (Agonizing Blast variants from slices
    // 510/512 are separate; later content sweeps may add more).
    for (const id of ['armor-of-shadows', 'devils-sight', 'fiendish-vigor', 'mask-of-many-faces', 'misty-visions', 'otherworldly-leap']) {
      expect(ids).toContain(id);
    }
  });

  it('the warlock L1 OfferChoice exposes the slice-513 invocation options', () => {
    const w = PACK.classes.find((c) => c.id === 'warlock')!;
    const feat = w.levelTable['1']!.features.find((f) => f.id === 'eldritch-invocations-2')!;
    const oc = feat.effects[0] as {
      kind: string;
      oneOf: number;
      options: ReadonlyArray<{ id: string }>;
    };
    expect(oc.oneOf).toBe(1);
    const ids = oc.options.map((o) => o.id);
    for (const id of ['armor-of-shadows', 'devils-sight', 'fiendish-vigor', 'mask-of-many-faces', 'misty-visions', 'otherworldly-leap']) {
      expect(ids).toContain(id);
    }
  });

  it.each(NEW_INVOCATIONS)('the $featId invocation grants $spellId via the bearer\'s effective spell list', ({ featId, spellId }) => {
    const warlock = buildWarlock([]);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(513) });
    let campaign: Campaign = engine.createCampaign({ name: featId });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedInvocationPick(warlock.id, featId),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells().find((g) => g.spellId === spellId);
    expect(granted).toBeDefined();
    expect(granted!.preparation).toBe('at-will');
  });

  it('Devil\'s Sight grants 120 ft darkvision (engine deviation: magical-darkness arm not modeled)', () => {
    const warlock = buildWarlock([]);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(514) });
    let campaign: Campaign = engine.createCampaign({ name: 'devils-sight' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedInvocationPick(warlock.id, 'devils-sight'),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.senseRange('darkvision')).toBe(120);
  });

  it('a Warlock with Armor of Shadows casts Mage Armor without consuming a spell slot (at-will bypass)', () => {
    // Set up a warlock who knows Mage Armor via Armor of Shadows; cast it
    // and assert no SpellSlotConsumed / PactSlotConsumed event fires.
    const warlock = buildWarlock([]);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(515) });
    let campaign: Campaign = engine.createCampaign({ name: 'aos' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedInvocationPick(warlock.id, 'armor-of-shadows'),
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: warlock.id,
      spellId: 'mage-armor',
      slotLevel: 1,
      targetIds: [warlock.id],
    }).events;
    const types = events.map((e) => e.type);
    expect(types).toContain('SpellCastDeclared');
    expect(types).not.toContain('SpellSlotConsumed');
    expect(types).not.toContain('PactSlotConsumed');
  });

  it('a Warlock WITHOUT Armor of Shadows can still cast Mage Armor (knownSpells route) but consumes a slot', () => {
    // Control: same cast without the invocation -> normal slot
    // consumption. (The warlock knows mage-armor directly via knownSpells
    // for this test; in a real Warlock content surface the at-will-only
    // route is via the invocation.)
    const warlock = buildWarlock(['mage-armor']);
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(516) });
    let campaign: Campaign = engine.createCampaign({ name: 'aos-control' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: warlock.id,
      spellId: 'mage-armor',
      slotLevel: 1,
      targetIds: [warlock.id],
    }).events;
    const types = events.map((e) => e.type);
    expect(types).toContain('SpellCastDeclared');
    // Slot or pact slot consumed (warlock uses pact magic, but the cast
    // path emits one or the other for a leveled spell when not at-will).
    expect(types.some((t) => t === 'SpellSlotConsumed' || t === 'PactSlotConsumed')).toBe(true);
  });
});
