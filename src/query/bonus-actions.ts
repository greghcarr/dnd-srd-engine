// Slice 714: bonus-action affordances.
//
// "What bonus-action features can this combatant use right now?" The
// dnd-web duel renders a Bonus Actions menu straight from this list and
// performs a chosen option by id via `engine.plan.useOption` — it never
// reconstructs which planner each feature routes to.
//
// Two halves, one source of truth (the REGISTRY below) so enumeration
// and dispatch can't drift:
//   - `bonusActions(...)` enumerates the options a combatant OWNS, each
//     flagged enabled/disabled with a machine-readable reason. Pure +
//     read-only (mirrors `availableActions`).
//   - `bonusActionIntent(...)` maps an option id (+ optional target) to
//     the intent its dedicated planner expects. `engine.plan.useOption`
//     dispatches that intent through the same plan path as every other
//     action, so dice route through the active RollProvider and the
//     planner re-validates authoritatively.
//
// Scope (slice 714 + 715): the bonus-action features whose planner intent
// is expressible from (combatantId) plus the optional params bag (targetId
// / amount / weaponInstanceId). Covers Second Wind, Rage, Cunning Action,
// Patient Defense / Step of the Wind (± Focus), Bardic Inspiration, Lay on
// Hands (heal + cure-poison), Flurry of Blows, Adrenaline Rush (Orc), and
// Nimble Escape (Goblin).
//
// Deliberately NOT here: Frenzy. Despite the slice-714 note, it is not a
// bonus action — its planner consumes a Rage charge + applies the
// `frenzied` condition (a Rage modifier), emitting no ActionEconomyConsumed.
// It belongs with Rage, not in the Bonus Actions menu.

import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Character } from '../schemas/runtime/character.js';
import type { Position } from '../schemas/runtime/encounter.js';
import { creatureTargetsInReach, type CreatureTargeting, type CreatureTarget } from './_targeting.js';
// The same precondition predictor `availableActions` uses: returns the
// blocking-condition id (incapacitated / stunned / ...) or undefined.
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';
// Reuse each planner's own ownership predicate / allowlist so enumeration
// matches dispatch exactly (no drift between "offered" and "accepted").
import { characterHasCunningAction, type CunningActionMode } from '../engine/plan/cunning-action.js';
import { characterHasNimbleEscape } from '../engine/plan/nimble-escape.js';
import type { SecondWindIntent } from '../engine/plan/second-wind.js';
import type { RageIntent } from '../engine/plan/rage.js';
import { RAGING_CONDITION_ID } from '../engine/plan/rage.js';
import type { CunningActionIntent } from '../engine/plan/cunning-action.js';
import type { PatientDefenseIntent } from '../engine/plan/patient-defense.js';
import type { StepOfTheWindIntent } from '../engine/plan/step-of-the-wind.js';
import type { BardicInspirationIntent } from '../engine/plan/bardic-inspiration.js';
import type { LayOnHandsIntent } from '../engine/plan/lay-on-hands.js';
import type { AdrenalineRushIntent } from '../engine/plan/adrenaline-rush.js';
import type { NimbleEscapeIntent } from '../engine/plan/nimble-escape.js';
import type { FlurryOfBlowsIntent } from '../engine/plan/flurry-of-blows.js';
import type { InnateSorceryIntent } from '../engine/plan/innate-sorcery.js';
import type { OffHandAttackIntent } from '../engine/plan/offhand-attack.js';
import type { CloudsJauntIntent } from '../engine/plan/clouds-jaunt.js';
import type { ConjurePactWeaponIntent } from '../engine/plan/conjure-pact-weapon.js';
import type { SacredWeaponIntent } from '../engine/plan/sacred-weapon.js';
import type { IntimidatingPresenceIntent } from '../engine/plan/intimidating-presence.js';
import { findGoliathAncestryChoice, GIANT_ANCESTRY_RESOURCE_ID } from '../engine/plan/_giant-ancestry.js';
import { buildEffectStack } from '../derive/effect-stack.js';

