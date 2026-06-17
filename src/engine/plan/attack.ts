import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  AttackRolledEvent,
  DamageRolledEvent,
  DamageRoll,
} from '../../schemas/events/attack.js';
import type {
  DamageAppliedEvent,
  ConditionRemovedEvent,
  ConditionAppliedEvent,
  CreatureDestroyedEvent,
  AbilityScoreDrainedEvent,
} from '../../schemas/events/combat.js';
import type { MirrorImageDeflectedEvent } from '../../schemas/events/mirror-image.js';
import type { ItemTemporaryBuff } from '../../schemas/runtime/item-instance.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression, rollExpression } from '../../rng/dice.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { computeAttackBonus, martialArtsApplies } from '../../derive/attack.js';
import type { Weapon } from '../../schemas/content/item.js';
import { computeAC } from '../../derive/ac.js';
import { buildEffectStack, collectEffectsFromCharacter, getEffectiveFeatIds } from '../../derive/effect-stack.js';
import { cunningStrikeForgoDice, cunningStrikeMinLevel, type CunningStrikeOption } from './cunning-strike.js';
import { getCreatureType } from '../../derive/creature-type.js';
import { creatureSize, isLargeOrSmaller } from '../../derive/creature-size.js';
import { wearsUntrainedBodyArmor } from '../../derive/armor-training.js';
import { canUseWeaponMastery } from '../../derive/weapon-mastery.js';
import { abilityModifier, effectiveAbilityScore } from '../../derive/ability.js';
import { computeActionEconomyBudget } from '../../derive/action-economy.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { isMagicWeaponAttack } from '../../derive/magicality.js';
import { resolveEnchantment } from '../../derive/enchantment.js';
import { evaluatePredicate } from '../../effects/predicate.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { rollBonusDice } from './_bonus-dice.js';
import { resolveAttackRoll } from './_attack-roll.js';
import type { ItemInstance } from '../../schemas/runtime/item-instance.js';
import {
  GIANT_ANCESTRY_RESOURCE_ID,
  validateGoliathAncestry,
} from './_giant-ancestry.js';
import {
  findMirrorImage,
  mirrorImageThreshold,
  duplicateAC as computeDuplicateAC,
  type MirrorImageState,
} from '../../derive/mirror-image.js';
import { planConcentrationOnDamage } from './concentration.js';
import { planLifeDrainEvents } from './_life-drain.js';
import { dispatchTriggers } from '../triggers/dispatch.js';
import { applyAll } from '../apply.js';
import { D20_SIDES, NAT_20, NAT_1 } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import { assertActorCanAct, findActorBlockingCondition, getEffectiveSpeed } from './_actor-state.js';
import { chebyshevDistance } from './movement.js';
import { assertLineOfSightForAttack } from './_spatial-gates.js';

const DEFAULT_MELEE_REACH_FEET = 5;
const REACH_PROPERTY_FEET = 10;

// Rolls an item buff's per-hit extra-damage rider (Elemental Weapon:
// +1d4/2d4/3d4 of the caster-chosen type). Returns undefined when the
// buff has no extra damage configured. Crits double the dice per RAW.
const rollExtraDamageDice = (
  dice: string,
  damageType: DamageRoll['type'],
  rng: RNG,
  critical: boolean,
): DamageRoll => {
  const parsed = parseDiceExpression(dice);
  const totalDice = critical ? parsed.count * 2 : parsed.count;
  const rolls: number[] = [];
  for (let i = 0; i < totalDice; i++) {
    rolls.push(rollDie(parsed.die, rng));
  }
  return { expression: dice, rolls, modifier: parsed.modifier, type: damageType };
};

const buildBuffExtraDamageRoll = (
  buff: ItemTemporaryBuff | undefined,
  rng: RNG,
  critical: boolean,
): DamageRoll | undefined => {
  if (buff?.extraDamageDice === undefined || buff.extraDamageType === undefined) return undefined;
  return rollExtraDamageDice(buff.extraDamageDice, buff.extraDamageType, rng, critical);
};

// Slice 124. Builds the event tail for a Mirror Image-deflected
// attack: AttackRolled (with hit:false against the duplicate AC) +
// MirrorImageDeflected, plus a trailing ConditionRemoved when the
// last duplicate is destroyed. Returns undefined when the deflection
// d20 doesn't meet the duplicate-pool threshold; callers fall back
// to the normal attack flow.
//
// Slice 125: dispatchTriggers runs on the deflected AttackRolled.
// Bearer-side hit-gated riders (AoA, Fire Shield) still don't fire
// because the event carries hit:false, but attacker-side on-miss
// riders (Studied Attacks' consume-on-attack-vs-source, future
// similar) get a chance to fire as RAW expects: the attacker rolled
// an attack against the bearer, the bearer's defenses just absorbed
// it via an illusion.
export interface DeflectedAttackInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly attackerId: ULID;
  readonly bearerId: ULID;
  readonly weaponInstanceId: ULID;
  readonly attackBonus: number;
  readonly advantage: 'none' | 'advantage' | 'disadvantage';
  readonly attackKind: 'melee' | 'ranged';
  readonly rng: RNG;
  readonly at: string;
  readonly mirrorImage: MirrorImageState;
  readonly causedByEventId?: ULID;
}

export const tryBuildDeflectedAttack = (
  input: DeflectedAttackInput,
): ReadonlyArray<Event> | undefined => {
  const deflectionD20 = rollDie(D20_SIDES, input.rng, 'attack');
  const threshold = mirrorImageThreshold(input.mirrorImage.duplicates);
  if (deflectionD20 < threshold) return undefined;

  const duplicateAC = computeDuplicateAC(input.mirrorImage.bearerDexMod);
  const attackRolls: number[] = [rollDie(D20_SIDES, input.rng, 'attack')];
  if (input.advantage !== 'none') attackRolls.push(rollDie(D20_SIDES, input.rng, 'attack'));
  const usedRoll =
    input.advantage === 'advantage'
      ? Math.max(...attackRolls)
      : input.advantage === 'disadvantage'
        ? Math.min(...attackRolls)
        : (attackRolls[0] ?? 0);
  const attackTotal = usedRoll + input.attackBonus;
  const natural20 = usedRoll === NAT_20;
  const natural1 = usedRoll === NAT_1;
  const duplicateHit = !natural1 && (natural20 || attackTotal >= duplicateAC);
  const duplicatesAfter = duplicateHit
    ? input.mirrorImage.duplicates - 1
    : input.mirrorImage.duplicates;

  const attackRolled: AttackRolledEvent = {
    id: newEventId() as ULID,
    at: input.at,
    type: 'AttackRolled',
    attackerId: input.attackerId,
    targetId: input.bearerId,
    weaponInstanceId: input.weaponInstanceId,
    d20: attackRolls,
    used: input.advantage,
    attackBonus: input.attackBonus,
    total: attackTotal,
    targetAC: duplicateAC,
    hit: false,
    critical: false,
    attackKind: input.attackKind,
  };
  const deflected: MirrorImageDeflectedEvent = {
    id: newEventId() as ULID,
    at: input.at,
    type: 'MirrorImageDeflected',
    bearerId: input.bearerId,
    attackerId: input.attackerId,
    appliedConditionId: input.mirrorImage.appliedConditionId,
    deflectionD20,
    deflectionThreshold: threshold,
    duplicateAC,
    attackD20: usedRoll,
    attackTotal,
    duplicateHit,
    duplicatesAfter,
    ...(input.causedByEventId !== undefined
      ? { causedByEventId: input.causedByEventId }
      : {}),
  };
  // Slice 125: dispatch triggers on the deflected AttackRolled so
  // attacker-side on-miss riders (Studied Attacks' consume-on-attack-
  // vs-source, future similar) fire as RAW expects. The bearer-side
  // hit-gated riders (AoA, Fire Shield) won't fire because the event
  // carries hit:false.
  const stateAfterAttack = applyAll(input.state, [attackRolled]);
  const attackTriggers = dispatchTriggers({
    state: stateAfterAttack,
    content: input.content,
    rng: input.rng,
    event: attackRolled,
    at: input.at,
  });
  const events: Event[] = [attackRolled, ...attackTriggers, deflected];
  if (duplicateHit && duplicatesAfter === 0) {
    const removed: ConditionRemovedEvent = {
      id: newEventId() as ULID,
      at: input.at,
      type: 'ConditionRemoved',
      targetId: input.bearerId,
      conditionId: 'mirror-image-active',
      causedByEventId: deflected.id,
    };
    events.push(removed);
  }
  return events;
};

export const COVER_KINDS = ['none', 'half', 'three-quarters', 'total'] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

const HALF_COVER_AC_BONUS = 2;
const THREE_QUARTERS_COVER_AC_BONUS = 5;

export const coverACBonus = (cover: CoverKind): number => {
  switch (cover) {
    case 'half':
      return HALF_COVER_AC_BONUS;
    case 'three-quarters':
      return THREE_QUARTERS_COVER_AC_BONUS;
    case 'none':
    case 'total':
      return 0;
  }
};

// Slice 550: RAW (SRD 5.2.1 Cover): "A target with half cover has a
// +2 bonus to AC and Dexterity saving throws. A target with three-
// quarters cover has a +5 bonus to AC and Dexterity saving throws."
// The bonus is identical in magnitude to coverACBonus but the save
// arm applies ONLY to Dexterity saves (not STR/CON/INT/WIS/CHA), so
// the save site reads this helper after checking the ability.
export const coverDexSaveBonus = (cover: CoverKind): number => coverACBonus(cover);

