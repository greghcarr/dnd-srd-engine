import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  EncounterCreatedEvent,
  EncounterEndedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  InitiativeSwappedEvent,
  RoundEndedEvent,
  TurnEndedEvent,
  TurnStartedEvent,
} from '../../schemas/events/encounter.js';
import { invariant } from '../../internal/invariants.js';
import {
  clearRoundCountersForCharacters,
  clearTurnCountersForCharacter,
} from './triggers.js';

export const applyEncounterCreated = (
  state: Draft<CampaignState>,
  event: EncounterCreatedEvent,
): void => {
  invariant(
    state.encounters[event.encounterId] === undefined,
    `Encounter ${event.encounterId} already exists`,
  );
  state.encounters[event.encounterId] = {
    id: event.encounterId,
    ...(event.name !== undefined ? { name: event.name } : {}),
    status: 'planning',
    combatants: event.combatantIds.map((id) => ({
      combatantId: id,
      initiative: 0,
      initiativeOrder: 0,
      hasActedThisRound: false,
      turnUsage: {
        actionUsed: false,
        bonusActionUsed: false,
        attacksMadeThisTurn: 0,
        reactionUsedThisRound: false,
        feetMovedThisTurn: 0,
        dashed: false,
        disengaged: false,
        loadedWeaponsFiredThisTurn: [],
        recklessAttackActive: false,
        stunningStrikeUsedThisTurn: false,
        savageAttackerUsedThisTurn: false,
        noProvokeMovementUpToFeet: 0,
      },
    })),
    round: 0,
    activeIndex: 0,
  };
};

export const applyInitiativeRolled = (
  state: Draft<CampaignState>,
  event: InitiativeRolledEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  invariant(encounter.status === 'planning', 'Initiative can only be rolled while planning');
  const totalsById = new Map(event.rolls.map((r) => [r.combatantId, r.total]));
  const sortedRolls = [...event.rolls].sort((a, b) => b.total - a.total);
  const orderById = new Map(sortedRolls.map((r, i) => [r.combatantId, i]));

  for (const combatant of encounter.combatants) {
    const total = totalsById.get(combatant.combatantId);
    invariant(total !== undefined, `Combatant ${combatant.combatantId} missing initiative roll`);
    combatant.initiative = total;
    combatant.initiativeOrder = orderById.get(combatant.combatantId) ?? 0;
  }
  encounter.combatants.sort((a, b) => a.initiativeOrder - b.initiativeOrder);
};

// Slice 468: Alert Initiative Swap. Exchanges the two combatants'
// initiative values and recomputes initiativeOrder across the whole
// list (the same descending sort applyInitiativeRolled runs), so a
// subsequent swap or EncounterStarted reads a consistent order.
// Constraints (encounter status == 'planning'; both combatants
// present; non-Incapacitated; swapper has Alert) are enforced by
// the planner before the event is emitted; the reducer trusts the
// event.
export const applyInitiativeSwapped = (
  state: Draft<CampaignState>,
  event: InitiativeSwappedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  invariant(encounter.status === 'planning', 'Initiative swap requires planning status');
  const swapper = encounter.combatants.find((c) => c.combatantId === event.swapperId);
  const ally = encounter.combatants.find((c) => c.combatantId === event.allyId);
  invariant(swapper !== undefined, `Swapper ${event.swapperId} not in encounter`);
  invariant(ally !== undefined, `Ally ${event.allyId} not in encounter`);
  const swapperInitiative = swapper.initiative;
  swapper.initiative = ally.initiative;
  ally.initiative = swapperInitiative;
  // Recompute initiativeOrder across all combatants (descending by
  // initiative, ties broken by current order to keep determinism).
  const sorted = [...encounter.combatants].sort((a, b) => b.initiative - a.initiative);
  const orderById = new Map(sorted.map((c, i) => [c.combatantId, i]));
  for (const combatant of encounter.combatants) {
    combatant.initiativeOrder = orderById.get(combatant.combatantId) ?? 0;
  }
  encounter.combatants.sort((a, b) => a.initiativeOrder - b.initiativeOrder);
};

