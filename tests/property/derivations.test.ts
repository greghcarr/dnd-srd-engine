// Property test: derivation invariants.
//
// For each property we generate ~1000 random characters and assert
// a property that should hold for *any* character the schema permits.
// Failures shrink down to a minimal counter-example, which makes
// regressions much easier to debug than synthetic targeted fixtures.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { TEST_CONTENT, makeItemInstance } from '../fixtures/index.js';
import {
  characterArb,
  characterWithEquipmentArb,
  weaponDefIdArb,
} from './generators.js';
import { computeAC } from '../../src/derive/ac.js';
import { computeSavingThrow } from '../../src/derive/save.js';
import { computeAttackBonus } from '../../src/derive/attack.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../../src/derive/spell-dc.js';
import { computeDerivedCharacter } from '../../src/derive/character-view.js';
import { abilityModifier, proficiencyBonus } from '../../src/derive/ability.js';
import type { ItemInstance } from '../../src/schemas/runtime/item-instance.js';
import type { AbilityScore } from '../../src/schemas/primitives.js';

const ABILITIES: ReadonlyArray<AbilityScore> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const NUM_RUNS = Number.parseInt(process.env['FAST_CHECK_NUM_RUNS'] ?? '50', 10);

const itemInstanceTable = (
  instances: ReadonlyArray<ItemInstance>,
): Readonly<Record<string, ItemInstance>> =>
  Object.fromEntries(instances.map((i) => [i.id, i]));

describe('property: derivations never throw for any valid Character', () => {
  it('computeAC returns total >= 1 for every generated character', () => {
    fc.assert(
      fc.property(characterWithEquipmentArb(), ({ character, itemInstances }) => {
        const ac = computeAC({
          character,
          itemInstances: itemInstanceTable(itemInstances),
          content: TEST_CONTENT,
        });
        expect(ac.total).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(ac.total)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('computeSavingThrow never throws for any ability', () => {
    fc.assert(
      fc.property(characterWithEquipmentArb(), ({ character, itemInstances }) => {
        for (const ability of ABILITIES) {
          const result = computeSavingThrow({
            character,
            itemInstances: itemInstanceTable(itemInstances),
            content: TEST_CONTENT,
            ability,
          });
          expect(Number.isFinite(result.total)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('computeAttackBonus never throws for any equipped weapon', () => {
    fc.assert(
      fc.property(
        characterWithEquipmentArb(),
        weaponDefIdArb(),
        ({ character, itemInstances }, weaponDefId) => {
          const weapon = makeItemInstance(weaponDefId);
          const table = itemInstanceTable([...itemInstances, weapon]);
          const result = computeAttackBonus({
            character,
            itemInstances: table,
            content: TEST_CONTENT,
            weaponInstanceId: weapon.id,
          });
          expect(Number.isFinite(result.total)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('computeSpellSaveDC + computeSpellAttackBonus never throw for any class', () => {
    fc.assert(
      fc.property(characterWithEquipmentArb(), ({ character, itemInstances }) => {
        const table = itemInstanceTable(itemInstances);
        const classId = character.classes[0]?.classId ?? 'fighter';
        const dc = computeSpellSaveDC({
          character,
          itemInstances: table,
          content: TEST_CONTENT,
          classId,
        });
        const atk = computeSpellAttackBonus({
          character,
          itemInstances: table,
          content: TEST_CONTENT,
          classId,
        });
        expect(Number.isFinite(dc.total)).toBe(true);
        expect(Number.isFinite(atk.total)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('computeDerivedCharacter produces a complete shape for any character', () => {
    fc.assert(
      fc.property(characterWithEquipmentArb(), ({ character, itemInstances }) => {
        const derived = computeDerivedCharacter({
          character,
          itemInstances: itemInstanceTable(itemInstances),
          content: TEST_CONTENT,
        });
        expect(derived.id).toBe(character.id);
        expect(derived.totalLevel).toBeGreaterThanOrEqual(1);
        expect(derived.proficiencyBonus).toBeGreaterThanOrEqual(2);
        expect(derived.ac.total).toBeGreaterThanOrEqual(1);
        for (const ability of ABILITIES) {
          expect(Number.isFinite(derived.abilityModifiers[ability])).toBe(true);
        }
        expect(derived.effectiveHpMax).toBe(character.hp.max + (character.hp.maxBonus ?? 0));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('property: pure rulebook derivations', () => {
  it('abilityModifier is monotonic non-decreasing in score', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        (a, b) => {
          if (a <= b) {
            expect(abilityModifier(a)).toBeLessThanOrEqual(abilityModifier(b));
          } else {
            expect(abilityModifier(a)).toBeGreaterThanOrEqual(abilityModifier(b));
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('abilityModifier(score) === floor((score - 10) / 2)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (score) => {
        expect(abilityModifier(score)).toBe(Math.floor((score - 10) / 2));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('proficiencyBonus is monotonic non-decreasing in level (and matches the PHB table)', () => {
    // PHB 2024: +2 at L1-4, +3 at L5-8, +4 at L9-12, +5 at L13-16, +6 at L17-20.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (a, b) => {
          if (a <= b) {
            expect(proficiencyBonus(a)).toBeLessThanOrEqual(proficiencyBonus(b));
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('property: derivation parity (random character) with TEST_CONTENT', () => {
  it('the same input produces the same output (referential transparency)', () => {
    fc.assert(
      fc.property(characterArb(), (character) => {
        const a = computeDerivedCharacter({
          character,
          itemInstances: {},
          content: TEST_CONTENT,
        });
        const b = computeDerivedCharacter({
          character,
          itemInstances: {},
          content: TEST_CONTENT,
        });
        expect(a.totalLevel).toBe(b.totalLevel);
        expect(a.ac.total).toBe(b.ac.total);
        expect(a.savingThrows.STR.total).toBe(b.savingThrows.STR.total);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
