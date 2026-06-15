// Slice 882 — falling damage is ROLLED, not averaged. Closes the L7 audit
// Area-8 quirk `falling-averaged-not-rolled`.
//
// RAW (rules-glossary "Falling"): "the creature takes 1d6 Bludgeoning damage
// for every 10 feet it fell, to a maximum of 20d6." The engine previously
// substituted the fixed average (round(dice × 3.5)); now it rolls the dice
// through the plan/commit RNG, so a fall reads like every other damage roll
// (deterministic under replay capture, varies by seed).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

// A high-HP fighter with no damage resistances, so the rolled bludgeoning
// total passes through mitigation untouched.
const buildFaller = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Faller',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 },
    featsTaken: [],
  });

const fallDamage = (seed: number, distanceFeet: number): number => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const faller = buildFaller();
  let campaign: Campaign = engine.createCampaign({ name: 'fall' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: faller } satisfies CharacterCreatedEvent,
  ]);
  const events = engine.plan.falling(campaign.state, { characterId: faller.id, distanceFeet }).events;
  const dmg = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
  return dmg === undefined ? 0 : dmg.components.reduce((sum, c) => sum + c.amount, 0);
};

describe('Falling damage is rolled, not averaged (slice 882)', () => {
  it('a 50ft fall rolls 5d6 — total within [5, 30]', () => {
    const total = fallDamage(1, 50);
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(30);
  });

  it('the rolled total varies by seed (not a single fixed average)', () => {
    // 100ft = 10d6. Across several deterministic seeds the totals are not all
    // identical — which a fixed average (round(10×3.5)=35) could never produce.
    const totals = [1, 2, 3, 4, 5, 6].map((s) => fallDamage(s, 100));
    expect(new Set(totals).size).toBeGreaterThan(1);
    // Every one is still a legal 10d6 result.
    for (const t of totals) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(60);
    }
  });

  it('caps at 20d6 — a 200ft and a 500ft fall share the same [20, 120] envelope', () => {
    const at200 = fallDamage(7, 200);
    const at500 = fallDamage(7, 500);
    for (const t of [at200, at500]) {
      expect(t).toBeGreaterThanOrEqual(20);
      expect(t).toBeLessThanOrEqual(120);
    }
  });

  it('is deterministic under a fixed seed (replay-safe)', () => {
    expect(fallDamage(42, 120)).toBe(fallDamage(42, 120));
  });

  it('a sub-10ft fall deals no damage (no dice, no RNG draw)', () => {
    expect(fallDamage(1, 5)).toBe(0);
  });
});
