import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type {
  LongRestEndedEvent,
  LongRestStartedEvent,
  ShortRestEndedEvent,
  ShortRestStartedEvent,
} from '../../schemas/events/rest.js';
import type { HeroicInspirationGrantedEvent } from '../../schemas/events/heroic-inspiration.js';
import type { ConditionRemovedEvent } from '../../schemas/events/combat.js';
import type { Event } from '../../schemas/events/index.js';
import type { Effect } from '../../schemas/effects.js';
import type { Formula } from '../../schemas/formula.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { buildEffectStack, collectEffectsFromCharacter } from '../../derive/effect-stack.js';
import { evaluateFormula } from '../../effects/formula.js';
import { proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import type { ULID } from '../../engine/ids-utils.js';

type RecoverResourceEffect = Extract<Effect, { kind: 'RecoverResource' }>;
interface RestResourceDelta {
  readonly characterId: ULID;
  readonly resourceId: string;
  readonly delta: number;
}

// Slice 718: resolve the `RecoverResource` effects that fire on this rest
// into concrete per-resource deltas, evaluated against the pre-rest state
// (so replay is deterministic). 'all' fills to max; a Formula evaluates at
// the character's levels; a number is capped to the resource's headroom. A
// `limitedByResourceId` gate (Sorcerous Restoration: once per Long Rest)
// applies only when its resource is available and spends 1 of it.
const restRecoveryDeltas = (
  state: CampaignState,
  content: ResolvedContent,
  participantIds: ReadonlyArray<string>,
  when: 'shortRest' | 'longRest',
): RestResourceDelta[] => {
  const deltas: RestResourceDelta[] = [];
  for (const participantId of participantIds) {
    const character = state.characters[participantId];
    if (!character) continue;
    const effects = collectEffectsFromCharacter({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    for (const rec of effects.filter(
      (e): e is RecoverResourceEffect => e.kind === 'RecoverResource' && e.when === when,
    )) {
      const target = character.resources.find((r) => r.resourceId === rec.resourceId);
      if (target === undefined) continue;
      const headroom = target.max - target.current;
      if (headroom <= 0) continue; // already full — nothing to recover (and don't spend a gate)
      const want = rec.amount === 'all'
        ? headroom
        : typeof rec.amount === 'number'
          ? rec.amount
          : evaluateFormula(rec.amount as Formula, {
              abilityScores: character.abilityScores,
              proficiencyBonus: proficiencyBonus(computeTotalLevel(character)),
              classLevels: new Map(character.classes.map((c) => [c.classId, c.level])),
              totalLevel: computeTotalLevel(character),
            });
      const restore = Math.min(Math.max(0, want), headroom);
      if (restore <= 0) continue;
      if (rec.limitedByResourceId !== undefined) {
        const gate = character.resources.find((r) => r.resourceId === rec.limitedByResourceId);
        if (gate === undefined || gate.current <= 0) continue;
        deltas.push({ characterId: participantId as ULID, resourceId: rec.limitedByResourceId, delta: -1 });
      }
      deltas.push({ characterId: participantId as ULID, resourceId: rec.resourceId, delta: restore });
    }
  }
  return deltas;
};

export interface LongRestIntent {
  readonly type: 'LongRest';
  readonly participantIds: ReadonlyArray<string>;
  readonly at?: string;
}

export interface ShortRestIntent {
  readonly type: 'ShortRest';
  readonly participantIds: ReadonlyArray<string>;
  readonly at?: string;
}

export type RestIntent = LongRestIntent | ShortRestIntent;

// Standard rest durations (PHB 2024 ch.1).
const SHORT_REST_STANDARD_MINUTES = 60;
const LONG_REST_STANDARD_MINUTES = 60 * 8;
// Gritty Realism variant (DMG 2024). Short rest = a night's sleep,
// long rest = a week of downtime.
const SHORT_REST_GRITTY_MINUTES = 60 * 8;
const LONG_REST_GRITTY_MINUTES = 60 * 24 * 7;
// SRD 5.2.1 (rules-glossary "Long Rest"): "After you finish a Long Rest, you
// must wait at least 16 hours before starting another one." (The 2014 rule was
// a 24-hour-period cap; this is the 2024 cadence.)
const LONG_REST_CADENCE_LOCKOUT_MINUTES = 16 * 60;

export const planShortRest = (
  state: CampaignState,
  contentOrIntent: ResolvedContent | ShortRestIntent,
  maybeIntent?: ShortRestIntent,
): ReadonlyArray<Event> => {
  // Slice 718 backward-compatible signature (mirrors planLongRest): callers
  // that pass content get RecoverResource recovery (Font of Inspiration);
  // callers that don't keep the pre-718 behavior (no recovery deltas).
  const intent: ShortRestIntent = maybeIntent ?? (contentOrIntent as ShortRestIntent);
  const content: ResolvedContent | undefined = maybeIntent !== undefined
    ? (contentOrIntent as ResolvedContent)
    : undefined;
  const at = intent.at ?? nowIso();
  const expectedDurationMinutes = state.settings.grittyRest
    ? SHORT_REST_GRITTY_MINUTES
    : SHORT_REST_STANDARD_MINUTES;
  const start: ShortRestStartedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ShortRestStarted',
    participantIds: [...intent.participantIds],
    expectedDurationMinutes,
  };
  const deltas = content !== undefined
    ? restRecoveryDeltas(state, content, intent.participantIds, 'shortRest')
    : [];
  const end: ShortRestEndedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ShortRestEnded',
    causedByEventId: start.id,
    ...(deltas.length > 0 ? { resourceDeltas: deltas } : {}),
  };
  return [start, end];
};

export const planLongRest = (
  state: CampaignState,
  contentOrIntent: ResolvedContent | LongRestIntent,
  maybeIntent?: LongRestIntent,
): ReadonlyArray<Event> => {
  // Slice 542 backward-compatible signature: callers that don't
  // supply content get the same behavior as before (no
  // HeroicInspirationGranted auto-emission). Callers that supply
  // content get the auto-grant for participants with the
  // GrantHeroicInspirationOnLongRest marker on their effect stack.
  const intent: LongRestIntent = maybeIntent ?? (contentOrIntent as LongRestIntent);
  const content: ResolvedContent | undefined = maybeIntent !== undefined
    ? (contentOrIntent as ResolvedContent)
    : undefined;
  // Slice 862: RAW (Long Rest) — "To start a Long Rest, you must have at
  // least 1 Hit Point." A creature at 0 HP (dying, or stable-but-unconscious)
  // can't begin a Long Rest; it must regain at least 1 HP first (a heal, or
  // the stable-creature 1-HP-after-1d4-hours recovery). Surface the violation
  // explicitly rather than silently resting a downed creature to full.
  for (const participantId of intent.participantIds) {
    const participant = state.characters[participantId];
    if (participant !== undefined && participant.hp.current < 1) {
      throw new Error(
        `${participant.name} cannot start a Long Rest at 0 Hit Points (RAW requires at least 1 Hit Point to start a Long Rest)`,
      );
    }
  }
  // Slice 898: SRD 16-hour Long Rest cadence — "After you finish a Long Rest,
  // you must wait at least 16 hours before starting another one." Opt-in
  // (settings.enforceLongRestCadence), because the rule is measured on the
  // consumer's in-game clock (inGameTime, advanced via InGameTimeAdvanced):
  // the engine records each rest's completion time (applyLongRestEnded) and
  // here rejects a new rest until 16 in-game hours have elapsed since a
  // participant's last one. The consumer owns advancing inGameTime across the
  // rest's own duration; with cadence off the gate is inert (byte-unchanged).
  if (state.settings.enforceLongRestCadence) {
    const now = state.inGameTime.totalMinutes;
    for (const participantId of intent.participantIds) {
      const participant = state.characters[participantId];
      if (participant === undefined) continue;
      const lastEnd = state.lastLongRestEndMinutesByCharacter[participantId];
      if (lastEnd === undefined) continue;
      const elapsed = now - lastEnd;
      if (elapsed < LONG_REST_CADENCE_LOCKOUT_MINUTES) {
        const waitMinutes = LONG_REST_CADENCE_LOCKOUT_MINUTES - elapsed;
        throw new Error(
          `${participant.name} cannot start another Long Rest yet (SRD: wait at least 16 hours after finishing one; ${Math.ceil(waitMinutes / 60)} more in-game hour(s) required)`,
        );
      }
    }
  }
  const at = intent.at ?? nowIso();
  const expectedDurationMinutes = state.settings.grittyRest
    ? LONG_REST_GRITTY_MINUTES
    : LONG_REST_STANDARD_MINUTES;
  const start: LongRestStartedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'LongRestStarted',
    participantIds: [...intent.participantIds],
    expectedDurationMinutes,
  };
  // Long rest already refills every resource to max in the reducer, so a
  // RecoverResource{when:'longRest'} would be subsumed (and a gate spend
  // after that refresh would be wrong). Recovery is short-rest-only; the
  // `resourceDeltas` field stays unused on LongRestEnded.
  const end: LongRestEndedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'LongRestEnded',
    causedByEventId: start.id,
  };
  // Slice 832: restore undead Life Drain (Specter / Wraith) on a Long Rest.
  // The `life-drained` condition carries a negative hpMaxBonusDelta; a
  // ConditionRemoved reverses it (applyConditionRemoved), emitted BEFORE
  // LongRestEnded resets current HP so the maximum is whole again. Precise
  // gate — endsOn `longRest` AND a non-zero hpMaxBonusDelta — so exhaustion /
  // rage / other longRest-metadata conditions (no max-HP delta) are untouched.
  // Needs content for the condition def; older content-less callers skip it.
  const drainRemovals: Event[] = [];
  if (content !== undefined) {
    for (const participantId of intent.participantIds) {
      const character = state.characters[participantId];
      if (!character) continue;
      const seen = new Set<string>();
      for (const applied of character.appliedConditions) {
        if (applied.hpMaxBonusDelta === undefined || applied.hpMaxBonusDelta === 0) continue;
        if (seen.has(applied.conditionId)) continue;
        const def = content.conditions.get(applied.conditionId);
        if (def === undefined) continue;
        if (!(def.endsOn ?? []).some((e) => e.kind === 'longRest')) continue;
        seen.add(applied.conditionId);
        drainRemovals.push({
          id: newEventId() as ULID,
          at,
          type: 'ConditionRemoved',
          targetId: participantId as ULID,
          conditionId: applied.conditionId,
        } satisfies ConditionRemovedEvent);
      }
    }
  }
  const events: Event[] = [start, ...drainRemovals, end];
  // Slice 542: auto-emit HeroicInspirationGranted for each
  // participant whose effect stack carries the
  // GrantHeroicInspirationOnLongRest marker (Human Resourceful,
  // etc.). Requires content for buildEffectStack.
  if (content !== undefined) {
    for (const participantId of intent.participantIds) {
      const character = state.characters[participantId];
      if (!character) continue;
      const effects = buildEffectStack({
        character,
        content,
        itemInstances: state.itemInstances,
        pendingChoices: state.pendingChoices,
      });
      if (!effects.hasHeroicInspirationOnLongRest()) continue;
      const granted: HeroicInspirationGrantedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'HeroicInspirationGranted',
        characterId: participantId as ULID,
        causedByEventId: end.id,
      };
      events.push(granted);
    }
  }
  return events;
};
