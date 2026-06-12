import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type {
  DamageAppliedEvent,
  ConditionAppliedEvent,
  CreaturePushedEvent,
} from '../../schemas/events/combat.js';
import type {
  SaveActionExpendedEvent,
  SaveActionRechargedEvent,
} from '../../schemas/events/save-action.js';
import { SIZES } from '../../schemas/primitives.js';
import { creatureSize } from '../../derive/creature-size.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { rollExpression, rollDie } from '../../rng/dice.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { planLifeDrainEvents } from './_life-drain.js';
import { applyAll } from '../apply.js';
import { planConcentrationOnDamage } from './concentration.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 828: monster save-action planner — the auto-hit, no-attack-roll
// "Strength Saving Throw: DC N ... Failure: damage + condition" shape
// (Constrict). The save-or-effect sibling of `planBreathWeapon`: single
// target, no recharge, and the payload (damage + condition ids) lands only
// on a FAILED save. See SaveActionSpecSchema for the full RAW framing and
// why this can't ride the weapon on-hit-rider machinery (no hit to hang on).
//
// Constrict is a natural (non-magical) attack, so `sourceIsMagical` is false
// — Magic Resistance doesn't help the target's save. Action economy is the
// consumer's to charge (the spec carries no action cost): Constrict bundles
// into a Multiattack for some monsters and is a standalone action for others,
// and the multiattack schema can't express "uses Constrict".

export interface SaveActionIntent {
  readonly type: 'SaveAction';
  readonly monsterId: string;
  // Which `saveActions[]` entry on the monster's statblock (by its `id`).
  readonly saveActionId: string;
  readonly targetId: string;
  readonly at?: string;
}