// ── Named constants ─────────────────────────────────────────────────
const FIGHTER_CLASS_ID = 'fighter';
const BARBARIAN_CLASS_ID = 'barbarian';
const MONK_CLASS_ID = 'monk';
const BARD_CLASS_ID = 'bard';
const PALADIN_CLASS_ID = 'paladin';
const SORCERER_CLASS_ID = 'sorcerer';
const ORC_SPECIES_ID = 'orc';
const MONKS_FOCUS_LEVEL = 2;

const SECOND_WIND_RESOURCE = 'second-wind';
const RAGE_RESOURCE = 'rage';
const KI_RESOURCE = 'ki';
const BARDIC_INSPIRATION_RESOURCE = 'bardic-inspiration';
const LAY_ON_HANDS_RESOURCE = 'lay-on-hands';
const ADRENALINE_RUSH_RESOURCE = 'adrenaline-rush';
const INNATE_SORCERY_RESOURCE = 'innate-sorcery';
const INNATE_SORCERY_ACTIVE_CONDITION = 'innate-sorcery-active';
const WEAPON_LIGHT_PROPERTY = 'light';
const CLOUDS_JAUNT_ANCESTRY = 'clouds-jaunt';
const CHANNEL_DIVINITY_RESOURCE = 'channel-divinity';
const OATH_OF_DEVOTION_SUBCLASS = 'oath-of-devotion';
const SACRED_WEAPON_ACTIVE_CONDITION = 'sacred-weapon-active';
const BERSERKER_SUBCLASS = 'path-of-the-berserker';
const INTIMIDATING_PRESENCE_LEVEL = 14;
const LAY_ON_HANDS_CURE_POISON_COST = 5; // matches CURE_POISON_COST in lay-on-hands.ts
const HEAVY_ARMOR_CATEGORY = 'heavy';

// Targeting ranges (feet). Touch / a Monk's unarmed reach are both 5 ft
// (chebyshev, mirroring the Protection resolver's adjacency check); Bardic
// Inspiration reaches a creature within 60 ft.
const TOUCH_RANGE_FEET = 5;
const UNARMED_REACH_FEET = 5;
const BARDIC_INSPIRATION_RANGE_FEET = 60;

// Machine-readable disabled reasons (mirrors the availableActions style).
const REASON_NOT_YOUR_TURN = 'not-your-turn';
const REASON_BONUS_ACTION_USED = 'bonus-action-used';
const REASON_NO_USES = 'no-uses';
const REASON_NO_FOCUS = 'no-focus';
const REASON_HEAVY_ARMOR = 'heavy-armor';
const REASON_ALREADY_DASHED = 'already-dashed';
const REASON_ALREADY_DISENGAGED = 'already-disengaged';
// Slice 743: Rage is entered once and persists; you don't re-enter it while
// already raging (mirrors planRage's guard).
const REASON_ALREADY_RAGING = 'already-raging';
// Slice 762: a persistent self "active-state" buff (Innate Sorcery) can't be
// re-activated while active (mirrors the planner's already-active throw).
const REASON_ALREADY_ACTIVE = 'already-active';

const DASH_MODE: CunningActionMode = 'dash';
const DISENGAGE_MODE: CunningActionMode = 'disengage';
const HIDE_MODE: CunningActionMode = 'hide';

// ── Public types ────────────────────────────────────────────────────
/** What the option needs the UI to pick: nothing, the caster, or a creature. */
export type BonusActionTargetKind = 'none' | 'self' | 'creature';

