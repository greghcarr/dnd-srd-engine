// Slice 659: Barbarian L3 Primal Knowledge ability-substitution
// arm.
//
// RAW (SRD 5.2.1 Barbarian L3): "while your Rage is active, you can
// channel primal power when you attempt certain tasks; whenever you
// make an ability check using one of the following skills, you can
// make it as a Strength check even if it normally uses a different
// ability: Acrobatics, Intimidation, Perception, Stealth, or
// Survival."
//
// planAbilityCheck's new `useAbilitySubstitution` flag opt-in
// enforces: Barbarian L3+ AND raging condition active AND
// ability === 'STR' AND skill is in the five-skill set. Any gate
// failure throws. Default (flag unset) preserves the engine's
// permissive ability-acceptance for back-compat.

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

const buildBarbarian = (
  level: number = 3,
  options: { raging?: boolean } = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Krath',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level, hitDiceRemaining: level }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    hp: { current: 24, max: 24, temp: 0 },
    resources: [
      { resourceId: 'rage', current: 3, max: 3, recharge: 'longRest' },
    ],
    appliedConditions: options.raging
      ? [
          {
            id: newAppliedConditionId(),
            conditionId: 'raging',
          },
        ]
      : [],
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'primal-knowledge' });
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

describe('slice 659: Primal Knowledge ability-substitution gate', () => {
  it('accepts STR substitution for any of the 5 eligible skills when raging Barbarian L3+', () => {
    const barb = buildBarbarian(3, { raging: true });
    const s = seed(barb);
    for (const skill of ['acrobatics', 'intimidation', 'perception', 'stealth', 'survival'] as const) {
      const out = s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: barb.id,
        ability: 'STR',
        skill,
        dc: 10,
        useAbilitySubstitution: true,
      });
      expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
    }
  });

  it('rejects: skill not in the eligible set (e.g. athletics, which is already STR-default)', () => {
    const barb = buildBarbarian(3, { raging: true });
    const s = seed(barb);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: barb.id,
        ability: 'STR',
        skill: 'athletics',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/skill in/);
  });

  it('rejects: ability is not STR', () => {
    const barb = buildBarbarian(3, { raging: true });
    const s = seed(barb);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: barb.id,
        ability: 'DEX',
        skill: 'acrobatics',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/ability='STR'/);
  });

  it('rejects: barbarian under L3', () => {
    const lowBarb = buildBarbarian(2, { raging: true });
    const s = seed(lowBarb);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: lowBarb.id,
        ability: 'STR',
        skill: 'stealth',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/Primal Knowledge/);
  });

  it('rejects: non-barbarian', () => {
    const wizard = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Pell',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 8 },
      hp: { current: 28, max: 28, temp: 0 },
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'raging' }],
    });
    const s = seed(wizard);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: wizard.id,
        ability: 'STR',
        skill: 'perception',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/Primal Knowledge/);
  });

  it('rejects: Barbarian L3+ but not raging (no raging condition active)', () => {
    const barb = buildBarbarian(3, { raging: false });
    const s = seed(barb);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: barb.id,
        ability: 'STR',
        skill: 'intimidation',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/Rage is not active/);
  });

  it('back-compat: useAbilitySubstitution=false (default) preserves permissive behavior (no gate)', () => {
    // A non-raging Wizard can still call planAbilityCheck with
    // ability='STR', skill='perception' (totally unrealistic per
    // RAW, but the engine's existing permissive behavior is
    // preserved when useAbilitySubstitution is not set).
    const wizard = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Pell',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 8 },
      hp: { current: 28, max: 28, temp: 0 },
    });
    const s = seed(wizard);
    const out = s.engine.plan.abilityCheck(s.campaign.state, {
      characterId: wizard.id,
      ability: 'STR',
      skill: 'perception',
      dc: 10,
      // useAbilitySubstitution NOT set
    });
    expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
  });
});