export const planSaveAction = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: SaveActionIntent,
): ReadonlyArray<Event> => {
  const monster = state.characters[intent.monsterId];
  invariant(monster !== undefined, `Monster ${intent.monsterId} not found`);
  invariant(
    monster.statblockId !== undefined,
    `Monster ${intent.monsterId} has no statblockId`,
  );
  const statblock = content.monsters.get(monster.statblockId);
  invariant(
    statblock !== undefined,
    `Monster statblock ${monster.statblockId} not found in content`,
  );
  const spec = statblock.saveActions.find((s) => s.id === intent.saveActionId);
  invariant(
    spec !== undefined,
    `Monster ${monster.statblockId} has no save-action '${intent.saveActionId}'`,
  );

  // Slice 829: Recharge gate (Air Elemental Whirlwind). A recharge-gated
  // action is unusable while its id sits on the bearer's expended list.
  // Checked before the target resolves — availability is target-independent.
  if (spec.recharge !== undefined && monster.expendedSaveActionIds.includes(spec.id)) {
    throw new Error(
      `${monster.name}'s ${spec.name} is expended (awaiting recharge)`,
    );
  }

  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);

  // RAW size gate: "one Large or smaller creature". Reject a too-large
  // target up front (visible failure, the single-target input posture).
  if (spec.maxTargetSize !== undefined) {
    const targetSize = creatureSize(target, content);
    if (SIZES.indexOf(targetSize) > SIZES.indexOf(spec.maxTargetSize)) {
      throw new Error(
        `${target.name} is ${targetSize}; ${spec.name} can target only ${spec.maxTargetSize} or smaller`,
      );
    }
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  // Mark a recharge-gated action expended up front (mirrors the breath
  // weapon's BreathWeaponFired marker); recharge clears it at turn-start.
  if (spec.recharge !== undefined) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'SaveActionExpended',
      monsterId: intent.monsterId as ULID,
      saveActionId: spec.id,
    } satisfies SaveActionExpendedEvent);
  }

  const saveResult = rollSaveAgainstDC({
    state,
    content,
    targetId: intent.targetId,
    ability: spec.saveAbility,
    dc: spec.saveDC,
    sourceIsMagical: false,
    rng,
    at,
  });
  if (saveResult === undefined) return events;
  const save = saveResult.event;
  const success = saveResult.success;
  events.push(save);
  let stagedState = applyAll(state, events);

  // On a success the action does nothing unless it halves damage (the
  // deferred Whirlwind shape); the failure path carries the whole payload.
  if (success && !spec.halfDamageOnSuccess) return events;

  // Roll each damage component (each its own type so Salamander's bludgeoning
  // + fire mitigate separately), halving on a (half-damage) successful save.
  const rawComponents = spec.onFail.damage
    .map((d) => {
      const rolled = rollExpression(d.dice, rng).total;
      const amount = success ? Math.floor(rolled / 2) : rolled;
      return { amount, type: d.type };
    })
    .filter((c) => c.amount > 0);

  // Slice 834: the post-mitigation damage taken, captured for an `onFail`
  // Life Drain (Wight) — the HP-max reduction equals the damage taken.
  let lifeDrainTaken = 0;
  if (rawComponents.length > 0) {
    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents,
      characters: state.characters,
      sourceIsMagical: false,
    });
    const damageId = newEventId() as ULID;
    const intercept = interceptFatalDamage({
      state: stagedState,
      content,
      targetId: intent.targetId,
      mitigatedComponents: mitigated,
      causedByEventId: save.id,
      at,
      rng,
    });
    lifeDrainTaken = intercept.components.reduce((sum, c) => sum + c.amount, 0);
    const damage: DamageAppliedEvent = {
      id: damageId,
      at,
      type: 'DamageApplied',
      targetId: intent.targetId as ULID,
      components: intercept.components,
      sourceCharacterId: intent.monsterId as ULID,
      source: `save-action:${spec.id}`,
      causedByEventId: save.id,
    };
    events.push(damage);
    events.push(...intercept.extraEvents);
    const targetForConc = stagedState.characters[intent.targetId];
    if (targetForConc !== undefined) {
      events.push(
        ...planConcentrationOnDamage(
          applyAll(stagedState, [damage, ...intercept.extraEvents]),
          content,
          rng,
          targetForConc,
          intercept.components,
          damage.id,
          at,
        ),
      );
    }
    stagedState = applyAll(stagedState, [damage, ...intercept.extraEvents]);
  }

  // Conditions land only on a failed save (RAW never applies the Grappled /
  // Restrained on a success). Stamp the monster as source so the Grappled
  // grappler resolves, plus the condition's autoExpiry when in an encounter
  // (Grappled / Restrained carry none → consumer-managed escape, as the
  // weapon-rider batches do).
  if (!success) {
    const currentRound = state.activeEncounterId !== undefined
      ? state.encounters[state.activeEncounterId]?.round
      : undefined;
    for (const conditionId of spec.onFail.applyConditionIds) {
      const autoExpiry = content.conditions.get(conditionId)?.autoExpiry;
      const expiryFields: {
        expiresOnRound?: number;
        expiryTrigger?: 'turnStart' | 'turnEnd';
      } = autoExpiry !== undefined && currentRound !== undefined
        ? { expiresOnRound: currentRound + autoExpiry.afterRounds, expiryTrigger: autoExpiry.trigger }
        : {};
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: intent.targetId as ULID,
        conditionId,
        appliedConditionId: newAppliedConditionId(),
        sourceCharacterId: intent.monsterId as ULID,
        ...expiryFields,
      } satisfies ConditionAppliedEvent);
    }
    // Slice 829: forced push on failure (Whirlwind: "pushed up to 20 feet
    // straight away"). Position-less informational event — the consumer
    // applies the displacement, as with every forced move.
    if (spec.onFail.pushFeet !== undefined && spec.onFail.pushFeet > 0) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'CreaturePushed',
        targetId: intent.targetId as ULID,
        distanceFeet: spec.onFail.pushFeet,
        sourceCharacterId: intent.monsterId as ULID,
        source: `save-action:${spec.id}`,
      } satisfies CreaturePushedEvent);
    }
    // Slice 834: undead Life Drain on a failed save (Wight) — reduce the
    // target's Hit Point maximum by the damage taken, restored on a Long Rest.
    // Shares the slice-832 `life-drained` mechanism with the weapon drainsMaxHp.
    if (spec.onFail.drainMaxHp === true) {
      events.push(...planLifeDrainEvents(state, intent.targetId, intent.monsterId, lifeDrainTaken, at));
    }
  }

  return events;
};

/**
 * Slice 829: turn-start Recharge for save-actions — the sibling of
 * `planBreathWeaponRechargeAtTurnStart`. For each Recharge-gated save-action
 * the bearer has expended, rolls a d6; on a roll ≥ its `recharge.rechargeMin`
 * the action returns to ready (a `SaveActionRecharged` clears its id). Called
 * from the turn-start flow alongside the breath-weapon recharge.
 */
export const planSaveActionRechargeAtTurnStart = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  combatantId: string,
  at: string,
): ReadonlyArray<Event> => {
  const monster = state.characters[combatantId];
  if (monster === undefined) return [];
  if (monster.expendedSaveActionIds.length === 0) return [];
  if (monster.statblockId === undefined) return [];
  const statblock = content.monsters.get(monster.statblockId);
  if (statblock === undefined) return [];
  const events: Event[] = [];
  for (const saveActionId of monster.expendedSaveActionIds) {
    const spec = statblock.saveActions.find((s) => s.id === saveActionId);
    if (spec?.recharge === undefined) continue;
    const roll = rollDie(6, rng);
    if (roll < spec.recharge.rechargeMin) continue;
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'SaveActionRecharged',
      monsterId: combatantId as ULID,
      saveActionId,
      roll,
    } satisfies SaveActionRechargedEvent);
  }
  return events;
};