export interface AttackIntent {
  readonly type: 'Attack';
  readonly attackerId: string;
  readonly targetId: string;
  readonly weaponInstanceId: string;
  readonly advantage?: 'advantage' | 'disadvantage' | 'none';
  readonly cover?: CoverKind;
  readonly at?: string;
  // Slice 276: consumer-supplied bearer-side perception fact for the
  // Frightened LoS gate. RAW (SRD 5.2.1 Frightened): "Disadvantage on
  // ability checks and attack rolls while the source of fear is
  // within line of sight." When the attacker carries a Frightened
  // condition, the predicate-gated SetAdvantage on attack only fires
  // if the bearer can see their fear source. The engine doesn't
  // model line of sight; the consumer supplies the value. Semantics:
  //   true  -> source is visible (disadvantage applies; default RAW
  //            reading when no information is available).
  //   false -> source is NOT visible (RAW bypass; no disadvantage).
  //   undefined -> consumer didn't specify; default-apply (same as
  //                true). The predicate is `not eq value:false` so
  //                undefined and true both fire.
  // Symmetric `bearerCanSeeFearSource?` field on ComputeAbilityCheckInput
  // gates the ability-check disadvantage arm.
  readonly bearerCanSeeFearSource?: boolean;
  // Rogue Cunning Strike (L5+): effects to add to this attack's Sneak
  // Attack, each forgoing 1d6 of Sneak Attack damage and applying its
  // effect (Poison / Trip / Withdraw) after the damage. Up to one effect
  // at L5-10, two at L11+ (Improved Cunning Strike). The chosen effects
  // only resolve if the attack actually deals Sneak Attack damage.
  readonly cunningStrike?: ReadonlyArray<CunningStrikeOption>;
  // Slice 278: consumer-supplied per-attacker LoS fact for the Dodge
  // condition's ImposeDisadvantageOnAttackers arm. RAW (SRD 5.2.1
  // Dodge): "any attack roll made against you has Disadvantage if
  // you can see the attacker." When the TARGET carries the dodged
  // condition, the disadvantage applies only when the target can see
  // this specific attacker. Per-attacker rather than per-bearer
  // (slice 276's pattern): the same dodging creature might see
  // attacker A but not attacker B. The engine doesn't model line of
  // sight; the consumer supplies the value. Semantics:
  //   true  -> target can see attacker (disadvantage applies; default
  //            RAW reading when no information is available).
  //   false -> target CANNOT see attacker (RAW bypass; no disadvantage).
  //   undefined -> consumer didn't specify; default-apply (same as
  //                true). Predicate is `not eq value:false`.
  // Slice 886: this fact now ALSO drives the general Unseen-Attacker
  // ADVANTAGE arm — RAW (Unseen Attackers and Targets): "When a creature
  // can't see you, you have Advantage on attack rolls against it." So
  // `false` both bypasses Dodge AND grants this attacker Advantage (opt-in:
  // undefined / true → no advantage). Cancelled by Elusive like any
  // advantage source.
  readonly targetCanSeeAttacker?: boolean;
  // Slice 886: the other half of the general Unseen rule. RAW (Unseen
  // Attackers and Targets): "When you make an attack roll against a target
  // you can't see, you have Disadvantage on the roll." The engine modeled
  // this only via the Invisible condition; this fact generalizes it to
  // darkness / heavy obscurement / Blinded. The engine doesn't model line of
  // sight, so the consumer supplies it:
  //   false     -> attacker CANNOT see the target → Disadvantage.
  //   true / undefined -> attacker can see (or unspecified) → no disadvantage
  //                       (opt-in; existing attacks are byte-unchanged).
  // A consumer whose attacker has blindsight/tremorsense/truesight against a
  // hidden target passes `true` (it effectively "sees" for attack purposes).
  readonly attackerCanSeeTarget?: boolean;
  // Slice 445: consumer-supplied per-attack fact for monster Pack
  // Tactics. RAW (SRD 5.2.1, every Pack Tactics user): "The wolf has
  // Advantage on an attack roll against a creature if at least one of
  // the wolf's allies is within 5 feet of the creature and the ally
  // doesn't have the Incapacitated condition." The engine doesn't
  // model positions, so the consumer signals the combined predicate
  // (an ally within 5 ft of the target AND that ally is not
  // Incapacitated) as one boolean. Opt-in semantic (mirror of slice
  // 279's `lightLevel`): `undefined` produces no advantage; the
  // bearer must explicitly receive `true` to gain the benefit.
  // Strict-RAW: never grants more advantage than the consumer signals.
  readonly attackerHasAllyAdjacentToTarget?: boolean;
  // Slice 880: consumer-supplied per-attack hostility fact for "Ranged
  // Attacks in Close Combat". RAW: a ranged attack has Disadvantage if a
  // HOSTILE creature who isn't Incapacitated is within 5 ft of the attacker.
  // The engine has no hostility model, so the position-derived fallback treats
  // ANY adjacent non-incapacitated combatant as a threat (an archer next to a
  // friendly cleric would take disadvantage). A hostility-aware consumer
  // answers the predicate directly here:
  //   true  -> a hostile creature is within 5 ft (disadvantage applies).
  //   false -> no hostile creature within 5 ft (no disadvantage, even with a
  //            friendly adjacent — the hostility-model fix).
  //   undefined -> consumer didn't specify; fall back to the conservative
  //                any-adjacent geometry (prior behavior). Default-apply,
  //                mirroring `attackerHasAllyAdjacentToTarget`'s
  //                `consumer ?? positionDerived` resolution.
  readonly attackerHasHostileAdjacent?: boolean;
  // Slice 451: consumer-supplied ambient light at the attacker's tile,
  // for monster traits that gate on light (Kobold Warrior's Sunlight
  // Sensitivity: "While in sunlight, the kobold has Disadvantage on
  // ability checks and attack rolls"). Same 3-value enum and opt-in
  // semantic as slice 279's check-side `lightLevel` field on
  // ComputeAbilityCheckInput; this is the attack-side mirror so the
  // disadvantage on attack rolls arm has its own fact source. Surfaces
  // as `bearer.lightLevel` in the attacker-side SetAdvantage facts.
  readonly lightLevel?: 'bright' | 'dim' | 'darkness';
  // Slice 467: Savage Attacker (Origin Feat). RAW (SRD 5.2.1): "Once
  // per turn when you hit a target with a weapon, you can roll the
  // weapon's damage dice twice and use either roll against the target."
  // Opt-in per-attack: the consumer signals true to spend the per-turn
  // use on this attack. The planner validates the attacker has
  // savage-attacker on its effective feat list (via getEffectiveFeatIds,
  // which auto-projects the background's originFeatId since slice 466)
  // and, in an active encounter, that the turn-usage flag is unset.
  // The reroll only fires on a hit; a miss with this flag set does NOT
  // consume the per-turn use (RAW: "when you hit").
  readonly useSavageAttacker?: boolean;
  // Slice 555: Goliath Giant Ancestry → Fire's Burn opt-in. RAW: "When
  // you hit a target with an attack roll and deal damage to it, you
  // can also deal 1d10 Fire damage to that target." Validates Goliath
  // species + Fire's Burn ancestry choice resolved + giant-ancestry
  // resource > 0. The +1d10 fire rides the damage roll on hit; on
  // miss no resource is consumed (RAW "When you hit"). Engine
  // mirrors the slice-467 Savage Attacker shape — pre-validate, fire
  // at damage-roll site, emit a marker event so reducers can track.
  readonly useGiantAncestryFiresBurn?: boolean;
  // Slice 556: Goliath Giant Ancestry → Frost's Chill opt-in. RAW:
  // "When you hit a target with an attack roll and deal damage to it,
  // you can also deal 1d6 Cold damage to that target and reduce its
  // Speed by 10 feet until the start of your next turn." Same dial
  // shape as Fire's Burn; the speed reduction lands as a temporary
  // condition (`frosts-chill-slowed`) sourced by the attacker so its
  // autoExpiry fires on the attacker's next turn-start.
  readonly useGiantAncestryFrostsChill?: boolean;
  // Slice 557: Goliath Giant Ancestry → Hill's Tumble opt-in. RAW:
  // "When you hit a Large or smaller creature with an attack roll and
  // deal damage to it, you can give that target the Prone condition."
  // Same dial shape as the sibling arms; rejects pre-attack if the
  // target is larger than Large.
  readonly useGiantAncestryHillsTumble?: boolean;
  // Slice 491: consumer-supplied per-attack fact for "the attacker
  // moved 20+ feet straight toward this target immediately before the
  // hit." Canonical user: Boar Gore ("If the target is a Medium or
  // smaller creature and the boar moved 20+ feet straight toward it
  // immediately before the hit, the target takes an extra 1d6 piercing
  // and has the Prone condition"). The engine doesn't track movement
  // direction or "movement immediately before the hit" — same shape as
  // bearer.lightLevel / attackerHasAllyAdjacentToTarget: the consumer
  // signals the combined predicate as one boolean. Opt-in: undefined
  // produces no charge bonus. Surfaces as
  // `event.attackerChargedThisTarget` in the onHit rider's condition
  // predicate facts.
  readonly chargedAtTarget?: boolean;
  // Slice 494: override which ability mod drives the attack + damage
  // roll. Default (undefined) uses chooseDamageAbility (STR / DEX
  // depending on weapon properties). Canonical user: True Strike RAW
  // ("The attack uses your spellcasting ability for the attack and
  // damage rolls instead of using Strength or Dexterity"). The
  // planWeaponAttackMechanic resolves the caster's spellcasting ability
  // and passes it here.
  readonly abilityOverride?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  // Slice 735: Monk L6 Empowered Strikes (SRD 5.2.1). Opt-in per unarmed
  // strike — when true and the weapon is `unarmed-strike` and the attacker
  // bears `GrantUnarmedForceOption`, the strike's damage type becomes Force
  // ("it can deal your choice of Force damage or its normal damage type").
  // Inert otherwise (no feature / not unarmed / flag unset → normal type).
  readonly unarmedStrikeAsForce?: boolean;
}

const chooseDamageAbility = (
  attacker: Character,
  weapon: Weapon,
): 'STR' | 'DEX' => {
  const isFinesse = weapon.properties.includes('finesse');
  const isRanged = weapon.attackKind === 'ranged';
  if (isRanged && !weapon.properties.includes('thrown')) return 'DEX';
  // Slice 623: Martial Arts "Dexterous Attacks" applies to damage
  // too (mirror of chooseAttackAbility in derive/attack.ts).
  if (martialArtsApplies(attacker, weapon)) {
    return abilityModifier(attacker.abilityScores.DEX) >=
      abilityModifier(attacker.abilityScores.STR)
      ? 'DEX'
      : 'STR';
  }
  if (isFinesse) {
    return abilityModifier(attacker.abilityScores.DEX) >=
      abilityModifier(attacker.abilityScores.STR)
      ? 'DEX'
      : 'STR';
  }
  return 'STR';
};

// Monk class feature: Martial Arts die scaling (PHB 2024 Monk table).
// L1: 1d6, L5: 1d8, L11: 1d10, L17: 1d12. Pre-L1 (non-Monk or
// multiclass with 0 Monk levels) returns undefined.
export const martialArtsDie = (monkLevel: number): string | undefined => {
  if (monkLevel >= 17) return '1d12';
  if (monkLevel >= 11) return '1d10';
  if (monkLevel >= 5) return '1d8';
  if (monkLevel >= 1) return '1d6';
  return undefined;
};

// Slice 625: RAW 2024 Martial Arts Die: "You can roll 1d6 in place of
// the normal damage of your Unarmed Strike OR Monk weapons." Pre-slice
// the engine narrowed this to unarmed-strike only (via the
// `weaponDefId !== 'unarmed-strike'` early-return); the slice-624 fuzz
// review at seed 5508 surfaced the gap: a monk wielding a sickle
// (Light simple melee, monk-eligible) still rolled the sickle's 1d4
// when the Martial Arts L1 die is 1d6. Fix: reuse `martialArtsApplies`
// (the slice-623 helper) so both arms of Martial Arts -- Dexterous
// Attacks (STR→DEX swap) and Martial Arts Die scaling -- share the
// same RAW gate (monk + monk-eligible weapon + no armor + no shield).
// The replacement rule still applies: substitute the Martial Arts die
// only when it's larger than the weapon's native die (RAW: "you can
// roll" -- always optional, but max(weaponDie, maDie) is correct).
export const applyMartialArtsDieScaling = (
  attacker: Character,
  weapon: Weapon,
  naturalDamageDice: string,
): string => {
  if (!martialArtsApplies(attacker, weapon)) return naturalDamageDice;
  const monk = attacker.classes.find((c) => c.classId === 'monk');
  const lvl = monk?.level ?? 0;
  const maDie = martialArtsDie(lvl);
  if (maDie === undefined) return naturalDamageDice;
  const naturalDie = parseDiceExpression(naturalDamageDice).die;
  const martialArtsSize = parseDiceExpression(maDie).die;
  return martialArtsSize > naturalDie ? maDie : naturalDamageDice;
};

export interface ResolveAttackInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly rng: RNG;
  readonly attackerId: string;
  readonly targetId: string;
  readonly weaponInstanceId: string;
  readonly advantage?: 'advantage' | 'disadvantage' | 'none';
  readonly cover?: CoverKind;
  readonly at: string;
  // Slice 206: set true when the attack is an opportunity attack
  // (called from planOpportunityAttack). Surfaced on the emitted
  // AttackRolled.isOpportunityAttack field and threaded into the
  // attackerFacts map so predicates (Hunter Escape the Horde, future
  // OA-specific riders) can scope to OAs without sniffing the planner.
  readonly isOpportunityAttack?: boolean;
  // Slice 276: consumer-supplied LoS fact for Frightened. See doc
  // comment on AttackIntent.bearerCanSeeFearSource above.
  readonly bearerCanSeeFearSource?: boolean;
  // Slice 278: consumer-supplied LoS fact for Dodge + (slice 886) the
  // Unseen-Attacker advantage arm. See doc comment on
  // AttackIntent.targetCanSeeAttacker above.
  readonly targetCanSeeAttacker?: boolean;
  // Slice 886: consumer-supplied LoS fact for the Unseen-Attacker
  // disadvantage arm. See doc comment on AttackIntent.attackerCanSeeTarget.
  readonly attackerCanSeeTarget?: boolean;
  // Slice 445: consumer-supplied fact for monster Pack Tactics. See
  // doc comment on AttackIntent.attackerHasAllyAdjacentToTarget above.
  readonly attackerHasAllyAdjacentToTarget?: boolean;
  // Slice 880: consumer-supplied hostility fact for Ranged Attacks in Close
  // Combat. See doc comment on AttackIntent.attackerHasHostileAdjacent above.
  readonly attackerHasHostileAdjacent?: boolean;
  // Slice 451: consumer-supplied ambient light for Sunlight Sensitivity.
  // See doc comment on AttackIntent.lightLevel above.
  readonly lightLevel?: 'bright' | 'dim' | 'darkness';
  // Rogue Cunning Strike (L5+): effects the attacker adds to this attack's
  // Sneak Attack, each forgoing 1d6 of Sneak Attack damage. See AttackIntent.
  readonly cunningStrike?: ReadonlyArray<CunningStrikeOption>;
  // Slice 467: see AttackIntent.useSavageAttacker doc comment above.
  readonly useSavageAttacker?: boolean;
  // Slice 555: see AttackIntent.useGiantAncestryFiresBurn doc comment above.
  readonly useGiantAncestryFiresBurn?: boolean;
  // Slice 556: see AttackIntent.useGiantAncestryFrostsChill doc comment above.
  readonly useGiantAncestryFrostsChill?: boolean;
  // Slice 557: see AttackIntent.useGiantAncestryHillsTumble doc comment above.
  readonly useGiantAncestryHillsTumble?: boolean;
  // Slice 491: see AttackIntent.chargedAtTarget doc comment above.
  readonly chargedAtTarget?: boolean;
  // Slice 494: see AttackIntent.abilityOverride doc comment above.
  readonly abilityOverride?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  // Slice 735: see AttackIntent.unarmedStrikeAsForce doc comment above.
  readonly unarmedStrikeAsForce?: boolean;
}

const CUNNING_STRIKE_LEVEL = 5;
// Slice 735: the synthetic unarmed-strike weapon definition id (mirrors
// the same constant in flurry-of-blows.ts / the magicality derive).
const UNARMED_STRIKE_DEF_ID = 'unarmed-strike';
const IMPROVED_CUNNING_STRIKE_LEVEL = 11;
// Slice 467: feat id read by resolveAttack to gate the per-attack reroll.
// The savage-attacker feat in the pack carries an empty effects array
// intentionally: the engine keys off the id string here rather than off
// a declarative effect primitive. Consumers opt in per attack via
// AttackIntent.useSavageAttacker. Once-per-turn enforcement uses
// turnUsage.savageAttackerUsedThisTurn (only inside an active
// encounter; out-of-encounter use is unbounded by consumer
// responsibility, mirror of Stunning Strike). The reroll fires at the
// damage-roll site below; the discarded set rides on SavageAttackerUsed.
// (Slice 547 audit-clarification note: an earlier "deep audit" agent
// misread the empty effects array as "feat does nothing"; the feat is
// fully wired, just by id-match rather than by effect declaration.)
const SAVAGE_ATTACKER_FEAT_ID = 'savage-attacker';
// Slice 490: weapon + condition ids used by the attached-stirge gate.
// While a stirge is attached to a target, it cannot make Proboscis
// attacks; the resolver rejects the attempt up front.
const STIRGE_PROBOSCIS_WEAPON_ID = 'stirge-proboscis';
const STIRGE_ATTACHED_CONDITION_ID = 'stirge-attached';

// The attacker's Sneak Attack die count, read from the `cunningStrikeEligible`
// AddDamage rider so it tracks the pack's per-level wiring rather than a
// hardcoded formula. Returns 0 if the attacker has no such rider.
const sneakAttackDiceCount = (attacker: Character, content: ResolvedContent, state: CampaignState): number => {
  const effects = collectEffectsFromCharacter({
    character: attacker, content, itemInstances: state.itemInstances, pendingChoices: state.pendingChoices,
  });
  for (const e of effects) {
    if (e.kind !== 'OnEvent') continue;
    for (const a of e.actions) {
      if (a.kind === 'AddDamage' && a.cunningStrikeEligible === true) return parseDiceExpression(a.dice).count;
    }
  }
  return 0;
};

