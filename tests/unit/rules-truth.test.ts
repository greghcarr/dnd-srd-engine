// Rules-truth assertions. Each `it` block is one short fact from the
// 2024 Player's Handbook and asserts the engine matches it. No event
// chains, no integration: just derivations against rulebook constants.
//
// The point of this file is to lock in the math against drift, and
// (when it's first written) to surface places where the engine doesn't
// match RAW. When a rule changes (errata, custom houserule), update the
// assertion here, not the engine. When the engine changes, this file
// is the canary.
//
// Asserts are grouped by section. Add a new section as the engine grows
// (multiclass spell slots, ki points, channel divinity uses, etc.).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import {
  abilityModifier,
  proficiencyBonus,
} from '../../src/derive/ability.js';
import { computeAC } from '../../src/derive/ac.js';
import { computeAttackBonus } from '../../src/derive/attack.js';
import { computeSavingThrow } from '../../src/derive/save.js';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../../src/derive/spell-dc.js';
import { computeAvailableSpellSlots } from '../../src/derive/spell-slots.js';
import { collectEffectsFromCharacter } from '../../src/derive/effect-stack.js';
import { makeItemInstance } from '../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildPC = (overrides: {
  classId: string;
  level: number;
  abilityScores?: Partial<Record<'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA', number>>;
  preparedSpells?: string[];
  equipped?: { mainHand?: string; armor?: string; shield?: string };
}): Character => {
  const defaults = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Tester',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: overrides.classId, level: overrides.level, hitDiceRemaining: overrides.level }],
    abilityScores: { ...defaults, ...overrides.abilityScores },
    hp: { current: 10, max: 10, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells: overrides.preparedSpells ?? [],
    ...(overrides.equipped !== undefined ? { equipped: overrides.equipped } : {}),
  });
};

describe('rules truth: ability modifiers', () => {
  it.each([
    [1, -5],  [3, -4],  [5, -3],  [7, -2],  [9, -1],
    [10, 0],  [12, 1],  [14, 2],  [16, 3],  [18, 4],
    [20, 5],  [22, 6],  [24, 7],  [28, 9],  [30, 10],
  ])('score %i -> modifier %i', (score, expected) => {
    expect(abilityModifier(score)).toBe(expected);
  });
});

describe('rules truth: proficiency bonus by level', () => {
  // PHB 2024 Proficiency Bonus table.
  const TABLE: ReadonlyArray<readonly [number, number]> = [
    [1, 2], [2, 2], [3, 2], [4, 2],
    [5, 3], [6, 3], [7, 3], [8, 3],
    [9, 4], [10, 4], [11, 4], [12, 4],
    [13, 5], [14, 5], [15, 5], [16, 5],
    [17, 6], [18, 6], [19, 6], [20, 6],
  ];
  it.each(TABLE)('level %i -> +%i', (level, expected) => {
    expect(proficiencyBonus(level)).toBe(expected);
  });
});

describe('rules truth: spell slots (single-class)', () => {
  // Slot counts assert the full caster table (Wizard, Cleric, Bard,
  // Druid, Sorcerer, Warlock-of-pact-slots-aside), the half caster
  // table (Paladin, Ranger), and the third caster gap (no third-caster
  // slot until level 3).
  it('Wizard 5: 4 first + 3 second + 2 third slots', () => {
    const w = buildPC({ classId: 'wizard', level: 5 });
    const slots = computeAvailableSpellSlots(w, CONTENT.classes);
    expect(slots.standardByLevel.slice(0, 3)).toEqual([4, 3, 2]);
  });
  it('Wizard 1: 2 first slots, no second', () => {
    const w = buildPC({ classId: 'wizard', level: 1 });
    const slots = computeAvailableSpellSlots(w, CONTENT.classes);
    expect(slots.standardByLevel.slice(0, 2)).toEqual([2, 0]);
  });
  it('Paladin 5: 4 first + 2 second, no third', () => {
    const p = buildPC({ classId: 'paladin', level: 5 });
    const slots = computeAvailableSpellSlots(p, CONTENT.classes);
    expect(slots.standardByLevel.slice(0, 3)).toEqual([4, 2, 0]);
  });
  it('Paladin 2: 2 first, no second', () => {
    // 2024 SRD has Paladin gaining Spellcasting at L1 (engine grants
    // 2 first-level slots via the half-caster table at L1 + L2).
    const p = buildPC({ classId: 'paladin', level: 2 });
    const slots = computeAvailableSpellSlots(p, CONTENT.classes);
    expect(slots.standardByLevel.slice(0, 2)).toEqual([2, 0]);
  });
  it('Paladin 1: 2 first slots (SRD 5.2.1 grants Spellcasting at L1)', () => {
    const p = buildPC({ classId: 'paladin', level: 1 });
    const slots = computeAvailableSpellSlots(p, CONTENT.classes);
    expect(slots.standardByLevel.slice(0, 2)).toEqual([2, 0]);
  });
  it('Wizard 9: includes a 5th-level slot', () => {
    const w = buildPC({ classId: 'wizard', level: 9 });
    const slots = computeAvailableSpellSlots(w, CONTENT.classes);
    expect(slots.standardByLevel[4]).toBeGreaterThanOrEqual(1);
  });
});

