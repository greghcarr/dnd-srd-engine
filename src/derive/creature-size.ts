import type { Character } from '../schemas/runtime/character.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Size } from '../schemas/primitives.js';

const DEFAULT_SIZE: Size = 'Medium';
// "Large or smaller" in RAW size-gate clauses (weapon-mastery Push,
// Cunning Strike Trip): everything up to and including Large.
const LARGE_OR_SMALLER: ReadonlySet<Size> = new Set<Size>(['Tiny', 'Small', 'Medium', 'Large']);

// A character's creature size: the monster statblock's size when the
// character is a monster instance, else the species size, else Medium
// (the 5e default when neither is known).
export const creatureSize = (character: Character, content: ResolvedContent): Size => {
  if (character.statblockId !== undefined) {
    const monster = content.monsters.get(character.statblockId);
    if (monster !== undefined) return monster.size;
  }
  return content.species.get(character.speciesId)?.size ?? DEFAULT_SIZE;
};

export const isLargeOrSmaller = (size: Size): boolean => LARGE_OR_SMALLER.has(size);
