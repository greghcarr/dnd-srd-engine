// Slice 517: ChoiceResolved cascade primitive + Pact of the Tome
// canonical user.
//
// RAW (Pact of the Tome): "Stitching together strands of shadow, you
// conjure forth a book... choose three cantrips, and choose two level 1
// spells that have the Ritual tag. The spells can be from any class's
// spell list... While the book is on your person, you have the chosen
// spells prepared, and they function as Warlock spells for you."
//
// Engine extension: `planResolveChoice` now cascades — when a resolved
// option's effects include `OfferChoice` (post-`GrantFeat` expansion),
// the planner emits follow-up `ChoiceRequired` events for each nested
// OfferChoice (`when !== 'onLongRest'`, mirror of planLevelUp's filter).
// This is the missing piece that lets a feat granted by an OfferChoice
// option carry its own player picks.
//
// Content: Pact of the Tome ships two nested OfferChoices (3 cantrips
// over the pack's 27 cantrips; 2 L1 ritual spells over the 11 L1 rituals).
// Each option's effects is a single `GrantSpell preparation: 'always-
// prepared' spellcastingAbility: 'CHA'` (RAW deviation: "while book is
// on your person" is consumer-managed; the engine has no item-bound
// preparation gate, so the spells stay prepared as long as the
// invocation is active).

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

const buildWarlock = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: [],
    preparedSpells: [],
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

