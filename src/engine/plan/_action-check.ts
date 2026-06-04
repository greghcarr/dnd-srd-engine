// Shared helper for thin action planners that "use the Action to make
// an ability check" (Search / Study / Influence / Utilize). RAW PHB
// 2024 ch.7 lists each as a discrete action that consumes the Action
// and resolves via an ability check; the planner emits
// `ActionEconomyConsumed { kind: 'action' }` + an `AbilityCheckRolled`
// event chain (the latter via the existing planAbilityCheck path).

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { AbilityScore, Skill } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { assertActorCanAct } from './_actor-state.js';
import { planAbilityCheck } from './checks.js';
import type { ULID } from '../ids-utils.js';

export interface ActionCheckIntent {
  readonly characterId: string;
  readonly ability: AbilityScore;
  readonly skill?: Skill;
  readonly dc?: number;
  readonly at?: string;
}

// Runs the action-economy + ability-check chain for a thin-action
// planner. `actionLabel` is interpolated into the assertActorCanAct
// error message ("Aria cannot Search while Stunned").
export const planActionCheck = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ActionCheckIntent,
  actionLabel: string,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  assertActorCanAct(character, actionLabel);

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.characterId) {
      if (active.turnUsage.actionUsed) {
        throw new Error(`${character.name} has already used their action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.characterId,
        kind: 'action',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  // Delegate the roll to planAbilityCheck. Pass `at` so the
  // ActionEconomyConsumed and AbilityCheckRolled share the same
  // timestamp.
  events.push(...planAbilityCheck(state, content, rng, {
    type: 'AbilityCheck',
    characterId: intent.characterId,
    ability: intent.ability,
    ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
    ...(intent.dc !== undefined ? { dc: intent.dc } : {}),
    at,
  }));

  return events;
};
