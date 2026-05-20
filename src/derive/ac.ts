import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';
import type { AbilityScore } from '../schemas/primitives.js';
import { abilityModifier, effectiveAbilityScore } from './ability.js';
import { buildEffectStack } from './effect-stack.js';
import type { EffectAccumulator } from '../effects/builder.js';

const UNARMORED_BASE = 10;

export interface ACBreakdownEntry {
  readonly source: string;
  readonly value: number;
}

export interface ACResult {
  readonly total: number;
  readonly breakdown: ReadonlyArray<ACBreakdownEntry>;
}

const computeArmorAC = (
  character: Character,
  itemInstances: Readonly<Record<string, ItemInstance>>,
  content: ResolvedContent,
): ACBreakdownEntry[] => {
  const breakdown: ACBreakdownEntry[] = [];
  const armorInstanceId = character.equipped.armor;
  const dexMod = abilityModifier(character.abilityScores.DEX);

  if (armorInstanceId !== undefined) {
    const armorInstance = itemInstances[armorInstanceId];
    const armorDef = armorInstance ? content.items.get(armorInstance.definitionId) : undefined;
    if (armorDef && armorDef.itemKind === 'armor' && armorDef.category !== 'shield') {
      breakdown.push({ source: `armor:${armorDef.id}`, value: armorDef.baseAC });
      const dexContribution =
        armorDef.dexCap === undefined
          ? dexMod
          : Math.min(dexMod, armorDef.dexCap);
      if (armorDef.category !== 'heavy') {
        breakdown.push({ source: 'DEX', value: dexContribution });
      }
      // Slice 315: magic-armor enhancement bonus (Dragon Scale Mail +1).
      if (armorDef.acBonus !== undefined && armorDef.acBonus !== 0) {
        breakdown.push({ source: `armor-bonus:${armorDef.id}`, value: armorDef.acBonus });
      }
    } else {
      breakdown.push({ source: 'unarmored-base', value: UNARMORED_BASE });
      breakdown.push({ source: 'DEX', value: dexMod });
    }
  } else {
    breakdown.push({ source: 'unarmored-base', value: UNARMORED_BASE });
    breakdown.push({ source: 'DEX', value: dexMod });
  }

  const shieldInstanceId = character.equipped.shield;
  if (shieldInstanceId !== undefined) {
    const shieldInstance = itemInstances[shieldInstanceId];
    const shieldDef = shieldInstance ? content.items.get(shieldInstance.definitionId) : undefined;
    if (shieldDef && shieldDef.itemKind === 'armor' && shieldDef.category === 'shield') {
      breakdown.push({ source: `shield:${shieldDef.id}`, value: shieldDef.baseAC });
      // Slice 315: magic-shield enhancement bonus (Shield +1/+2/+3).
      if (shieldDef.acBonus !== undefined && shieldDef.acBonus !== 0) {
        breakdown.push({ source: `shield-bonus:${shieldDef.id}`, value: shieldDef.acBonus });
      }
    }
  }
  return breakdown;
};

const computeUnarmoredOverrideAC = (
  character: Character,
  effects: EffectAccumulator,
): ACBreakdownEntry[] | null => {
  const override = effects.effectiveACOverride();
  if (!override) return null;
  const breakdown: ACBreakdownEntry[] = [];
  const modForAbility = (ability: AbilityScore): number => {
    const baseScore = character.abilityScores[ability];
    const floor = effects.effectiveAbilityScoreFloor(ability)?.value;
    const increase = effects.effectiveAbilityScoreIncrease(ability);
    return abilityModifier(effectiveAbilityScore(baseScore, floor, increase));
  };
  const baseValue =
    typeof override.base === 'number'
      ? override.base
      : override.base === 'dex'
        ? modForAbility('DEX')
        : override.base === 'con'
          ? modForAbility('CON')
          : modForAbility('WIS');
  breakdown.push({ source: `override-base:${override.source}`, value: baseValue });

  for (const ability of override.abilityModifiers) {
    const mod = modForAbility(ability);
    const capped = override.dexCap !== undefined && ability === 'DEX'
      ? Math.min(mod, override.dexCap)
      : mod;
    breakdown.push({ source: `${ability}-mod`, value: capped });
  }

  const shieldInstanceId = character.equipped.shield;
  if (shieldInstanceId !== undefined) {
    breakdown.push({ source: 'shield', value: 2 });
  }
  return breakdown;
};

