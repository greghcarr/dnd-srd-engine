// Slice 891 — Ammunition recovery (the "recover half" arm of the Ammunition
// property). RAW (equipment "Ammunition"): "After a fight, you can spend 1
// minute to recover half the ammunition (round down) you used in the fight;
// the rest is lost."
//
// Expenditure happens inline on each ranged attack (see the `ammunition` tail
// in attack.ts). Recovery is a consumer-driven downtime action: the consumer
// knows how many pieces it `spent` (it fired them) and which stack to top up,
// so it passes both and the engine adds `floor(spent / 2)` back to the stack.
// The 1-minute time cost + which fight is over are the consumer's scene model.

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { AmmunitionQuantityChangedEvent } from '../../schemas/events/inventory.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

export interface RecoverAmmunitionIntent {
  readonly type: 'RecoverAmmunition';
  readonly characterId: string;
  // The ammunition stack to top up (must still exist — a stack fully depleted
  // in the fight has retired, so the consumer re-acquires before recovering).
  readonly ammunitionInstanceId: string;
  // How many pieces were used in the fight. The engine restores floor(spent/2).
  readonly spent: number;
  readonly at?: string;
}

export const planRecoverAmmunition = (
  state: CampaignState,
  intent: RecoverAmmunitionIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (intent.spent < 0) throw new Error('Ammunition spent count must be non-negative');
  const ammo = state.itemInstances[intent.ammunitionInstanceId];
  if (!ammo) {
    throw new Error(`Unknown ammunition instance ${intent.ammunitionInstanceId}`);
  }
  const recovered = Math.floor(intent.spent / 2);
  if (recovered <= 0) return [];
  const event: AmmunitionQuantityChangedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'AmmunitionQuantityChanged',
    characterId: intent.characterId as ULID,
    instanceId: intent.ammunitionInstanceId as ULID,
    definitionId: ammo.definitionId,
    delta: recovered,
  };
  return [event];
};
