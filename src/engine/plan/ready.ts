import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ActionEconomyConsumedEvent,
  ActionReadiedEvent,
} from '../../schemas/events/action-economy.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { assertActorCanAct } from './_actor-state.js';
import type { ULID } from '../ids-utils.js';

export interface ReadyIntent {
  readonly type: 'Ready';
  readonly combatantId: string;
  readonly trigger: string;
  readonly at?: string;
}

// L1 RAW Ready action (PHB 2024 ch.7 Actions):
//   "You take the Ready action to wait for a particular circumstance
//    before acting. To do so, you take this action on your turn,
//    which lets you act using your Reaction before the start of your
//    next turn. First, you decide what perceivable circumstance will
//    trigger your reaction. Then, you choose the action you will take
//    in response to that trigger, or you choose to move up to your
//    Speed in response to it."
//
// Slice 572 scope:
//   - Consumes the combatant's Action (RAW: Ready IS the Action you
//     take on your turn).
//   - Stamps the trigger description on the combatant's turnUsage as
//     `readiedAction = { trigger }`. The consumer reads this when the
//     trigger fires.
//   - The combatant's Reaction stays available (RAW: "lets you act
//     using your Reaction" — the readied response will consume it).
//   - The readied state expires at TurnStarted (next turn). RAW:
//     "before the start of your next turn."
//
// Out of scope (future engine surface):
//   - Trigger-and-execute machinery. When the trigger fires, the
//     consumer calls the existing reactive planners (planAttack,
//     planCastSpell, etc.) themselves, consuming the Reaction via
//     ActionEconomyConsumed { kind: 'reaction' } on commit.
//   - Readied-spell Concentration semantic (RAW: "holding onto the
//     spell's magic requires Concentration"). The consumer can begin
//     concentration via planCastSpell when readying a spell.
//
// Requires the combatant to be in an active encounter and on their
// turn (Ready is an Action, which is a turn-bound resource).
export const planReady = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: ReadyIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.combatantId];
  if (!character) throw new Error(`Unknown combatant ${intent.combatantId}`);
  assertActorCanAct(character, 'Ready');

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Ready requires an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (active === undefined || active.combatantId !== intent.combatantId) {
    throw new Error(`${character.name} must be on their turn to Ready`);
  }
  if (active.turnUsage.actionUsed) {
    throw new Error(`${character.name} has already used their action this turn`);
  }
  if (intent.trigger.trim().length === 0) {
    throw new Error('Ready requires a non-empty trigger description');
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: activeEncounterId,
    combatantId: intent.combatantId,
    kind: 'action',
  } satisfies ActionEconomyConsumedEvent);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ActionReadied',
    encounterId: activeEncounterId,
    combatantId: intent.combatantId,
    trigger: intent.trigger,
  } satisfies ActionReadiedEvent);

  return events;
};
