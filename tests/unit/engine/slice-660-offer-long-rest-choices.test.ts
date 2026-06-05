// Slice 660: offerLongRestChoices — emit ChoiceRequired events for
// onLongRest OfferChoices on a character.
//
// Sibling of slice-618's offerCharacterChoices (onAcquire choices).
// The canonical user is Druid Circle of the Land's land-type pick,
// which per RAW the druid makes "whenever you finish a Long Rest."
//
// What this audit pins:
//   - The planner exists and emits ChoiceRequired for the Circle of
//     the Land Spells onLongRest OfferChoice.
//   - The planner dedupes against UNRESOLVED PendingChoices with the
//     same promptKey (no double-emit if the consumer invokes twice
//     before resolving the prior).
//   - Each long rest after resolution gets a fresh ChoiceRequired
//     (the supersession of prior resolutions is a deferred RAW
//     refinement; today the engine accumulates resolutions).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();

const buildL3LandDruid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wren',
    speciesId: 'elf',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 3, hitDiceRemaining: 3, subclassId: 'circle-of-the-land' }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
    hp: { current: 22, max: 22, temp: 0 },
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'long-rest-choices' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 660: offerLongRestChoices (Circle of the Land land swap)', () => {
  it('emits ChoiceRequired with the 4 SRD lands for a fresh L3 Circle of the Land druid', () => {
    const druid = buildL3LandDruid();
    const s = seed(druid);
    const { events } = s.engine.plan.offerLongRestChoices(s.campaign.state, {
      characterId: druid.id,
    });
    const choice = events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'circle-of-the-land-type',
    );
    expect(choice, 'Circle Spells (land type) onLongRest choice not emitted').toBeDefined();
    expect(choice!.options.map((o) => o.id).sort()).toEqual(['arid', 'polar', 'temperate', 'tropical']);
  });

  it('dedupe: does NOT double-emit when an unresolved PendingChoice already exists for the same promptKey', () => {
    const druid = buildL3LandDruid();
    const s = seed(druid);
    const first = s.engine.plan.offerLongRestChoices(s.campaign.state, {
      characterId: druid.id,
    });
    const campaignAfterFirst = commit(s.campaign, first.events);
    // Don't resolve. Second call should NOT re-emit (dedupes against
    // the unresolved PendingChoice).
    const second = s.engine.plan.offerLongRestChoices(campaignAfterFirst.state, {
      characterId: druid.id,
    });
    const choice = second.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'circle-of-the-land-type',
    );
    expect(choice).toBeUndefined();
  });

  it('after resolution, a subsequent call emits a fresh ChoiceRequired (RAW: each long rest = new pick)', () => {
    const druid = buildL3LandDruid();
    const s = seed(druid);
    const first = s.engine.plan.offerLongRestChoices(s.campaign.state, {
      characterId: druid.id,
    });
    let campaign = commit(s.campaign, first.events);
    const firstChoice = first.events.find(
      (e): e is ChoiceRequiredEvent => e.type === 'ChoiceRequired' && e.promptKey === 'circle-of-the-land-type',
    )!;
    const resolveOut = s.engine.plan.resolveChoice(campaign.state, {
      choiceId: firstChoice.choiceId,
      characterId: druid.id,
      selectedOptionIds: ['arid'],
    });
    campaign = commit(campaign, resolveOut.events);

    // Second long rest — fresh ChoiceRequired fires (resolved prior
    // doesn't dedupe).
    const second = s.engine.plan.offerLongRestChoices(campaign.state, {
      characterId: druid.id,
    });
    const secondChoice = second.events.find(
      (e): e is ChoiceRequiredEvent => e.type === 'ChoiceRequired' && e.promptKey === 'circle-of-the-land-type',
    );
    expect(secondChoice, 'fresh ChoiceRequired should fire on next long rest').toBeDefined();
    // The second pick has a different choiceId (fresh PendingChoice
    // each long rest).
    expect(secondChoice!.choiceId).not.toBe(firstChoice.choiceId);
  });

  it('does NOT emit for characters without any onLongRest OfferChoices (no-op for a Fighter)', () => {
    const fighter = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Pell',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3, subclassId: 'champion' }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 24, max: 24, temp: 0 },
    });
    const s = seed(fighter);
    const out = s.engine.plan.offerLongRestChoices(s.campaign.state, {
      characterId: fighter.id,
    });
    expect(out.events).toHaveLength(0);
  });
});