// Validates a Cunning Strike selection at plan time: the rogue has the
// feature, the effect count is within the level cap (1 at L5-10, 2 at
// L11+ via Improved Cunning Strike), and enough Sneak Attack dice exist
// to forgo. Whether Sneak Attack actually applies to this attack is
// decided by the trigger filter at dispatch; an unqualifying attack
// simply resolves no effects.
const assertCunningStrikeUsable = (
  attacker: Character,
  content: ResolvedContent,
  state: CampaignState,
  effects: ReadonlyArray<CunningStrikeOption>,
): void => {
  const rogueLevel = attacker.classes.find((c) => c.classId === 'rogue')?.level ?? 0;
  if (rogueLevel < CUNNING_STRIKE_LEVEL) {
    throw new Error(`${attacker.name} does not have Cunning Strike (requires Rogue level ${CUNNING_STRIKE_LEVEL})`);
  }
  // Devious Strikes options (Obscure / Knock Out) require Rogue level 14.
  const minLevel = cunningStrikeMinLevel(effects);
  if (rogueLevel < minLevel) {
    throw new Error(`${attacker.name} does not have Devious Strikes (requires Rogue level ${minLevel})`);
  }
  const maxEffects = rogueLevel >= IMPROVED_CUNNING_STRIKE_LEVEL ? 2 : 1;
  if (effects.length > maxEffects) {
    throw new Error(`${attacker.name} can use at most ${maxEffects} Cunning Strike effect(s) at Rogue level ${rogueLevel}`);
  }
  const sneakDice = sneakAttackDiceCount(attacker, content, state);
  const forgo = cunningStrikeForgoDice(effects);
  if (forgo > sneakDice) {
    throw new Error(`Cunning Strike forgoes ${forgo} Sneak Attack dice but only ${sneakDice} are available`);
  }
};

// "Next attack roll" one-shot conditions (Sap / Vex / viciously-mocked).
// After the bearer makes an attack roll, remove any `consumeOnAttack`
// condition it carries so the advantage/disadvantage applies to exactly
// one attack. Three source-key cases:
// 1. Unsourced (Sap's `sapped`) — consumes on any attack.
// 2. Source = the bearer themselves (slice 563: Vicious Mockery's
//    `viciously-mocked`, sourced to the target so the autoExpiry
//    fires at end of bearer's own next turn) — also consumes on any
//    attack since the bearer is "themselves" relative to the rider.
// 3. Source = a specific other creature (Vex's `vexing-active`,
//    stamps `sourceCharacterId` = the vexed target) — consumed only
//    when the bearer attacks THAT source.
// Conditions dedupe by id on apply, so id-based removal is precise.
const buildConsumeOnAttackRemovals = (
  attacker: Character,
  targetId: string,
  content: ResolvedContent,
  at: string,
): ConditionRemovedEvent[] =>
  attacker.appliedConditions
    .filter((applied) => {
      if (content.conditions.get(applied.conditionId)?.consumeOnAttack !== true) return false;
      if (applied.sourceCharacterId === undefined) return true;
      if (applied.sourceCharacterId === attacker.id) return true; // self-sourced
      return applied.sourceCharacterId === targetId;
    })
    .map((applied) => ({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: attacker.id as ULID,
      conditionId: applied.conditionId,
    }));

// Slice 484: target-side mirror of `consumeOnAttack`. After the bearer
// is targeted by an attack roll, remove any `consumeOnIncomingAttack`
// condition it carries so a rider (typically GrantAdvantageToAttackers)
// applies to exactly one incoming attack. RAW user: Worg's Bite. No
// source-keyed filter (RAW "next attack" doesn't constrain the attacker).
const buildConsumeOnIncomingAttackRemovals = (
  target: Character,
  content: ResolvedContent,
  at: string,
): ConditionRemovedEvent[] =>
  target.appliedConditions
    .filter((applied) =>
      content.conditions.get(applied.conditionId)?.consumeOnIncomingAttack === true,
    )
    .map((applied) => ({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: target.id as ULID,
      conditionId: applied.conditionId,
    }));

// Slice 754: two-phase attack. `resolveAttackRollPhase` runs the roll phase
// (attack bonus / advantage / d20 / AC / hit / critical, emits AttackRolled
// + on-attack consumes/triggers) and, on a hit, returns a `RollContext`
// continuation. `resolveAttackDamage(ctx)` runs the damage phase. The
// bundled `resolveAttack` composer (below) calls both and is byte-identical
// to the pre-slice monolith (the golden + fuzz + replay suites are the
// gate). A consumer can open a reaction window between the two phases.
//
// `RollContext` carries every roll-phase local the damage phase reads — its
// fields are exactly the variables `resolveAttackDamage` destructures (kept
// in sync by tsc). Built once at the end of the roll phase; the damage code
// is unchanged (it reads the same names from the destructure).
export interface RollContext {
  readonly input: ResolveAttackInput;
  readonly attackRolled: AttackRolledEvent;
  readonly attackTriggers: ReadonlyArray<Event>;
  readonly attacker: Character;
  readonly target: Character;
  readonly weaponInstance: ItemInstance;
  readonly weaponDef: Weapon;
  readonly attackerEffects: ReturnType<typeof buildEffectStack>;
  readonly critical: boolean;
  readonly stateAfterAttack: CampaignState;
}

export type AttackRollResult =
  | {
      readonly events: ReadonlyArray<Event>;
      readonly hit: true;
      readonly attackRolled: AttackRolledEvent;
      readonly ctx: RollContext;
    }
  | { readonly events: ReadonlyArray<Event>; readonly hit: false };

