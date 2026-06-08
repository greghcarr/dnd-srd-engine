import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type {
  AttackRolledEvent,
  DamageRolledEvent,
  DamageRoll,
} from '../../schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag } from './_halfling-luck.js';
import { applyMartialArtsDieScaling, tryBuildDeflectedAttack } from './attack.js';
import { findMirrorImage } from '../../derive/mirror-image.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { computeAttackBonus } from '../../derive/attack.js';
import { computeAC } from '../../derive/ac.js';
import { abilityModifier } from '../../derive/ability.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { isMagicWeaponAttack } from '../../derive/magicality.js';
import { canUseWeaponMastery } from '../../derive/weapon-mastery.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import { applyAll } from '../apply.js';
import { planConcentrationOnDamage } from './concentration.js';
import { resolveAttackRoll } from './_attack-roll.js';
import { D20_SIDES, NAT_20, NAT_1 } from '../../internal/constants.js';
import type { ULID } from '../ids-utils.js';
import { assertActorCanAct } from './_actor-state.js';

export interface OffHandAttackIntent {
  readonly type: 'OffHandAttack';
  readonly attackerId: string;
  readonly targetId: string;
  readonly weaponInstanceId: string;
  // Slice 735: Monk L6 Empowered Strikes — opt a bonus-action unarmed
  // strike into Force damage (gated on `GrantUnarmedForceOption` + an
  // unarmed-strike weapon). Inert without the feature.
  readonly unarmedStrikeAsForce?: boolean;
  readonly at?: string;
}

// Slice 735: the synthetic unarmed-strike weapon definition id.
const UNARMED_STRIKE_DEF_ID = 'unarmed-strike';

const findActiveEncounter = (
  state: CampaignState,
  attackerId: string,
): { encounterId: string; bonusActionUsed: boolean } | undefined => {
  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) return undefined;
  const encounter = state.encounters[encounterId];
  if (!encounter || encounter.status !== 'active') return undefined;
  const active = encounter.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== attackerId) return undefined;
  return { encounterId, bonusActionUsed: active.turnUsage.bonusActionUsed };
};

