import { describe, expect, it } from 'vitest';
import { apply, applyAll } from '../../../src/engine/apply.js';
import { emptyCampaignState } from '../../../src/schemas/runtime/campaign.js';
import { buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import { newEncounterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  RoundEndedEvent,
  TurnEndedEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';

const seedActiveEncounter = () => {
  const a = buildFighter({ name: 'Alyx' });
  const b = buildFighter({ name: 'Borin' });
  const encounterId = newEncounterId();
  const events = [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'EncounterCreated',
      encounterId,
      combatantIds: [a.id, b.id],
    } satisfies EncounterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId,
      rolls: [
        { combatantId: a.id, d20: 18, modifier: 2, total: 20 },
        { combatantId: b.id, d20: 5, modifier: 1, total: 6 },
      ],
    } satisfies InitiativeRolledEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'EncounterStarted',
      encounterId,
    } satisfies EncounterStartedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'TurnStarted',
      encounterId,
      combatantId: a.id,
      round: 1,
    } satisfies TurnStartedEvent,
  ];
  const state = applyAll(emptyCampaignState(), events);
  return { state, encounterId, aId: a.id, bId: b.id };
};

describe('ActionEconomyConsumed reducer', () => {
  it('marks actionUsed', () => {
    const { state, encounterId, aId } = seedActiveEncounter();
    const event: ActionEconomyConsumedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'action',
    };
    const next = apply(state, event);
    const combatant = next.encounters[encounterId]?.combatants.find((c) => c.combatantId === aId);
    expect(combatant?.turnUsage.actionUsed).toBe(true);
  });

  it('counts attacks across multiple events', () => {
    const { state, encounterId, aId } = seedActiveEncounter();
    const attack: ActionEconomyConsumedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'attack',
    };
    const after = applyAll(state, [attack, attack, attack]);
    const combatant = after.encounters[encounterId]?.combatants.find((c) => c.combatantId === aId);
    expect(combatant?.turnUsage.attacksMadeThisTurn).toBe(3);
  });

  it('rejects double-consuming an action', () => {
    const { state, encounterId, aId } = seedActiveEncounter();
    const event: ActionEconomyConsumedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'action',
    };
    const once = apply(state, event);
    expect(() => apply(once, event)).toThrow(/Action already used/);
  });

  it('rejects double-consuming a bonus action', () => {
    const { state, encounterId, aId } = seedActiveEncounter();
    const event: ActionEconomyConsumedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'bonusAction',
    };
    const once = apply(state, event);
    expect(() => apply(once, event)).toThrow(/Bonus action already used/);
  });

  it('rejects double-consuming a reaction', () => {
    const { state, encounterId, aId } = seedActiveEncounter();
    const event: ActionEconomyConsumedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'reaction',
    };
    const once = apply(state, event);
    expect(() => apply(once, event)).toThrow(/Reaction already used/);
  });

  it('TurnStarted resets actionUsed, bonusActionUsed, attacksMadeThisTurn', () => {
    const { state, encounterId, aId, bId } = seedActiveEncounter();
    const consume: ActionEconomyConsumedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'action',
    };
    const attack: ActionEconomyConsumedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'attack',
    };
    let s = applyAll(state, [consume, attack]);
    // advance turn
    s = applyAll(s, [
      { id: eventId(), at: isoTimestamp(), type: 'TurnEnded', encounterId, combatantId: aId, round: 1 } satisfies TurnEndedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: bId, round: 1 } satisfies TurnStartedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnEnded', encounterId, combatantId: bId, round: 1 } satisfies TurnEndedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'RoundEnded', encounterId, round: 1 } satisfies RoundEndedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: aId, round: 2 } satisfies TurnStartedEvent,
    ]);
    const combatant = s.encounters[encounterId]?.combatants.find((c) => c.combatantId === aId);
    expect(combatant?.turnUsage.actionUsed).toBe(false);
    expect(combatant?.turnUsage.attacksMadeThisTurn).toBe(0);
  });

  it('a spent Reaction persists through RoundEnded and recharges at the combatant own next TurnStarted (slice 879)', () => {
    // RAW (rules-glossary "Reaction"): "Once you take a Reaction, you can't
    // take another one until the start of your next turn." Pre-879 the engine
    // reset every combatant's reaction at RoundEnded — a beat too early for a
    // combatant whose next turn isn't first in the new round. Now the reset is
    // per-turn, in applyTurnStarted.
    const { state, encounterId, aId, bId } = seedActiveEncounter();
    let s = apply(state, {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ActionEconomyConsumed',
      encounterId,
      combatantId: aId,
      kind: 'reaction',
    } satisfies ActionEconomyConsumedEvent);
    s = applyAll(s, [
      { id: eventId(), at: isoTimestamp(), type: 'TurnEnded', encounterId, combatantId: aId, round: 1 } satisfies TurnEndedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: bId, round: 1 } satisfies TurnStartedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'TurnEnded', encounterId, combatantId: bId, round: 1 } satisfies TurnEndedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'RoundEnded', encounterId, round: 1 } satisfies RoundEndedEvent,
    ]);
    // Across the round boundary A's reaction is STILL spent — it hasn't had
    // its next turn yet.
    const afterRound = s.encounters[encounterId]?.combatants.find((c) => c.combatantId === aId);
    expect(afterRound?.turnUsage.reactionUsedThisRound).toBe(true);
    // A's round-2 turn starts -> the reaction recharges.
    s = apply(s, {
      id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: aId, round: 2,
    } satisfies TurnStartedEvent);
    const afterOwnTurn = s.encounters[encounterId]?.combatants.find((c) => c.combatantId === aId);
    expect(afterOwnTurn?.turnUsage.reactionUsedThisRound).toBe(false);
  });
});
