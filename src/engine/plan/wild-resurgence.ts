import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceRestoredEvent, ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { SpellSlotConsumedEvent, SpellSlotsRegainedEvent } from '../../schemas/events/spellcasting.js';
import { computeAvailableSpellSlots } from '../../derive/spell-slots.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const DRUID_CLASS_ID = 'druid';
const WILD_RESURGENCE_LEVEL = 5;
const WILD_SHAPE_RESOURCE_ID = 'wild-shape';
// Once-per-Long-Rest gate for the Wild-Shape -> slot arm (seeded from a
// GrantResource on the Druid L5 Wild Resurgence feature).
const WILD_RESURGENCE_GATE_ID = 'wild-resurgence';
const REGAINED_SLOT_LEVEL = 1;
const WILD_RESURGENCE_SOURCE = 'wild-resurgence';

export type WildResurgenceMode = 'slot-to-wild-shape' | 'wild-shape-to-slot';

export interface WildResurgenceIntent {
  readonly type: 'WildResurgence';
  readonly druidId: string;
  readonly mode: WildResurgenceMode;
  // For 'slot-to-wild-shape': which standard slot level to expend.
  // Defaults to the lowest available.
  readonly slotLevel?: number;
  readonly at?: string;
}

// Druid L5 Wild Resurgence (PHB 2024 / SRD 5.2.1). Two no-action
// conversions:
//
//   slot-to-wild-shape: "Once on each of your turns, if you have no uses
//     of Wild Shape left, you can give yourself one use by expending a
//     spell slot." Modeled: requires Wild Shape current == 0, expends a
//     standard slot (SpellSlotConsumed) + restores 1 Wild Shape use
//     (ResourceRestored). The "no uses left" precondition is the primary
//     gate; after the conversion Wild Shape is 1, so it can't repeat until
//     that use is spent (transforming), which covers the once-per-turn
//     bound in practice (a strict per-turn flag isn't separately tracked).
//
//   wild-shape-to-slot: "you can expend one use of Wild Shape to give
//     yourself a level 1 spell slot, but you can't do so again until you
//     finish a Long Rest." Modeled: requires Wild Shape >= 1 + the
//     wild-resurgence gate available + an expended level-1 slot to regain;
//     spends 1 Wild Shape use + 1 gate use + regains one level-1 standard
//     slot (SpellSlotsRegained).
//
// Both are "no action required" — no action-economy events.
export const planWildResurgence = (
  state: CampaignState,
  content: ResolvedContent,
  intent: WildResurgenceIntent,
): ReadonlyArray<Event> => {
  const druid = state.characters[intent.druidId];
  if (!druid) throw new Error(`Unknown character ${intent.druidId}`);
  const enrollment = druid.classes.find((c) => c.classId === DRUID_CLASS_ID);
  if (enrollment === undefined || enrollment.level < WILD_RESURGENCE_LEVEL) {
    throw new Error(`${druid.name} does not have Wild Resurgence (requires Druid level ${WILD_RESURGENCE_LEVEL})`);
  }
  const wildShape = druid.resources.find((r) => r.resourceId === WILD_SHAPE_RESOURCE_ID);
  if (wildShape === undefined) throw new Error(`${druid.name} has no Wild Shape resource`);

  const at = intent.at ?? nowIso();

  if (intent.mode === 'slot-to-wild-shape') {
    if (wildShape.current > 0) {
      throw new Error(`${druid.name} still has Wild Shape uses; the slot-to-Wild-Shape conversion needs none left`);
    }
    if (wildShape.current >= wildShape.max) {
      throw new Error(`${druid.name} cannot regain a Wild Shape use (already at maximum)`);
    }
    const available = computeAvailableSpellSlots(druid, content.classes);
    const slotLevel = intent.slotLevel ?? available.standardByLevel.findIndex((n) => n > 0) + 1;
    if (slotLevel < 1 || (available.standardByLevel[slotLevel - 1] ?? 0) <= 0) {
      throw new Error(`${druid.name} has no level-${slotLevel < 1 ? 1 : slotLevel} spell slot to expend`);
    }
    return [
      {
        id: newEventId() as ULID,
        at,
        type: 'SpellSlotConsumed',
        characterId: intent.druidId as ULID,
        slotLevel,
      } satisfies SpellSlotConsumedEvent,
      {
        id: newEventId() as ULID,
        at,
        type: 'ResourceRestored',
        characterId: intent.druidId as ULID,
        resourceId: WILD_SHAPE_RESOURCE_ID,
        amount: 1,
      } satisfies ResourceRestoredEvent,
    ];
  }

  // mode === 'wild-shape-to-slot'
  if (wildShape.current <= 0) {
    throw new Error(`${druid.name} has no Wild Shape use to expend`);
  }
  const gate = druid.resources.find((r) => r.resourceId === WILD_RESURGENCE_GATE_ID);
  if (gate === undefined || gate.current <= 0) {
    throw new Error(`${druid.name} has already converted a Wild Shape use to a slot since their last Long Rest`);
  }
  if ((druid.spellSlotsUsed[String(REGAINED_SLOT_LEVEL)] ?? 0) <= 0) {
    throw new Error(`${druid.name} has no expended level-${REGAINED_SLOT_LEVEL} spell slot to regain`);
  }
  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.druidId as ULID,
      resourceId: WILD_SHAPE_RESOURCE_ID,
      amount: 1,
    } satisfies ResourceSpentEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.druidId as ULID,
      resourceId: WILD_RESURGENCE_GATE_ID,
      amount: 1,
    } satisfies ResourceSpentEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'SpellSlotsRegained',
      characterId: intent.druidId as ULID,
      slotLevel: REGAINED_SLOT_LEVEL,
      count: 1,
      source: WILD_RESURGENCE_SOURCE,
    } satisfies SpellSlotsRegainedEvent,
  ];
};
