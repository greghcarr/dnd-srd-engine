// Slice 804 (Area 6 `untrained-armor-penalty`): RAW Armor Training
// (equipment.md): "If you wear Light, Medium, or Heavy armor and lack
// training with it, you have Disadvantage on any D20 Test that involves
// Strength or Dexterity, and you can't cast spells." and "You gain the
// Armor Class benefit of a Shield only if you have training with it."
//
// The `armorProficiencies` arrays on classes were authored but never
// read. Training is resolved the same way weapon proficiency is
// (derive/attack.ts `isWeaponProficient` walks `cls.weaponProficiencies`)
// — over the character's classes — PLUS any `GrantProficiency { target:
// 'armor' }` in the effect stack (a feat / subclass / species grant), so
// the check stays complete when training comes from outside a base class.

import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { ResolvedContent } from '../content/pack.js';
import type { EffectAccumulator } from '../effects/builder.js';

export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield';

export const isArmorTrained = (
  character: Character,
  category: ArmorCategory,
  content: ResolvedContent,
  effects: EffectAccumulator,
): boolean => {
  // Slice 890: the origin class (index 0 — the class chosen at creation)
  // grants its full armor training; multiclass entries (index 1+) grant only
  // their reduced `multiclassProficiencies.armor` set (RAW 2024 "As a
  // Multiclass Character").
  for (const [i, enrollment] of character.classes.entries()) {
    const cls = content.classes.get(enrollment.classId);
    if (cls === undefined) continue;
    const profs = i === 0 ? cls.armorProficiencies : cls.multiclassProficiencies.armor;
    if (profs.includes(category)) return true;
  }
  return effects.proficiencyLevel('armor', category) !== 'none';
};

const equippedArmorDef = (
  slotId: string | undefined,
  content: ResolvedContent,
  itemInstances: Readonly<Record<string, ItemInstance>>,
) => {
  if (slotId === undefined) return undefined;
  const def = content.items.get(itemInstances[slotId]?.definitionId ?? '');
  return def?.itemKind === 'armor' ? def : undefined;
};

// True when the character wears body armor (Light/Medium/Heavy — not a
// shield) it lacks training with. Gates the Disadvantage-on-STR/DEX and
// can't-cast arms.
export const wearsUntrainedBodyArmor = (
  character: Character,
  content: ResolvedContent,
  itemInstances: Readonly<Record<string, ItemInstance>>,
  effects: EffectAccumulator,
): boolean => {
  const def = equippedArmorDef(character.equipped.armor, content, itemInstances);
  if (def === undefined || def.category === 'shield') return false;
  return !isArmorTrained(character, def.category, content, effects);
};

// True when a Shield is equipped but the wielder lacks Shield training
// (RAW: no AC benefit from an untrained Shield).
export const wieldsUntrainedShield = (
  character: Character,
  content: ResolvedContent,
  itemInstances: Readonly<Record<string, ItemInstance>>,
  effects: EffectAccumulator,
): boolean => {
  const def = equippedArmorDef(character.equipped.shield, content, itemInstances);
  if (def === undefined || def.category !== 'shield') return false;
  return !isArmorTrained(character, 'shield', content, effects);
};
