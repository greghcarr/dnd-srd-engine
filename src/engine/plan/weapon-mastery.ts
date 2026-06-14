import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import { abilityModifier, proficiencyBonus, effectiveAbilityScore } from '../../derive/ability.js';
import { computeTotalLevel, type Character } from '../../schemas/runtime/character.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import type { ULID } from '../ids-utils.js';
import type { WeaponMastery } from '../../schemas/primitives.js';
import type { WeaponMasteryActivatedEvent } from '../../schemas/events/weapon-mastery.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { CombatantMovedEvent } from '../../schemas/events/movement.js';
import { planConcentrationOnDamage } from './concentration.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { isMagicWeaponAttack } from '../../derive/magicality.js';
import { creatureSize, isLargeOrSmaller } from '../../derive/creature-size.js';
import { canUseWeaponMastery } from '../../derive/weapon-mastery.js';
import { pushDestination } from '../../derive/pathing.js';
import { applyAll } from '../apply.js';

const UNARMED_DC_BASE = 8;
const PUSH_DISTANCE_FEET = 10;

// Slice 857: the EFFECTIVE Strength modifier — base score lifted by the
// effect stack's ability-score floor (Gauntlets of Ogre Power / Belt of Giant
// Strength → STR 19/21/…) and post-snapshot increases (background ASI, etc.),
// the same derivation the attack planner uses for to-hit / damage. Graze
// ("damage equal to the ability modifier you used") and the weapon-mastery
// save DC must read this, not the raw snapshot STR. Every in-scope Graze
// weapon (Greatsword, Greataxe) is Heavy / non-Finesse, so the ability used is
// always STR.
const effectiveStrMod = (attacker: Character, state: CampaignState, content: ResolvedContent): number => {
  const effects = buildEffectStack({
    character: attacker,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const effectiveStr = effectiveAbilityScore(
    attacker.abilityScores.STR,
    effects.effectiveAbilityScoreFloor('STR')?.value,
    effects.effectiveAbilityScoreIncrease('STR'),
  );
  return abilityModifier(effectiveStr);
};

const masterySaveDC = (attacker: Character, state: CampaignState, content: ResolvedContent): number =>
  UNARMED_DC_BASE +
  effectiveStrMod(attacker, state, content) +
  proficiencyBonus(computeTotalLevel(attacker));

const recordMasteryEvent = (
  mastery: WeaponMastery,
  attackerId: string,
  targetId: string | undefined,
  weaponInstanceId: string,
  at: string,
): WeaponMasteryActivatedEvent => ({
  id: newEventId() as ULID,
  at,
  type: 'WeaponMasteryActivated',
  mastery,
  attackerId,
  weaponInstanceId,
  ...(targetId !== undefined ? { targetId } : {}),
});

// Stamps the round-based expiry for a mastery condition that carries an
// `autoExpiry` (Sap / Slow expire at the start of the attacker's next
// turn, Vex at the end). Mirrors the cast-spell stamping; outside an
// active encounter expiry stays consumer-managed (no fields emitted).
const masteryExpiryFields = (
  state: CampaignState,
  content: ResolvedContent,
  conditionId: string,
): { expiresOnRound?: number; expiryTrigger?: 'turnStart' | 'turnEnd' } => {
  const autoExpiry = content.conditions.get(conditionId)?.autoExpiry;
  const currentRound = state.activeEncounterId
    ? state.encounters[state.activeEncounterId]?.round
    : undefined;
  return autoExpiry !== undefined && currentRound !== undefined
    ? { expiresOnRound: currentRound + autoExpiry.afterRounds, expiryTrigger: autoExpiry.trigger }
    : {};
};

export interface WeaponMasteryIntent {
  readonly type: 'WeaponMastery';
  readonly mastery: WeaponMastery;
  readonly attackerId: string;
  readonly targetId: string;
  readonly weaponInstanceId: string;
  // Slice 624: did the attack roll that prompted this mastery
  // activation HIT or MISS? Required for masteries with hit/miss-
  // specific RAW (Graze is miss-only; Sap/Vex/Slow/Topple/Push are
  // hit-and-damage-only). Optional for backwards compatibility with
  // call sites that don't have the context; the planner gates based
  // on the mastery's RAW shape (see invariants below). The slice-622
  // L1 fuzz at seed 6009 surfaced the bug this gate fixes: Graze
  // fired on a HIT because the dispatch unconditionally called the
  // planner regardless of attack outcome.
  readonly attackHit?: boolean;
  // Slice 626: did the attack actually deal damage? Sap/Vex/Slow/
  // Topple/Push RAW says "If you hit AND deal damage to the creature"
  // -- a hit reduced to 0 by resistance/immunity shouldn't fire them.
  // Cleave RAW only requires the hit ("you can make a melee attack
  // roll with the weapon against a second creature"), no damage gate.
  // Graze doesn't need this (it deals the damage; the attack roll
  // missed). When supplied, the planner refuses to fire a damage-gated
  // mastery for which `attackDealtDamage === false`. Optional for
  // backwards compatibility with legacy callers; absence is treated
  // as "presume the damage condition is met" so old goldens pass.
  readonly attackDealtDamage?: boolean;
  readonly at?: string;
}

export const planWeaponMastery = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: WeaponMasteryIntent,
): ReadonlyArray<Event> => {
  const attacker = state.characters[intent.attackerId];
  invariant(attacker !== undefined, `Attacker ${intent.attackerId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);
  const weaponInst = state.itemInstances[intent.weaponInstanceId];
  invariant(weaponInst !== undefined, `Weapon ${intent.weaponInstanceId} not found`);
  const weapon = content.items.get(weaponInst.definitionId);
  invariant(weapon !== undefined, `Weapon definition ${weaponInst.definitionId} not found`);
  invariant(
    weapon.itemKind === 'weapon',
    `Item ${weaponInst.definitionId} is not a weapon`,
  );
  invariant(
    weapon.mastery === intent.mastery,
    `Weapon ${weaponInst.definitionId} mastery is ${weapon.mastery ?? 'none'}, not ${intent.mastery}`,
  );
  // Slice 502: RAW gate — the attacker may use this weapon's mastery only
  // if they chose its kind for the Weapon Mastery feature and are
  // proficient with it.
  invariant(
    canUseWeaponMastery(attacker, weapon, content),
    `${attacker.name} has not mastered ${weaponInst.definitionId} (${intent.mastery})`,
  );
  // Slice 624: RAW hit/miss gate. Graze fires only when the attack
  // misses ("if your attack roll with this weapon misses a creature");
  // every other RAW mastery (Sap, Vex, Slow, Topple, Push, Cleave)
  // fires on a hit-and-damage. Nick/Flex aren't gated on attack outcome
  // (Nick is a Light off-hand timing tweak; Flex is the engine's
  // versatile 1H/2H toggle). When the caller supplies `attackHit`, the
  // planner refuses to fire a mastery whose RAW shape doesn't match.
  // When the caller omits it (legacy / golden tests built before this
  // gate), the planner accepts the call for backward compatibility but
  // a future slice should require `attackHit` for these masteries.
  if (intent.attackHit !== undefined) {
    if (intent.mastery === 'Graze') {
      invariant(
        intent.attackHit === false,
        `Graze fires only when the attack misses (RAW: "If your attack roll with this weapon misses a creature, you can deal damage..."); attackHit was true`,
      );
    } else if (
      intent.mastery === 'Sap'
      || intent.mastery === 'Vex'
      || intent.mastery === 'Slow'
      || intent.mastery === 'Topple'
      || intent.mastery === 'Push'
      || intent.mastery === 'Cleave'
    ) {
      invariant(
        intent.attackHit === true,
        `${intent.mastery} fires only on a hit (RAW); attackHit was false`,
      );
    }
    // Nick / Flex have no RAW hit-or-miss gate; the planner already
    // no-ops on them (their effects live in the attack planner).
  }
  const at = intent.at ?? nowIso();
  // Slice 626: damage-dealt gate. RAW Sap/Vex/Slow/Topple/Push all
  // include "and deal damage to the creature" in the trigger -- a hit
  // reduced to 0 by resistance/immunity shouldn't fire them. Cleave
  // doesn't require damage (just the hit); Graze deals the damage
  // itself. When the caller supplies attackDealtDamage=false for a
  // damage-gated mastery, the planner emits just the activation event
  // and skips the on-hit rider. Borderline-RAW situation: a resisted
  // hit shouldn't fire the rider, but also shouldn't crash the planner.
  const damageGatedMasteries = new Set(['Sap', 'Vex', 'Slow', 'Topple', 'Push']);
  if (
    damageGatedMasteries.has(intent.mastery)
    && intent.attackDealtDamage === false
  ) {
    return [recordMasteryEvent(intent.mastery, intent.attackerId, intent.targetId, intent.weaponInstanceId, at)];
  }
  const events: Event[] = [
    recordMasteryEvent(intent.mastery, intent.attackerId, intent.targetId, intent.weaponInstanceId, at),
  ];

  switch (intent.mastery) {
    case 'Sap':
      // The struck creature attacks with Disadvantage (the bearer's own
      // SetAdvantage(attack) folds into its attack rolls).
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: intent.targetId,
        conditionId: 'sapped',
        appliedConditionId: newAppliedConditionId(),
        ...masteryExpiryFields(state, content, 'sapped'),
      } satisfies ConditionAppliedEvent);
      break;
    case 'Vex':
      // Vex grants the ATTACKER Advantage on their next attack against the
      // struck creature. The condition rides the attacker with
      // sourceCharacterId set to the target, so SetAdvantageVsSource only
      // contributes when the attacker next targets that creature (the
      // mirror of Bestow Curse's cursed-attacks-active).
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: intent.attackerId as ULID,
        conditionId: 'vexing-active',
        sourceCharacterId: intent.targetId as ULID,
        appliedConditionId: newAppliedConditionId(),
        ...masteryExpiryFields(state, content, 'vexing-active'),
      } satisfies ConditionAppliedEvent);
      break;
    case 'Slow':
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: intent.targetId,
        conditionId: 'slowed-10ft',
        appliedConditionId: newAppliedConditionId(),
        ...masteryExpiryFields(state, content, 'slowed-10ft'),
      } satisfies ConditionAppliedEvent);
      break;
    case 'Topple': {
      const dc = masterySaveDC(attacker, state, content);
      // Slice 853: route the target's CON save through the shared
      // rollSaveAgainstDC primitive instead of a raw `abilityModifier(CON)`.
      // The old hand-rolled save silently skipped CON-save *proficiency*,
      // Bless/Bane and other save bonus dice, advantage/disadvantage, Magic
      // Resistance, and the Paralyzed/Stunned/Unconscious auto-fail — all of
      // which the standard derivation applies. (Halfling Luck, previously
      // hand-applied here in slice 543, is also handled inside the primitive.)
      // sourceIsMagical is false: Topple is a nonmagical weapon property, so a
      // creature with Magic Resistance does NOT get Advantage against it.
      const saveResult = rollSaveAgainstDC({
        state,
        content,
        targetId: intent.targetId,
        ability: 'CON',
        dc,
        sourceIsMagical: false,
        rng,
        at,
      });
      if (saveResult !== undefined) {
        events.push(saveResult.event);
        if (!saveResult.success) {
          events.push({
            id: newEventId() as ULID,
            at,
            type: 'ConditionApplied',
            targetId: intent.targetId,
            conditionId: 'prone',
            appliedConditionId: newAppliedConditionId(),
          } satisfies ConditionAppliedEvent);
        }
      }
      break;
    }
    case 'Push': {
      // RAW: Push only moves the target "if it is Large or smaller."
      const encounter = isLargeOrSmaller(creatureSize(target, content)) && state.activeEncounterId !== undefined
        ? state.encounters[state.activeEncounterId]
        : undefined;
      const targetCombatant = encounter?.combatants.find((c) => c.combatantId === intent.targetId);
      if (encounter !== undefined && targetCombatant?.position !== undefined) {
        const attackerPos = encounter.combatants.find((c) => c.combatantId === intent.attackerId)?.position;
        const from = targetCombatant.position;
        const dx = attackerPos !== undefined ? Math.sign(from.x - attackerPos.x) || 1 : 1;
        const dy = attackerPos !== undefined ? Math.sign(from.y - attackerPos.y) || 0 : 0;
        // Slice 698: shove the target onto a legal cell (in-bounds,
        // non-impassable, unoccupied), stopping against an obstacle, rather
        // than emitting a raw off-grid vector. Resolve the location map +
        // doors the same way plan.move does; map-less encounters keep the
        // grid-aligned raw shove.
        const locationId = state.characterLocations[intent.targetId];
        const location = locationId !== undefined ? state.locations[locationId] : undefined;
        const doors = (location?.doorIds ?? [])
          .map((id) => state.doors[id])
          .filter((d): d is NonNullable<typeof d> => d !== undefined);
        const occupiedFeet = encounter.combatants
          .filter((c) => c.combatantId !== intent.targetId && c.position !== undefined)
          .map((c) => c.position as { x: number; y: number });
        const to = pushDestination({ x: from.x, y: from.y }, { dx, dy }, PUSH_DISTANCE_FEET, {
          map: location?.map,
          doors,
          occupiedFeet,
        });
        const feetTraveled = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
        if (feetTraveled > 0) {
          events.push({
            id: newEventId() as ULID,
            at,
            type: 'CombatantMoved',
            encounterId: encounter.id,
            combatantId: intent.targetId,
            fromPosition: { x: from.x, y: from.y },
            toPosition: to,
            feetTraveled,
          } satisfies CombatantMovedEvent);
        }
      }
      break;
    }
    case 'Graze': {
      const damageType = weapon.damageType;
      // RAW: "the target takes damage equal to the ability modifier you used."
      // Read the EFFECTIVE STR mod (slice 857), not the raw snapshot score.
      const grazeAmount = Math.max(0, effectiveStrMod(attacker, state, content));
      if (grazeAmount > 0) {
        const grazeDamageId = newEventId() as ULID;
        // Slice 113: Graze damage now flows through the mitigation
        // pipeline so resistance / immunity / vulnerability apply.
        // Magicality inherits from the weapon (a magic-weapon Graze
        // counts as magical for the resistance qualifier).
        const mitigated = mitigateDamage({
          character: target,
          itemInstances: state.itemInstances,
          content,
          rawComponents: [{ amount: grazeAmount, type: damageType }],
          characters: state.characters,
          sourceIsMagical: isMagicWeaponAttack(weaponInst, weapon),
        });
        const intercept = interceptFatalDamage({
          state: applyAll(state, events),
          content,
          targetId: intent.targetId,
          mitigatedComponents: mitigated,
          causedByEventId: grazeDamageId,
          at,
          rng,
          // Graze is a miss-fallback (the attack roll missed); not a
          // crit. The crit-exempt arm of Undead Fortitude doesn't apply.
          critical: false,
        });
        const grazeDamage: DamageAppliedEvent = {
          id: grazeDamageId,
          at,
          type: 'DamageApplied',
          targetId: intent.targetId,
          components: intercept.components,
        };
        events.push(grazeDamage);
        events.push(...intercept.extraEvents);
        events.push(
          ...planConcentrationOnDamage(state, content, rng, target, grazeDamage.components, grazeDamage.id, at),
        );
      }
      break;
    }
    case 'Cleave':
    case 'Nick':
    case 'Flex':
      // Cleave grants an extra attack; Nick changes the off-hand timing;
      // Flex toggles 1H/2H damage dice. None produce a rider event on
      // their own — they shape the attack sequence and belong in the
      // attack planner, not here.
      break;
  }
  return events;
};
