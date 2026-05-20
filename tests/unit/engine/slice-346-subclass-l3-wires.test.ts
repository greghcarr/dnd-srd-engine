// Slice 346 - Tier-A subclass L3 content wires on existing primitives.
//
// - Oath of Devotion: the always-prepared oath-spell progression
//   (L3/L5/L9/L13/L17) via GrantSpell, mirroring the Draconic / Fiend /
//   Life domain spell lists.
// - Draconic Sorcery: Draconic Resilience (HP) = +1 HP max per sorcerer
//   level via AddModifier { hpMax, value: level formula }. (The AC half
//   was already wired via OverrideACFormula.)
import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildPaladin = (level: number, subclass: 'oath-of-devotion' | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Aurelia',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'paladin', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 16 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const buildSorcerer = (level: number, subclass: 'draconic-sorcery' | null): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ember',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'sorcerer', level, hitDiceRemaining: level, ...(subclass !== null ? { subclassId: subclass } : {}) }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 22, max: 22, temp: 0 },
  });

const grantedSpellIds = (character: Character): string[] =>
  buildEffectStack({ character, content: CONTENT, itemInstances: {} })
    .grantedSpells()
    .map((g) => g.spellId)
    .sort();

const hpMaxBonus = (character: Character): number =>
  buildEffectStack({ character, content: CONTENT, itemInstances: {} }).modifierSum('hpMax');

describe('slice 346: Oath of Devotion always-prepared spells', () => {
  it('L3 devotion paladin always-prepares the two L3 oath spells', () => {
    expect(grantedSpellIds(buildPaladin(3, 'oath-of-devotion'))).toEqual([
      'protection-from-evil-and-good',
      'shield-of-faith',
    ]);
  });

  it('higher tiers accrue with paladin level (L9 has L3 + L5 + L9 spells, not L13/L17)', () => {
    expect(grantedSpellIds(buildPaladin(9, 'oath-of-devotion'))).toEqual([
      'aid',
      'beacon-of-hope',
      'dispel-magic',
      'protection-from-evil-and-good',
      'shield-of-faith',
      'zone-of-truth',
    ]);
  });

  it('L17 devotion paladin has the full ten-spell progression', () => {
    expect(grantedSpellIds(buildPaladin(17, 'oath-of-devotion'))).toEqual([
      'aid',
      'beacon-of-hope',
      'commune',
      'dispel-magic',
      'flame-strike',
      'freedom-of-movement',
      'guardian-of-faith',
      'protection-from-evil-and-good',
      'shield-of-faith',
      'zone-of-truth',
    ]);
  });

  it('a paladin without the oath gets no granted spells', () => {
    expect(grantedSpellIds(buildPaladin(9, null))).toEqual([]);
  });
});

describe('slice 346: Draconic Resilience (HP)', () => {
  it('a draconic sorcerer (L3+) gains HP max equal to sorcerer level', () => {
    expect(hpMaxBonus(buildSorcerer(3, 'draconic-sorcery'))).toBe(3);
    expect(hpMaxBonus(buildSorcerer(6, 'draconic-sorcery'))).toBe(6);
    expect(hpMaxBonus(buildSorcerer(20, 'draconic-sorcery'))).toBe(20);
  });

  it('the feature is gated to L3 (a L2 draconic sorcerer has no HP-max bonus yet)', () => {
    expect(hpMaxBonus(buildSorcerer(2, 'draconic-sorcery'))).toBe(0);
  });

  it('a sorcerer without the subclass gets no HP-max bonus', () => {
    expect(hpMaxBonus(buildSorcerer(6, null))).toBe(0);
  });
});
