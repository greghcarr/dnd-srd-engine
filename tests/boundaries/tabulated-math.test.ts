// Exhaustive boundary sweeps over canonical rulebook tables.
//
// Property tests with random inputs hit boundaries in expectation but
// not in certainty. Off-by-one bugs in level-table interpretation,
// ability-score-to-modifier edge cases at scores of 1 and 30,
// exhaustion progression, carrying capacity at STR 30 are the bugs
// random sampling misses because they're rare events in the input
// space. This file asserts every cell of every small canonical table.
//
// Each constant below is transcribed from PHB 2024 and double-checked.
// A failure here means either a derivation regressed or this file's
// transcription is wrong, never "the table is debatable."

import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
  proficiencyBonus,
  ABILITY_SCORE_MIN,
  ABILITY_SCORE_MAX,
  PROFICIENCY_BONUS_LEVEL_MIN,
  PROFICIENCY_BONUS_LEVEL_MAX,
} from '../../src/derive/ability.js';
import { computeSpellSlots, spellSlotsForLevel } from '../../src/derive/spell-slots.js';
import { computeCarryingCapacity } from '../../src/derive/carrying-capacity.js';
import { computeSavingThrow } from '../../src/derive/save.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { TEST_CONTENT } from '../fixtures/index.js';
import { buildFighter } from '../fixtures/index.js';
import { newCharacterId } from '../../src/ids.js';
import { EXHAUSTION_MIN, EXHAUSTION_MAX } from '../../src/schemas/primitives.js';

const buildChar = (
  classes: Array<{ classId: string; level: number }>,
  overrides: Partial<{ STR: number; DEX: number; CON: number; INT: number; WIS: number; CHA: number }> = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'tmp',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: classes.map((c) => ({
      classId: c.classId,
      level: c.level,
      hitDiceRemaining: c.level,
    })),
    abilityScores: {
      STR: overrides.STR ?? 10,
      DEX: overrides.DEX ?? 10,
      CON: overrides.CON ?? 10,
      INT: overrides.INT ?? 10,
      WIS: overrides.WIS ?? 10,
      CHA: overrides.CHA ?? 10,
    },
    hp: { current: 1, max: 1, temp: 0 },
    featsTaken: ['savage-attacker'],
  });

describe('ability score → modifier table (PHB 2024)', () => {
  // The canonical formula floor((score-10)/2) covers the whole 1-30 range.
  const expectedModifiers: ReadonlyArray<{ score: number; mod: number }> = [
    { score: 1, mod: -5 },
    { score: 2, mod: -4 },
    { score: 3, mod: -4 },
    { score: 4, mod: -3 },
    { score: 5, mod: -3 },
    { score: 6, mod: -2 },
    { score: 7, mod: -2 },
    { score: 8, mod: -1 },
    { score: 9, mod: -1 },
    { score: 10, mod: 0 },
    { score: 11, mod: 0 },
    { score: 12, mod: 1 },
    { score: 13, mod: 1 },
    { score: 14, mod: 2 },
    { score: 15, mod: 2 },
    { score: 16, mod: 3 },
    { score: 17, mod: 3 },
    { score: 18, mod: 4 },
    { score: 19, mod: 4 },
    { score: 20, mod: 5 },
    { score: 21, mod: 5 },
    { score: 22, mod: 6 },
    { score: 23, mod: 6 },
    { score: 24, mod: 7 },
    { score: 25, mod: 7 },
    { score: 26, mod: 8 },
    { score: 27, mod: 8 },
    { score: 28, mod: 9 },
    { score: 29, mod: 9 },
    { score: 30, mod: 10 },
  ];

  it.each(expectedModifiers)('score $score → modifier $mod', ({ score, mod }) => {
    expect(abilityModifier(score)).toBe(mod);
  });

  it('rejects score below the floor', () => {
    expect(() => abilityModifier(ABILITY_SCORE_MIN - 1)).toThrow(/out of range/);
  });

  it('rejects score above the ceiling', () => {
    expect(() => abilityModifier(ABILITY_SCORE_MAX + 1)).toThrow(/out of range/);
  });
});

