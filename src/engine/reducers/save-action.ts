import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import { invariant } from '../../internal/invariants.js';
import type {
  SaveActionExpendedEvent,
  SaveActionRechargedEvent,
} from '../../schemas/events/save-action.js';

export const applySaveActionExpended = (
  draft: Draft<CampaignState>,
  event: SaveActionExpendedEvent,
): void => {
  const monster = draft.characters[event.monsterId];
  invariant(monster !== undefined, `Monster ${event.monsterId} not found`);
  if (!monster.expendedSaveActionIds.includes(event.saveActionId)) {
    monster.expendedSaveActionIds.push(event.saveActionId);
  }
};

export const applySaveActionRecharged = (
  draft: Draft<CampaignState>,
  event: SaveActionRechargedEvent,
): void => {
  const monster = draft.characters[event.monsterId];
  invariant(monster !== undefined, `Monster ${event.monsterId} not found`);
  monster.expendedSaveActionIds = monster.expendedSaveActionIds.filter(
    (id) => id !== event.saveActionId,
  );
};
