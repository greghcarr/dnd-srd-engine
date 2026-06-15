import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { HealedEvent } from '../../schemas/events/combat.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

export interface TickRecurringHealIntent {
  readonly type: 'TickRecurringHeal';
  // The bearer of the condition (the creature regaining HP).
  readonly targetId: string;
  // Which condition on the bearer to tick. The condition must declare
  // `recurringHeal` metadata — the planner throws otherwise.
  readonly conditionId: string;
  readonly at?: string;
}

/**
 * Slice 871: one tick of a condition's `recurringHeal` against its bearer —
 * the heal mirror of `planTickRecurringDamage`. The consumer calls this at the
 * bearer's turn boundary (per the condition's `recurringHeal.trigger`) for any
 * condition that declares it. Canonical user: Aura of Life's `aura-of-life-active`
 * ("If an ally with 0 Hit Points starts its turn in the aura, that ally regains
 * 1 Hit Point").
 *
 * Emits a flat `Healed` event (no RNG — the only RAW user heals a fixed
 * amount). `onlyAtZeroHp` gates the heal to a downed bearer: a bearer above 0
 * HP is a no-op (Aura of Life only revives the dying). The condition's lifetime
 * (concentration link / autoExpiry) bounds how long the heal recurs; this
 * planner only emits the heal.
 */
export const planTickRecurringHeal = (
  state: CampaignState,
  content: ResolvedContent,
  intent: TickRecurringHealIntent,
): ReadonlyArray<Event> => {
  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);
  const applied = target.appliedConditions.find((c) => c.conditionId === intent.conditionId);
  if (!applied) throw new Error(`${target.name} does not have condition '${intent.conditionId}'`);
  const def = content.conditions.get(intent.conditionId);
  if (!def) throw new Error(`Condition '${intent.conditionId}' not found in content`);
  const recurring = def.recurringHeal;
  if (recurring === undefined) {
    throw new Error(`Condition '${intent.conditionId}' has no recurringHeal metadata`);
  }

  // Aura of Life only revives a downed ally; a conscious bearer is a no-op.
  if (recurring.onlyAtZeroHp === true && target.hp.current > 0) return [];

  const at = intent.at ?? nowIso();
  const healed: HealedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'Healed',
    targetId: intent.targetId as ULID,
    amount: recurring.amount,
    source: intent.conditionId,
  };
  return [healed];
};