export const resolveAttackRollPhase = (input: ResolveAttackInput): AttackRollResult => {
  const { state, content, rng, at } = input;
  const attacker = state.characters[input.attackerId];
  if (!attacker) throw new Error(`Unknown attacker ${input.attackerId}`);
  const target = state.characters[input.targetId];
  if (!target) throw new Error(`Unknown target ${input.targetId}`);
  if (input.cunningStrike !== undefined && input.cunningStrike.length > 0) {
    assertCunningStrikeUsable(attacker, content, state, input.cunningStrike);
  }
  const weaponInstance = state.itemInstances[input.weaponInstanceId];
  if (!weaponInstance) throw new Error(`Unknown weapon ${input.weaponInstanceId}`);
  const weaponDef = content.items.get(weaponInstance.definitionId);
  if (!weaponDef || weaponDef.itemKind !== 'weapon') {
    throw new Error(`Item ${weaponInstance.definitionId} is not a weapon`);
  }
  // Slice 490: a stirge that has attached to a target cannot make
  // Proboscis attacks until it detaches. Look for any character carrying
  // the slice-490 `stirge-attached` condition sourced by this attacker;
  // if one exists AND the chosen weapon is the Stirge Proboscis, reject
  // the attack. Other weapons (none currently shipped on the stirge)
  // are unrestricted.
  if (weaponDef.id === STIRGE_PROBOSCIS_WEAPON_ID) {
    const stirgeIsAttached = Object.values(state.characters).some((c) =>
      c.appliedConditions.some(
        (ac) => ac.conditionId === STIRGE_ATTACHED_CONDITION_ID && ac.sourceCharacterId === input.attackerId,
      ),
    );
    if (stirgeIsAttached) {
      throw new Error(
        `${attacker.name} cannot make Proboscis attacks while attached to a target`,
      );
    }
  }
  // Slice 467: Savage Attacker validation. The reroll itself fires
  // below at the damage-roll site (only when the attack actually hits,
  // matching RAW "when you hit"); the validation here rejects malformed
  // intents up front so the consumer sees the error before any d20 is
  // committed.
  // Slice 555: Goliath Fire's Burn validation (mirror of Savage
  // Attacker shape). The +1d10 fire fires only on hit + only when the
  // consumer opts in via useGiantAncestryFiresBurn; the resource is
  // consumed only on hit (RAW "when you hit"). Pre-attack validation
  // rejects malformed intents up front so consumers see the error
  // before any d20 is committed.
  // Slice 555/556/557: Goliath Giant Ancestry attack-rider validation.
  // Each opt-in dial triggers the same precondition check (Goliath +
  // resolved ancestry + giant-ancestry resource > 0) — extracted to
  // the shared helper after the third sibling arrived in slice 557.
  if (input.useGiantAncestryFiresBurn === true) {
    validateGoliathAncestry(attacker, state, 'fires-burn', "Fire's Burn");
  }
  if (input.useGiantAncestryFrostsChill === true) {
    validateGoliathAncestry(attacker, state, 'frosts-chill', "Frost's Chill");
  }
  if (input.useGiantAncestryHillsTumble === true) {
    validateGoliathAncestry(attacker, state, 'hills-tumble', "Hill's Tumble");
    // Slice 557: Hill's Tumble RAW gate — "When you hit a Large or
    // smaller creature." Larger targets (Huge / Gargantuan) are not
    // valid; reject before any damage is rolled.
    const tSize = creatureSize(target, content);
    if (!isLargeOrSmaller(tSize)) {
      throw new Error(
        `${target.name} is ${tSize}, larger than Large — Hill's Tumble only fells Large or smaller creatures`,
      );
    }
  }
  if (input.useSavageAttacker === true) {
    if (!getEffectiveFeatIds(attacker, content).includes(SAVAGE_ATTACKER_FEAT_ID)) {
      throw new Error(`${attacker.name} does not have the Savage Attacker feat`);
    }
    const encounterForSA = state.activeEncounterId
      ? state.encounters[state.activeEncounterId]
      : undefined;
    const attackerCbForSA = encounterForSA?.combatants.find(
      (c) => c.combatantId === input.attackerId,
    );
    if (attackerCbForSA?.turnUsage.savageAttackerUsedThisTurn === true) {
      throw new Error(
        `${attacker.name} has already used Savage Attacker this turn`,
      );
    }
  }

  const attackBonusResult = computeAttackBonus({
    character: attacker,
    itemInstances: state.itemInstances,
    content,
    weaponInstanceId: input.weaponInstanceId,
    characters: state.characters,
    ...(input.abilityOverride !== undefined ? { abilityOverride: input.abilityOverride } : {}),
  });

  const cover = input.cover ?? 'none';
  if (cover === 'total') {
    throw new Error(`${target.name} has total cover and cannot be targeted`);
  }
  const acResultBase = computeAC({
    character: target,
    itemInstances: state.itemInstances,
    content,
    characters: state.characters,
  });
  const coverBonus = coverACBonus(cover);
  const acResult = { ...acResultBase, total: acResultBase.total + coverBonus };

  // The target's effect stack may grant attackers advantage (Faerie
  // Fire, restrained, etc.). If the caller asked for plain 'none' but
  // the target's state implies advantage, upgrade. If they explicitly
  // asked for disadvantage, that wins (advantage and disadvantage from
  // separate sources cancel per RAW).
  const targetEffects = buildEffectStack({
    character: target,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  // Barbarian Reckless Attack: target's recklessAttackActive flag
  // grants advantage to every incoming attack. Read from the encounter
  // combatant entry (per-turn state).
  const targetRecklessGrantsAdvantage = ((): boolean => {
    if (!state.activeEncounterId) return false;
    const enc = state.encounters[state.activeEncounterId];
    if (!enc) return false;
    const cb = enc.combatants.find((c) => c.combatantId === input.targetId);
    return cb?.turnUsage.recklessAttackActive === true;
  })();
  // Slice 568: surface event.attackKind to target-side predicate gates
  // (Prone's RAW asymmetry: melee Advantage, ranged Disadvantage). Same
  // fact name as the attackerFacts map and the trigger-dispatch fact,
  // so a content gate reads one canonical path.
  const targetSideAttackerFacts = new Map<string, unknown>([
    ['event.attackKind', weaponDef.attackKind],
  ]);
  const targetGrantsAdvantage =
    targetEffects.grantsAdvantageToAttackers(targetSideAttackerFacts)
    || targetRecklessGrantsAdvantage
    // Slice 805: synthetic-unconscious — a target at 0 HP grants Advantage
    // to attackers (RAW Unconscious), consistent with the auto-crit which
    // already keys on HP <= 0 (line ~1130). The `unconscious` condition's
    // GrantAdvantageToAttackers only fires when the condition is explicitly
    // applied (Sleep); the HP-drop path relies on this synthetic check.
    || target.hp.current <= 0;
  // Slice 199: target may carry `CancelAdvantageOnAttackers` (Rogue
  // L18 Elusive). Build a small bearer-facts map so a predicate-gated
  // entry can consult the target's own state — Elusive's gate is
  // "unless you have the Incapacitated condition," which the engine
  // models via the action-blocking condition set in `_actor-state`.
  const targetBearerFacts = new Map<string, unknown>([
    ['bearerHasIncapacitated', findActorBlockingCondition(target) !== undefined],
  ]);
  const targetCancelsAdvantage = targetEffects.cancelsAdvantageOnAttackers(targetBearerFacts);
  // Attacker's own Reckless Attack: melee STR-based attack rolls gain
  // advantage when the attacker has recklessAttackActive set on their
  // turnUsage.
  const attackerRecklessAdvantage = ((): boolean => {
    if (!state.activeEncounterId) return false;
    const enc = state.encounters[state.activeEncounterId];
    if (!enc) return false;
    const cb = enc.combatants.find((c) => c.combatantId === input.attackerId);
    if (cb?.turnUsage.recklessAttackActive !== true) return false;
    if (weaponDef.attackKind !== 'melee') return false;
    return chooseDamageAbility(attacker, weaponDef) === 'STR';
  })();
  // Slice 646: Rogue L3 Steady Aim. If the attacker has
  // `steadyAimActive` set on their turnUsage, this attack roll gains
  // advantage. RAW: "Advantage on your next attack roll on the
  // current turn" — only ONE attack benefits; the flag is cleared
  // post-roll via SteadyAimConsumed (emitted at the bottom of this
  // planner when the flag fired). Applies to melee and ranged.
  const attackerSteadyAimAdvantage = ((): boolean => {
    if (!state.activeEncounterId) return false;
    const enc = state.encounters[state.activeEncounterId];
    if (!enc) return false;
    const cb = enc.combatants.find((c) => c.combatantId === input.attackerId);
    return cb?.turnUsage.steadyAimActive === true;
  })();
  // RAW PHB ch.1 "Ranged Attacks in Close Combat": ranged attacks have
  // disadvantage if a HOSTILE creature who isn't Incapacitated is
  // within 5 ft of the attacker. The engine has no hostility model, so
  // the position-derived fallback conservatively treats any other living,
  // non-incapacitated combatant within reach as a threat. Out-of-encounter /
  // unpositioned: no disadvantage imposed (matches the rest of the planner's
  // geometry-aware checks).
  const positionDerivedRangedInMelee = ((): boolean => {
    if (weaponDef.attackKind !== 'ranged') return false;
    if (!state.activeEncounterId) return false;
    const enc = state.encounters[state.activeEncounterId];
    if (!enc) return false;
    const attackerCb = enc.combatants.find((c) => c.combatantId === input.attackerId);
    const attackerPos = attackerCb?.position;
    if (!attackerPos) return false;
    return enc.combatants.some((other) => {
      if (other.combatantId === input.attackerId) return false;
      const otherPos = other.position;
      if (!otherPos) return false;
      const ch = state.characters[other.combatantId];
      if (!ch) return false;
      // Unconscious / Incapacitated / Stunned / Paralyzed / Petrified
      // creatures do not threaten ranged attackers (they cannot react).
      if (findActorBlockingCondition(ch) !== undefined) return false;
      return chebyshevDistance(attackerPos, otherPos) <= 5;
    });
  })();
  // Slice 880 (`no-hostility-model` close): a hostility-aware consumer can
  // override the geometry-only fallback per intent. `attackerHasHostileAdjacent`
  // answers the RAW predicate directly ("is a hostile, non-incapacitated
  // creature within 5 ft of me"), so an archer standing next to a friendly
  // cleric (false) takes no disadvantage, while one next to a hidden foe the
  // engine can't see (true) does. Undefined falls back to the conservative
  // any-adjacent geometry — current behavior, byte-unchanged. The mirror of
  // the Pack Tactics `attackerHasAllyAdjacentToTarget ?? positionDerived` seam.
  // Only ranged attacks can be in-melee-disadvantaged, so the override is inert
  // for melee (the fallback already returned false).
  const rangedInMelee =
    weaponDef.attackKind === 'ranged'
      ? input.attackerHasHostileAdjacent ?? positionDerivedRangedInMelee
      : false;
  // Attacker-side effect stack. Carries per-source advantage entries
  // (Bestow Curse's `cursed-attacks-active` records a
  // `SetAdvantageVsSource` keyed on the cursor's id; the attack
  // planner consults the bucket with the current target's id below).
  // Also reused later for the crit threshold.
  const attackerEffects = buildEffectStack({
    character: attacker,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const attackerVsTargetAdvantage = attackerEffects.advantageVsSource('attack', input.targetId);
  // Slice 231: 3-way join — if the attacker bears a
  // GrantAdvantageVsBearersOfMyCondition entry and the target carries
  // a matching condition whose source is the attacker, fold in that
  // advantage / disadvantage. Canonical user: Ranger L17 Precise
  // Hunter (advantage vs Hunter's-Marked targets).
  const attackerVsMarkedTargetAdvantage = attackerEffects.advantageVsBearersOfMyCondition(
    'attack',
    target.appliedConditions,
    input.attackerId,
  );
  // Slice 273: `target.canLocateInvisible` is symmetric to slice-271's
  // `attacker.bypassesSightIllusion` but for the Invisible RAW shape:
  // "If a creature can somehow see you, you don't gain this benefit
  // against that creature." Blindsight / tremorsense / truesight all
  // let the counter-party locate an invisible creature; Blinded does
  // NOT bypass invisibility (a blinded creature can't see anything,
  // so the invisibility benefit still applies). Same logic populated
  // for both attacker-side and target-side perception so Invisible's
  // SetAdvantage (bearer's own attacks) and ImposeDisadvantageOnAttackers
  // (attacks against bearer) arms can each gate on the counter-party's
  // ability to perceive.
  const canLocateInvisible = (effects: typeof targetEffects): boolean =>
    effects.hasSense('blindsight')
    || effects.hasSense('tremorsense')
    || effects.hasSense('truesight');
  const targetCanLocateInvisible = canLocateInvisible(targetEffects);
  const attackerCanLocateInvisible = canLocateInvisible(attackerEffects);
  // Slice 445: derive the "ally adjacent to target" fact once, here,
  // so it's available to both the pre-roll Pack Tactics SetAdvantage
  // gate (via `attackerSelfAdvantageFacts` below) AND the post-roll
  // AttackRolledEvent (so the existing Rogue Sneak Attack flank arm
  // keeps working). The position-derived path requires an active
  // encounter and a positioned target; the consumer-supplied
  // `input.attackerHasAllyAdjacentToTarget` overrides when set, so
  // position-less consumers can still signal the RAW condition. Opt-in:
  // undefined produces no Pack Tactics advantage (predicate is
  // `eq value:true`).
  const positionDerivedAllyAdjacent = ((): boolean | undefined => {
    if (!state.activeEncounterId) return undefined;
    const enc = state.encounters[state.activeEncounterId];
    if (!enc) return undefined;
    const targetCb = enc.combatants.find((c) => c.combatantId === input.targetId);
    if (!targetCb?.position) return undefined;
    const targetPos = targetCb.position;
    return enc.combatants.some((other) => {
      if (other.combatantId === input.attackerId) return false;
      if (other.combatantId === input.targetId) return false;
      if (!other.position) return false;
      const ch = state.characters[other.combatantId];
      if (!ch) return false;
      if (findActorBlockingCondition(ch) !== undefined) return false;
      return chebyshevDistance(other.position, targetPos) <= 5;
    });
  })();
  const attackerHasAllyAdjacentToTarget =
    input.attackerHasAllyAdjacentToTarget ?? positionDerivedAllyAdjacent;
  // Generic attacker-side advantage on attacks (e.g. Invisible) and
  // disadvantage on attacks (e.g. Blinded, Frightened, Poisoned,
  // Prone, Restrained). Folded alongside target-side contributions
  // so 2024 RAW advantage-cancellation applies symmetrically.
  // Slice 276: `bearer.canSeeFearSource` is consumer-supplied (see
  // ResolveAttackInput doc). Undefined defaults to "default-apply"
  // (the predicate is `not eq value:false`, so undefined evaluates
  // true and the Frightened disadvantage fires). Consumers that
  // model line of sight pass `false` to bypass when the source is
  // out of sight.
  // Slice 483: `bearer.bloodied` is derived engine-side (HP <= floor(max/2),
  // 2024 RAW). Unlike `bearer.lightLevel` / `bearer.canSeeFearSource` (scene
  // facts the engine can't observe), bloodied state lives entirely in
  // character HP that the engine already owns, so no consumer wiring is
  // needed. Boar Bloodied Fury reads this fact.
  const attackerBloodied = attacker.hp.current <= Math.floor(attacker.hp.max / 2);
  const attackerSelfAdvantageFacts = new Map<string, unknown>([
    ['target.canLocateInvisible', targetCanLocateInvisible],
    ['bearer.canSeeFearSource', input.bearerCanSeeFearSource],
    // Slice 445: monster Pack Tactics. Uses the same fact name as the
    // existing post-roll trigger fact (consumed by Rogue Sneak Attack's
    // flank arm) so content gates on one canonical name.
    ['event.attackerHasAllyAdjacentToTarget', attackerHasAllyAdjacentToTarget],
    // Slice 451: attack-side mirror of slice 279's check-side
    // `bearer.lightLevel`. Same opt-in semantic (undefined produces
    // no Sunlight Sensitivity disadvantage); Kobold Warrior gates
    // both its check-disadvantage and its attack-disadvantage on the
    // same fact name so a consumer populates it once per intent.
    ['bearer.lightLevel', input.lightLevel],
    ['bearer.bloodied', attackerBloodied],
    // Slice 808: Grappler feat "Attack Advantage" — "You have Advantage
    // on attack rolls against a creature Grappled by you." True iff the
    // target carries a Grappled condition whose source is this attacker.
    ['event.targetGrappledByAttacker', target.appliedConditions.some(
      (c) => c.conditionId === 'grappled' && c.sourceCharacterId === attacker.id,
    )],
    // Slice 568: Grappled's "Disadvantage on attacks against any
    // target other than the grappler" arm. True iff the attacker is
    // currently Grappled AND the attack's target is NOT the grappler
    // (the condition's sourceCharacterId). The Grappled condition's
    // SetAdvantage on attack disadvantage gates on this being true.
    ['bearer.targetIsNotGrappler', ((): boolean => {
      const grappled = attacker.appliedConditions.find((c) => c.conditionId === 'grappled');
      if (grappled === undefined) return false;
      return grappled.sourceCharacterId !== input.targetId;
    })()],
  ]);
  const attackerSelfAdvantage = attackerEffects.advantageFor('attack', attackerSelfAdvantageFacts);
  // Build a small facts map for type-conditional ImposeDisadvantage
  // entries (Protection from Evil and Good gates the disadvantage on
  // the attacker being aberration / celestial / elemental / fey /
  // fiend / undead). Entries with no predicate apply unconditionally.
  // Slice 271: `attacker.bypassesSightIllusion` mirrors the slice-127
  // Mirror Image bypass logic for any sight-illusion effect (Blur, and
  // future spells with the same RAW shape). True when the attacker
  // has a non-sight sense that defeats visual obfuscation (blindsight,
  // tremorsense, truesight) or carries the Blinded condition (relying
  // on hearing / smell instead of sight). Darkvision is sight-based
  // and is intentionally excluded.
  const attackerBypassesSightIllusion =
    attackerEffects.hasSense('blindsight')
    || attackerEffects.hasSense('tremorsense')
    || attackerEffects.hasSense('truesight')
    || attacker.appliedConditions.some((c) => c.conditionId === 'blinded');
  // Slice 272: bearer-state facts for the Dodge self-disable
  // ("you lose these benefits if you have the Incapacitated
  // condition or if your Speed is 0"). The dodged condition's
  // ImposeDisadvantageOnAttackers entry gates on these facts being
  // false; same facts populated in `computeSavingThrow` for the
  // DEX-save advantage arm. `findActorBlockingCondition` returns the
  // first incapacitating condition the target carries (incapacitated,
  // stunned, paralyzed, petrified, unconscious — the last four all
  // include Incapacitated by RAW); HP <= 0 returns 'unconscious'.
  const targetBearerHasIncapacitated = findActorBlockingCondition(target) !== undefined;
  const targetSpeedZero = getEffectiveSpeed({
    character: target,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  }) === 0;
  const attackerFacts = new Map<string, unknown>([
    ['attackerCreatureType', getCreatureType(attacker, content)],
    // Slice 206: surfaces opportunity-attack-ness to predicate-gated
    // ImposeDisadvantageOnAttackers entries (Hunter Escape the Horde).
    ['event.isOpportunityAttack', input.isOpportunityAttack === true],
    ['attacker.bypassesSightIllusion', attackerBypassesSightIllusion],
    // Slice 273: surfaces attacker-side perception for Invisible's
    // ImposeDisadvantageOnAttackers arm (RAW: "If a creature can
    // somehow see you, you don't gain this benefit against that
    // creature.").
    ['attacker.canLocateInvisible', attackerCanLocateInvisible],
    ['bearer.hasIncapacitated', targetBearerHasIncapacitated],
    ['bearer.speedZero', targetSpeedZero],
    // Slice 278: consumer-supplied LoS fact for Dodge. The bearer
    // here is the TARGET of this attack; the fact is "does the
    // target see this specific attacker." See doc comment on
    // ResolveAttackInput.targetCanSeeAttacker above. Undefined
    // defaults to default-apply (predicate is `not eq value:false`).
    ['bearer.canSeeAttacker', input.targetCanSeeAttacker],
    // Slice 568: Prone's asymmetric attacker advantage (melee
    // Advantage, ranged Disadvantage) gates on event.attackKind. Same
    // fact name as the trigger-dispatch map and targetSideAttackerFacts.
    ['event.attackKind', weaponDef.attackKind],
  ]);
  // SRD 5.2.1 Equipment, Heavy property: "You have Disadvantage on attack
  // rolls with a Heavy weapon if it's a Melee weapon and your Strength score
  // isn't at least 13, or if it's a Ranged weapon and your Dexterity score
  // isn't at least 13." This replaced the 2014 Small-creature-Heavy rule,
  // which 2024 removed (slice 782). Uses the EFFECTIVE score, so a Belt of
  // Giant Strength (a STR floor) lifts the wielder past the threshold the
  // same way it lifts the damage modifier.
  const HEAVY_WEAPON_MIN_ABILITY = 13;
  const heavyWeaponBelowThreshold = ((): boolean => {
    if (!weaponDef.properties.includes('heavy')) return false;
    const ability: 'STR' | 'DEX' = weaponDef.attackKind === 'ranged' ? 'DEX' : 'STR';
    const effective = effectiveAbilityScore(
      attacker.abilityScores[ability],
      attackerEffects.effectiveAbilityScoreFloor(ability)?.value,
      attackerEffects.effectiveAbilityScoreIncrease(ability),
      // Slice 835: a drained STR/DEX can drop below the heavy-weapon threshold.
      attacker.abilityDrain?.[ability],
    );
    return effective < HEAVY_WEAPON_MIN_ABILITY;
  })();
  // Slice 804: RAW Armor Training — wearing Light/Medium/Heavy armor you
  // lack training with gives Disadvantage on any D20 Test involving STR or
  // DEX, which includes a weapon attack roll (it uses a STR or DEX mod).
  const attackerInUntrainedArmor = wearsUntrainedBodyArmor(attacker, content, state.itemInstances, attackerEffects);
  // Slice 886: the general Unseen-Attacker / Unseen-Target rule (RAW "Unseen
  // Attackers and Targets"), generalizing what the Invisible condition models
  // for one specific case. Opt-in consumer LoS facts (the engine doesn't model
  // sight): `attackerCanSeeTarget === false` → the attacker can't see the
  // target → Disadvantage; `targetCanSeeAttacker === false` → the target can't
  // see the attacker → Advantage. Both fold into the same 2024 cancellation as
  // every other source (so mutual blindness nets to no-adv/no-disadv).
  const attackerCannotSeeTarget = input.attackerCanSeeTarget === false;
  const targetCannotSeeAttacker = input.targetCanSeeAttacker === false;
  const targetImposesDisadvantage =
    targetEffects.imposesDisadvantageOnAttackers(attackerFacts)
    || rangedInMelee
    || heavyWeaponBelowThreshold
    || attackerInUntrainedArmor
    || attackerCannotSeeTarget
    || attackerVsTargetAdvantage.disadvantage
    || attackerVsMarkedTargetAdvantage.disadvantage
    || attackerSelfAdvantage.disadvantage;
  let advantage = input.advantage ?? 'none';
  // Reckless Attack: if the attacker activated it this turn (and the
  // attack qualifies), it contributes advantage just like the target's
  // grants-advantage path.
  // Elusive (slice 199) cancels every advantage contribution against
  // the bearer; an explicit `input.advantage === 'advantage'` from the
  // caller is also suppressed below.
  const effectivelyGrantsAdvantage =
    !targetCancelsAdvantage && (
      targetGrantsAdvantage
      || attackerRecklessAdvantage
      || attackerSteadyAimAdvantage
      || targetCannotSeeAttacker
      || attackerVsTargetAdvantage.advantage
      || attackerVsMarkedTargetAdvantage.advantage
      || attackerSelfAdvantage.advantage
    );
  if (targetCancelsAdvantage && advantage === 'advantage') {
    advantage = 'none';
  }
  // 2024 advantage/disadvantage cancellation: if both apply, the
  // attack is rolled with neither. Apply the target's contributions
  // first, then resolve.
  if (effectivelyGrantsAdvantage && targetImposesDisadvantage) {
    // Both cancel — no further auto-modification beyond what the
    // caller passed in.
  } else if (advantage === 'none' && effectivelyGrantsAdvantage) {
    advantage = 'advantage';
  } else if (advantage === 'none' && targetImposesDisadvantage) {
    advantage = 'disadvantage';
  } else if (advantage === 'advantage' && targetImposesDisadvantage) {
    advantage = 'none';
  } else if (advantage === 'disadvantage' && effectivelyGrantsAdvantage) {
    advantage = 'none';
  }
  // Slice 124: Mirror Image deflection. Roll the deflection d20 before
  // the attack roll; on success the attack rolls against the duplicate
  // AC = 10 + bearer DEX mod instead, and emits no damage chain.
  // Slice 127: RAW vision-gate. PHB 2024 Mirror Image: "A creature is
  // unaffected by this spell if it can't see, if it relies on senses
  // other than sight (such as Blindsight), or if it can perceive
  // illusions as false (as with Truesight)." Attackers with blindsight
  // or truesight at any range, or attackers carrying the Blinded
  // condition, see the bearer directly and bypass the deflection pool.
  const attackerBypassesMirrorImage =
    attackerEffects.hasSense('blindsight')
    || attackerEffects.hasSense('truesight')
    || attacker.appliedConditions.some((c) => c.conditionId === 'blinded');
  const mirrorImage = attackerBypassesMirrorImage ? undefined : findMirrorImage(target);
  if (mirrorImage !== undefined) {
    const deflectedEvents = tryBuildDeflectedAttack({
      state,
      content,
      attackerId: input.attackerId,
      bearerId: input.targetId,
      weaponInstanceId: input.weaponInstanceId,
      attackBonus: attackBonusResult.total,
      advantage,
      attackKind: weaponDef.attackKind,
      rng,
      at,
      mirrorImage,
    });
    if (deflectedEvents !== undefined) return { events: deflectedEvents, hit: false };
  }
  // Slice 611: the d20 roll + advantage resolution + Halfling Luck
  // reroll + Bless/Bane bonus-dice fold + crit threshold all live in
  // a shared helper now, used by both weapon attacks (here) and spell
  // attacks (cast-spell.ts). The pre-roll advantage state and crit
  // threshold are still computed locally; this helper just executes
  // the dice + arithmetic.
  const critThresholdNow = attackerEffects.critThreshold();
  const rollResult = resolveAttackRoll({
    advantage,
    attackBonus: attackBonusResult.total,
    targetAC: acResult.total,
    attackerHasHalflingLuck: attackerEffects.hasHalflingLuck(),
    bonusDiceContributions: attackerEffects.bonusDiceFor('attack', attackerFacts),
    critThreshold: critThresholdNow,
    rng,
  });
  const rolls = rollResult.rolls;
  const usedRoll = rollResult.usedRoll;
  const attackBonusDice = rollResult.bonusDice;
  const effectiveAttackBonus = rollResult.effectiveAttackBonus;
  const total = rollResult.total;
  const naturalHit = rollResult.naturalHit;
  const naturalMiss = rollResult.naturalMiss;
  const hit = rollResult.hit;
  // Slice 568 / 858: RAW Paralyzed / Unconscious — "Any attack that hits the
  // creature is a critical hit if the attacker is within 5 feet of the
  // creature." Within-5 is resolved PRECISELY from positions when both
  // combatants are positioned in an active encounter (so a reach weapon used
  // adjacent still auto-crits, and one striking at 10 ft does not). When the
  // engine is position-less it falls back to a weapon-reach proxy (slice 858):
  // a non-reach melee weapon can only strike at 5 ft, so it always counts as
  // within 5; a reach (10-ft) weapon might be at 6-10 ft, so it does NOT
  // auto-crit without positions. This fixes slice 568's over-grant, which took
  // *every* melee attack as within-5 and so auto-crit a 10-ft reach strike.
  // Fires on paralyzed (incl. held-paralyzed-active for Hold Person / Hold
  // Monster, which compose Paralyzed in RAW), unconscious, or HP <= 0 (the
  // synthetic-unconscious case findActorBlockingCondition also returns for).
  // Slice 611: the base crit (`usedRoll >= critThreshold`) lives in
  // resolveAttackRoll; this re-derives the combined crit including the
  // auto-crit branch.
  const attackerWithin5OfTarget = ((): boolean | undefined => {
    if (!state.activeEncounterId) return undefined;
    const enc = state.encounters[state.activeEncounterId];
    if (!enc) return undefined;
    const attackerPos = enc.combatants.find((c) => c.combatantId === input.attackerId)?.position;
    const targetPos = enc.combatants.find((c) => c.combatantId === input.targetId)?.position;
    if (!attackerPos || !targetPos) return undefined;
    return chebyshevDistance(attackerPos, targetPos) <= 5;
  })();
  const targetAutoCritsFromMelee = ((): boolean => {
    if (weaponDef.attackKind !== 'melee') return false;
    const targetIncapacitated =
      target.hp.current <= 0 ||
      target.appliedConditions.some(
        (c) => c.conditionId === 'paralyzed'
          || c.conditionId === 'held-paralyzed-active'
          || c.conditionId === 'unconscious',
      );
    if (!targetIncapacitated) return false;
    // Positioned: the real distance decides. Position-less: only a non-reach
    // melee weapon guarantees the attacker is within 5 ft.
    if (attackerWithin5OfTarget !== undefined) return attackerWithin5OfTarget;
    return !(weaponDef.properties?.includes('reach') ?? false);
  })();
  const critical = rollResult.critical || (hit && targetAutoCritsFromMelee);

  // RAW Rogue Sneak Attack (and equivalent content triggers): the
  // ally-adjacent path requires *another* positioned, non-incapacitated
  // combatant within 5 ft of the target. Computed once earlier in this
  // function (slice 445) so the value flows into both the pre-roll
  // SetAdvantage facts (Pack Tactics) and this event field (Rogue
  // Sneak Attack flank arm). See the earlier `positionDerivedAllyAdjacent`
  // + `attackerHasAllyAdjacentToTarget` block.

  const attackRolled: AttackRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'AttackRolled',
    attackerId: input.attackerId,
    targetId: input.targetId,
    weaponInstanceId: input.weaponInstanceId,
    d20: rolls,
    used: advantage,
    attackBonus: effectiveAttackBonus,
    total,
    targetAC: acResult.total,
    hit,
    critical,
    attackKind: weaponDef.attackKind,
    ...(attackBonusDice.rolls.length > 0
      ? {
          bonusDice: attackBonusDice.rolls.map((b) => ({
            dice: b.dice,
            rolls: [...b.rolls],
            subtract: b.subtract,
            source: b.source,
            total: b.total,
          })),
        }
      : {}),
    ...(attackerHasAllyAdjacentToTarget !== undefined
      ? { attackerHasAllyAdjacentToTarget }
      : {}),
    ...(input.isOpportunityAttack === true ? { isOpportunityAttack: true } : {}),
  };

  // Sap / Vex are spent by this attack roll (RAW "next attack roll").
  // Slice 484: target-side mirror; Worg's bite-target condition is spent
  // by the next attack against the target (RAW "next attack roll made
  // against the target").
  const consumed = buildConsumeOnAttackRemovals(attacker, input.targetId, content, at);
  const targetConsumed = buildConsumeOnIncomingAttackRemovals(target, content, at);
  // Slice 646: Rogue L3 Steady Aim. If the advantage path above fired,
  // clear the per-turn flag so subsequent attacks this turn don't also
  // gain advantage. RAW: only the next attack benefits.
  const steadyAimConsumedEvents: Event[] =
    attackerSteadyAimAdvantage && state.activeEncounterId !== undefined
      ? [
          {
            id: newEventId() as ULID,
            at,
            type: 'SteadyAimConsumed',
            encounterId: state.activeEncounterId,
            combatantId: input.attackerId,
          },
        ]
      : [];
  const stateAfterAttack = applyAll(state, [attackRolled, ...consumed, ...targetConsumed, ...steadyAimConsumedEvents]);
  const attackTriggers = dispatchTriggers({
    state: stateAfterAttack,
    content,
    rng,
    event: attackRolled,
    at,
    ...(input.cunningStrike !== undefined ? { cunningStrike: input.cunningStrike } : {}),
  });

  const rollEvents: ReadonlyArray<Event> = [attackRolled, ...consumed, ...targetConsumed, ...steadyAimConsumedEvents, ...attackTriggers];
  if (!hit) return { events: rollEvents, hit: false };
  const ctx: RollContext = {
    input,
    attackRolled,
    attackTriggers,
    attacker,
    target,
    weaponInstance,
    weaponDef,
    attackerEffects,
    critical,
    stateAfterAttack,
  };
  return { events: rollEvents, hit: true, attackRolled, ctx };
};

export const resolveAttackDamage = (ctx: RollContext): ReadonlyArray<Event> => {
  const {
    input,
    attackRolled,
    attackTriggers,
    attacker,
    target,
    weaponInstance,
    weaponDef,
    attackerEffects,
    critical,
    stateAfterAttack,
  } = ctx;
  const { state, content, rng, at } = input;

  // Slice 494: when input.abilityOverride is set (True Strike), the damage
  // roll uses that ability instead of STR/DEX. Slice 501: a Shillelagh-
  // style weapon buff supplies the same override via the instance's
  // temporaryBuff (precedence: per-attack input > weapon buff > default).
  const damageAbility = input.abilityOverride
    ?? weaponInstance.temporaryBuff?.abilityOverride
    ?? chooseDamageAbility(attacker, weaponDef);
  const damageBaseScore = attacker.abilityScores[damageAbility];
  const damageScoreFloor = attackerEffects.effectiveAbilityScoreFloor(damageAbility)?.value;
  const damageScoreIncrease = attackerEffects.effectiveAbilityScoreIncrease(damageAbility);
  // Slice 450: a weapon flagged `noAbilityModifierDamage` is one whose
  // RAW damage line is a flat number rather than a die + ability mod
  // (Sprite Enchanting Bow's "Hit: 1"). Zero the ability fold so the
  // engine's damage matches RAW exactly. Cleave secondary attacks
  // honor the same flag below.
  const damageAbilityMod = weaponDef.noAbilityModifierDamage === true
    ? 0
    // Slice 835: a drained attack ability lowers weapon damage.
    : abilityModifier(effectiveAbilityScore(damageBaseScore, damageScoreFloor, damageScoreIncrease, attacker.abilityDrain?.[damageAbility]));
  // Flex mastery: a versatile weapon wielded two-handed (off-hand empty)
  // uses the larger versatileDice instead of damageDice. RAW 2024.
  const wieldedTwoHanded =
    attacker.equipped.mainHand === input.weaponInstanceId &&
    attacker.equipped.offHand === undefined;
  const useFlex =
    weaponDef.mastery === 'Flex' &&
    weaponDef.properties.includes('versatile') &&
    weaponDef.versatileDice !== undefined &&
    wieldedTwoHanded;
  // Slice 501: a Shillelagh-style weapon buff overrides the damage die
  // (Shillelagh: `1d8`), taking precedence over the weapon's printed /
  // versatile dice.
  const buffDamageDieOverride = weaponInstance.temporaryBuff?.damageDieOverride;
  const baseDamageExpression = buffDamageDieOverride
    ?? (useFlex && weaponDef.versatileDice !== undefined
      ? weaponDef.versatileDice
      : weaponDef.damageDice);
  const damageExpression = applyMartialArtsDieScaling(attacker, weaponDef, baseDamageExpression);
  const parsed = parseDiceExpression(damageExpression);
  const totalRolls = critical ? parsed.count * 2 : parsed.count;
  // Slice 467: Savage Attacker reroll. RAW (SRD 5.2.1): "you can roll
  // the weapon's damage dice twice and use either roll against the
  // target." Roll two sets, keep the higher-sum set, surface the
  // discarded set on the per-attack SavageAttackerUsed event below.
  // Modifiers, riders, and extra-damage dice are not rerolled (RAW
  // scopes the reroll to "the weapon's damage dice").
  let damageRolls: number[];
  let savageAttackerDiscarded: number[] | undefined;
  if (input.useSavageAttacker === true) {
    const setA: number[] = [];
    const setB: number[] = [];
    for (let i = 0; i < totalRolls; i++) {
      setA.push(rollDie(parsed.die, rng, 'damage'));
      setB.push(rollDie(parsed.die, rng, 'damage'));
    }
    const sumA = setA.reduce((s, v) => s + v, 0);
    const sumB = setB.reduce((s, v) => s + v, 0);
    if (sumA >= sumB) {
      damageRolls = setA;
      savageAttackerDiscarded = setB;
    } else {
      damageRolls = setB;
      savageAttackerDiscarded = setA;
    }
  } else {
    damageRolls = [];
    for (let i = 0; i < totalRolls; i++) {
      damageRolls.push(rollDie(parsed.die, rng, 'damage'));
    }
  }
  // Slice 121: Great Weapon Fighting reroll-to-3 rule. Triggers on a
  // melee attack with a two-handed wield (Two-Handed property, or
  // Versatile with both off-hand and shield slots empty). Each weapon
  // damage die showing 1 or 2 is treated as 3. Applied to the rolled
  // values in place so the DamageRolled event reflects the final
  // dice. Doesn't apply to the slice-90 `extraDamageDice` rider — RAW
  // GWF covers "the weapon's damage dice" only. Stricter than the
  // Flex `wieldedTwoHanded` check above: GWF requires the shield slot
  // to be empty too, since a shield occupies the off hand even though
  // the engine tracks it in a separate slot.
  const twoHandedForGwf =
    weaponDef.properties.includes('two-handed')
    || (weaponDef.properties.includes('versatile')
        && attacker.equipped.offHand === undefined
        && attacker.equipped.shield === undefined);
  const gwfApplies =
    weaponDef.attackKind === 'melee'
    && twoHandedForGwf
    && attackerEffects.hasGreatWeaponFighting();
  if (gwfApplies) {
    for (let i = 0; i < damageRolls.length; i++) {
      if (damageRolls[i]! < 3) damageRolls[i] = 3;
    }
  }
  // Spell-applied weapon buff stamped on this instance (Magic
  // Weapon, Elemental Weapon, etc.). Adds a flat damage bonus to
  // the existing ability-mod + dice-modifier roll. Distinct from
  // the generic effect-stack 'damage' modifier because the buff is
  // weapon-specific to this exact instance.
  const weaponBuffDamageBonus = weaponInstance.temporaryBuff?.damageBonus ?? 0;
  // Slice 316: intrinsic magic-weapon enhancement damage bonus.
  const intrinsicWeaponDamageBonus = weaponDef.damageBonus ?? 0;
  // Slice 317: enchantment-overlay damage bonus + damage-type override
  // + onHit riders (a base weapon instance carrying a multi-base
  // enchantment like Frost Brand / Flame Tongue).
  const enchantment = resolveEnchantment(weaponInstance, content);
  const enchantmentDamageBonus = enchantment?.damageBonus ?? 0;
  // Slice 735: Monk L6 Empowered Strikes — the bearer may deal Force
  // damage with an unarmed strike. Opt-in (intent.unarmedStrikeAsForce),
  // gated on the `GrantUnarmedForceOption` marker + an unarmed-strike
  // weapon; takes precedence over the printed/enchanted type (the explicit
  // player choice wins). Inert by default, so non-opted strikes are
  // byte-identical.
  const empoweredStrikesForce =
    input.unarmedStrikeAsForce === true
    && weaponDef.id === UNARMED_STRIKE_DEF_ID
    && attackerEffects.hasUnarmedForceOption();
  // Slice 501: a Shillelagh-style weapon buff can override the damage type
  // (Shillelagh's "can be Force damage" choice), taking precedence over an
  // enchantment's type and the weapon's printed type.
  const effectiveDamageType =
    (empoweredStrikesForce ? 'force' : undefined)
    ?? weaponInstance.temporaryBuff?.damageTypeOverride
    ?? enchantment?.weaponDamageType
    ?? weaponDef.damageType;
  // Slice 117: consume the effect stack's 'damage' modifier sum.
  // Predicate-gated entries (Dueling: melee + off-hand-no-weapon;
  // Frenzy: melee) use the facts populated below. Predicate-less
  // entries apply unconditionally. Two new facts: `event.attackKind`
  // (already populated for attack-bonus) and `bearer.offHandHasWeapon`
  // (off-hand slot holds an item whose def is `itemKind: 'weapon'`).
  const offHandInstanceId = attacker.equipped.offHand;
  const offHandInstance = offHandInstanceId !== undefined
    ? state.itemInstances[offHandInstanceId]
    : undefined;
  const offHandDef = offHandInstance !== undefined
    ? content.items.get(offHandInstance.definitionId)
    : undefined;
  const damageFacts = new Map<string, unknown>([
    ['event.attackKind', weaponDef.attackKind],
    ['bearer.offHandHasWeapon', offHandDef?.itemKind === 'weapon'],
    // Slice 204: damage type fact for consistency with cast-spell.ts.
    // Lets predicate-gated AddModifier effects scope to weapon-attack
    // damage types (no canonical user today; future content can use it).
    ['event.damageType', weaponDef.damageType],
    // Slice 275: weapon-id fact for predicate-gated AddModifier
    // effects scoped to specific weapons (Bracers of Archery's RAW
    // "+2 damage on ranged attacks made with a longbow or shortbow"
    // is the canonical user; future weapon-specific item buffs plug
    // in by gating on the same fact).
    ['event.weaponId', weaponInstance.definitionId],
    // Slice 548: damage-ability fact (STR / DEX). Lets predicate-gated
    // AddModifier effects scope to "STR-based attacks only" (Rage's
    // damage bonus is the canonical user — RAW "When you make an
    // attack using Strength... you gain a bonus to the damage").
    ['event.damageAbility', damageAbility],
  ]);
  const damageModifierBonus = attackerEffects.modifierSum('damage', damageFacts);
  const damageRollPayload: DamageRoll = {
    expression: damageExpression,
    rolls: damageRolls,
    modifier: damageAbilityMod + parsed.modifier + weaponBuffDamageBonus + intrinsicWeaponDamageBonus + enchantmentDamageBonus + damageModifierBonus,
    type: effectiveDamageType,
  };

  // Item-buff extra-damage rider (Elemental Weapon: +1d4/2d4/3d4 of
  // chosen type per hit). Rolled here so the dice are baked into the
  // resolution event and the replay path is RNG-free. Crits double the
  // extra dice per RAW.
  const extraDamageRoll = buildBuffExtraDamageRoll(weaponInstance.temporaryBuff, rng, critical);
  // Slice 316: intrinsic magic-weapon on-hit riders (Thunderous
  // Greatclub: +1d8 thunder to any creature it hits). Permanent on the
  // weapon definition, distinct from the consumable temporaryBuff rider.
  // Conditional riders (Sun Blade's +1d8 radiant vs Undead) stay
  // deferred — these fire on every hit.
  // Slice 317: enchantment onHit riders (Frost Brand +1d6 cold) fire
  // alongside any intrinsic weapon-def riders.
  // Slice 318: a rider may carry a target-gated `condition` (Sun Blade's
  // +1d8 radiant vs Undead). Evaluate it against target facts at hit
  // time; unconditional riders always fire.
  // Slice 319: `target.speciesId` lets a rider gate on lineage (the
  // Ghoul's Claw fires "if the target isn't an Undead or elf"); the
  // creatureType fact alone can't express the elf exclusion.
  // Slice 446: `target.creatureSize` for size-gated riders (Wolf's
  // Bite "If the target is a Medium or smaller creature, it has the
  // Prone condition"; Dire Wolf's Bite for Large-or-smaller). Uses the
  // shared `creatureSize` derive so the source-of-truth is one place.
  const riderFacts = new Map<string, unknown>([
    ['target.creatureType', getCreatureType(target, content)],
    ['target.speciesId', target.speciesId],
    ['target.creatureSize', creatureSize(target, content)],
    // Slice 491: consumer-supplied "did the attacker charge this target"
    // fact (Boar Gore "moved 20+ ft straight toward it immediately
    // before the hit"). Opt-in: undefined evaluates to false in the
    // predicate, so unconditional onHit riders are unaffected.
    ['event.attackerChargedThisTarget', input.chargedAtTarget === true],
  ]);
  // Slice 324: a rider gated `requiresCritical` fires only on a crit.
  const applicableRiders = [...(weaponDef.onHit ?? []), ...(enchantment?.onHit ?? [])].filter(
    (r) =>
      (r.requiresCritical !== true || critical) &&
      (r.condition === undefined || evaluatePredicate(r.condition, { facts: riderFacts })),
  );
  const onHitRiderRolls = applicableRiders.flatMap((r) =>
    r.dice !== undefined && r.damageType !== undefined
      ? [rollExtraDamageDice(r.dice, r.damageType, rng, critical)]
      : [],
  );

  // Slice 555: Goliath Fire's Burn rider rolls here when opted in
  // (pre-validated up front). RAW: +1d10 Fire damage on hit. Crits
  // double the dice per general crit semantics (mirror of
  // rollExtraDamageDice's `critical` handling).
  const firesBurnRoll = input.useGiantAncestryFiresBurn === true
    ? rollExtraDamageDice('1d10', 'fire', rng, critical)
    : undefined;
  // Slice 556: Goliath Frost's Chill rider — RAW +1d6 Cold damage
  // on hit. The speed-reduction condition is applied separately
  // below via the events tail; only the damage roll lives here.
  const frostsChillRoll = input.useGiantAncestryFrostsChill === true
    ? rollExtraDamageDice('1d6', 'cold', rng, critical)
    : undefined;

  const damageRolled: DamageRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'DamageRolled',
    attackerId: input.attackerId,
    targetId: input.targetId,
    weaponInstanceId: input.weaponInstanceId,
    rolls: [
      damageRollPayload,
      ...(extraDamageRoll === undefined ? [] : [extraDamageRoll]),
      ...onHitRiderRolls,
      ...(firesBurnRoll === undefined ? [] : [firesBurnRoll]),
      ...(frostsChillRoll === undefined ? [] : [frostsChillRoll]),
    ],
    critical,
    causedByEventId: attackRolled.id,
  };

  // Slice 467: emit a SavageAttackerUsed marker when the reroll actually
  // fired (the attack hit AND the consumer opted in). RAW (SRD 5.2.1):
  // "Once per turn when you hit a target with a weapon" — gating on hit
  // means a missed swing with useSavageAttacker=true does NOT consume
  // the per-turn use. The reducer for this event sets the turnUsage
  // flag; subsequent attempts this turn fail validation above.
  const savageAttackerEvent: ReadonlyArray<Event> = savageAttackerDiscarded !== undefined
    ? [{
        id: newEventId() as ULID,
        at,
        type: 'SavageAttackerUsed',
        attackerId: input.attackerId as ULID,
        targetId: input.targetId as ULID,
        weaponInstanceId: input.weaponInstanceId as ULID,
        ...(state.activeEncounterId !== undefined
          ? {
              encounterId: state.activeEncounterId,
              combatantId: input.attackerId as ULID,
            }
          : {}),
        discardedRolls: savageAttackerDiscarded,
        causedByEventId: damageRolled.id,
      }]
    : [];

  const rawDamageTotal = damageRolls.reduce((s, v) => s + v, 0) + damageRollPayload.modifier;
  // Slice 678: enfeebled (Ray of Enfeeblement) halves the base
  // weapon damage of attacks using STR. The flag projects via
  // `HalvesStrengthWeaponDamage` on the bearer's condition. Riders
  // (sneak attack, smite, on-hit damage, fires-burn, frosts-chill)
  // pass through unhalved per the RAW reading "the weapon's damage
  // line is halved" (the bonus-damage riders are not the weapon's
  // damage line).
  const damageTotal =
    attackerEffects.hasHalvesStrengthWeaponDamage() && damageAbility === 'STR'
      ? Math.floor(Math.max(0, rawDamageTotal) / 2)
      : rawDamageTotal;
  // Slice 875: Enlarge/Reduce ±1d4 to the bearer's OWN weapon damage, of the
  // weapon's own damage type. RAW: Enlarge "deal an extra 1d4 damage on a hit";
  // Reduce "deal 1d4 less damage on a hit (this can't reduce the damage below
  // 1)". Rolled here (deterministic on replay; the loop is empty — and so
  // draws no RNG — for a normal-size attacker, keeping every existing attack
  // byte-identical), folded into the weapon component. The delta dice are NOT
  // crit-doubled (a minor deferral); a reduction floors the component at 1.
  let sizeDelta = 0;
  let sizeReduces = false;
  for (const d of attackerEffects.weaponDamageDeltas()) {
    const parsedDelta = parseDiceExpression(d.dice);
    let rolled = parsedDelta.modifier;
    for (let i = 0; i < parsedDelta.count; i += 1) rolled += rollDie(parsedDelta.die, rng, 'damage');
    if (d.mode === 'add') sizeDelta += rolled;
    else {
      sizeDelta -= rolled;
      sizeReduces = true;
    }
  }
  const weaponComponentAmount = Math.max(sizeReduces ? 1 : 0, damageTotal + sizeDelta);
  const rawComponents: { amount: number; type: typeof weaponDef.damageType }[] = [
    { amount: weaponComponentAmount, type: effectiveDamageType },
  ];
  if (extraDamageRoll !== undefined) {
    const extraTotal = extraDamageRoll.rolls.reduce((s, v) => s + v, 0) + extraDamageRoll.modifier;
    rawComponents.push({ amount: Math.max(0, extraTotal), type: extraDamageRoll.type });
  }
  for (const rider of onHitRiderRolls) {
    const riderTotal = rider.rolls.reduce((s, v) => s + v, 0) + rider.modifier;
    rawComponents.push({ amount: Math.max(0, riderTotal), type: rider.type });
  }
  // Slice 555: fold Fire's Burn damage into rawComponents so it flows
  // through mitigation (resistance / immunity / vulnerability apply).
  if (firesBurnRoll !== undefined) {
    const fbTotal = firesBurnRoll.rolls.reduce((s, v) => s + v, 0) + firesBurnRoll.modifier;
    rawComponents.push({ amount: Math.max(0, fbTotal), type: firesBurnRoll.type });
  }
  // Slice 556: fold Frost's Chill cold damage into rawComponents
  // (mitigation applies — cold resistance halves it per RAW).
  if (frostsChillRoll !== undefined) {
    const fcTotal = frostsChillRoll.rolls.reduce((s, v) => s + v, 0) + frostsChillRoll.modifier;
    rawComponents.push({ amount: Math.max(0, fcTotal), type: frostsChillRoll.type });
  }
  const attackIsMagical = isMagicWeaponAttack(
    weaponInstance,
    weaponDef,
    attackerEffects.hasUnarmedAsMagical(),
  );
  const mitigatedComponents = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents,
    characters: state.characters,
    sourceIsMagical: attackIsMagical,
  });
  // Slice 111: simulate prior-rider damage so the Death Ward intercept
  // sees the target's HP at the moment the main damage event commits.
  // Without applyAll here, a rider that dropped the target's HP to a
  // sliver would still be ignored when scaling the main damage.
  const stateBeforeMainDamage = applyAll(state, [attackRolled, ...attackTriggers, damageRolled]);
  const intercept = interceptFatalDamage({
    state: stateBeforeMainDamage,
    content,
    targetId: input.targetId,
    mitigatedComponents,
    causedByEventId: damageRolled.id,
    at,
    rng,
    critical,
  });
  const damageApplied: DamageAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'DamageApplied',
    targetId: input.targetId,
    components: intercept.components,
    causedByEventId: damageRolled.id,
    // Slice 349: attribute the attack's damage to the attacker so
    // DamageApplied riders can gate on "you dealt this" (Dark One's
    // Blessing's `event.sourceIsSelf`). Previously unset on weapon
    // attacks; the spell / trap damage emitters already set it.
    sourceCharacterId: input.attackerId as ULID,
  };
  // Slice 621: pass post-rider state so the helper sees (a) whether a
  // rider (Hex / Hunter's Mark) already broke concentration -- skip the
  // duplicate save -- and (b) the target's post-rider HP, so "main
  // damage drops to 0" classifies as 'unconscious' not 'failedSave'.
  const targetAfterRiders = stateBeforeMainDamage.characters[input.targetId] ?? target;
  const concentrationBreak = planConcentrationOnDamage(
    stateBeforeMainDamage,
    content,
    rng,
    targetAfterRiders,
    intercept.components,
    damageApplied.id,
    at,
  );
  // Slice 233: dispatch triggers on DamageApplied for OnEvent riders
  // that watch incoming damage (Troll's Loathsome Limbs spawns a
  // Troll Limb on 15+ slashing damage). Run after applying the
  // damage so any triggered effects see post-damage state.
  const stateAfterDamage = applyAll(stateAfterAttack, [damageRolled, damageApplied]);
  const damageTriggers = dispatchTriggers({
    state: stateAfterDamage,
    content,
    rng,
    event: damageApplied,
    at,
  });

  // On-hit condition riders, resolved after the damage chain (the hit
  // lands, then the rider resolves). Only riders whose `condition` gate
  // already passed (filtered into applicableRiders above) reach here.
  // Two shapes:
  //   - slice 319 save: roll a save (RNG in the planner so replay stays
  //     deterministic); on failure apply `conditionOnFail`.
  //   - slice 321 applyConditionId: apply the condition unconditionally
  //     (no save) — the 2024 poison-bite shape (Couatl's Bite).
  const onHitRiderEvents: Event[] = [];
  // Slice 484: read the rider condition's declarative `autoExpiry`
  // metadata and stamp `expiresOnRound` + `expiryTrigger` when inside an
  // active encounter so `planAdvanceTurn` lifts the condition at the
  // matching boundary. Mirrors the cast-spell.ts treatment for spell
  // buffs. Outside an encounter the stamping is skipped and the consumer
  // manages expiry (existing slice-286 behavior). Conditions without
  // autoExpiry are unaffected.
  const currentEncounterRound = state.activeEncounterId
    ? state.encounters[state.activeEncounterId]?.round
    : undefined;
  const applyRiderCondition = (conditionId: string): void => {
    const autoExpiry = content.conditions.get(conditionId)?.autoExpiry;
    const expiryFields: {
      expiresOnRound?: number;
      expiryTrigger?: 'turnStart' | 'turnEnd';
    } = autoExpiry !== undefined && currentEncounterRound !== undefined
      ? {
          expiresOnRound: currentEncounterRound + autoExpiry.afterRounds,
          expiryTrigger: autoExpiry.trigger,
        }
      : {};
    onHitRiderEvents.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: input.targetId as ULID,
      conditionId,
      appliedConditionId: newAppliedConditionId(),
      sourceCharacterId: input.attackerId as ULID,
      ...expiryFields,
    } satisfies ConditionAppliedEvent);
  };
  const destroyTarget = (): void => {
    onHitRiderEvents.push({
      id: newEventId() as ULID,
      at,
      type: 'CreatureDestroyed',
      targetId: input.targetId as ULID,
      sourceCharacterId: input.attackerId as ULID,
    } satisfies CreatureDestroyedEvent);
  };
  // Slice 323/325: HP threshold gates (save-gated destroy and the
  // unconditional destroy arm) read the target's HP AFTER this hit's
  // full damage chain — including the rider's own extra-damage component.
  const postDamageHp = stateAfterDamage.characters[input.targetId]?.hp.current ?? 0;
  const hpWithin = (threshold: number | undefined): boolean =>
    threshold === undefined || postDamageHp <= threshold;
  for (const rider of applicableRiders) {
    if (rider.save !== undefined) {
      const save = rider.save;
      // Slice 323: the save fires only inside its HP threshold (Mace of
      // Disruption: target has <= 25 HP after the radiant rider).
      if (hpWithin(save.hpThreshold)) {
        const saveResult = rollSaveAgainstDC({
          state,
          content,
          targetId: input.targetId,
          ability: save.ability,
          dc: save.dc,
          sourceIsMagical: save.sourceIsMagical ?? false,
          rng,
          at,
        });
        if (saveResult !== undefined) {
          onHitRiderEvents.push(saveResult.event);
          if (saveResult.success) {
            if (save.conditionOnSuccess !== undefined) applyRiderCondition(save.conditionOnSuccess);
          } else if (save.destroyOnFail === true) {
            destroyTarget();
          } else if (save.conditionOnFail !== undefined) {
            applyRiderCondition(save.conditionOnFail);
          }
        }
      }
    }
    if (rider.applyConditionId !== undefined) applyRiderCondition(rider.applyConditionId);
    // Slice 325: unconditional (no-save) destroy arm (Mace of Smiting's
    // Construct destroy when post-damage HP is at or below the threshold).
    if (rider.destroy !== undefined && hpWithin(rider.destroy.hpThreshold)) destroyTarget();
  }

  // Slice 556: Frost's Chill applies the speed-reduction condition on
  // hit (reuses the same applyRiderCondition helper above so the
  // autoExpiry on the condition lifts the slow at the start of the
  // attacker's next turn — the condition's sourceCharacterId is set
  // to the attacker, matching how `expiresOnRound + turnStart` resolves).
  if (frostsChillRoll !== undefined) {
    applyRiderCondition('frosts-chill-slowed');
  }
  // Slice 557: Hill's Tumble applies Prone on hit. The Large-or-
  // smaller gate was already enforced pre-attack; if we got here on
  // a hit, the target qualifies. Reuses the same applyRiderCondition
  // helper for source attribution; `prone` carries no autoExpiry, so
  // it persists until the target spends half their movement to stand.
  if (input.useGiantAncestryHillsTumble === true) {
    applyRiderCondition('prone');
  }

  // Slice 555: Fire's Burn consumes 1 giant-ancestry use ONLY on hit
  // (RAW "When you hit a target with an attack roll and deal damage
  // to it"). The miss path returns early at line 1038-1040, so this
  // branch is reached only when hit=true.
  const firesBurnResource: ReadonlyArray<Event> = firesBurnRoll !== undefined
    ? [{
        id: newEventId() as ULID,
        at,
        type: 'ResourceSpent',
        characterId: input.attackerId as ULID,
        resourceId: GIANT_ANCESTRY_RESOURCE_ID,
        amount: 1,
      }]
    : [];
  // Slice 556: Frost's Chill same — 1 use of giant-ancestry on hit.
  const frostsChillResource: ReadonlyArray<Event> = frostsChillRoll !== undefined
    ? [{
        id: newEventId() as ULID,
        at,
        type: 'ResourceSpent',
        characterId: input.attackerId as ULID,
        resourceId: GIANT_ANCESTRY_RESOURCE_ID,
        amount: 1,
      }]
    : [];
  // Slice 557: Hill's Tumble same — 1 use of giant-ancestry on hit.
  const hillsTumbleResource: ReadonlyArray<Event> = input.useGiantAncestryHillsTumble === true
    ? [{
        id: newEventId() as ULID,
        at,
        type: 'ResourceSpent',
        characterId: input.attackerId as ULID,
        resourceId: GIANT_ANCESTRY_RESOURCE_ID,
        amount: 1,
      }]
    : [];

  // Slice 832: undead Life Drain (Specter / Wraith). The weapon's damage also
  // reduces the target's Hit Point maximum by the amount taken (post-mitigation
  // sum), via the shared `planLifeDrainEvents` helper (slice 834 extracted it
  // for the Wight save-action's matching arm).
  const lifeDrainEvents: Event[] = weaponDef.drainsMaxHp === true
    ? planLifeDrainEvents(
        state,
        input.targetId,
        input.attackerId,
        intercept.components.reduce((sum, c) => sum + c.amount, 0),
        at,
      )
    : [];

  // Slice 835: undead ability-score drain (the Shadow's Draining Swipe). On a
  // hit, roll the drain dice and reduce the target's ability; RAW the target
  // DIES if the drain reduces the score to 0 (base score − cumulative drain).
  // Only a `drainsAbility` weapon (the Shadow) reaches this, so existing
  // attacks consume no extra RNG and are byte-unchanged.
  const abilityDrainEvents: Event[] = ((): Event[] => {
    const spec = weaponDef.drainsAbility;
    if (spec === undefined) return [];
    const rolled = rollExpression(spec.dice, rng).total;
    if (rolled <= 0) return [];
    const events: Event[] = [{
      id: newEventId() as ULID,
      at,
      type: 'AbilityScoreDrained',
      targetId: input.targetId as ULID,
      ability: spec.ability,
      amount: rolled,
      sourceCharacterId: input.attackerId as ULID,
    } satisfies AbilityScoreDrainedEvent];
    const existingDrain = target.abilityDrain?.[spec.ability] ?? 0;
    if (target.abilityScores[spec.ability] - (existingDrain + rolled) <= 0) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'CreatureDestroyed',
        targetId: input.targetId as ULID,
        sourceCharacterId: input.attackerId as ULID,
      } satisfies CreatureDestroyedEvent);
    }
    return events;
  })();

  return [
    damageRolled,
    ...savageAttackerEvent,
    damageApplied,
    ...firesBurnResource,
    ...frostsChillResource,
    ...hillsTumbleResource,
    ...damageTriggers,
    ...onHitRiderEvents,
    ...lifeDrainEvents,
    ...abilityDrainEvents,
    ...intercept.extraEvents,
    ...concentrationBreak,
  ];
};

