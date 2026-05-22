// Unit test for the condition-immunity gate in spell condition
// application. The cast-spell planner now consults
// `isImmuneToCondition` before staging a `ConditionApplied` event in
// the save (conditionOnFail) and buff branches, so a target whose
// effect stack carries `GrantConditionImmunity { <conditionId> }`
// won't have the condition applied on a failed save.
//
// Two paths exercised:
//
//   1. Paladin's own L10 Aura of Courage: the feature has
//      `GrantConditionImmunity { frightened }` as a sibling effect on
//      the paladin themselves. Casting Cause Fear (save mechanic with
//      conditionOnFail: 'frightened') on the paladin must NOT apply
//      Frightened, even when the save fails.
//
//   2. Ally projection: an ally with `aura-of-courage-active` applied
//      (the condition the paladin's Aura of Courage projects on
//      in-range allies) also carries the immunity. Cause Fear on
//      the ally must NOT apply Frightened either.
//
// A control case (L1 fighter with no immunity) still gets Frightened
// applied on a failed save, proving the gate doesn't over-fire.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, loadPhbExtrasTestPack } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const buildCaster = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Vex',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, WIS: 10, INT: 18, CHA: 10 },
    hp: { current: 35, max: 35, temp: 0 },
    featsTaken: [],
    preparedSpells: ['cause-fear'],
  });

const buildPaladin = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ariadne',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'paladin', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 8, CHA: 14 },
    hp: { current: 40, max: 40, temp: 0 },
    featsTaken: [],
  });

const buildAlly = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Bran',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 8, CHA: 8 },
    hp: { current: 25, max: 25, temp: 0 },
    featsTaken: [],
  });

const PACK = loadStarterPack();

// Casts cause-fear repeatedly with fresh RNG seeds until the target's
// WIS save fails. Returns the event stream from the failing cast (or
// null if no seed in range produces a failure). The scene builder
// constructs caster + target with fresh ULIDs each iteration, so the
// target id must be returned by the builder and used in the cast.
interface Scene {
  readonly engine: ReturnType<typeof createEngine>;
  readonly state: import('../../../src/schemas/runtime/campaign.js').CampaignState;
  readonly casterId: string;
  readonly targetId: string;
}

const castUntilSaveFails = (
  buildScene: (rng: ReturnType<typeof seededRNG>) => Scene,
): ReadonlyArray<Event> | null => {
  for (let seed = 1; seed < 60; seed += 1) {
    const { engine, state, casterId, targetId } = buildScene(seededRNG(seed));
    const events = engine.plan.castSpell(state, {
      characterId: casterId,
      spellId: 'cause-fear',
      slotLevel: 1,
      targetIds: [targetId],
    }).events;
    const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
    if (save !== undefined && save.success === false) return events;
  }
  return null;
};

describe('condition-immunity gate (spell condition application)', () => {
  it('Paladin with L10 Aura of Courage avoids Frightened on a failed save', () => {
    const events = castUntilSaveFails((rng) => {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng });
      const caster = buildCaster();
      const paladin = buildPaladin(10);
      let campaign = engine.createCampaign({ name: 'aoc-paladin' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: caster,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: paladin,
        } satisfies CharacterCreatedEvent,
      ]);
      return { engine, state: campaign.state, casterId: caster.id, targetId: paladin.id };
    });
    expect(events, 'no failed save across seeds').not.toBeNull();
    const frightenedApplied = events!.find(
      (e) => e.type === 'ConditionApplied' && e.conditionId === 'frightened',
    );
    expect(frightenedApplied).toBeUndefined();
  });

  it('Ally with aura-of-courage-active condition avoids Frightened on a failed save', () => {
    const events = castUntilSaveFails((rng) => {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng });
      const caster = buildCaster();
      const paladin = buildPaladin(10);
      const ally = buildAlly();
      let campaign = engine.createCampaign({ name: 'aoc-ally' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: caster,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: paladin,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: ally,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConditionApplied',
          targetId: ally.id as ULID,
          conditionId: 'aura-of-courage-active',
          appliedConditionId: newAppliedConditionId(),
          sourceCharacterId: paladin.id as ULID,
        } satisfies ConditionAppliedEvent,
      ]);
      return { engine, state: campaign.state, casterId: caster.id, targetId: ally.id };
    });
    expect(events, 'no failed save across seeds').not.toBeNull();
    const frightenedApplied = events!.find(
      (e) => e.type === 'ConditionApplied' && e.conditionId === 'frightened',
    );
    expect(frightenedApplied).toBeUndefined();
  });

  it('Ally without immunity gets Frightened on a failed save (control)', () => {
    const events = castUntilSaveFails((rng) => {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng });
      const caster = buildCaster();
      const ally = buildAlly();
      let campaign = engine.createCampaign({ name: 'no-immunity' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: caster,
        } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: ally,
        } satisfies CharacterCreatedEvent,
      ]);
      return { engine, state: campaign.state, casterId: caster.id, targetId: ally.id };
    });
    expect(events, 'no failed save across seeds').not.toBeNull();
    const frightenedApplied = events!.find(
      (e) => e.type === 'ConditionApplied' && e.conditionId === 'frightened',
    );
    expect(frightenedApplied).toBeDefined();
  });
});
