export {
  abilityModifier,
  proficiencyBonus,
  proficiencyBonusForCharacterLevel,
  ABILITY_SCORE_MIN,
  ABILITY_SCORE_MAX,
  PROFICIENCY_BONUS_LEVEL_MIN,
  PROFICIENCY_BONUS_LEVEL_MAX,
} from './ability.js';
export {
  getEffectiveSpeed,
  getEffectiveSpeeds,
  getEffectiveSpeedForMode,
  computeJumpDistances,
  type GetEffectiveSpeedInput,
  type EffectiveSpeeds,
  type JumpDistances,
} from './speed.js';
export type { EncumbranceResult } from './encumbrance.js';
export {
  computeAC,
  type ACResult,
  type ACBreakdownEntry,
  type ComputeACInput,
} from './ac.js';
export {
  computeAttackBonus,
  computeWeaponDamage,
  computeUnarmedStrike,
  type AttackResult,
  type AttackBreakdownEntry,
  type ComputeAttackInput,
  type WeaponDamage,
  type WeaponDamageResult,
  type ComputeUnarmedStrikeInput,
  type UnarmedStrikeResult,
} from './attack.js';
export {
  computeSavingThrow,
  type SaveResult,
  type SaveBreakdownEntry,
  type ComputeSaveInput,
} from './save.js';
export {
  computeSpellSaveDC,
  computeSpellAttackBonus,
  type SpellDCResult,
  type SpellDCBreakdownEntry,
  type ComputeSpellDCInput,
} from './spell-dc.js';
export {
  computeSpellSlots,
  spellSlotsForLevel,
  type SpellSlotsResult,
} from './spell-slots.js';
export { buildEffectStack, getEffectiveFeatIds, type BuildEffectStackInput } from './effect-stack.js';
export { computeKnownLanguages, type ComputeKnownLanguagesInput } from './languages.js';
export {
  computeDerivedCharacter,
  type DerivedCharacter,
  type ComputeDerivedCharacterInput,
} from './character-view.js';
export {
  computeAbilityCheck,
  computePassiveScore,
  type AbilityCheckResult,
  type AbilityCheckBreakdownEntry,
  type ComputeAbilityCheckInput,
} from './ability-check.js';
export {
  computeActionEconomyBudget,
  type ActionEconomyBudget,
  type ComputeActionEconomyInput,
} from './action-economy.js';
export {
  terrainAt,
  movementCostFor,
  movementCostAt,
  chebyshevDistanceFeet,
  isInRangeFeet,
  hasLineOfSight,
  hasLineOfEffect,
} from './terrain.js';
export { coveredCells, type AreaOfEffectSpec } from './aoe.js';
export { validateBackgroundAbilityIncrease } from './background-asi.js';
export { validateMulticlass, MULTICLASS_MIN_ABILITY, type ValidateMulticlassOptions } from './multiclass-prereq.js';
export { validateAttunement, MAX_ATTUNED_ITEMS, type AttunementValidation } from './attunement-prereq.js';
export { runtimeMultiattackFromStatblock } from './multiattack.js';
