import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { HealedEvent } from '../../schemas/events/combat.js';
import type {
  ResourceRestoredEvent,
  ResourceSpentEvent,
} from '../../schemas/events/resources.js';
import { martialArtsDie } from './attack.js';
import { parseDiceExpression, rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const MONK_CLASS_ID = 'monk';
const UNCANNY_METABOLISM_LEVEL = 2;
const UNCANNY_METABOLISM_RESOURCE_ID = 'uncanny-metabolism';
const KI_RESOURCE_ID = 'ki';
const UNCANNY_METABOLISM_SOURCE = 'uncanny-metabolism';

export interface UncannyMetabolismIntent {
  readonly type: 'UncannyMetabolism';
  readonly monkId: string;
  readonly at?: string;
}

// Monk L2 Uncanny Metabolism. RAW (SRD 5.2.1): "When you roll
// Initiative, you can regain all expended Focus Points. When you do
// so, roll your Martial Arts die, and regain a number of Hit Points
// equal to your Monk level plus the number rolled. Once you use this
// feature, you can't use it again until you finish a Long Rest."
//
// (The 2024 PHB renamed the Monk resource from "Ki Points" to "Focus
// Points"; the engine kept the legacy `ki` resource id for backward
// compatibility with shipped campaigns. Content authoring keeps the
// "Monk's Focus (Ki)" name on the L2 feature.)
//
// Consumer-driven invocation (RAW: "you can"): after the RollInitiative
// event fires, the consumer prompts the monk whether to spend their
// 1/long-rest Uncanny Metabolism this encounter. If the consumer
// invokes the planner, the once-per-long-rest gate is enforced via
// the `uncanny-metabolism` resource (max 1, recharge: 'longRest').
//
// Emits three events on success:
//   1. ResourceSpent  uncanny-metabolism (1)   — the per-long-rest gate.
//   2. ResourceRestored ki ('all')             — refunds Focus Points.
//   3. Healed         (monkLevel + Martial Arts die) — HP regain.
//
// No ActionEconomyConsumed (RAW: the feature fires *as* initiative is
// rolled, not as part of an action / bonus action / reaction).
export const planUncannyMetabolism = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: UncannyMetabolismIntent,
): ReadonlyArray<Event> => {
  const monk = state.characters[intent.monkId];
  if (!monk) throw new Error(`Unknown character ${intent.monkId}`);
  const enrollment = monk.classes.find((c) => c.classId === MONK_CLASS_ID);
  if (enrollment === undefined || enrollment.level < UNCANNY_METABOLISM_LEVEL) {
    throw new Error(
      `${monk.name} does not have Uncanny Metabolism (requires Monk level ${UNCANNY_METABOLISM_LEVEL})`,
    );
  }

  const gate = monk.resources.find((r) => r.resourceId === UNCANNY_METABOLISM_RESOURCE_ID);
  if (gate === undefined || gate.current <= 0) {
    throw new Error(
      `${monk.name} has already used Uncanny Metabolism (regain on a Long Rest)`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.monkId as ULID,
    resourceId: UNCANNY_METABOLISM_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  // RAW: refund ALL expended Focus Points. ResourceRestored with
  // amount: 'all' snaps current back to max in the reducer. Emitted
  // even when the monk has full Focus already (no-op restore + the
  // healing arm is still the point of using the feature).
  if (monk.resources.some((r) => r.resourceId === KI_RESOURCE_ID)) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ResourceRestored',
      characterId: intent.monkId as ULID,
      resourceId: KI_RESOURCE_ID,
      amount: 'all',
    } satisfies ResourceRestoredEvent);
  }

  // Martial Arts die: 1d6 / 1d8 / 1d10 / 1d12 at monk levels
  // 1 / 5 / 11 / 17 (planAttack's `martialArtsDie` is the single
  // source). Healed = monk level + die roll.
  // Floor-of-1d6 fallback for the (impossible-under-the-L2 gate)
  // monkLevel < 1 path so the planner has no other dependence on
  // martialArtsDie's undefined branch.
  const dieExpr = martialArtsDie(enrollment.level) ?? '1d6';
  const die = parseDiceExpression(dieExpr).die;
  const rolled = rollDie(die, rng);
  const healAmount = enrollment.level + rolled;
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'Healed',
    targetId: intent.monkId as ULID,
    amount: healAmount,
    source: UNCANNY_METABOLISM_SOURCE,
  } satisfies HealedEvent);

  return events;
};
