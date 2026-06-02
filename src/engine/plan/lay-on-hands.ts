import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionRemovedEvent, HealedEvent } from '../../schemas/events/combat.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { assertActorCanAct } from './_actor-state.js';
import type { ULID } from '../ids-utils.js';

const PALADIN_CLASS_ID = 'paladin';
const LAY_ON_HANDS_RESOURCE_ID = 'lay-on-hands';
const CURE_POISON_COST = 5;
const POISONED_CONDITION_ID = 'poisoned';

export type LayOnHandsMode = 'heal' | 'cure-poison';

export interface LayOnHandsIntent {
  readonly type: 'LayOnHands';
  readonly paladinId: string;
  readonly targetId: string;
  readonly mode: LayOnHandsMode;
  readonly amount?: number;
  readonly at?: string;
}

// L1 RAW Lay On Hands (PHB 2024 Paladin L1):
//
//   "You have a pool of healing power that replenishes when you
//   finish a Long Rest. With that pool, you can restore a total
//   number of Hit Points equal to five times your Paladin level.
//
//   As a Bonus Action, you can touch a creature (which could be
//   yourself) and draw power from the pool of healing to restore
//   a number of Hit Points to that creature, up to the maximum
//   amount remaining in the pool.
//
//   You can also expend 5 Hit Points from the pool of healing
//   power to remove the Poisoned condition from the creature;
//   those points don't also restore Hit Points to the creature."
//
// The planner validates:
//   - Paladin class membership.
//   - lay-on-hands resource exists + has sufficient points.
//   - mode 'heal' requires `amount >= 1` and pool >= amount.
//   - mode 'cure-poison' requires pool >= 5 AND the target has the
//     poisoned condition (RAW: the points are spent regardless of
//     whether the condition was present — but we enforce a check
//     to surface mistakes at plan time rather than wasting points).
//   - Touch range is consumer-managed (engine doesn't track positions).
//
// Events emitted:
//   - ActionEconomyConsumed { kind: 'bonusAction' } (in encounter on
//     Paladin's turn).
//   - ResourceSpent { resourceId: 'lay-on-hands', amount }.
//   - mode 'heal': Healed { targetId, amount }.
//   - mode 'cure-poison': ConditionRemoved { targetId, conditionId:
//     'poisoned' } (no Healed event; RAW: "those points don't also
//     restore Hit Points").
export const planLayOnHands = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: LayOnHandsIntent,
): ReadonlyArray<Event> => {
  const paladin = state.characters[intent.paladinId];
  if (!paladin) throw new Error(`Unknown paladin ${intent.paladinId}`);
  assertActorCanAct(paladin, 'Lay on Hands');

  const paladinClass = paladin.classes.find((c) => c.classId === PALADIN_CLASS_ID);
  if (!paladinClass) {
    throw new Error(`${paladin.name} does not have Lay on Hands (Paladin L1 feature)`);
  }

  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown Lay on Hands target ${intent.targetId}`);

  const resource = paladin.resources.find((r) => r.resourceId === LAY_ON_HANDS_RESOURCE_ID);
  if (resource === undefined) {
    throw new Error(`${paladin.name} has no Lay on Hands pool`);
  }

  let cost: number;
  if (intent.mode === 'heal') {
    if (intent.amount === undefined || intent.amount < 1) {
      throw new Error('Lay on Hands heal requires amount >= 1');
    }
    if (intent.amount > resource.current) {
      throw new Error(
        `Lay on Hands pool insufficient: have ${resource.current}, requested ${intent.amount}`,
      );
    }
    cost = intent.amount;
  } else {
    if (resource.current < CURE_POISON_COST) {
      throw new Error(
        `Lay on Hands cure-poison requires ${CURE_POISON_COST} pool points; have ${resource.current}`,
      );
    }
    const hasPoisoned = target.appliedConditions.some(
      (c) => c.conditionId === POISONED_CONDITION_ID,
    );
    if (!hasPoisoned) {
      throw new Error(`${target.name} is not Poisoned; Lay on Hands cure-poison would waste 5 pool points`);
    }
    cost = CURE_POISON_COST;
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.paladinId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${paladin.name} has already used their bonus action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.paladinId,
        kind: 'bonusAction',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.paladinId as ULID,
    resourceId: LAY_ON_HANDS_RESOURCE_ID,
    amount: cost,
  } satisfies ResourceSpentEvent);

  if (intent.mode === 'heal') {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: intent.targetId as ULID,
      amount: cost,
    } satisfies HealedEvent);
  } else {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: intent.targetId as ULID,
      conditionId: POISONED_CONDITION_ID,
    } satisfies ConditionRemovedEvent);
  }

  return events;
};