describe('rules truth: armor class', () => {
  it('unarmored, DEX 14: AC 12', () => {
    const c = buildPC({ classId: 'fighter', level: 1, abilityScores: { DEX: 14 } });
    expect(computeAC({ character: c, itemInstances: {}, content: CONTENT }).total).toBe(12);
  });
  it('chain shirt (medium, AC 13 + DEX up to +2), DEX 14: AC 15', () => {
    const armor = makeItemInstance('chain-shirt');
    const c = buildPC({
      classId: 'fighter',
      level: 1,
      abilityScores: { DEX: 14 },
      equipped: { armor: armor.id },
    });
    expect(computeAC({ character: c, itemInstances: { [armor.id]: armor }, content: CONTENT }).total).toBe(15);
  });
  it('chain shirt with high DEX is capped at +2', () => {
    const armor = makeItemInstance('chain-shirt');
    const c = buildPC({
      classId: 'fighter',
      level: 1,
      abilityScores: { DEX: 20 }, // +5, would be 18 without cap
      equipped: { armor: armor.id },
    });
    expect(computeAC({ character: c, itemInstances: { [armor.id]: armor }, content: CONTENT }).total).toBe(15);
  });
  it('plate (heavy, AC 18, ignores DEX), DEX 14: AC 18', () => {
    const armor = makeItemInstance('plate');
    const c = buildPC({
      classId: 'fighter',
      level: 1,
      abilityScores: { DEX: 14 },
      equipped: { armor: armor.id },
    });
    expect(computeAC({ character: c, itemInstances: { [armor.id]: armor }, content: CONTENT }).total).toBe(18);
  });
  it('declared natural armor (creature) overrides equipment math', () => {
    const c = CharacterSchema.parse({
      ...buildPC({ classId: 'fighter', level: 1, abilityScores: { DEX: 20 } }),
      armorClass: 18,
    });
    expect(computeAC({ character: c, itemInstances: {}, content: CONTENT }).total).toBe(18);
  });
});

describe('rules truth: attack bonus', () => {
  it('Fighter 5 with longsword (STR 16) = +6', () => {
    // PB +3, STR mod +3, proficient in martial weapons.
    const sword = makeItemInstance('longsword');
    const f = buildPC({
      classId: 'fighter',
      level: 5,
      abilityScores: { STR: 16 },
      equipped: { mainHand: sword.id },
    });
    const { total } = computeAttackBonus({
      character: f,
      itemInstances: { [sword.id]: sword },
      content: CONTENT,
      weaponInstanceId: sword.id,
    });
    expect(total).toBe(6);
  });
  it('Rogue 5 with dagger (DEX 18, finesse picks DEX) = +7', () => {
    const dagger = makeItemInstance('dagger');
    const r = buildPC({
      classId: 'rogue',
      level: 5,
      abilityScores: { STR: 10, DEX: 18 },
      equipped: { mainHand: dagger.id },
    });
    const { total } = computeAttackBonus({
      character: r,
      itemInstances: { [dagger.id]: dagger },
      content: CONTENT,
      weaponInstanceId: dagger.id,
    });
    expect(total).toBe(7);
  });
});

describe('rules truth: saving throws', () => {
  it('Fighter 5 CON save (CON 14, proficient): +5', () => {
    // CON mod +2, proficiency +3 (Fighter is proficient in STR and CON).
    const f = buildPC({ classId: 'fighter', level: 5, abilityScores: { CON: 14 } });
    const save = computeSavingThrow({ character: f, itemInstances: {}, content: CONTENT, ability: 'CON' });
    expect(save.total).toBe(5);
  });
  it('Fighter 5 INT save (INT 10, not proficient): +0', () => {
    const f = buildPC({ classId: 'fighter', level: 5 });
    const save = computeSavingThrow({ character: f, itemInstances: {}, content: CONTENT, ability: 'INT' });
    expect(save.total).toBe(0);
  });
  it('Wizard 5 INT save (INT 18, proficient): +7', () => {
    // INT mod +4, proficiency +3.
    const w = buildPC({ classId: 'wizard', level: 5, abilityScores: { INT: 18 } });
    const save = computeSavingThrow({ character: w, itemInstances: {}, content: CONTENT, ability: 'INT' });
    expect(save.total).toBe(7);
  });
});

