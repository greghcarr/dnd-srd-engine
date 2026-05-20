import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { StunningStrikeAttemptedEvent } from '../../schemas/events/action-economy.js';
import type { ConditionAppliedEvent } from '../../schemas/events/combat.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import type { ULID } from '../ids-utils.js';

const KI_RESOURCE_ID = 'ki';
const STUNNED_CONDITION_ID = 'stunned';
const STUNNING_STRIKE_DC_BASE = 8;

export interface StunningStrikeIntent {
  readonly type: 'StunningStrike';
  readonly monkId: string;
  readonly targetId: string;
  readonly at?: string;
}

// Monk L5 Stunning Strike. On a hit with a Monk weapon or unarmed
// strike (the consumer is expected to call this immediately after a
// successful AttackRolled), spend 1 Focus Point and force a CON save
// vs DC 8 + WIS mod + prof bonus. On failure, the target is Stunned
// until the end of the Monk's next turn.
//
// Once per turn: enforced via `turnUsage.stunningStrikeUsedThisTurn`.
// Out-of-encounter calls are accepted but skip the once-per-turn
// check (no encounter → no turn structure).
export const planStunningStrike = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: StunningStrikeIntent,
): ReadonlyArray<Event> => {
  const monk = state.characters[intent.monkId];
  if (!monk) throw new Error(`Unknown monk ${intent.monkId}`);
  const target = state.characters[intent.targetId];
  if (!target) throw new Error(`Unknown target ${intent.targetId}`);
  const ki = monk.resources.find((r) => r.resourceId === KI_RESOURCE_ID);
  if (!ki || ki.current <= 0) {
    throw new Error(`${monk.name} has no Focus Points to spend`);
  }

  const activeEncounterId = state.activeEncounterId;
  let stunningStrikeEvent: StunningStrikeAttemptedEvent | undefined;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const monkCb = encounter?.combatants.find((c) => c.combatantId === intent.monkId);
    if (monkCb?.turnUsage.stunningStrikeUsedThisTurn === true) {
      throw new Error(`${monk.name} has already attempted a Stunning Strike this turn`);
    }
    if (monkCb !== undefined) {
      stunningStrikeEvent = {
        id: newEventId() as ULID,
        at: intent.at ?? nowIso(),
        type: 'StunningStrikeAttempted',
        encounterId: activeEncounterId,
        combatantId: intent.monkId as ULID,
        targetId: intent.targetId as ULID,
      };
    }
  }

  const dc =
    STUNNING_STRIKE_DC_BASE +
    abilityModifier(monk.abilityScores.WIS) +
    proficiencyBonus(computeTotalLevel(monk));

  const saveDerivation = computeSavingThrow({
    character: target,
    itemInstances: state.itemInstances,
    content,
    ability: 'CON',
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const useAdv: 'advantage' | 'disadvantage' | 'none' = saveDerivation.hasAdvantage
    ? saveDerivation.hasDisadvantage
      ? 'none'
      : 'advantage'
    : saveDerivation.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  const SIDES = 20;
  const rolls: number[] = [rollDie(SIDES, rng)];
  if (useAdv !== 'none') rolls.push(rollDie(SIDES, rng));
  const d20 =
    useAdv === 'advantage'
      ? Math.max(...rolls)
      : useAdv === 'disadvantage'
        ? Math.min(...rolls)
        : (rolls[0] ?? 0);
  const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
  const bonus = saveDerivation.total + saveBonus.total;
  const total = d20 + bonus;
  const success = total >= dc;
  const at = intent.at ?? nowIso();

  const events: Event[] = [];
  if (stunningStrikeEvent !== undefined) events.push(stunningStrikeEvent);
  const spend: ResourceSpentEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.monkId,
    resourceId: KI_RESOURCE_ID,
    amount: 1,
  };
  events.push(spend);

  const save: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.targetId,
    ability: 'CON',
    dc,
    d20: rolls,
    used: useAdv,
    bonus,
    total,
    success,
    breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
  };
  events.push(save);

  if (!success) {
    const conditionApplied: ConditionAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.targetId as ULID,
      conditionId: STUNNED_CONDITION_ID,
      appliedConditionId: newAppliedConditionId(),
      sourceCharacterId: intent.monkId as ULID,
    };
    events.push(conditionApplied);
  }

  return events;
};
