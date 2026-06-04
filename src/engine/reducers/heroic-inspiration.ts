import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  HeroicInspirationGrantedEvent,
  HeroicInspirationConsumedEvent,
} from '../../schemas/events/heroic-inspiration.js';

// Slice 542: Heroic Inspiration grant + consume reducers.
//
// RAW: "You can have only one Heroic Inspiration at a time." The
// flag is binary; re-granting while already true is a no-op (no
// stacking), and consuming while false is also a no-op (the
// planner gates on resource availability, but the reducer should
// be tolerant of replays / double-applies).

export const applyHeroicInspirationGranted = (
  state: Draft<CampaignState>,
  event: HeroicInspirationGrantedEvent,
): void => {
  const character = state.characters[event.characterId];
  if (!character) return;
  character.heroicInspiration = true;
};

export const applyHeroicInspirationConsumed = (
  state: Draft<CampaignState>,
  event: HeroicInspirationConsumedEvent,
): void => {
  const character = state.characters[event.characterId];
  if (!character) return;
  character.heroicInspiration = false;
};