// Slice 754: the bundled composer — byte-identical to the pre-slice
// monolith. planAttack + planMultiattack call this.
export const resolveAttack = (input: ResolveAttackInput): ReadonlyArray<Event> => {
  const result = resolveAttackRollPhase(input);
  return result.hit ? [...result.events, ...resolveAttackDamage(result.ctx)] : result.events;
};

/**
 * Throws if the attacker can't physically reach the target with the
 * given weapon, given both combatants' current positions on the
 * active encounter. Skipped when either side has no position set —
 * preserves out-of-encounter / unpositioned-combatant test fixtures
 * that have always relied on the engine not caring about geometry.
 *
 * Melee weapons: Chebyshev distance ≤ 5 ft, or ≤ 10 ft if the weapon
 * has the `reach` property.
 * Ranged weapons (including thrown daggers with rangeNormal set): the
 * 2024 hard cap is the weapon's long range; in the band between
 * normal and long, the engine should impose disadvantage, but that's
 * an additional fix — for now we only reject the impossible.
 */
const assertWeaponInRange = (
  state: CampaignState,
  content: ResolvedContent,
  intent: AttackIntent,
): void => {
  const encounter = state.activeEncounterId
    ? state.encounters[state.activeEncounterId]
    : undefined;
  if (!encounter) return;
  const attackerCb = encounter.combatants.find((c) => c.combatantId === intent.attackerId);
  const targetCb = encounter.combatants.find((c) => c.combatantId === intent.targetId);
  if (!attackerCb?.position || !targetCb?.position) return;

  const weaponInstance = state.itemInstances[intent.weaponInstanceId];
  if (!weaponInstance) return;
  const weaponDef = content.items.get(weaponInstance.definitionId);
  if (!weaponDef || weaponDef.itemKind !== 'weapon') return;

  const attackerName = state.characters[intent.attackerId]?.name ?? intent.attackerId;
  const distance = chebyshevDistance(attackerCb.position, targetCb.position);

  if (weaponDef.attackKind === 'melee') {
    const maxReach = weaponDef.properties.includes('reach')
      ? REACH_PROPERTY_FEET
      : DEFAULT_MELEE_REACH_FEET;
    if (distance > maxReach) {
      throw new Error(
        `${attackerName}'s ${weaponDef.name} can't reach: target is ${distance}ft away (reach ${maxReach}ft)`,
      );
    }
    return;
  }

  // attackKind === 'ranged': cap at the weapon's long range if set,
  // otherwise normal range. RAW disadvantage in the (normal, long]
  // band is deferred to a follow-up fix.
  const cap = weaponDef.rangeLong ?? weaponDef.rangeNormal;
  if (cap === undefined) return; // No range data — leave unenforced.
  if (distance > cap) {
    throw new Error(
      `${attackerName}'s ${weaponDef.name} can't reach: target is ${distance}ft away (max ${cap}ft)`,
    );
  }
};

