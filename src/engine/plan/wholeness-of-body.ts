import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { HealedEvent } from '../../schemas/events/combat.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import { abilityModifier } from '../../derive/ability.js';
import { martialArtsDie } from './attack.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const OPEN_HAND_SUBCLASS_ID = 'warrior-of-the-open-hand';
const WHOLENESS_OF_BODY_LEVEL = 6;
const WHOLENESS_OF_BODY_RESOURCE_ID = 'wholeness-of-body';
const MIN_HP_REGAINED = 1;

export interface WholenessOfBodyIntent {
  readonly type: 'WholenessOfBody';
  readonly monkId: string;
  readonly at?: string;
}

// Warrior of the Open Hand L6 Wholeness of Body. As a Bonus Action, roll
// the Martial Arts die and regain Hit Points equal to the roll + WIS
// modifier (minimum 1). Usable a number of times equal to the WIS modifier
// (min 1) per Long Rest, tracked by the `wholeness-of-body` resource
// (`GrantResource` max = max(1, WIS mod), recharge longRest).
//
// Spends the resource (`ResourceSpent`) and emits a self `Healed`. The
// Bonus Action is consumed only when the monk is the active combatant in
// an encounter (mirrors `planDragonWings` / `planPreserveLife`); out of
// combat the healing is simply applied, since self-healing is legitimate
// outside initiative.
export const planWholenessOfBody = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: WholenessOfBodyIntent,
): ReadonlyArray<Event> => {
  const monk = state.characters[intent.monkId];
  if (!monk) throw new Error(`Unknown monk ${intent.monkId}`);
  const enrollment = monk.classes.find((c) => c.classId === 'monk');
  if (
    enrollment === undefined ||
    enrollment.level < WHOLENESS_OF_BODY_LEVEL ||
    enrollment.subclassId !== OPEN_HAND_SUBCLASS_ID
  ) {
    throw new Error(
      `${monk.name} does not have Wholeness of Body (requires Warrior of the Open Hand, Monk level ${WHOLENESS_OF_BODY_LEVEL})`,
    );
  }

  const resource = monk.resources.find((r) => r.resourceId === WHOLENESS_OF_BODY_RESOURCE_ID);
  if (!resource || resource.current <= 0) {
    throw new Error(`${monk.name} has no Wholeness of Body uses to spend`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const monkCb = encounter?.combatants.find((c) => c.combatantId === intent.monkId);
    if (monkCb !== undefined) {
      const active = encounter?.combatants[encounter.activeIndex];
      if (!active || active.combatantId !== intent.monkId) {
        throw new Error(`${monk.name} is not the active combatant`);
      }
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${monk.name} has already used their bonus action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.monkId,
        kind: 'bonusAction',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.monkId,
    resourceId: WHOLENESS_OF_BODY_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  const die = parseDiceExpression(martialArtsDie(enrollment.level)!).die;
  const amount = Math.max(MIN_HP_REGAINED, rollDie(die, rng) + abilityModifier(monk.abilityScores.WIS));
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'Healed',
    targetId: intent.monkId as ULID,
    amount,
    source: 'wholeness-of-body',
  } satisfies HealedEvent);

  return events;
};