describe('proficiency bonus by level table (PHB 2024)', () => {
  // The canonical 4-tier table: +2 (L1-4), +3 (L5-8), +4 (L9-12), +5 (L13-16), +6 (L17-20).
  const expectedPB: ReadonlyArray<{ level: number; pb: number }> = [
    { level: 1, pb: 2 },
    { level: 2, pb: 2 },
    { level: 3, pb: 2 },
    { level: 4, pb: 2 },
    { level: 5, pb: 3 },
    { level: 6, pb: 3 },
    { level: 7, pb: 3 },
    { level: 8, pb: 3 },
    { level: 9, pb: 4 },
    { level: 10, pb: 4 },
    { level: 11, pb: 4 },
    { level: 12, pb: 4 },
    { level: 13, pb: 5 },
    { level: 14, pb: 5 },
    { level: 15, pb: 5 },
    { level: 16, pb: 5 },
    { level: 17, pb: 6 },
    { level: 18, pb: 6 },
    { level: 19, pb: 6 },
    { level: 20, pb: 6 },
  ];

  it.each(expectedPB)('level $level → +$pb', ({ level, pb }) => {
    expect(proficiencyBonus(level)).toBe(pb);
  });

  it('rejects level below the floor', () => {
    expect(() => proficiencyBonus(PROFICIENCY_BONUS_LEVEL_MIN - 1)).toThrow(/out of range/);
  });

  it('rejects level above the ceiling', () => {
    expect(() => proficiencyBonus(PROFICIENCY_BONUS_LEVEL_MAX + 1)).toThrow(/out of range/);
  });
});

