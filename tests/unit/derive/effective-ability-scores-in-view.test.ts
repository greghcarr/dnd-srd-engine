// Regression: the derived character view + AC must reflect EFFECTIVE
// ability scores (base + floor + IncreaseAbilityScore), not base scores.
//
// Bug (found in the L4 audit): computeDerivedCharacter computed
// abilityModifiers from base scores, and computeArmorAC used base DEX,
// so an ASI / Ioun Stone / Belt of Dwarvenkind / OverrideAbilityScore
// did not show in the derived character, the character sheet, initiative,
// or (for light/medium armor + plain unarmored) AC — even though saves,
// checks, attacks, and spell DCs already reflected it. Pre-existing since
// the slice-308 IncreaseAbilityScore primitive; universal once every L4+
// character gains an ASI.
//
// Ioun Stones are the test vehicle (a pure IncreaseAbilityScore, no
// level-up cascade): the same effect path an ASI resolves to.

import { describe, expect, it } from 'vitest';
import { computeDerivedCharacter } from '../../../src/derive/character-view.js';
import { computeAC } from '../../../src/derive/ac.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHero = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 4, hitDiceRemaining: 4 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 36, max: 36, temp: 0 },
    ...overrides,
  });

const derive = (character: Character, itemInstances = {}) =>
  computeDerivedCharacter({ character, itemInstances, content: CONTENT, pendingChoices: {} });

describe('derived character reflects effective ability scores', () => {
  it('baseline: no effects → abilityScores == base, modifiers from base', () => {
    const d = derive(buildHero());
    expect(d.abilityScores.STR).toBe(14);
    expect(d.abilityModifiers.STR).toBe(2);
    expect(d.abilityScores.DEX).toBe(14);
    expect(d.abilityModifiers.DEX).toBe(2);
  });

  it('Ioun Stone of Strength (+2) raises the derived STR score AND modifier', () => {
    const stone = makeItemInstance('ioun-stone-strength');
    const hero = buildHero({ inventory: [stone.id], equipped: { attuned: [stone.id] as never } });
    const d = derive(hero, { [stone.id]: stone });
    expect(d.abilityScores.STR).toBe(16); // 14 + 2
    expect(d.abilityModifiers.STR).toBe(3); // was 2 before the fix
    // The save (already correct pre-fix) now agrees with the headline mod.
    expect(d.savingThrows.STR.total).toBe(d.abilityModifiers.STR + d.proficiencyBonus); // fighter is STR-save proficient
  });

  it('caps at 20: STR 19 + Ioun Stone of Strength → 20 (not 21)', () => {
    const stone = makeItemInstance('ioun-stone-strength');
    const hero = buildHero({
      abilityScores: { STR: 19, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
      inventory: [stone.id],
      equipped: { attuned: [stone.id] as never },
    });
    const d = derive(hero, { [stone.id]: stone });
    expect(d.abilityScores.STR).toBe(20);
    expect(d.abilityModifiers.STR).toBe(5);
  });
});

describe('AC reflects effective DEX', () => {
  const acOf = (character: Character, itemInstances = {}) =>
    computeAC({ character, itemInstances, content: CONTENT, pendingChoices: {} }).total;

  it('plain unarmored (10 + DEX): Ioun Stone of Agility raises AC by 1', () => {
    const stone = makeItemInstance('ioun-stone-agility'); // +2 DEX → +1 mod
    const without = acOf(buildHero());
    const hero = buildHero({ inventory: [stone.id], equipped: { attuned: [stone.id] as never } });
    const withStone = acOf(hero, { [stone.id]: stone });
    expect(without).toBe(12); // 10 + DEX 14 (+2)
    expect(withStone).toBe(13); // 10 + DEX 16 (+3)
  });

  it('light armor (no dex cap): Ioun Stone of Agility raises AC by 1', () => {
    const armor = makeItemInstance('leather-armor'); // baseAC 11, no dexCap
    const stone = makeItemInstance('ioun-stone-agility');
    const hero = buildHero({
      inventory: [armor.id, stone.id],
      equipped: { armor: armor.id, attuned: [stone.id] as never },
    });
    const withStone = acOf(hero, { [armor.id]: armor, [stone.id]: stone });
    expect(withStone).toBe(14); // 11 + DEX 16 (+3); was 13 before the fix
  });
});
