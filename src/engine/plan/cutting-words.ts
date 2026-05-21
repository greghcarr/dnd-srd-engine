import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

export const BARDIC_INSPIRATION_RESOURCE_ID = 'bardic-inspiration';
const BI_DIE_THRESHOLD_LEVELS = [5, 10, 15] as const;
const BI_DIE_SIDES = [6, 8, 10, 12] as const;

export interface CuttingWordsIntent {
  readonly type: 'CuttingWords';
  readonly bardId: string;
  // The roll the consumer wants to debuff (the original d20 + modifiers
  // for an attack, save, or check). The planner returns whether the
  // adjusted total still meets the threshold.
  readonly originalRollTotal: number;
  // The threshold the original roll needed to meet (target AC for an
  // attack, save DC, check DC, etc.).
  readonly threshold: number;
  readonly at?: string;
}

export interface CuttingWordsOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly dieRoll: number;
  // True when the adjusted roll falls below the threshold (i.e. the
  // attack/check that previously met the threshold now misses).
  readonly preventedHit: boolean;
}

export const bardicInspirationDieFor = (bardLevel: number): number => {
  let idx = 0;
  for (const threshold of BI_DIE_THRESHOLD_LEVELS) {
    if (bardLevel >= threshold) idx += 1;
  }
  return BI_DIE_SIDES[idx] ?? BI_DIE_SIDES[0];
};

// College of Lore (Bard L3) Cutting Words. Spend one Bardic Inspiration
// die to debuff a creature's attack roll, ability check, or damage
// roll. The consumer passes in the original total and the threshold
// the roll needed to meet; the planner returns the rolled BI die plus
// `preventedHit` so the consumer can decide whether to commit the
// trailing chain (e.g. DamageRolled / DamageApplied).
//
// In an active encounter the planner also emits an ActionEconomyConsumed
// (reaction) event; out of encounter the reaction tracking is skipped.
export const planCuttingWords = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: CuttingWordsIntent,
): CuttingWordsOutcome => {
  const bard = state.characters[intent.bardId];
  if (!bard) throw new Error(`Unknown bard ${intent.bardId}`);
  const bi = bard.resources.find((r) => r.resourceId === BARDIC_INSPIRATION_RESOURCE_ID);
  if (!bi || bi.current <= 0) {
    throw new Error(`${bard.name} has no Bardic Inspiration dice available`);
  }

  const activeEncounterId = state.activeEncounterId;
  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const reactor = encounter?.combatants.find((c) => c.combatantId === intent.bardId);
    if (reactor !== undefined && reactor.turnUsage.reactionUsedThisRound) {
      throw new Error(`${bard.name} has already used their reaction this round`);
    }
    if (reactor !== undefined) {
      const reactionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.bardId,
        kind: 'reaction',
      };
      events.push(reactionConsumed);
    }
  }

  const bardClass = bard.classes.find((c) => c.classId === 'bard');
  const bardLevel = bardClass?.level ?? 0;
  const dieSize = bardicInspirationDieFor(bardLevel);
  const dieRoll = rollDie(dieSize, rng);

  const spend: ResourceSpentEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.bardId,
    resourceId: BARDIC_INSPIRATION_RESOURCE_ID,
    amount: 1,
  };
  events.push(spend);

  const adjustedTotal = intent.originalRollTotal - dieRoll;
  const preventedHit =
    intent.originalRollTotal >= intent.threshold && adjustedTotal < intent.threshold;

  return { events, dieRoll, preventedHit };
};
