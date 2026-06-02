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
import { EXHAUSTION_ATTACK_PENALTY_PER_LEVEL } from '../internal/constants.js';

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
  // Slice 494: explicit ability override. When set, the attack bonus
  // uses this ability mod instead of chooseAttackAbility's
  // weapon-property-driven default. Canonical user: True Strike RAW
  // ("uses your spellcasting ability for the attack and damage rolls
  // instead of using Strength or Dexterity"). Callers without an
  // override pass undefined and the existing class-derived path applies.
  readonly abilityOverride?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
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

// Recognized property-qualified proficiency tokens: a class can declare
// e.g. "martial-light" (any martial weapon with the Light property) or
// "martial-finesse" (any martial weapon with the Finesse property).
// RAW shape for Monk ("Simple + Martial light") and Rogue ("Simple +
// Martial finesse-or-light"). Extensible to any "<category>-<property>"
// combination the content needs without enumerating weapons one by one.
export const isWeaponProficient = (
  character: Character,
  weapon: Weapon,
  content: ResolvedContent,
): boolean => {
  for (const enrollment of character.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (!cls) continue;
    for (const token of cls.weaponProficiencies) {
      if (token === weapon.id) return true;
      if (token === weapon.category) return true;
      if (token === 'all') return true;
      const prefix = `${weapon.category}-`;
      if (token.startsWith(prefix)) {
        const requiredProperty = token.substring(prefix.length);
        if (weapon.properties?.some((p) => p === requiredProperty)) return true;
      }
    }
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
  override?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA',
): { ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'; mod: number } => {
  // Slice 494: override (True Strike) bypasses chooseAttackAbility.
  const ability = override ?? chooseAttackAbility(character, weapon);
  const baseScore = character.abilityScores[ability];
  const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(ability);
  return { ability, mod: abilityModifier(effectiveAbilityScore(baseScore, floor, increase)) };
};

export const computeAttackBonus = (input: ComputeAttackInput): AttackResult => {
  const { instance, weapon } = resolveWeapon(input);
  const effects = buildEffectStack(input);
  // Ability override precedence: the per-attack input override (True
  // Strike, slice 494) wins; otherwise a weapon-buff override (Shillelagh,
  // slice 501) sourced from the instance's temporaryBuff; otherwise the
  // weapon-property default.
  const abilityOverride = input.abilityOverride ?? instance.temporaryBuff?.abilityOverride;
  const { ability, mod } = attackAbility(input.character, weapon, effects, abilityOverride);
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

  // Slice 569: RAW PHB 2024 Exhaustion: -2 per level on every d20 Test
  // (ability checks + saves + ATTACK ROLLS). Pre-slice the penalty was
  // applied to checks (derive/ability-check.ts) and saves (derive/save.ts)
  // but NOT attack rolls — an exhausted character's to-hit was unaffected.
  if (input.character.exhaustion > 0) {
    breakdown.push({
      source: 'exhaustion',
      value: EXHAUSTION_ATTACK_PENALTY_PER_LEVEL * input.character.exhaustion,
    });
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

// The engine models the always-available unarmed strike as a content
// weapon definition (1d4 bludgeoning in the SRD pack), the same one the
// attack planner wields.
const UNARMED_STRIKE_DEF_ID = 'unarmed-strike';

export type ComputeUnarmedStrikeInput = Omit<ComputeAttackInput, 'weaponInstanceId'>;

export interface UnarmedStrikeResult {
  readonly name: string;
  readonly attackKind: 'melee' | 'ranged';
  readonly properties: ReadonlyArray<Weapon['properties'][number]>;
  readonly attackBonus: number;
  readonly damage: WeaponDamage;
}

/**
 * The character's unarmed strike to-hit + static damage line. Every
 * creature is proficient with unarmed strikes (RAW), so the proficiency
 * bonus always applies regardless of weapon-proficiency lists. Like
 * `computeWeaponDamage`, the line is static: the Monk Martial Arts die /
 * DEX option resolves in the attack planner per attack context (mirroring
 * how Sneak Attack and Great Weapon Fighting are excluded from the
 * weapon damage line). Returns undefined when the pack has no
 * unarmed-strike definition.
 */
export const computeUnarmedStrike = (input: ComputeUnarmedStrikeInput): UnarmedStrikeResult | undefined => {
  const weapon = input.content.items.get(UNARMED_STRIKE_DEF_ID);
  if (weapon === undefined || weapon.itemKind !== 'weapon') return undefined;
  const effects = buildEffectStack(input);
  const { mod } = attackAbility(input.character, weapon, effects);
  const proficiency = proficiencyBonus(computeTotalLevel(input.character));
  const facts = new Map<string, unknown>([['event.attackKind', weapon.attackKind]]);
  const attackBonus = mod + proficiency + effects.modifierSum('attack', facts);
  return {
    name: weapon.name,
    attackKind: weapon.attackKind,
    properties: weapon.properties,
    attackBonus,
    damage: { dice: weapon.damageDice, modifier: mod, type: weapon.damageType },
  };
};
