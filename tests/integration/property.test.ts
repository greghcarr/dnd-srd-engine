import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  abilityModifier,
  ABILITY_SCORE_MAX,
  ABILITY_SCORE_MIN,
  PROFICIENCY_BONUS_LEVEL_MAX,
  PROFICIENCY_BONUS_LEVEL_MIN,
  proficiencyBonus,
} from '../../src/derive/ability.js';
import { rollDie, rollDice } from '../../src/rng/dice.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { apply } from '../../src/engine/apply.js';
import { emptyCampaignState } from '../../src/schemas/runtime/campaign.js';
import { buildFighter, eventId, isoTimestamp } from '../fixtures/index.js';
import type { DamageAppliedEvent, HealedEvent } from '../../src/schemas/events/combat.js';

const ITERATIONS = 1000;

describe('property tests', () => {
  it('abilityModifier is monotonic non-decreasing in score', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: ABILITY_SCORE_MIN, max: ABILITY_SCORE_MAX - 1 }),
        (score) => {
          expect(abilityModifier(score + 1)).toBeGreaterThanOrEqual(abilityModifier(score));
        },
      ),
      { numRuns: ITERATIONS },
    );
  });

  it('proficiencyBonus is monotonic non-decreasing in level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: PROFICIENCY_BONUS_LEVEL_MIN, max: PROFICIENCY_BONUS_LEVEL_MAX - 1 }),
        (level) => {
          expect(proficiencyBonus(level + 1)).toBeGreaterThanOrEqual(proficiencyBonus(level));
        },
      ),
      { numRuns: ITERATIONS },
    );
  });

  it('rollDie always returns 1..die for valid die sizes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 0, max: 2 ** 30 }),
        (die, seed) => {
          const rng = seededRNG(seed);
          const v = rollDie(die, rng);
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(die);
        },
      ),
      { numRuns: ITERATIONS },
    );
  });

  it('rollDice produces exactly count rolls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 2, max: 20 }),
        (count, die) => {
          const rolls = rollDice(count, die, seededRNG(7));
          expect(rolls).toHaveLength(count);
        },
      ),
      { numRuns: ITERATIONS / 2 },
    );
  });

  it('seeded RNG is deterministic and reproducible', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 30 }), (seed) => {
        const a = seededRNG(seed);
        const b = seededRNG(seed);
        for (let i = 0; i < 10; i++) {
          expect(a.next()).toBe(b.next());
        }
      }),
      { numRuns: ITERATIONS },
    );
  });

  it('damage never increases HP and never goes below -hpMax', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 200 }),
        (hpMax, damage) => {
          const character = buildFighter({ hpMax, hpCurrent: hpMax });
          const state = apply(emptyCampaignState(), {
            id: eventId(),
            at: isoTimestamp(),
            type: 'CharacterCreated',
            snapshot: character,
          });
          const event: DamageAppliedEvent = {
            id: eventId(),
            at: isoTimestamp(10),
            type: 'DamageApplied',
            targetId: character.id,
            components: [{ amount: damage, type: 'fire' }],
          };
          const next = apply(state, event);
          const hp = next.characters[character.id]?.hp.current ?? 0;
          expect(hp).toBeLessThanOrEqual(hpMax);
          expect(hp).toBeGreaterThanOrEqual(-hpMax);
        },
      ),
      { numRuns: ITERATIONS },
    );
  });

  it('healing never decreases HP and never exceeds hpMax', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 200 }),
        (hpMax, hpCurrent, heal) => {
          const start = Math.min(hpCurrent, hpMax);
          const character = buildFighter({ hpMax, hpCurrent: start });
          const state = apply(emptyCampaignState(), {
            id: eventId(),
            at: isoTimestamp(),
            type: 'CharacterCreated',
            snapshot: character,
          });
          const event: HealedEvent = {
            id: eventId(),
            at: isoTimestamp(10),
            type: 'Healed',
            targetId: character.id,
            amount: heal,
          };
          const next = apply(state, event);
          const hp = next.characters[character.id]?.hp.current ?? 0;
          expect(hp).toBeGreaterThanOrEqual(start);
          expect(hp).toBeLessThanOrEqual(hpMax);
        },
      ),
      { numRuns: ITERATIONS },
    );
  });
});