export interface BonusActionOption {
  /** Stable id — pass back to `engine.plan.useOption({ optionId })`. */
  readonly id: string;
  readonly label: string;
  readonly target: BonusActionTargetKind;
  readonly enabled: boolean;
  /**
   * Machine-readable reason when `enabled` is false: a blocking-condition
   * id ('incapacitated', 'stunned', ...), or one of 'not-your-turn' /
   * 'bonus-action-used' / 'no-uses' / 'no-focus' / 'heavy-armor' /
   * 'already-dashed' / 'already-disengaged'.
   */
  readonly reason?: string;
  /**
   * Slice 756: does `engine.plan.useOption` need a `params.amount` for this
   * option (a metered heal, e.g. Lay on Hands heal)? When true, `maxAmount`
   * carries the spendable pool.
   */
  readonly requiresAmount: boolean;
  /**
   * Slice 756: the spendable pool for a metered option (present iff
   * `requiresAmount`) — the current value of the option's resource (e.g. the
   * paladin's remaining Lay on Hands points). The UI offers 1..maxAmount;
   * overheal clamping stays engine-side (the planner caps the effective heal).
   */
  readonly maxAmount?: number;
}

/**
 * Slice 756: a legal target for a creature-target bonus-action option, from
 * `bonusActionTargets`. `position` is present when the combatant is placed
 * (feet); absent in positionless encounters. (Alias of the shared
 * `CreatureTarget` since slice 771.)
 */
export type BonusActionTarget = CreatureTarget;

/** The intent union `bonusActionIntent` produces for `useOption` dispatch. */
export type BonusActionIntent =
  | SecondWindIntent
  | RageIntent
  | CunningActionIntent
  | PatientDefenseIntent
  | StepOfTheWindIntent
  | BardicInspirationIntent
  | LayOnHandsIntent
  | AdrenalineRushIntent
  | NimbleEscapeIntent
  | FlurryOfBlowsIntent
  | InnateSorceryIntent
  | OffHandAttackIntent
  | CloudsJauntIntent
  | ConjurePactWeaponIntent
  | SacredWeaponIntent
  | IntimidatingPresenceIntent;

/**
 * Per-option parameters for `bonusActionIntent` / `engine.plan.useOption`.
 * `targetId` for creature-target options; `amount` for metered heals (Lay on
 * Hands); `weaponInstanceId` for strike options (Flurry of Blows); `to` for a
 * teleport (Cloud's Jaunt); `weaponDefinitionId` for a conjuration (Conjure
 * Pact Weapon).
 */
export interface BonusActionParams {
  readonly targetId?: string;
  readonly amount?: number;
  readonly weaponInstanceId?: string;
  readonly to?: Position;
  readonly weaponDefinitionId?: string;
  /** Multiple creatures for a multi-target option (Intimidating Presence). */
  readonly targetIds?: ReadonlyArray<string>;
}

// ── Registry ────────────────────────────────────────────────────────
interface BonusActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly target: BonusActionTargetKind;
  /**
   * Does this character own the feature right now? Usually class / level /
   * species (character alone), but a few options depend on equipped gear
   * (Off-Hand Attack needs a wielded light weapon), so `state` + `content`
   * are passed — most descriptors ignore them.
   */
  readonly owns: (character: Character, state: CampaignState, content: ResolvedContent) => boolean;
  /** Resource consumed; the option disables when current < resourceMin. */
  readonly resourceId?: string;
  readonly resourceMin?: number;
  /** Monk focus variants additionally require a Focus Point (ki). */
  readonly needsFocus?: boolean;
  /** Takes the Dash action — disabled if the combatant already dashed. */
  readonly dashConflict?: boolean;
  /** Takes the Disengage action — disabled if already disengaged. */
  readonly disengageConflict?: boolean;
  /** Extra feature-specific block (e.g. Rage can't start in Heavy armor). */
  readonly extraReason?: (
    character: Character,
    state: CampaignState,
    content: ResolvedContent,
  ) => string | undefined;
  /** Requires `params.amount` (a metered heal, e.g. Lay on Hands heal). */
  readonly requiresAmount?: boolean;
  /** Requires `params.weaponInstanceId` (a strike, e.g. Flurry of Blows). */
  readonly requiresWeapon?: boolean;
  /**
   * Other required params, checked by `bonusActionIntent` (a missing one
   * throws): `to` for a teleport (Cloud's Jaunt), `weaponDefinitionId` for a
   * conjuration (Conjure Pact Weapon).
   */
  readonly requires?: ReadonlyArray<keyof BonusActionParams>;
  /**
   * Targeting rules for a `target: 'creature'` option, consumed by
   * `bonusActionTargets` (the shared `CreatureTargeting`). Every creature-target
   * descriptor MUST set this (enforced by the bonus-actions audit) so the
   * consumer can render a target picker; non-creature options leave it undefined.
   */
  readonly targeting?: CreatureTargeting;
  readonly toIntent: (combatantId: string, params: BonusActionParams) => BonusActionIntent;
}

