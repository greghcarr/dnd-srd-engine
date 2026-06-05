// Slice 672: Blink end-of-turn d20 roll.
//
// RAW (SRD 5.2.1 Blink): "At the end of each of your turns, you
// roll 1d20. On an 11 or higher, you vanish from your current
// Plane of Existence and appear in the Ethereal Plane (the spell
// fails and the casting is wasted if you were already there). At
// the start of your next turn, and when the spell ends if you are
// on the Ethereal Plane, you return to an unoccupied space of your
// choice that you can see within 10 feet of the space you vanished
// from."
//
// Slice 672 wires the d20 mechanic via a dedicated planner. The
// consumer invokes `engine.plan.blinkTurnEnd({ characterId })` at
// the end of each of the bearer's turns while `blink-active` is on
// them; on 11+ the planner adds `blink-ethereal-active`; on the
// bearer's NEXT turn-start the consumer commits ConditionRemoved
// for the ethereal marker (re-emerging). Position changes and the
// "unoccupied space within 10 ft" choice are consumer-managed
// (engine has no positions).

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import { D20_SIDES } from '../../internal/constants.js';

const BLINK_ACTIVE = 'blink-active';
const BLINK_ETHEREAL_ACTIVE = 'blink-ethereal-active';
const BLINK_THRESHOLD = 11;

export interface BlinkTurnEndIntent {
  readonly type: 'BlinkTurnEnd';
  readonly characterId: string;
  readonly at?: string;
}

export const planBlinkTurnEnd = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: BlinkTurnEndIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (!character.appliedConditions.some((c) => c.conditionId === BLINK_ACTIVE)) {
    throw new Error(`${character.name} has no active Blink spell`);
  }
  const at = intent.at ?? nowIso();
  const roll = rollDie(D20_SIDES, rng);
  const events: Event[] = [];
  if (roll >= BLINK_THRESHOLD) {
    // RAW: spell fails if already ethereal. We model "fails" as
    // "no-op" — the bearer stays ethereal until the next turn-start
    // (which is the consumer's job to commit).
    if (character.appliedConditions.some((c) => c.conditionId === BLINK_ETHEREAL_ACTIVE)) {
      return events;
    }
    const applied: ConditionAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.characterId as ULID,
      conditionId: BLINK_ETHEREAL_ACTIVE,
      appliedConditionId: newAppliedConditionId() as ULID,
      sourceCharacterId: intent.characterId as ULID,
    };
    events.push(applied);
  } else if (character.appliedConditions.some((c) => c.conditionId === BLINK_ETHEREAL_ACTIVE)) {
    // Re-emerge on a sub-threshold roll if for some reason the
    // bearer was still ethereal — defensive only; normally the
    // consumer commits ConditionRemoved at the START of the
    // bearer's next turn, before this turn-end roll fires again.
    const removed: ConditionRemovedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: intent.characterId as ULID,
      conditionId: BLINK_ETHEREAL_ACTIVE,
    };
    events.push(removed);
  }
  return events;
};
