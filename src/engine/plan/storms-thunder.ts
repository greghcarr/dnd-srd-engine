import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { DamageRolledEvent } from '../../schemas/events/attack.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { assertReactionAvailable, economyConsumedIfEncountered } from './reactive-spells.js';
import { GIANT_ANCESTRY_RESOURCE_ID, validateGoliathAncestry } from './_giant-ancestry.js';
import type { ULID } from '../ids-utils.js';

const STORMS_THUNDER_DIE_SIDES = 8;
const STORMS_THUNDER_SOURCE = 'storms-thunder';

export interface StormsThunderIntent {
  readonly type: 'StormsThunder';
  readonly goliathId: string;
  // RAW: "When you take damage from a creature within 60 feet of you" —
  // the consumer supplies the attacker's id (the within-60-ft gate is
  // consumer-side; the engine doesn't auto-check position).
  readonly attackerId: string;
  // Optional reference to the triggering DamageApplied event for
  // transcript / replay clarity.
  readonly triggeringDamageEventId?: string;
  readonly at?: string;
}

export interface StormsThunderOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly damageDealt: number;
}

// Goliath Giant Ancestry → Storm's Thunder (Storm Giant).
//
// RAW (SRD 5.2.1 Goliath): "When you take damage from a creature
// within 60 feet of you, you can take a Reaction to deal 1d8 Thunder
// damage to that creature."
//
// Sixth and final arm of the Giant Ancestry cohort. Reaction-style
// planner that emits a DamageRolled + DamageApplied chain at the
// attacker (mirror of cast-spell damage emission). Validates via the
// shared `validateGoliathAncestry` helper + `assertReactionAvailable`.
//
// The within-60-ft gate is consumer-side (engine doesn't model
// position-based range automatically for reactions); consumers
// (UI / VTT) skip invoking this planner when the attacker is too
// far away. Same convention as Uncanny Dodge's "you can see the
// attacker" gate.
export const planStormsThunder = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: StormsThunderIntent,
): StormsThunderOutcome => {
  const goliath = state.characters[intent.goliathId];
  if (!goliath) throw new Error(`Unknown character ${intent.goliathId}`);
  const attacker = state.characters[intent.attackerId];
  if (!attacker) throw new Error(`Unknown attacker ${intent.attackerId}`);
  if (intent.goliathId === intent.attackerId) {
    throw new Error("Storm's Thunder targets the creature that dealt damage, not the bearer");
  }

  validateGoliathAncestry(goliath, state, 'storms-thunder', "Storm's Thunder");
  assertReactionAvailable(state, intent.goliathId, "use Storm's Thunder");

  const at = intent.at ?? nowIso();
  const damageRoll = rollDie(STORMS_THUNDER_DIE_SIDES, rng);

  const events: Event[] = [];
  const reaction = economyConsumedIfEncountered(state, intent.goliathId, at, 'reaction');
  if (reaction !== undefined) events.push(reaction);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.goliathId as ULID,
    resourceId: GIANT_ANCESTRY_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  // Emit a DamageRolled → DamageApplied chain at the attacker. The
  // damage is non-magical from a creature ability (RAW doesn't mark
  // Goliath traits as magical). Mitigation applies (resistance /
  // immunity / vulnerability to thunder).
  const damageRolledId = newEventId() as ULID;
  const damageRolled: DamageRolledEvent = {
    id: damageRolledId,
    at,
    type: 'DamageRolled',
    attackerId: intent.goliathId as ULID,
    targetId: intent.attackerId as ULID,
    // No weapon — this is a creature-ability damage source. Reuse a
    // synthetic id so the schema is satisfied; the source field below
    // is the discriminator consumers / triggers branch on.
    weaponInstanceId: intent.goliathId as ULID,
    rolls: [{
      expression: '1d8',
      rolls: [damageRoll],
      modifier: 0,
      type: 'thunder',
    }],
    critical: false,
  };
  events.push(damageRolled);

  const mitigatedComponents = mitigateDamage({
    character: attacker,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount: damageRoll, type: 'thunder' }],
    characters: state.characters,
    sourceIsMagical: false,
  });
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: intent.attackerId,
    mitigatedComponents,
    causedByEventId: damageRolledId,
    at,
    rng,
    critical: false,
  });
  const damageApplied: DamageAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'DamageApplied',
    targetId: intent.attackerId as ULID,
    components: intercept.components,
    causedByEventId: damageRolledId,
    sourceCharacterId: intent.goliathId as ULID,
    source: STORMS_THUNDER_SOURCE,
  };
  events.push(damageApplied);
  events.push(...intercept.extraEvents);

  const damageDealt = intercept.components.reduce((s, c) => s + c.amount, 0);
  return { events, damageDealt };
};
