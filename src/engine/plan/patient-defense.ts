import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DisengagedEvent } from '../../schemas/events/movement.js';
import type { ConditionAppliedEvent, TempHPGrantedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { martialArtsDie } from './attack.js';
import type { ULID } from '../ids-utils.js';

const KI_RESOURCE_ID = 'ki';
const MONKS_FOCUS_LEVEL = 2;
const HEIGHTENED_FOCUS_LEVEL = 10;
const HEIGHTENED_TEMP_HP_DICE = 2;
const DODGED_CONDITION_ID = 'dodged';

export interface PatientDefenseIntent {
  readonly type: 'PatientDefense';
  readonly monkId: string;
  // false / omitted: take only the free Disengage Bonus Action.
  // true: spend 1 Focus Point to take Disengage + Dodge (and, at Monk
  // level 10+, gain Temporary Hit Points equal to two Martial Arts dice).
  readonly spendFocusPoint?: boolean;
  readonly at?: string;
}

// Monk L2 Monk's Focus — Patient Defense. As a Bonus Action, take the
// Disengage action; or spend 1 Focus Point to take both Disengage and
// Dodge. Heightened Focus (Monk L10): spending the Focus Point also
// grants Temporary Hit Points equal to two rolls of the Martial Arts die.
//
// Disengage / Dodge are combat-positioning actions, so this requires the
// monk to be the active combatant in an active encounter (mirrors
// planDodge / planDisengage). Reuses their event shapes (Disengaged +
// the `dodged` condition) under a Bonus Action.
export const planPatientDefense = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: PatientDefenseIntent,
): ReadonlyArray<Event> => {
  const monk = state.characters[intent.monkId];
  if (!monk) throw new Error(`Unknown monk ${intent.monkId}`);
  const monkLevel = monk.classes.find((c) => c.classId === 'monk')?.level ?? 0;
  if (monkLevel < MONKS_FOCUS_LEVEL) {
    throw new Error(`${monk.name} does not have Monk's Focus (requires Monk level ${MONKS_FOCUS_LEVEL})`);
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Patient Defense can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.monkId) {
    throw new Error(`${monk.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${monk.name} has already used their bonus action this turn`);
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
    type: 'Disengaged',
    encounterId: activeEncounterId,
    combatantId: intent.monkId as ULID,
  } satisfies DisengagedEvent);

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
      type: 'ConditionApplied',
      targetId: intent.monkId as ULID,
      conditionId: DODGED_CONDITION_ID,
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);

    // Heightened Focus (L10): two rolls of the Martial Arts die as
    // Temporary Hit Points.
    if (monkLevel >= HEIGHTENED_FOCUS_LEVEL) {
      const die = parseDiceExpression(martialArtsDie(monkLevel)!).die;
      let amount = 0;
      for (let i = 0; i < HEIGHTENED_TEMP_HP_DICE; i += 1) amount += rollDie(die, rng);
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'TempHPGranted',
        targetId: intent.monkId as ULID,
        amount,
        source: 'heightened-focus',
      } satisfies TempHPGrantedEvent);
    }
  }

  return events;
};
