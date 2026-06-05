// Slice 663: always-enforce ability substitutions.
//
// Pre-663 the engine permissively accepted any (ability, skill)
// combo on an AbilityCheckIntent unless `useAbilitySubstitution`
// was explicitly opt-in. RAW says each skill has a single default
// ability (athletics=STR, perception=WIS, etc.) and only a
// granted substitution (Primal Knowledge etc.) can change that.
//
// This slice lifts the opt-in gate: every AbilityCheck with a
// skill must use the RAW-default ability for that skill OR a
// GrantAbilitySubstitution on the bearer's effect stack must
// cover the requested (ability, skill) pair. The
// `useAbilitySubstitution` field stays as a no-op for back-compat.
//
// What this pins:
//   1. RAW-default ability/skill combos succeed for any character
//      without any substitution.
//   2. Non-default combos throw without a matching grant, even
//      when useAbilitySubstitution is NOT set (the explicit-
//      enforcement flag is no longer required for the gate to
//      fire).
//   3. Raw ability checks (no skill on the intent) still accept
//      any ability — the gate only kicks in when a skill is
//      named.
//   4. A character with a matching GrantAbilitySubstitution can
//      still use the non-default ability without explicit opt-in.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const buildBarbarian = (level: number, raging: boolean): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Krath',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    hp: { current: 24, max: 24, temp: 0 },
    resources: [{ resourceId: 'rage', current: 3, max: 3, recharge: 'longRest' }],
    appliedConditions: raging
      ? [{ id: newAppliedConditionId(), conditionId: 'raging' }]
      : [],
  });

const buildVanillaWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pell',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 8 },
    hp: { current: 28, max: 28, temp: 0 },
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'always-enforce' });
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

describe('slice 663: always-enforce ability substitutions', () => {
  it('RAW-default combos succeed without a substitution (STR athletics, WIS perception, etc.)', () => {
    const wizard = buildVanillaWizard();
    const s = seed(wizard);
    for (const [ability, skill] of [
      ['STR', 'athletics'],
      ['DEX', 'acrobatics'],
      ['DEX', 'stealth'],
      ['INT', 'arcana'],
      ['INT', 'history'],
      ['WIS', 'perception'],
      ['WIS', 'insight'],
      ['CHA', 'persuasion'],
    ] as const) {
      const out = s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: wizard.id,
        ability,
        skill,
        dc: 10,
      });
      expect(
        out.events.some((e) => e.type === 'AbilityCheckRolled'),
        `RAW-default ${ability}+${skill} failed`,
      ).toBe(true);
    }
  });

  it('non-default combos throw EVEN WHEN useAbilitySubstitution is NOT set (the gate is unconditional)', () => {
    const wizard = buildVanillaWizard();
    const s = seed(wizard);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: wizard.id,
        ability: 'STR',
        skill: 'perception',
        dc: 10,
        // useAbilitySubstitution NOT set — slice 663 always gates.
      }),
    ).toThrow(/cannot use ability='STR' for skill='perception'.*RAW default is 'WIS'/);
  });

  it('useAbilitySubstitution flag is a no-op (set or unset, behavior is identical)', () => {
    const wizard = buildVanillaWizard();
    const s = seed(wizard);
    // With flag set.
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: wizard.id,
        ability: 'INT',
        skill: 'athletics',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/cannot use ability='INT' for skill='athletics'/);
    // Without flag — same throw.
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: wizard.id,
        ability: 'INT',
        skill: 'athletics',
        dc: 10,
      }),
    ).toThrow(/cannot use ability='INT' for skill='athletics'/);
  });

  it('raw ability check (no skill on the intent) accepts any ability', () => {
    // Pre-RAW-skill checks are "raw" CON saves, STR contests, etc.
    // The slice-663 gate only fires when intent.skill is set; raw
    // checks have no skill so the gate is skipped.
    const wizard = buildVanillaWizard();
    const s = seed(wizard);
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      const out = s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: wizard.id,
        ability,
        dc: 10,
        // No skill — raw ability check.
      });
      expect(
        out.events.some((e) => e.type === 'AbilityCheckRolled'),
        `raw ability check with ${ability} failed`,
      ).toBe(true);
    }
  });

  it('Primal Knowledge accepts substitution WITHOUT explicit useAbilitySubstitution opt-in (slice 663: implicit)', () => {
    // Pre-663 the consumer needed `useAbilitySubstitution: true`
    // to even ATTEMPT the substitution; slice 663 makes the
    // engine try implicitly when the ability doesn't match the
    // skill's RAW default.
    const barb = buildBarbarian(3, true);
    const s = seed(barb);
    const out = s.engine.plan.abilityCheck(s.campaign.state, {
      characterId: barb.id,
      ability: 'STR',
      skill: 'intimidation',
      dc: 10,
      // useAbilitySubstitution NOT set — Primal Knowledge still applies.
    });
    expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
  });

  it('Primal Knowledge: substitution still rejected when condition is not active (not raging)', () => {
    const barb = buildBarbarian(3, false);
    const s = seed(barb);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: barb.id,
        ability: 'STR',
        skill: 'intimidation',
        dc: 10,
      }),
    ).toThrow(/cannot use ability='STR' for skill='intimidation'.*RAW default is 'CHA'.*while raging/);
  });
});
