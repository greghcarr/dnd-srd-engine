import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { applyAll } from '../apply.js';
import { planConcentrationOnDamage } from './concentration.js';
import type { ULID } from '../ids-utils.js';

export interface TickRecurringDamageIntent {
  readonly type: 'TickRecurringDamage';
  // The bearer of the condition (the creature taking the damage).
  readonly targetId: string;
  // Which condition on the bearer to tick. The condition must declare
  // `recurringDamage` metadata — the planner throws otherwise.
  readonly conditionId: string;
  readonly at?: string;
}

/**
 * Slice 825: one tick of a condition's `recurringDamage` against its bearer.
 * The sibling of `planTickRecurringSave` for the no-save "loses X HP at the
 * start of each of its turns" shape — the consumer calls this at the bearer's
 * turn boundary (per the condition's `recurringDamage.trigger`) for any
 * condition that declares it. Canonical user: the Bearded Devil's infernal
 * wound (1d10 at the start of each turn until it closes).
 *
 * Rolls the per-tick dice, runs the standard mitigation / fatal-intercept /
 * concentration-on-damage pipeline (like a recurring spell tick), and emits
 * `DamageApplied` sourced to the condition's `sourceCharacterId` (the creature
 * that inflicted the wound). The condition's `autoExpiry` (stamped when the
 * wound was applied) bounds the duration; this planner only deals the damage.
 */
export const planTickRecurringDamage = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: TickRecurringDamageIntent,
): ReadonlyArray<Event> => {
  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);
  const applied = target.appliedConditions.find((c) => c.conditionId === intent.conditionId);
  if (!applied) throw new Error(`${target.name} does not have condition '${intent.conditionId}'`);
  const def = content.conditions.get(intent.conditionId);
  if (!def) throw new Error(`Condition '${intent.conditionId}' not found in content`);
  const recurring = def.recurringDamage;
  if (recurring === undefined) {
    throw new Error(`Condition '${intent.conditionId}' has no recurringDamage metadata`);
  }

  const parsed = parseDiceExpression(recurring.dice);
  let sum = parsed.modifier;
  for (let i = 0; i < parsed.count; i += 1) sum += rollDie(parsed.die, rng);
  const amount = Math.max(0, sum);
  if (amount <= 0) return [];

  const at = intent.at ?? nowIso();
  const mitigated = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount, type: recurring.damageType }],
    characters: state.characters,
    sourceIsMagical: true,
  });
  const damageId = newEventId() as ULID;
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: intent.targetId,
    mitigatedComponents: mitigated,
    causedByEventId: damageId,
    at,
    rng,
  });
  const damageApplied: DamageAppliedEvent = {
    id: damageId,
    at,
    type: 'DamageApplied',
    targetId: intent.targetId as ULID,
    components: intercept.components,
    source: intent.conditionId,
    ...(applied.sourceCharacterId !== undefined
      ? { sourceCharacterId: applied.sourceCharacterId as ULID }
      : {}),
  };
  const events: Event[] = [damageApplied, ...intercept.extraEvents];
  events.push(
    ...planConcentrationOnDamage(applyAll(state, events), content, rng, target, intercept.components, damageId, at),
  );
  return events;
};
