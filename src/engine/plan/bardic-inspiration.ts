import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { assertActorCanAct } from './_actor-state.js';
import type { ULID } from '../ids-utils.js';

const BARD_CLASS_ID = 'bard';
const BARDIC_INSPIRATION_RESOURCE_ID = 'bardic-inspiration';
const BEARING_BARDIC_INSPIRATION_CONDITION_ID = 'bearing-bardic-inspiration';

export interface BardicInspirationIntent {
  readonly type: 'BardicInspiration';
  readonly bardId: string;
  readonly recipientId: string;
  readonly at?: string;
}

// L1 RAW Bardic Inspiration (PHB 2024 Bard L1):
//
//   "As a Bonus Action, you can choose another creature within 60 feet
//   of yourself who can hear you and give it a Bardic Inspiration die,
//   a d6 [L1, scales to d8/d10/d12 at higher Bard levels]. The creature
//   can roll the die and add the number rolled to one ability check,
//   attack roll, or saving throw it makes within the next 10 minutes.
//   The creature can wait until after it rolls the d20 before deciding
//   to use the Bardic Inspiration die, but must decide before the GM
//   says whether the roll succeeds or fails. Once the d20 is rolled,
//   the die is lost. A creature can have only one Bardic Inspiration
//   die at a time. You can confer this die a number of times equal to
//   your Charisma modifier (minimum of once)..."
//
// The planner:
//   - Validates Bard class membership.
//   - Validates the recipient isn't the Bard themselves (RAW
//     "another creature").
//   - Validates bardic-inspiration resource > 0.
//   - Consumes one resource use + one Bonus Action (the latter only
//     when invoked in an active encounter on the Bard's turn).
//   - Applies the `bearing-bardic-inspiration` condition to the
//     recipient with sourceCharacterId = Bard (for transcript
//     visibility; the die-rolling site doesn't read it).
//
// The condition itself (slice 577) carries:
//   - AddBonusDie 1d6 on attack + save + check (L1 die size; future
//     slices can introduce per-tier variants).
//   - consumeOnAttack + consumeOnSave + consumeOnCheck (RAW: "Once
//     the d20 is rolled, the die is lost").
//   - autoExpiry afterRounds:100 turnEnd (10-minute approximation).
//
// Documented deviations:
//   - Per-tier die scaling (d8 at L5, d10 at L10, d12 at L15) is
//     content-side and not modeled by slice 577. The condition uses
//     a fixed 1d6; a future content sweep can introduce per-tier
//     conditions (bearing-bardic-inspiration-d8 etc.) gated on Bard
//     level via OfferChoice variants in the level table.
//   - "One Bardic Inspiration die at a time" gate: the engine's
//     condition deduper (apply-condition reducer) already enforces
//     this — a second BardicInspirationIntent on the same recipient
//     is a no-op-apply (the new die doesn't stack).
//   - 60-foot range / "can hear you" gate: consumer-managed (engine
//     doesn't track positions or audibility).
export const planBardicInspiration = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: BardicInspirationIntent,
): ReadonlyArray<Event> => {
  const bard = state.characters[intent.bardId];
  if (!bard) throw new Error(`Unknown bard ${intent.bardId}`);
  assertActorCanAct(bard, 'Bardic Inspiration');

  const bardClass = bard.classes.find((c) => c.classId === BARD_CLASS_ID);
  if (!bardClass) {
    throw new Error(`${bard.name} does not have Bardic Inspiration (Bard L1 feature)`);
  }

  const recipient = state.characters[intent.recipientId];
  if (!recipient) throw new Error(`Unknown Bardic Inspiration recipient ${intent.recipientId}`);

  if (intent.bardId === intent.recipientId) {
    throw new Error(`${bard.name} cannot confer Bardic Inspiration on themself`);
  }

  const resource = bard.resources.find((r) => r.resourceId === BARDIC_INSPIRATION_RESOURCE_ID);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${bard.name} has no Bardic Inspiration uses remaining (regain on Long Rest at L1, on Short or Long Rest at L5+)`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.bardId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${bard.name} has already used their bonus action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.bardId,
        kind: 'bonusAction',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.bardId as ULID,
    resourceId: BARDIC_INSPIRATION_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  // Note: sourceCharacterId intentionally omitted. The condition's
  // consumeOn(Attack|Save|Check) primitives use source-keying to scope
  // "consume only when targeting source" (Vex pattern). Bardic
  // Inspiration's consume semantics are "consume on any roll" — so the
  // condition stays unsourced (matches the Sap-style any-roll case in
  // buildConsumeOnAttackRemovals). Transcript visibility for "who
  // conferred" comes from the planner's intent-time emission of
  // ResourceSpent { characterId: bard }, not the condition source.
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.recipientId as ULID,
    conditionId: BEARING_BARDIC_INSPIRATION_CONDITION_ID,
    appliedConditionId: newAppliedConditionId(),
  } satisfies ConditionAppliedEvent);

  return events;
};
