import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ActionEconomyConsumedEvent,
  DeflectAttacksUsedEvent,
} from '../../schemas/events/action-economy.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { abilityModifier, effectiveAbilityScore } from '../../derive/ability.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const MONK_CLASS_ID = 'monk';
const DEFLECT_ATTACKS_LEVEL = 3;
const DEFLECT_ATTACKS_DIE = 10;
const DEFLECTABLE_DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const;
type DeflectableDamageType = (typeof DEFLECTABLE_DAMAGE_TYPES)[number];

export interface DeflectAttacksIntent {
  readonly type: 'DeflectAttacks';
  readonly monkId: string;
  // The triggering attack event's id (links the reaction causally to
  // the AttackRolled / DamageApplied chain the consumer is reacting
  // to).
  readonly triggeringAttackEventId: string;
  // Total raw damage from the triggering attack (the consumer reads
  // this from the pending DamageRolled / DamageApplied before
  // committing the reduction).
  readonly incomingDamage: number;
  // RAW gates this on Bludgeoning / Piercing / Slashing damage. The
  // planner rejects other damage types (Fire, Necrotic, etc.).
  readonly damageType: DeflectableDamageType;
  readonly at?: string;
}

export interface DeflectAttacksOutcome {
  readonly events: ReadonlyArray<Event>;
  // The 1d10 + DEX mod + monk level reduction amount.
  readonly reduction: number;
  // max(0, incomingDamage - reduction). The consumer subtracts this
  // from the pending damage by emitting a modified DamageApplied.
  readonly remainingDamage: number;
}

// Monk L3 Deflect Attacks. RAW (SRD 5.2.1 Monk L3): "When an attack
// roll hits you and its damage includes Bludgeoning, Piercing, or
// Slashing damage, you can take a Reaction to reduce the attack's
// total damage against you. The reduction equals 1d10 plus your
// Dexterity modifier and Monk level."
//
// The counter arm (RAW: "If you reduce the damage to 0, you can
// expend 1 Focus Point to redirect some of the attack's force") is
// deferred to a follow-up slice — it adds: a Focus Point spend, a
// counter-target DEX save, melee/ranged range constraints, and
// Martial Arts die damage application. The core reduction arm is
// what closes the slice-645 L3 floor xfail.
//
// Damage-pipeline integration is also deferred: the planner returns
// the rolled reduction and remaining damage; the consumer subtracts
// the reduction from the pending DamageApplied by emitting a smaller
// damage event (or by canceling the pending damage and re-emitting).
// Auto-integration into the damage pipeline (similar to
// interceptFatalDamage) is a future engine slice.
export const planDeflectAttacks = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: DeflectAttacksIntent,
): DeflectAttacksOutcome => {
  const monk = state.characters[intent.monkId];
  if (!monk) throw new Error(`Unknown character ${intent.monkId}`);
  const enrollment = monk.classes.find((c) => c.classId === MONK_CLASS_ID);
  if (enrollment === undefined || enrollment.level < DEFLECT_ATTACKS_LEVEL) {
    throw new Error(
      `${monk.name} does not have Deflect Attacks (requires Monk level ${DEFLECT_ATTACKS_LEVEL})`,
    );
  }
  if (!DEFLECTABLE_DAMAGE_TYPES.includes(intent.damageType)) {
    throw new Error(
      `Deflect Attacks only applies to Bludgeoning, Piercing, or Slashing damage (got ${intent.damageType})`,
    );
  }

  // Reaction gate: only enforced when in-encounter. Out-of-encounter
  // calls bypass (mirrors the existing reactive-spells / cutting-words
  // pattern).
  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const reactor = encounter?.combatants.find((c) => c.combatantId === intent.monkId);
    if (reactor !== undefined && reactor.turnUsage.reactionUsedThisRound) {
      throw new Error(`${monk.name} has already used their reaction this round`);
    }
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  // Emit ActionEconomyConsumed { reaction } when in-encounter so the
  // reaction-used flag gets set.
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const reactor = encounter?.combatants.find((c) => c.combatantId === intent.monkId);
    if (reactor !== undefined) {
      const reactionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.monkId,
        kind: 'reaction',
      };
      events.push(reactionConsumed);
    }
  }

  // Reduction = 1d10 + DEX mod + monk level. DEX mod via the same
  // effective-score path the engine uses elsewhere (honors floors +
  // increases set by feats / species).
  const dexScore = monk.abilityScores.DEX;
  const dexMod = abilityModifier(effectiveAbilityScore(dexScore));
  const die = rollDie(DEFLECT_ATTACKS_DIE, rng);
  const reduction = Math.max(0, die + dexMod + enrollment.level);
  const remainingDamage = Math.max(0, intent.incomingDamage - reduction);

  // Marker event: records the reduction for transcript + audit.
  if (activeEncounterId !== undefined) {
    const used: DeflectAttacksUsedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DeflectAttacksUsed',
      encounterId: activeEncounterId,
      combatantId: intent.monkId,
      triggeringAttackEventId: intent.triggeringAttackEventId as ULID,
      reduction,
      incomingDamage: intent.incomingDamage,
      remainingDamage,
    };
    events.push(used);
  }

  return { events, reduction, remainingDamage };
};
