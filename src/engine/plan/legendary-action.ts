import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { LegendaryActionUsedEvent } from '../../schemas/events/combat.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 840: Legendary Actions (the Aboleth in scope). RAW (SRD 5.2.1):
// "Legendary Action Uses: 3 (4 in Lair). Immediately after another creature's
// turn, the creature can expend a use to take one of the following actions. It
// regains all expended uses at the start of each of its turns."
//
// The engine owns the BUDGET: the pool (`legendaryActions.uses` / `usesInLair`),
// the turn-start refresh (applyTurnStarted resets `legendaryActionsUsed`), and
// this validated spend. The "after another creature's turn" timing is
// consumer-orchestrated (like a reaction), and the underlying game action — a
// Tentacle attack (Lash), a save-action (Psychic Drain → Consume Memories) — is
// dispatched SEPARATELY by the consumer; this planner only spends the use(s) and
// emits `LegendaryActionUsed`. `inLair` is a consumer fact raising the pool.

export interface LegendaryActionIntent {
  readonly type: 'LegendaryAction';
  readonly creatureId: string;
  // The chosen legendary action's `name` (must be in the statblock's menu).
  readonly actionName: string;
  readonly inLair?: boolean;
  readonly at?: string;
}

export const planLegendaryAction = (
  state: CampaignState,
  content: ResolvedContent,
  intent: LegendaryActionIntent,
): ReadonlyArray<Event> => {
  const creature = state.characters[intent.creatureId];
  invariant(creature !== undefined, `Creature ${intent.creatureId} not found`);
  invariant(creature.statblockId !== undefined, `Creature ${intent.creatureId} has no statblockId`);
  const statblock = content.monsters.get(creature.statblockId);
  invariant(statblock !== undefined, `Statblock ${creature.statblockId} not found`);
  const spec = statblock.legendaryActions;
  if (spec === undefined) {
    throw new Error(`${creature.name} has no Legendary Actions`);
  }
  const action = spec.actions.find((a) => a.name === intent.actionName);
  if (action === undefined) {
    throw new Error(`${creature.name} has no Legendary Action '${intent.actionName}'`);
  }

  const pool = intent.inLair === true && spec.usesInLair !== undefined ? spec.usesInLair : spec.uses;
  if (creature.legendaryActionsUsed + action.cost > pool) {
    throw new Error(
      `${creature.name} can't afford Legendary Action '${intent.actionName}' (cost ${action.cost}; ${creature.legendaryActionsUsed}/${pool} used)`,
    );
  }

  const at = intent.at ?? nowIso();
  return [{
    id: newEventId() as ULID,
    at,
    type: 'LegendaryActionUsed',
    creatureId: intent.creatureId as ULID,
    actionName: action.name,
    cost: action.cost,
  } satisfies LegendaryActionUsedEvent];
};
