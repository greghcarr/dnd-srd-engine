import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { HealedEvent } from '../../schemas/events/combat.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const FIGHTER_CLASS_ID = 'fighter';
const SECOND_WIND_RESOURCE = 'second-wind';
const SECOND_WIND_DIE_SIDES = 10;

export interface SecondWindIntent {
  readonly type: 'SecondWind';
  readonly fighterId: string;
  readonly at?: string;
}

// Fighter L1 Second Wind. RAW (SRD 5.2.1 Fighter L1): "As a Bonus
// Action, you can use it to regain Hit Points equal to 1d10 plus
// your Fighter level. You can use this feature twice. You regain
// one expended use when you finish a Short Rest, and you regain
// all expended uses when you finish a Long Rest."
//
// The L4 / L10 progression columns expand the pool (3 / 4 uses); the
// pool size is class-level driven and managed by the GrantResource
// effects on the Fighter level table, so the planner just consumes
// one use and rolls 1d10 + Fighter level.
//
// Bonus-action economy is gated when invoked inside an active
// encounter on the fighter's own turn; out-of-encounter calls skip
// the gate (Second Wind can be used between encounters per RAW).
//
// RAW deviation: the L7 Tactical Mind extension (spend Second Wind
// to add 1d10 to a failed ability check, no HP refunded) is a
// separate path that will land with its own slice; this planner
// only covers the L1 HP-regain path.
export const planSecondWind = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: SecondWindIntent,
): ReadonlyArray<Event> => {
  const fighter = state.characters[intent.fighterId];
  if (!fighter) throw new Error(`Unknown character ${intent.fighterId}`);

  const fighterClass = fighter.classes.find((c) => c.classId === FIGHTER_CLASS_ID);
  if (!fighterClass) {
    throw new Error(`${fighter.name} does not have Second Wind (Fighter L1 feature)`);
  }

  const resource = fighter.resources.find((r) => r.resourceId === SECOND_WIND_RESOURCE);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${fighter.name} has no Second Wind uses remaining (regain 1 on a Short Rest, all on a Long Rest)`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.fighterId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${fighter.name} has already used their bonus action this turn`);
      }
      const bonusConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.fighterId,
        kind: 'bonusAction',
      };
      events.push(bonusConsumed);
    }
  }

  const spend: ResourceSpentEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.fighterId as ULID,
    resourceId: SECOND_WIND_RESOURCE,
    amount: 1,
  };
  events.push(spend);

  const die = rollDie(SECOND_WIND_DIE_SIDES, rng);
  const amount = die + fighterClass.level;
  const healed: HealedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'Healed',
    targetId: intent.fighterId as ULID,
    amount,
    source: 'second-wind',
  };
  events.push(healed);

  return events;
};
