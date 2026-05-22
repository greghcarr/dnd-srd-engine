// Slice 412: character-sheet view model (read layer, part 2).
//
// `computeDerivedCharacter` already assembles the top of a sheet (level,
// PB, ability mods, HP, AC, saves, spell slots, languages). This wraps
// it into the consumer-facing `CharacterSheet` and composes the
// computed-stats a sheet conspicuously needs but that aggregate omits:
// all 18 skills (modifier + proficiency + advantage), the three passive
// scores, and initiative. Pure assembly over existing derivations: it
// invents no rules, so RAW correctness lives in the derivations it calls.
//
// Deferred to follow-up slices (each its own derivation cluster):
// attacks list (needs weapon resolution from inventory), spell save DC /
// attack bonus, effective speeds, and the inventory/equipment summary.
import type { AbilityScore, Skill, ProficiencyLevel } from '../schemas/primitives.js';
import { SKILLS, SKILL_ABILITY } from '../schemas/primitives.js';
import {
  computeDerivedCharacter,
  type DerivedCharacter,
  type ComputeDerivedCharacterInput,
} from '../derive/character-view.js';
import { computeAbilityCheck, computePassiveScore } from '../derive/ability-check.js';
import { buildEffectStack } from '../derive/effect-stack.js';
import type { EffectAccumulator } from '../effects/index.js';

export interface SkillView {
  readonly skill: Skill;
  readonly ability: AbilityScore;
  readonly proficiency: ProficiencyLevel;
  /** Total skill-check modifier (ability mod + proficiency + effect modifiers). */
  readonly modifier: number;
  readonly hasAdvantage: boolean;
  readonly hasDisadvantage: boolean;
}

export interface PassiveScores {
  readonly perception: number;
  readonly investigation: number;
  readonly insight: number;
}

export interface InitiativeView {
  /** DEX modifier plus any `initiative`-target effect modifiers. */
  readonly modifier: number;
  readonly hasAdvantage: boolean;
  readonly hasDisadvantage: boolean;
}

export interface CharacterSheet extends DerivedCharacter {
  /** All 18 skills, in canonical `SKILLS` order. */
  readonly skills: ReadonlyArray<SkillView>;
  readonly passiveScores: PassiveScores;
  readonly initiative: InitiativeView;
}

const skillView = (
  input: ComputeDerivedCharacterInput,
  effects: EffectAccumulator,
  skill: Skill,
): SkillView => {
  const ability = SKILL_ABILITY[skill];
  const check = computeAbilityCheck({ ...input, ability, skill });
  return {
    skill,
    ability,
    proficiency: effects.proficiencyLevel('skill', skill),
    modifier: check.total,
    hasAdvantage: check.hasAdvantage,
    hasDisadvantage: check.hasDisadvantage,
  };
};

export const buildCharacterSheet = (input: ComputeDerivedCharacterInput): CharacterSheet => {
  const derived = computeDerivedCharacter(input);
  const effects = buildEffectStack(input);

  const initiativeAdvantage = effects.advantageFor('initiative');
  const initiative: InitiativeView = {
    modifier: derived.abilityModifiers.DEX + effects.modifierSum('initiative'),
    hasAdvantage: initiativeAdvantage.advantage && !initiativeAdvantage.disadvantage,
    hasDisadvantage: initiativeAdvantage.disadvantage && !initiativeAdvantage.advantage,
  };

  const passiveScores: PassiveScores = {
    perception: computePassiveScore({ ...input, ability: 'WIS', skill: 'perception' }),
    investigation: computePassiveScore({ ...input, ability: 'INT', skill: 'investigation' }),
    insight: computePassiveScore({ ...input, ability: 'WIS', skill: 'insight' }),
  };

  return {
    ...derived,
    skills: SKILLS.map((skill) => skillView(input, effects, skill)),
    passiveScores,
    initiative,
  };
};
