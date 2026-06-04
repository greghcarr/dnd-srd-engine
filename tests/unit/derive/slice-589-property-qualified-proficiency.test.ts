// Slice 589: weapon proficiency now supports property-qualified
// category tokens ("<category>-<property>"), e.g. "martial-light" or
// "martial-finesse". RAW shape for Monk (Simple + Martial light) and
// Rogue (Simple + Martial finesse-or-light). Surfaced when the combat
// fuzz tried to fire Vex on a Rogue's shortsword and the engine
// rejected the mastery because the rogue was treated as not proficient
// (the pack declared only `["simple"]`).
//
// This test pins:
//   1. The property-qualified token resolves correctly when a weapon
//      has the named property.
//   2. The token is rejected when the weapon lacks the property.
//   3. The token is rejected when the category mismatches.
//   4. The pack's Rogue + Monk now actually grants the RAW proficiency.

import { describe, expect, it } from 'vitest';
import { isWeaponProficient } from '../../../src/derive/attack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';

const STARTER_CONTENT = resolveContent([loadStarterPack()]);

const buildRogue = () =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Rogue',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 16, CON: 14, INT: 13, WIS: 12, CHA: 10 },
    hp: { current: 9, max: 9, temp: 0 },
  });

const buildMonk = () =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Monk',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'monk', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 8 },
    hp: { current: 9, max: 9, temp: 0 },
  });

const buildWizard = () =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 6, max: 6, temp: 0 },
  });

const weapon = (id: string) => {
  const w = STARTER_CONTENT.items.get(id);
  if (!w || w.itemKind !== 'weapon') {
    throw new Error(`Test pack missing weapon '${id}'`);
  }
  return w;
};

describe('Property-qualified weapon proficiency (slice 589)', () => {
  it('Rogue is proficient with martial finesse weapons (rapier)', () => {
    expect(isWeaponProficient(buildRogue(), weapon('rapier'), STARTER_CONTENT)).toBe(true);
  });

  it('Rogue is proficient with martial light weapons (shortsword / scimitar)', () => {
    expect(isWeaponProficient(buildRogue(), weapon('shortsword'), STARTER_CONTENT)).toBe(true);
    expect(isWeaponProficient(buildRogue(), weapon('scimitar'), STARTER_CONTENT)).toBe(true);
  });

  it('Rogue is NOT proficient with non-finesse-non-light martial weapons (greataxe)', () => {
    expect(isWeaponProficient(buildRogue(), weapon('greataxe'), STARTER_CONTENT)).toBe(false);
  });

  it('Monk is proficient with martial light weapons (shortsword)', () => {
    expect(isWeaponProficient(buildMonk(), weapon('shortsword'), STARTER_CONTENT)).toBe(true);
  });

  it('Monk is NOT proficient with martial finesse-only weapons (rapier)', () => {
    expect(isWeaponProficient(buildMonk(), weapon('rapier'), STARTER_CONTENT)).toBe(false);
  });

  it('Wizard is proficient with simple weapons (quarterstaff) — slice 589 added the missing "simple" token', () => {
    expect(isWeaponProficient(buildWizard(), weapon('quarterstaff'), STARTER_CONTENT)).toBe(true);
  });

  it('Wizard is NOT proficient with any martial weapon', () => {
    expect(isWeaponProficient(buildWizard(), weapon('rapier'), STARTER_CONTENT)).toBe(false);
    expect(isWeaponProficient(buildWizard(), weapon('greataxe'), STARTER_CONTENT)).toBe(false);
  });
});