export const applyEncounterStarted = (
  state: Draft<CampaignState>,
  event: EncounterStartedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  invariant(encounter.status === 'planning', 'Encounter already started');
  invariant(encounter.combatants.length > 0, 'No combatants in encounter');
  invariant(
    encounter.combatants.every((c) => c.initiative !== 0 || c.initiativeOrder >= 0),
    'Initiative must be rolled before starting encounter',
  );
  encounter.status = 'active';
  encounter.round = 1;
  encounter.activeIndex = 0;
  encounter.startedAtEventId = event.id;
  state.activeEncounterId = event.encounterId;
};

export const applyTurnStarted = (
  state: Draft<CampaignState>,
  event: TurnStartedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  invariant(encounter.status === 'active', 'Encounter not active');
  const active = encounter.combatants[encounter.activeIndex];
  invariant(
    active !== undefined && active.combatantId === event.combatantId,
    `Turn-start mismatch: expected ${active?.combatantId}, got ${event.combatantId}`,
  );
  invariant(encounter.round === event.round, `Round mismatch`);
  clearTurnCountersForCharacter(state, event.combatantId);
  // Slice 232: clear the damage-types-taken accumulator that the
  // Regeneration suppression check reads. The planner's
  // planRegenerationAtTurnStart has already read this state at plan
  // time and decided whether to emit Healed; clearing the array here
  // resets it for the new turn.
  const character = state.characters[event.combatantId];
  if (character !== undefined) {
    character.damageTypesTakenThisTurn = [];
  }
  active.turnUsage.actionUsed = false;
  active.turnUsage.bonusActionUsed = false;
  active.turnUsage.attacksMadeThisTurn = 0;
  active.turnUsage.feetMovedThisTurn = 0;
  active.turnUsage.dashed = false;
  active.turnUsage.disengaged = false;
  active.turnUsage.loadedWeaponsFiredThisTurn = [];
  active.turnUsage.recklessAttackActive = false;
  active.turnUsage.stunningStrikeUsedThisTurn = false;
  active.turnUsage.savageAttackerUsedThisTurn = false;
  active.turnUsage.noProvokeMovementUpToFeet = 0;
  // Slice 572: a readied action expires at the start of the next
  // turn (RAW: "lets you act using your Reaction before the start of
  // your next turn"). Clearing on TurnStarted matches the RAW
  // expiry window.
  active.turnUsage.readiedAction = undefined;
};

export const applyTurnEnded = (
  state: Draft<CampaignState>,
  event: TurnEndedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  invariant(encounter.status === 'active', 'Encounter not active');
  const active = encounter.combatants[encounter.activeIndex];
  invariant(
    active !== undefined && active.combatantId === event.combatantId,
    `Turn-end mismatch`,
  );
  active.hasActedThisRound = true;
  encounter.activeIndex += 1;
};

export const applyRoundEnded = (
  state: Draft<CampaignState>,
  event: RoundEndedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  invariant(encounter.status === 'active', 'Encounter not active');
  invariant(
    encounter.activeIndex >= encounter.combatants.length,
    'Not all combatants have acted',
  );
  for (const combatant of encounter.combatants) {
    combatant.hasActedThisRound = false;
    combatant.turnUsage.reactionUsedThisRound = false;
  }
  encounter.round += 1;
  encounter.activeIndex = 0;
  clearRoundCountersForCharacters(
    state,
    encounter.combatants.map((c) => c.combatantId),
  );
};

export const applyEncounterEnded = (
  state: Draft<CampaignState>,
  event: EncounterEndedEvent,
): void => {
  const encounter = state.encounters[event.encounterId];
  invariant(encounter !== undefined, `Encounter ${event.encounterId} not found`);
  invariant(encounter.status === 'active', 'Encounter already ended or not started');
  encounter.status = 'ended';
  encounter.outcome = event.outcome;
  encounter.endedAtEventId = event.id;
  if (state.activeEncounterId === event.encounterId) {
    state.activeEncounterId = undefined;
  }
};
