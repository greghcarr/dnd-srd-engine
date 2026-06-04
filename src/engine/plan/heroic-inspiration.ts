import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { HeroicInspirationConsumedEvent } from '../../schemas/events/heroic-inspiration.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

export interface ConsumeHeroicInspirationIntent {
  readonly type: 'ConsumeHeroicInspiration';
  readonly characterId: string;
  // Optional narrative descriptor for what the inspiration was
  // applied to (e.g., 'attack', 'save', 'check', 'damage'). Stamped
  // on the event for transparency; the engine does NOT auto-thread
  // a reroll into a prior roll today (consumer-managed reroll
  // integration is deferred -- see slice 542 deferral notes).
  readonly appliedTo?: string;
  readonly at?: string;
}

// Slice 542: spend Heroic Inspiration. RAW: "When you have Heroic
// Inspiration, you can expend it to reroll any die immediately after
// rolling it, and you must use the new roll."
//
// Validates the character has Inspiration; emits
// HeroicInspirationConsumed (the reducer flips the boolean to
// false). The actual reroll integration with a recent d20 is
// consumer-managed for now -- the consumer either re-plans the
// triggering roll with new RNG state OR substitutes the new d20
// into the prior event when displaying outcomes. Future slice
// can extend Halfling Luck's reroll helper to also check for
// Heroic Inspiration as a spend-on-natural-1 alternative.
export const planConsumeHeroicInspiration = (
  state: CampaignState,
  intent: ConsumeHeroicInspirationIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (!character.heroicInspiration) {
    throw new Error(`${character.name} has no Heroic Inspiration to spend`);
  }
  const at = intent.at ?? nowIso();
  const consumed: HeroicInspirationConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'HeroicInspirationConsumed',
    characterId: intent.characterId as ULID,
    ...(intent.appliedTo !== undefined ? { appliedTo: intent.appliedTo } : {}),
  };
  return [consumed];
};
