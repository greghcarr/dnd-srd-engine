// Slice 749: unit tests for the pure reaction-decision logic
// (src/ai/reactions.ts). These are RNG-free predicates, so they're tested
// in isolation from the engine glue: each eligibility check + the
// pickDamageReaction priority cascade, plus the damage threshold.

import { describe, expect, it } from 'vitest';
import {
  pickDamageReaction,
  hasUncannyDodge,
  hasDeflectAttacks,
  hasStonesEndurance,
  shouldShield,
  shouldCuttingWords,
  shouldCounterspell,
  hasCountercharm,
  disadvantageFlipsHit,
  type IncomingDamage,
} from '../../../src/ai/reactions.js';
import { REACTION_MIN_DAMAGE } from '../../../src/ai/reaction-constants.js';
import { buildFighter } from '../../fixtures/index.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';

const withClass = (classId: string, level: number, extra: Record<string, unknown> = {}): Character =>
  CharacterSchema.parse({
    ...buildFighter(),
    classes: [{ classId, level, hitDiceRemaining: level }],
    ...extra,
  });

const goliath = (resources: ReadonlyArray<{ resourceId: string; current: number; max: number }>): Character =>
  CharacterSchema.parse({ ...buildFighter(), speciesId: 'goliath', resources });

const physicalHit: IncomingDamage = { total: 12, physicalType: 'slashing', fromAttack: true };

describe('reaction eligibility predicates (slice 749)', () => {
  it('hasUncannyDodge: rogue at L5+ only', () => {
    expect(hasUncannyDodge(withClass('rogue', 5))).toBe(true);
    expect(hasUncannyDodge(withClass('rogue', 4))).toBe(false);
    expect(hasUncannyDodge(withClass('fighter', 20))).toBe(false);
  });

  it('hasDeflectAttacks: monk at L3+ only', () => {
    expect(hasDeflectAttacks(withClass('monk', 3))).toBe(true);
    expect(hasDeflectAttacks(withClass('monk', 2))).toBe(false);
    expect(hasDeflectAttacks(withClass('rogue', 20))).toBe(false);
  });

  it('hasStonesEndurance: goliath with an unspent giant-ancestry resource only', () => {
    expect(hasStonesEndurance(goliath([{ resourceId: 'giant-ancestry', current: 1, max: 1 }]))).toBe(true);
    expect(hasStonesEndurance(goliath([{ resourceId: 'giant-ancestry', current: 0, max: 1 }]))).toBe(false);
    expect(hasStonesEndurance(goliath([]))).toBe(false);
    // Non-goliath with the resource still doesn't qualify.
    expect(hasStonesEndurance(withClass('fighter', 5, { resources: [{ resourceId: 'giant-ancestry', current: 1, max: 1 }] }))).toBe(false);
  });
});

describe('pickDamageReaction (slice 749)', () => {
  it('declines a hit below the damage threshold', () => {
    const tiny: IncomingDamage = { total: REACTION_MIN_DAMAGE - 1, physicalType: 'slashing', fromAttack: true };
    expect(pickDamageReaction(withClass('rogue', 5), tiny)).toBeNull();
  });

  it('a rogue takes Uncanny Dodge on a meaningful hit', () => {
    expect(pickDamageReaction(withClass('rogue', 5), physicalHit)).toEqual({ kind: 'uncannyDodge' });
  });

  it('a monk takes Deflect Attacks on a physical attack, carrying the damage type', () => {
    expect(pickDamageReaction(withClass('monk', 3), physicalHit)).toEqual({
      kind: 'deflectAttacks',
      physicalType: 'slashing',
    });
  });

  it('Deflect Attacks requires both a physical type and an attack source', () => {
    const monk = withClass('monk', 3);
    expect(pickDamageReaction(monk, { total: 12, physicalType: 'slashing', fromAttack: false })).toBeNull();
    expect(pickDamageReaction(monk, { total: 12, fromAttack: true })).toBeNull();
  });

  it('a goliath takes Stone\'s Endurance against any damage type', () => {
    const g = goliath([{ resourceId: 'giant-ancestry', current: 1, max: 1 }]);
    expect(pickDamageReaction(g, { total: 9, fromAttack: false })).toEqual({ kind: 'stonesEndurance' });
  });

  it('priority is fixed: Uncanny Dodge wins for a rogue who is also a goliath', () => {
    const rogueGoliath = CharacterSchema.parse({
      ...buildFighter(),
      speciesId: 'goliath',
      classes: [{ classId: 'rogue', level: 5, hitDiceRemaining: 5 }],
      resources: [{ resourceId: 'giant-ancestry', current: 1, max: 1 }],
    });
    expect(pickDamageReaction(rogueGoliath, physicalHit)).toEqual({ kind: 'uncannyDodge' });
  });

  it('a reactor with no qualifying feature takes nothing', () => {
    expect(pickDamageReaction(withClass('fighter', 7), physicalHit)).toBeNull();
  });
});