describe('rules truth: spell save DC and spell attack bonus', () => {
  it('Wizard 5 (INT 18): save DC 15, spell attack +7', () => {
    // 8 + 3 (prof) + 4 (INT) = 15.
    const w = buildPC({ classId: 'wizard', level: 5, abilityScores: { INT: 18 } });
    const dc = computeSpellSaveDC({ character: w, itemInstances: {}, content: CONTENT, classId: 'wizard' });
    expect(dc.total).toBe(15);
    const atk = computeSpellAttackBonus({ character: w, itemInstances: {}, content: CONTENT, classId: 'wizard' });
    expect(atk.total).toBe(7);
  });
  it('Cleric 5 (WIS 16): save DC 14, spell attack +6', () => {
    const c = buildPC({ classId: 'cleric', level: 5, abilityScores: { WIS: 16 } });
    const dc = computeSpellSaveDC({ character: c, itemInstances: {}, content: CONTENT, classId: 'cleric' });
    expect(dc.total).toBe(14);
    const atk = computeSpellAttackBonus({ character: c, itemInstances: {}, content: CONTENT, classId: 'cleric' });
    expect(atk.total).toBe(6);
  });
});

describe('rules truth: class-feature scaling', () => {
  // The Rogue's Sneak Attack scales 1/2/3/4/5/6/7/8/9/10 d6 at levels
  // 1/3/5/7/9/11/13/15/17/19. We only test the entries actually shipped
  // by the starter pack (current implementation).
  const expectSneakAttackDice = (level: number, expectedDice: string) => {
    const r = buildPC({ classId: 'rogue', level });
    const effects = collectEffectsFromCharacter({
      character: r,
      content: CONTENT,
      itemInstances: {},
    });
    const sneakAttacks = effects.flatMap((e) =>
      e.kind === 'OnEvent' ? e.actions : [],
    ).flatMap((a) => (a.kind === 'AddDamage' ? [a.dice] : []));
    expect(sneakAttacks).toContain(expectedDice);
  };
  it('Rogue 1: 1d6 Sneak Attack', () => expectSneakAttackDice(1, '1d6'));
  it('Rogue 3: 2d6 Sneak Attack', () => expectSneakAttackDice(3, '2d6'));
  it('Rogue 5: 3d6 Sneak Attack', () => expectSneakAttackDice(5, '3d6'));
  it('Rogue 11: 6d6 Sneak Attack', () => expectSneakAttackDice(11, '6d6'));
  it('Rogue 19: 10d6 Sneak Attack', () => expectSneakAttackDice(19, '10d6'));
});

describe('rules truth: blessed condition modifiers', () => {
  // Bless adds a per-roll 1d4 to attacks and to every save (RAW). Slices
  // 330/331 replaced the old flat +2 approximation with the AddBonusDie
  // primitive: the save derivation no longer carries a static bonus; it
  // surfaces a 1d4 bonus die that each save-rolling planner rolls fresh.
  it('blessed character surfaces a 1d4 bonus die on every save (no static bonus)', () => {
    const blessed = CharacterSchema.parse({
      ...buildPC({ classId: 'fighter', level: 1 }),
      appliedConditions: [{ id: '01J0AAAAAAAAAAAAAAAAAAAAAB', conditionId: 'blessed', sourceEventId: '01J0AAAAAAAAAAAAAAAAAAAAAA' }],
    });
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      const save = computeSavingThrow({
        character: blessed,
        itemInstances: {},
        content: CONTENT,
        ability,
      });
      const baseMod = abilityModifier(blessed.abilityScores[ability]);
      const profBonus = ability === 'STR' || ability === 'CON' ? proficiencyBonus(1) : 0;
      // No static +2 anymore — the Bless bonus is a per-roll die.
      expect(save.total, `${ability} save base with Bless`).toBe(baseMod + profBonus);
      expect(save.bonusDice, `${ability} save bonus die`).toHaveLength(1);
      expect(save.bonusDice[0]!.dice).toBe('1d4');
      expect(save.bonusDice[0]!.subtract).toBe(false);
    }
  });
});
