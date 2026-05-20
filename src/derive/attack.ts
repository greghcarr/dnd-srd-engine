import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';
import { abilityModifier, effectiveAbilityScore, proficiencyBonus } from './ability.js';
import { buildEffectStack } from './effect-stack.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import type { Weapon } from '../schemas/content/item.js';

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

export const computeAttackBonus = (input: ComputeAttackInput): AttackResult => {
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
  const weapon = def;

  const ability = chooseAttackAbility(input.character, weapon);
  const effects = buildEffectStack(input);
  const baseScore = input.character.abilityScores[ability];
  const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(ability);
  const breakdown: AttackBreakdownEntry[] = [
    { source: `${ability}-mod`, value: abilityModifier(effectiveAbilityScore(baseScore, floor, increase)) },
  ];

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

  const total = breakdown.reduce((acc, e) => acc + e.value, 0);
  return { total, breakdown };
};
