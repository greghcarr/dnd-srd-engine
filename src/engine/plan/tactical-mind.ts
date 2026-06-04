import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const FIGHTER_CLASS_ID = 'fighter';
const SECOND_WIND_RESOURCE = 'second-wind';
const TACTICAL_MIND_LEVEL = 2;
const TACTICAL_MIND_DIE_SIDES = 10;

export interface TacticalMindIntent {
  readonly type: 'TacticalMind';
  readonly fighterId: string;
  // The fighter's own ability check that already failed (the original
  // d20 + modifiers). The planner rolls 1d10, adds it, and reports
  // whether the boosted total now meets the threshold.
  readonly originalRollTotal: number;
  // The threshold the check needed to meet (the DC).
  readonly threshold: number;
  readonly at?: string;
}

export interface TacticalMindOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly dieRoll: number;
  // True when adding 1d10 lifts the failed roll to meet the threshold.
  readonly turnedSuccess: boolean;
}

// Fighter L2 Tactical Mind. RAW (SRD 5.2.1 Fighter L2): "When you fail
// an ability check, you can expend a use of your Second Wind to push
// yourself toward success. Rather than regaining Hit Points, you roll
// 1d10 and add the number rolled to the ability check, potentially
// turning it into a success. If the check still fails, this use of
// Second Wind isn't expended."
//
// Self-targeted mirror of planPeerlessSkill (College of Lore L14):
// failed ability check, optional reroll, resource consumed only when
// the boost lifts the total to meet the threshold. RAW deviates from
// the L1 Second Wind path (Bonus Action, regain HP); Tactical Mind
// trades the HP regain for a check boost and consumes no action.
//
// The consumer passes the already-failed total and the threshold it
// needed to meet; the planner returns the rolled die plus
// `turnedSuccess` so the consumer can decide whether to commit the
// trailing chain. No ActionEconomyConsumed is emitted (RAW: not an
// action / bonus action / reaction).
export const planTacticalMind = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: TacticalMindIntent,
): TacticalMindOutcome => {
  const fighter = state.characters[intent.fighterId];
  if (!fighter) throw new Error(`Unknown character ${intent.fighterId}`);
  const enrollment = fighter.classes.find((c) => c.classId === FIGHTER_CLASS_ID);
  if (enrollment === undefined || enrollment.level < TACTICAL_MIND_LEVEL) {
    throw new Error(
      `${fighter.name} does not have Tactical Mind (requires Fighter level ${TACTICAL_MIND_LEVEL})`,
    );
  }

  const resource = fighter.resources.find((r) => r.resourceId === SECOND_WIND_RESOURCE);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${fighter.name} has no Second Wind uses remaining (regain 1 on a Short Rest, all on a Long Rest)`,
    );
  }

  const at = intent.at ?? nowIso();
  const dieRoll = rollDie(TACTICAL_MIND_DIE_SIDES, rng);
  const turnedSuccess = intent.originalRollTotal + dieRoll >= intent.threshold;

  // RAW: "If the check still fails, this use of Second Wind isn't
  // expended." The resource is spent only when it turns the roll into
  // a success.
  const events: Event[] = turnedSuccess
    ? [
        {
          id: newEventId() as ULID,
          at,
          type: 'ResourceSpent',
          characterId: intent.fighterId as ULID,
          resourceId: SECOND_WIND_RESOURCE,
          amount: 1,
        } satisfies ResourceSpentEvent,
      ]
    : [];

  return { events, dieRoll, turnedSuccess };
};
