import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ActionEconomyConsumedEvent,
  SteadyAimActivatedEvent,
} from '../../schemas/events/action-economy.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const ROGUE_CLASS_ID = 'rogue';
const STEADY_AIM_LEVEL = 3;

export interface SteadyAimIntent {
  readonly type: 'SteadyAim';
  readonly rogueId: string;
  readonly at?: string;
}

// Rogue L3 Steady Aim. RAW (SRD 5.2.1 Rogue L3): "As a Bonus Action,
// you give yourself Advantage on your next attack roll on the current
// turn. You can use this feature only if you haven't moved during
// this turn, and after you use it, your Speed is 0 until the end of
// the current turn."
//
// Mechanically two arms, both surfaced as per-turn flags on the
// combatant's `turnUsage`:
//   - `steadyAimActive`: the next attack roll consumes it for
//     advantage (clears in attack resolution).
//   - `speedZeroUntilEndOfTurn`: the move planner rejects movement
//     while set (clears at TurnStarted).
//
// Gates:
//   - Rogue class L3+ enrollment.
//   - Active encounter on the rogue's own turn.
//   - Bonus Action available.
//   - Haven't moved this turn (feetMovedThisTurn === 0).
//   - Steady Aim not already active this turn (the speed-0 arm makes
//     re-use after a use impossible per RAW, but reject explicitly
//     so the failure mode is clear instead of silently re-emitting).
export const planSteadyAim = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: SteadyAimIntent,
): ReadonlyArray<Event> => {
  const rogue = state.characters[intent.rogueId];
  if (!rogue) throw new Error(`Unknown character ${intent.rogueId}`);
  const enrollment = rogue.classes.find((c) => c.classId === ROGUE_CLASS_ID);
  if (enrollment === undefined || enrollment.level < STEADY_AIM_LEVEL) {
    throw new Error(
      `${rogue.name} does not have Steady Aim (requires Rogue level ${STEADY_AIM_LEVEL})`,
    );
  }

  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) {
    throw new Error('Steady Aim requires an active encounter');
  }
  const encounter = state.encounters[encounterId];
  if (!encounter || encounter.status !== 'active') {
    throw new Error('Steady Aim requires an active encounter');
  }
  const active = encounter.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.rogueId) {
    throw new Error('Steady Aim can only be used on your own turn');
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${rogue.name} has already used their bonus action this turn`);
  }
  if (active.turnUsage.feetMovedThisTurn > 0) {
    throw new Error(
      `${rogue.name} cannot use Steady Aim: already moved ${active.turnUsage.feetMovedThisTurn} ft this turn`,
    );
  }
  if (active.turnUsage.steadyAimActive) {
    throw new Error(`${rogue.name} has already used Steady Aim this turn`);
  }

  const at = intent.at ?? nowIso();
  const bonusConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId,
    combatantId: intent.rogueId,
    kind: 'bonusAction',
  };
  const activated: SteadyAimActivatedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SteadyAimActivated',
    encounterId,
    combatantId: intent.rogueId,
  };
  return [bonusConsumed, activated];
};