export interface ComputeACInput {
  readonly character: Character;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly content: ResolvedContent;
  readonly pendingChoices?: Readonly<Record<string, import('../schemas/runtime/pending-choice.js').PendingChoice>>;
  // Optional: when provided, source-relative formulas on condition
  // effects (e.g., `sourceAbilityMod`) resolve via the source
  // character's stats. Callers without source-relative AC content
  // can omit this (formulas drop to 0 in its absence). See
  // [src/derive/effect-stack.ts] for the source-resolution rule.
  readonly characters?: Readonly<Record<string, Character>>;
}

// Bump the natural AC up to the floor when an effect (Barkskin etc.)
// supplies one. The breakdown gains a "floor:<source>" entry showing
// the delta so the natural computation stays visible. If natural AC
// already meets or exceeds the floor, nothing changes.
const applyACFloor = (
  natural: { total: number; breakdown: ACBreakdownEntry[] },
  floor: { value: number; source: string } | undefined,
): ACResult => {
  if (floor === undefined || natural.total >= floor.value) {
    return { total: natural.total, breakdown: natural.breakdown };
  }
  const delta = floor.value - natural.total;
  return {
    total: floor.value,
    breakdown: [...natural.breakdown, { source: `floor:${floor.source}`, value: delta }],
  };
};

export const computeAC = (input: ComputeACInput): ACResult => {
  const effects = buildEffectStack(input);
  const floor = effects.effectiveACFloor();

  // Slice 116: bearer-state facts for predicate-gated AC modifiers.
  // Defense Fighting Style's +1 AC only applies while wearing armor;
  // future modifiers (shield-only, heavy-armor-only, etc.) can join
  // the same fact namespace. `bearer.wearingArmor` is true iff the
  // character has an item equipped in their armor slot.
  // Slice 230: added `bearer.wieldingShield` (mirror of the armor
  // fact) so Bracers of Defense can express the RAW "no armor + no
  // shield" gate exactly.
  const facts = new Map<string, unknown>([
    ['bearer.wearingArmor', input.character.equipped.armor !== undefined],
    ['bearer.wieldingShield', input.character.equipped.shield !== undefined],
  ]);

  // A flat `armorClass` on the character takes precedence over equipment
  // and effect-based overrides. It's used by creatures whose AC comes
  // from natural armor (hide, scales, plate-skin) declared on a statblock
  // or by polymorph forms (which copy the form's AC onto the character).
  // Modifiers (+1 cloak, shield from effects, etc.) still stack on top.
  if (input.character.armorClass !== undefined) {
    const breakdown: ACBreakdownEntry[] = [
      { source: 'natural-armor', value: input.character.armorClass },
    ];
    const modifierBonus = effects.modifierSum('ac', facts);
    if (modifierBonus !== 0) {
      breakdown.push({ source: 'modifier', value: modifierBonus });
    }
    const total = breakdown.reduce((acc, entry) => acc + entry.value, 0);
    return applyACFloor({ total, breakdown }, floor);
  }

  const armorInstanceId = input.character.equipped.armor;

  let breakdown: ACBreakdownEntry[];
  if (armorInstanceId === undefined) {
    const override = computeUnarmoredOverrideAC(input.character, effects);
    breakdown = override ?? computeArmorAC(input.character, input.itemInstances, input.content);
  } else {
    breakdown = computeArmorAC(input.character, input.itemInstances, input.content);
  }

  const modifierBonus = effects.modifierSum('ac', facts);
  if (modifierBonus !== 0) {
    breakdown.push({ source: 'modifier', value: modifierBonus });
  }

  const total = breakdown.reduce((acc, entry) => acc + entry.value, 0);
  return applyACFloor({ total, breakdown }, floor);
};
