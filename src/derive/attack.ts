import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';
import { abilityModifier, effectiveAbilityScore, proficiencyBonus } from './ability.js';
import { buildEffectStack } from './effect-stack.js';
import { resolveEnchantment } from './enchantment.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import type { Weapon } from '../schemas/content/item.js';
import type { EffectAccumulator } from '../effects/builder.js';
import type { DiceExpression, DamageType } from '../schemas/primitives.js';

export interface AttackBreakdownEntry {
  readonly source: string;
  readonly value: number;
}

export interface AttackResult {
  readonly total: number;
  readonly breakdown: ReadonlyArray<AttackBreakdownEntry>;
}

export interface ComputeAttackInput {
  readonly character: Character;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly content: ResolvedContent;
  readonly weaponInstanceId: string;
  readonly pendingChoices?: Readonly<Record<string, import('../schemas/runtime/pending-choice.js').PendingChoice>>;
  // Optional: enables source-relative formulas (`sourceAbilityMod`)
  // on condition effects that touch attack bonuses. Callers without
  // source-relative attack content can omit (formulas drop to 0).
  readonly characters?: Readonly<Record<string, Character>>;
}

const chooseAttackAbility = (character: Character, weapon: Weapon): 'STR' | 'DEX' => {
  const isFinesse = weapon.properties.includes('finesse');
  const isRanged = weapon.attackKind === 'ranged';
  if (isRanged && !weapon.properties.includes('thrown')) return 'DEX';
  if (isFinesse) {
    return abilityModifier(character.abilityScores.DEX) >=
      abilityModifier(character.abilityScores.STR)
      ? 'DEX'
      : 'STR';
  }
  return 'STR';
};

const isWeaponProficient = (
  character: Character,
  weapon: Weapon,
  content: ResolvedContent,
): boolean => {
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (!cls) continue;
    if (cls.weaponProficiencies.includes(weapon.id)) return true;
    if (cls.weaponProficiencies.includes(weapon.category)) return true;
    if (cls.weaponProficiencies.includes('all')) return true;
  }
  return false;
};

// Resolve the weapon instance + its definition, throwing on an unknown
// id or a non-weapon. Shared by the to-hit and damage derivations.
const resolveWeapon = (input: ComputeAttackInput): { instance: ItemInstance; weapon: Weapon } => {
  const instance = input.itemInstances[input.weaponInstanceId];
  if (!instance) {
    throw new Error(`Unknown weapon instance: ${input.weaponInstanceId}`);
  }
  const def = input.content.items.get(instance.definitionId);
  if (!def || def.itemKind !== 'weapon') {
    throw new Error(
      `Item instance ${input.weaponInstanceId} is not a weapon (definition ${instance.definitionId})`,
    );
  }
  return { instance, weapon: def };
};

// The ability used for both the attack roll and the damage modifier
// (RAW: the same ability modifier applies to both), with the effective
// score (floor / increase effects) folded in.
const attackAbility = (
  character: Character,
  weapon: Weapon,
  effects: EffectAccumulator,
): { ability: 'STR' | 'DEX'; mod: number } => {
  const ability = chooseAttackAbility(character, weapon);
  const baseScore = character.abilityScores[ability];
  const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(ability);
  return { ability, mod: abilityModifier(effectiveAbilityScore(baseScore, floor, increase)) };
};

export const computeAttackBonus = (input: ComputeAttackInput): AttackResult => {
  const { instance, weapon } = resolveWeapon(input);
  const effects = buildEffectStack(input);
  const { ability, mod } = attackAbility(input.character, weapon, effects);
  const breakdown: AttackBreakdownEntry[] = [{ source: `${ability}-mod`, value: mod }];

  if (isWeaponProficient(input.character, weapon, input.content)) {
    breakdown.push({
      source: 'proficiency',
      value: proficiencyBonus(computeTotalLevel(input.character)),
    });
  }
  // Slice 115: build a facts map for predicate-gated modifiers
  // (Archery's "ranged-only" +2, future Defense / Dueling / TWF
  // gates). Currently carries `event.attackKind` — additional facts
  // can join here as more predicates land.
  const facts = new Map<string, unknown>([
    ['event.attackKind', weapon.attackKind],
  ]);
  const modifierBonus = effects.modifierSum('attack', facts);
  if (modifierBonus !== 0) breakdown.push({ source: 'modifier', value: modifierBonus });

  // Spell-applied temporary buff stamped on this specific weapon
  // instance (Magic Weapon's +N, etc.). Distinct from the generic
  // 'attack' modifier sum because the buff is weapon-specific —
  // only this weapon's attacks get the bonus.
  if (instance.temporaryBuff !== undefined && instance.temporaryBuff.attackBonus !== 0) {
    breakdown.push({
      source: instance.temporaryBuff.source ?? 'weapon-buff',
      value: instance.temporaryBuff.attackBonus,
    });
  }

  // Slice 316: intrinsic magic-weapon enhancement bonus (Sun Blade +2,
  // Dwarven Thrower +3). Permanent on the definition, distinct from the
  // consumable temporaryBuff above.
  if (weapon.attackBonus !== undefined && weapon.attackBonus !== 0) {
    breakdown.push({ source: `magic-weapon:${weapon.id}`, value: weapon.attackBonus });
  }

  // Slice 317: enchantment-overlay bonus (a base weapon instance carrying
  // a multi-base enchantment like Frost Brand / "+1 weapon").
  const enchantment = resolveEnchantment(instance, input.content);
  if (enchantment?.attackBonus !== undefined && enchantment.attackBonus !== 0) {
    breakdown.push({ source: `enchantment:${enchantment.id}`, value: enchantment.attackBonus });
  }

  const total = breakdown.reduce((acc, e) => acc + e.value, 0);
  return { total, breakdown };
};

export interface WeaponDamage {
  readonly dice: DiceExpression;
  /** Flat modifier: attack-ability mod + any flat magic / buff damage bonuses. */
  readonly modifier: number;
  readonly type: DamageType;
}

export interface WeaponDamageResult {
  readonly damage: WeaponDamage;
  /** Present for versatile weapons: the larger die when wielded two-handed. */
  readonly versatile?: WeaponDamage;
}

// The static damage line a sheet displays: weapon die + the attack-ability
// modifier + flat magic / buff damage bonuses, of the weapon's damage type.
// Conditional, roll-time riders (Sneak Attack, Great Weapon Fighting's
// die floor, Martial Arts scaling, off-hand no-modifier) are NOT folded in
// here; those resolve in the attack planner per attack context.
export const computeWeaponDamage = (input: ComputeAttackInput): WeaponDamageResult => {
  const { instance, weapon } = resolveWeapon(input);
  const effects = buildEffectStack(input);
  const { mod } = attackAbility(input.character, weapon, effects);

  let modifier = mod;
  if (instance.temporaryBuff !== undefined) modifier += instance.temporaryBuff.damageBonus;
  if (weapon.damageBonus !== undefined) modifier += weapon.damageBonus;
  const enchantment = resolveEnchantment(instance, input.content);
  if (enchantment?.damageBonus !== undefined) modifier += enchantment.damageBonus;

  const damage: WeaponDamage = { dice: weapon.damageDice, modifier, type: weapon.damageType };
  return weapon.versatileDice !== undefined
    ? { damage, versatile: { dice: weapon.versatileDice, modifier, type: weapon.damageType } }
    : { damage };
};
