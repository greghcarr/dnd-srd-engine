import type { Character } from '../schemas/runtime/character.js';
import type { Weapon } from '../schemas/content/item.js';
import type { ResolvedContent } from '../content/pack.js';
import { isWeaponProficient } from './attack.js';

// Slice 502: whether this character may use the given weapon's Mastery
// property on an attack. RAW (2024 Weapon Mastery): you use the mastery
// property of a weapon only if (a) you chose that kind of weapon for the
// feature and (b) you have proficiency with it.
//
// `Flex` is exempt: it is the engine's versatile-weapon 1H/2H damage
// toggle extension, not a RAW mastery a character learns (no SRD weapon
// carries it, no class grants it), so it always applies when present.
export const canUseWeaponMastery = (
  character: Character,
  weapon: Weapon,
  content: ResolvedContent,
): boolean => {
  if (weapon.mastery === undefined) return false;
  if (weapon.mastery === 'Flex') return true;
  return (
    character.weaponMasteries.includes(weapon.id) &&
    isWeaponProficient(character, weapon, content)
  );
};
