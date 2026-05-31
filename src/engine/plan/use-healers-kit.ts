import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { StabilizedEvent } from '../../schemas/events/combat.js';
import type { ItemChargeConsumedEvent } from '../../schemas/events/charges.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const HEALERS_KIT_DEFINITION_ID = 'healers-kit';
const HEALERS_KIT_CHARGE_COST = 1;

export interface UseHealersKitIntent {
  readonly type: 'UseHealersKit';
  readonly healerId: string;
  readonly healersKitInstanceId: string;
  readonly targetId: string;
  readonly at?: string;
}

// Healer's Kit (SRD 5.2.1 Equipment): "A Healer's Kit has ten uses.
// As a Utilize action, you can expend one of its uses to stabilize
// an Unconscious creature that has 0 Hit Points without needing to
// make a Wisdom (Medicine) check."
//
// Planner validates: the kit instance exists and is the right
// definition; chargesRemaining > 0; the target is at 0 HP, not yet
// stable, and not dead (death-save kill threshold reached). Emits
// `ActionEconomyConsumed(action)` (only inside an active encounter
// on the healer's turn — the Utilize action consumes the Action),
// `ItemChargeConsumed(1)`, and `Stabilized`.
//
// RAW deviations (intentional):
// - Kit-ownership: not enforced (RAW assumes the user is holding it;
//   the engine doesn't model "in-hand vs. in-pack" granularity for
//   gear). A future inventory-grip primitive could gate this.
// - Range: RAW implies adjacency; the engine doesn't model adjacency
//   for gear-use either, so consumers gate positionally.
export const planUseHealersKit = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: UseHealersKitIntent,
): ReadonlyArray<Event> => {
  const healer = state.characters[intent.healerId];
  if (!healer) throw new Error(`Unknown character ${intent.healerId}`);

  const kit = state.itemInstances[intent.healersKitInstanceId];
  if (!kit) throw new Error(`Unknown item instance ${intent.healersKitInstanceId}`);
  if (kit.definitionId !== HEALERS_KIT_DEFINITION_ID) {
    throw new Error(
      `Item ${intent.healersKitInstanceId} is ${kit.definitionId}, not a healers-kit`,
    );
  }
  if ((kit.chargesRemaining ?? 0) <= 0) {
    throw new Error(`Healer's Kit ${intent.healersKitInstanceId} has no charges remaining`);
  }

  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);
  if (target.hp.current !== 0) {
    throw new Error(
      `${target.name} is not at 0 HP (current ${target.hp.current}); Healer's Kit stabilizes only unconscious creatures at 0 HP`,
    );
  }
  if (target.deathSaves.stable === true) {
    throw new Error(`${target.name} is already stable`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.healerId) {
      if (active.turnUsage.actionUsed) {
        throw new Error(`${healer.name} has already used their action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.healerId,
        kind: 'action',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ItemChargeConsumed',
    itemInstanceId: intent.healersKitInstanceId as ULID,
    amount: HEALERS_KIT_CHARGE_COST,
    byCharacterId: intent.healerId as ULID,
    forEffect: 'healers-kit-stabilize',
  } satisfies ItemChargeConsumedEvent);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'Stabilized',
    targetId: intent.targetId as ULID,
  } satisfies StabilizedEvent);

  return events;
};