const hasClass = (character: Character, classId: string): boolean =>
  character.classes.some((c) => c.classId === classId);

const hasClassLevel = (character: Character, classId: string, minLevel: number): boolean =>
  character.classes.some((c) => c.classId === classId && c.level >= minLevel);

const resourceCurrent = (character: Character, resourceId: string): number =>
  character.resources.find((r) => r.resourceId === resourceId)?.current ?? 0;

// Rage's "not while wearing Heavy armor" gate, predicted from the same
// equipped-armor / item-category check the planner throws on.
const heavyArmorReason = (
  character: Character,
  state: CampaignState,
  content: ResolvedContent,
): string | undefined => {
  const armorId = character.equipped.armor;
  if (armorId === undefined) return undefined;
  const instance = state.itemInstances[armorId];
  if (instance === undefined) return undefined;
  const def = content.items.get(instance.definitionId);
  if (def !== undefined && def.itemKind === 'armor' && def.category === HEAVY_ARMOR_CATEGORY) {
    return REASON_HEAVY_ARMOR;
  }
  return undefined;
};

// Slice 743: Rage's block reason — already raging takes precedence over the
// Heavy-armor block (you can't re-enter Rage while it's active; spending a
// second use is illegal). Mirrors planRage's `already raging` throw so the
// dnd-web Bonus Actions menu greys "Rage" with this reason instead of
// burning a Rage use.
const rageReason = (
  character: Character,
  state: CampaignState,
  content: ResolvedContent,
): string | undefined => {
  if (character.appliedConditions.some((c) => c.conditionId === RAGING_CONDITION_ID)) {
    return REASON_ALREADY_RAGING;
  }
  return heavyArmorReason(character, state, content);
};

// Slice 762: Innate Sorcery can't be re-activated while active (mirrors
// planInnateSorcery's throw; the same already-active shape as Rage).
const innateSorceryActiveReason = (character: Character): string | undefined =>
  character.appliedConditions.some((c) => c.conditionId === INNATE_SORCERY_ACTIVE_CONDITION)
    ? REASON_ALREADY_ACTIVE
    : undefined;

// Slice 773: Sacred Weapon can't be re-activated while active (mirrors
// planSacredWeapon's throw; the same already-active shape).
const sacredWeaponActiveReason = (character: Character): string | undefined =>
  character.appliedConditions.some((c) => c.conditionId === SACRED_WEAPON_ACTIVE_CONDITION)
    ? REASON_ALREADY_ACTIVE
    : undefined;

const hasSubclass = (character: Character, classId: string, subclassId: string, minLevel = 1): boolean => {
  const e = character.classes.find((c) => c.classId === classId);
  return e !== undefined && e.level >= minLevel && e.subclassId === subclassId;
};

// Slice 762: Off-Hand Attack is available when the character wields a light
// weapon (the property planOffHandAttack gates on). Equip-state, so `owns`
// reads it from state + content.
const wieldsLightWeapon = (
  character: Character,
  state: CampaignState,
  content: ResolvedContent,
): boolean => {
  for (const instanceId of [character.equipped.mainHand, character.equipped.offHand]) {
    if (instanceId === undefined) continue;
    const instance = state.itemInstances[instanceId];
    const def = instance !== undefined ? content.items.get(instance.definitionId) : undefined;
    if (def?.itemKind === 'weapon' && def.properties.includes(WEAPON_LIGHT_PROPERTY)) return true;
  }
  return false;
};

