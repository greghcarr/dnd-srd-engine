import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type {
  DamageAppliedEvent,
} from '../../schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type {
  BreathWeaponFiredEvent,
  BreathWeaponRechargedEvent,
} from '../../schemas/events/breath-weapon.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { rollDie, rollExpression } from '../../rng/dice.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { applyAll } from '../apply.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 140: monster breath-weapon planner. Handles the 11+ RAW
// "Recharge area-save damage" monster actions on one parameterized
// shape: cone or line area (consumer supplies the affected target
// list since the engine doesn't reason about area inclusion), one
// save per target against the breath weapon's pre-baked DC, one
// shared damage roll halved on a successful save.
//
// Magic effect: breath weapons count as magical for Magic Resistance
// purposes (RAW dragons / golems pass `sourceIsMagical: true`).

const D6_SIDES = 6;

export interface BreathWeaponIntent {
  readonly type: 'BreathWeapon';
  readonly monsterId: string;
  // Affected creatures within the breath weapon's area. The engine
  // doesn't model cone / line geometry; consumers / DMs supply the
  // target list per the area shape on the statblock.
  readonly targetIds: ReadonlyArray<string>;
  readonly at?: string;
}

/**
 * RAW: monster spends its action to unleash the breath weapon. Each
 * affected creature makes the save against the pre-baked DC; damage
 * is rolled once and applied per target with halve-on-save semantics.
 * On a successful fire, the bearer's `breathWeaponExpended` flag is
 * set; recharge happens at turn-start via `planBreathWeaponRecharge
 * AtTurnStart`.
 */
export const planBreathWeapon = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: BreathWeaponIntent,
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
  invariant(
    statblock.breathWeapon !== undefined,
    `Monster ${monster.statblockId} has no breath weapon`,
  );
  if (monster.breathWeaponExpended) {
    throw new Error(
      `${monster.name}'s ${statblock.breathWeapon.name} is expended (awaiting recharge)`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const breath = statblock.breathWeapon;

  // Consume the action when in an active encounter.
  if (state.activeEncounterId !== undefined) {
    const encounter = state.encounters[state.activeEncounterId];
    if (encounter !== undefined && encounter.combatants.some((c) => c.combatantId === intent.monsterId)) {
      const consumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: state.activeEncounterId,
        combatantId: intent.monsterId,
        kind: 'action',
      };
      events.push(consumed);
    }
  }

  // RAW Areas of Effect: roll damage once for the spell / action and
  // apply per target (halved on save).
  const rolled = rollExpression(breath.damageDice, rng);
  const fullDamage = rolled.total;
  const halfDamage = Math.floor(fullDamage / 2);

  // Mark fired up front so per-target damage events sit cleanly between
  // the BreathWeaponFired marker (which flips the expended flag) and the
  // tail of the chain.
  const fired: BreathWeaponFiredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'BreathWeaponFired',
    monsterId: intent.monsterId as ULID,
    breathWeaponId: breath.id,
  };
  events.push(fired);

  let stagedState = applyAll(state, events);
  for (const targetId of intent.targetIds) {
    const target = state.characters[targetId];
    if (target === undefined) continue;
    // Breath weapons count as magical effects for Magic Resistance
    // (slice 131 trait advantage fold).
    const saveResult = rollSaveAgainstDC({
      state,
      content,
      targetId,
      ability: breath.saveAbility,
      dc: breath.saveDC,
      sourceIsMagical: true,
      rng,
      at,
      causedByEventId: fired.id,
    });
    if (saveResult === undefined) continue;
    const save = saveResult.event;
    const success = saveResult.success;
    events.push(save);
    stagedState = applyAll(stagedState, [save]);

    const rawAmount = success && breath.halfOnSuccess
      ? halfDamage
      : success && !breath.halfOnSuccess
        ? 0
        : fullDamage;
    if (rawAmount <= 0) continue;

    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: rawAmount, type: breath.damageType }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: stagedState,
      content,
      targetId,
      mitigatedComponents: mitigated,
      causedByEventId: save.id,
      at,
    });
    const damage: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId: targetId as ULID,
      components: intercept.components,
      sourceCharacterId: intent.monsterId as ULID,
      source: `breath-weapon:${breath.id}`,
      causedByEventId: save.id,
    };
    events.push(damage);
    events.push(...intercept.extraEvents);
    stagedState = applyAll(stagedState, [damage, ...intercept.extraEvents]);
  }

  return events;
};

/**
 * Helper called from planAdvanceTurn / planBeginFirstTurn at the
 * start of an actor's turn. If the active combatant is a monster
 * with an expended breath weapon, rolls a d6: on a roll meeting
 * the breath weapon's rechargeMin threshold, emit a
 * BreathWeaponRecharged event that clears the expended flag.
 * Otherwise emit nothing (the breath stays expended).
 */
export const planBreathWeaponRechargeAtTurnStart = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  combatantId: string,
  at: string,
): ReadonlyArray<Event> => {
  const monster = state.characters[combatantId];
  if (monster === undefined) return [];
  if (!monster.breathWeaponExpended) return [];
  if (monster.statblockId === undefined) return [];
  const statblock = content.monsters.get(monster.statblockId);
  if (statblock?.breathWeapon === undefined) return [];
  const roll = rollDie(D6_SIDES, rng);
  if (roll < statblock.breathWeapon.rechargeMin) return [];
  const recharged: BreathWeaponRechargedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'BreathWeaponRecharged',
    monsterId: combatantId as ULID,
    breathWeaponId: statblock.breathWeapon.id,
    roll,
  };
  return [recharged];
};
