import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { HealedEvent } from '../../schemas/events/combat.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const LIFE_DOMAIN_SUBCLASS_ID = 'life-domain';
const PRESERVE_LIFE_LEVEL = 3;
const CHANNEL_DIVINITY_RESOURCE_ID = 'channel-divinity';
const PRESERVE_LIFE_HP_PER_LEVEL = 5;

export interface PreserveLifeIntent {
  readonly type: 'PreserveLife';
  readonly clericId: string;
  // The player's division of the healing pool: how many pool points to
  // pour into each chosen creature. The engine doesn't model positions,
  // so the consumer supplies the in-range Bloodied targets and the split.
  readonly allocations: ReadonlyArray<{ readonly targetId: string; readonly amount: number }>;
  readonly at?: string;
}

// Life Domain L3 Channel Divinity: Preserve Life. Expends a use of
// Channel Divinity to restore a pool of (5 x Cleric level) Hit Points,
// divided among chosen Bloodied creatures within 30 ft, restoring each to
// no more than half its Hit Point maximum. Reuses the `channel-divinity`
// resource (ResourceSpent) and the `Healed` event.
//
// The half-max cap is enforced per target: a creature already at or above
// half its maximum receives 0 (which is also how the RAW "Bloodied
// creatures" target restriction is honored mechanically). Over-allocating
// to a capped target wastes the surplus pool, as at the table.
//
// Action economy: a Magic action. Consumed only when the cleric is the
// active combatant in an encounter (mirrors `planDragonWings`); out of
// combat the healing is simply applied. Range (30 ft) and target choice
// are consumer-supplied.
export const planPreserveLife = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: PreserveLifeIntent,
): ReadonlyArray<Event> => {
  const cleric = state.characters[intent.clericId];
  if (!cleric) throw new Error(`Unknown cleric ${intent.clericId}`);
  const enrollment = cleric.classes.find((c) => c.classId === 'cleric');
  if (
    enrollment === undefined ||
    enrollment.level < PRESERVE_LIFE_LEVEL ||
    enrollment.subclassId !== LIFE_DOMAIN_SUBCLASS_ID
  ) {
    throw new Error(
      `${cleric.name} does not have Preserve Life (requires Life Domain, Cleric level ${PRESERVE_LIFE_LEVEL})`,
    );
  }

  const channelDivinity = cleric.resources.find((r) => r.resourceId === CHANNEL_DIVINITY_RESOURCE_ID);
  if (!channelDivinity || channelDivinity.current <= 0) {
    throw new Error(`${cleric.name} has no Channel Divinity uses to spend`);
  }

  const pool = PRESERVE_LIFE_HP_PER_LEVEL * enrollment.level;
  const requested = intent.allocations.reduce((sum, a) => sum + a.amount, 0);
  if (requested > pool) {
    throw new Error(
      `Preserve Life pool is ${pool} HP (5 x Cleric level ${enrollment.level}); allocations request ${requested}`,
    );
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const clericCb = encounter?.combatants.find((c) => c.combatantId === intent.clericId);
    if (clericCb !== undefined) {
      const active = encounter?.combatants[encounter.activeIndex];
      if (!active || active.combatantId !== intent.clericId) {
        throw new Error(`${cleric.name} is not the active combatant`);
      }
      if (active.turnUsage.actionUsed) {
        throw new Error(`${cleric.name} has already used their action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.clericId,
        kind: 'action',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.clericId,
    resourceId: CHANNEL_DIVINITY_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  for (const allocation of intent.allocations) {
    const target = state.characters[allocation.targetId];
    if (target === undefined) continue;
    const halfMax = Math.floor(target.hp.max / 2);
    const capRemaining = Math.max(0, halfMax - target.hp.current);
    const effective = Math.min(allocation.amount, capRemaining);
    if (effective <= 0) continue;
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: allocation.targetId as ULID,
      amount: effective,
      source: 'preserve-life',
    } satisfies HealedEvent);
  }

  return events;
};
