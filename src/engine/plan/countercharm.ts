import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { D20_SIDES } from '../../internal/constants.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import type { AbilityScore } from '../../schemas/primitives.js';

const COUNTERCHARM_LEVEL = 7;

export interface CountercharmIntent {
  readonly type: 'Countercharm';
  readonly bardId: string;
  // The creature whose save failed — the bard, or an ally within 30 ft
  // (range consumer-managed, since the engine doesn't model positions).
  readonly targetId: string;
  readonly ability: AbilityScore;
  // The failed save's DC and total bonus (from the original SaveRolled), so
  // the reroll applies the same modifiers.
  readonly dc: number;
  readonly saveBonus: number;
  readonly at?: string;
}

export interface CountercharmOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly d20: ReadonlyArray<number>;
  readonly total: number;
  // True when the rerolled (Advantage) save now meets the DC. On success the
  // consumer drops / removes the Charmed or Frightened condition the original
  // failed save applied (condition application is consumer-driven).
  readonly success: boolean;
}

// Bard L7 Countercharm. RAW (SRD 5.2.1): "If you or a creature within 30
// feet of you fails a saving throw against an effect that applies the
// Charmed or Frightened condition, you can take a Reaction to cause the
// save to be rerolled, and the new roll has Advantage." Free Reaction (no
// resource cost).
//
// Outcome planner (the Peerless Skill / Hero Points shape): the consumer —
// having seen the failed SaveRolled against a Charmed/Frightened effect —
// passes the failed creature plus that save's DC + bonus; the planner
// rerolls 2d20 with Advantage, emits the rerolled SaveRolled, and returns
// whether it now succeeds. The 30-ft range, the self-or-ally choice, the
// Reaction economy, and removing the already-applied condition on success
// are consumer-managed (mirrors Cutting Words / Peerless Skill — the engine
// drives reactions consumer-side and doesn't model positions).
export const planCountercharm = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: CountercharmIntent,
): CountercharmOutcome => {
  const bard = state.characters[intent.bardId];
  if (!bard) throw new Error(`Unknown bard ${intent.bardId}`);
  const enrollment = bard.classes.find((c) => c.classId === 'bard');
  if (enrollment === undefined || enrollment.level < COUNTERCHARM_LEVEL) {
    throw new Error(`${bard.name} does not have Countercharm (requires Bard level ${COUNTERCHARM_LEVEL})`);
  }
  if (!state.characters[intent.targetId]) {
    throw new Error(`Unknown Countercharm target ${intent.targetId}`);
  }

  const at = intent.at ?? nowIso();
  const rolls = [rollDie(D20_SIDES, rng), rollDie(D20_SIDES, rng)];
  const usedD20 = Math.max(rolls[0]!, rolls[1]!);
  const total = usedD20 + intent.saveBonus;
  const success = total >= intent.dc;
  const saveEvent: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.targetId as ULID,
    ability: intent.ability,
    dc: intent.dc,
    d20: rolls,
    used: 'advantage',
    bonus: intent.saveBonus,
    total,
    success,
  };
  return { events: [saveEvent], d20: rolls, total, success };
};
