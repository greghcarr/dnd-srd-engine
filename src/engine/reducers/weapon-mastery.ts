import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  WeaponMasteriesChosenEvent,
  WeaponMasteryActivatedEvent,
} from '../../schemas/events/weapon-mastery.js';
import { invariant } from '../../internal/invariants.js';

export const applyWeaponMasteryActivated = (
  state: Draft<CampaignState>,
  event: WeaponMasteryActivatedEvent,
): void => {
  invariant(
    state.characters[event.attackerId] !== undefined,
    `Attacker ${event.attackerId} not found`,
  );
  invariant(
    state.itemInstances[event.weaponInstanceId] !== undefined,
    `Weapon ${event.weaponInstanceId} not found`,
  );
  if (event.targetId !== undefined) {
    invariant(
      state.characters[event.targetId] !== undefined,
      `Target ${event.targetId} not found`,
    );
  }
};

// Slice 502: overwrite the character's chosen Weapon Mastery weapon
// kinds. Re-choosable on a Long Rest by emitting this event again, so
// the reducer replaces rather than merges.
export const applyWeaponMasteriesChosen = (
  state: Draft<CampaignState>,
  event: WeaponMasteriesChosenEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  character.weaponMasteries = [...event.weaponDefinitionIds];
};
