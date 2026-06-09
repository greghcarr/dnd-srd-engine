// Slice 764: action affordances (the generic 2024 actions).
//
// `availableActions` (affordances.ts) covers the five core combat intents
// (move / attack / dash / disengage / dodge) with bespoke per-action gating.
// This is its registry-driven sibling for the SRD 2024 "general" actions every
// creature can take — Search, Study, Influence, Utilize, Hide, Grapple, Shove,
// Help, Ready — which were drivable (all in the performIntent dispatch) but
// undiscoverable. Mirrors bonus-actions.ts:
//   - `actionOptions(...)` enumerates the options, each enabled/disabled with a
//     machine-readable reason. Pure + read-only.
//   - `actionIntent(...)` maps an option id (+ params) to its planner intent;
//     the consumer routes it through `performIntent` (the same plan dispatch
//     these already use), so dice flow through the active RollProvider and the
//     planner re-validates authoritatively.
// An Action menu unions `availableActions` (the 5 core), `actionOptions` (these
// general actions), and `castableSpells` filtered to action-time casts.
//
// Covers the universal general actions plus class-feature actions (slice 769):
// Action Surge (its inverted "grants an extra action" economy — NOT gated on
// action-used), Divine Spark and Turn Undead (Cleric Channel Divinity, resource
// + creature / multi-target). Descriptors carry per-action owns + resource +
// costsAction, the same shape bonus-actions.ts uses.

import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Character } from '../schemas/runtime/character.js';
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';
import type { HelpIntent } from '../engine/plan/help.js';
import type { SearchIntent } from '../engine/plan/search.js';
import type { StudyIntent } from '../engine/plan/study.js';
import type { InfluenceIntent } from '../engine/plan/influence.js';
import type { UtilizeIntent } from '../engine/plan/utilize.js';
import type { HideIntent, GrappleIntent, ShoveIntent } from '../engine/plan/contested.js';
import type { ReadyIntent } from '../engine/plan/ready.js';
import type { ActionSurgeIntent } from '../engine/plan/action-surge.js';
import type { TurnUndeadIntent } from '../engine/plan/turn-undead.js';
import type { DivineSparkIntent } from '../engine/plan/divine-spark.js';
import { creatureTargetsInReach, type CreatureTargeting, type CreatureTarget } from './_targeting.js';

const REASON_NOT_YOUR_TURN = 'not-your-turn';
const REASON_ACTION_USED = 'action-used';
const REASON_NO_USES = 'no-uses';
const FIGHTER_CLASS_ID = 'fighter';
const CLERIC_CLASS_ID = 'cleric';
const ACTION_SURGE_RESOURCE = 'action-surge';
const CHANNEL_DIVINITY_RESOURCE = 'channel-divinity';

// ── Public types ────────────────────────────────────────────────────
export type ActionOptionTargetKind = 'none' | 'self' | 'creature';

/** A legal target for a creature-target action, from `actionTargets`. */
export type ActionTarget = CreatureTarget;

export interface ActionOption {
  /** Stable id — pass back to `actionIntent({ optionId })`. */
  readonly id: string;
  readonly label: string;
  readonly target: ActionOptionTargetKind;
  readonly enabled: boolean;
  /**
   * Machine-readable reason when `enabled` is false: a blocking-condition id
   * ('incapacitated', 'stunned', …), 'not-your-turn', or 'action-used'.
   */
  readonly reason?: string;
}

/** The intent union `actionIntent` produces for `performIntent` dispatch. */
export type ActionIntent =
  | SearchIntent
  | StudyIntent
  | InfluenceIntent
  | UtilizeIntent
  | HideIntent
  | GrappleIntent
  | ShoveIntent
  | HelpIntent
  | ReadyIntent
  | ActionSurgeIntent
  | TurnUndeadIntent
  | DivineSparkIntent;

/**
 * Per-option params for `actionIntent`. `targetId` for creature-target options
 * (Grapple / Shove / Help); `mode` for Shove ('prone'|'push') / Help
 * ('attack'|'check'); `trigger` for Ready; the optional `skill` / `dc` /
 * `ability` / `targetAbility` pass through to the check-style actions.
 */
export interface ActionParams {
  readonly targetId?: string;
  readonly mode?: string;
  readonly trigger?: string;
  readonly skill?: string;
  readonly dc?: number;
  readonly ability?: string;
  readonly targetAbility?: string;
  /** Multiple creatures for an AoE action (Turn Undead — the undead in range). */
  readonly targetIds?: ReadonlyArray<string>;
}

