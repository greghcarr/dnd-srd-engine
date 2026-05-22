// Property test: multi-class invariants.
//
// Multiclass spell-slot math is one of the most error-prone corners of
// 5e. The existing characterArb generator covers single-class only; the
// targeted tests in spell-slots.test.ts cover specific multiclass pairs
// but not the full space. This file fuzzes the multiclass spell-slot
// pipeline and the cross-class derivations against random class mixes
// drawn from the test pack.
//
// Invariants here describe properties that must hold for *any* legal
// multiclass character, not specific table values (those are covered
// in tests/boundaries/tabulated-math.test.ts and
// tests/unit/derive/spell-slots.test.ts).

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { TEST_CONTENT } from '../fixtures/index.js';
import { multiclassCharacterArb } from './generators.js';
import { computeSpellSlots, computeAvailableSpellSlots } from '../../src/derive/spell-slots.js';
import { computeDerivedCharacter } from '../../src/derive/character-view.js';
import { proficiencyBonus } from '../../src/derive/ability.js';
import { computeTotalLevel } from '../../src/schemas/runtime/character.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';

const NUM_RUNS = Number.parseInt(process.env['FAST_CHECK_NUM_RUNS'] ?? '50', 10);

// Single-class character with the same total level and ability scores,
// used as a comparison fixture when stripping a multiclass mix down to
// one of its constituents. Builds via the schema so any drift in
// required fields surfaces here too.
const buildSingleClass = (
  classId: string,
  level: number,
  scores: Character['abilityScores'],
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Single-class control',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId, level, hitDiceRemaining: level }],
    abilityScores: scores,
    hp: { current: 1, max: 1, temp: 0 },
    featsTaken: ['savage-attacker'],
  });

describe('multiclass character invariants', () => {
  it('total level always falls in [2, 20]', () => {
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        const total = computeTotalLevel(char);
        expect(total).toBeGreaterThanOrEqual(2);
        expect(total).toBeLessThanOrEqual(20);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('each class enrollment carries level >= 1', () => {
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        for (const enrollment of char.classes) {
          expect(enrollment.level).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('classes in the mix are distinct', () => {
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        const ids = char.classes.map((c) => c.classId);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('proficiency bonus reflects total character level', () => {
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        const derived = computeDerivedCharacter({
          character: char,
          itemInstances: {},
          content: TEST_CONTENT,
        });
        expect(derived.proficiencyBonus).toBe(proficiencyBonus(computeTotalLevel(char)));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('multiclass spell slot invariants', () => {
  it('all standard slot counts are non-negative', () => {
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        const slots = computeSpellSlots(char, TEST_CONTENT.classes);
        for (const count of slots.slotsByLevel) {
          expect(count).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('fighter + single caster (2-class mix): standard slots equal the caster-only slots', () => {
    // Fighter has no spellcasting progression, so a 2-class fighter/X
    // mix's standard slot table must equal a pure-X character of the
    // same X level. This catches accidental fighter-level leakage into
    // the multiclass casterLevel. Restricted to 2-class mixes so a
    // third spellcaster doesn't muddy the comparison.
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        if (char.classes.length !== 2) return;
        const fighter = char.classes.find((c) => c.classId === 'fighter');
        const caster = char.classes.find(
          (c) => c.classId !== 'fighter' && c.classId !== 'rogue' && c.classId !== 'warlock',
        );
        if (fighter === undefined || caster === undefined) return;
        const mixed = computeSpellSlots(char, TEST_CONTENT.classes);
        const pure = buildSingleClass(caster.classId, caster.level, char.abilityScores);
        const pureSlots = computeSpellSlots(pure, TEST_CONTENT.classes);
        expect(mixed.slotsByLevel).toEqual(pureSlots.slotsByLevel);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('pact slots match a pure-warlock of the same warlock level', () => {
    // Pact magic is its own table and does not stack with the standard
    // multiclass spellcaster table. Whether or not the warlock is paired
    // with other casters, the pact-slot row must match a pure-warlock
    // of that level.
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        const warlock = char.classes.find((c) => c.classId === 'warlock');
        if (warlock === undefined) return;
        const mixed = computeSpellSlots(char, TEST_CONTENT.classes);
        const pureWarlock = buildSingleClass('warlock', warlock.level, char.abilityScores);
        const pureSlots = computeSpellSlots(pureWarlock, TEST_CONTENT.classes);
        expect(mixed.pactSlots).toEqual(pureSlots.pactSlots);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('warlock + non-caster mix: standard slot table is all zeros', () => {
    // Warlock contributes only pact slots; a fighter/warlock or
    // rogue/warlock mix must have an empty standard slot table.
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        const hasWarlock = char.classes.some((c) => c.classId === 'warlock');
        const hasFullOrHalfCaster = char.classes.some(
          (c) => c.classId === 'wizard' || c.classId === 'paladin',
        );
        if (!hasWarlock || hasFullOrHalfCaster) return;
        const slots = computeSpellSlots(char, TEST_CONTENT.classes);
        expect(slots.slotsByLevel).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('available slots never exceed max slots', () => {
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        const max = computeSpellSlots(char, TEST_CONTENT.classes);
        const available = computeAvailableSpellSlots(char, TEST_CONTENT.classes);
        for (let i = 0; i < 9; i++) {
          const m = max.slotsByLevel[i] ?? 0;
          const a = available.standardByLevel[i] ?? 0;
          expect(a).toBeLessThanOrEqual(m);
          expect(a).toBeGreaterThanOrEqual(0);
        }
        if (max.pactSlots !== undefined) {
          expect(available.pact?.count ?? 0).toBeLessThanOrEqual(max.pactSlots.count);
          expect(available.pact?.count ?? 0).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('wizard + paladin (2-class) combined caster level matches ceil-half rule', () => {
    // 2024 multiclass spellcasting: full caster contributes full level,
    // half caster contributes ceil(level / 2). The combined caster
    // level determines the standard slot row. A 2-class wizard L +
    // paladin P multiclass should match a pure wizard of level
    // (L + ceil(P/2)).
    fc.assert(
      fc.property(multiclassCharacterArb(), (char) => {
        if (char.classes.length !== 2) return;
        const wizard = char.classes.find((c) => c.classId === 'wizard');
        const paladin = char.classes.find((c) => c.classId === 'paladin');
        if (wizard === undefined || paladin === undefined) return;
        const combinedCasterLevel = wizard.level + Math.ceil(paladin.level / 2);
        if (combinedCasterLevel > 20) return;
        const mixed = computeSpellSlots(char, TEST_CONTENT.classes);
        const pure = buildSingleClass('wizard', combinedCasterLevel, char.abilityScores);
        const pureSlots = computeSpellSlots(pure, TEST_CONTENT.classes);
        expect(mixed.slotsByLevel).toEqual(pureSlots.slotsByLevel);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
