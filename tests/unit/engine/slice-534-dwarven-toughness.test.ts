// Slice 534: Dwarven Toughness.
//
// RAW (SRD 5.2.1 Dwarf): "Dwarven Toughness. Your Hit Point maximum
// increases by 1, and it increases by 1 again whenever you gain a
// level."
//
// Pure content slice. Wires via `AddModifier { target: 'hpMax',
// value: { kind: 'level' } }` — the Formula DSL's `level` node
// evaluates to the character's total level, so +1 HP/level falls
// out automatically (L1 = +1, L2 = +2, ..., L20 = +20).
//
// Documented (not a deviation): the hpMax bonus is projected via
// derived `effectiveHpMax = hp.max + hpMaxBonus`. The stored
// `character.hp.max` is NOT mutated — reducer-side rules (massive
// damage threshold, heal clamping) still use stored `hp.max`. This
// is the existing slice-Aid convention (the Aid spell does the same
// thing with a fixed +5 hpMax bonus).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { computeDerivedCharacter } from '../../../src/derive/character-view.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildDwarf = (level: number): Character => {
  // hp.max scales with class level + CON mod; for this test we just
  // need a baseline that lets the +N hpMax bonus show through.
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: `Dwarf-L${level}`,
    speciesId: 'dwarf',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
  });
};

describe('Dwarven Toughness (slice 534)', () => {
  it('the dwarf species ships the AddModifier hpMax level-formula trait', () => {
    const sp = PACK.species.find((s) => s.id === 'dwarf')!;
    const trait = sp.traits.find((t) => t.kind === 'AddModifier' && (t as { target?: string }).target === 'hpMax');
    expect(trait).toBeDefined();
    expect((trait as { value: { kind: string } }).value.kind).toBe('level');
  });

  it.each([1, 2, 3, 5, 10, 20])('at character level %i, effectiveHpMax adds %i over stored hp.max', (level) => {
    const dwarf = buildDwarf(level);
    const view = computeDerivedCharacter({
      character: dwarf,
      content: CONTENT,
      itemInstances: {},
    });
    expect(view.hpMaxBonus).toBe(level);
    expect(view.effectiveHpMax).toBe(dwarf.hp.max + level);
  });

  it('a non-dwarf does NOT get the hpMax bonus (control)', () => {
    const human = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Human-L5',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 10, max: 10, temp: 0 },
    });
    const view = computeDerivedCharacter({
      character: human,
      content: CONTENT,
      itemInstances: {},
    });
    expect(view.hpMaxBonus).toBe(0);
    expect(view.effectiveHpMax).toBe(human.hp.max);
  });
});
