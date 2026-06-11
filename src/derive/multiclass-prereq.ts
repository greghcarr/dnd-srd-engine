// Slice 810 (Area 5 `multiclass-prereqs`): the 13+ ability prerequisite
// for multiclassing. RAW (character-creation.md "Multiclassing"): "To
// qualify for a new class, you must have a score of at least 13 in the
// primary ability of the new class and your current classes."
//
// Multiclass ENTRY is consumer-driven — the engine has no "enter a new
// class" planner (planLevelUp only advances an existing enrollment), so a
// consumer hands the engine a multiclass character via the CharacterCreated
// snapshot. As with `validateBackgroundAbilityIncrease` (slice 793), the
// engine therefore provides the *validation*: a consumer's chargen / level-
// up UI calls `validateMulticlass` and surfaces the issues; the engine
// can't gate a snapshot it didn't transact.
//
// The prerequisite abilities are the class's `primaryAbility` (which the
// pack authors to match the SRD "Primary Ability" line); `multiclass
// AbilityMode` ('any' for Fighter's "Strength OR Dexterity", 'all' for the
// "X AND Y" classes, default 'all') resolves the or/and.

import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { PendingChoice } from '../schemas/runtime/pending-choice.js';
import type { ResolvedContent } from '../content/pack.js';
import type { AbilityScore } from '../schemas/primitives.js';
import { buildEffectStack } from './effect-stack.js';
import { effectiveAbilityScore } from './ability.js';

export const MULTICLASS_MIN_ABILITY = 13;

export interface ValidateMulticlassOptions {
  // Optional state so the EFFECTIVE ability score (base + floor + ASI /
  // item increases) drives the check — a STR ASI taken before multiclassing
  // counts. Omit them and the check sees base scores + the opt-in
  // background increase only (the common chargen case).
  readonly itemInstances?: Readonly<Record<string, ItemInstance>>;
  readonly pendingChoices?: Readonly<Record<string, PendingChoice>>;
}

// Returns human-readable issues — one per class whose multiclass ability
// prerequisite the character doesn't meet. Empty array = valid (or the
// character is single-classed, which isn't multiclassing at all).
export const validateMulticlass = (
  character: Character,
  content: ResolvedContent,
  options: ValidateMulticlassOptions = {},
): string[] => {
  if (character.classes.length < 2) return [];
  const effects = buildEffectStack({
    character,
    content,
    itemInstances: options.itemInstances ?? {},
    pendingChoices: options.pendingChoices ?? {},
  });
  const scoreOf = (ability: AbilityScore): number =>
    effectiveAbilityScore(
      character.abilityScores[ability],
      effects.effectiveAbilityScoreFloor(ability)?.value,
      effects.effectiveAbilityScoreIncrease(ability),
    );
  const issues: string[] = [];
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (cls === undefined) continue;
    const abilities = cls.primaryAbility;
    const meets =
      cls.multiclassAbilityMode === 'any'
        ? abilities.some((a) => scoreOf(a) >= MULTICLASS_MIN_ABILITY)
        : abilities.every((a) => scoreOf(a) >= MULTICLASS_MIN_ABILITY);
    if (!meets) {
      const joiner = cls.multiclassAbilityMode === 'any' ? ' or ' : ' and ';
      issues.push(
        `${cls.name ?? enrollment.classId} requires ${abilities.join(joiner)} ${MULTICLASS_MIN_ABILITY}+ to multiclass`,
      );
    }
  }
  return issues;
};
