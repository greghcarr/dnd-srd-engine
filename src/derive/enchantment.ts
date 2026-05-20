import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ItemDefinition } from '../schemas/content/item.js';
import type { ResolvedContent } from '../content/pack.js';

// Slice 317: multi-base magic equipment via enchantment overlay. A base
// weapon / armor instance references a magic-item enchantment definition
// through `enchantmentDefinitionId`. This resolves that enchantment def
// (or undefined when the instance carries no enchantment / it isn't a
// magic item). Consumers (attack planner, computeAttackBonus, AC derive,
// effect projection, magicality) overlay its fields onto the base.
export const resolveEnchantment = (
  instance: ItemInstance | undefined,
  content: ResolvedContent,
): Extract<ItemDefinition, { itemKind: 'magic' }> | undefined => {
  if (instance?.enchantmentDefinitionId === undefined) return undefined;
  const def = content.items.get(instance.enchantmentDefinitionId);
  return def !== undefined && def.itemKind === 'magic' ? def : undefined;
};
