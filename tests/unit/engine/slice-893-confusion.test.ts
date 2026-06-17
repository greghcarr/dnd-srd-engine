// Slice 893 — Confusion's two missing arms: "can't take Bonus Actions or
// Reactions" + the per-turn 1d10 behavior roll. Closes the L7 audit Area-2
// DIVERGENCE `confusion-table-not-rolled`.
//
// RAW (Confusion): a creature that fails the WIS save "can't take Bonus Actions
// or Reactions and must roll 1d10 at the start of each of its turns to
// determine its behavior" (1 → move-only random direction; 2-6 → nothing; 7-8 →
// one melee attack on a random creature in reach; 9-10 → normal). The end-of-
// turn WIS save-ends and the WIS-save-on-cast were already wired.

import { describe, expect, it } from 'vitest';
import { apply, applyAll } from '../../../src/engine/apply.js';
import { emptyCampaignState } from '../../../src/schemas/runtime/campaign.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEncounterId, newAppliedConditionId } from '../../../src/ids.js';
import { buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ConfusionBehaviorRolledEvent } from '../../../src/schemas/events/combat.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type {
  EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent, TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';

const PACK = loadStarterPack();

// --- Action-economy gate (reducer) ---------------------------------------

const seedConfusedCombatant = () => {
  const a = buildFighter({ name: 'Addled' });
  const b = buildFighter({ name: 'Other' });
  const encounterId = newEncounterId();
  const state = applyAll(emptyCampaignState(), [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId: a.id as never, conditionId: 'confused-active', appliedConditionId: newAppliedConditionId() } satisfies ConditionAppliedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterCreated', encounterId, combatantIds: [a.id, b.id] } satisfies EncounterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId, rolls: [
      { combatantId: a.id, d20: 20, modifier: 0, total: 20 },
      { combatantId: b.id, d20: 5, modifier: 0, total: 5 },
    ] } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId } satisfies EncounterStartedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId, combatantId: a.id, round: 1 } satisfies TurnStartedEvent,
  ]);
  return { state, encounterId, aId: a.id };
};

const consume = (encounterId: string, combatantId: string, kind: 'action' | 'bonusAction' | 'reaction'): ActionEconomyConsumedEvent =>
  ({ id: eventId(), at: isoTimestamp(), type: 'ActionEconomyConsumed', encounterId, combatantId, kind });

describe('Confusion — no Bonus Actions or Reactions (slice 893)', () => {
  it('a confused combatant cannot take a Bonus Action', () => {
    const { state, encounterId, aId } = seedConfusedCombatant();
    expect(() => apply(state, consume(encounterId, aId, 'bonusAction'))).toThrow(/Confused.*Bonus Action/);
  });

  it('a confused combatant cannot take a Reaction', () => {
    const { state, encounterId, aId } = seedConfusedCombatant();
    expect(() => apply(state, consume(encounterId, aId, 'reaction'))).toThrow(/Confused.*Reaction/);
  });

  it('a confused combatant may still take an Action (the behavior table gates which one, not whether)', () => {
    const { state, encounterId, aId } = seedConfusedCombatant();
    expect(() => apply(state, consume(encounterId, aId, 'action'))).not.toThrow();
  });
});

// --- Behavior roll (planner) ---------------------------------------------

const buildConfused = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Spinner', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 }, featsTaken: [],
    appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'confused-active' }],
  });

const rollBehavior = (seed: number): ConfusionBehaviorRolledEvent => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const c = buildConfused();
  let campaign: Campaign = engine.createCampaign({ name: 'confusion' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.rollConfusionBehavior(campaign.state, { characterId: c.id }).events;
  return events.find((e): e is ConfusionBehaviorRolledEvent => e.type === 'ConfusionBehaviorRolled')!;
};

const expectedBehavior = (d10: number): string =>
  d10 === 1 ? 'random-move' : d10 <= 6 ? 'do-nothing' : d10 <= 8 ? 'melee-random' : 'normal';

describe('Confusion — the 1d10 behavior roll (slice 893)', () => {
  it('every rolled d10 maps to its RAW behavior bucket', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const ev = rollBehavior(seed);
      expect(ev.d10).toBeGreaterThanOrEqual(1);
      expect(ev.d10).toBeLessThanOrEqual(10);
      expect(ev.behavior).toBe(expectedBehavior(ev.d10));
      // A direction is present iff the roll forced a random move (d10 === 1).
      if (ev.behavior === 'random-move') {
        expect(['north', 'east', 'south', 'west']).toContain(ev.direction);
      } else {
        expect(ev.direction).toBeUndefined();
      }
    }
  });

  it('the roll is deterministic under a fixed seed (replay-safe)', () => {
    const a = rollBehavior(7);
    const b = rollBehavior(7);
    expect(b.d10).toBe(a.d10);
    expect(b.behavior).toBe(a.behavior);
  });

  it('rolling for a non-Confused creature throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const plain = buildFighter({ name: 'Lucid' });
    let campaign: Campaign = engine.createCampaign({ name: 'no-confusion' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: plain } satisfies CharacterCreatedEvent,
    ]);
    expect(() => engine.plan.rollConfusionBehavior(campaign.state, { characterId: plain.id })).toThrow(/not Confused/);
  });
});
