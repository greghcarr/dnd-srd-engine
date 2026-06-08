import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const DWARF_SPECIES_ID = 'dwarf';
const STONECUNNING_RESOURCE = 'stonecunning';
const STONECUNNING_CONDITION = 'stonecunning-active';

export interface StonecunningIntent {
  readonly type: 'Stonecunning';
  readonly dwarfId: string;
  // Consumer-supplied flag: RAW gates the trait on being on or
  // touching a stone surface. Engine doesn't model surface contact;
  // consumer signals true when the dwarf is in stone contact. When
  // undefined or false, the planner throws so the consumer can either
  // surface the gate to the player or bypass with `onStoneSurface: true`
  // when they've already validated it.
  readonly onStoneSurface?: boolean;
  readonly at?: string;
}

// Dwarf species trait (PHB 2024, SRD 5.2.1): "As a Bonus Action, you
// gain Tremorsense with a range of 60 feet for 10 minutes. You must be
// on a stone surface or touching a stone surface to use this Tremorsense.
// The stone can be natural or worked. You can use this Bonus Action a
// number of times equal to your Proficiency Bonus, and you regain all
// expended uses when you finish a Long Rest."
//
// Resource-gated (PB uses per long rest); the dwarf species traits
// carry a matching `GrantResource { resourceId: 'stonecunning', max:
// profBonus, recharge: 'longRest' }` so the pool refunds on rest.
// Requires the dwarf to be the active combatant in an active encounter
// (mirrors planDash / planAdrenalineRush). Emits ActionEconomyConsumed
// (bonusAction), ResourceSpent (1 of stonecunning), and ConditionApplied
// (stonecunning-active).
//
// Documented RAW deviation: the 10-minute duration is consumer-managed
// (the engine doesn't tick wall-clock; the consumer ends the condition
// after 10 in-fiction minutes or whatever rule they enforce). The
// condition's GrantSense projects tremorsense 60 ft into the bearer's
// effect stack while active.
export const planStonecunning = (
  state: CampaignState,
  intent: StonecunningIntent,
): ReadonlyArray<Event> => {
  const dwarf = state.characters[intent.dwarfId];
  if (!dwarf) throw new Error(`Unknown character ${intent.dwarfId}`);
  if (dwarf.speciesId !== DWARF_SPECIES_ID) {
    throw new Error(`${dwarf.name} does not have Stonecunning (Dwarf species only)`);
  }
  // Slice 744: Stonecunning's Tremorsense is a 10-minute active state — you
  // don't re-activate (or spend a second use) while it's already active.
  if (dwarf.appliedConditions.some((c) => c.conditionId === STONECUNNING_CONDITION)) {
    throw new Error(`${dwarf.name} already has Stonecunning active`);
  }
  if (intent.onStoneSurface !== true) {
    throw new Error(
      `${dwarf.name} must be on or touching a stone surface to use Stonecunning`,
    );
  }

  const resource = dwarf.resources.find((r) => r.resourceId === STONECUNNING_RESOURCE);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${dwarf.name} has no Stonecunning uses remaining (regain on a Long Rest)`,
    );
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Stonecunning can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.dwarfId) {
    throw new Error(`${dwarf.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${dwarf.name} has already used their bonus action this turn`);
  }

  const at = intent.at ?? nowIso();
  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: activeEncounterId,
      combatantId: intent.dwarfId,
      kind: 'bonusAction',
    } satisfies ActionEconomyConsumedEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.dwarfId as ULID,
      resourceId: STONECUNNING_RESOURCE,
      amount: 1,
    } satisfies ResourceSpentEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.dwarfId as ULID,
      conditionId: STONECUNNING_CONDITION,
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent,
  ];
};
