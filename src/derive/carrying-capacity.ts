// Slice 582: minimal encumbrance domain — carrying capacity derive
// + creature weight derive.
//
// RAW PHB 2024:
//   - Carrying capacity = STR score × 15 lb (base).
//   - Goliath Powerful Build: "You count as one size larger when
//     determining your carrying capacity and the weight you can push,
//     drag, or lift." Medium → Large = ×2.
//   - Petrified (composite effect): "Its weight is multiplied by 10."
//   - Larger / Smaller sizes scale the base capacity per the 2014 PHB
//     "Lifting and Carrying" table (Tiny ×0.5, Large ×2, Huge ×4,
//     Gargantuan ×8). The 2024 PHB simplifies but Goliath's Powerful
//     Build still uses the doubling semantic.
//
// This slice ships ONLY the carrying-capacity + creature-weight
// derives. The engine does NOT model per-item weights, total carried
// load, or speed-by-load gates. Those are consumer-side computations
// (item weights live in content; consumer sums them; consumer enforces
// over-capacity rules). The minimum value of this slice is closing
// the Petrified weight ×10 RAW arm and the Goliath Powerful Build
// carrying-capacity arm so a consumer that surfaces "carrying
// capacity" on the sheet has a single canonical source.

import type { Character } from '../schemas/runtime/character.js';
import type { ResolvedContent } from '../content/pack.js';

const STRENGTH_TO_CAPACITY_LB = 15;
const POWERFUL_BUILD_MULTIPLIER = 2;
const PETRIFIED_WEIGHT_MULTIPLIER = 10;
const POWERFUL_BUILD_SPECIES_IDS: ReadonlySet<string> = new Set(['goliath']);
const PETRIFIED_CONDITION_ID = 'petrified';

export interface CarryingCapacityBreakdownEntry {
  readonly source: string;
  readonly value: number;
}

export interface CarryingCapacityResult {
  readonly capacity: number;
  readonly breakdown: ReadonlyArray<CarryingCapacityBreakdownEntry>;
}

export interface CreatureWeightBreakdownEntry {
  readonly source: string;
  readonly value: number;
}

export interface CreatureWeightResult {
  readonly weight: number;
  readonly breakdown: ReadonlyArray<CreatureWeightBreakdownEntry>;
}

const hasPowerfulBuild = (character: Character): boolean =>
  POWERFUL_BUILD_SPECIES_IDS.has(character.speciesId);

const isPetrified = (character: Character): boolean =>
  character.appliedConditions.some((c) => c.conditionId === PETRIFIED_CONDITION_ID);

// Returns the character's carrying capacity in pounds, with a
// breakdown of contributing factors. Consumer-callable for sheet
// display; the engine doesn't itself gate movement on load.
export const computeCarryingCapacity = (
  character: Character,
  _content: ResolvedContent,
): CarryingCapacityResult => {
  const base = character.abilityScores.STR * STRENGTH_TO_CAPACITY_LB;
  const breakdown: CarryingCapacityBreakdownEntry[] = [
    { source: `STR ${character.abilityScores.STR} × ${STRENGTH_TO_CAPACITY_LB}`, value: base },
  ];
  let capacity = base;
  if (hasPowerfulBuild(character)) {
    const bonus = base * (POWERFUL_BUILD_MULTIPLIER - 1);
    breakdown.push({
      source: `Powerful Build (×${POWERFUL_BUILD_MULTIPLIER})`,
      value: bonus,
    });
    capacity += bonus;
  }
  return { capacity, breakdown };
};

// Returns the character's effective weight in pounds. Base weight is
// species-or-statblock-derived (not currently modeled per-character;
// defaults to a per-size approximation when absent). Petrified
// multiplies by 10 per RAW. Consumer-callable for falling-damage
// math, lift checks against the bearer, etc.
//
// The base weight is a coarse approximation: until per-character
// weight is modeled (a Phase F-ish content expansion), this returns
// 150 lb as the standard Medium-creature default. Goliath uses 250
// lb; Halfling/Gnome use 40 lb. Petrified ×10 stacks on top.
const SIZE_DEFAULT_WEIGHTS_LB: Readonly<Record<string, number>> = {
  tiny: 5,
  small: 40,
  medium: 150,
  large: 1000,
  huge: 8000,
  gargantuan: 64000,
};

export const computeCreatureWeight = (
  character: Character,
  content: ResolvedContent,
): CreatureWeightResult => {
  const species = content.species.get(character.speciesId);
  const size = (character.sizeOverride ?? species?.size ?? 'medium').toLowerCase();
  const baseWeight = SIZE_DEFAULT_WEIGHTS_LB[size] ?? SIZE_DEFAULT_WEIGHTS_LB.medium!;
  const breakdown: CreatureWeightBreakdownEntry[] = [
    { source: `size:${size}`, value: baseWeight },
  ];
  let weight = baseWeight;
  if (isPetrified(character)) {
    const petrifiedExtra = baseWeight * (PETRIFIED_WEIGHT_MULTIPLIER - 1);
    breakdown.push({
      source: `Petrified (×${PETRIFIED_WEIGHT_MULTIPLIER})`,
      value: petrifiedExtra,
    });
    weight += petrifiedExtra;
  }
  return { weight, breakdown };
};
