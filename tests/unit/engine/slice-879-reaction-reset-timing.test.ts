// Slice 879 — Reaction reset timing. Closes the L7 audit Area-4 quirk
// `reaction-reset-timing`.
//
// RAW (rules-glossary "Reaction"): "Once you take a Reaction, you can't take
// another one until the start of your next turn." The recharge is per-TURN
// (the start of the reactor's OWN next turn), not per-ROUND. Pre-879 the
// engine reset every combatant's `reactionUsedThisRound` at RoundEnded, which
// refreshed a spent reaction a beat too early for any combatant whose next
// turn isn't first in the new round — and missed the nuance that a creature
// reacting BEFORE its turn gets its reaction back AT its turn, so it can react
// again later that same round.
//
// Slice 879 moves the reset into `applyTurnStarted` (per-turn) and drops the
// RoundEnded reset. These reducer-level tests drive the exact event sequence so
// the timing is unambiguous.

import { describe, expect, it } from 'vitest';
import { apply, applyAll } from '../../../src/engine/apply.js';
import { emptyCampaignState } from '../../../src/schemas/runtime/campaign.js';
import { buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import { newEncounterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent,
  RoundEndedEvent, TurnEndedEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type { CampaignState } from '../../../src/schemas/runtime/campaign.js';

// Three fighters in fixed initiative order A (30) > B (20) > C (10). The
// encounter is seeded with A's round-1 turn already started (activeIndex 0).
const seed = () => {
  const a = buildFighter({ name: 'Aada' });
  const b = buildFighter({ name: 'Bren' });
  const c = buildFighter({ name: 'Cyra' });
  const encounterId = newEncounterId();
  const state = applyAll(emptyCampaignState(), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [a.id, b.id, c.id] } satisfies EncounterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
      { combatantId: a.id, d20: 28, modifier: 2, total: 30 },
      { combatantId: b.id, d20: 18, modifier: 2, total: 20 },
      { combatantId: c.id, d20: 8, modifier: 2, total: 10 },
    ] } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: a.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  return { state, encounterId, aId: a.id, bId: b.id, cId: c.id };
};

const consumeReaction = (combatantId: string, encounterId: string): ActionEconomyConsumedEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'ActionEconomyConsumed', encounterId, combatantId, kind: 'reaction',
});
const turnEnded = (combatantId: string, encounterId: string, round: number): TurnEndedEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'TurnEnded', encounterId, combatantId, round,
});
const turnStarted = (combatantId: string, encounterId: string, round: number): TurnStartedEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId, round,
});
const roundEnded = (encounterId: string, round: number): RoundEndedEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'RoundEnded', encounterId, round,
});
const reactionSpent = (s: CampaignState, encounterId: string, combatantId: string): boolean =>
  s.encounters[encounterId]!.combatants.find((c) => c.combatantId === combatantId)!.turnUsage.reactionUsedThisRound;

