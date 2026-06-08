import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import type { ULID } from '../ids-utils.js';

const INNATE_SORCERY_RESOURCE_ID = 'innate-sorcery';
const SORCERY_POINTS_RESOURCE_ID = 'sorcery-points';
const INNATE_SORCERY_ACTIVE_CONDITION_ID = 'innate-sorcery-active';
const SORCERY_INCARNATE_SP_COST = 2;

export interface InnateSorceryIntent {
  readonly type: 'InnateSorcery';
  readonly characterId: string;
  // When true, pay the Sorcery Incarnate alternative cost (2 Sorcery
  // Points) instead of an innate-sorcery resource use. Throws if the
  // bearer doesn't have the `GrantInnateSorcerySpendAlternative`
  // marker (Sorcerer L7+), or if their Sorcery Points are too low.
  readonly useSorceryPoints?: boolean;
  readonly at?: string;
}

/**
 * RAW 2024 PHB Sorcerer L1 Innate Sorcery: as a Bonus Action, you can
 * unleash that magic for 1 minute, during which your Sorcerer spell
 * save DC increases by 1 and you have Advantage on the attack rolls
 * of Sorcerer spells you cast. Two uses per long rest.
 *
 * Activation paths (slice 201):
 *   1. **Default**: consume one `innate-sorcery` resource. Throws if
 *      the bearer is out of uses.
 *   2. **Sorcery Incarnate alternative** (L7+ via the
 *      `GrantInnateSorcerySpendAlternative` marker): consume 2 Sorcery
 *      Points instead. Throws if the bearer lacks the marker or has
 *      fewer than 2 SP.
 *
 * Both paths consume a bonus action when called inside an active
 * encounter and apply `innate-sorcery-active`. The active condition
 * carries the +1 spell save DC modifier as a static fact; the
 * "Advantage on attack rolls of Sorcerer spells you cast" arm of
 * Innate Sorcery is deferred (needs an `event.spellSourceClassId`
 * fact in attack events). The "doubled metamagic per spell" arm of
 * Sorcery Incarnate is also deferred (the metamagic planner doesn't
 * yet enforce a once-per-spell limit).
 */
export const planInnateSorcery = (
  state: CampaignState,
  content: ResolvedContent,
  intent: InnateSorceryIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  invariant(character !== undefined, `Character ${intent.characterId} not found`);

  // Slice 744: Innate Sorcery is a 1-minute active state — you don't
  // re-activate (or spend a second use / 2 SP) while it's already active.
  if (character.appliedConditions.some((c) => c.conditionId === INNATE_SORCERY_ACTIVE_CONDITION_ID)) {
    throw new Error(`${character.name} already has Innate Sorcery active`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.characterId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${character.name} has already used their bonus action this turn`);
      }
      const bonusActionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.characterId,
        kind: 'bonusAction',
      };
      events.push(bonusActionConsumed);
    }
  }

  if (intent.useSorceryPoints === true) {
    const effects = buildEffectStack({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    if (!effects.hasInnateSorcerySpendAlternative()) {
      throw new Error(
        `${character.name} cannot spend Sorcery Points for Innate Sorcery without Sorcery Incarnate`,
      );
    }
    const sp = character.resources.find((r) => r.resourceId === SORCERY_POINTS_RESOURCE_ID);
    if (!sp || sp.current < SORCERY_INCARNATE_SP_COST) {
      throw new Error(
        `${character.name} needs ${SORCERY_INCARNATE_SP_COST} Sorcery Points for Sorcery Incarnate (has ${sp?.current ?? 0})`,
      );
    }
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.characterId,
      resourceId: SORCERY_POINTS_RESOURCE_ID,
      amount: SORCERY_INCARNATE_SP_COST,
    } satisfies ResourceSpentEvent);
  } else {
    const innate = character.resources.find((r) => r.resourceId === INNATE_SORCERY_RESOURCE_ID);
    if (!innate || innate.current <= 0) {
      throw new Error(`${character.name} has no Innate Sorcery uses remaining`);
    }
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.characterId,
      resourceId: INNATE_SORCERY_RESOURCE_ID,
      amount: 1,
    } satisfies ResourceSpentEvent);
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.characterId as ULID,
    conditionId: INNATE_SORCERY_ACTIVE_CONDITION_ID,
    appliedConditionId: newAppliedConditionId(),
  } satisfies ConditionAppliedEvent);

  return events;
};
