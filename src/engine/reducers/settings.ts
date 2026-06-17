import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  CampaignSettingsChangedEvent,
  HeroPointGrantedEvent,
  HeroPointSpentEvent,
} from '../../schemas/events/settings.js';
import { invariant } from '../../internal/invariants.js';

export const applyCampaignSettingsChanged = (
  state: Draft<CampaignState>,
  event: CampaignSettingsChangedEvent,
): void => {
  const s = state.settings;
  if (event.grittyRest !== undefined) s.grittyRest = event.grittyRest;
  if (event.heroPoints !== undefined) s.heroPoints = event.heroPoints;
  if (event.sanity !== undefined) s.sanity = event.sanity;
  if (event.massCombat !== undefined) s.massCombat = event.massCombat;
  if (event.feaCharacterFlaws !== undefined) s.feaCharacterFlaws = event.feaCharacterFlaws;
  if (event.enforceLongRestCadence !== undefined) s.enforceLongRestCadence = event.enforceLongRestCadence;
  if (event.customHouserulesAdd !== undefined) {
    for (const r of event.customHouserulesAdd) {
      if (!s.customHouserules.includes(r)) s.customHouserules.push(r);
    }
  }
  if (event.customHouserulesRemove !== undefined) {
    s.customHouserules = s.customHouserules.filter((r) => !event.customHouserulesRemove!.includes(r));
  }
};

export const applyHeroPointGranted = (
  state: Draft<CampaignState>,
  event: HeroPointGrantedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  character.heroPoints = Math.max(0, character.heroPoints + event.amount);
};

export const applyHeroPointSpent = (
  state: Draft<CampaignState>,
  event: HeroPointSpentEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  invariant(character.heroPoints >= 1, `${event.characterId} has no hero points to spend`);
  character.heroPoints -= 1;
};
