import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DashedEvent } from '../../schemas/events/movement.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { assertActorCanAct } from './_actor-state.js';
import type { ULID } from '../ids-utils.js';

const EXPEDITIOUS_RETREAT_CONDITION = 'expeditious-retreat-active';

export interface ExpeditiousRetreatDashIntent {
  readonly type: 'ExpeditiousRetreatDash';
  readonly actorId: string;
  readonly at?: string;
}

// Slice 521: Expeditious Retreat - the per-turn Bonus Action Dash arm.
// RAW (Expeditious Retreat, 1st-level transmutation, V/S, Self,
// Concentration up to 10 minutes): "Cast this spell as a Bonus Action.
// Until the spell ends, you can take the Dash action as a Bonus Action
// on each of your turns."
//
// The cast itself consumes the bearer's Bonus Action (handled by the
// spell's `castingTime: "Bonus Action"` in the cast-spell envelope) and
// applies the `expeditious-retreat-active` condition on Self via the
// `buff` mechanic. This planner is the per-turn BA-Dash arm; the
// bearer invokes it on subsequent turns to spend their Bonus Action on
// a Dash. Gate: bearer carries the active condition (the buff's
// concentration link auto-cleans the condition when concentration
// drops). Mirrors planCunningAction's dash arm verbatim.
export const planExpeditiousRetreatDash = (
  state: CampaignState,
  intent: ExpeditiousRetreatDashIntent,
): ReadonlyArray<Event> => {
  const actor = state.characters[intent.actorId];
  if (!actor) throw new Error(`Unknown character ${intent.actorId}`);
  assertActorCanAct(actor, 'Expeditious Retreat Dash');
  const hasBuff = actor.appliedConditions.some(
    (c) => c.conditionId === EXPEDITIOUS_RETREAT_CONDITION,
  );
  if (!hasBuff) {
    throw new Error(
      `${actor.name} is not under the effect of Expeditious Retreat`,
    );
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Expeditious Retreat Dash can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.actorId) {
    throw new Error(`${actor.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${actor.name} has already used their bonus action this turn`);
  }
  if (active.turnUsage.dashed) {
    throw new Error(`${actor.name} has already dashed this turn`);
  }

  const at = intent.at ?? nowIso();
  const bonusConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: activeEncounterId,
    combatantId: intent.actorId,
    kind: 'bonusAction',
  };
  const dashed: DashedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'Dashed',
    encounterId: activeEncounterId,
    combatantId: intent.actorId as ULID,
  };
  return [bonusConsumed, dashed];
};
