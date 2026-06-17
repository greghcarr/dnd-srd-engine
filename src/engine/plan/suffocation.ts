// Slice 887 — Suffocation (closes the L7 audit Area-8 quirk `no-suffocation`).
//
// RAW (rules-glossary "Suffocation", 2024): "A creature can hold its breath
// for a number of minutes equal to 1 plus its Constitution modifier (minimum
// of 30 seconds) before suffocation begins. When a creature runs out of breath
// or is choking, it gains 1 Exhaustion level at the end of each of its turns.
// When a creature can breathe again, it removes all levels of Exhaustion it
// gained from suffocating."
//
// Engine scope: the engine owns the Exhaustion ACCOUNTING — accruing one level
// per ticked turn-end and undoing exactly those levels on recovery (the
// reversible subset is tracked in `Character.suffocationExhaustionLevels`).
// The TRIGGER (is this creature out of breath / choking?) and the 1+CON-min
// breath-hold are the consumer's environmental model, like every other scene
// fact — so both planners are consumer-driven:
//   - `tickSuffocation` once at the end of each turn the creature can't breathe,
//   - `recoverFromBreath` once when it can breathe again.

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { SuffocationExhaustionChangedEvent } from '../../schemas/events/combat.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { EXHAUSTION_MAX } from '../../schemas/primitives.js';
import type { ULID } from '../ids-utils.js';

export interface TickSuffocationIntent {
  readonly type: 'TickSuffocation';
  readonly characterId: string;
  readonly at?: string;
}

export interface RecoverFromBreathIntent {
  readonly type: 'RecoverFromBreath';
  readonly characterId: string;
  readonly at?: string;
}

// One end-of-turn tick: +1 Exhaustion level, recorded against the reversible
// suffocation counter. Already at the lethal cap (6) → no-op (the creature is
// already dead by the Exhaustion-6 rule; nothing more to accrue). Reaching 6
// here kills via the shared lethal-at-6 path in the reducer — RAW: long enough
// without air is fatal.
export const planTickSuffocation = (
  state: CampaignState,
  intent: TickSuffocationIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (character.exhaustion >= EXHAUSTION_MAX) return [];
  const event: SuffocationExhaustionChangedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'SuffocationExhaustionChanged',
    targetId: intent.characterId as ULID,
    fromLevel: character.exhaustion,
    toLevel: character.exhaustion + 1,
    suffocationDelta: 1,
  };
  return [event];
};

// Breathing resumes: remove exactly the Exhaustion levels accrued from
// suffocating (`suffocationExhaustionLevels`), leaving any Exhaustion from
// other sources intact. No suffocation-sourced levels → no-op.
export const planRecoverFromBreath = (
  state: CampaignState,
  intent: RecoverFromBreathIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const accrued = character.suffocationExhaustionLevels;
  if (accrued <= 0) return [];
  const toLevel = Math.max(0, character.exhaustion - accrued);
  const event: SuffocationExhaustionChangedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'SuffocationExhaustionChanged',
    targetId: intent.characterId as ULID,
    fromLevel: character.exhaustion,
    toLevel,
    suffocationDelta: -accrued,
  };
  return [event];
};