// Slice 768: Conjure Pact Weapon is owned via the Pact of the Blade invocation
// (the gate planConjurePactWeapon enforces).
const hasPactBlade = (character: Character, state: CampaignState, content: ResolvedContent): boolean =>
  buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  }).hasPactBlade();

const REGISTRY: ReadonlyArray<BonusActionDescriptor> = [
  {
    id: 'second-wind',
    label: 'Second Wind',
    target: 'self',
    owns: (c) => hasClass(c, FIGHTER_CLASS_ID),
    resourceId: SECOND_WIND_RESOURCE,
    toIntent: (id) => ({ type: 'SecondWind', fighterId: id }),
  },
  {
    id: 'rage',
    label: 'Rage',
    target: 'self',
    owns: (c) => hasClass(c, BARBARIAN_CLASS_ID),
    resourceId: RAGE_RESOURCE,
    extraReason: rageReason,
    toIntent: (id) => ({ type: 'Rage', barbarianId: id }),
  },
  {
    id: 'innate-sorcery',
    label: 'Innate Sorcery',
    target: 'self',
    owns: (c) => hasClass(c, SORCERER_CLASS_ID),
    resourceId: INNATE_SORCERY_RESOURCE,
    extraReason: (c) => innateSorceryActiveReason(c),
    toIntent: (id) => ({ type: 'InnateSorcery', characterId: id }),
  },
  {
    id: 'cunning-action-dash',
    label: 'Cunning Action: Dash',
    target: 'none',
    owns: characterHasCunningAction,
    dashConflict: true,
    toIntent: (id) => ({ type: 'CunningAction', actorId: id, mode: DASH_MODE }),
  },
  {
    id: 'cunning-action-disengage',
    label: 'Cunning Action: Disengage',
    target: 'none',
    owns: characterHasCunningAction,
    disengageConflict: true,
    toIntent: (id) => ({ type: 'CunningAction', actorId: id, mode: DISENGAGE_MODE }),
  },
  {
    id: 'cunning-action-hide',
    label: 'Cunning Action: Hide',
    target: 'none',
    owns: characterHasCunningAction,
    toIntent: (id) => ({ type: 'CunningAction', actorId: id, mode: HIDE_MODE }),
  },
  {
    id: 'patient-defense',
    label: 'Patient Defense (Disengage)',
    target: 'none',
    owns: (c) => hasClassLevel(c, MONK_CLASS_ID, MONKS_FOCUS_LEVEL),
    toIntent: (id) => ({ type: 'PatientDefense', monkId: id }),
  },
  {
    id: 'patient-defense-focus',
    label: 'Patient Defense (Focus: Disengage + Dodge)',
    target: 'none',
    owns: (c) => hasClassLevel(c, MONK_CLASS_ID, MONKS_FOCUS_LEVEL),
    needsFocus: true,
    toIntent: (id) => ({ type: 'PatientDefense', monkId: id, spendFocusPoint: true }),
  },
  {
    id: 'step-of-the-wind',
    label: 'Step of the Wind (Dash)',
    target: 'none',
    owns: (c) => hasClassLevel(c, MONK_CLASS_ID, MONKS_FOCUS_LEVEL),
    dashConflict: true,
    toIntent: (id) => ({ type: 'StepOfTheWind', monkId: id }),
  },
  {
    id: 'step-of-the-wind-focus',
    label: 'Step of the Wind (Focus: Dash + Disengage)',
    target: 'none',
    owns: (c) => hasClassLevel(c, MONK_CLASS_ID, MONKS_FOCUS_LEVEL),
    needsFocus: true,
    dashConflict: true,
    toIntent: (id) => ({ type: 'StepOfTheWind', monkId: id, spendFocusPoint: true }),
  },
  {
    id: 'bardic-inspiration',
    label: 'Bardic Inspiration',
    target: 'creature',
    owns: (c) => hasClass(c, BARD_CLASS_ID),
    resourceId: BARDIC_INSPIRATION_RESOURCE,
    // RAW: a creature OTHER than yourself within 60 ft; a downed creature
    // can't use the die, so defeated targets are excluded.
    targeting: { rangeFeet: BARDIC_INSPIRATION_RANGE_FEET, includeSelf: false, includeDefeated: false },
    toIntent: (id, params) => ({
      type: 'BardicInspiration',
      bardId: id,
      recipientId: params.targetId as string,
    }),
  },
  {
    id: 'lay-on-hands-heal',
    label: 'Lay on Hands: Heal',
    target: 'creature',
    owns: (c) => hasClass(c, PALADIN_CLASS_ID),
    resourceId: LAY_ON_HANDS_RESOURCE,
    requiresAmount: true,
    // RAW: touch a creature (self or other) to restore HP — a dying ally
    // (0 HP) is the primary target, so defeated creatures are included.
    targeting: { rangeFeet: TOUCH_RANGE_FEET, includeSelf: true, includeDefeated: true },
    toIntent: (id, params) => ({
      type: 'LayOnHands',
      paladinId: id,
      targetId: params.targetId as string,
      mode: 'heal',
      amount: params.amount,
    }),
  },
  {
    id: 'lay-on-hands-cure-poison',
    label: 'Lay on Hands: Cure Poison',
    target: 'creature',
    owns: (c) => hasClass(c, PALADIN_CLASS_ID),
    resourceId: LAY_ON_HANDS_RESOURCE,
    resourceMin: LAY_ON_HANDS_CURE_POISON_COST,
    // RAW: touch a creature to end the Poisoned condition; a dying poisoned
    // ally is a valid target, so defeated creatures are included.
    targeting: { rangeFeet: TOUCH_RANGE_FEET, includeSelf: true, includeDefeated: true },
    toIntent: (id, params) => ({
      type: 'LayOnHands',
      paladinId: id,
      targetId: params.targetId as string,
      mode: 'cure-poison',
    }),
  },
  {
    id: 'flurry-of-blows',
    label: 'Flurry of Blows',
    target: 'creature',
    owns: (c) => hasClassLevel(c, MONK_CLASS_ID, MONKS_FOCUS_LEVEL),
    needsFocus: true,
    requiresWeapon: true,
    // Two Unarmed Strikes — a target within the monk's reach (5 ft), never
    // the monk itself; a defeated target isn't struck.
    targeting: { rangeFeet: UNARMED_REACH_FEET, includeSelf: false, includeDefeated: false },
    toIntent: (id, params) => ({
      type: 'FlurryOfBlows',
      monkId: id,
      targetId: params.targetId as string,
      weaponInstanceId: params.weaponInstanceId as string,
    }),
  },
  {
    id: 'off-hand-attack',
    label: 'Off-Hand Attack',
    target: 'creature',
    // Two-weapon fighting: available whenever a light weapon is wielded (the
    // property planOffHandAttack gates on). Not class-gated.
    owns: (c, state, content) => wieldsLightWeapon(c, state, content),
    requiresWeapon: true,
    targeting: { rangeFeet: UNARMED_REACH_FEET, includeSelf: false, includeDefeated: false },
    toIntent: (id, params) => ({
      type: 'OffHandAttack',
      attackerId: id,
      targetId: params.targetId as string,
      weaponInstanceId: params.weaponInstanceId as string,
    }),
  },
  {
    id: 'adrenaline-rush',
    label: 'Adrenaline Rush (Dash)',
    target: 'none',
    owns: (c) => c.speciesId === ORC_SPECIES_ID,
    resourceId: ADRENALINE_RUSH_RESOURCE,
    dashConflict: true,
    toIntent: (id) => ({ type: 'AdrenalineRush', orcId: id }),
  },
  {
    id: 'nimble-escape-disengage',
    label: 'Nimble Escape: Disengage',
    target: 'none',
    owns: characterHasNimbleEscape,
    disengageConflict: true,
    toIntent: (id) => ({ type: 'NimbleEscape', goblinId: id, mode: 'disengage' }),
  },
  {
    id: 'nimble-escape-hide',
    label: 'Nimble Escape: Hide',
    target: 'none',
    owns: characterHasNimbleEscape,
    toIntent: (id) => ({ type: 'NimbleEscape', goblinId: id, mode: 'hide' }),
  },
  {
    id: 'clouds-jaunt',
    label: "Cloud's Jaunt",
    target: 'none',
    // Planner-faithful: the resolved Cloud's Jaunt Giant Ancestry. The
    // giant-ancestry resource gate + active-turn gate are the standard cascade.
    owns: (c, state) => findGoliathAncestryChoice(c, state) === CLOUDS_JAUNT_ANCESTRY,
    resourceId: GIANT_ANCESTRY_RESOURCE_ID,
    // A teleport: the consumer supplies the destination cell (no creature target).
    requires: ['to'],
    toIntent: (id, params) => ({ type: 'CloudsJaunt', goliathId: id, to: params.to as Position }),
  },
  {
    id: 'conjure-pact-weapon',
    label: 'Conjure Pact Weapon',
    target: 'none',
    owns: hasPactBlade,
    // The consumer picks which Simple/Martial Melee weapon to conjure.
    requires: ['weaponDefinitionId'],
    toIntent: (id, params) => ({ type: 'ConjurePactWeapon', characterId: id, weaponDefinitionId: params.weaponDefinitionId as string }),
  },
  {
    id: 'sacred-weapon',
    label: 'Sacred Weapon',
    target: 'self',
    // Oath of Devotion's Channel Divinity. RAW-gated on the Oath (the affordance
    // is correctly stricter than planSacredWeapon, which only checks paladin +
    // Channel Divinity — a known planner leniency).
    owns: (c) => hasSubclass(c, PALADIN_CLASS_ID, OATH_OF_DEVOTION_SUBCLASS),
    resourceId: CHANNEL_DIVINITY_RESOURCE,
    extraReason: (c) => sacredWeaponActiveReason(c),
    toIntent: (id) => ({ type: 'SacredWeapon', paladinId: id }),
  },
  {
    id: 'intimidating-presence',
    label: 'Intimidating Presence',
    target: 'none',
    owns: (c) => hasSubclass(c, BARBARIAN_CLASS_ID, BERSERKER_SUBCLASS, INTIMIDATING_PRESENCE_LEVEL),
    // A WIS-save-or-Frightened over chosen creatures — the consumer supplies them.
    requires: ['targetIds'],
    toIntent: (id, params) => ({ type: 'IntimidatingPresence', barbarianId: id, targetIds: params.targetIds as ReadonlyArray<string> }),
  },
];

