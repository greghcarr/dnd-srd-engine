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
// The same precondition predictor `availableActions` uses: returns the
// blocking-condition id (incapacitated / stunned / ...) or undefined.
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';
// Reuse each planner's own ownership predicate / allowlist so enumeration
// matches dispatch exactly (no drift between "offered" and "accepted").
import { characterHasCunningAction, type CunningActionMode } from '../engine/plan/cunning-action.js';
import { characterHasNimbleEscape } from '../engine/plan/nimble-escape.js';
import type { SecondWindIntent } from '../engine/plan/second-wind.js';
import type { RageIntent } from '../engine/plan/rage.js';
import type { CunningActionIntent } from '../engine/plan/cunning-action.js';
import type { PatientDefenseIntent } from '../engine/plan/patient-defense.js';
import type { StepOfTheWindIntent } from '../engine/plan/step-of-the-wind.js';
import type { BardicInspirationIntent } from '../engine/plan/bardic-inspiration.js';
import type { LayOnHandsIntent } from '../engine/plan/lay-on-hands.js';
import type { AdrenalineRushIntent } from '../engine/plan/adrenaline-rush.js';
import type { NimbleEscapeIntent } from '../engine/plan/nimble-escape.js';
import type { FlurryOfBlowsIntent } from '../engine/plan/flurry-of-blows.js';

// ── Named constants ─────────────────────────────────────────────────
const FIGHTER_CLASS_ID = 'fighter';
const BARBARIAN_CLASS_ID = 'barbarian';
const MONK_CLASS_ID = 'monk';
const BARD_CLASS_ID = 'bard';
const PALADIN_CLASS_ID = 'paladin';
const ORC_SPECIES_ID = 'orc';
const MONKS_FOCUS_LEVEL = 2;

const SECOND_WIND_RESOURCE = 'second-wind';
const RAGE_RESOURCE = 'rage';
const KI_RESOURCE = 'ki';
const BARDIC_INSPIRATION_RESOURCE = 'bardic-inspiration';
const LAY_ON_HANDS_RESOURCE = 'lay-on-hands';
const ADRENALINE_RUSH_RESOURCE = 'adrenaline-rush';
const LAY_ON_HANDS_CURE_POISON_COST = 5; // matches CURE_POISON_COST in lay-on-hands.ts
const HEAVY_ARMOR_CATEGORY = 'heavy';

// Machine-readable disabled reasons (mirrors the availableActions style).
const REASON_NOT_YOUR_TURN = 'not-your-turn';
const REASON_BONUS_ACTION_USED = 'bonus-action-used';
const REASON_NO_USES = 'no-uses';
const REASON_NO_FOCUS = 'no-focus';
const REASON_HEAVY_ARMOR = 'heavy-armor';
const REASON_ALREADY_DASHED = 'already-dashed';
const REASON_ALREADY_DISENGAGED = 'already-disengaged';

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
}

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
  | FlurryOfBlowsIntent;

/**
 * Per-option parameters for `bonusActionIntent` / `engine.plan.useOption`.
 * `targetId` for creature-target options; `amount` for metered heals (Lay on
 * Hands); `weaponInstanceId` for strike options (Flurry of Blows).
 */
export interface BonusActionParams {
  readonly targetId?: string;
  readonly amount?: number;
  readonly weaponInstanceId?: string;
}

// ── Registry ────────────────────────────────────────────────────────
interface BonusActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly target: BonusActionTargetKind;
  /** Does this character own the feature at all (class / level / statblock)? */
  readonly owns: (character: Character) => boolean;
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
    extraReason: heavyArmorReason,
    toIntent: (id) => ({ type: 'Rage', barbarianId: id }),
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
    toIntent: (id, params) => ({
      type: 'FlurryOfBlows',
      monkId: id,
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
    isActiveTurn: encounter.combatants[encounter.activeIndex]?.combatantId === combatantId,
    bonusActionUsed: self.turnUsage.bonusActionUsed,
    dashed: self.turnUsage.dashed,
    disengaged: self.turnUsage.disengaged,
    character,
    state,
    content,
  };

  const out: BonusActionOption[] = [];
  for (const d of REGISTRY) {
    if (!d.owns(character)) continue;
    const reason = disabledReason(d, ctx);
    out.push({
      id: d.id,
      label: d.label,
      target: d.target,
      enabled: reason === undefined,
      ...(reason !== undefined ? { reason } : {}),
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
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
  return d.toIntent(combatantId, params);
};
