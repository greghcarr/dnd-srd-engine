import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { DamageAppliedEvent, ConditionAppliedEvent } from '../../schemas/events/combat.js';
import { SIZES } from '../../schemas/primitives.js';
import { creatureSize } from '../../derive/creature-size.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { rollExpression } from '../../rng/dice.js';
import { rollSaveAgainstDC } from './_save-roll.js';
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
  let stagedState = applyAll(state, [save]);

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
  }

  return events;
};
