import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';
import { abilityModifier, effectiveAbilityScore, proficiencyBonus } from './ability.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import { buildEffectStack } from './effect-stack.js';

export interface SpellDCBreakdownEntry {
  readonly source: string;
  readonly value: number;
}

export interface SpellDCResult {
  readonly total: number;
  readonly breakdown: ReadonlyArray<SpellDCBreakdownEntry>;
}

const SPELL_DC_BASE = 8;

export interface ComputeSpellDCInput {
  readonly character: Character;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly content: ResolvedContent;
  readonly classId: string;
  readonly pendingChoices?: Readonly<Record<string, import('../schemas/runtime/pending-choice.js').PendingChoice>>;
  // Optional: enables source-relative formulas (`sourceAbilityMod`)
  // on condition effects that touch spell save DC / spell attack
  // bonus. Callers without source-relative content can omit.
  readonly characters?: Readonly<Record<string, Character>>;
}

const lookupSpellcastingAbility = (input: ComputeSpellDCInput): 'INT' | 'WIS' | 'CHA' | undefined => {
  const cls = input.content.classes.get(input.classId);
  if (!cls?.spellcasting) return undefined;
  const ability = cls.spellcasting.ability;
  if (ability === 'INT' || ability === 'WIS' || ability === 'CHA') return ability;
  return undefined;
};

export const computeSpellSaveDC = (input: ComputeSpellDCInput): SpellDCResult => {
  const ability = lookupSpellcastingAbility(input);
  if (ability === undefined) {
    return { total: 0, breakdown: [] };
  }
  const effects = buildEffectStack(input);
  const baseScore = input.character.abilityScores[ability];
  const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(ability);
  const abilityMod = abilityModifier(effectiveAbilityScore(baseScore, floor, increase));
  const breakdown: SpellDCBreakdownEntry[] = [
    { source: 'base', value: SPELL_DC_BASE },
    { source: 'proficiency', value: proficiencyBonus(computeTotalLevel(input.character)) },
    { source: `${ability}-mod`, value: abilityMod },
  ];
  const bonus = effects.modifierSum('spellSaveDC');
  if (bonus !== 0) breakdown.push({ source: 'modifier', value: bonus });
  const total = breakdown.reduce((acc, e) => acc + e.value, 0);
  return { total, breakdown };
};

export const computeSpellAttackBonus = (input: ComputeSpellDCInput): SpellDCResult => {
  const ability = lookupSpellcastingAbility(input);
  if (ability === undefined) {
    return { total: 0, breakdown: [] };
  }
  const effects = buildEffectStack(input);
  const baseScore = input.character.abilityScores[ability];
  const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(ability);
  const abilityMod = abilityModifier(effectiveAbilityScore(baseScore, floor, increase));
  const breakdown: SpellDCBreakdownEntry[] = [
    { source: 'proficiency', value: proficiencyBonus(computeTotalLevel(input.character)) },
    { source: `${ability}-mod`, value: abilityMod },
  ];
  const bonus = effects.modifierSum('spellAttack');
  if (bonus !== 0) breakdown.push({ source: 'modifier', value: bonus });
  const total = breakdown.reduce((acc, e) => acc + e.value, 0);
  return { total, breakdown };
};
