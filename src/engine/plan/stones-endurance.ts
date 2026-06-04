import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { HealedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { abilityModifier } from '../../derive/ability.js';
import { assertReactionAvailable, economyConsumedIfEncountered } from './reactive-spells.js';
import { GIANT_ANCESTRY_RESOURCE_ID, validateGoliathAncestry } from './_giant-ancestry.js';
import type { ULID } from '../ids-utils.js';

const STONES_ENDURANCE_DIE_SIDES = 12;
const STONES_ENDURANCE_SOURCE = 'stones-endurance';

export interface StonesEnduranceIntent {
  readonly type: 'StonesEndurance';
  readonly goliathId: string;
  // RAW: "When you take damage" — the consumer supplies the damage
  // amount the Goliath just took so the planner knows what to halve
  // (capped at this value so the reaction never over-heals).
  readonly damageAmount: number;
  // Optional reference to the triggering DamageApplied event for
  // transcript / replay clarity.
  readonly triggeringDamageEventId?: string;
  readonly at?: string;
}

export interface StonesEnduranceOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly reducedBy: number;
}

// Goliath Giant Ancestry → Stone's Endurance (Stone Giant).
//
// RAW (SRD 5.2.1 Goliath): "When you take damage, you can take a
// Reaction to roll 1d12. Add your Constitution modifier to the number
// rolled and reduce the damage by that total."
//
// Event-sourcing approach mirrors planUncannyDodge (slice 200): the
// triggering DamageApplied has already committed when this planner
// runs, so rather than mutate that event we emit a compensating
// `Healed` event for the reduction amount. The bearer's HP nets out
// at (damage - reduction) and the audit trail preserves both the
// full hit and the reaction outcome. The reduction is capped at
// `damageAmount` so the reaction never over-heals — if the roll +
// CON exceeds the damage taken, only the damage's worth is healed.
//
// Validation: Goliath species + Stone's Endurance ancestry + giant-
// ancestry resource > 0 (via shared `validateGoliathAncestry` helper
// extracted in slice 557) + reaction available this round.
export const planStonesEndurance = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: StonesEnduranceIntent,
): StonesEnduranceOutcome => {
  const goliath = state.characters[intent.goliathId];
  if (!goliath) throw new Error(`Unknown character ${intent.goliathId}`);
  if (intent.damageAmount < 0) {
    throw new Error('Stone\'s Endurance damageAmount must be non-negative');
  }

  validateGoliathAncestry(goliath, state, 'stones-endurance', "Stone's Endurance");
  assertReactionAvailable(state, intent.goliathId, "use Stone's Endurance");

  const at = intent.at ?? nowIso();
  const die = rollDie(STONES_ENDURANCE_DIE_SIDES, rng);
  const conMod = abilityModifier(goliath.abilityScores.CON);
  const rawReduction = die + conMod;
  // Floor at 0 so a negative CON mod can't INCREASE damage; cap at
  // damageAmount so the compensating Healed never over-heals.
  const reducedBy = Math.max(0, Math.min(intent.damageAmount, rawReduction));

  const events: Event[] = [];
  const reaction = economyConsumedIfEncountered(state, intent.goliathId, at, 'reaction');
  if (reaction !== undefined) events.push(reaction);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.goliathId as ULID,
    resourceId: GIANT_ANCESTRY_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);
  if (reducedBy > 0) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: intent.goliathId as ULID,
      amount: reducedBy,
      source: STONES_ENDURANCE_SOURCE,
    } satisfies HealedEvent);
  }

  return { events, reducedBy };
};
