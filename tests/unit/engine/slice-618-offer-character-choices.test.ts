// Slice 618: a fresh L1 character built via CharacterCreated now has a
// way to drain its `when: 'onAcquire'` OfferChoice entries via
// `engine.plan.offerCharacterChoices`.
//
// Canonical user (per docs/status.md): Fighter L1 Fighting Style. Pre-
// slice the choice was never emitted for direct-built L1 fighters (only
// for fighters who reached L1 via planLevelUp, which doesn't happen
// since L1 is the floor). Paladin/Ranger work because their Fighting
// Style is gained on L1→L2 (planLevelUp emits it then).
//
// Tests:
//   1. Fresh L1 Fighter → planOfferCharacterChoices emits ChoiceRequired
//      for fighting-style with the four 2024 SRD options.
//   2. After committing the emitted event, the choice is in pendingChoices
//      AND has promptKey populated (slice 618 schema addition).
//   3. Idempotent: a second call after committing returns no events
//      (the choice is already pending, dedupe via promptKey).
//   4. Resolving the choice + calling the planner again still emits
//      nothing (the resolved choice's promptKey is still on the bearer).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/starter-pack.js';
import {
  eventId,
  isoTimestamp,
} from '../../fixtures/index.js';
import { newCharacterId } from '../../../src/ids.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';

const STARTER = loadStarterPack();

const buildL1Fighter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'L1 Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const seedFighter = () => {
  const rng = seededRNG(1);
  const engine = createEngine({ contentPacks: [STARTER], rng });
  const fighter = buildL1Fighter();
  let campaign = engine.createCampaign({ name: 'slice-618' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: fighter,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, fighterId: fighter.id };
};

describe('slice 618: planOfferCharacterChoices drains L1 OfferChoice entries on fresh characters', () => {
  it('Fresh L1 Fighter emits a ChoiceRequired for fighting-style with the four SRD options', () => {
    const { engine, campaign, fighterId } = seedFighter();
    const { events } = engine.plan.offerCharacterChoices(campaign.state, {
      characterId: fighterId,
    });
    const fightingStyleChoice = events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'fighting-style-fighter',
    );
    expect(fightingStyleChoice).toBeDefined();
    expect(fightingStyleChoice?.characterId).toBe(fighterId);
    expect(fightingStyleChoice?.oneOf).toBe(1);
    const optionIds = fightingStyleChoice?.options.map((o) => o.id).sort();
    // The six 2024 SRD fighting style options Fighter can choose from at L1.
    expect(optionIds).toEqual(['archery', 'defense', 'dueling', 'great-weapon', 'protection', 'two-weapon']);
  });

  it('After committing, the pending choice has promptKey populated (slice 618 schema)', () => {
    const { engine, campaign, fighterId } = seedFighter();
    const { events } = engine.plan.offerCharacterChoices(campaign.state, {
      characterId: fighterId,
    });
    const committed = commit(campaign, events);
    const pending = Object.values(committed.state.pendingChoices).find(
      (p) => p.forCharacterId === fighterId && p.promptKey === 'fighting-style-fighter',
    );
    expect(pending).toBeDefined();
    expect(pending?.promptKey).toBe('fighting-style-fighter');
  });

  it('Idempotent: a second call after committing returns no events for the same choice (dedupe via promptKey)', () => {
    const { engine, campaign, fighterId } = seedFighter();
    const first = engine.plan.offerCharacterChoices(campaign.state, { characterId: fighterId });
    const committed = commit(campaign, first.events);
    const second = engine.plan.offerCharacterChoices(committed.state, { characterId: fighterId });
    const fsAgain = second.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'fighting-style-fighter',
    );
    expect(fsAgain).toBeUndefined();
  });

  it('Resolved choice still suppresses re-emission (the promptKey persists on the pending entry)', () => {
    const { engine, campaign, fighterId } = seedFighter();
    let campaign1 = campaign;
    const offered = engine.plan.offerCharacterChoices(campaign1.state, { characterId: fighterId });
    campaign1 = commit(campaign1, offered.events);
    const fsChoice = Object.values(campaign1.state.pendingChoices).find(
      (p) => p.forCharacterId === fighterId && p.promptKey === 'fighting-style-fighter',
    );
    if (!fsChoice) throw new Error('Fighting style choice not pending');
    const resolved = engine.plan.resolveChoice(campaign1.state, {
      characterId: fighterId,
      choiceId: fsChoice.id,
      selectedOptionIds: ['defense'],
    });
    campaign1 = commit(campaign1, resolved.events);
    const replay = engine.plan.offerCharacterChoices(campaign1.state, { characterId: fighterId });
    const fsAgain = replay.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'fighting-style-fighter',
    );
    expect(fsAgain).toBeUndefined();
  });
});
