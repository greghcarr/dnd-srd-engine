import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { CharacterCreatedEvent } from '../../schemas/events/progression.js';
import type { CreatureDestroyedEvent } from '../../schemas/events/combat.js';
import { SIZES } from '../../schemas/primitives.js';
import { creatureSize } from '../../derive/creature-size.js';
import { buildSpawnedCharacter } from '../spawn.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 836: the ooze Split (Black Pudding / Ochre Jelly). RAW (SRD 5.2.1):
// "While the [ooze] is Large or Medium and has 10+ Hit Points, it becomes
// Bloodied or is subjected to Lightning or Slashing damage → it splits into two
// new [oozes], each one size smaller, the original's Hit Points divided evenly
// (round down)."
//
// Consumer-driven: the TRIGGER (took slashing/lightning damage, or became
// bloodied) is detected by the consumer — it has the DamageApplied events + the
// HP — which then calls `engine.plan.oozeSplit`. This planner resolves the
// MECHANICAL split: two copies of the same statblock, one size smaller (a
// sizeOverride), each at floor(currentHP / 2), and the original removed
// (CreatureDestroyed — it is replaced). Placement + initiative insertion stay
// consumer-managed (positions / encounter are out of engine scope, same as the
// Wraith Create Specter / Wight zombie spawns).

const SPLIT_ELIGIBLE_SIZES = new Set(['Large', 'Medium']);

export interface OozeSplitIntent {
  readonly type: 'OozeSplit';
  readonly oozeId: string;
  readonly at?: string;
}

export const planOozeSplit = (
  state: CampaignState,
  content: ResolvedContent,
  intent: OozeSplitIntent,
): ReadonlyArray<Event> => {
  const ooze = state.characters[intent.oozeId];
  invariant(ooze !== undefined, `Ooze ${intent.oozeId} not found`);
  invariant(ooze.statblockId !== undefined, `Ooze ${intent.oozeId} has no statblockId`);
  const statblock = content.monsters.get(ooze.statblockId);
  invariant(statblock !== undefined, `Ooze statblock ${ooze.statblockId} not found`);
  const spec = statblock.split;
  if (spec === undefined) {
    throw new Error(`${ooze.name} has no Split trait`);
  }

  // RAW: only a Large or Medium ooze splits (Large → Medium, Medium → Small);
  // a Small ooze can't split further.
  const size = creatureSize(ooze, content);
  if (!SPLIT_ELIGIBLE_SIZES.has(size)) {
    throw new Error(`${ooze.name} is ${size}; only a Large or Medium ooze splits`);
  }
  if (ooze.hp.current < spec.minHp) {
    throw new Error(`${ooze.name} has ${ooze.hp.current} HP; needs ${spec.minHp}+ to split`);
  }

  const smaller = SIZES[SIZES.indexOf(size) - 1]!;
  const half = Math.floor(ooze.hp.current / 2);
  const at = intent.at ?? nowIso();

  const events: Event[] = [];
  // Two new oozes: same statblock, one size smaller, half the parent's HP each.
  for (let i = 0; i < 2; i += 1) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'CharacterCreated',
      snapshot: buildSpawnedCharacter(statblock, { hpCurrent: half, hpMax: half, sizeOverride: smaller }),
    } satisfies CharacterCreatedEvent);
  }
  // The original is replaced by the two copies — remove it from play. The
  // consumer drops it from initiative and seats the spawns.
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'CreatureDestroyed',
    targetId: intent.oozeId as ULID,
    source: 'ooze-split',
  } satisfies CreatureDestroyedEvent);
  return events;
};
