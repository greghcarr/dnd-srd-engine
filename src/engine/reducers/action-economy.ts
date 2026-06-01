import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  ActionEconomyConsumedEvent,
  ActionReadiedEvent,
  RecklessAttackActivatedEvent,
  StunningStrikeAttemptedEvent,
  SavageAttackerUsedEvent,
} from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import { invariant } from '../../internal/invariants.js';

const ACTION_SURGE_RESOURCE_ID = 'action-surge';

export const resetActionForActionSurgeIfApplicable = (
  state: Draft<CampaignState>,
  event: ResourceSpentEvent,
): void => {
  if (event.resourceId !== ACTION_SURGE_RESOURCE_ID) return;
  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) return;
  const encounter = state.encounters[encounterId];
  if (!encounter) return;
  const combatant = encounter.combatants.find((c) => c.combatantId === event.characterId);
  if (!combatant) return;
  combatant.turnUsage.actionUsed = false;
  combatant.turnUsage.attacksMadeThisTurn = 0;
};

export const applyActionEconomyConsumed = (
  state: Draft<CampaignState>,
  event: ActionEconomyConsumedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);

  switch (event.kind) {
    case 'action':
      invariant(!combatant.turnUsage.actionUsed, 'Action already used this turn');
      combatant.turnUsage.actionUsed = true;
      break;
    case 'bonusAction':
      invariant(
        !combatant.turnUsage.bonusActionUsed,
        'Bonus action already used this turn',
      );
      combatant.turnUsage.bonusActionUsed = true;
      break;
    case 'reaction':
      invariant(
        !combatant.turnUsage.reactionUsedThisRound,
        'Reaction already used this round',
      );
      combatant.turnUsage.reactionUsedThisRound = true;
      break;
    case 'attack':
      combatant.turnUsage.attacksMadeThisTurn += 1;
      break;
  }
};

export const resetActionForActionSurge = (
  combatant: { turnUsage: { actionUsed: boolean } },
): void => {
  combatant.turnUsage.actionUsed = false;
};

// Slice 572: RAW PHB 2024 Ready action. The planner has already emitted
// ActionEconomyConsumed { kind: 'action' } to consume the Action; this
// reducer just records the trigger description on the combatant's
// turnUsage. The Reaction stays available — RAW: "lets you act using
// your Reaction before the start of your next turn." TurnStarted
// clears the readiedAction along with the other per-turn flags.
export const applyActionReadied = (
  state: Draft<CampaignState>,
  event: ActionReadiedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
  combatant.turnUsage.readiedAction = { trigger: event.trigger };
};

export const applyRecklessAttackActivated = (
  state: Draft<CampaignState>,
  event: RecklessAttackActivatedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
  combatant.turnUsage.recklessAttackActive = true;
};

export const applyStunningStrikeAttempted = (
  state: Draft<CampaignState>,
  event: StunningStrikeAttemptedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
  combatant.turnUsage.stunningStrikeUsedThisTurn = true;
};

// Slice 467: a SavageAttackerUsed event tagged with both encounterId
// and combatantId marks the attacker's per-turn reroll as consumed.
// Out-of-encounter calls omit both fields and skip the state update
// (no per-turn structure outside an active encounter).
export const applySavageAttackerUsed = (
  state: Draft<CampaignState>,
  event: SavageAttackerUsedEvent,
): void => {
  if (event.encounterId === undefined || event.combatantId === undefined) return;
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
  combatant.turnUsage.savageAttackerUsedThisTurn = true;
};