// ── bonusActions (enumeration) ──────────────────────────────────────
interface ReasonContext {
  readonly blocker: string | undefined;
  readonly isActiveTurn: boolean;
  readonly bonusActionUsed: boolean;
  readonly dashed: boolean;
  readonly disengaged: boolean;
  readonly character: Character;
  readonly state: CampaignState;
  readonly content: ResolvedContent;
}

const disabledReason = (
  d: BonusActionDescriptor,
  ctx: ReasonContext,
): string | undefined => {
  if (ctx.blocker !== undefined) return ctx.blocker;
  if (!ctx.isActiveTurn) return REASON_NOT_YOUR_TURN;
  if (ctx.bonusActionUsed) return REASON_BONUS_ACTION_USED;
  if (d.dashConflict === true && ctx.dashed) return REASON_ALREADY_DASHED;
  if (d.disengageConflict === true && ctx.disengaged) return REASON_ALREADY_DISENGAGED;
  if (
    d.resourceId !== undefined &&
    resourceCurrent(ctx.character, d.resourceId) < (d.resourceMin ?? 1)
  ) {
    return REASON_NO_USES;
  }
  if (d.needsFocus === true && resourceCurrent(ctx.character, KI_RESOURCE) <= 0) {
    return REASON_NO_FOCUS;
  }
  return d.extraReason?.(ctx.character, ctx.state, ctx.content);
};

