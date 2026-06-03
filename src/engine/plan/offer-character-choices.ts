// Slice 618: emit ChoiceRequired events for every unresolved
// `OfferChoice when: 'onAcquire'` on a freshly-created character.
//
// The gap this closes (per [docs/status.md](docs/status.md)): fresh L1
// characters built via `CharacterCreated` (not stepped through
// `planLevelUp`) don't receive their L1 OfferChoice grants. Fighter L1
// Fighting Style is the canonical user — its `OfferChoice when:
// 'onAcquire'` only fires through the level-up path, so a direct-built
// L1 fighter never gets a ChoiceRequired for their style. Paladin /
// Ranger Fighting Style work because they're acquired on the L1→L2
// step (which does go through planLevelUp).
//
// Usage: consumers commit `CharacterCreated`, then call
// `engine.plan.offerCharacterChoices({ characterId })` to drain L1
// (and any other `when: 'onAcquire'`) choices. The planner is
// idempotent — repeat calls dedupe via `pendingChoice.promptKey`
// (slice-618 schema addition).

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ChoiceRequiredEvent } from '../../schemas/events/level-up.js';
import type { Effect } from '../../schemas/effects.js';
import { collectEffectsFromCharacter } from '../../derive/effect-stack.js';
import { newChoiceId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

export interface OfferCharacterChoicesIntent {
  readonly type: 'OfferCharacterChoices';
  readonly characterId: string;
  readonly at?: string;
}

export const planOfferCharacterChoices = (
  state: CampaignState,
  content: ResolvedContent,
  intent: OfferCharacterChoicesIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const at = intent.at ?? nowIso();

  // Walk every effective Effect on the character (species traits,
  // background traits, class features at each enrolled level, feats,
  // items, conditions). GrantFeat references are already expanded.
  const effects = collectEffectsFromCharacter({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });

  // Dedupe by `promptKey`: any choice already present (pending or
  // resolved) for this character is skipped. This is what makes the
  // planner safe to call repeatedly — e.g., after CharacterCreated AND
  // after a subsequent ItemAcquired that grants a feat with its own
  // OfferChoice.
  const existingPromptKeys = new Set<string>();
  for (const pc of Object.values(state.pendingChoices)) {
    if (pc.forCharacterId !== character.id) continue;
    if (pc.promptKey === undefined) continue;
    existingPromptKeys.add(pc.promptKey);
  }

  const events: Event[] = [];
  for (const effect of effects) {
    if (effect.kind !== 'OfferChoice') continue;
    // Skip choices that fire at other lifecycle moments — `onLongRest`
    // is a rest-time choice (resource-pick on long rest), `onLevelUp`
    // belongs to planLevelUp. Only `onAcquire` fires at character
    // creation / feature-grant time.
    if (effect.when !== 'onAcquire') continue;
    if (existingPromptKeys.has(effect.choiceId)) continue;
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
    // Mirror the addition in the local set so two OfferChoice entries
    // with the same choiceId in the effective-effects walk don't
    // double-emit. (Unlikely in practice, but cheap.)
    existingPromptKeys.add(effect.choiceId);
  }
  return events;
};
