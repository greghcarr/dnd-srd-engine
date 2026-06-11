import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ParryUsedEvent } from '../../schemas/events/parry.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import { economyConsumedIfEncountered, assertReactionAvailable } from './reactive-spells.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 831: the monster Parry reaction. RAW (SRD 5.2.1): "Trigger: the
// creature is hit by a melee attack roll while holding a weapon. Response:
// it adds N to its AC against that attack, possibly causing it to miss."
//
// Structural twin of `planShield`: a reaction that bumps AC against the
// triggering attack and reports `preventedHit` so the consumer can drop the
// damage chain when the hit becomes a miss. The +N is the creature's
// `GrantParry.acBonus` trait (read off the effect stack). No slot / resource —
// just the reaction. The "melee attack" + "see the attacker" + "wielding a
// melee weapon" gates are consumer-side (the reaction-affordance layer gates
// melee via `event.attackKind`; vision / weapon are positional like Shield's
// see-attacker), matching how every reaction trusts its consumer for the
// facts the engine doesn't model.

export interface ParryIntent {
  readonly type: 'Parry';
  readonly characterId: string;
  // The AttackRolled event id that hit and triggered the reaction.
  readonly triggeringAttackEventId: string;
  // The triggering attack's total (d20 + modifiers). Consumers read it off
  // the AttackRolledEvent. Decides whether +acBonus turns the hit into a miss.
  readonly triggeringAttackTotal: number;
  // The AC the attack resolved against (pre-Parry). From the AttackRolledEvent.
  readonly originalAC: number;
  readonly at?: string;
}

export interface ParryOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly preventedHit: boolean;
}

export const planParry = (
  state: CampaignState,
  content: ResolvedContent,
  intent: ParryIntent,
): ParryOutcome => {
  const character = state.characters[intent.characterId];
  invariant(character !== undefined, `Character ${intent.characterId} not found`);

  const acBonus = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  }).parryBonus();
  if (acBonus === undefined) {
    throw new Error(`${character.name} does not have the Parry reaction`);
  }

  assertReactionAvailable(state, intent.characterId, 'Parry');
  const at = intent.at ?? nowIso();

  const events: Event[] = [];
  const reaction = economyConsumedIfEncountered(state, intent.characterId, at, 'reaction');
  if (reaction !== undefined) events.push(reaction);

  const preventedHit = intent.triggeringAttackTotal < intent.originalAC + acBonus;
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ParryUsed',
    characterId: intent.characterId as ULID,
    triggeringAttackEventId: intent.triggeringAttackEventId as ULID,
    acBonus,
    preventedHit,
  } satisfies ParryUsedEvent);
  return { events, preventedHit };
};
