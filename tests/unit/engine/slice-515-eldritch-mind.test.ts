// Slice 515: Eldritch Mind invocation + `event.isConcentrationCheck`
// save-facts entry.
//
// RAW (Eldritch Mind invocation): "You have advantage on Constitution
// saving throws that you make to maintain Concentration."
//
// Engine extension: `computeSavingThrow` now exposes a new
// `isConcentrationCheck` boolean input. When true, the SetAdvantage
// condition facts include `event.isConcentrationCheck: true` (else
// false). Only `planConcentrationBreakOnDrop` passes true; all other
// CON saves (spell saves, recurring-save planners, etc.) leave it
// false. The Eldritch Mind feat's `SetAdvantage on save(CON)` carries
// `condition: eq event.isConcentrationCheck true` so it fires ONLY for
// concentration checks (not for ordinary CON saves like poison or hold
// person).

import { describe, expect, it } from 'vitest';
import { computeSavingThrow } from '../../../src/derive/save.js';
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

describe('Eldritch Mind invocation (slice 515)', () => {
  it('ships the eldritch-mind invocation with the SetAdvantage condition gating on event.isConcentrationCheck', () => {
    const feat = PACK.feats.find((f) => f.id === 'eldritch-mind');
    expect(feat).toBeDefined();
    expect(feat!.category).toBe('invocation');
    expect(feat!.effects).toEqual([
      {
        kind: 'SetAdvantage',
        on: { kind: 'save', ability: 'CON' },
        mode: 'advantage',
        condition: { kind: 'eq', path: 'event.isConcentrationCheck', value: true },
      },
    ]);
  });

  it('a warlock with Eldritch Mind gets advantage on a CON save with isConcentrationCheck=true', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(515) });
    let campaign: Campaign = engine.createCampaign({ name: 'em' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      ...seedInvocationPick(warlock.id, 'eldritch-mind'),
    ]);
    const stored = campaign.state.characters[warlock.id]!;
    const concentrationSave = computeSavingThrow({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'CON',
      pendingChoices: campaign.state.pendingChoices,
      isConcentrationCheck: true,
    });
    expect(concentrationSave.hasAdvantage).toBe(true);
    // A non-concentration CON save (poison, hold person, etc.) does NOT
    // get the advantage.
    const ordinaryConSave = computeSavingThrow({
      character: stored,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'CON',
      pendingChoices: campaign.state.pendingChoices,
      // isConcentrationCheck defaults to false.
    });
    expect(ordinaryConSave.hasAdvantage).toBe(false);
  });

  it('a warlock WITHOUT Eldritch Mind does NOT get advantage on a concentration CON save', () => {
    const warlock = buildWarlock();
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(516) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-em' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
      // No invocation picked.
    ]);
    const concentrationSave = computeSavingThrow({
      character: campaign.state.characters[warlock.id]!,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'CON',
      pendingChoices: campaign.state.pendingChoices,
      isConcentrationCheck: true,
    });
    expect(concentrationSave.hasAdvantage).toBe(false);
  });

  it('the L1 OfferChoice now exposes Eldritch Mind alongside the other invocations', () => {
    const w = PACK.classes.find((c) => c.id === 'warlock')!;
    const feat = w.levelTable['1']!.features.find((f) => f.id === 'eldritch-invocations-2')!;
    const oc = feat.effects[0] as { options: ReadonlyArray<{ id: string }> };
    expect(oc.options.map((o) => o.id)).toContain('eldritch-mind');
  });
});
