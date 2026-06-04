import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import { D20_SIDES } from '../../internal/constants.js';

// Slice 543: shared helper for the Halfling Luck reroll-on-natural-1
// mechanic at every d20 site beyond the initial three (attack, save,
// check) already wired in slices 538-539.
//
// RAW (SRD 5.2.1 Halfling): "Luck. When you roll a 1 on the d20 of
// a D20 Test, you can reroll the die, and you must use the new roll."
//
// Two helper variants:
//   - `applyHalflingLuckFromFlag(usedD20, hasLuck, rolls, rng)`: the
//     low-level entry that callers with an already-known luck flag
//     use. Mutates rolls (appends the reroll); returns the new
//     usedD20. If usedD20 is not 1 or hasLuck is false, returns
//     usedD20 unchanged.
//   - `applyHalflingLuckForCharacter(usedD20, characterId, state,
//     content, rolls, rng)`: the convenience entry that builds the
//     effect stack from the character. Use this at sites that don't
//     already have an EffectAccumulator handy.
//
// The reroll is RAW-correct: only one reroll per natural 1 (no
// chained rerolls if the second die is also a 1, per "you must use
// the new roll").

export const applyHalflingLuckFromFlag = (
  usedD20: number,
  hasLuck: boolean,
  rolls: number[],
  rng: RNG,
): number => {
  if (usedD20 !== 1 || !hasLuck) return usedD20;
  const reroll = rollDie(D20_SIDES, rng);
  rolls.push(reroll);
  return reroll;
};

export const characterHasHalflingLuck = (
  character: Character,
  state: CampaignState,
  content: ResolvedContent,
): boolean => {
  const effects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  return effects.hasHalflingLuck();
};

export const applyHalflingLuckForCharacter = (
  usedD20: number,
  characterId: string,
  state: CampaignState,
  content: ResolvedContent,
  rolls: number[],
  rng: RNG,
): number => {
  if (usedD20 !== 1) return usedD20;
  const character = state.characters[characterId];
  if (!character) return usedD20;
  const hasLuck = characterHasHalflingLuck(character, state, content);
  return applyHalflingLuckFromFlag(usedD20, hasLuck, rolls, rng);
};
