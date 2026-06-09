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
// Scope: the universal general actions. Class-feature actions (Action Surge —
// its inverted "grants an extra action" economy; Turn Undead / Divine Spark /
// Preserve Life / Breath Weapon — resource + multi-target / AoE) are a
// documented follow-up; they don't fit the uniform "costs your action" gating.

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

const REASON_NOT_YOUR_TURN = 'not-your-turn';
const REASON_ACTION_USED = 'action-used';

// ── Public types ────────────────────────────────────────────────────
export type ActionOptionTargetKind = 'none' | 'self' | 'creature';

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
  | ReadyIntent;

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
}

// ── Registry ────────────────────────────────────────────────────────
interface ActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly target: ActionOptionTargetKind;
  /** Required params; `actionIntent` throws if any is missing. */
  readonly requires?: ReadonlyArray<keyof ActionParams>;
  readonly toIntent: (combatantId: string, params: ActionParams) => ActionIntent;
}

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
    toIntent: (id, p) =>
      ({ type: 'Grapple', attackerId: id, targetId: p.targetId as string, ...opt('targetAbility', p.targetAbility) }) as GrappleIntent,
  },
  {
    id: 'shove',
    label: 'Shove',
    target: 'creature',
    requires: ['targetId', 'mode'],
    toIntent: (id, p) => ({ type: 'Shove', attackerId: id, targetId: p.targetId as string, mode: p.mode as 'prone' | 'push' }) as ShoveIntent,
  },
  {
    id: 'help',
    label: 'Help',
    target: 'creature',
    requires: ['targetId', 'mode'],
    toIntent: (id, p) => ({ type: 'Help', helperId: id, targetId: p.targetId as string, mode: p.mode as 'attack' | 'check' }) as HelpIntent,
  },
  {
    id: 'ready',
    label: 'Ready',
    target: 'none',
    requires: ['trigger'],
    toIntent: (id, p) => ({ type: 'Ready', combatantId: id, trigger: p.trigger as string }) as ReadyIntent,
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
  const reason =
    blocker !== undefined ? blocker : !isActiveTurn ? REASON_NOT_YOUR_TURN : self.turnUsage.actionUsed ? REASON_ACTION_USED : undefined;

  return REGISTRY.map((d) => ({
    id: d.id,
    label: d.label,
    target: d.target,
    enabled: reason === undefined,
    ...(reason !== undefined ? { reason } : {}),
  }));
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
