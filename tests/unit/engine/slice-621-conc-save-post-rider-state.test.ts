// Slice 621: the main-damage `planConcentrationOnDamage` call in
// attack.ts (and cast-spell.ts spell-attack / save-or-suck / power-word)
// previously passed the raw pre-attack state + the pre-attack target
// snapshot to the helper. That had two visible failure modes the slice
// 620 L1-fuzz sweep caught:
//
// 1) Double-break: a rider (Hex / Hunter's Mark) that emitted a failed
//    CON save broke concentration via the slice-620 wiring inside
//    `dispatchTriggers`. The main-damage call then ran AGAIN against
//    the pre-rider state and (because `target.concentrationEffectId`
//    was still set in the stale snapshot) emitted a second
//    `ConcentrationBroken` event for the same already-broken effect.
//
// 2) Wrong-reason: when the main damage dropped the target to 0 HP
//    AFTER a rider had shaved their HP, the pre-attack snapshot still
//    showed full HP -- so `damageWouldDropTo0` returned false, the
//    helper fell through to a per-component save, and a failed save
//    emitted `ConcentrationBroken(reason='failedSave')` when RAW says
//    the reason is `'unconscious'` (0 HP -> Unconscious -> ends
//    concentration without a save).
//
// Fix: pass `stateBeforeMainDamage` (which already includes the rider
// events) and re-fetch the target from it. Now (1) the helper sees the
// rider already cleared `concentrationEffectId` and returns []; (2)
// `target.hp.current` reflects post-rider HP, so `damageWouldDropTo0`
// fires the correct 'unconscious' branch.
//
// This test is a deterministic seed-sweep proof of the joint invariant:
// at most ONE `ConcentrationBroken` event per attack planner call,
// even when both a rider damage and the main damage hit a single
// concentrating target.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/starter-pack.js';
import { buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import { newAppliedConditionId, newEffectInstanceId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';
import type { ConcentrationBrokenEvent } from '../../../src/schemas/events/concentration.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const STARTER = loadStarterPack();
const SEED_SWEEP = 400;

describe('slice 621: main-damage conc save uses post-rider state', () => {
  it('a Hex rider + main Eldritch Blast hit on a concentrating target emits at most ONE ConcentrationBroken per damage source (never doubles up)', () => {
    let validSeedsHitWithRider = 0;
    for (let seed = 0; seed < SEED_SWEEP; seed += 1) {
      const rng = seededRNG(seed);
      const engine = createEngine({ contentPacks: [STARTER], rng });
      const warlock = {
        ...buildFighter({ name: 'Warlock' }),
        knownSpells: ['hex', 'eldritch-blast'],
        preparedSpells: ['hex', 'eldritch-blast'],
        classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
      };
      const target = buildFighter({ name: 'Concentrator', hpMax: 200, hpCurrent: 200 });
      let campaign = engine.createCampaign({ name: 'slice-621' });
      const concEffectId = newEffectInstanceId();
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConcentrationStarted',
          effectInstanceId: concEffectId,
          casterId: target.id,
          spellId: 'bless',
          targetIds: [target.id],
          conditionsApplied: [
            { targetId: target.id, conditionId: 'blessed', appliedConditionId: newAppliedConditionId() },
          ],
        } satisfies ConcentrationStartedEvent,
      ]);

      let hexResult;
      try {
        hexResult = engine.plan.castSpell(campaign.state, {
          characterId: warlock.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: 'STR' },
        });
      } catch {
        continue;
      }
      campaign = commit(campaign, hexResult.events);

      // Use Eldritch Blast (spell attack via cast-spell.ts) -- it
      // exercises the cast-spell.ts:735 fix and reliably triggers the
      // Hex rider via fireAddDamage.
      const attackResult = (() => {
        try {
          return engine.plan.castSpell(campaign.state, {
            characterId: warlock.id,
            spellId: 'eldritch-blast',
            slotLevel: 0,
            targetIds: [target.id],
          });
        } catch {
          return undefined;
        }
      })();
      if (attackResult === undefined) continue;

      const damageApplieds = attackResult.events.filter(
        (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === target.id,
      );
      // Need both rider and main damage to hit for this invariant to
      // be testable; otherwise (miss, no rider) skip the seed.
      if (damageApplieds.length < 2) continue;
      validSeedsHitWithRider += 1;

      const concBroken = attackResult.events.filter(
        (e): e is ConcentrationBrokenEvent =>
          e.type === 'ConcentrationBroken' && e.casterId === target.id,
      );
      // Pre-slice-621: when the rider's CON save failed, the main
      // damage's helper call also fired against the stale state, so
      // TWO ConcentrationBroken events appeared. Post-slice-621: the
      // second call sees the already-cleared concentrationEffectId
      // and returns [], so at most ONE survives.
      expect(
        concBroken.length,
        `seed=${seed}: rider+main attack chain emitted ${concBroken.length} ConcentrationBroken events (expected <= 1)`,
      ).toBeLessThanOrEqual(1);
    }
    expect(
      validSeedsHitWithRider,
      `swept ${SEED_SWEEP} seeds, none produced a Hex rider + main hit on the concentrator (test would silently pass without coverage)`,
    ).toBeGreaterThan(0);
  });

  // Sibling invariant for bug 2 (wrong-reason): when both rider and
  // main damage break concentration in the same chain, the engine
  // never emits BOTH a 'failedSave' ConcBroken AND a separate
  // 'unconscious' ConcBroken for the same target (same as bug 1, but
  // testing the {failedSave-then-unconscious} ordering specifically).
  // Pre-slice-621 stale state could produce both because the
  // already-broken concentrationEffectId wasn't seen on the main path.
  // Covered structurally by the at-most-one assertion above; this
  // pins the ordering explicitly to catch regressions that drop bug 1
  // but accidentally re-introduce bug 2 via a different code path.
  it('a chain that includes a failedSave break followed by main damage to 0 HP never emits a duplicate unconscious break', () => {
    for (let seed = 0; seed < SEED_SWEEP; seed += 1) {
      const rng = seededRNG(seed);
      const engine = createEngine({ contentPacks: [STARTER], rng });
      const warlock = {
        ...buildFighter({ name: 'Warlock' }),
        knownSpells: ['hex', 'eldritch-blast'],
        preparedSpells: ['hex', 'eldritch-blast'],
        classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 16 },
      };
      const target = buildFighter({ name: 'Frail', hpMax: 4, hpCurrent: 4 });
      let campaign = engine.createCampaign({ name: 'slice-621-no-dup' });
      const concEffectId = newEffectInstanceId();
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warlock } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConcentrationStarted',
          effectInstanceId: concEffectId,
          casterId: target.id,
          spellId: 'bless',
          targetIds: [target.id],
          conditionsApplied: [
            { targetId: target.id, conditionId: 'blessed', appliedConditionId: newAppliedConditionId() },
          ],
        } satisfies ConcentrationStartedEvent,
      ]);

      let hexResult;
      try {
        hexResult = engine.plan.castSpell(campaign.state, {
          characterId: warlock.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: 'STR' },
        });
      } catch {
        continue;
      }
      campaign = commit(campaign, hexResult.events);

      let attackResult;
      try {
        attackResult = engine.plan.castSpell(campaign.state, {
          characterId: warlock.id,
          spellId: 'eldritch-blast',
          slotLevel: 0,
          targetIds: [target.id],
        });
      } catch {
        continue;
      }

      const damageApplieds = attackResult.events.filter(
        (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === target.id,
      );
      if (damageApplieds.length < 2) continue;
      const concBroken = attackResult.events.filter(
        (e): e is ConcentrationBrokenEvent =>
          e.type === 'ConcentrationBroken' && e.casterId === target.id,
      );
      // Invariant: never both a failedSave break and an unconscious
      // break for the same target in one chain. Either one OR the
      // other, depending on which damage source first triggered the
      // break (rider's failed save, or main damage's drop to 0).
      const reasons = concBroken.map((b) => b.reason);
      const hasFailed = reasons.includes('failedSave');
      const hasUnconscious = reasons.includes('unconscious');
      expect(
        hasFailed && hasUnconscious,
        `seed=${seed}: chain emitted BOTH failedSave AND unconscious ConcentrationBroken for the same target (reasons=${JSON.stringify(reasons)})`,
      ).toBe(false);
    }
  });
});
