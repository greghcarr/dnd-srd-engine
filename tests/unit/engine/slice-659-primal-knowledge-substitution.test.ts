// Slice 659: Barbarian L3 Primal Knowledge ability-substitution
// arm. **Slice 662**: the hardcoded class / level / condition / ability /
// skills gate was replaced with content-driven matching against
// `GrantAbilitySubstitution` effects on the bearer's effect stack.
// The behavioral envelope (which combos accept / reject) is
// unchanged; only the error messages shifted to a generic shape.
//
// RAW (SRD 5.2.1 Barbarian L3): "while your Rage is active, you can
// channel primal power when you attempt certain tasks; whenever you
// make an ability check using one of the following skills, you can
// make it as a Strength check even if it normally uses a different
// ability: Acrobatics, Intimidation, Perception, Stealth, or
// Survival."
//
// `planAbilityCheck` reads `GrantAbilitySubstitution` effects when
// `useAbilitySubstitution: true`. Primal Knowledge ships one
// (ability='STR', skills=[acrobatics, intimidation, perception,
// stealth, survival], activeWhileConditionId='raging'). The planner
// accepts iff a granted substitution matches the requested (ability,
// skill) and (if the activeWhileConditionId is set) the bearer has
// that condition active. Default unset preserves permissive back-
// compat.

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

  it('rejects: skill not in the eligible set (history is INT-default and not in Primal Knowledge skills)', () => {
    // Pre-663: this slot used (STR, athletics) which is now a RAW-
    // default match so the substitution check is skipped. Switched
    // to (STR, history) — STR is NOT history's default (INT is) so
    // the substitution gate fires; Primal Knowledge doesn't cover
    // history → throws.
    const barb = buildBarbarian(3, { raging: true });
    const s = seed(barb);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: barb.id,
        ability: 'STR',
        skill: 'history',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/skill='history'.*no ability substitution matching/);
  });

  it('rejects: ability is not STR (DEX for intimidation, which is Primal-Knowledge-eligible but only via STR)', () => {
    // Pre-663: (DEX, acrobatics) is now a RAW-default match.
    // Switched to (DEX, intimidation) — CHA is intimidation's
    // default so DEX requires a substitution; Primal Knowledge
    // only grants STR for intimidation, not DEX → throws.
    const barb = buildBarbarian(3, { raging: true });
    const s = seed(barb);
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: barb.id,
        ability: 'DEX',
        skill: 'intimidation',
        dc: 10,
        useAbilitySubstitution: true,
      }),
    ).toThrow(/ability='DEX'.*no ability substitution matching/);
  });

  it('rejects: barbarian under L3 (no Primal Knowledge feature in effect stack yet)', () => {
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
    ).toThrow(/no ability substitution matching/);
  });

  it('rejects: non-barbarian (no GrantAbilitySubstitution on effect stack)', () => {
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
    ).toThrow(/no ability substitution matching.*no ability substitutions granted/);
  });

  it('rejects: Barbarian L3+ but not raging (activeWhileConditionId not satisfied)', () => {
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
    ).toThrow(/no ability substitution matching.*while raging/);
  });

  it('slice 663: always-enforce (useAbilitySubstitution flag is a no-op; the gate fires whenever ability != SKILL_ABILITY[skill])', () => {
    // Pre-663: useAbilitySubstitution=false made the engine
    // permissively accept (STR, perception). Slice 663 lifts
    // the gate so the substitution check is always-enforced —
    // any non-default-ability skill check needs a granted
    // substitution. The flag is retained as a no-op.
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
    expect(() =>
      s.engine.plan.abilityCheck(s.campaign.state, {
        characterId: wizard.id,
        ability: 'STR',
        skill: 'perception',
        dc: 10,
        // useAbilitySubstitution NOT set — slice 663 still gates.
      }),
    ).toThrow(/cannot use ability='STR' for skill='perception'/);
  });

  it('slice 663: RAW-default ability still passes (WIS for perception, the default)', () => {
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
      ability: 'WIS',
      skill: 'perception',
      dc: 10,
    });
    expect(out.events.some((e) => e.type === 'AbilityCheckRolled')).toBe(true);
  });
});
