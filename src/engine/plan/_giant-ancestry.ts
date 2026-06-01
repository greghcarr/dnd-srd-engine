import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Character } from '../../schemas/runtime/character.js';

// Shared constants + helpers for Goliath Giant Ancestry options
// (slices 554-559: Cloud's Jaunt, Fire's Burn, Frost's Chill, Hill's
// Tumble, Stone's Endurance, Storm's Thunder). All six share the
// same OfferChoice id, resource id, and species id; centralizing
// the lookup here keeps each planner small.

export const GOLIATH_SPECIES_ID = 'goliath';
export const GIANT_ANCESTRY_RESOURCE_ID = 'giant-ancestry';
export const GIANT_ANCESTRY_CHOICE_ID = 'goliath-giant-ancestry';

export const GIANT_ANCESTRY_OPTION_IDS = [
  'clouds-jaunt',
  'fires-burn',
  'frosts-chill',
  'hills-tumble',
  'stones-endurance',
  'storms-thunder',
] as const;
export type GiantAncestryOption = (typeof GIANT_ANCESTRY_OPTION_IDS)[number];

// Returns the option id the Goliath chose from the
// `goliath-giant-ancestry` OfferChoice (e.g. 'clouds-jaunt'), or
// `undefined` if the choice was never resolved. Scans the
// character's pending choices for the first resolved option whose
// id is one of the six known Giant Ancestry options. (The
// PendingChoice schema doesn't carry the OfferChoice's source
// choiceId, so we match by option-id family — these six ids are
// unique to Giant Ancestry across the SRD content.)
export const findGoliathAncestryChoice = (
  character: Character,
  state: CampaignState,
): GiantAncestryOption | undefined => {
  const known = new Set<string>(GIANT_ANCESTRY_OPTION_IDS);
  for (const choiceId of character.pendingChoiceIds) {
    const choice = state.pendingChoices[choiceId];
    if (!choice?.resolution) continue;
    for (const optionId of choice.resolution.selectedOptionIds) {
      if (known.has(optionId)) return optionId as GiantAncestryOption;
    }
  }
  return undefined;
};
