// Slice 878 — Frightened by multiple sources. Closes the L7 audit Area-4 quirk
// `frightened-single-source-positional` (the multi-source arm; positionless /
// sourceless fear stays a deferred consumer/positional concern).
//
// RAW (Frightened): "while frightened by a source, you can't willingly move
// closer to the source of your fear." A creature can be Frightened by more than
// one source at once, and the restriction applies to each. Pre-878 the move
// planner read a single `.find()` (so a move toward a second fear source
// slipped through), AND the condition reducer deduped Frightened by id (so a
// second source's Frightened couldn't even be stored). Slice 878: the reducer
// stacks Frightened per `sourceCharacterId`, and `planMove` checks every
// positioned fear source.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { newEncounterId, newAppliedConditionId } from '../../../src/ids.js';
import { TEST_PACK, buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type {
  EncounterCreatedEvent, InitiativeRolledEvent, EncounterStartedEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';

const frighten = (targetId: string, sourceId: string): ConditionAppliedEvent => ({
  id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId,
  conditionId: 'frightened', appliedConditionId: newAppliedConditionId(), sourceCharacterId: sourceId as never,
});

// A mover at (10,10), fear source A to the west (5,10), fear source B to the
// north (10,5). The mover is the active combatant. `frightenBy` controls which
// sources have frightened the mover.
const setup = (frightenBy: ('a' | 'b')[]) => {
  const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(1) });
  const mover = buildFighter({ name: 'Mover' });
  const sourceA = buildFighter({ name: 'Dragon A' });
  const sourceB = buildFighter({ name: 'Dragon B' });
  let campaign: Campaign = engine.createCampaign({ name: 'fright' });
  campaign = commit(campaign, [mover, sourceA, sourceB].map((c) =>
    ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent));
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [mover.id, sourceA.id, sourceB.id] } satisfies EncounterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
      { combatantId: mover.id, d20: 20, modifier: 0, total: 20 },
      { combatantId: sourceA.id, d20: 5, modifier: 0, total: 5 },
      { combatantId: sourceB.id, d20: 4, modifier: 0, total: 4 },
    ] } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: mover.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  const place = (combatantId: string, x: number, y: number): CombatantMovedEvent => ({
    id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId, combatantId,
    fromPosition: { x: 0, y: 0 }, toPosition: { x, y }, feetTraveled: 0,
  });
  campaign = commit(campaign, [place(mover.id, 10, 10), place(sourceA.id, 5, 10), place(sourceB.id, 10, 5)]);
  const frightEvents = frightenBy.map((k) => frighten(mover.id, k === 'a' ? sourceA.id : sourceB.id));
  if (frightEvents.length > 0) campaign = commit(campaign, frightEvents);
  return { engine, campaign, moverId: mover.id };
};

describe('Frightened by multiple sources (slice 878)', () => {
  it('the reducer stacks Frightened per source (distinct sources, not deduped)', () => {
    const { campaign, moverId } = setup(['a', 'b']);
    const fears = campaign.state.characters[moverId]!.appliedConditions.filter((c) => c.conditionId === 'frightened');
    expect(fears).toHaveLength(2);
  });

  it('a re-application from the SAME source still dedupes to one', () => {
    const { campaign, moverId } = setup(['a', 'a']);
    const fears = campaign.state.characters[moverId]!.appliedConditions.filter((c) => c.conditionId === 'frightened');
    expect(fears).toHaveLength(1);
  });

  it('frightened by two sources: can move closer to NEITHER', () => {
    const { engine, campaign, moverId } = setup(['a', 'b']);
    // Toward source A (west).
    expect(() => engine.plan.move(campaign.state, { combatantId: moverId, to: { x: 8, y: 10 } })).toThrow(/Frightened by Dragon A/);
    // Toward source B (north) — pre-878 this slipped through (only the first source was checked).
    expect(() => engine.plan.move(campaign.state, { combatantId: moverId, to: { x: 10, y: 8 } })).toThrow(/Frightened by Dragon B/);
  });

  it('moving away from both fear sources is allowed', () => {
    const { engine, campaign, moverId } = setup(['a', 'b']);
    const events = engine.plan.move(campaign.state, { combatantId: moverId, to: { x: 15, y: 15 } }).events;
    expect(events.some((e) => e.type === 'CombatantMoved')).toBe(true);
  });

  it('frightened by only one source still constrains that source (regression)', () => {
    const { engine, campaign, moverId } = setup(['a']);
    expect(() => engine.plan.move(campaign.state, { combatantId: moverId, to: { x: 8, y: 10 } })).toThrow(/Frightened by Dragon A/);
    // ...but moving toward the OTHER (non-fear) creature is fine.
    expect(engine.plan.move(campaign.state, { combatantId: moverId, to: { x: 10, y: 8 } }).events.some((e) => e.type === 'CombatantMoved')).toBe(true);
  });
});