export const planOffHandAttack = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: OffHandAttackIntent,
): ReadonlyArray<Event> => {
  const attacker = state.characters[intent.attackerId];
  if (!attacker) throw new Error(`Unknown attacker ${intent.attackerId}`);
  assertActorCanAct(attacker, 'Off-hand Attack');
  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);
  const weaponInstance = state.itemInstances[intent.weaponInstanceId];
  if (!weaponInstance) throw new Error(`Unknown weapon ${intent.weaponInstanceId}`);
  const weaponDef = content.items.get(weaponInstance.definitionId);
  if (!weaponDef || weaponDef.itemKind !== 'weapon') {
    throw new Error(`Item ${weaponInstance.definitionId} is not a weapon`);
  }
  if (!weaponDef.properties.includes('light')) {
    throw new Error(`Off-hand attacks require a 'light' weapon; ${weaponDef.name} is not light`);
  }

  const active = findActiveEncounter(state, intent.attackerId);
  if (active === undefined) {
    throw new Error('Off-hand attack requires being the active combatant in an active encounter');
  }
  // Nick mastery: the off-hand attack becomes part of the Attack action
  // instead of a Bonus Action, once per turn. RAW 2024.
  const NICK_TRIGGER_ID = 'mastery:nick';
  // Slice 502: Nick applies only if the attacker mastered this weapon
  // kind (and is proficient). Without it the off-hand attack still
  // happens but costs the Bonus Action as normal (graceful, not a throw).
  const nickAvailable =
    weaponDef.mastery === 'Nick' &&
    canUseWeaponMastery(attacker, weaponDef, content) &&
    (attacker.triggerCounters[NICK_TRIGGER_ID]?.firedThisTurn !== true);
  if (!nickAvailable && active.bonusActionUsed) {
    throw new Error('Bonus action already used this turn');
  }

  const at = intent.at ?? nowIso();

  const economyEvents: Event[] = [];
  if (nickAvailable) {
    // Use Nick: no bonus action consumed; mark the once-per-turn slot used.
    economyEvents.push({
      id: newEventId() as ULID,
      at,
      type: 'TriggerFired',
      characterId: intent.attackerId,
      triggerId: NICK_TRIGGER_ID,
      cadence: { firedThisTurn: true },
    });
  } else {
    economyEvents.push({
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: active.encounterId,
      combatantId: intent.attackerId,
      kind: 'bonusAction',
    } satisfies ActionEconomyConsumedEvent);
  }

  const attackBonusResult = computeAttackBonus({
    character: attacker,
    itemInstances: state.itemInstances,
    content,
    weaponInstanceId: intent.weaponInstanceId,
    characters: state.characters,
  });
  const acResult = computeAC({
    character: target,
    itemInstances: state.itemInstances,
    content,
    characters: state.characters,
  });
  // Slice 124: Mirror Image deflection. Off-hand attacks against a
  // warded bearer roll the deflection d20 first; on success the
  // attack rolls against the duplicate AC and emits no damage chain.
  // Slice 127: same RAW vision-gate as the main attack path.
  const attackerEffects = buildEffectStack({
    character: attacker,
    itemInstances: state.itemInstances,
    content,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const attackerBypassesMirrorImage =
    attackerEffects.hasSense('blindsight')
    || attackerEffects.hasSense('truesight')
    || attacker.appliedConditions.some((c) => c.conditionId === 'blinded');
  const mirrorImage = attackerBypassesMirrorImage ? undefined : findMirrorImage(target);
  if (mirrorImage !== undefined) {
    const deflectedEvents = tryBuildDeflectedAttack({
      state,
      content,
      attackerId: intent.attackerId,
      bearerId: intent.targetId,
      weaponInstanceId: intent.weaponInstanceId,
      attackBonus: attackBonusResult.total,
      advantage: 'none',
      attackKind: weaponDef.attackKind,
      rng,
      at,
      mirrorImage,
    });
    if (deflectedEvents !== undefined) return [...economyEvents, ...deflectedEvents];
  }
  // Slice 614: route through the shared resolveAttackRoll helper to
  // pick up the same target-side advantage (Faerie Fire, Restrained,
  // Paralyzed, Prone-melee), attacker-side disadvantage (Blur, Dodge),
  // Bless / Bane bonus dice, extended crit ranges, and Paralyzed/HP-0
  // melee auto-crit that weapon + spell attacks use (slices 602 + 611).
  // Pre-slice the off-hand path rolled a bare d20 with Halfling Luck
  // and no other attack-side condition awareness — same shape as the
  // pre-slice-602 spell-attack gap.
  const targetEffects = buildEffectStack({
    character: target,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const targetSideAttackerFacts = new Map<string, unknown>([
    ['event.attackKind', weaponDef.attackKind],
  ]);
  const targetGrantsAdvantage = targetEffects.grantsAdvantageToAttackers(targetSideAttackerFacts);
  const targetCancelsAdvantage = targetEffects.cancelsAdvantageOnAttackers(new Map([
    ['bearerHasIncapacitated', target.appliedConditions.some((c) => ['incapacitated', 'stunned', 'paralyzed', 'unconscious'].includes(c.conditionId))],
  ]));
  const attackerSideFacts = new Map<string, unknown>([
    ['event.attackKind', weaponDef.attackKind],
    ['event.isOpportunityAttack', false],
    ['bearer.hasIncapacitated', target.appliedConditions.some((c) => ['incapacitated', 'stunned', 'paralyzed', 'unconscious'].includes(c.conditionId))],
    ['bearer.speedZero', target.speedFeet === 0],
    ['bearer.canSeeAttacker', undefined],
  ]);
  const targetImposesDisadvantage = targetEffects.imposesDisadvantageOnAttackers(attackerSideFacts);
  const effectivelyGrantsAdvantage = !targetCancelsAdvantage && targetGrantsAdvantage;
  let advantage: 'none' | 'advantage' | 'disadvantage' = 'none';
  if (effectivelyGrantsAdvantage && targetImposesDisadvantage) advantage = 'none';
  else if (effectivelyGrantsAdvantage) advantage = 'advantage';
  else if (targetImposesDisadvantage) advantage = 'disadvantage';

  // Paralyzed/Unconscious/HP-0 melee auto-crit also fires on off-hand
  // melee attacks (light-weapon melee is what off-hand is).
  const targetAutoCritsFromMelee = ((): boolean => {
    if (weaponDef.attackKind !== 'melee') return false;
    if (target.hp.current <= 0) return true;
    return target.appliedConditions.some(
      (c) => c.conditionId === 'paralyzed'
        || c.conditionId === 'held-paralyzed-active'
        || c.conditionId === 'unconscious',
    );
  })();
  const attackerFacts = new Map<string, unknown>([
    ['event.attackKind', weaponDef.attackKind],
    ['event.isOpportunityAttack', false],
  ]);
  const rollResult = resolveAttackRoll({
    advantage,
    attackBonus: attackBonusResult.total,
    targetAC: acResult.total,
    attackerHasHalflingLuck: attackerEffects.hasHalflingLuck(),
    bonusDiceContributions: attackerEffects.bonusDiceFor('attack', attackerFacts),
    critThreshold: attackerEffects.critThreshold(),
    forceCritIfHit: targetAutoCritsFromMelee,
    rng,
  });
  const rolls = rollResult.rolls;
  const d20 = rollResult.usedRoll;
  const total = rollResult.total;
  const hit = rollResult.hit;
  const critical = rollResult.critical;

  const attackRolled: AttackRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'AttackRolled',
    attackerId: intent.attackerId,
    targetId: intent.targetId,
    weaponInstanceId: intent.weaponInstanceId,
    d20: rolls,
    used: advantage,
    attackBonus: rollResult.effectiveAttackBonus,
    total,
    targetAC: acResult.total,
    hit,
    critical,
    attackKind: weaponDef.attackKind,
  };

  if (!hit) {
    return [...economyEvents, attackRolled];
  }

  // Off-hand attacks do NOT add ability modifier to damage by default
  // (negative mods still apply, since they're a penalty). Slice 119:
  // the Two-Weapon Fighting Fighting Style flips this — when the
  // attacker's effect stack carries `GrantTwoWeaponFighting`, the
  // ability mod is included regardless of sign.
  const strMod = abilityModifier(attacker.abilityScores.STR);
  const dexMod = abilityModifier(attacker.abilityScores.DEX);
  const isFinesse = weaponDef.properties.includes('finesse');
  const abilityMod = isFinesse ? Math.max(strMod, dexMod) : strMod;
  const offHandModifier = attackerEffects.hasTwoWeaponFighting()
    ? abilityMod
    : abilityMod < 0
      ? abilityMod
      : 0;
  const damageExpression = applyMartialArtsDieScaling(attacker, weaponDef, weaponDef.damageDice);
  const parsed = parseDiceExpression(damageExpression);
  const totalRolls = critical ? parsed.count * 2 : parsed.count;
  const damageRolls: number[] = [];
  for (let i = 0; i < totalRolls; i++) {
    damageRolls.push(rollDie(parsed.die, rng));
  }
  // Slice 735: Empowered Strikes Force option on a bonus-action unarmed
  // strike (opt-in + marker + unarmed-strike weapon). Inert by default.
  const effectiveDamageType =
    intent.unarmedStrikeAsForce === true
    && weaponDef.id === UNARMED_STRIKE_DEF_ID
    && attackerEffects.hasUnarmedForceOption()
      ? 'force'
      : weaponDef.damageType;
  const damageRollPayload: DamageRoll = {
    expression: damageExpression,
    rolls: damageRolls,
    modifier: offHandModifier + parsed.modifier,
    type: effectiveDamageType,
  };
  const damageRolled: DamageRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'DamageRolled',
    attackerId: intent.attackerId,
    targetId: intent.targetId,
    weaponInstanceId: intent.weaponInstanceId,
    rolls: [damageRollPayload],
    critical,
    causedByEventId: attackRolled.id,
  };
  const damageTotal = damageRolls.reduce((s, v) => s + v, 0) + damageRollPayload.modifier;
  const mitigated = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount: Math.max(0, damageTotal), type: effectiveDamageType }],
    characters: state.characters,
    sourceIsMagical: isMagicWeaponAttack(weaponInstance, weaponDef, attackerEffects.hasUnarmedAsMagical()),
  });
  const intercept = interceptFatalDamage({
    state: applyAll(state, [...economyEvents, attackRolled, damageRolled]),
    content,
    targetId: intent.targetId,
    mitigatedComponents: mitigated,
    causedByEventId: damageRolled.id,
    at,
  });
  const damageApplied: DamageAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'DamageApplied',
    targetId: intent.targetId,
    components: intercept.components,
    causedByEventId: damageRolled.id,
  };
  const concentrationBreak = planConcentrationOnDamage(
    state,
    content,
    rng,
    target,
    intercept.components,
    damageApplied.id,
    at,
  );

  return [
    ...economyEvents,
    attackRolled,
    damageRolled,
    damageApplied,
    ...intercept.extraEvents,
    ...concentrationBreak,
  ];
};
