// Slice 856 — `half-caster-l1-slot` is NOT A BUG (stale 2014 finding).
//
// The L7 audit row read: "A single-class L1 Paladin/Ranger shows a 1st-level
// slot (ceil(1/2)=1); RAW spellcasting starts at L2." That "starts at L2" is
// the **2014** rule. In SRD 5.2.1 (2024), `classes.md` lists
// "#### Level 1: Spellcasting" for the Paladin (and Ranger), and the Paladin
// Features table grants 2 first-level spell slots at Level 1. So a
// single-class L1 Paladin/Ranger SHOULD have 2 first-level slots —
// `ceil(1/2)=1 → row 1 = [2]` is the correct answer, deliberately implemented
// in slices 564/574. Adding a "L1 → 0 slots" guard (the third-caster shape)
// would be 2014 edition drift; the half-caster has nothing to guard.
//
// This guard pins the canon so a future audit can't re-flag it and a refactor
// can't silently re-introduce the 2014 level-2-start rule.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { computeSpellSlots } from '../../src/derive/spell-slots.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const build = (classId: string, level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: classId,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId, level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 14, CHA: 14 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const slots = (classId: string, level: number) =>
  computeSpellSlots(build(classId, level), CONTENT.classes).slotsByLevel;

describe('slice 856: half-caster L1 spellcasting is NOT A BUG (2024 grants it at L1)', () => {
  it('Paladin and Ranger are half-casters in the content pack', () => {
    for (const id of ['paladin', 'ranger']) {
      expect(CONTENT.classes.get(id)?.spellcasting?.type).toBe('half');
    }
  });

  it('a single-class L1 Paladin/Ranger has 2 first-level slots (Spellcasting at Level 1, RAW 2024)', () => {
    for (const id of ['paladin', 'ranger']) {
      expect(slots(id, 1)[0]).toBe(2); // NOT 0 — the 2014 "starts at L2" rule is gone
      // ...and no higher-level slots at L1.
      expect(slots(id, 1).slice(1).every((n) => n === 0)).toBe(true);
    }
  });

  it('the half-caster progression stays RAW above L1', () => {
    for (const id of ['paladin', 'ranger']) {
      expect(slots(id, 2).slice(0, 3)).toEqual([2, 0, 0]); // L2: 2 first
      expect(slots(id, 5).slice(0, 3)).toEqual([4, 2, 0]); // L5: 4 first + 2 second
    }
  });
});
