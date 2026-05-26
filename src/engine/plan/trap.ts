import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, rollExpression } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { applyAll } from '../apply.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type {
  DamageAppliedEvent,
  DamageComponent,
} from '../../schemas/events/combat.js';
import type {
  TrapTriggeredEvent,
  TrapExpiredEvent,
} from '../../schemas/events/traps.js';

export interface TriggerTrapIntent {
  readonly type: 'TriggerTrap';
  // The placed trap (by ID, looked up from state.traps). Throws on
  // unknown trapId.
  readonly trapId: string;
  // The creature that set off the trap. The save and damage land on
  // this creature.
  readonly triggeringCharacterId: string;
  readonly at?: string;
}

/**
 * Fires a primed trap against a single triggering creature. The
 * consumer (DM, VTT, adventure runner) calls this when it detects
 * the trap's trigger condition (creature enters proximity, opens the
 * warded object, etc.) — the engine doesn't model positions or
 * trigger predicates.
 *
 * Resolution chain:
 *  1. SaveRolled (against the trap's pre-baked DC + ability).
 *  2. DamageApplied (full damage; halved on a successful save when
 *     the payload's `halfOnSuccess` is true; zero on a successful
 *     save when `halfOnSuccess` is false).
 *  3. TrapTriggered (decrements chargesRemaining).
 *  4. TrapExpired (only when chargesRemaining hits 0 after the
 *     decrement; reason: 'chargesExhausted').
 */
export const planTriggerTrap = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: TriggerTrapIntent,
): ReadonlyArray<Event> => {
  const trap = state.traps[intent.trapId];
  if (!trap) throw new Error(`Unknown trap ${intent.trapId}`);
  if (trap.chargesRemaining <= 0) {
    throw new Error(`Trap ${intent.trapId} has no charges remaining`);
  }

  const target = state.characters[intent.triggeringCharacterId];
  if (!target) {
    throw new Error(`Unknown triggering character ${intent.triggeringCharacterId}`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const saveDerivation = computeSavingThrow({
    character: target,
    itemInstances: state.itemInstances,
    content,
    ability: trap.payload.saveAbility,
    characters: state.characters,
    // Slice 133: starter-pack traps are spell-armed (Glyph of Warding's
    // Explosive Runes, Cordon of Arrows), so the triggering save
    // counts as a magical effect for Magic Resistance / Holy Aura /
    // similar purposes. Future non-spell traps would pass false.
    sourceIsMagical: true,
  });
  // Slice 133: honor save advantage / disadvantage flags (Magic
  // Resistance, Foresight, Holy Aura, etc.). Pre-slice 133 the trap
  // path always rolled a single d20, dropping these signals.
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  if (saveDerivation.hasAdvantage || saveDerivation.hasDisadvantage) {
    rolls.push(rollDie(D20_SIDES, rng));
  }
  const used = saveDerivation.hasAdvantage
    ? 'advantage'
    : saveDerivation.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  const usedD20 = saveDerivation.hasAdvantage
    ? Math.max(...rolls)
    : saveDerivation.hasDisadvantage
      ? Math.min(...rolls)
      : rolls[0]!;
  const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
  const bonus = saveDerivation.total + saveBonus.total;
  const total = usedD20 + bonus;
  const success = total >= trap.payload.saveDC;
  const saveEvent: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.triggeringCharacterId as ULID,
    ability: trap.payload.saveAbility,
    dc: trap.payload.saveDC,
    d20: rolls,
    used,
    bonus,
    total,
    success,
    breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
  };
  events.push(saveEvent);

  const rolled = rollExpression(trap.payload.damageDice, rng);
  const rawAmount = success && trap.payload.halfOnSuccess
    ? Math.floor(rolled.total / 2)
    : success && !trap.payload.halfOnSuccess
      ? 0
      : rolled.total;

  if (rawAmount > 0) {
    // Slice 113: trap damage now flows through the mitigation pipeline.
    // Starter-pack traps (Glyph of Warding, Cordon of Arrows) are
    // spell-sourced, so they count as magical for the resistance
    // qualifier.
    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: rawAmount, type: trap.payload.damageType }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: applyAll(state, events),
      content,
      targetId: intent.triggeringCharacterId,
      mitigatedComponents: mitigated,
      causedByEventId: saveEvent.id,
      at,
      rng,
    });
    const damage: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId: intent.triggeringCharacterId as ULID,
      components: intercept.components,
      sourceCharacterId: trap.sourceCharacterId,
      source: `trap:${trap.sourceSpellId}:${trap.label}`,
      causedByEventId: saveEvent.id,
    };
    events.push(damage);
    events.push(...intercept.extraEvents);
  }

  const triggered: TrapTriggeredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'TrapTriggered',
    trapId: trap.id,
    triggeringCharacterId: intent.triggeringCharacterId as ULID,
    causedByEventId: saveEvent.id,
  };
  events.push(triggered);

  if (trap.chargesRemaining - 1 <= 0) {
    const expired: TrapExpiredEvent = {
      id: newEventId() as ULID,
      at,
      type: 'TrapExpired',
      trapId: trap.id,
      reason: 'chargesExhausted',
      causedByEventId: triggered.id,
    };
    events.push(expired);
  }

  return events;
};
