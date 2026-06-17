// Slice 893 — the per-turn Confusion behavior roll. RAW (Confusion): a confused
// creature "must roll 1d10 at the start of each of its turns to determine its
// behavior for that turn." The engine owns the DICE (deterministic / replayable
// through the plan/commit RNG) and surfaces the resulting behavior bucket via a
// `ConfusionBehaviorRolled` event; the consumer executes it, because the
// outcomes are positional (a forced move in a random direction, or a melee
// attack on a random creature in reach). The "can't take Bonus Actions or
// Reactions" arm is enforced engine-side in the action-economy reducer.
//
// Consumer-driven: called once at the start of each confused creature's turn.

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Event } from '../../schemas/events/index.js';
import type { ConfusionBehaviorRolledEvent } from '../../schemas/events/combat.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { rollDie } from '../../rng/dice.js';
import type { RNG } from '../../rng/index.js';
import type { ULID } from '../ids-utils.js';

const CONFUSED_CONDITION_ID = 'confused-active';
const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
const D10_SIDES = 10;
const D4_SIDES = 4;

export interface RollConfusionBehaviorIntent {
  readonly type: 'RollConfusionBehavior';
  readonly characterId: string;
  readonly at?: string;
}

export const planRollConfusionBehavior = (
  state: CampaignState,
  rng: RNG,
  intent: RollConfusionBehaviorIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (!character.appliedConditions.some((c) => c.conditionId === CONFUSED_CONDITION_ID)) {
    throw new Error(`${character.name} is not Confused, so there is no behavior to roll`);
  }
  const d10 = rollDie(D10_SIDES, rng);
  // RAW table: 1 → move-only (random direction); 2-6 → no move/action;
  // 7-8 → one melee attack on a random creature in reach; 9-10 → acts normally.
  let behavior: ConfusionBehaviorRolledEvent['behavior'];
  let direction: (typeof DIRECTIONS)[number] | undefined;
  if (d10 === 1) {
    behavior = 'random-move';
    direction = DIRECTIONS[rollDie(D4_SIDES, rng) - 1];
  } else if (d10 <= 6) {
    behavior = 'do-nothing';
  } else if (d10 <= 8) {
    behavior = 'melee-random';
  } else {
    behavior = 'normal';
  }
  const event: ConfusionBehaviorRolledEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'ConfusionBehaviorRolled',
    targetId: intent.characterId as ULID,
    d10,
    behavior,
    ...(direction !== undefined ? { direction } : {}),
  };
  return [event];
};
