import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { LegendaryResistanceUsedEvent } from '../../schemas/events/combat.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 839: Legendary Resistance (Aboleth / Sphinx of Lore / Unicorn). RAW
// (SRD 5.2.1): "If the creature fails a saving throw, it can choose to succeed
// instead." A per-day budget (usesPerDay; +1 usesPerDayInLair).
//
// Consumer-driven, the Shield `preventedHit` shape: the consumer orchestrates
// the encounter, sees a legendary creature fail a save, and calls this to spend
// one use — the engine confirms the budget (throwing when exhausted) and emits
// `LegendaryResistanceUsed`; the consumer then treats the triggering save as a
// SUCCESS (it drops the fail consequences, exactly as it drops the damage chain
// on a Shield `preventedHit`). The X/Day budget refreshes on a Long Rest.
//
// `inLair` is a consumer fact (the engine doesn't model lairs / positions):
// when true the cap is `usesPerDayInLair` (falling back to `usesPerDay`).

export interface LegendaryResistanceIntent {
  readonly type: 'LegendaryResistance';
  readonly creatureId: string;
  // The failed SaveRolled being converted to a success (recorded on the event).
  readonly triggeringSaveEventId?: string;
  // Consumer fact: the creature is in its lair (raises the cap). Default false.
  readonly inLair?: boolean;
  readonly at?: string;
}

export const planLegendaryResistance = (
  state: CampaignState,
  content: ResolvedContent,
  intent: LegendaryResistanceIntent,
): ReadonlyArray<Event> => {
  const creature = state.characters[intent.creatureId];
  invariant(creature !== undefined, `Creature ${intent.creatureId} not found`);
  invariant(creature.statblockId !== undefined, `Creature ${intent.creatureId} has no statblockId`);
  const statblock = content.monsters.get(creature.statblockId);
  invariant(statblock !== undefined, `Statblock ${creature.statblockId} not found`);
  const spec = statblock.legendaryResistance;
  if (spec === undefined) {
    throw new Error(`${creature.name} does not have Legendary Resistance`);
  }

  const cap = intent.inLair === true && spec.usesPerDayInLair !== undefined
    ? spec.usesPerDayInLair
    : spec.usesPerDay;
  if (creature.legendaryResistanceUsed >= cap) {
    throw new Error(
      `${creature.name} has no Legendary Resistance left (${creature.legendaryResistanceUsed}/${cap} used)`,
    );
  }

  const at = intent.at ?? nowIso();
  return [{
    id: newEventId() as ULID,
    at,
    type: 'LegendaryResistanceUsed',
    creatureId: intent.creatureId as ULID,
    ...(intent.triggeringSaveEventId !== undefined
      ? { triggeringSaveEventId: intent.triggeringSaveEventId as ULID }
      : {}),
  } satisfies LegendaryResistanceUsedEvent];
};
