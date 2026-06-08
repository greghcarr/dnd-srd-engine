import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const RAGE_RESOURCE_ID = 'rage';
const FRENZIED_CONDITION_ID = 'frenzied';

export interface FrenzyIntent {
  readonly type: 'Frenzy';
  readonly combatantId: string;
  readonly at?: string;
}

// Path of the Berserker (Barbarian L3) Frenzy. Consumes one Rage
// charge and applies the `frenzied` condition. RAW also grants a
// bonus-action melee weapon attack each turn while Raging and one
// level of exhaustion at the end of the rage; those parts are
// consumer-driven until Rage gets its own dedicated planner slice
// (this engine doesn't currently track an active Rage as a first-class
// state, just the resource).
export const planFrenzy = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: FrenzyIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.combatantId];
  if (!character) throw new Error(`Unknown character ${intent.combatantId}`);
  // Slice 744: Frenzy is a per-rage active state — you don't re-enter it
  // (or spend a second Rage charge) while already frenzied.
  if (character.appliedConditions.some((c) => c.conditionId === FRENZIED_CONDITION_ID)) {
    throw new Error(`${character.name} is already frenzied`);
  }
  const rage = character.resources.find((r) => r.resourceId === RAGE_RESOURCE_ID);
  if (!rage || rage.current <= 0) {
    throw new Error(`${character.name} has no Rage available`);
  }
  const at = intent.at ?? nowIso();
  const spend: ResourceSpentEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.combatantId,
    resourceId: RAGE_RESOURCE_ID,
    amount: 1,
  };
  const conditionApplied: ConditionAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.combatantId as ULID,
    conditionId: FRENZIED_CONDITION_ID,
    appliedConditionId: newAppliedConditionId(),
  };
  return [spend, conditionApplied];
};
