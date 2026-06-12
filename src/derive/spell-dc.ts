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
  // Slice 487: explicit spellcasting-ability override. When set, the
  // DC / attack computation uses this ability instead of the bearer's
  // spellcasting-class ability. Lets Magic Initiate on a non-spellcaster
  // (Fighter / Rogue / Barbarian) compute DC / attack from the
  // GrantSpell entry's `spellcastingAbility` since the bearer has no
  // class with spellcasting. Callers with a spellcasting class can
  // omit the field and the existing class-derived path applies.
  readonly castingAbility?: 'INT' | 'WIS' | 'CHA';
}

const lookupSpellcastingAbility = (input: ComputeSpellDCInput): 'INT' | 'WIS' | 'CHA' | undefined => {
  if (input.castingAbility !== undefined) return input.castingAbility;
  const cls = input.content.classes.get(input.classId);
  if (!cls?.spellcasting) return undefined;
  const ability = cls.spellcasting.ability;
  if (ability === 'INT' || ability === 'WIS' || ability === 'CHA') return ability;
  return undefined;
};

// Slice 794: a creature carrying a SetSpellcastingProfile trait has no
// spellcasting class, so the class-ability lookup returns undefined.
// Fall back to the profile's ability (narrowed to a casting ability) so
// the monster's DC / attack still derive (and a monster sheet shows the
// right ability even when no explicit `castingAbility` is threaded).
const resolveDCAbility = (
  input: ComputeSpellDCInput,
  profileAbility: import('../schemas/primitives.js').AbilityScore | undefined,
): 'INT' | 'WIS' | 'CHA' | undefined => {
  const direct = lookupSpellcastingAbility(input);
  if (direct !== undefined) return direct;
  if (profileAbility === 'INT' || profileAbility === 'WIS' || profileAbility === 'CHA') {
    return profileAbility;
  }
  return undefined;
};

export const computeSpellSaveDC = (input: ComputeSpellDCInput): SpellDCResult => {
  const effects = buildEffectStack(input);
  // Slice 794: a fixed NPC spell save DC short-circuits the derivation.
  const profile = effects.spellcastingProfile();
  if (profile?.saveDC !== undefined) {
    return { total: profile.saveDC, breakdown: [{ source: 'fixed', value: profile.saveDC }] };
  }
  const ability = resolveDCAbility(input, profile?.ability);
  if (ability === undefined) {
    return { total: 0, breakdown: [] };
  }
  const baseScore = input.character.abilityScores[ability];
  const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(ability);
  // Slice 835: a drained spellcasting ability lowers the save DC.
  const drain = input.character.abilityDrain?.[ability];
  const abilityMod = abilityModifier(effectiveAbilityScore(baseScore, floor, increase, drain));
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
  const effects = buildEffectStack(input);
  // Slice 794: a fixed NPC spell attack bonus short-circuits the
  // derivation (e.g. Cultist Fanatic "+4 to hit with spell attacks").
  const profile = effects.spellcastingProfile();
  if (profile?.attackBonus !== undefined) {
    return { total: profile.attackBonus, breakdown: [{ source: 'fixed', value: profile.attackBonus }] };
  }
  const ability = resolveDCAbility(input, profile?.ability);
  if (ability === undefined) {
    return { total: 0, breakdown: [] };
  }
  const baseScore = input.character.abilityScores[ability];
  const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(ability);
  // Slice 835: a drained spellcasting ability lowers the spell attack bonus.
  const drain = input.character.abilityDrain?.[ability];
  const abilityMod = abilityModifier(effectiveAbilityScore(baseScore, floor, increase, drain));
  const breakdown: SpellDCBreakdownEntry[] = [
    { source: 'proficiency', value: proficiencyBonus(computeTotalLevel(input.character)) },
    { source: `${ability}-mod`, value: abilityMod },
  ];
  const bonus = effects.modifierSum('spellAttack');
  if (bonus !== 0) breakdown.push({ source: 'modifier', value: bonus });
  const total = breakdown.reduce((acc, e) => acc + e.value, 0);
  return { total, breakdown };
};
