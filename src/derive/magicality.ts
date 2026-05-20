import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ItemDefinition } from '../schemas/content/item.js';

// Slice 112 / 207. Single source of truth for "is this weapon attack
// magical?" The engine reads three signals today:
//
// 1. `itemInstance.temporaryBuff` — populated by the Magic Weapon
//    spell, Elemental Weapon, and similar buffs. RAW makes those
//    attacks count as magical for the duration.
// 2. `itemDef.itemKind === 'magic'` — direct magic-item weapons
//    (Flametongue Longsword, etc.). The current starter pack lists
//    magic weapons as MagicItem rows with no weapon stats, so this
//    branch is dormant; it's wired up for future content that ships
//    a weapon as `itemKind: 'magic'`.
// 3. Slice 207: when the weapon is the synthetic `unarmed-strike`
//    item AND the attacker carries `GrantUnarmedAsMagical` (Monk L6
//    Empowered Strikes) on their effect stack, the attack counts as
//    magical. Callers pass `attackerHasUnarmedAsMagical: true` when
//    that's the case.
//
// Slice 316: single-base magic weapons now ship as itemKind 'weapon'
// with a `rarity` (Sun Blade, Dwarven Thrower, etc.), so a fourth
// branch counts those as magical. Multi-base magic weapons that remain
// itemKind 'magic' still match branch 2.
export const isMagicWeaponAttack = (
  instance: ItemInstance,
  def: ItemDefinition,
  attackerHasUnarmedAsMagical: boolean = false,
): boolean => {
  if (instance.temporaryBuff !== undefined) return true;
  if (def.itemKind === 'magic') return true;
  if (def.itemKind === 'weapon' && def.rarity !== undefined) return true;
  if (def.id === 'unarmed-strike' && attackerHasUnarmedAsMagical) return true;
  return false;
};
