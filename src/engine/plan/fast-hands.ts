import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ActionEconomyConsumedEvent,
  FastHandsActivatedEvent,
} from '../../schemas/events/action-economy.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const ROGUE_CLASS_ID = 'rogue';
const THIEF_SUBCLASS_ID = 'thief';
const FAST_HANDS_LEVEL = 3;

export type FastHandsMode = 'sleightOfHand' | 'utilize' | 'useMagicItem';

export interface FastHandsIntent {
  readonly type: 'FastHands';
  readonly thiefId: string;
  // Which Fast Hands sub-action the player wants. The planner
  // consumes the Bonus Action and emits a FastHandsActivated marker
  // event tagged with the mode; the consumer chains to the
  // appropriate follow-up planner:
  //   - 'sleightOfHand' → planAbilityCheck (DEX + 'sleight-of-hand')
  //     for picking a lock / disarming a trap / picking a pocket.
  //   - 'utilize' → planUtilize for an object interaction.
  //   - 'useMagicItem' → planUseItem for a magic item that requires
  //     the Magic action.
  // The planner intentionally doesn't auto-dispatch — Fast Hands is
  // the gate; the sub-action's own RNG / target / DC is supplied by
  // the consumer at chain time.
  readonly mode: FastHandsMode;
  readonly at?: string;
}

// Rogue Thief subclass L3 Fast Hands. RAW (SRD 5.2.1 Thief L3): "As
// a Bonus Action, you can do one of the following. Sleight of Hand
// — Make a Dexterity (Sleight of Hand) check to pick a lock or
// disarm a trap with Thieves' Tools or to pick a pocket. Use an
// Object — Take the Utilize action, or take the Magic action to use
// a magic item that requires that action."
//
// Gates on Rogue L3+ enrollment with the `thief` subclass, active
// encounter on the thief's own turn, BA available. Emits
// `ActionEconomyConsumed { bonusAction } + FastHandsActivated {
// mode }`. The consumer chains to the chosen mode's follow-up
// planner; the BA-used flag (set by the paired ActionEconomyConsumed)
// prevents a second Fast Hands attempt the same turn.
export const planFastHands = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: FastHandsIntent,
): ReadonlyArray<Event> => {
  const thief = state.characters[intent.thiefId];
  if (!thief) throw new Error(`Unknown character ${intent.thiefId}`);
  const enrollment = thief.classes.find((c) => c.classId === ROGUE_CLASS_ID);
  if (
    enrollment === undefined ||
    enrollment.level < FAST_HANDS_LEVEL ||
    enrollment.subclassId !== THIEF_SUBCLASS_ID
  ) {
    throw new Error(
      `${thief.name} does not have Fast Hands (requires Rogue level ${FAST_HANDS_LEVEL} with the Thief subclass)`,
    );
  }

  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) {
    throw new Error('Fast Hands requires an active encounter');
  }
  const encounter = state.encounters[encounterId];
  if (!encounter || encounter.status !== 'active') {
    throw new Error('Fast Hands requires an active encounter');
  }
  const active = encounter.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.thiefId) {
    throw new Error('Fast Hands can only be used on your own turn');
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${thief.name} has already used their bonus action this turn`);
  }

  const at = intent.at ?? nowIso();
  const bonusConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.thiefId,
    kind: 'bonusAction',
  };
  const activated: FastHandsActivatedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'FastHandsActivated',
    encounterId,
    combatantId: intent.thiefId,
    mode: intent.mode,
  };
  return [bonusConsumed, activated];
};
