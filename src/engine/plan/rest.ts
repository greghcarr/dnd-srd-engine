import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type {
  LongRestEndedEvent,
  LongRestStartedEvent,
  ShortRestEndedEvent,
  ShortRestStartedEvent,
} from '../../schemas/events/rest.js';
import type { HeroicInspirationGrantedEvent } from '../../schemas/events/heroic-inspiration.js';
import type { Event } from '../../schemas/events/index.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import type { ULID } from '../../engine/ids-utils.js';

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

export const planShortRest = (
  state: CampaignState,
  intent: ShortRestIntent,
): ReadonlyArray<Event> => {
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
  const end: ShortRestEndedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ShortRestEnded',
    causedByEventId: start.id,
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
  const end: LongRestEndedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'LongRestEnded',
    causedByEventId: start.id,
  };
  const events: Event[] = [start, end];
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
