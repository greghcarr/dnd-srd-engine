import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const DRACONIC_SUBCLASS_ID = 'draconic-sorcery';
const DRAGON_WINGS_LEVEL = 14;
const DRAGON_WINGS_CONDITION_ID = 'dragon-wings-active';

export interface DragonWingsIntent {
  readonly type: 'DragonWings';
  readonly sorcererId: string;
  readonly at?: string;
}

// Draconic Sorcery L14 Dragon Wings. As a Bonus Action, sprout draconic
// wings: gain a Fly Speed of 60 feet. Applies the `dragon-wings-active`
// condition (ModifySpeed fly set 60), observable via `getEffectiveFlySpeed`.
//
// Activation works in or out of combat: when the sorcerer is a combatant
// in the active encounter the Bonus Action is consumed (and the sorcerer
// must be the active combatant), mirroring the graceful in/out-of-
// encounter handling of `planStunningStrike`. Out of combat the wings are
// simply granted.
//
// Deferred / consumer-managed (documented): the 1-hour duration and
// dismissal (no action: the consumer removes the condition), and the
// once-per-Long-Rest use restorable by spending 3 Sorcery Points.
export const planDragonWings = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: DragonWingsIntent,
): ReadonlyArray<Event> => {
  const sorcerer = state.characters[intent.sorcererId];
  if (!sorcerer) throw new Error(`Unknown sorcerer ${intent.sorcererId}`);
  const enrollment = sorcerer.classes.find((c) => c.classId === 'sorcerer');
  if (
    enrollment === undefined ||
    enrollment.level < DRAGON_WINGS_LEVEL ||
    enrollment.subclassId !== DRACONIC_SUBCLASS_ID
  ) {
    throw new Error(
      `${sorcerer.name} does not have Dragon Wings (requires Draconic Sorcery, Sorcerer level ${DRAGON_WINGS_LEVEL})`,
    );
  }

  // Slice 744: Dragon Wings is a toggle (sprout / dismiss) — you don't
  // re-sprout (burning another Bonus Action) while the wings are already
  // out. No resource is spent, but re-activating while active is a no-op
  // the planner should reject for consistency with the other activators.
  if (sorcerer.appliedConditions.some((c) => c.conditionId === DRAGON_WINGS_CONDITION_ID)) {
    throw new Error(`${sorcerer.name} already has Dragon Wings active`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const sorcererCb = encounter?.combatants.find((c) => c.combatantId === intent.sorcererId);
    if (sorcererCb !== undefined) {
      const active = encounter?.combatants[encounter.activeIndex];
      if (!active || active.combatantId !== intent.sorcererId) {
        throw new Error(`${sorcerer.name} is not the active combatant`);
      }
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${sorcerer.name} has already used their bonus action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.sorcererId,
        kind: 'bonusAction',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.sorcererId as ULID,
    conditionId: DRAGON_WINGS_CONDITION_ID,
    appliedConditionId: newAppliedConditionId(),
    sourceCharacterId: intent.sorcererId as ULID,
  } satisfies ConditionAppliedEvent);

  return events;
};
