import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DashedEvent, DisengagedEvent } from '../../schemas/events/movement.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const KI_RESOURCE_ID = 'ki';
const MONKS_FOCUS_LEVEL = 2;

export interface StepOfTheWindIntent {
  readonly type: 'StepOfTheWind';
  readonly monkId: string;
  // false / omitted: take only the free Dash Bonus Action.
  // true: spend 1 Focus Point to take both Disengage and Dash (and, per
  // RAW, double the jump distance — see the consumer-managed note below).
  readonly spendFocusPoint?: boolean;
  readonly at?: string;
}

// Monk L2 Monk's Focus — Step of the Wind. As a Bonus Action, take the
// Dash action; or spend 1 Focus Point to take both Disengage and Dash.
// Requires the monk to be the active combatant in an active encounter
// (mirrors planDash / planDisengage). Reuses their event shapes (Dashed +
// Disengaged) under a Bonus Action.
//
// Consumer-managed (not engine-modeled, consistent with the engine's
// movement-geometry stance): the focus-mode "your jump distance is
// doubled for the turn" (the engine tracks no jump distance), and the
// L10 Heightened Focus arm "a willing Large-or-smaller creature within
// 5 feet moves with you without provoking" (the engine tracks no
// positions). Both are the consumer's responsibility.
export const planStepOfTheWind = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: StepOfTheWindIntent,
): ReadonlyArray<Event> => {
  const monk = state.characters[intent.monkId];
  if (!monk) throw new Error(`Unknown monk ${intent.monkId}`);
  const monkLevel = monk.classes.find((c) => c.classId === 'monk')?.level ?? 0;
  if (monkLevel < MONKS_FOCUS_LEVEL) {
    throw new Error(`${monk.name} does not have Monk's Focus (requires Monk level ${MONKS_FOCUS_LEVEL})`);
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Step of the Wind can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.monkId) {
    throw new Error(`${monk.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${monk.name} has already used their bonus action this turn`);
  }
  if (active.turnUsage.dashed) {
    throw new Error(`${monk.name} has already dashed this turn`);
  }

  const spendFocus = intent.spendFocusPoint === true;
  const ki = monk.resources.find((r) => r.resourceId === KI_RESOURCE_ID);
  if (spendFocus && (!ki || ki.current <= 0)) {
    throw new Error(`${monk.name} has no Focus Points to spend`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: activeEncounterId,
    combatantId: intent.monkId,
    kind: 'bonusAction',
  } satisfies ActionEconomyConsumedEvent);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'Dashed',
    encounterId: activeEncounterId,
    combatantId: intent.monkId as ULID,
  } satisfies DashedEvent);

  if (spendFocus) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.monkId,
      resourceId: KI_RESOURCE_ID,
      amount: 1,
    } satisfies ResourceSpentEvent);

    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Disengaged',
      encounterId: activeEncounterId,
      combatantId: intent.monkId as ULID,
    } satisfies DisengagedEvent);
  }

  return events;
};
