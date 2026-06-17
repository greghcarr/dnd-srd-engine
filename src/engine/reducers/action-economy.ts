import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  ActionEconomyConsumedEvent,
  ActionReadiedEvent,
  RecklessAttackActivatedEvent,
  SteadyAimActivatedEvent,
  SteadyAimConsumedEvent,
  FastHandsActivatedEvent,
  DeflectAttacksUsedEvent,
  StunningStrikeAttemptedEvent,
  SavageAttackerUsedEvent,
} from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import { invariant } from '../../internal/invariants.js';

const ACTION_SURGE_RESOURCE_ID = 'action-surge';

// Slice 680: RAW Slow ("the target can take only one Action or one
// Bonus Action on a turn, not both, and it can't take Reactions").
// The bare condition id is checked here so the engine enforces the
// restriction at action-economy consumption time without requiring
// each planner to call a separate gate helper. Hardcoded because
// Slow is the only RAW user; generalize to a marker effect if a
// second user arrives.
const SLOWED_BY_SPELL_CONDITION_ID = 'slowed-by-spell-active';

const isSlowedBySpell = (state: Draft<CampaignState>, characterId: string): boolean => {
  const character = state.characters[characterId];
  if (!character) return false;
  return character.appliedConditions.some((c) => c.conditionId === SLOWED_BY_SPELL_CONDITION_ID);
};

// Slice 893: RAW Confusion ("that target can't take Bonus Actions or
// Reactions"). Enforced here at consumption time, the same shape as the Slow
// gate above — Confusion is the only RAW user, so the condition id is
// hardcoded. (The per-turn 1d10 behavior table that gates the ACTION is rolled
// + surfaced by engine.plan.rollConfusionBehavior and executed by the consumer,
// since its outcomes are positional — a forced move in a random direction or a
// melee attack on a random creature in reach.)
const CONFUSED_CONDITION_ID = 'confused-active';

const isConfused = (state: Draft<CampaignState>, characterId: string): boolean => {
  const character = state.characters[characterId];
  if (!character) return false;
  return character.appliedConditions.some((c) => c.conditionId === CONFUSED_CONDITION_ID);
};

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

  // Slice 680: RAW Slow gates (one Action OR one Bonus Action per
  // turn, not both; no Reactions). Check the slowed-by-spell marker
  // on the combatant before applying the consume.
  const slowed = isSlowedBySpell(state, event.combatantId);
  const confused = isConfused(state, event.combatantId);
  switch (event.kind) {
    case 'action':
      invariant(!combatant.turnUsage.actionUsed, 'Action already used this turn');
      invariant(
        !slowed || !combatant.turnUsage.bonusActionUsed,
        'Slowed (Slow spell): cannot use Action when a Bonus Action has already been used this turn',
      );
      combatant.turnUsage.actionUsed = true;
      break;
    case 'bonusAction':
      invariant(
        !combatant.turnUsage.bonusActionUsed,
        'Bonus action already used this turn',
      );
      invariant(
        !slowed || !combatant.turnUsage.actionUsed,
        'Slowed (Slow spell): cannot use Bonus Action when an Action has already been used this turn',
      );
      invariant(!confused, 'Confused (Confusion spell): cannot take Bonus Actions');
      combatant.turnUsage.bonusActionUsed = true;
      break;
    case 'reaction':
      invariant(
        !combatant.turnUsage.reactionUsedThisRound,
        'Reaction already used this round',
      );
      invariant(
        !slowed,
        'Slowed (Slow spell): cannot use Reactions',
      );
      invariant(!confused, 'Confused (Confusion spell): cannot take Reactions');
      combatant.turnUsage.reactionUsedThisRound = true;
      break;
    case 'attack':
      // Slice 681: RAW Slow ("the target can make only one melee or
      // ranged attack on its turn"). A slowed combatant whose
      // attacksMadeThisTurn is already >=1 cannot make another;
      // Extra Attack and other multi-attack features are capped at 1
      // for the duration.
      invariant(
        !slowed || combatant.turnUsage.attacksMadeThisTurn === 0,
        'Slowed (Slow spell): can make only one melee or ranged attack on its turn',
      );
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

// Slice 646: Rogue L3 Steady Aim. Sets two turnUsage flags on the
// combatant — next attack gets advantage, AND speed=0 until end of
// turn. Both flags clear at the next TurnStarted (via the existing
// per-turn reset).
export const applySteadyAimActivated = (
  state: Draft<CampaignState>,
  event: SteadyAimActivatedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
  combatant.turnUsage.steadyAimActive = true;
  combatant.turnUsage.speedZeroUntilEndOfTurn = true;
};

// Slice 646: clears the `steadyAimActive` flag after an attack
// consumed the advantage. Emitted by attack planners that grant
// advantage from Steady Aim. Doesn't touch `speedZeroUntilEndOfTurn`
// — RAW: speed stays 0 until end of turn regardless.
export const applySteadyAimConsumed = (
  state: Draft<CampaignState>,
  event: SteadyAimConsumedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
  combatant.turnUsage.steadyAimActive = false;
};

// Slice 647: Fast Hands is a marker event (transcript readability,
// no state mutation beyond the paired ActionEconomyConsumed which
// has already set bonusActionUsed). Reducer validates the event
// shape but does not mutate state.
export const applyFastHandsActivated = (
  state: Draft<CampaignState>,
  event: FastHandsActivatedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
  // No-op state mutation; the BA flag is set by the paired
  // ActionEconomyConsumed event.
};

// Slice 648: Monk L3 Deflect Attacks. Marker-only (transcript +
// follow-up audit hook). The reaction-used flag is set by the
// paired ActionEconomyConsumed { reaction } event the planner
// emits alongside this one.
export const applyDeflectAttacksUsed = (
  state: Draft<CampaignState>,
  event: DeflectAttacksUsedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  const combatant = encounter.combatants.find((c) => c.combatantId === event.combatantId);
  invariant(combatant !== undefined, `Combatant ${event.combatantId} not in encounter`);
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