export const bonusActions = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  combatantId: string,
): ReadonlyArray<BonusActionOption> => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === combatantId);
  const character = state.characters[combatantId];
  if (encounter === undefined || self === undefined || character === undefined) return [];

  const ctx: ReasonContext = {
    blocker: findActorBlockingCondition(character),
    // Gate on the encounter being active: a 'planning' encounter has
    // activeIndex defaulting to 0 and no activeEncounterId, so without this
    // check combatant 0 would look "active" and the encounter-only options
    // (Cunning Action, Flurry, …) would show enabled — but their planners
    // throw "only in an active encounter" (they read state.activeEncounterId).
    isActiveTurn:
      encounter.status === 'active' &&
      encounter.combatants[encounter.activeIndex]?.combatantId === combatantId,
    bonusActionUsed: self.turnUsage.bonusActionUsed,
    dashed: self.turnUsage.dashed,
    disengaged: self.turnUsage.disengaged,
    character,
    state,
    content,
  };

  const out: BonusActionOption[] = [];
  for (const d of REGISTRY) {
    if (!d.owns(character, state, content)) continue;
    const reason = disabledReason(d, ctx);
    const requiresAmount = d.requiresAmount === true;
    // The spendable pool for a metered option: the current value of its
    // resource (Lay on Hands points). Only metered options carry it.
    const maxAmount =
      requiresAmount && d.resourceId !== undefined
        ? resourceCurrent(character, d.resourceId)
        : undefined;
    out.push({
      id: d.id,
      label: d.label,
      target: d.target,
      enabled: reason === undefined,
      ...(reason !== undefined ? { reason } : {}),
      requiresAmount,
      ...(maxAmount !== undefined ? { maxAmount } : {}),
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
};

// ── bonusActionTargets (target enumeration) ─────────────────────────
//
// The legal targets for a creature-target option, honoring the option's own
// reach + self / defeated rules (the descriptor's `targeting`). Returns [] for
// a non-creature option or an unknown id.
//
// Range is chebyshev on the combatants' feet positions (the same primitive
// the Protection resolver uses), so it works from combatant positions alone —
// no map / location required. When a position is missing (a positionless
// encounter), the range gate is a no-op for that pair (positions are consumer
// scope per engine-scope.md; the consumer applies its own line-of-sight). The
// authoritative validity is still the planner at `useOption` time.
export const bonusActionTargets = (
  state: CampaignState,
  encounterId: string,
  combatantId: string,
  optionId: string,
): ReadonlyArray<BonusActionTarget> => {
  const d = REGISTRY.find((x) => x.id === optionId);
  if (d === undefined || d.target !== 'creature' || d.targeting === undefined) return [];
  return creatureTargetsInReach(state, encounterId, combatantId, d.targeting);
};

// ── bonusActionIntent (dispatch builder) ────────────────────────────
//
// Maps an option id (+ optional target) to its planner intent. Throws on
// an unknown id or a missing required target — the same fail-fast contract
// the planners themselves honor. `useOption` runs the result through the
// shared plan dispatch.
export const bonusActionIntent = (
  optionId: string,
  combatantId: string,
  params: BonusActionParams = {},
): BonusActionIntent => {
  const d = REGISTRY.find((x) => x.id === optionId);
  if (d === undefined) throw new Error(`Unknown bonus-action option: ${optionId}`);
  if (d.target === 'creature' && params.targetId === undefined) {
    throw new Error(`Bonus-action option '${optionId}' requires a targetId`);
  }
  if (d.requiresAmount === true && params.amount === undefined) {
    throw new Error(`Bonus-action option '${optionId}' requires an amount`);
  }
  if (d.requiresWeapon === true && params.weaponInstanceId === undefined) {
    throw new Error(`Bonus-action option '${optionId}' requires a weaponInstanceId`);
  }
  for (const key of d.requires ?? []) {
    if (params[key] === undefined) throw new Error(`Bonus-action option '${optionId}' requires a ${key}`);
  }
  return d.toIntent(combatantId, params);
};
