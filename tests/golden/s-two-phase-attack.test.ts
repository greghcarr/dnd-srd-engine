// Slice 754: the two-phase attack API composition invariant.
//
// engine.plan.attack (bundled) is split into engine.plan.attackRoll (the
// action-economy prelude + range/LoS/loading gates + the d20 attack roll)
// and engine.plan.attackDamage (the damage chain for a hit that stands).
// The contract: composing the two halves is byte-identical to the bundled
// form —
//
//   attackRoll(state, intent).events ++ attackDamage(roll).events
//     === attack(state, intent).events
//
// proven here across several seeds (covering both hits — exercising the
// damage phase — and misses, where attackDamage contributes only the
// loading-weapon tail, empty for a longsword). Two engines seeded
// identically reach the same RNG position through the same prelude, so the
// rolls match; ids/clock differ, so we normalize them out. Plus
// replay-equivalence on the committed two-phase log.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { replay } from '../../src/engine/replay.js';
import { commit } from '../../src/engine/commit.js';
import {
  TEST_PACK,
  buildFighter,
  eventId,
  isoTimestamp,
  makeItemInstance,
  normalizeEvents,
} from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';

const ATTACK_AT = '2026-02-02T00:00:00.000Z';

// Build a duel and sequence it up to the first actor's turn. Two calls with
// the same seed land at the same RNG position with logically-identical
// combatants (fresh ulids differ; stats/order match), so the planned attack
// rolls match between them.
const buildToFirstAttack = (seed: number) => {
  const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(seed) });
  const longA = makeItemInstance('longsword');
  const longB = makeItemInstance('longsword');
  const armorA = makeItemInstance('leather-armor');
  const armorB = makeItemInstance('leather-armor');
  const a = buildFighter({ name: 'Alyx', STR: 18, DEX: 14, armorInstanceId: armorA.id });
  const b = buildFighter({ name: 'Borin', STR: 16, DEX: 12, armorInstanceId: armorB.id });

  let campaign = engine.createCampaign({ name: 'duel' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longA },
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longB },
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armorA },
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armorB },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
  ]);

  const createEnc = engine.plan.createEncounter(campaign.state, {
    combatantIds: [a.id, b.id],
    at: '2026-01-01T00:00:00.000Z',
  });
  campaign = commit(campaign, createEnc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: createEnc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: createEnc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: createEnc.encounterId }).events);

  const firstActor = campaign.state.encounters[createEnc.encounterId]?.combatants[0]?.combatantId;
  if (!firstActor) throw new Error('no first actor');
  const otherActor = firstActor === a.id ? b.id : a.id;
  const firstWeapon = firstActor === a.id ? longA.id : longB.id;

  const intent = { attackerId: firstActor, targetId: otherActor, weaponInstanceId: firstWeapon, at: ATTACK_AT };
  return { engine, campaign, intent };
};

describe('golden: two-phase attack composition (slice 754)', () => {
  const SEEDS = [1, 2, 3, 7, 11, 42];

  it('attackRoll ++ attackDamage equals the bundled attack (normalized), across seeds', () => {
    let damagedSeeds = 0;
    for (const seed of SEEDS) {
      const bundledRun = buildToFirstAttack(seed);
      const bundled = bundledRun.engine.plan.attack(bundledRun.campaign.state, bundledRun.intent).events;

      const phasedRun = buildToFirstAttack(seed);
      const { events: rollEvents, roll } = phasedRun.engine.plan.attackRoll(
        phasedRun.campaign.state,
        phasedRun.intent,
      );
      const damageEvents = phasedRun.engine.plan.attackDamage(roll).events;
      const composed = [...rollEvents, ...damageEvents];

      expect(normalizeEvents(composed), `seed=${seed} composition != bundled`).toEqual(
        normalizeEvents(bundled),
      );
      // roll.hit must agree with whether a damage chain exists.
      const composedHasDamage = composed.some((e) => e.type === 'DamageApplied');
      expect(composedHasDamage, `seed=${seed} roll.hit disagrees with damage presence`).toBe(roll.hit);
      if (composedHasDamage) damagedSeeds += 1;
    }
    // At least one seed must land a hit, or the damage phase is never exercised.
    expect(damagedSeeds, 'no seed produced a hit — damage phase untested').toBeGreaterThan(0);
  });

  it('the committed two-phase log replays equivalently', () => {
    for (const seed of SEEDS) {
      const run = buildToFirstAttack(seed);
      const { events: rollEvents, roll } = run.engine.plan.attackRoll(run.campaign.state, run.intent);
      const damageEvents = run.engine.plan.attackDamage(roll).events;
      const campaign = commit(run.campaign, [...rollEvents, ...damageEvents]);
      expect(JSON.stringify(replay(campaign.events)), `seed=${seed} replay mismatch`).toBe(
        JSON.stringify(campaign.state),
      );
    }
  });
});