// ── Registry ────────────────────────────────────────────────────────
interface ActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly target: ActionOptionTargetKind;
  /** Required params; `actionIntent` throws if any is missing. */
  readonly requires?: ReadonlyArray<keyof ActionParams>;
  /**
   * Owns the feature right now? Default (omitted) = every creature (the general
   * actions). Class-feature actions gate on class / level (+ the resource).
   */
  readonly owns?: (character: Character) => boolean;
  /** Resource consumed; the option disables `no-uses` when current < resourceMin (1). */
  readonly resourceId?: string;
  /**
   * Does this cost the actor's Action? Default true (gated on `action-used`).
   * Action Surge sets false — it GRANTS an extra action, so it's available even
   * after the action is spent (matching planActionSurge).
   */
  readonly costsAction?: boolean;
  /**
   * Targeting rules for a `target: 'creature'` action, consumed by
   * `actionTargets` (the shared `CreatureTargeting`). Creature-target actions
   * set this; others leave it undefined.
   */
  readonly targeting?: CreatureTargeting;
  readonly toIntent: (combatantId: string, params: ActionParams) => ActionIntent;
}

const hasClass = (c: Character, classId: string): boolean => c.classes.some((cl) => cl.classId === classId);
const resourceCurrent = (c: Character, resourceId: string): number =>
  c.resources.find((r) => r.resourceId === resourceId)?.current ?? 0;

// Conditionally include an optional param key (omit when undefined, so the
// planner's own default applies).
const opt = <K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<string, never> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

const REGISTRY: ReadonlyArray<ActionDescriptor> = [
  {
    id: 'search',
    label: 'Search',
    target: 'none',
    toIntent: (id, p) => ({ type: 'Search', characterId: id, ...opt('skill', p.skill), ...opt('dc', p.dc) }) as SearchIntent,
  },
  {
    id: 'study',
    label: 'Study',
    target: 'none',
    toIntent: (id, p) => ({ type: 'Study', characterId: id, ...opt('skill', p.skill), ...opt('dc', p.dc) }) as StudyIntent,
  },
  {
    id: 'influence',
    label: 'Influence',
    target: 'none',
    toIntent: (id, p) => ({ type: 'Influence', characterId: id, ...opt('skill', p.skill), ...opt('dc', p.dc) }) as InfluenceIntent,
  },
  {
    id: 'utilize',
    label: 'Utilize',
    target: 'none',
    toIntent: (id, p) =>
      ({ type: 'Utilize', characterId: id, ...opt('ability', p.ability), ...opt('skill', p.skill), ...opt('dc', p.dc) }) as UtilizeIntent,
  },
  {
    id: 'hide',
    label: 'Hide',
    target: 'none',
    toIntent: (id, p) => ({ type: 'Hide', characterId: id, ...opt('dc', p.dc) }) as HideIntent,
  },
  {
    id: 'grapple',
    label: 'Grapple',
    target: 'creature',
    requires: ['targetId'],
    // Melee reach; a living creature you can reach.
    targeting: { rangeFeet: 5, includeSelf: false, includeDefeated: false },
    toIntent: (id, p) =>
      ({ type: 'Grapple', attackerId: id, targetId: p.targetId as string, ...opt('targetAbility', p.targetAbility) }) as GrappleIntent,
  },
  {
    id: 'shove',
    label: 'Shove',
    target: 'creature',
    requires: ['targetId', 'mode'],
    targeting: { rangeFeet: 5, includeSelf: false, includeDefeated: false },
    toIntent: (id, p) => ({ type: 'Shove', attackerId: id, targetId: p.targetId as string, mode: p.mode as 'prone' | 'push' }) as ShoveIntent,
  },
  {
    id: 'help',
    label: 'Help',
    target: 'creature',
    requires: ['targetId', 'mode'],
    // Never yourself; the 5-ft (attack) / see-and-hear (check) gate is
    // consumer-managed (planHelp doesn't range-check), so no range filter here.
    targeting: { includeSelf: false, includeDefeated: false },
    toIntent: (id, p) => ({ type: 'Help', helperId: id, targetId: p.targetId as string, mode: p.mode as 'attack' | 'check' }) as HelpIntent,
  },
  {
    id: 'ready',
    label: 'Ready',
    target: 'none',
    requires: ['trigger'],
    toIntent: (id, p) => ({ type: 'Ready', combatantId: id, trigger: p.trigger as string }) as ReadyIntent,
  },
  // ── Class-feature actions (slice 769) ──
  {
    id: 'action-surge',
    label: 'Action Surge',
    target: 'none',
    owns: (c) => hasClass(c, FIGHTER_CLASS_ID),
    resourceId: ACTION_SURGE_RESOURCE,
    // Grants an extra action — available even after the action is spent.
    costsAction: false,
    toIntent: (id) => ({ type: 'ActionSurge', combatantId: id }) as ActionSurgeIntent,
  },
  {
    id: 'divine-spark',
    label: 'Divine Spark',
    target: 'creature',
    owns: (c) => hasClass(c, CLERIC_CLASS_ID),
    resourceId: CHANNEL_DIVINITY_RESOURCE,
    requires: ['targetId', 'mode'],
    // 30 ft; self allowed (self-heal) and the dying included (heal mode revives
    // a downed ally — the consumer picks mode + target, the planner validates).
    targeting: { rangeFeet: 30, includeSelf: true, includeDefeated: true },
    toIntent: (id, p) => ({ type: 'DivineSpark', clericId: id, targetId: p.targetId as string, mode: p.mode as 'heal' | 'damage' }) as DivineSparkIntent,
  },
  {
    id: 'turn-undead',
    label: 'Turn Undead',
    target: 'none',
    owns: (c) => hasClass(c, CLERIC_CLASS_ID),
    resourceId: CHANNEL_DIVINITY_RESOURCE,
    // AoE over the undead in range — the consumer supplies the affected ids.
    requires: ['targetIds'],
    toIntent: (id, p) => ({ type: 'TurnUndead', clericId: id, targetIds: p.targetIds as ReadonlyArray<string> }) as TurnUndeadIntent,
  },
];

