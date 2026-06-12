import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../schemas/events/combat.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import type { ULID } from '../ids-utils.js';

// Slice 832 / 834: undead Life Drain — the target's Hit Point maximum drops by
// the post-mitigation damage taken ("its Hit Point maximum decreases by an
// amount equal to the damage taken"). Carried as a NEGATIVE hpMaxBonusDelta on
// the `life-drained` condition (the ConditionApplied reducer lowers
// hp.maxBonus); it ends on a Long Rest (planLongRest), restoring the maximum.
//
// Because applyConditionApplied dedupes a condition by id, cross-turn
// accumulation keeps ONE cumulative entry: read the existing delta, remove it,
// re-apply the summed delta. The in-scope drainers strike once per turn, so
// there's no intra-event prior entry to thread.
//
// Shared by the attack on-hit drain (Specter / Wraith `drainsMaxHp` weapons,
// slice 832) and the save-action drain (Wight Life Drain `onFail.drainMaxHp`,
// slice 834). The literal conditionId stays here (not a constant) so the
// pack-integrity engine-emitted-conditions scan keeps guarding it.

export const planLifeDrainEvents = (
  state: CampaignState,
  targetId: string,
  sourceCharacterId: string,
  amount: number,
  at: string,
): Event[] => {
  if (amount <= 0) return [];
  const existingDelta = state.characters[targetId]?.appliedConditions
    .find((c) => c.conditionId === 'life-drained')?.hpMaxBonusDelta ?? 0;
  const events: Event[] = [];
  if (existingDelta !== 0) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: targetId as ULID,
      conditionId: 'life-drained',
    } satisfies ConditionRemovedEvent);
  }
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: targetId as ULID,
    conditionId: 'life-drained',
    appliedConditionId: newAppliedConditionId(),
    sourceCharacterId: sourceCharacterId as ULID,
    hpMaxBonusDelta: existingDelta - amount,
  } satisfies ConditionAppliedEvent);
  return events;
};