describe('full caster spell slot table (PHB 2024, wizard reference)', () => {
  // Canonical full-caster slot table from PHB 2024, transcribed
  // row-by-row. Each row is [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th].
  const FULL_CASTER_TABLE: ReadonlyArray<ReadonlyArray<number>> = [
    [2, 0, 0, 0, 0, 0, 0, 0, 0], // L1
    [3, 0, 0, 0, 0, 0, 0, 0, 0], // L2
    [4, 2, 0, 0, 0, 0, 0, 0, 0], // L3
    [4, 3, 0, 0, 0, 0, 0, 0, 0], // L4
    [4, 3, 2, 0, 0, 0, 0, 0, 0], // L5
    [4, 3, 3, 0, 0, 0, 0, 0, 0], // L6
    [4, 3, 3, 1, 0, 0, 0, 0, 0], // L7
    [4, 3, 3, 2, 0, 0, 0, 0, 0], // L8
    [4, 3, 3, 3, 1, 0, 0, 0, 0], // L9
    [4, 3, 3, 3, 2, 0, 0, 0, 0], // L10
    [4, 3, 3, 3, 2, 1, 0, 0, 0], // L11
    [4, 3, 3, 3, 2, 1, 0, 0, 0], // L12
    [4, 3, 3, 3, 2, 1, 1, 0, 0], // L13
    [4, 3, 3, 3, 2, 1, 1, 0, 0], // L14
    [4, 3, 3, 3, 2, 1, 1, 1, 0], // L15
    [4, 3, 3, 3, 2, 1, 1, 1, 0], // L16
    [4, 3, 3, 3, 2, 1, 1, 1, 1], // L17
    [4, 3, 3, 3, 3, 1, 1, 1, 1], // L18
    [4, 3, 3, 3, 3, 2, 1, 1, 1], // L19
    [4, 3, 3, 3, 3, 2, 2, 1, 1], // L20
  ];

  for (let level = 1; level <= 20; level++) {
    const expected = FULL_CASTER_TABLE[level - 1];
    if (expected === undefined) throw new Error(`Missing row ${level}`);
    it(`wizard L${level} slot row`, () => {
      const char = buildChar([{ classId: 'wizard', level }]);
      const result = computeSpellSlots(char, TEST_CONTENT.classes);
      expect(result.slotsByLevel).toEqual(expected);
    });
  }

  it('cantrips return infinity from spellSlotsForLevel', () => {
    const char = buildChar([{ classId: 'wizard', level: 1 }]);
    const result = computeSpellSlots(char, TEST_CONTENT.classes);
    expect(spellSlotsForLevel(result, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('half caster spell slot table (PHB 2024, paladin reference)', () => {
  // The half-caster table per PHB 2024. L1 grants 2 first-level slots
  // (the 2024 change from 2014); progression mirrors a full caster of
  // half the level, rounded up via the multiclass contribution rule.
  // First-five-rows transcription per RAW; higher-level cells follow
  // the engine's `casterLevelContribution` (ceil(level/2)) mapping
  // into the full-caster slot table.
  const HALF_CASTER_FIRST_SLOT_BY_LEVEL: ReadonlyArray<number> = [
    2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  ];

  for (let level = 1; level <= 20; level++) {
    const expected = HALF_CASTER_FIRST_SLOT_BY_LEVEL[level - 1];
    if (expected === undefined) throw new Error(`Missing row ${level}`);
    it(`paladin L${level} first-level slot count = ${expected}`, () => {
      const char = buildChar([{ classId: 'paladin', level }]);
      const result = computeSpellSlots(char, TEST_CONTENT.classes);
      expect(result.slotsByLevel[0]).toBe(expected);
    });
  }
});

describe('pact magic table (PHB 2024, warlock reference)', () => {
  // Pact slot level + count by warlock level. Pact slots refresh on a
  // short rest, separate from the standard slot table.
  const PACT_TABLE: ReadonlyArray<{ level: number; count: number }> = [
    { level: 1, count: 1 }, // L1
    { level: 1, count: 2 }, // L2
    { level: 2, count: 2 }, // L3
    { level: 2, count: 2 }, // L4
    { level: 3, count: 2 }, // L5
    { level: 3, count: 2 }, // L6
    { level: 4, count: 2 }, // L7
    { level: 4, count: 2 }, // L8
    { level: 5, count: 2 }, // L9
    { level: 5, count: 2 }, // L10
    { level: 5, count: 3 }, // L11
    { level: 5, count: 3 }, // L12
    { level: 5, count: 3 }, // L13
    { level: 5, count: 3 }, // L14
    { level: 5, count: 3 }, // L15
    { level: 5, count: 3 }, // L16
    { level: 5, count: 4 }, // L17
    { level: 5, count: 4 }, // L18
    { level: 5, count: 4 }, // L19
    { level: 5, count: 4 }, // L20
  ];

  for (let level = 1; level <= 20; level++) {
    const expected = PACT_TABLE[level - 1];
    if (expected === undefined) throw new Error(`Missing row ${level}`);
    it(`warlock L${level} pact slots = ${expected.count} × L${expected.level}`, () => {
      const char = buildChar([{ classId: 'warlock', level }]);
      const result = computeSpellSlots(char, TEST_CONTENT.classes);
      expect(result.pactSlots).toEqual(expected);
    });
  }
});

describe('carrying capacity by Strength (PHB 2024, pounds)', () => {
  // PHB 2024: carrying capacity = STR × 15. Size modifiers (push, drag,
  // lift) are separate derivations; this table is the base.
  for (let str = ABILITY_SCORE_MIN; str <= ABILITY_SCORE_MAX; str++) {
    const expected = str * 15;
    it(`STR ${str} → ${expected} lb`, () => {
      const char = buildChar([{ classId: 'fighter', level: 1 }], { STR: str });
      expect(computeCarryingCapacity(char, TEST_CONTENT).capacity).toBe(expected);
    });
  }
});

describe('exhaustion penalties (PHB 2024: -2 per level on d20 tests, death at 6)', () => {
  // The 2024 exhaustion rule: each level imposes a cumulative -2 to
  // d20 tests (saves, checks, attacks). EXHAUSTION_MAX = 6 represents
  // death; the schema accepts 0-6 inclusive.
  for (let level = EXHAUSTION_MIN; level <= EXHAUSTION_MAX; level++) {
    // Use subtraction rather than `level * -2`; the latter yields -0
    // at level 0, which fails strict Object.is equality against +0.
    const expectedPenalty = 0 - level * 2;
    it(`exhaustion ${level} → INT saving throw penalty ${expectedPenalty}`, () => {
      // Fighter is proficient in STR + CON saves but not INT, so an
      // INT save isolates the exhaustion contribution: ability mod 0
      // (INT 10), no proficiency, only exhaustion.
      const character = buildFighter({ INT: 10, level: 1, exhaustion: level });
      const result = computeSavingThrow({
        character,
        itemInstances: {},
        content: TEST_CONTENT,
        ability: 'INT',
      });
      expect(result.total).toBe(expectedPenalty);
    });
  }

  it('rejects exhaustion above EXHAUSTION_MAX', () => {
    expect(() =>
      CharacterSchema.parse({
        id: newCharacterId(),
        name: 'tmp',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 1, max: 1, temp: 0 },
        featsTaken: ['savage-attacker'],
        exhaustion: EXHAUSTION_MAX + 1,
      }),
    ).toThrow();
  });
});
