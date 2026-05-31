import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag } from './_halfling-luck.js';
import { newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { EXHAUSTION_MAX } from '../../schemas/primitives.js';
import type { ULID } from '../ids-utils.js';
import type { ForagedForEvent, NavigationCheckRolledEvent } from '../../schemas/events/travel.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { ExhaustionChangedEvent } from '../../schemas/events/combat.js';

const FORAGE_FOOD_ON_SUCCESS = 4;
const FORAGE_WATER_ON_SUCCESS = 4;

export interface ForageIntent {
  readonly type: 'Forage';
  readonly partyId: string;
  readonly foragerId: string;
  readonly dc: number;
  readonly at?: string;
}

export const planForage = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ForageIntent,
): ReadonlyArray<Event> => {
  invariant(state.parties[intent.partyId] !== undefined, `Party ${intent.partyId} not found`);
  const forager = state.characters[intent.foragerId];
  invariant(forager !== undefined, `Forager ${intent.foragerId} not found`);
  const derivation = computeAbilityCheck({
    character: forager,
    itemInstances: state.itemInstances,
    content,
    ability: 'WIS',
    skill: 'survival',
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on forage check.
  const d20 = applyHalflingLuckFromFlag(rolls[0]!, derivation.hasHalflingLuck, rolls, rng);
  const total = d20 + derivation.total;
  const success = total >= intent.dc;
  const at = intent.at ?? nowIso();
  const event: ForagedForEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ForagedFor',
    partyId: intent.partyId,
    foragerId: intent.foragerId,
    d20,
    bonus: derivation.total,
    total,
    dc: intent.dc,
    success,
    foodPounds: success ? FORAGE_FOOD_ON_SUCCESS : 0,
    waterPounds: success ? FORAGE_WATER_ON_SUCCESS : 0,
  };
  return [event];
};

export interface NavigationCheckIntent {
  readonly type: 'NavigationCheck';
  readonly partyId: string;
  readonly navigatorId: string;
  readonly dc: number;
  readonly at?: string;
}

const FORCED_MARCH_BASE_DC = 10;
const FORCED_MARCH_NORMAL_HOURS = 8;

export interface ForcedMarchIntent {
  readonly type: 'ForcedMarch';
  readonly partyId: string;
  // The participants — anyone who marched past 8 hours rolls a save
  // per extra hour. Vehicles, mounts (when not bearing the marcher),
  // and non-corporeal allies should be omitted by the consumer.
  readonly travelerIds: ReadonlyArray<string>;
  // Total marching hours this stretch — must be > 8 for any save to
  // fire. RAW 2024 ch.4: "for each hour of travel beyond 8 hours,
  // each character must succeed on a Constitution saving throw at
  // the end of the hour or gain one level of Exhaustion. The DC is
  // 10 + 1 per hour past 8."
  readonly hoursMarched: number;
  readonly at?: string;
}

/**
 * RAW 2024 forced march: for each hour past the 8th, every traveler
 * makes a CON save (DC 10 + 1/hour past 8) or gains a level of
 * Exhaustion. The save fires *per hour*, not once for the stretch —
 * so eight extra hours = eight saves per character at climbing DCs.
 *
 * The planner runs the whole stretch in one call. Each `SaveRolled`
 * is paired with the `ExhaustionChanged` it caused (when it caused
 * one). Travelers already at the exhaustion max are skipped (no
 * further saves; you can't gain more exhaustion).
 *
 * Skip behavior: if `hoursMarched <= 8`, the planner returns no
 * events — no saves required.
 */
export const planForcedMarch = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ForcedMarchIntent,
): ReadonlyArray<Event> => {
  invariant(
    state.parties[intent.partyId] !== undefined,
    `Party ${intent.partyId} not found`,
  );
  const at = intent.at ?? nowIso();
  const extraHours = intent.hoursMarched - FORCED_MARCH_NORMAL_HOURS;
  if (extraHours <= 0) return [];
  const events: Event[] = [];
  // Track running exhaustion per traveler so cumulative failures
  // climb together with the DC.
  const runningExhaustion = new Map<string, number>();
  for (const id of intent.travelerIds) {
    const c = state.characters[id];
    if (c !== undefined) runningExhaustion.set(id, c.exhaustion);
  }
  for (let h = 1; h <= extraHours; h++) {
    const dc = FORCED_MARCH_BASE_DC + h;
    for (const travelerId of intent.travelerIds) {
      const traveler = state.characters[travelerId];
      if (traveler === undefined) continue;
      const currentExhaustion = runningExhaustion.get(travelerId) ?? traveler.exhaustion;
      if (currentExhaustion >= EXHAUSTION_MAX) continue;
      const saveDerivation = computeSavingThrow({
        character: traveler,
        itemInstances: state.itemInstances,
        content,
        ability: 'CON',
        characters: state.characters,
      });
      const rolls: number[] = [rollDie(D20_SIDES, rng)];
      // Slice 543: Halfling Luck on forced-march save.
      const d20 = applyHalflingLuckFromFlag(rolls[0]!, saveDerivation.hasHalflingLuck, rolls, rng);
      const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
      const bonus = saveDerivation.total + saveBonus.total;
      const total = d20 + bonus;
      const success = total >= dc;
      const save: SaveRolledEvent = {
        id: newEventId() as ULID,
        at,
        type: 'SaveRolled',
        targetId: travelerId as ULID,
        ability: 'CON',
        dc,
        d20: [d20],
        used: 'none',
        bonus,
        total,
        success,
        breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
      };
      events.push(save);
      if (!success) {
        const newExhaustion = Math.min(EXHAUSTION_MAX, currentExhaustion + 1);
        const changed: ExhaustionChangedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ExhaustionChanged',
          targetId: travelerId as ULID,
          fromLevel: currentExhaustion,
          toLevel: newExhaustion,
          causedByEventId: save.id,
        };
        events.push(changed);
        runningExhaustion.set(travelerId, newExhaustion);
      }
    }
  }
  return events;
};

export const planNavigationCheck = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: NavigationCheckIntent,
): ReadonlyArray<Event> => {
  invariant(state.parties[intent.partyId] !== undefined, `Party ${intent.partyId} not found`);
  const navigator = state.characters[intent.navigatorId];
  invariant(navigator !== undefined, `Navigator ${intent.navigatorId} not found`);
  const derivation = computeAbilityCheck({
    character: navigator,
    itemInstances: state.itemInstances,
    content,
    ability: 'WIS',
    skill: 'survival',
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on navigation check.
  const d20 = applyHalflingLuckFromFlag(rolls[0]!, derivation.hasHalflingLuck, rolls, rng);
  const total = d20 + derivation.total;
  const at = intent.at ?? nowIso();
  const event: NavigationCheckRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'NavigationCheckRolled',
    partyId: intent.partyId,
    navigatorId: intent.navigatorId,
    d20,
    bonus: derivation.total,
    total,
    dc: intent.dc,
    success: total >= intent.dc,
  };
  return [event];
};
