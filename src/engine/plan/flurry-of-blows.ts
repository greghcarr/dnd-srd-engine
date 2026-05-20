import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { RNG } from '../../rng/index.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { resolveAttack } from './attack.js';
import type { ULID } from '../ids-utils.js';

const KI_RESOURCE_ID = 'ki';
const MONKS_FOCUS_LEVEL = 2;
const BASE_STRIKES = 2;
// Monk L10 Heightened Focus: Flurry of Blows makes three Unarmed Strikes
// instead of two.
const HEIGHTENED_FOCUS_LEVEL = 10;
const HEIGHTENED_STRIKES = 3;
const UNARMED_STRIKE_DEF_ID = 'unarmed-strike';

export interface FlurryOfBlowsIntent {
  readonly type: 'FlurryOfBlows';
  readonly monkId: string;
  readonly targetId: string;
  // The monk's Unarmed Strike item instance. RAW: Flurry of Blows makes
  // Unarmed Strikes specifically, so the planner rejects any other weapon.
  readonly weaponInstanceId: string;
  readonly at?: string;
}

// Monk L2 Monk's Focus — Flurry of Blows. Spend 1 Focus Point to make two
// Unarmed Strikes as a Bonus Action (three at Monk level 10+ via
// Heightened Focus). The strikes resolve through the normal attack path
// (resolveAttack), so on-hit riders, mastery, and the Martial Arts die
// all apply; they do NOT consume the Attack-action budget (Flurry rides
// the Bonus Action). RAW deviation: the "immediately after you take the
// Attack action" timing isn't enforced (the engine's bonus-action timing
// is loose); the Bonus Action and Focus Point are still consumed.
export const planFlurryOfBlows = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: FlurryOfBlowsIntent,
): ReadonlyArray<Event> => {
  const monk = state.characters[intent.monkId];
  if (!monk) throw new Error(`Unknown monk ${intent.monkId}`);
  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);

  const monkLevel = monk.classes.find((c) => c.classId === 'monk')?.level ?? 0;
  if (monkLevel < MONKS_FOCUS_LEVEL) {
    throw new Error(`${monk.name} does not have Monk's Focus (requires Monk level ${MONKS_FOCUS_LEVEL})`);
  }
  const ki = monk.resources.find((r) => r.resourceId === KI_RESOURCE_ID);
  if (!ki || ki.current <= 0) {
    throw new Error(`${monk.name} has no Focus Points to spend`);
  }
  const weaponInstance = state.itemInstances[intent.weaponInstanceId];
  if (!weaponInstance) throw new Error(`Unknown weapon ${intent.weaponInstanceId}`);
  if (weaponInstance.definitionId !== UNARMED_STRIKE_DEF_ID) {
    throw new Error('Flurry of Blows makes Unarmed Strikes; pass an unarmed-strike instance');
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  // Bonus-action economy (only inside an active encounter where the monk
  // is the active combatant; out-of-encounter calls skip the gate).
  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.monkId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${monk.name} has already used their bonus action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.monkId,
        kind: 'bonusAction',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.monkId,
    resourceId: KI_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  const strikes = monkLevel >= HEIGHTENED_FOCUS_LEVEL ? HEIGHTENED_STRIKES : BASE_STRIKES;
  for (let i = 0; i < strikes; i += 1) {
    const resolution = resolveAttack({
      state,
      content,
      rng,
      attackerId: intent.monkId,
      targetId: intent.targetId,
      weaponInstanceId: intent.weaponInstanceId,
      at,
    });
    events.push(...resolution);
  }

  return events;
};
