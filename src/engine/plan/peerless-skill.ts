import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { bardicInspirationDieFor, BARDIC_INSPIRATION_RESOURCE_ID } from './cutting-words.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const COLLEGE_OF_LORE_SUBCLASS_ID = 'college-of-lore';
const PEERLESS_SKILL_LEVEL = 14;

export interface PeerlessSkillIntent {
  readonly type: 'PeerlessSkill';
  readonly bardId: string;
  // The bard's own ability check or attack roll that already failed (the
  // original d20 + modifiers). The planner rolls the Bardic Inspiration
  // die, adds it, and reports whether the boosted total now meets the
  // threshold.
  readonly originalRollTotal: number;
  // The threshold the roll needed to meet (target AC for an attack, the
  // check DC, etc.).
  readonly threshold: number;
  readonly at?: string;
}

export interface PeerlessSkillOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly dieRoll: number;
  // True when adding the die lifts the failed roll to meet the threshold.
  readonly turnedSuccess: boolean;
}

// College of Lore (Bard L14) Peerless Skill. The self-targeted mirror of
// Cutting Words: when the bard makes an ability check or attack roll and
// fails, expend one Bardic Inspiration die, add the roll to the d20, and
// potentially turn the failure into a success. RAW: "On a failure, the
// Bardic Inspiration isn't expended" — so the resource is spent only when
// the boosted total meets the threshold.
//
// The consumer passes the already-failed total and the threshold it
// needed to meet; the planner returns the rolled die plus `turnedSuccess`
// so the consumer can decide whether to commit the trailing chain. Costs
// no action / reaction (RAW), so no ActionEconomyConsumed is emitted.
export const planPeerlessSkill = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: PeerlessSkillIntent,
): PeerlessSkillOutcome => {
  const bard = state.characters[intent.bardId];
  if (!bard) throw new Error(`Unknown bard ${intent.bardId}`);
  const enrollment = bard.classes.find((c) => c.classId === 'bard');
  if (
    enrollment === undefined ||
    enrollment.level < PEERLESS_SKILL_LEVEL ||
    enrollment.subclassId !== COLLEGE_OF_LORE_SUBCLASS_ID
  ) {
    throw new Error(
      `${bard.name} does not have Peerless Skill (requires College of Lore, Bard level ${PEERLESS_SKILL_LEVEL})`,
    );
  }

  const bi = bard.resources.find((r) => r.resourceId === BARDIC_INSPIRATION_RESOURCE_ID);
  if (!bi || bi.current <= 0) {
    throw new Error(`${bard.name} has no Bardic Inspiration dice available`);
  }

  const at = intent.at ?? nowIso();
  const dieRoll = rollDie(bardicInspirationDieFor(enrollment.level), rng);
  const turnedSuccess = intent.originalRollTotal + dieRoll >= intent.threshold;

  // RAW: the die is expended only when it turns the roll into a success.
  const events: Event[] = turnedSuccess
    ? [
        {
          id: newEventId() as ULID,
          at,
          type: 'ResourceSpent',
          characterId: intent.bardId,
          resourceId: BARDIC_INSPIRATION_RESOURCE_ID,
          amount: 1,
        } satisfies ResourceSpentEvent,
      ]
    : [];

  return { events, dieRoll, turnedSuccess };
};
