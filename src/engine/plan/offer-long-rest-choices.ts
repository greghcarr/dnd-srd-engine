// Slice 660: emit ChoiceRequired events for every unresolved
// `OfferChoice when: 'onLongRest'` on a character.
//
// Sibling of slice-618's planOfferCharacterChoices (which fires
// onAcquire choices at character-create time). This planner fires
// onLongRest choices — the canonical use is Druid Circle of the
// Land's land-type pick, which per RAW the druid makes "whenever
// you finish a Long Rest."
//
// Usage: consumers invoke `engine.plan.offerLongRestChoices({
// characterId })` after committing the LongRestEnded events for a
// character. The planner walks the character's effective effect
// stack and emits a fresh ChoiceRequired for each onLongRest
// OfferChoice whose previous PendingChoice (if any) is already
// resolved. Unresolved PendingChoices with the same promptKey
// dedupe (the consumer must resolve the prior choice before a new
// one fires).
//
// Land-swap semantics (deferred): when the druid picks a different
// land than they picked at the previous long rest, the prior land's
// granted spells should be ungranted. The current engine
// accumulates resolutions in pendingChoices, so multiple long-rest
// resolutions for the same promptKey accumulate effects via the
// effect-stack derive. RAW behavior requires the new resolution to
// SUPERSEDE the old. That supersession is a future engine slice
// (needs a PendingChoiceSuperseded event or a derive-layer
// "latest resolution wins" pass). Documented in
// docs/changelog/slice-660.md.

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ChoiceRequiredEvent } from '../../schemas/events/level-up.js';
import type { Effect } from '../../schemas/effects.js';
import { collectEffectsFromCharacter } from '../../derive/effect-stack.js';
import { newChoiceId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

export interface OfferLongRestChoicesIntent {
  readonly type: 'OfferLongRestChoices';
  readonly characterId: string;
  readonly at?: string;
}

export const planOfferLongRestChoices = (
  state: CampaignState,
  content: ResolvedContent,
  intent: OfferLongRestChoicesIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const at = intent.at ?? nowIso();

  const effects = collectEffectsFromCharacter({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });

  // Dedupe: skip a promptKey that already has an UNRESOLVED pending
  // choice (the consumer must resolve the prior one before a new
  // one fires). Resolved choices DON'T dedupe — every long rest
  // gets a fresh ChoiceRequired so the player can pick again.
  const unresolvedPromptKeys = new Set<string>();
  for (const pc of Object.values(state.pendingChoices)) {
    if (pc.forCharacterId !== character.id) continue;
    if (pc.promptKey === undefined) continue;
    if (pc.resolution !== undefined) continue;
    unresolvedPromptKeys.add(pc.promptKey);
  }

  const events: Event[] = [];
  for (const effect of effects) {
    if (effect.kind !== 'OfferChoice') continue;
    if (effect.when !== 'onLongRest') continue;
    if (unresolvedPromptKeys.has(effect.choiceId)) continue;
    const choice: ChoiceRequiredEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ChoiceRequired',
      choiceId: newChoiceId(),
      characterId: character.id,
      promptKey: effect.choiceId,
      prompt: effect.prompt,
      options: effect.options.map((o) => ({
        id: o.id,
        label: o.label,
        effects: o.effects as Effect[],
      })),
      oneOf: effect.oneOf,
    };
    events.push(choice);
    unresolvedPromptKeys.add(effect.choiceId);
  }
  return events;
};
