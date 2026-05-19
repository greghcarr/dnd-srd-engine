import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  ItemAcquiredEvent,
  ItemAttunedEvent,
  ItemBuffAppliedEvent,
  ItemBuffRemovedEvent,
  ItemConsumedEvent,
  ItemDestroyedEvent,
  ItemEquippedEvent,
  ItemTimeBudgetConsumedEvent,
  ItemUnattunedEvent,
  ItemUnequippedEvent,
  ItemUsedEvent,
} from '../../schemas/events/inventory.js';
import { invariant } from '../../internal/invariants.js';

const MAX_ATTUNED_ITEMS = 3;

export const applyItemAcquired = (
  state: Draft<CampaignState>,
  event: ItemAcquiredEvent,
): void => {
  invariant(
    state.itemInstances[event.instance.id] === undefined,
    `Item instance ${event.instance.id} already exists`,
  );
  state.itemInstances[event.instance.id] = event.instance;
};

export const applyItemEquipped = (
  state: Draft<CampaignState>,
  event: ItemEquippedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  const instance = state.itemInstances[event.instanceId];
  invariant(instance !== undefined, `Item instance ${event.instanceId} not found`);
  character.equipped[event.slot] = event.instanceId;
  instance.equippedBy = event.characterId;
};

export const applyItemUnequipped = (
  state: Draft<CampaignState>,
  event: ItemUnequippedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  const priorInstanceId = character.equipped[event.slot];
  if (priorInstanceId !== undefined) {
    const instance = state.itemInstances[priorInstanceId];
    if (instance !== undefined) instance.equippedBy = undefined;
  }
  character.equipped[event.slot] = undefined;
};

export const applyItemAttuned = (
  state: Draft<CampaignState>,
  event: ItemAttunedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  const instance = state.itemInstances[event.instanceId];
  invariant(instance !== undefined, `Item instance ${event.instanceId} not found`);
  invariant(!instance.attuned, `Item ${event.instanceId} already attuned`);
  invariant(
    character.equipped.attuned.length < MAX_ATTUNED_ITEMS,
    `Character already has the maximum of ${MAX_ATTUNED_ITEMS} attuned items`,
  );
  instance.attuned = true;
  instance.attunedTo = event.characterId;
  character.equipped.attuned.push(event.instanceId);
};

export const applyItemUnattuned = (
  state: Draft<CampaignState>,
  event: ItemUnattunedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  const instance = state.itemInstances[event.instanceId];
  invariant(instance !== undefined, `Item instance ${event.instanceId} not found`);
  invariant(instance.attuned, `Item ${event.instanceId} not attuned`);
  instance.attuned = false;
  instance.attunedTo = undefined;
  character.equipped.attuned = character.equipped.attuned.filter(
    (id) => id !== event.instanceId,
  );
};

export const applyItemBuffApplied = (
  state: Draft<CampaignState>,
  event: ItemBuffAppliedEvent,
): void => {
  const instance = state.itemInstances[event.instanceId];
  invariant(instance !== undefined, `Item instance ${event.instanceId} not found`);
  // A new buff replaces any prior buff on the instance — RAW for
  // Magic Weapon / Elemental Weapon stacking ("a creature can have
  // only one of these effects at a time on a given weapon"). The
  // concentration cleanup walks state on concentration drop and
  // removes any buffs linked to the dropped effect's id.
  instance.temporaryBuff = {
    attackBonus: event.attackBonus,
    damageBonus: event.damageBonus,
    sourceEffectInstanceId: event.sourceEffectInstanceId,
    ...(event.extraDamageDice !== undefined ? { extraDamageDice: event.extraDamageDice } : {}),
    ...(event.extraDamageType !== undefined ? { extraDamageType: event.extraDamageType } : {}),
    ...(event.source !== undefined ? { source: event.source } : {}),
  };
};

export const applyItemBuffRemoved = (
  state: Draft<CampaignState>,
  event: ItemBuffRemovedEvent,
): void => {
  const instance = state.itemInstances[event.instanceId];
  if (instance === undefined) return;
  instance.temporaryBuff = undefined;
};

// Slice 235. Consumes an item: removes the instance from the
// consumer's inventory and from state.itemInstances. The planner
// emits the item's onConsume effects (Healed, etc.) before this
// event in the chain, so by the time we reach the reducer the
// mechanical effects have already landed; this just retires the
// instance.
export const applyItemConsumed = (
  state: Draft<CampaignState>,
  event: ItemConsumedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  character.inventory = character.inventory.filter((id) => id !== event.instanceId);
  delete state.itemInstances[event.instanceId];
};

// Slice 240. Sanity check for the activate-as-action path: the
// planner has already emitted the charge decrement (ItemChargeConsumed)
// and the onUse action effects (ConditionApplied, etc.). The
// instance persists after use, so the only thing this reducer
// guarantees is that the character and instance still exist at
// commit time. Unlike ItemConsumed, no retirement.
export const applyItemUsed = (
  state: Draft<CampaignState>,
  event: ItemUsedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  invariant(
    character.inventory.includes(event.instanceId),
    `Item ${event.instanceId} not in ${character.name}'s inventory`,
  );
  invariant(
    state.itemInstances[event.instanceId] !== undefined,
    `Item instance ${event.instanceId} not found`,
  );
};

// Slice 293. Increments the instance's `minutesUsed` field against
// the definition's `timeBudget.maxMinutesPerLongRest` pool. Emitted
// by `planUseItem`'s Toggle branch when the consumer reports
// `minutesElapsed` on the toggle-off intent. `applyLongRestEnded`
// resets `minutesUsed` to 0 for participants' inventory. Boots of
// Speed (10 min/LR) is the canonical user.
export const applyItemTimeBudgetConsumed = (
  state: Draft<CampaignState>,
  event: ItemTimeBudgetConsumedEvent,
): void => {
  const instance = state.itemInstances[event.instanceId];
  invariant(instance !== undefined, `Item instance ${event.instanceId} not found`);
  instance.minutesUsed = (instance.minutesUsed ?? 0) + event.amountMinutes;
};

// Slice 256. Retires a magic item destroyed by a degradation roll.
// Mirrors ItemConsumed's retirement path: removes the instance from
// the character's inventory and from state.itemInstances. The
// planner has already rolled the d20 (RNG-free apply, baked roll on
// the event) and emitted ItemChargeConsumed for the final charge
// expenditure plus the action effects before this event in the chain.
export const applyItemDestroyed = (
  state: Draft<CampaignState>,
  event: ItemDestroyedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  character.inventory = character.inventory.filter((id) => id !== event.instanceId);
  delete state.itemInstances[event.instanceId];
};
