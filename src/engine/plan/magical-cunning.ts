import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { PactSlotsRegainedEvent } from '../../schemas/events/spellcasting.js';
import { computeSpellSlots } from '../../derive/spell-slots.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const WARLOCK_CLASS_ID = 'warlock';
const MAGICAL_CUNNING_LEVEL = 2;
const MAGICAL_CUNNING_GATE_RESOURCE_ID = 'magical-cunning';
const MAGICAL_CUNNING_SOURCE = 'magical-cunning';

export interface MagicalCunningIntent {
  readonly type: 'MagicalCunning';
  readonly warlockId: string;
  readonly at?: string;
}

// Warlock L2 Magical Cunning. RAW (SRD 5.2.1 Warlock L2): "You can
// perform an esoteric rite for 1 minute. At the end of it, you
// regain expended Pact Magic spell slots but no more than a number
// equal to half your maximum (round up). Once you use this feature,
// you can't do so again until you finish a Long Rest."
//
// Spends the per-long-rest `magical-cunning` resource gate (max 1,
// recharge: 'longRest'), then refunds expended Pact Magic slots up
// to `ceil(maxPactSlots / 2)`. Throws when no slots are expended
// (no-op rite would still consume the gate, which is RAW-permissible
// but a UX trap; mirrors how Tactical Mind / Second Wind reject when
// the trailing effect would be wasted).
//
// No action economy consumption: the rite is a 1-minute
// out-of-combat activity by RAW design. Consumers driving a turn-by-
// turn UI should surface the planner only between encounters or as
// part of a short-rest sequence.
//
// PactSlotsRegained is a new event type (slice 637); the reducer
// decrements `pactSlotsUsed` by `count`, clamped at 0. Designed to
// be reusable when Warlock L20 Eldritch Master ships its planner
// (same shape, count = 'all expended').
export const planMagicalCunning = (
  state: CampaignState,
  content: ResolvedContent,
  _rng: RNG,
  intent: MagicalCunningIntent,
): ReadonlyArray<Event> => {
  const warlock = state.characters[intent.warlockId];
  if (!warlock) throw new Error(`Unknown character ${intent.warlockId}`);
  const enrollment = warlock.classes.find((c) => c.classId === WARLOCK_CLASS_ID);
  if (enrollment === undefined || enrollment.level < MAGICAL_CUNNING_LEVEL) {
    throw new Error(
      `${warlock.name} does not have Magical Cunning (requires Warlock level ${MAGICAL_CUNNING_LEVEL})`,
    );
  }

  const gate = warlock.resources.find((r) => r.resourceId === MAGICAL_CUNNING_GATE_RESOURCE_ID);
  if (gate === undefined || gate.current <= 0) {
    throw new Error(
      `${warlock.name} has already used Magical Cunning (regain on a Long Rest)`,
    );
  }

  const slots = computeSpellSlots(warlock, content.classes);
  const maxPactSlots = slots.pactSlots?.count ?? 0;
  if (maxPactSlots <= 0) {
    throw new Error(`${warlock.name} has no Pact Magic slot pool`);
  }
  const regainCap = Math.ceil(maxPactSlots / 2);
  const expended = warlock.pactSlotsUsed;
  const regain = Math.min(regainCap, expended);
  if (regain <= 0) {
    throw new Error(`${warlock.name} has no expended Pact Magic slots to regain`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.warlockId as ULID,
    resourceId: MAGICAL_CUNNING_GATE_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'PactSlotsRegained',
    characterId: intent.warlockId as ULID,
    count: regain,
    source: MAGICAL_CUNNING_SOURCE,
  } satisfies PactSlotsRegainedEvent);

  return events;
};
