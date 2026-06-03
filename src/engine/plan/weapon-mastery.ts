import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckForCharacter } from './_halfling-luck.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import type { ULID } from '../ids-utils.js';
import type { WeaponMastery } from '../../schemas/primitives.js';
import type { WeaponMasteryActivatedEvent } from '../../schemas/events/weapon-mastery.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { CombatantMovedEvent } from '../../schemas/events/movement.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import { planConcentrationOnDamage } from './concentration.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { isMagicWeaponAttack } from '../../derive/magicality.js';
import { creatureSize, isLargeOrSmaller } from '../../derive/creature-size.js';
import { canUseWeaponMastery } from '../../derive/weapon-mastery.js';
import { applyAll } from '../apply.js';

const UNARMED_DC_BASE = 8;
const CELL_SIZE_FEET = 5;
const PUSH_DISTANCE_FEET = 10;

const masterySaveDC = (character: { abilityScores: { STR: number }; classes: Array<{ level: number }> }): number =>
  UNARMED_DC_BASE +
  abilityModifier(character.abilityScores.STR) +
  proficiencyBonus(computeTotalLevel(character as never));

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
      const dc = masterySaveDC(attacker);
      const rolls: number[] = [rollDie(D20_SIDES, rng)];
      // Slice 543: Halfling Luck on Topple target CON save.
      const d20 = applyHalflingLuckForCharacter(rolls[0]!, intent.targetId, state, content, rolls, rng);
      const conBonus = abilityModifier(target.abilityScores.CON);
      const total = d20 + conBonus;
      const success = total >= dc;
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'SaveRolled',
        targetId: intent.targetId,
        ability: 'CON',
        dc,
        d20: rolls,
        used: 'none',
        bonus: conBonus,
        total,
        success,
      } satisfies SaveRolledEvent);
      if (!success) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'ConditionApplied',
          targetId: intent.targetId,
          conditionId: 'prone',
          appliedConditionId: newAppliedConditionId(),
        } satisfies ConditionAppliedEvent);
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
        const attackerCombatant = encounter.combatants.find((c) => c.combatantId === intent.attackerId);
        const attackerPos = attackerCombatant?.position;
        const dx = attackerPos !== undefined
          ? Math.sign(targetCombatant.position.x - attackerPos.x) || 1
          : 1;
        const dy = attackerPos !== undefined
          ? Math.sign(targetCombatant.position.y - attackerPos.y) || 0
          : 0;
        const cells = PUSH_DISTANCE_FEET / CELL_SIZE_FEET;
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'CombatantMoved',
          encounterId: encounter.id,
          combatantId: intent.targetId,
          fromPosition: { x: targetCombatant.position.x, y: targetCombatant.position.y },
          toPosition: {
            x: targetCombatant.position.x + dx * cells,
            y: targetCombatant.position.y + dy * cells,
          },
          feetTraveled: PUSH_DISTANCE_FEET,
        } satisfies CombatantMovedEvent);
      }
      break;
    }
    case 'Graze': {
      const damageType = weapon.damageType;
      const grazeAmount = Math.max(0, abilityModifier(attacker.abilityScores.STR));
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
