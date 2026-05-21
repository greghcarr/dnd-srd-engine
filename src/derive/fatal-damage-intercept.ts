import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type {
  DamageComponent,
  ConditionRemovedEvent,
} from '../schemas/events/combat.js';
import { newEventId } from '../ids.js';
import type { ULID } from '../engine/ids-utils.js';

// Slice 111. Planner-side intercept that runs at every damage emitter
// (between `mitigateDamage` and the DamageApplied construction) and emits
// post-damage ConditionRemoved events. Two concerns:
//   1. PreventFatalDamage (Death Ward, etc.): when the incoming damage
//      would drop the target to 0 HP or below, scale the components so HP
//      lands at 1 and remove the warding condition.
//   2. Slice 391, "ends if the bearer takes any damage" (Sleep, Knock
//      Out): on any positive damage, remove the bearer's `endsOnDamage`
//      conditions, independent of whether the hit is fatal.
//
// Why planner-side: reducers are pure and cannot emit new events, so
// the "intercept fatal damage + consume the warding condition" logic
// cannot live in `applyDamageApplied`. Every damage emitter calls this
// helper between `mitigateDamage` and the DamageApplied construction;
// the existing damage reducer math (temp-HP absorption, HP delta) is
// untouched.

export interface FatalDamageInterceptInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly targetId: string;
  readonly mitigatedComponents: ReadonlyArray<DamageComponent>;
  readonly causedByEventId: string;
  readonly at: string;
}

export interface FatalDamageInterceptOutcome {
  readonly components: DamageComponent[];
  readonly extraEvents: ConditionRemovedEvent[];
}

const sumAmounts = (components: ReadonlyArray<DamageComponent>): number =>
  components.reduce((s, c) => s + c.amount, 0);

const passthrough = (
  components: ReadonlyArray<DamageComponent>,
  extraEvents: ConditionRemovedEvent[] = [],
): FatalDamageInterceptOutcome => ({
  components: components.map((c) => ({ ...c })),
  extraEvents,
});

// Scales each component proportionally to land on `targetTotal`, then
// repairs rounding by adjusting the largest component up by the
// remainder so the sum matches exactly. Preserves component types and
// the audit metadata `rawAmount` / `mitigation` from each input entry.
const scaleComponents = (
  components: ReadonlyArray<DamageComponent>,
  originalTotal: number,
  targetTotal: number,
): DamageComponent[] => {
  if (originalTotal <= 0) return [];
  if (targetTotal <= 0) {
    return components.map((c) => ({ ...c, amount: 0 }));
  }
  const scaled = components.map((c) => ({
    ...c,
    amount: Math.floor((c.amount * targetTotal) / originalTotal),
  }));
  const remainder = targetTotal - sumAmounts(scaled);
  if (remainder > 0 && scaled.length > 0) {
    let largestIdx = 0;
    for (let i = 1; i < scaled.length; i += 1) {
      if (scaled[i]!.amount > scaled[largestIdx]!.amount) largestIdx = i;
    }
    scaled[largestIdx]!.amount += remainder;
  }
  return scaled;
};

export const interceptFatalDamage = (
  input: FatalDamageInterceptInput,
): FatalDamageInterceptOutcome => {
  const target = input.state.characters[input.targetId];
  if (target === undefined) return passthrough(input.mitigatedComponents);

  const totalDamage = sumAmounts(input.mitigatedComponents);

  // Slice 391: "ends if the bearer takes any damage" (Sleep, Knock Out).
  // Any positive (post-mitigation) damage removes the bearer's
  // `endsOnDamage` conditions. Computed up front so it applies on every
  // return path, independent of the fatal-damage intercept below.
  const endsOnDamageRemovals: ConditionRemovedEvent[] =
    totalDamage > 0
      ? target.appliedConditions
          .filter((applied) => applied.endsOnDamage === true)
          .map((applied) => ({
            id: newEventId() as ULID,
            at: input.at,
            type: 'ConditionRemoved' as const,
            targetId: input.targetId as ULID,
            conditionId: applied.conditionId,
            causedByEventId: input.causedByEventId as ULID,
          }))
      : [];

  if (target.hp.current <= 0) return passthrough(input.mitigatedComponents, endsOnDamageRemovals);

  const damageAfterTemp = Math.max(0, totalDamage - target.hp.temp);
  const projectedHp = target.hp.current - damageAfterTemp;
  if (projectedHp > 0) return passthrough(input.mitigatedComponents, endsOnDamageRemovals);

  let bearerConditionId: string | undefined;
  for (const applied of target.appliedConditions) {
    const def = input.content.conditions.get(applied.conditionId);
    if (def?.effects.some((e) => e.kind === 'PreventFatalDamage')) {
      bearerConditionId = applied.conditionId;
      break;
    }
  }
  if (bearerConditionId === undefined) return passthrough(input.mitigatedComponents, endsOnDamageRemovals);

  // Compute the damage budget that lands HP exactly at 1. The reducer
  // absorbs temp HP first, so the total damage we emit must equal
  // (current - 1) plus whatever temp HP is currently held.
  const targetTotal = Math.max(0, (target.hp.current - 1) + target.hp.temp);
  const components = scaleComponents(input.mitigatedComponents, totalDamage, targetTotal);

  const conditionRemoved: ConditionRemovedEvent = {
    id: newEventId() as ULID,
    at: input.at,
    type: 'ConditionRemoved',
    targetId: input.targetId as ULID,
    conditionId: bearerConditionId,
    causedByEventId: input.causedByEventId as ULID,
  };
  return { components, extraEvents: [...endsOnDamageRemovals, conditionRemoved] };
};