// Slice 754: the handle returned by planAttackRoll. `events` are the
// committed roll-phase events (action-economy prelude + the attack roll);
// `tail` is the post-attack record (WeaponLoaded) that fires even when a
// reaction prevents the damage (the weapon was still fired); `phase` is the
// continuation passed to planAttackDamage; `hit`/`attackRolled` are
// surfaced for the consumer's reaction window.
export interface AttackRollHandle {
  readonly hit: boolean;
  readonly attackRolled: AttackRolledEvent | undefined;
  readonly tail: ReadonlyArray<Event>;
  readonly phase: AttackRollResult;
}

// Phase 1 of a two-phase attack: the action-economy prelude + range / LoS /
// loading gates + the attack roll. Returns the roll-phase events to commit
// and an opaque handle to resume with planAttackDamage after a reaction
// window. Composed by planAttack (below) into the byte-identical bundled form.
export const planAttackRoll = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: AttackIntent,
): { readonly events: ReadonlyArray<Event>; readonly roll: AttackRollHandle } => {
  const attacker = state.characters[intent.attackerId];
  if (attacker) assertActorCanAct(attacker, 'Attack');
  // RAW Appendix "Charmed": "the charmed creature can't attack the
  // charmer or target the charmer with harmful Abilities or magical
  // Effects." If the attacker carries a Charmed condition sourced by
  // the intended target, reject.
  if (attacker !== undefined) {
    const charmedBy = attacker.appliedConditions.find(
      (c) => c.conditionId === 'charmed' && c.sourceCharacterId === intent.targetId,
    );
    if (charmedBy !== undefined) {
      const targetName = state.characters[intent.targetId]?.name ?? intent.targetId;
      throw new Error(
        `${attacker.name} is Charmed by ${targetName} and cannot attack them`,
      );
    }
  }
  // RAW Equipment "Loading": a weapon with the Loading property can
  // fire only one piece of ammunition per attack action / bonus action
  // / reaction (regardless of Extra Attack / multiattack). Block the
  // second attempt with the same Loading weapon in the same turn.
  // Tracked on Combatant.turnUsage.loadedWeaponsFiredThisTurn; reset
  // on TurnStarted alongside the other per-turn flags.
  const encounter = state.activeEncounterId
    ? state.encounters[state.activeEncounterId]
    : undefined;
  const attackerCb = encounter?.combatants.find((c) => c.combatantId === intent.attackerId);
  const weaponInstance = state.itemInstances[intent.weaponInstanceId];
  const weaponDef = weaponInstance
    ? content.items.get(weaponInstance.definitionId)
    : undefined;
  const weaponIsLoading =
    weaponDef?.itemKind === 'weapon' && weaponDef.properties.includes('loading');
  if (
    weaponIsLoading &&
    attackerCb?.turnUsage.loadedWeaponsFiredThisTurn.includes(intent.weaponInstanceId)
  ) {
    throw new Error(
      `${attacker?.name ?? intent.attackerId} cannot fire ${weaponDef?.name ?? 'this Loading weapon'} again this turn (Loading property)`,
    );
  }
  const economyPrelude = planActionEconomyForAttack(state, content, intent);
  assertWeaponInRange(state, content, intent);
  // Slice 685: line-of-sight gate. No-op when the spatial context
  // can't be resolved (positionless / map-less encounters); throws
  // when a wall / closed door blocks the Bresenham ray between
  // attacker and target. Range is already gated above; this only
  // adds the LoS check.
  assertLineOfSightForAttack(
    state,
    intent.attackerId,
    intent.targetId,
    attacker?.name ?? intent.attackerId,
    weaponDef?.name ?? 'this weapon',
  );
  const at = intent.at ?? nowIso();
  const phase = resolveAttackRollPhase({
    state,
    content,
    rng,
    attackerId: intent.attackerId,
    targetId: intent.targetId,
    weaponInstanceId: intent.weaponInstanceId,
    ...(intent.cover !== undefined ? { cover: intent.cover } : {}),
    ...(intent.advantage !== undefined ? { advantage: intent.advantage } : {}),
    ...(intent.bearerCanSeeFearSource !== undefined
      ? { bearerCanSeeFearSource: intent.bearerCanSeeFearSource }
      : {}),
    ...(intent.targetCanSeeAttacker !== undefined
      ? { targetCanSeeAttacker: intent.targetCanSeeAttacker }
      : {}),
    ...(intent.attackerCanSeeTarget !== undefined
      ? { attackerCanSeeTarget: intent.attackerCanSeeTarget }
      : {}),
    ...(intent.attackerHasAllyAdjacentToTarget !== undefined
      ? { attackerHasAllyAdjacentToTarget: intent.attackerHasAllyAdjacentToTarget }
      : {}),
    ...(intent.attackerHasHostileAdjacent !== undefined
      ? { attackerHasHostileAdjacent: intent.attackerHasHostileAdjacent }
      : {}),
    ...(intent.lightLevel !== undefined ? { lightLevel: intent.lightLevel } : {}),
    ...(intent.cunningStrike !== undefined ? { cunningStrike: intent.cunningStrike } : {}),
    ...(intent.useSavageAttacker === true ? { useSavageAttacker: true } : {}),
    ...(intent.useGiantAncestryFiresBurn === true ? { useGiantAncestryFiresBurn: true } : {}),
    ...(intent.useGiantAncestryFrostsChill === true ? { useGiantAncestryFrostsChill: true } : {}),
    ...(intent.useGiantAncestryHillsTumble === true ? { useGiantAncestryHillsTumble: true } : {}),
    ...(intent.chargedAtTarget === true ? { chargedAtTarget: true } : {}),
    ...(intent.abilityOverride !== undefined ? { abilityOverride: intent.abilityOverride } : {}),
    ...(intent.unarmedStrikeAsForce === true ? { unarmedStrikeAsForce: true } : {}),
    at,
  });
  // If we fired a Loading weapon, append a WeaponLoaded event so the
  // reducer records it in turnUsage. Second attempt this turn will
  // hit the guard above. (Belongs to the roll: the weapon fired even if
  // a reaction then prevents the damage — surfaced on the handle's `tail`.)
  const tail: Event[] = [];
  if (weaponIsLoading && encounter !== undefined) {
    tail.push({
      id: newEventId() as ULID,
      at,
      type: 'WeaponLoaded',
      encounterId: encounter.id,
      combatantId: intent.attackerId,
      weaponInstanceId: intent.weaponInstanceId,
    });
  }
  return {
    events: [...economyPrelude, ...phase.events],
    roll: {
      hit: phase.hit,
      attackRolled: phase.hit ? phase.attackRolled : undefined,
      tail,
      phase,
    },
  };
};

