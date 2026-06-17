// Slice 890 — multiclass-entry proficiencies. Closes the L7 audit Area-5
// DIVERGENCE `multiclass-entry-proficiencies`.
//
// RAW 2024 ("As a Multiclass Character", per class): when you take a level in a
// class OTHER than your origin class (the one chosen at creation), you gain
// only a REDUCED set of that class's proficiencies — e.g. multiclassing into
// Fighter grants Martial weapons + Light/Medium armor + Shields (NOT Heavy),
// and NO saving-throw proficiencies (those come only from the origin class).
//
// The engine's derivations (isArmorTrained / isWeaponProficient / save
// proficiency) walked EVERY class and granted its full proficiency set — so a
// multiclass character over-granted (a Wizard/Fighter got Fighter's heavy armor
// and STR/CON saves). Slice 890 treats `character.classes[0]` as the origin
// (full) class and entries 1+ as multiclass entries (the reduced
// `multiclassProficiencies` set; no saves).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { isArmorTrained, type ArmorCategory } from '../../../src/derive/armor-training.js';
import { isWeaponProficient } from '../../../src/derive/attack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { Weapon } from '../../../src/schemas/content/item.js';

const PACK = loadStarterPack();
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
const CONTENT = ENGINE.content;

const build = (classes: ReadonlyArray<{ id: string; level: number }>): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mixer', speciesId: 'human', backgroundId: 'soldier',
    classes: classes.map((c) => ({ classId: c.id, level: c.level, hitDiceRemaining: c.level })),
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14 },
    hp: { current: 10, max: 10, temp: 0 }, featsTaken: [],
  });

const saveProficient = (char: Character, ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'): boolean =>
  computeSavingThrow({ character: char, itemInstances: {}, content: CONTENT, ability })
    .breakdown.some((b) => b.source === 'proficiency');

const armorTrained = (char: Character, category: ArmorCategory): boolean => {
  const effects = buildEffectStack({ character: char, content: CONTENT, itemInstances: {}, pendingChoices: {} });
  return isArmorTrained(char, category, CONTENT, effects);
};

const weaponProficient = (char: Character, weaponId: string): boolean => {
  const def = CONTENT.items.get(weaponId);
  return isWeaponProficient(char, def as unknown as Weapon, CONTENT);
};

describe('multiclass-entry proficiencies (slice 890)', () => {
  it('Wizard 1 / Fighter 1 (origin Wizard): origin saves only, Fighter multiclass armor/weapons (no Heavy, no STR/CON saves)', () => {
    const c = build([{ id: 'wizard', level: 1 }, { id: 'fighter', level: 1 }]);
    // Saves: from the origin Wizard (INT/WIS) only — NOT Fighter's STR/CON.
    expect(saveProficient(c, 'INT')).toBe(true);
    expect(saveProficient(c, 'WIS')).toBe(true);
    expect(saveProficient(c, 'STR')).toBe(false);
    expect(saveProficient(c, 'CON')).toBe(false);
    // Armor: Fighter multiclass grants Light/Medium/Shield but NOT Heavy.
    expect(armorTrained(c, 'light')).toBe(true);
    expect(armorTrained(c, 'medium')).toBe(true);
    expect(armorTrained(c, 'shield')).toBe(true);
    expect(armorTrained(c, 'heavy')).toBe(false);
    // Weapons: Fighter multiclass grants Martial (a longsword is martial).
    expect(weaponProficient(c, 'longsword')).toBe(true);
  });

  it('Fighter 1 / Wizard 1 (origin Fighter): full Fighter saves + Heavy armor; Wizard multiclass adds no saves', () => {
    const c = build([{ id: 'fighter', level: 1 }, { id: 'wizard', level: 1 }]);
    // Origin Fighter grants STR/CON saves + the full armor set incl. Heavy.
    expect(saveProficient(c, 'STR')).toBe(true);
    expect(saveProficient(c, 'CON')).toBe(true);
    expect(armorTrained(c, 'heavy')).toBe(true);
    // Wizard as a multiclass entry grants no saving throws.
    expect(saveProficient(c, 'INT')).toBe(false);
    expect(saveProficient(c, 'WIS')).toBe(false);
  });

  it('Barbarian multiclass grants Shields but not Light/Medium armor', () => {
    // Origin Wizard (no armor) + Barbarian multiclass (Shields only).
    const c = build([{ id: 'wizard', level: 1 }, { id: 'barbarian', level: 1 }]);
    expect(armorTrained(c, 'shield')).toBe(true);
    expect(armorTrained(c, 'light')).toBe(false);
    expect(armorTrained(c, 'medium')).toBe(false);
    expect(armorTrained(c, 'heavy')).toBe(false);
  });

  it('single-class characters are unaffected (regression)', () => {
    const fighter = build([{ id: 'fighter', level: 5 }]);
    expect(saveProficient(fighter, 'STR')).toBe(true);
    expect(saveProficient(fighter, 'CON')).toBe(true);
    expect(armorTrained(fighter, 'heavy')).toBe(true);
    expect(weaponProficient(fighter, 'longsword')).toBe(true);

    const wizard = build([{ id: 'wizard', level: 5 }]);
    expect(saveProficient(wizard, 'INT')).toBe(true);
    expect(armorTrained(wizard, 'light')).toBe(false);
  });
});
