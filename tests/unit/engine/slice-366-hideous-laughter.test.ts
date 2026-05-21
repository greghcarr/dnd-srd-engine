// Slice 366 - Hideous Laughter: the applied condition is now action-blocking.
//
// Bug (logged in the slice-361 empty-effect-condition sweep): Hideous
// Laughter applied `hideous-laughter-active` on a failed WIS save, and the
// condition carried a recurring end-of-turn save, but it was NOT in
// ACTION_BLOCKING_CONDITIONS - so a creature "incapacitated by laughter"
// could still take actions. RAW 2024: on a failed save the target has the
// Prone and Incapacitated conditions. Incapacitated and Prone are
// engine-coded base conditions (Incapacitated via the action-blocking
// allowlist, Prone via the literal-id attack logic), so the fix mirrors
// the held-paralyzed-active / power-word-stunned-active precedent: add the
// variant id to ACTION_BLOCKING_CONDITIONS. The recurring save was already
// wired; the Prone attacker-side advantage stays a documented deviation.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import {
  findActorBlockingCondition,
  assertActorCanAct,
  ACTION_BLOCKING_CONDITIONS,
} from '../../../src/engine/plan/_actor-state.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONDITION_ID = 'hideous-laughter-active';

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Jester',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 24, max: 24, temp: 0 },
    preparedSpells: ['hideous-laughter'],
  });

const buildLowWisTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hapless Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 6, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

// Casts Hideous Laughter and returns the post-cast state, looping seeds
// until the target fails the WIS save (the condition lands).
const castUntilLanded = (): { campaign: Campaign; targetId: string } => {
  for (let seed = 1; seed < 200; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const caster = buildCaster();
    const target = buildLowWisTarget();
    let campaign: Campaign = engine.createCampaign({ name: `hl-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'hideous-laughter',
      slotLevel: 1,
      targetIds: [target.id],
    }).events;
    if (!events.some((e) => e.type === 'ConditionApplied' && (e as { conditionId?: string }).conditionId === CONDITION_ID)) {
      continue;
    }
    return { campaign: commit(campaign, events), targetId: target.id };
  }
  throw new Error('no seed produced a failed save (condition landed)');
};

describe('slice 366: Hideous Laughter is action-blocking', () => {
  it('the variant condition is registered as action-blocking', () => {
    expect(ACTION_BLOCKING_CONDITIONS.has(CONDITION_ID)).toBe(true);
  });

  it('a creature that fails the save cannot take actions', () => {
    const { campaign, targetId } = castUntilLanded();
    const target = campaign.state.characters[targetId]!;
    expect(target.appliedConditions.some((c) => c.conditionId === CONDITION_ID)).toBe(true);
    expect(findActorBlockingCondition(target)).toBe(CONDITION_ID);
    expect(() => assertActorCanAct(target, 'Attack')).toThrow();
  });
});
