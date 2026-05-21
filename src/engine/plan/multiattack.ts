import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { RNG } from '../../rng/index.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { resolveAttack } from './attack.js';
import { applyAll } from '../apply.js';
import type { ULID } from '../ids-utils.js';

export interface MultiattackIntent {
  readonly type: 'Multiattack';
  readonly attackerId: string;
  readonly targetId: string;
  readonly at?: string;
}

export const planMultiattack = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: MultiattackIntent,
): ReadonlyArray<Event> => {
  const attacker = state.characters[intent.attackerId];
  if (!attacker) throw new Error(`Unknown attacker ${intent.attackerId}`);
  const pattern = attacker.multiattack;
  if (pattern === undefined) {
    throw new Error(`${attacker.name} has no multiattack pattern`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const encounterId = state.activeEncounterId;
  if (encounterId !== undefined) {
    const encounter = state.encounters[encounterId];
    if (encounter && encounter.status === 'active') {
      const active = encounter.combatants[encounter.activeIndex];
      if (active?.combatantId === intent.attackerId && !active.turnUsage.actionUsed) {
        const actionConsumed: ActionEconomyConsumedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ActionEconomyConsumed',
          encounterId,
          combatantId: intent.attackerId,
          kind: 'action',
        };
        events.push(actionConsumed);
      }
    }
  }

  // Thread state across swings so each attack sees the prior ones'
  // effects: a target dropped to lower HP, a condition applied (a Prone
  // target grants advantage to the next swing), and one-shot conditions on
  // the attacker (Sap / Vex) consumed by the first swing rather than every
  // swing. `apply` is pure, so this stays replay-deterministic.
  let workingState = applyAll(state, events);
  for (const swing of pattern.attacks) {
    for (let i = 0; i < swing.count; i++) {
      const resolution = resolveAttack({
        state: workingState,
        content,
        rng,
        attackerId: intent.attackerId,
        targetId: intent.targetId,
        weaponInstanceId: swing.weaponInstanceId,
        at,
      });
      events.push(...resolution);
      workingState = applyAll(workingState, resolution);
    }
  }
  return events;
};
