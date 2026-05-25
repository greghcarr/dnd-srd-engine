import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type {
  DamageComponent,
  ConditionRemovedEvent,
} from '../schemas/events/combat.js';
import type { SaveRolledEvent } from '../schemas/events/checks.js';
import { newEventId } from '../ids.js';
import type { ULID } from '../engine/ids-utils.js';
import type { RNG } from '../rng/index.js';
import { rollDie } from '../rng/dice.js';
import { D20_SIDES } from '../internal/constants.js';
import { abilityModifier } from './ability.js';
import { collectEffectsFromCharacter } from './effect-stack.js';

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
  // Slice 456: optional RNG for save-gated intercepts
  // (PreventFatalDamageOnSave / Undead Fortitude). Required when the
  // target carries any save-gated fatal-damage intercept; if omitted in
  // that case the save can't roll and the bearer takes full damage
  // (documented limitation for callers that genuinely have no RNG path).
  readonly rng?: RNG;
  // Slice 456: true when the triggering attack was a critical hit. The
  // RAW exemption for crit-bypass (Undead Fortitude) reads this. Non-
  // attack callers (falling, traps, cast-spell saves, aura ticks) pass
  // false (or omit, defaulting to false) since crit doesn't apply to
  // non-attack damage.
  readonly critical?: boolean;
}

export interface FatalDamageInterceptOutcome {
  readonly components: DamageComponent[];
  readonly extraEvents: Array<ConditionRemovedEvent | SaveRolledEvent>;
}

const sumAmounts = (components: ReadonlyArray<DamageComponent>): number =>
  components.reduce((s, c) => s + c.amount, 0);

const passthrough = (
  components: ReadonlyArray<DamageComponent>,
  extraEvents: Array<ConditionRemovedEvent | SaveRolledEvent> = [],
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
  const endsOnDamageRemovals: Array<ConditionRemovedEvent | SaveRolledEvent> =
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

  // Damage-budget that lands HP exactly at 1, used by every survive path.
  const scaleToOne = (): DamageComponent[] => {
    const targetTotal = Math.max(0, (target.hp.current - 1) + target.hp.temp);
    return scaleComponents(input.mitigatedComponents, totalDamage, targetTotal);
  };

  // Slice 111 (always-on, condition-removing): scan applied conditions
  // for PreventFatalDamage. Death Ward shape.
  let bearerConditionId: string | undefined;
  for (const applied of target.appliedConditions) {
    const def = input.content.conditions.get(applied.conditionId);
    if (def?.effects.some((e) => e.kind === 'PreventFatalDamage')) {
      bearerConditionId = applied.conditionId;
      break;
    }
  }
  if (bearerConditionId !== undefined) {
    const conditionRemoved: ConditionRemovedEvent = {
      id: newEventId() as ULID,
      at: input.at,
      type: 'ConditionRemoved',
      targetId: input.targetId as ULID,
      conditionId: bearerConditionId,
      causedByEventId: input.causedByEventId as ULID,
    };
    return { components: scaleToOne(), extraEvents: [...endsOnDamageRemovals, conditionRemoved] };
  }

  // Slice 456 (save-gated, condition-NOT-removed): scan the full effect
  // stack (so monster traits like Zombie Undead Fortitude qualify, not
  // only applied conditions). Roll a save; on success, scale to HP=1.
  // The bearing effect persists (Undead Fortitude is always-on, not
  // one-shot).
  const allEffects = collectEffectsFromCharacter({
    character: target,
    content: input.content,
    itemInstances: input.state.itemInstances,
    pendingChoices: input.state.pendingChoices,
  });
  const saveGated = allEffects.find((e) => e.kind === 'PreventFatalDamageOnSave');
  if (saveGated === undefined || saveGated.kind !== 'PreventFatalDamageOnSave') {
    return passthrough(input.mitigatedComponents, endsOnDamageRemovals);
  }

  // RAW exemptions skip the save entirely. Both arms: passthrough (full
  // damage, target drops normally).
  if (saveGated.exemptOnCrit === true && input.critical === true) {
    return passthrough(input.mitigatedComponents, endsOnDamageRemovals);
  }
  if (saveGated.exemptDamageTypes !== undefined) {
    const exempt = new Set(saveGated.exemptDamageTypes);
    if (input.mitigatedComponents.some((c) => exempt.has(c.type))) {
      return passthrough(input.mitigatedComponents, endsOnDamageRemovals);
    }
  }

  // Without an RNG, the save can't roll; document the limitation by
  // taking the passthrough (full damage). Every caller that genuinely
  // emits damage to a creature with this trait must thread RNG; the
  // optional shape exists only for caller convenience.
  if (input.rng === undefined) return passthrough(input.mitigatedComponents, endsOnDamageRemovals);

  // Roll the save: d20 + targetAbilityMod >= baseDC + totalDamage.
  // Statblock save bonuses don't fold here (this is a per-trait save,
  // not the canonical computeSavingThrow path); RAW uses the raw
  // ability mod. Bake the roll into the emitted SaveRolled so replay
  // stays RNG-free.
  const d20 = rollDie(D20_SIDES, input.rng);
  const bonus = abilityModifier(target.abilityScores[saveGated.ability]);
  const dc = saveGated.baseDC + totalDamage;
  const total = d20 + bonus;
  const success = total >= dc;
  const saveRolled: SaveRolledEvent = {
    id: newEventId() as ULID,
    at: input.at,
    type: 'SaveRolled',
    targetId: input.targetId as ULID,
    ability: saveGated.ability,
    dc,
    d20: [d20],
    used: 'none',
    bonus,
    total,
    success,
  };
  if (!success) {
    return passthrough(input.mitigatedComponents, [...endsOnDamageRemovals, saveRolled]);
  }
  return {
    components: scaleToOne(),
    extraEvents: [...endsOnDamageRemovals, saveRolled],
  };
};
