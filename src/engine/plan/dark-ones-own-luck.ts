import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const DARK_ONES_OWN_LUCK_RESOURCE_ID = 'dark-ones-own-luck';
const DARK_ONES_OWN_LUCK_DIE_SIDES = 10;

export interface DarkOnesOwnLuckIntent {
  readonly type: 'DarkOnesOwnLuck';
  readonly warlockId: string;
  readonly at?: string;
}

// Outcome (not a PlanResult): the planner spends a use + rolls the d10 and
// returns it so the consumer can add it to whichever ability check or
// saving throw it is augmenting — the same shape as Hero Points / Deflect
// Attacks (the engine doesn't mutate the linked roll).
export interface DarkOnesOwnLuckOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly d10: number;
}

// Fiend Patron L6 Dark One's Own Luck (SRD 5.2.1): "When you make an
// ability check or a saving throw, you can use this feature to add 1d10 to
// your roll. You can do so after seeing the roll but before any of the
// roll's effects occur. ... uses equal to your Charisma modifier (minimum
// of once) ... regain all expended uses when you finish a Long Rest."
//
// Gated by the `dark-ones-own-luck` resource (max max(1, CHA mod), recharge
// longRest) the subclass grants — its presence IS the feature. The "after
// seeing the roll" timing is naturally consumer-managed: the consumer reads
// the d20 result, then calls this to get the d10 to add.
export const planDarkOnesOwnLuck = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: DarkOnesOwnLuckIntent,
): DarkOnesOwnLuckOutcome => {
  const warlock = state.characters[intent.warlockId];
  if (!warlock) throw new Error(`Unknown character ${intent.warlockId}`);
  const resource = warlock.resources.find((r) => r.resourceId === DARK_ONES_OWN_LUCK_RESOURCE_ID);
  if (resource === undefined) {
    throw new Error(`${warlock.name} does not have Dark One's Own Luck (Fiend Patron L6)`);
  }
  if (resource.current <= 0) {
    throw new Error(`${warlock.name} has no Dark One's Own Luck uses remaining (regain on a Long Rest)`);
  }

  const at = intent.at ?? nowIso();
  const d10 = rollDie(DARK_ONES_OWN_LUCK_DIE_SIDES, rng);
  const events: Event[] = [
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.warlockId as ULID,
      resourceId: DARK_ONES_OWN_LUCK_RESOURCE_ID,
      amount: 1,
    } satisfies ResourceSpentEvent,
  ];
  return { events, d10 };
};