describe('Reaction reset timing (slice 879)', () => {
  it('a reaction taken before the reactor own turn recharges AT that turn (per-turn, not per-round)', () => {
    const { state, encounterId, aId, bId, cId } = seed();
    // During A's turn (round 1), C reacts (e.g. Shield vs. A's attack).
    let s = apply(state, consumeReaction(cId, encounterId));
    expect(reactionSpent(s, encounterId, cId)).toBe(true);
    // A ends, B's turn — B's TurnStarted must NOT recharge C.
    s = applyAll(s, [turnEnded(aId, encounterId, 1), turnStarted(bId, encounterId, 1)]);
    expect(reactionSpent(s, encounterId, cId)).toBe(true);
    // B ends, C's own turn starts -> C's reaction recharges.
    s = applyAll(s, [turnEnded(bId, encounterId, 1), turnStarted(cId, encounterId, 1)]);
    expect(reactionSpent(s, encounterId, cId)).toBe(false);
  });

  it('the same combatant can react twice in one round across its own turn boundary', () => {
    const { state, encounterId, aId, bId, cId } = seed();
    // B reacts during A's turn (before B's turn).
    let s = apply(state, consumeReaction(bId, encounterId));
    expect(reactionSpent(s, encounterId, bId)).toBe(true);
    // B's own turn starts -> recharge.
    s = applyAll(s, [turnEnded(aId, encounterId, 1), turnStarted(bId, encounterId, 1)]);
    expect(reactionSpent(s, encounterId, bId)).toBe(false);
    // B's turn ends; during C's turn (same round) B reacts again (e.g. an OA).
    s = applyAll(s, [turnEnded(bId, encounterId, 1), turnStarted(cId, encounterId, 1), consumeReaction(bId, encounterId)]);
    expect(reactionSpent(s, encounterId, bId)).toBe(true);
  });

  it('a reaction spent late in the round stays spent through RoundEnded until the reactor next turn', () => {
    const { state, encounterId, aId, bId, cId } = seed();
    // A reacts on its own turn, then the round completes.
    let s = apply(state, consumeReaction(aId, encounterId));
    s = applyAll(s, [
      turnEnded(aId, encounterId, 1),
      turnStarted(bId, encounterId, 1), turnEnded(bId, encounterId, 1),
      turnStarted(cId, encounterId, 1), turnEnded(cId, encounterId, 1),
      roundEnded(encounterId, 1),
    ]);
    // Pre-879 RoundEnded would have recharged A here. It must not.
    expect(reactionSpent(s, encounterId, aId)).toBe(true);
    // A's round-2 turn starts -> recharge.
    s = apply(s, turnStarted(aId, encounterId, 2));
    expect(reactionSpent(s, encounterId, aId)).toBe(false);
  });

  it('combatants recharge independently at their own turns, not simultaneously at round end', () => {
    const { state, encounterId, aId, bId, cId } = seed();
    // A spends on its OWN round-1 turn (the seeded active turn). C spends on
    // its OWN round-1 turn. Both spends are on/after each one's turn, so they
    // carry across the round boundary until each one's NEXT turn.
    let s = apply(state, consumeReaction(aId, encounterId));
    s = applyAll(s, [
      turnEnded(aId, encounterId, 1),
      turnStarted(bId, encounterId, 1), turnEnded(bId, encounterId, 1),
      turnStarted(cId, encounterId, 1), consumeReaction(cId, encounterId), turnEnded(cId, encounterId, 1),
      roundEnded(encounterId, 1),
    ]);
    // After RoundEnded both are still spent (pre-879 RoundEnded recharged both).
    expect(reactionSpent(s, encounterId, aId)).toBe(true);
    expect(reactionSpent(s, encounterId, cId)).toBe(true);
    // Round 2 begins: A acts first -> A recharges; C has NOT (its round-2 turn
    // hasn't come) — the independent, per-turn timing.
    s = apply(s, turnStarted(aId, encounterId, 2));
    expect(reactionSpent(s, encounterId, aId)).toBe(false);
    expect(reactionSpent(s, encounterId, cId)).toBe(true);
    // C's round-2 turn -> C recharges.
    s = applyAll(s, [
      turnEnded(aId, encounterId, 2),
      turnStarted(bId, encounterId, 2), turnEnded(bId, encounterId, 2),
      turnStarted(cId, encounterId, 2),
    ]);
    expect(reactionSpent(s, encounterId, cId)).toBe(false);
  });

  it('a combatant that never reacted stays available throughout', () => {
    const { state, encounterId, aId, bId, cId } = seed();
    const s = applyAll(state, [
      turnEnded(aId, encounterId, 1),
      turnStarted(bId, encounterId, 1), turnEnded(bId, encounterId, 1),
      turnStarted(cId, encounterId, 1), turnEnded(cId, encounterId, 1),
      roundEnded(encounterId, 1),
      turnStarted(aId, encounterId, 2),
    ]);
    expect(reactionSpent(s, encounterId, bId)).toBe(false);
  });
});