// Phase 2 of a two-phase attack: the damage chain, run only if the hit
// stands (the consumer may have prevented it via a reaction, in which case
// it doesn't call this). The loading-weapon `tail` is appended either way.
export const planAttackDamage = (roll: AttackRollHandle): { readonly events: ReadonlyArray<Event> } => ({
  events: roll.phase.hit
    ? [...resolveAttackDamage(roll.phase.ctx), ...roll.tail]
    : [...roll.tail],
});

// Bundled attack — byte-identical to the pre-slice monolith. planAttack =
// roll then damage; this is what the `Attack` intent + multiattack use.
export const planAttack = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: AttackIntent,
): ReadonlyArray<Event> => {
  const { events, roll } = planAttackRoll(state, content, rng, intent);
  return [...events, ...planAttackDamage(roll).events];
};

const CLEAVE_TRIGGER_ID = 'mastery:cleave';

export interface CleaveIntent {
  readonly type: 'Cleave';
  readonly attackerId: string;
  readonly secondaryTargetId: string;
  readonly weaponInstanceId: string;
  readonly triggeringAttackEventId: string;
  readonly at?: string;
}

/**
 * RAW 2024 Cleave: after hitting a creature with a melee attack using a
 * weapon with the Cleave mastery, the attacker may attack a second
 * creature within 5 ft of the first (also within reach). The second
 * attack uses the same weapon; on a hit it deals the weapon's damage,
 * but the attacker doesn't add their ability modifier to that damage
 * unless the modifier is negative. Once per turn.
 *
 * The consumer calls this AFTER the triggering attack has been planned
 * and committed (so they know it hit). The engine validates that the
 * weapon has Cleave mastery and that Cleave hasn't already been used
 * this turn (via the `mastery:cleave` trigger counter).
 *
 * The 5-ft adjacency check is not enforced — the engine doesn't always
 * know primary-target position. The consumer is responsible for picking
 * a legal secondary target.
 */
