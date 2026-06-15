import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { RNG } from '../../rng/index.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { resolveAttack } from './attack.js';
import type { ULID } from '../ids-utils.js';

// Monk Open Hand Technique (Addle) marks a creature unable to make
// Opportunity Attacks until its next turn.
const ADDLED_CONDITION_ID = 'addled';
// Slice 876: Shocking Grasp bars Opportunity Attacks until the start of the
// target's next turn (the same OA-only restriction as Addle).
const SHOCKING_GRASPED_CONDITION_ID = 'shocking-grasped';

export interface OpportunityAttackIntent {
  readonly type: 'OpportunityAttack';
  readonly reactorId: string;
  readonly targetId: string;
  readonly weaponInstanceId: string;
  readonly advantage?: 'advantage' | 'disadvantage' | 'none';
  readonly at?: string;
}

interface ReactionEligibility {
  readonly encounterId: string;
  readonly reactionUsedThisRound: boolean;
  readonly isActiveCombatant: boolean;
}

const findReactor = (
  state: CampaignState,
  reactorId: string,
): ReactionEligibility | undefined => {
  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) return undefined;
  const encounter = state.encounters[encounterId];
  if (!encounter || encounter.status !== 'active') return undefined;
  const reactor = encounter.combatants.find((c) => c.combatantId === reactorId);
  if (reactor === undefined) return undefined;
  const active = encounter.combatants[encounter.activeIndex];
  return {
    encounterId,
    reactionUsedThisRound: reactor.turnUsage.reactionUsedThisRound,
    isActiveCombatant: active?.combatantId === reactorId,
  };
};

export const planOpportunityAttack = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: OpportunityAttackIntent,
): ReadonlyArray<Event> => {
  const reactor = state.characters[intent.reactorId];
  if (!reactor) throw new Error(`Unknown reactor ${intent.reactorId}`);

  if (reactor.appliedConditions.some((c) => c.conditionId === ADDLED_CONDITION_ID)) {
    throw new Error(`${reactor.name} is Addled and cannot make Opportunity Attacks`);
  }
  if (reactor.appliedConditions.some((c) => c.conditionId === SHOCKING_GRASPED_CONDITION_ID)) {
    throw new Error(`${reactor.name} is Shocking-Grasped and cannot make Opportunity Attacks`);
  }

  const eligibility = findReactor(state, intent.reactorId);
  if (eligibility === undefined) {
    throw new Error(
      `Opportunity attacks require an active encounter that includes the reactor`,
    );
  }
  if (eligibility.isActiveCombatant) {
    throw new Error(
      `${reactor.name} cannot take an opportunity attack on their own turn`,
    );
  }
  if (eligibility.reactionUsedThisRound) {
    throw new Error(`${reactor.name} has already used their reaction this round`);
  }

  const at = intent.at ?? nowIso();
  const reactionConsumed: ActionEconomyConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: eligibility.encounterId,
    combatantId: intent.reactorId,
    kind: 'reaction',
  };
  const resolution = resolveAttack({
    state,
    content,
    rng,
    attackerId: intent.reactorId,
    targetId: intent.targetId,
    weaponInstanceId: intent.weaponInstanceId,
    ...(intent.advantage !== undefined ? { advantage: intent.advantage } : {}),
    at,
    isOpportunityAttack: true,
  });
  return [reactionConsumed, ...resolution];
};
