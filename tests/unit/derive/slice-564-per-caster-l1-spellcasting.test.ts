// Slice 564: per-caster L1 spellcasting test suite.
//
// Pre-slice the spell DC + slot derivation tests covered only Wizard /
// Paladin / Warlock at L1. Five L1 casters (Bard, Cleric, Druid, Ranger,
// Sorcerer) had no direct math assertion, so a regression in the slot
// table or the spellcasting-ability lookup could land for any of them
// without firing a test. This slice pins the L1 math for every caster
// class in the pack.
//
// For each of the 8 L1 caster classes:
//   1. Pack declaration matches RAW (ability + progression).
//   2. computeSpellSlots(L1, ability=16) returns the RAW slot table.
//   3. computeSpellSaveDC(L1, ability=16) returns 8 + 2 + 3 = 13.
//   4. computeSpellAttackBonus(L1, ability=16) returns 2 + 3 = +5.
//
// RAW source: references/srd-markdown/classes.md per-class progression
// table (PB column = 2 at L1; spell slots row at L1). The 2024 PHB +
// SRD 5.2.1 half-caster table grants 2 first-level slots at L1 (changed
// from 2014 where half-casters got nothing until L2); this test pins
// that for both Paladin and Ranger.

import { describe, expect, it } from 'vitest';
import { computeSpellSlots } from '../../../src/derive/spell-slots.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../../../src/derive/spell-dc.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';

// Uses the starter pack (not the minimal TEST_CONTENT fixture) because
// this slice asserts content + derivation jointly for all 8 SRD casters.
const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

type CasterAbility = 'INT' | 'WIS' | 'CHA';
type Progression = 'full' | 'half' | 'pact';

interface CasterSpec {
  readonly classId: string;
  readonly ability: CasterAbility;
  readonly progression: Progression;
  readonly l1Slots: ReadonlyArray<number>;
  readonly l1PactSlots: { level: number; count: number } | undefined;
}

const ABILITY_AT_16 = 16;
const PROF_BONUS_L1 = 2;
const MOD_AT_16 = 3;
const DC_BASE = 8;
const EXPECTED_DC = DC_BASE + PROF_BONUS_L1 + MOD_AT_16;
const EXPECTED_ATTACK = PROF_BONUS_L1 + MOD_AT_16;

const CASTERS: ReadonlyArray<CasterSpec> = [
  // Full casters (PHB 2024 full-caster slot row at L1: 2 first-level slots).
  { classId: 'bard',     ability: 'CHA', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'cleric',   ability: 'WIS', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'druid',    ability: 'WIS', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'sorcerer', ability: 'CHA', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'wizard',   ability: 'INT', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  // Half casters (PHB 2024 changed: L1 grants 2 first-level slots).
  { classId: 'paladin',  ability: 'CHA', progression: 'half', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'ranger',   ability: 'WIS', progression: 'half', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  // Pact caster (Warlock L1: 1 first-level pact slot, standard slots row is all zero).
  { classId: 'warlock',  ability: 'CHA', progression: 'pact', l1Slots: [0, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: { level: 1, count: 1 } },
];

const buildL1Caster = (classId: string, ability: CasterAbility): Character => {
  const abilityScores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  abilityScores[ability] = ABILITY_AT_16;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: 'L1Caster',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId, level: 1, hitDiceRemaining: 1 }],
    abilityScores,
    hp: { current: 1, max: 1, temp: 0 },
  });
};

describe('Per-caster L1 spellcasting (slice 564)', () => {
  for (const c of CASTERS) {
    describe(`${c.classId} L1`, () => {
      it(`pack declares ${c.ability} ${c.progression} caster`, () => {
        const cls = CONTENT.classes.get(c.classId);
        expect(cls).toBeDefined();
        expect(cls!.spellcasting).toBeDefined();
        expect(cls!.spellcasting!.ability).toBe(c.ability);
        expect(cls!.spellcasting!.type).toBe(c.progression);
      });

      it(`computeSpellSlots returns the RAW L1 row`, () => {
        const character = buildL1Caster(c.classId, c.ability);
        const slots = computeSpellSlots(character, CONTENT.classes);
        expect(slots.slotsByLevel).toEqual(c.l1Slots);
        if (c.l1PactSlots === undefined) {
          expect(slots.pactSlots).toBeUndefined();
        } else {
          expect(slots.pactSlots).toEqual(c.l1PactSlots);
        }
      });

      it(`computeSpellSaveDC = 8 + ${PROF_BONUS_L1} (prof) + ${MOD_AT_16} (${c.ability} mod) = ${EXPECTED_DC}`, () => {
        const character = buildL1Caster(c.classId, c.ability);
        const dc = computeSpellSaveDC({
          character,
          itemInstances: {},
          content: CONTENT,
          classId: c.classId,
        });
        expect(dc.total).toBe(EXPECTED_DC);
      });

      it(`computeSpellAttackBonus = ${PROF_BONUS_L1} (prof) + ${MOD_AT_16} (${c.ability} mod) = +${EXPECTED_ATTACK}`, () => {
        const character = buildL1Caster(c.classId, c.ability);
        const atk = computeSpellAttackBonus({
          character,
          itemInstances: {},
          content: CONTENT,
          classId: c.classId,
        });
        expect(atk.total).toBe(EXPECTED_ATTACK);
      });
    });
  }
});