// ── actionOptions (enumeration) ─────────────────────────────────────
export const actionOptions = (
  state: CampaignState,
  _content: ResolvedContent,
  encounterId: string,
  combatantId: string,
): ReadonlyArray<ActionOption> => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === combatantId);
  const character = state.characters[combatantId];
  if (encounter === undefined || self === undefined || character === undefined) return [];

  const blocker = findActorBlockingCondition(character);
  const isActiveTurn =
    encounter.status === 'active' && encounter.combatants[encounter.activeIndex]?.combatantId === combatantId;

  // Per-descriptor reason: the shared blocker / not-your-turn gates, then the
  // action-used gate (unless the option grants an extra action), then the
  // option's own resource gate.
  const reasonFor = (d: ActionDescriptor): string | undefined => {
    if (blocker !== undefined) return blocker;
    if (!isActiveTurn) return REASON_NOT_YOUR_TURN;
    if (d.costsAction !== false && self.turnUsage.actionUsed) return REASON_ACTION_USED;
    if (d.resourceId !== undefined && resourceCurrent(character, d.resourceId) < 1) return REASON_NO_USES;
    return undefined;
  };

  const out: ActionOption[] = [];
  for (const d of REGISTRY) {
    if (d.owns !== undefined && !d.owns(character)) continue;
    const reason = reasonFor(d);
    out.push({
      id: d.id,
      label: d.label,
      target: d.target,
      enabled: reason === undefined,
      ...(reason !== undefined ? { reason } : {}),
    });
  }
  return out;
};

// ── actionIntent (dispatch builder) ─────────────────────────────────
//
// Maps an option id (+ params) to its planner intent. Throws on an unknown id
// or a missing required param — the same fail-fast contract bonusActionIntent
// honors. The consumer runs the result through `performIntent`.
export const actionIntent = (
  optionId: string,
  combatantId: string,
  params: ActionParams = {},
): ActionIntent => {
  const d = REGISTRY.find((x) => x.id === optionId);
  if (d === undefined) throw new Error(`Unknown action option: ${optionId}`);
  for (const key of d.requires ?? []) {
    if (params[key] === undefined) throw new Error(`Action option '${optionId}' requires a ${key}`);
  }
  return d.toIntent(combatantId, params);
};

// ── actionTargets (target enumeration) ──────────────────────────────
//
// The legal targets for a creature-target action (Grapple / Shove / Help /
// Divine Spark), honoring the option's reach + self / defeated rules. The
// `bonusActionTargets` sibling for the Action menu; returns [] for a
// non-creature option or an unknown id. Range is chebyshev on positions
// (positionless → no range filter); the planner is authoritative.
export const actionTargets = (
  state: CampaignState,
  encounterId: string,
  combatantId: string,
  optionId: string,
): ReadonlyArray<ActionTarget> => {
  const d = REGISTRY.find((x) => x.id === optionId);
  if (d === undefined || d.target !== 'creature' || d.targeting === undefined) return [];
  return creatureTargetsInReach(state, encounterId, combatantId, d.targeting);
};
