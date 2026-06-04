import type { Character } from '../schemas/runtime/character.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Size } from '../schemas/primitives.js';

const DEFAULT_SIZE: Size = 'Medium';
// "Large or smaller" in RAW size-gate clauses (weapon-mastery Push,
// Cunning Strike Trip): everything up to and including Large.
const LARGE_OR_SMALLER: ReadonlySet<Size> = new Set<Size>(['Tiny', 'Small', 'Medium', 'Large']);
// "Large or larger" in RAW save-advantage clauses (Ensnaring Strike: "A
// Large or larger creature has Advantage on this save").
const LARGE_OR_LARGER: ReadonlySet<Size> = new Set<Size>(['Large', 'Huge', 'Gargantuan']);

// A character's creature size:
// 1. `character.sizeOverride` (slice 560: Human / Tiefling "Medium or
//    Small" choice) takes precedence — consumer sets this at character
//    creation when the species offers a size choice.
// 2. The monster statblock's size when the character is a monster instance.
// 3. The species size.
// 4. Medium (the 5e default when neither is known).
export const creatureSize = (character: Character, content: ResolvedContent): Size => {
  if (character.sizeOverride !== undefined) return character.sizeOverride;
  if (character.statblockId !== undefined) {
    const monster = content.monsters.get(character.statblockId);
    if (monster !== undefined) return monster.size;
  }
  return content.species.get(character.speciesId)?.size ?? DEFAULT_SIZE;
};

export const isLargeOrSmaller = (size: Size): boolean => LARGE_OR_SMALLER.has(size);
export const isLargeOrLarger = (size: Size): boolean => LARGE_OR_LARGER.has(size);