export const planCleave = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CleaveIntent,
): ReadonlyArray<Event> => {
  const attacker = state.characters[intent.attackerId];
  if (!attacker) throw new Error(`Unknown attacker ${intent.attackerId}`);
  const weaponInstance = state.itemInstances[intent.weaponInstanceId];
  if (!weaponInstance) throw new Error(`Unknown weapon ${intent.weaponInstanceId}`);
  const weaponDef = content.items.get(weaponInstance.definitionId);
  if (!weaponDef || weaponDef.itemKind !== 'weapon') {
    throw new Error(`Item ${weaponInstance.definitionId} is not a weapon`);
  }
  if (weaponDef.mastery !== 'Cleave') {
    throw new Error(`Weapon ${weaponDef.name} does not have the Cleave mastery`);
  }
  // Slice 502: RAW gate — the attacker may use Cleave only if they chose
  // this weapon kind for the Weapon Mastery feature and are proficient.
  if (!canUseWeaponMastery(attacker, weaponDef, content)) {
    throw new Error(`${attacker.name} has not mastered ${weaponDef.name} (Cleave)`);
  }
  if (weaponDef.attackKind !== 'melee') {
    throw new Error('Cleave requires a melee weapon');
  }
  if (attacker.triggerCounters[CLEAVE_TRIGGER_ID]?.firedThisTurn === true) {
    throw new Error('Cleave already used this turn');
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const resolution = resolveAttack({
    state,
    content,
    rng,
    attackerId: intent.attackerId,
    targetId: intent.secondaryTargetId,
    weaponInstanceId: intent.weaponInstanceId,
    at,
  });

  // Strip the attacker's ability modifier from the DamageRolled and
  // DamageApplied events on the cleave hit, per RAW. Keep negative
  // ability modifiers (a -1 STR penalty still applies). Slice 229:
  // honor the OverrideAbilityScore floor so cleave's strip matches
  // whatever the primary hit used (Gauntlets of Ogre Power etc.).
  const damageAbility = chooseDamageAbility(attacker, weaponDef);
  const cleaveAttackerEffects = buildEffectStack({
    character: attacker,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  const cleaveBaseScore = attacker.abilityScores[damageAbility];
  const cleaveScoreFloor = cleaveAttackerEffects.effectiveAbilityScoreFloor(damageAbility)?.value;
  const cleaveScoreIncrease = cleaveAttackerEffects.effectiveAbilityScoreIncrease(damageAbility);
  // Slice 835: a drained attack ability lowers cleave damage too.
  const abilityMod = abilityModifier(effectiveAbilityScore(cleaveBaseScore, cleaveScoreFloor, cleaveScoreIncrease, attacker.abilityDrain?.[damageAbility]));
  // Slice 450: if the weapon already suppresses the ability fold on
  // its base damage, there's nothing to strip on the cleave (otherwise
  // we'd over-subtract and drive damage negative).
  const abilityModToStrip = weaponDef.noAbilityModifierDamage === true
    ? 0
    : abilityMod > 0 ? abilityMod : 0;

  for (const evt of resolution) {
    if (evt.type === 'DamageRolled' && abilityModToStrip > 0) {
      const adjusted = {
        ...evt,
        rolls: evt.rolls.map((r) => ({
          ...r,
          modifier: r.modifier - abilityModToStrip,
        })),
      };
      events.push(adjusted);
    } else if (evt.type === 'DamageApplied' && abilityModToStrip > 0) {
      // Reduce each mitigated component by the proportion attributable
      // to the ability modifier. Simplest correct treatment: subtract
      // the ability mod from the *first* component (representing the
      // weapon's primary damage type) and clamp to 0. Multi-type damage
      // from Cleave is rare — the mastery is on weapons that deal a
      // single damage type — so this is fine in practice.
      const components = [...evt.components];
      const first = components[0];
      if (first !== undefined) {
        const reduced = Math.max(0, first.amount - abilityModToStrip);
        components[0] = { ...first, amount: reduced };
      }
      events.push({ ...evt, components });
    } else {
      events.push(evt);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'TriggerFired',
    characterId: intent.attackerId,
    triggerId: CLEAVE_TRIGGER_ID,
    cadence: { firedThisTurn: true },
    causedByEventId: intent.triggeringAttackEventId as ULID,
  });

  return events;
};

const findActiveCombatant = (
  state: CampaignState,
  attackerId: string,
): { encounterId: string; attacksMadeThisTurn: number; actionUsed: boolean } | undefined => {
  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) return undefined;
  const encounter = state.encounters[encounterId];
  if (!encounter || encounter.status !== 'active') return undefined;
  const active = encounter.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== attackerId) return undefined;
  return {
    encounterId,
    attacksMadeThisTurn: active.turnUsage.attacksMadeThisTurn,
    actionUsed: active.turnUsage.actionUsed,
  };
};

const planActionEconomyForAttack = (
  state: CampaignState,
  content: ResolvedContent,
  intent: AttackIntent,
): ReadonlyArray<Event> => {
  const attacker = state.characters[intent.attackerId];
  if (!attacker) return [];
  const active = findActiveCombatant(state, intent.attackerId);
  if (active === undefined) return [];

  const budget = computeActionEconomyBudget({
    character: attacker,
    itemInstances: state.itemInstances,
    content,
    characters: state.characters,
  });

  if (active.actionUsed && active.attacksMadeThisTurn === 0) {
    throw new Error(
      `${attacker.name} has already used their action this turn (Dodge/Dash/Disengage/Cast Spell); cannot also Attack`,
    );
  }
  if (active.attacksMadeThisTurn >= budget.maxAttacksPerAction) {
    throw new Error(
      `Attack budget exhausted: ${attacker.name} has already made ${active.attacksMadeThisTurn} attacks this turn (max ${budget.maxAttacksPerAction})`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: ActionEconomyConsumedEvent[] = [];
  if (!active.actionUsed) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: active.encounterId,
      combatantId: intent.attackerId,
      kind: 'action',
    });
  }
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: active.encounterId,
    combatantId: intent.attackerId,
    kind: 'attack',
  });
  return events;
};
