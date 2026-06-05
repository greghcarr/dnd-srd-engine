// Slice 662: generic `GrantAbilitySubstitution` Effect primitive.
//
// Replaces the slice-659 hardcoded Primal Knowledge gate with a
// content-driven primitive. RAW shape: "for ability checks using
// <skill> ∈ skills, you can use <ability> instead — optionally only
// while a named condition is active." The planner walks the bearer's
// effective effect stack for `GrantAbilitySubstitution` and accepts
// iff some grant matches (ability, skill, activeWhileConditionId).
//
// This audit pins the primitive's reusability (NOT just Primal
// Knowledge's specific shape):
//   1. A hypothetical future GrantAbilitySubstitution without an
//      activeWhileConditionId works unconditionally.
//   2. A grant with a different gating condition works when that
//      condition is active.
//   3. Multiple grants on a single bearer compose (the planner picks
//      whichever matches; first match wins).
//
// Authored via injected synthetic effects on a custom condition so
// the audit doesn't require new content rows. Real users (Primal
// Knowledge) covered by slice 659.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ContentPack } from '../../../src/content/pack.js';

const BASE_PACK = loadStarterPack();

// Build a derived pack with two synthetic test conditions that
// project GrantAbilitySubstitution effects via condition `effects`.
// Lets the audit exercise the primitive without touching the
// real content rows.
const buildTestPack = (): ContentPack => ({
  ...BASE_PACK,
  conditions: [
    ...(BASE_PACK.conditions ?? []),
    {
      id: 'sub-test-unconditional',
      name: 'Sub Test (Unconditional)',
      effects: [
        {
          kind: 'GrantAbilitySubstitution',
          ability: 'WIS',
          skills: ['athletics'],
        },
      ],
    },
    {
      id: 'sub-test-gated-on-blessed',
      name: 'Sub Test (Gated on Blessed)',
      effects: [
        {
          kind: 'GrantAbilitySubstitution',
          ability: 'CHA',
          skills: ['arcana'],
          activeWhileConditionId: 'blessed',
        },
      ],
    },
    {
      id: 'sub-test-multi-skill',
      name: 'Sub Test (Multi-skill)',
      effects: [
        {
          kind: 'GrantAbilitySubstitution',
          ability: 'INT',
          skills: ['persuasion', 'deception'],
        },
      ],
    },
  ],
});

const buildCharacter = (conditionIds: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sub Tester',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    appliedConditions: conditionIds.map((id) => ({
      id: newAppliedConditionId(),
      conditionId: id,
    })),
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [buildTestPack()], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'sub-primitive' });
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

describe('slice 662: GrantAbilitySubstitution primitive (reusable)', () => {
  it('unconditional grant (no activeWhileConditionId) accepts the substitution at any time', () => {
    const character = buildCharacter(['sub-test-unconditional']);
    const s = seed(character);
    const out = s.engine.plan.abilityCheck(s.campaign.state, {
      characterId: character.id,
      ability: 'WIS',
      skill: 'athletics',
      dc: 10,
      useAbilitySubstitution: true,
    });
    expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
  });

  it('gated grant ACCEPTS when the activeWhileConditionId is active', () => {
    const character = buildCharacter(['sub-test-gated-on-blessed', 'blessed']);
    const s = seed(character);
    const out = s.engine.plan.abilityCheck(s.campaign.state, {
      characterId: character.id,
      ability: 'CHA',
      skill: 'arcana',
      dc: 10,
      useAbilitySubstitution: true,
    });
    expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
  });

  it('gated grant REJECTS when the activeWhileConditionId is NOT active', () => {
    const character = buildCharacter(['sub-test-gated-on-blessed']);
    const s = seed(character);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: character.id,
        ability: 'CHA',
        skill: 'arcana',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/no ability substitution matching.*while blessed/);
  });

  it('multi-skill grant accepts ALL listed skills under the same ability', () => {
    const character = buildCharacter(['sub-test-multi-skill']);
    const s = seed(character);
    for (const skill of ['persuasion', 'deception'] as const) {
      const out = s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: character.id,
        ability: 'INT',
        skill,
        dc: 10,
        useAbilitySubstitution: true,
      });
      expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
    }
  });

  it('multi-skill grant REJECTS a skill not in its list', () => {
    const character = buildCharacter(['sub-test-multi-skill']);
    const s = seed(character);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: character.id,
        ability: 'INT',
        skill: 'history',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/no ability substitution matching.*skill='history'/);
  });

  it('multiple grants on one bearer compose (any matching grant accepts)', () => {
    const character = buildCharacter([
      'sub-test-unconditional',
      'sub-test-multi-skill',
    ]);
    const s = seed(character);
    // First grant (WIS, athletics) works.
    const a = s.engine.plan.abilityCheck(s.campaign.state, {
      characterId: character.id,
      ability: 'WIS',
      skill: 'athletics',
      dc: 10,
      useAbilitySubstitution: true,
    });
    expect(a.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
    // Second grant (INT, persuasion) works.
    const b = s.engine.plan.abilityCheck(s.campaign.state, {
      characterId: character.id,
      ability: 'INT',
      skill: 'persuasion',
      dc: 10,
      useAbilitySubstitution: true,
    });
    expect(b.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
  });

  it('Primal Knowledge content (real users at L3+ raging) flows through the same primitive', () => {
    // Confirms that the Barbarian L3 primal-knowledge feature ships
    // a GrantAbilitySubstitution that the planner picks up through
    // the same code path as the synthetic test grants above. The
    // content-side wiring is the deliverable; slice 659's existing
    // 7 tests verify the gate behavior with the real Barbarian.
    const engine = createEngine({ contentPacks: [BASE_PACK], rng: seededRNG(1) });
    const barb = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Krath',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'barbarian', level: 3, hitDiceRemaining: 3 }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      hp: { current: 24, max: 24, temp: 0 },
      resources: [{ resourceId: 'rage', current: 3, max: 3, recharge: 'longRest' }],
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'raging' }],
    });
    let campaign = engine.createCampaign({ name: 'real-primal-knowledge' });
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: barb,
      } satisfies CharacterCreatedEvent,
    ]);
    const out = engine.plan.abilityCheck(campaign.state, {
      characterId: barb.id,
      ability: 'STR',
      skill: 'intimidation',
      dc: 12,
      useAbilitySubstitution: true,
    });
    expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
  });
});
