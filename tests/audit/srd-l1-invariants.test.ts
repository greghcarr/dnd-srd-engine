// CI-guarded L1 SRD invariants audit (slice 574).
//
// Closes the audit-test-opportunity finding from the deep audit: three
// L1 invariants that could drift without CI catching them. Pinned here
// against [references/srd-markdown/classes.md](references/srd-markdown/classes.md):
//   1. Per-class hit die (d6 / d8 / d10 / d12).
//   2. Per-caster L1 spell-slot table.
//   3. Standard ability-score array bounds (8..15 before species ASIs).
//
// Slice 564's `slice-564-per-caster-l1-spellcasting.test.ts` exercises
// the derive-side spell-slot computation per caster; this audit pins
// the same RAW table against the pack so a future content edit that
// silently bumped a hit die or muted a class's spellcasting type fails
// CI immediately (not via the indirect spell-slots test).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { computeSpellSlots } from '../../src/derive/spell-slots.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// RAW hit dice per class (SRD 5.2.1 classes.md).
const RAW_HIT_DICE: Readonly<Record<string, number>> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  sorcerer: 6,
  wizard: 6,
};

// RAW L1 spell-slot row + pact slot per caster (PHB 2024).
//   Full caster L1: 2 first-level slots.
//   Half caster L1: 2 first-level slots (2024 change from 2014).
//   Pact L1: 1 first-level pact slot.
interface CasterRow {
  readonly classId: string;
  readonly ability: 'INT' | 'WIS' | 'CHA';
  readonly progression: 'full' | 'half' | 'pact';
  readonly l1Slots: ReadonlyArray<number>;
  readonly l1PactSlots: { level: number; count: number } | undefined;
}
const RAW_CASTERS: ReadonlyArray<CasterRow> = [
  { classId: 'bard',     ability: 'CHA', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'cleric',   ability: 'WIS', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'druid',    ability: 'WIS', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'sorcerer', ability: 'CHA', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'wizard',   ability: 'INT', progression: 'full', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'paladin',  ability: 'CHA', progression: 'half', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'ranger',   ability: 'WIS', progression: 'half', l1Slots: [2, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: undefined },
  { classId: 'warlock',  ability: 'CHA', progression: 'pact', l1Slots: [0, 0, 0, 0, 0, 0, 0, 0, 0], l1PactSlots: { level: 1, count: 1 } },
];

const buildL1Caster = (classId: string, ability: 'INT' | 'WIS' | 'CHA'): Character => {
  const abilityScores = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  abilityScores[ability] = 16;
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

describe('L1 SRD invariants audit (slice 574)', () => {
  describe('per-class hit die matches SRD', () => {
    for (const [classId, expected] of Object.entries(RAW_HIT_DICE)) {
      it(`${classId}.hitDie = ${expected}`, () => {
        const cls = PACK.classes?.find((c) => c.id === classId);
        expect(cls, `${classId} should be in the pack`).toBeDefined();
        expect(cls!.hitDie).toBe(expected);
      });
    }
  });

  describe('per-caster L1 spell slot table matches SRD', () => {
    for (const c of RAW_CASTERS) {
      it(`${c.classId} L1: ${c.progression} caster with ${c.ability}, slots = ${JSON.stringify(c.l1Slots)}`, () => {
        const cls = CONTENT.classes.get(c.classId);
        expect(cls?.spellcasting).toBeDefined();
        expect(cls!.spellcasting!.ability).toBe(c.ability);
        expect(cls!.spellcasting!.type).toBe(c.progression);
        const char = buildL1Caster(c.classId, c.ability);
        const slots = computeSpellSlots(char, CONTENT.classes);
        expect(slots.slotsByLevel).toEqual(c.l1Slots);
        if (c.l1PactSlots === undefined) {
          expect(slots.pactSlots).toBeUndefined();
        } else {
          expect(slots.pactSlots).toEqual(c.l1PactSlots);
        }
      });
    }
  });

  describe('non-caster classes have no spellcasting', () => {
    for (const classId of ['barbarian', 'fighter', 'monk', 'rogue']) {
      it(`${classId} has spellcasting === undefined or absent`, () => {
        const cls = CONTENT.classes.get(classId);
        expect(cls).toBeDefined();
        expect(cls!.spellcasting).toBeUndefined();
      });
    }
  });

  describe('standard ability-score array bounds (RAW 2024 standard array)', () => {
    // The 2024 standard array is {15, 14, 13, 12, 10, 8}. The engine
    // doesn't auto-build characters from this — the values land in
    // character.abilityScores via consumer-supplied input. But the
    // SCHEMA's bound (1..30 for general scores) is wide; the L1
    // creation bound (8..15 from standard array before species ASIs)
    // is consumer-managed. This audit just confirms that the schema
    // allows the canonical standard-array values (8..15) for L1
    // creation — a future tighter L1-only bound (if added) lands here.
    const STANDARD_ARRAY = [8, 10, 12, 13, 14, 15] as const;
    for (const v of STANDARD_ARRAY) {
      it(`schema accepts ability-score value ${v} (standard-array member)`, () => {
        expect(() => CharacterSchema.parse({
          id: newCharacterId(),
          name: 'arr',
          speciesId: 'human',
          backgroundId: 'soldier',
          classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
          abilityScores: { STR: v, DEX: v, CON: v, INT: v, WIS: v, CHA: v },
          hp: { current: 1, max: 1, temp: 0 },
        })).not.toThrow();
      });
    }
  });
});
