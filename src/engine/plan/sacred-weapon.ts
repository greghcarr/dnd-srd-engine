import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const CHANNEL_DIVINITY_RESOURCE_ID = 'channel-divinity';
const SACRED_WEAPON_CONDITION_ID = 'sacred-weapon-active';

export interface SacredWeaponIntent {
  readonly type: 'SacredWeapon';
  readonly paladinId: string;
  readonly at?: string;
}

// Paladin (Oath of Devotion) Channel Divinity: Sacred Weapon. The
// engine doesn't yet bake stat-at-activation values into installed
// conditions, so the wired Sacred Weapon condition applies a static
// +3 to attacks (representative of a typical Paladin CHA mod). The
// channel-divinity charge is properly consumed; the bonus action is
// recorded when invoked in an active encounter on the paladin's turn.
// Future work: thread the paladin's CHA mod through the event so the
// applied bonus matches RAW exactly.
export const planSacredWeapon = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: SacredWeaponIntent,
): ReadonlyArray<Event> => {
  const paladin = state.characters[intent.paladinId];
  if (!paladin) throw new Error(`Unknown paladin ${intent.paladinId}`);

  // Slice 744: Sacred Weapon is an active state — you don't re-activate
  // (or spend a second Channel Divinity) while it's already active.
  if (paladin.appliedConditions.some((c) => c.conditionId === SACRED_WEAPON_CONDITION_ID)) {
    throw new Error(`${paladin.name} already has Sacred Weapon active`);
  }

  const resource = paladin.resources.find((r) => r.resourceId === CHANNEL_DIVINITY_RESOURCE_ID);
  if (!resource || resource.current <= 0) {
    throw new Error(`${paladin.name} has no Channel Divinity available`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.paladinId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${paladin.name} has already used their bonus action this turn`);
      }
      const bonusActionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.paladinId,
        kind: 'bonusAction',
      };
      events.push(bonusActionConsumed);
    }
  }

  const spend: ResourceSpentEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.paladinId,
    resourceId: CHANNEL_DIVINITY_RESOURCE_ID,
    amount: 1,
  };
  events.push(spend);

  const conditionApplied: ConditionAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConditionApplied',
    targetId: intent.paladinId as ULID,
    conditionId: SACRED_WEAPON_CONDITION_ID,
  };
  events.push(conditionApplied);

  return events;
};
