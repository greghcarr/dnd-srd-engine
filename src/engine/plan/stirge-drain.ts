// Slice 490: Stirge Blood Drain. RAW (SRD 5.2.1 Stirge, CR 1/8):
// "While attached, the stirge can't make Proboscis attacks, and the
// target takes 5 (2d4) Necrotic damage at the start of each of the
// stirge's turns. The stirge can detach itself by spending 5 feet of
// its movement. The target or a creature within 5 feet of it can
// detach the stirge as an action."
//
// Two planners ship in this slice:
//   - planStirgeDrain: emits the per-turn-start 2d4 necrotic on the
//     stirge's attached target. Consumer calls at the stirge's turn
//     start (any combatant whose `statblockId === 'stirge'` and has an
//     attached target). Throws if the stirge has no attached target.
//   - planDetachStirge: detach via action (the action arm of the two
//     detach mechanisms). Consumer specifies the actor (the target
//     itself or a creature within 5 ft); the planner consumes an action
//     if inside an active encounter and the actor is the active
//     combatant. Emits ConditionRemoved for the stirge-attached
//     condition on the target.
//
// The "5 ft of movement to detach" arm is documented in
// stirge-attached's description as consumer-managed (same shape as
// Disengage's fixed-cost movement substitution; engine doesn't yet
// model fractional movement-action costs).

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type {
  ConditionRemovedEvent,
  DamageAppliedEvent,
} from '../../schemas/events/combat.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { RNG } from '../../rng/index.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { rollDie } from '../../rng/dice.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { planConcentrationOnDamage } from './concentration.js';
import type { ULID } from '../ids-utils.js';

export const STIRGE_ATTACHED_CONDITION_ID = 'stirge-attached';
const STIRGE_DRAIN_DICE = 2;
const STIRGE_DRAIN_DIE = 4;
const STIRGE_DRAIN_DAMAGE_TYPE = 'necrotic' as const;

// Returns the target the stirge is currently attached to (the character
// carrying `stirge-attached` with sourceCharacterId === stirgeId), or
// undefined if the stirge isn't attached.
export const findStirgeAttachedTarget = (
  state: CampaignState,
  stirgeId: string,
): Character | undefined => {
  for (const c of Object.values(state.characters)) {
    if (c.appliedConditions.some(
      (ac) => ac.conditionId === STIRGE_ATTACHED_CONDITION_ID && ac.sourceCharacterId === stirgeId,
    )) {
      return c;
    }
  }
  return undefined;
};

export interface StirgeDrainIntent {
  readonly type: 'StirgeDrain';
  readonly stirgeId: string;
  readonly at?: string;
}

export const planStirgeDrain = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: StirgeDrainIntent,
): ReadonlyArray<Event> => {
  const stirge = state.characters[intent.stirgeId];
  if (!stirge) throw new Error(`Unknown stirge ${intent.stirgeId}`);
  const target = findStirgeAttachedTarget(state, intent.stirgeId);
  if (target === undefined) {
    throw new Error(`${stirge.name} is not attached to any target`);
  }

  const at = intent.at ?? nowIso();
  // Roll 2d4 necrotic inline (mirror of lands-aid.ts / falling.ts: pure
  // damage emission without an intermediate DamageRolled event, since
  // there's no attack or save resolution in front of it). The DamageApplied
  // event id is pre-generated so the intercept can self-attribute via
  // causedByEventId.
  let rawDamage = 0;
  for (let i = 0; i < STIRGE_DRAIN_DICE; i++) {
    rawDamage += rollDie(STIRGE_DRAIN_DIE, rng);
  }

  const mitigated = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount: rawDamage, type: STIRGE_DRAIN_DAMAGE_TYPE }],
    characters: state.characters,
  });

  const events: Event[] = [];
  const damageAppliedId = newEventId() as ULID;
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: target.id,
    mitigatedComponents: mitigated,
    causedByEventId: damageAppliedId,
    at,
    rng,
  });
  const damageApplied: DamageAppliedEvent = {
    id: damageAppliedId,
    at,
    type: 'DamageApplied',
    targetId: target.id as ULID,
    components: intercept.components,
    sourceCharacterId: intent.stirgeId as ULID,
    source: 'stirge-drain',
  };
  events.push(damageApplied);
  events.push(...intercept.extraEvents);
  events.push(...planConcentrationOnDamage(state, content, rng, target, intercept.components, damageApplied.id, at));
  return events;
};

export interface DetachStirgeIntent {
  readonly type: 'DetachStirge';
  readonly actorId: string;
  readonly stirgeId: string;
  readonly at?: string;
}

export const planDetachStirge = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: DetachStirgeIntent,
): ReadonlyArray<Event> => {
  const actor = state.characters[intent.actorId];
  if (!actor) throw new Error(`Unknown actor ${intent.actorId}`);
  const stirge = state.characters[intent.stirgeId];
  if (!stirge) throw new Error(`Unknown stirge ${intent.stirgeId}`);
  const target = findStirgeAttachedTarget(state, intent.stirgeId);
  if (target === undefined) {
    throw new Error(`${stirge.name} is not attached to any target`);
  }
  // RAW "The target or a creature within 5 feet of it can detach the
  // stirge as an action." Position-aware adjacency would require an
  // active encounter with positioned combatants; for now, accept any
  // actorId == target OR any combatant in the active encounter (engine
  // doesn't yet model arbitrary 5-ft adjacency reliably outside
  // attack.ts). The target-self case is RAW-clean; the ally-detach case
  // is consumer-validated.
  if (intent.actorId !== target.id) {
    // Sanity: actor must exist in the campaign; further adjacency
    // checking is consumer responsibility (matches the engine's "5 ft
    // adjacency" gates elsewhere, which only fire inside active
    // encounters with positioned combatants).
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  // Consume the actor's action if they're the active combatant in an
  // active encounter (same shape as planSacredWeapon's bonus-action
  // consumption).
  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.actorId) {
      if (active.turnUsage.actionUsed) {
        throw new Error(`${actor.name} has already used their action this turn`);
      }
      const actionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.actorId,
        kind: 'action',
      };
      events.push(actionConsumed);
    }
  }

  const removed: ConditionRemovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConditionRemoved',
    targetId: target.id as ULID,
    conditionId: STIRGE_ATTACHED_CONDITION_ID,
  };
  events.push(removed);
  return events;
};
