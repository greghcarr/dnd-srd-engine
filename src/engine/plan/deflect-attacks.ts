import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ActionEconomyConsumedEvent,
  DeflectAttacksUsedEvent,
} from '../../schemas/events/action-economy.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import { abilityModifier, effectiveAbilityScore, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { applyAll } from '../apply.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { martialArtsDie } from './attack.js';
import { planConcentrationOnDamage } from './concentration.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const MONK_CLASS_ID = 'monk';
const DEFLECT_ATTACKS_LEVEL = 3;
const DEFLECT_ATTACKS_DIE = 10;
const DEFLECTABLE_DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const;
type DeflectableDamageType = (typeof DEFLECTABLE_DAMAGE_TYPES)[number];
const KI_RESOURCE_ID = 'ki';
const DEFLECT_COUNTER_SOURCE = 'deflect-attacks-counter';
const MONK_FEATURE_DC_BASE = 8;
const DEFLECT_COUNTER_DIE_COUNT = 2;

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
  // Slice 658: counter arm. When set + the reduction zeros the
  // incoming damage + the monk has >=1 Focus Point (ki), the
  // planner spends 1 ki and rolls a DEX save against the counter
  // target (DC = 8 + WIS + PB). On a failed save, 2x Martial Arts
  // die + DEX mod damage of the same type as the incoming attack.
  // RAW range constraints (5 ft melee / 60 ft ranged + Total Cover)
  // are consumer-supplied — the engine accepts whatever target id
  // the consumer passed.
  readonly counterTargetId?: string;
  readonly at?: string;
}

export interface DeflectAttacksOutcome {
  readonly events: ReadonlyArray<Event>;
  // The 1d10 + DEX mod + monk level reduction amount.
  readonly reduction: number;
  // max(0, incomingDamage - reduction). The consumer subtracts this
  // from the pending damage by emitting a modified DamageApplied.
  readonly remainingDamage: number;
  // Slice 658: counter arm outcome fields. counterFired is true iff
  // the reduction zeroed the damage AND a counter target was
  // supplied AND ki was available; the planner spent 1 ki and rolled
  // the DEX save in this case. counterSaveSuccess + counterDamage
  // are only set when counterFired === true.
  readonly counterFired: boolean;
  readonly counterSaveSuccess?: boolean;
  readonly counterDamage?: number;
}

// Monk L3 Deflect Attacks. RAW (SRD 5.2.1 Monk L3): "When an attack
// roll hits you and its damage includes Bludgeoning, Piercing, or
// Slashing damage, you can take a Reaction to reduce the attack's
// total damage against you. The reduction equals 1d10 plus your
// Dexterity modifier and Monk level."
//
// The counter arm (RAW: "If you reduce the damage to 0, you can
// expend 1 Focus Point to redirect some of the attack's force") is
// wired in slice 658 — spends 1 ki, rolls DEX save against the
// counter target (DC = 8 + WIS + PB), and on failure deals
// 2 * Martial Arts die + DEX mod damage of the same type as the
// incoming attack. Range constraints (5 ft melee / 60 ft ranged +
// Total Cover gate for ranged) are consumer-supplied — the engine
// has no positions; the consumer passes whatever target satisfies
// the range.
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

  // Slice 658: counter arm. Fires only when the reduction zeroed
  // the damage AND a counter target was supplied AND the monk has
  // >=1 ki. Spends 1 ki, rolls a DEX save (DC = 8 + WIS + PB)
  // against the counter target, applies 2 * Martial Arts die + DEX
  // damage on a failed save (same type as the incoming attack).
  let counterFired = false;
  let counterSaveSuccess: boolean | undefined;
  let counterDamage: number | undefined;
  if (
    remainingDamage === 0 &&
    intent.counterTargetId !== undefined &&
    state.characters[intent.counterTargetId] !== undefined
  ) {
    const ki = monk.resources.find((r) => r.resourceId === KI_RESOURCE_ID);
    if (ki !== undefined && ki.current >= 1) {
      counterFired = true;
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ResourceSpent',
        characterId: intent.monkId as ULID,
        resourceId: KI_RESOURCE_ID,
        amount: 1,
      } satisfies ResourceSpentEvent);

      // Monk feature DC: 8 + WIS + PB (RAW: PHB 2024 Monk class
      // "Saving Throws" header).
      const wisMod = abilityModifier(effectiveAbilityScore(monk.abilityScores.WIS));
      const dc = MONK_FEATURE_DC_BASE + wisMod + proficiencyBonus(computeTotalLevel(monk));

      const saveResult = rollSaveAgainstDC({
        state,
        content: _content,
        targetId: intent.counterTargetId,
        ability: 'DEX',
        dc,
        sourceIsMagical: false,
        rng,
        at,
      });
      if (saveResult !== undefined) {
        events.push(saveResult.event);
        counterSaveSuccess = saveResult.success;
        if (!saveResult.success) {
          // RAW: "two rolls of your Martial Arts die plus your
          // Dexterity modifier."
          const dieExpr = martialArtsDie(enrollment.level) ?? '1d6';
          const dieFaces = parseDiceExpression(dieExpr).die;
          let total = dexMod;
          for (let i = 0; i < DEFLECT_COUNTER_DIE_COUNT; i += 1) {
            total += rollDie(dieFaces, rng);
          }
          counterDamage = Math.max(0, total);
          if (counterDamage > 0) {
            const target = state.characters[intent.counterTargetId]!;
            const mitigated = mitigateDamage({
              character: target,
              itemInstances: state.itemInstances,
              content: _content,
              rawComponents: [{ amount: counterDamage, type: intent.damageType }],
              characters: state.characters,
              sourceIsMagical: false,
            });
            const intercept = interceptFatalDamage({
              state: applyAll(state, events),
              content: _content,
              targetId: intent.counterTargetId,
              mitigatedComponents: mitigated,
              causedByEventId: saveResult.event.id,
              at,
              rng,
            });
            const damageApplied: DamageAppliedEvent = {
              id: newEventId() as ULID,
              at,
              type: 'DamageApplied',
              targetId: intent.counterTargetId as ULID,
              components: intercept.components,
              causedByEventId: saveResult.event.id,
              sourceCharacterId: intent.monkId as ULID,
              source: DEFLECT_COUNTER_SOURCE,
            };
            events.push(damageApplied);
            events.push(...intercept.extraEvents);
            // RAW: any damage to a concentrating creature triggers a
            // CON save to maintain concentration. The slice-657
            // concentration-save-coverage audit enforces this on every
            // DamageApplied emission in src/engine/plan/.
            events.push(
              ...planConcentrationOnDamage(
                state,
                _content,
                rng,
                target,
                intercept.components,
                damageApplied.id,
                at,
              ),
            );
          }
        }
      }
    }
  }

  return {
    events,
    reduction,
    remainingDamage,
    counterFired,
    ...(counterSaveSuccess !== undefined ? { counterSaveSuccess } : {}),
    ...(counterDamage !== undefined ? { counterDamage } : {}),
  };
};
