import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

const KI_RESOURCE_ID = 'ki';
const SUPERIOR_DEFENSE_CONDITION_ID = 'superior-defense-active';
const SUPERIOR_DEFENSE_KI_COST = 3;
// RAW 1-minute duration = 10 combat rounds. The slice-102 auto-expiry
// path stamps `expiresOnRound` on the emitted ConditionApplied when
// inside an active encounter, and `planAdvanceTurn` lifts the
// condition when the bearer's turn starts on the expiry round.
const SUPERIOR_DEFENSE_DURATION_ROUNDS = 10;

export interface SuperiorDefenseIntent {
  readonly type: 'SuperiorDefense';
  readonly monkId: string;
  readonly at?: string;
}

/**
 * RAW 2024 PHB Monk L18 Superior Defense: as a Bonus Action, spend
 * 3 Focus Points (the engine models the Monk pool as the `ki`
 * resource) and gain Resistance to all damage except Force for 1
 * minute. Applied via the `superior-defense-active` condition, which
 * ships 12 `GrantResistance` entries (one per damage type that is
 * not Force).
 */
export const planSuperiorDefense = (
  state: CampaignState,
  intent: SuperiorDefenseIntent,
): ReadonlyArray<Event> => {
  const monk = state.characters[intent.monkId];
  invariant(monk !== undefined, `Character ${intent.monkId} not found`);

  // Slice 744: Superior Defense is a 1-minute active state — you don't
  // re-activate (or spend a second 3 Focus Points) while it's already active.
  if (monk.appliedConditions.some((c) => c.conditionId === SUPERIOR_DEFENSE_CONDITION_ID)) {
    throw new Error(`${monk.name} already has Superior Defense active`);
  }

  const ki = monk.resources.find((r) => r.resourceId === KI_RESOURCE_ID);
  if (!ki || ki.current < SUPERIOR_DEFENSE_KI_COST) {
    throw new Error(
      `${monk.name} needs ${SUPERIOR_DEFENSE_KI_COST} Focus Points for Superior Defense (has ${ki?.current ?? 0})`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  let currentRound: number | undefined;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.monkId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${monk.name} has already used their bonus action this turn`);
      }
      const bonusActionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.monkId,
        kind: 'bonusAction',
      };
      events.push(bonusActionConsumed);
    }
    currentRound = encounter?.round;
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.monkId,
    resourceId: KI_RESOURCE_ID,
    amount: SUPERIOR_DEFENSE_KI_COST,
  } satisfies ResourceSpentEvent);

  const conditionApplied: ConditionAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.monkId as ULID,
    conditionId: SUPERIOR_DEFENSE_CONDITION_ID,
    appliedConditionId: newAppliedConditionId(),
    sourceCharacterId: intent.monkId as ULID,
    ...(currentRound !== undefined
      ? { expiresOnRound: currentRound + SUPERIOR_DEFENSE_DURATION_ROUNDS }
      : {}),
  };
  events.push(conditionApplied);

  return events;
};
