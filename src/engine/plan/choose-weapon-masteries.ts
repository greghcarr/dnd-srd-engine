import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { WeaponMasteriesChosenEvent } from '../../schemas/events/weapon-mastery.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import { isWeaponProficient } from '../../derive/attack.js';
import type { ULID } from '../ids-utils.js';

export interface ChooseWeaponMasteriesIntent {
  readonly type: 'ChooseWeaponMasteries';
  readonly characterId: string;
  // The weapon definition ids the character masters (e.g. ['longsword',
  // 'greataxe']). Replaces any prior selection.
  readonly weaponDefinitionIds: ReadonlyArray<string>;
  readonly at?: string;
}

// Slice 502: a martial character chooses which weapon kinds they've
// mastered for the 2024 Weapon Mastery feature. Validates the choice
// against the character's mastery slot budget (from GrantWeaponMastery),
// the granted property pool, and weapon proficiency, then emits the
// selection. Re-choosable on a Long Rest (RAW): the consumer simply
// invokes this again; the reducer replaces the prior selection.
export const planChooseWeaponMasteries = (
  state: CampaignState,
  content: ResolvedContent,
  intent: ChooseWeaponMasteriesIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);

  const effects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const budget = effects.weaponMasterySlots();
  if (budget === 0) {
    throw new Error(`${character.name} does not have the Weapon Mastery feature`);
  }
  if (intent.weaponDefinitionIds.length > budget) {
    throw new Error(
      `${character.name} can master at most ${budget} weapon${budget === 1 ? '' : 's'}, got ${intent.weaponDefinitionIds.length}`,
    );
  }

  const grantedProperties = effects.grantedWeaponMasteryProperties();
  for (const weaponId of intent.weaponDefinitionIds) {
    const weapon = content.items.get(weaponId);
    if (weapon === undefined || weapon.itemKind !== 'weapon') {
      throw new Error(`Weapon Mastery choice '${weaponId}' is not a weapon`);
    }
    if (weapon.mastery === undefined) {
      throw new Error(`Weapon '${weaponId}' has no mastery property to learn`);
    }
    if (!grantedProperties.has(weapon.mastery)) {
      throw new Error(
        `${character.name}'s Weapon Mastery feature does not grant the ${weapon.mastery} property (weapon '${weaponId}')`,
      );
    }
    if (!isWeaponProficient(character, weapon, content)) {
      throw new Error(`${character.name} is not proficient with '${weaponId}'`);
    }
  }

  const event: WeaponMasteriesChosenEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'WeaponMasteriesChosen',
    characterId: intent.characterId as ULID,
    weaponDefinitionIds: [...intent.weaponDefinitionIds],
  };
  return [event];
};