describe('shouldShield (slice 750)', () => {
  const wizardWithShield = (): Character => withClass('wizard', 5, { preparedSpells: ['shield'] });

  it('fires when the caster has Shield prepared and +5 would convert the hit to a miss', () => {
    expect(shouldShield(wizardWithShield(), 16, 14)).toBe(true); // 16 < 14+5
  });

  it('declines when +5 AC would not prevent the hit (slot not wasted)', () => {
    expect(shouldShield(wizardWithShield(), 20, 14)).toBe(false); // 20 >= 19
  });

  it('declines without the spell prepared, or for a non-Shield-casting class', () => {
    expect(shouldShield(withClass('wizard', 5), 16, 14)).toBe(false); // not prepared
    expect(shouldShield(withClass('fighter', 5, { preparedSpells: ['shield'] }), 16, 14)).toBe(false);
  });
});

describe('shouldCuttingWords (slice 750)', () => {
  const bardWithBI = (level: number): Character =>
    withClass('bard', level, { resources: [{ resourceId: 'bardic-inspiration', current: 1, max: 1 }] });

  it('fires when the attack hit and a max BI die could drop it below AC', () => {
    expect(shouldCuttingWords(bardWithBI(3), 15, 14)).toBe(true); // d6: 15-6=9 < 14
  });

  it('declines when even a max BI die cannot reach below AC', () => {
    expect(shouldCuttingWords(bardWithBI(3), 25, 14)).toBe(false); // 25-6=19 >= 14
  });

  it('declines on a miss, with no Bardic Inspiration, or for a non-Bard', () => {
    expect(shouldCuttingWords(bardWithBI(3), 12, 14)).toBe(false); // 12 < 14 (missed already)
    expect(shouldCuttingWords(withClass('bard', 3), 15, 14)).toBe(false); // no BI die
    expect(shouldCuttingWords(withClass('fighter', 3, { resources: [{ resourceId: 'bardic-inspiration', current: 1, max: 1 }] }), 15, 14)).toBe(false);
  });
});

describe('shouldCounterspell (slice 751)', () => {
  const wizardWithCounterspell = (): Character =>
    withClass('wizard', 5, { preparedSpells: ['counterspell'] });

  it('fires when the caster has Counterspell prepared and the spell is leveled', () => {
    expect(shouldCounterspell(wizardWithCounterspell(), 1)).toBe(true);
    expect(shouldCounterspell(wizardWithCounterspell(), 3)).toBe(true);
  });

  it('declines against a cantrip (slot level 0)', () => {
    expect(shouldCounterspell(wizardWithCounterspell(), 0)).toBe(false);
  });

  it('declines without Counterspell prepared', () => {
    expect(shouldCounterspell(withClass('wizard', 5), 1)).toBe(false);
  });
});

describe('hasCountercharm (slice 752)', () => {
  it('is true for a Bard at L7+', () => {
    expect(hasCountercharm(withClass('bard', 7))).toBe(true);
    expect(hasCountercharm(withClass('bard', 12))).toBe(true);
  });

  it('is false below L7 or for a non-Bard', () => {
    expect(hasCountercharm(withClass('bard', 6))).toBe(false);
    expect(hasCountercharm(withClass('wizard', 20))).toBe(false);
  });
});

describe('disadvantageFlipsHit (slice 753)', () => {
  it('flips a marginal hit when the reroll is lower', () => {
    // original 18 + 0 hits AC 18; a reroll of 10 drops min to 10 -> miss.
    expect(disadvantageFlipsHit(18, 10, 0, 18)).toBe(true);
  });

  it('does not flip when the lower roll still clears AC', () => {
    // both dice high vs a low AC: min(18,15)+2 = 17 >= 12.
    expect(disadvantageFlipsHit(18, 15, 2, 12)).toBe(false);
  });

  it('does not flip when the reroll is higher than the original used die', () => {
    // disadvantage takes the lower, so a higher reroll can't help the attacker.
    expect(disadvantageFlipsHit(15, 20, 3, 18)).toBe(false); // min=15, 15+3=18 >= 18
  });
});
