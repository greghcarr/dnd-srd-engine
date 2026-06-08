import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { SpellSlotsRegainedEvent } from '../../schemas/events/spellcasting.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const DRUID_CLASS_ID = 'druid';
const NATURAL_RECOVERY_RESOURCE_ID = 'natural-recovery';
const NATURAL_RECOVERY_SOURCE = 'natural-recovery';
const MAX_RECOVERABLE_SLOT_LEVEL = 5; // RAW: none of the recovered slots can be level 6+

export interface NaturalRecoverySlot {
  readonly level: number;
  readonly count: number;
}

export interface NaturalRecoveryIntent {
  readonly type: 'NaturalRecovery';
  readonly druidId: string;
  readonly slots: ReadonlyArray<NaturalRecoverySlot>;
  readonly at?: string;
}

// Druid Circle of the Land L6 Natural Recovery — the slot-recovery arm.
// RAW (SRD 5.2.1): "When you finish a Short Rest, you can choose expended
// spell slots to recover. The spell slots can have a combined level equal
// to or less than half your Druid level (round up), and none of them can
// be level 6+. Once you recover spell slots with this feature, you can't
// do so again until you finish a Long Rest."
//
// Gated by the `natural-recovery` resource (max 1, recharge longRest)
// granted by the subclass — its presence IS the feature, so no separate
// subclass/level check. Reuses the slice-721 `SpellSlotsRegained` event.
//
// The other arm (cast one prepared Circle spell without a slot, once per
// Long Rest) depends on the Circle Spells land-specific list and is wired
// with that feature; this planner covers the slot-recovery arm.
export const planNaturalRecovery = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: NaturalRecoveryIntent,
): ReadonlyArray<Event> => {
  const druid = state.characters[intent.druidId];
  if (!druid) throw new Error(`Unknown character ${intent.druidId}`);
  const enrollment = druid.classes.find((c) => c.classId === DRUID_CLASS_ID);
  if (enrollment === undefined) throw new Error(`${druid.name} is not a Druid`);
  const gate = druid.resources.find((r) => r.resourceId === NATURAL_RECOVERY_RESOURCE_ID);
  if (gate === undefined) {
    throw new Error(`${druid.name} does not have Natural Recovery (Circle of the Land L6)`);
  }
  if (gate.current <= 0) {
    throw new Error(`${druid.name} has already used Natural Recovery since their last Long Rest`);
  }
  if (intent.slots.length === 0) {
    throw new Error('Natural Recovery must recover at least one spell slot');
  }

  // Aggregate by level (a request may list the same level twice).
  const byLevel = new Map<number, number>();
  for (const s of intent.slots) {
    if (s.level < 1 || s.level > MAX_RECOVERABLE_SLOT_LEVEL) {
      throw new Error(`Natural Recovery cannot recover a level-${s.level} slot (levels 1-${MAX_RECOVERABLE_SLOT_LEVEL} only)`);
    }
    if (s.count < 1) throw new Error('Natural Recovery slot count must be >= 1');
    byLevel.set(s.level, (byLevel.get(s.level) ?? 0) + s.count);
  }

  let combined = 0;
  for (const [level, count] of byLevel) {
    const expended = druid.spellSlotsUsed[String(level)] ?? 0;
    if (count > expended) {
      throw new Error(`${druid.name} has only ${expended} expended level-${level} slot(s) to recover (requested ${count})`);
    }
    combined += level * count;
  }
  const budget = Math.ceil(enrollment.level / 2);
  if (combined > budget) {
    throw new Error(`Natural Recovery can recover up to ${budget} combined slot levels at Druid level ${enrollment.level}; requested ${combined}`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.druidId as ULID,
      resourceId: NATURAL_RECOVERY_RESOURCE_ID,
      amount: 1,
    } satisfies ResourceSpentEvent,
  ];
  for (const [level, count] of byLevel) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'SpellSlotsRegained',
      characterId: intent.druidId as ULID,
      slotLevel: level,
      count,
      source: NATURAL_RECOVERY_SOURCE,
    } satisfies SpellSlotsRegainedEvent);
  }
  return events;
};