describe('ChoiceResolved cascade + Pact of the Tome (slice 517)', () => {
  it('ships pact-of-the-tome as an invocation with two nested OfferChoices (cantrips + L1 rituals)', () => {
    const feat = PACK.feats.find((f) => f.id === 'pact-of-the-tome');
    expect(feat).toBeDefined();
    expect(feat!.category).toBe('invocation');
    expect(feat!.effects).toHaveLength(2);
    const effects = feat!.effects as ReadonlyArray<{ kind: string; oneOf: number; options: ReadonlyArray<{ id: string }> }>;
    const cantripChoice = effects[0]!;
    const ritualChoice = effects[1]!;
    expect(cantripChoice.kind).toBe('OfferChoice');
    expect(cantripChoice.oneOf).toBe(3);
    expect(cantripChoice.options.length).toBeGreaterThanOrEqual(11); // 27 cantrips in the SRD pack
    expect(ritualChoice.kind).toBe('OfferChoice');
    expect(ritualChoice.oneOf).toBe(2);
    expect(ritualChoice.options.length).toBeGreaterThanOrEqual(5); // 11 L1 rituals in the SRD pack
  });

  it('planResolveChoice cascades: resolving an OfferChoice option whose effects include nested OfferChoices emits follow-up ChoiceRequired events', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(517) });
    let campaign: Campaign = engine.createCampaign({ name: 'pact-cascade' });
    const outerChoiceId = newChoiceId();
    // First commit the character + an outer L1 invocation OfferChoice that
    // hasn't been resolved yet.
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      {
        id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired',
        choiceId: outerChoiceId, characterId: warlock.id,
        promptKey: 'eldritch-invocations-l1', prompt: 'Pick an invocation.',
        options: [{
          id: 'pact-of-the-tome', label: 'Pact of the Tome',
          effects: [{ kind: 'GrantFeat', featId: 'pact-of-the-tome' }],
        }],
        oneOf: 1,
      } satisfies ChoiceRequiredEvent,
    ]);
    // Now resolve the outer choice — the cascade should emit two follow-up
    // ChoiceRequired events (the cantrip choice + the ritual choice).
    const events = engine.plan.resolveChoice(campaign.state, {
      choiceId: outerChoiceId,
      characterId: warlock.id,
      selectedOptionIds: ['pact-of-the-tome'],
    }).events;
    const resolved = events.filter((e) => e.type === 'ChoiceResolved');
    const cascaded = events.filter((e) => e.type === 'ChoiceRequired') as ChoiceRequiredEvent[];
    expect(resolved).toHaveLength(1);
    expect(cascaded).toHaveLength(2);
    const cascadedPromptKeys = cascaded.map((c) => c.promptKey).sort();
    expect(cascadedPromptKeys).toEqual(['pact-of-the-tome-cantrips', 'pact-of-the-tome-rituals']);
    expect(cascaded.find((c) => c.promptKey === 'pact-of-the-tome-cantrips')!.oneOf).toBe(3);
    expect(cascaded.find((c) => c.promptKey === 'pact-of-the-tome-rituals')!.oneOf).toBe(2);
  });

  it('end-to-end: a warlock who resolves Pact of the Tome + the two nested choices has all 5 chosen spells prepared', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(518) });
    let campaign: Campaign = engine.createCampaign({ name: 'pact-e2e' });
    const outerChoiceId = newChoiceId();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      {
        id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired',
        choiceId: outerChoiceId, characterId: warlock.id,
        promptKey: 'eldritch-invocations-l1', prompt: 'Pick an invocation.',
        options: [{ id: 'pact-of-the-tome', label: 'Pact of the Tome', effects: [{ kind: 'GrantFeat', featId: 'pact-of-the-tome' }] }],
        oneOf: 1,
      } satisfies ChoiceRequiredEvent,
    ]);
    // Resolve the outer choice; commit the cascade.
    const outerEvents = engine.plan.resolveChoice(campaign.state, {
      choiceId: outerChoiceId,
      characterId: warlock.id,
      selectedOptionIds: ['pact-of-the-tome'],
    }).events;
    campaign = commit(campaign, outerEvents);
    // Identify the cascaded ChoiceRequired events; resolve each.
    const cascaded = outerEvents.filter((e) => e.type === 'ChoiceRequired') as ChoiceRequiredEvent[];
    const cantripsCR = cascaded.find((c) => c.promptKey === 'pact-of-the-tome-cantrips')!;
    const ritualsCR = cascaded.find((c) => c.promptKey === 'pact-of-the-tome-rituals')!;
    const cantripPicks = ['light', 'guidance', 'mage-hand'];
    const ritualPicks = ['detect-magic', 'comprehend-languages'];
    const cantripsResolved = engine.plan.resolveChoice(campaign.state, {
      choiceId: cantripsCR.choiceId,
      characterId: warlock.id,
      selectedOptionIds: cantripPicks,
    }).events;
    campaign = commit(campaign, cantripsResolved);
    const ritualsResolved = engine.plan.resolveChoice(campaign.state, {
      choiceId: ritualsCR.choiceId,
      characterId: warlock.id,
      selectedOptionIds: ritualPicks,
    }).events;
    campaign = commit(campaign, ritualsResolved);
    // All 5 picked spells should now be in the warlock's granted spell
    // list via the effect stack (always-prepared, CHA spellcasting).
    const acc = buildEffectStack({
      character: campaign.state.characters[warlock.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    const granted = acc.grantedSpells().map((g) => g.spellId).sort();
    for (const id of [...cantripPicks, ...ritualPicks].sort()) {
      expect(granted).toContain(id);
    }
  });

  it('an OfferChoice option with `when: onLongRest` does NOT cascade (mirror of planLevelUp\'s filter)', () => {
    // Synthesize a one-off outer OfferChoice whose chosen option carries a
    // nested onLongRest OfferChoice; resolve and assert no cascade.
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(519) });
    let campaign: Campaign = engine.createCampaign({ name: 'onlongrest' });
    const outerChoiceId = newChoiceId();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      {
        id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired',
        choiceId: outerChoiceId, characterId: warlock.id,
        promptKey: 'synthetic', prompt: 'Pick.',
        options: [{
          id: 'opt', label: 'Option',
          effects: [{
            kind: 'OfferChoice', choiceId: 'inner', prompt: 'Inner pick (long rest).',
            oneOf: 1, when: 'onLongRest',
            options: [{ id: 'a', label: 'A', effects: [] }],
          }],
        }],
        oneOf: 1,
      } satisfies ChoiceRequiredEvent,
    ]);
    const events = engine.plan.resolveChoice(campaign.state, {
      choiceId: outerChoiceId,
      characterId: warlock.id,
      selectedOptionIds: ['opt'],
    }).events;
    expect(events.filter((e) => e.type === 'ChoiceRequired')).toHaveLength(0);
  });
});
