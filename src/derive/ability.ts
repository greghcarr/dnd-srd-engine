import type { CharacterLevel } from '../schemas/primitives.js';

export const ABILITY_SCORE_MIN = 1;
export const ABILITY_SCORE_MAX = 30;
export const PROFICIENCY_BONUS_LEVEL_MIN = 1;
export const PROFICIENCY_BONUS_LEVEL_MAX = 20;

// Slice 229. Applies an `OverrideAbilityScore`-style floor to a base
// ability score: if `floor` is provided and greater than `baseScore`,
// returns `floor`; otherwise returns `baseScore`. Callers that build
// an EffectAccumulator pass `effects.effectiveAbilityScoreFloor(ability)?.value`
// here so the canonical AbilityScore-floor primitive (Amulet of
// Health, Gauntlets of Ogre Power, Belt of Giant Strength variants)
// participates in every derivation that consumes the score.
//
// Slice 308. Optional additive `increase` ({ amount, max }) from the
// IncreaseAbilityScore primitive (Ioun Stones, Belt of Dwarvenkind
// Toughness). Applied after the floor so a "set" floor and a "+N"
// increase compose RAW-correctly (Amulet of Health floor 19 + an Ioun
// Stone +2 reaches 20). The increase only raises: it never lowers a
// score that already exceeds its `max`, so it can't clamp a higher
// floor down to the cap.
export const effectiveAbilityScore = (
  baseScore: number,
  floor?: number,
  increase?: { readonly amount: number; readonly max: number },
): number => {
  let score = baseScore;
  if (floor !== undefined) score = Math.max(score, floor);
  if (increase !== undefined) {
    score = Math.max(score, Math.min(score + increase.amount, increase.max));
  }
  return score;
};

export const abilityModifier = (score: number): number => {
  if (!Number.isInteger(score)) {
    throw new Error(`abilityModifier requires an integer; got ${score}`);
  }
  if (score < ABILITY_SCORE_MIN || score > ABILITY_SCORE_MAX) {
    throw new Error(
      `abilityModifier: score ${score} out of range [${ABILITY_SCORE_MIN}, ${ABILITY_SCORE_MAX}]`,
    );
  }
  return Math.floor((score - 10) / 2);
};

export const proficiencyBonus = (level: number): number => {
  if (!Number.isInteger(level)) {
    throw new Error(`proficiencyBonus requires an integer level; got ${level}`);
  }
  if (level < PROFICIENCY_BONUS_LEVEL_MIN || level > PROFICIENCY_BONUS_LEVEL_MAX) {
    throw new Error(
      `proficiencyBonus: level ${level} out of range [${PROFICIENCY_BONUS_LEVEL_MIN}, ${PROFICIENCY_BONUS_LEVEL_MAX}]`,
    );
  }
  return Math.floor((level - 1) / 4) + 2;
};

export const proficiencyBonusForCharacterLevel = (level: CharacterLevel): number =>
  proficiencyBonus(level);
