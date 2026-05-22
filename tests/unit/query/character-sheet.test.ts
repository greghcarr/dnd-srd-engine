// Slice 412: character-sheet view model (read layer, part 2).
//
// buildCharacterSheet wraps computeDerivedCharacter and adds the
// computed-stats a sheet needs: all 18 skills (modifier + proficiency +
// advantage), the three passive scores, and initiative. Assertions pin
// fixture-independent invariants (a skill's modifier equals its ability
// mod plus the proficiency contribution; passive = 10 + check; initiative
// = DEX mod with no initiative effects) so they hold whatever skill
// proficiencies the fixture's class/background grant.
import { describe, expect, it } from 'vitest';
import { buildCharacterSheet } from '../../../src/query/character-sheet.js';
import { computeDerivedCharacter } from '../../../src/derive/character-view.js';
import { SKILLS, SKILL_ABILITY, type ProficiencyLevel } from '../../../src/schemas/primitives.js';
import { buildFighter, makeItemInstance, TEST_CONTENT } from '../../fixtures/index.js';
import { resolveContent } from '../../../src/content/pack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';

const sheetFor = (level: number) =>
  buildCharacterSheet({
    character: buildFighter({ level, STR: 18, DEX: 14, CON: 16 }),
    itemInstances: {},
    content: TEST_CONTENT,
  });

// floor(PB * multiplier) per RAW proficiency tiers.
const PROFICIENCY_MULTIPLIER: Record<ProficiencyLevel, number> = {
  none: 0,
  half: 0.5,
  proficient: 1,
  expertise: 2,
};

describe('slice 412: buildCharacterSheet', () => {
  it('includes everything computeDerivedCharacter returns', () => {
    const input = {
      character: buildFighter({ level: 5, STR: 18, DEX: 14, CON: 16 }),
      itemInstances: {},
      content: TEST_CONTENT,
    };
    const sheet = buildCharacterSheet(input);
    const derived = computeDerivedCharacter(input);
    expect(sheet.totalLevel).toBe(derived.totalLevel);
    expect(sheet.proficiencyBonus).toBe(derived.proficiencyBonus);
    expect(sheet.ac.total).toBe(derived.ac.total);
    expect(sheet.savingThrows.STR.total).toBe(derived.savingThrows.STR.total);
  });

  it('lists all 18 skills in canonical order, each mapped to its ability', () => {
    const sheet = sheetFor(5);
    expect(sheet.skills.map((s) => s.skill)).toEqual([...SKILLS]);
    expect(sheet.skills.every((s) => s.ability === SKILL_ABILITY[s.skill])).toBe(true);
  });

  it("each skill's modifier is the ability mod plus its proficiency contribution", () => {
    const sheet = sheetFor(5);
    const pb = sheet.proficiencyBonus;
    for (const s of sheet.skills) {
      const abilityMod = sheet.abilityModifiers[s.ability];
      const profContribution = Math.floor(pb * PROFICIENCY_MULTIPLIER[s.proficiency]);
      expect(s.modifier).toBe(abilityMod + profContribution);
    }
  });

  it('passive scores are 10 + the matching skill check modifier', () => {
    const sheet = sheetFor(5);
    const modOf = (skill: string) => sheet.skills.find((s) => s.skill === skill)!.modifier;
    expect(sheet.passiveScores.perception).toBe(10 + modOf('perception'));
    expect(sheet.passiveScores.investigation).toBe(10 + modOf('investigation'));
    expect(sheet.passiveScores.insight).toBe(10 + modOf('insight'));
  });

  it('initiative is the DEX modifier when no initiative effects apply', () => {
    const sheet = sheetFor(5);
    expect(sheet.initiative.modifier).toBe(sheet.abilityModifiers.DEX);
    expect(sheet.initiative.hasAdvantage).toBe(false);
    expect(sheet.initiative.hasDisadvantage).toBe(false);
  });

  it('higher level raises the proficiency bonus baked into proficient skills', () => {
    const low = sheetFor(1);
    const high = sheetFor(5);
    const proficientSkill = low.skills.find((s) => s.proficiency === 'proficient');
    expect(proficientSkill).toBeDefined();
    const skill = proficientSkill!.skill;
    const lowMod = low.skills.find((s) => s.skill === skill)!.modifier;
    const highMod = high.skills.find((s) => s.skill === skill)!.modifier;
    expect(high.proficiencyBonus).toBeGreaterThan(low.proficiencyBonus);
    expect(highMod - lowMod).toBe(high.proficiencyBonus - low.proficiencyBonus);
  });
});

describe('slice 414: buildCharacterSheet attacks', () => {
  // L5 fighter (PB +3, martial-proficient), STR 18 (+4), DEX 14 (+2).
  const armedSheet = () => {
    const longsword = makeItemInstance('longsword');
    const rapier = makeItemInstance('rapier');
    const longbow = makeItemInstance('longbow');
    const character = buildFighter({
      level: 5,
      STR: 18,
      DEX: 14,
      inventory: [longsword.id, rapier.id, longbow.id],
    });
    const sheet = buildCharacterSheet({
      character,
      itemInstances: { [longsword.id]: longsword, [rapier.id]: rapier, [longbow.id]: longbow },
      content: TEST_CONTENT,
    });
    return { sheet, ids: { longsword: longsword.id, rapier: rapier.id, longbow: longbow.id } };
  };

  it('lists one attack per inventory weapon, in inventory order', () => {
    const { sheet } = armedSheet();
    expect(sheet.attacks.map((a) => a.name)).toEqual(['Longsword', 'Rapier', 'Longbow']);
  });

  it('a melee weapon uses STR for to-hit and damage', () => {
    const { sheet } = armedSheet();
    const longsword = sheet.attacks[0]!;
    expect(longsword.attackKind).toBe('melee');
    expect(longsword.attackBonus).toBe(4 + 3); // STR +4, proficiency +3
    expect(longsword.damage).toEqual({ dice: '1d8', modifier: 4, type: 'slashing' });
  });

  it('a versatile weapon carries the two-handed damage line', () => {
    const { sheet } = armedSheet();
    expect(sheet.attacks[0]!.versatileDamage).toEqual({ dice: '1d10', modifier: 4, type: 'slashing' });
  });

  it('a finesse weapon picks the higher of STR / DEX (STR here)', () => {
    const { sheet } = armedSheet();
    const rapier = sheet.attacks[1]!;
    expect(rapier.attackBonus).toBe(4 + 3); // STR +4 beats DEX +2
    expect(rapier.damage.modifier).toBe(4);
    expect(rapier.versatileDamage).toBeUndefined();
  });

  it('finesse flips to DEX when DEX is higher', () => {
    const rapier = makeItemInstance('rapier');
    const character = buildFighter({ level: 5, STR: 10, DEX: 18, inventory: [rapier.id] });
    const sheet = buildCharacterSheet({
      character,
      itemInstances: { [rapier.id]: rapier },
      content: TEST_CONTENT,
    });
    expect(sheet.attacks[0]!.attackBonus).toBe(4 + 3); // DEX +4
    expect(sheet.attacks[0]!.damage.modifier).toBe(4);
  });

  it('a ranged weapon uses DEX', () => {
    const { sheet } = armedSheet();
    const longbow = sheet.attacks[2]!;
    expect(longbow.attackKind).toBe('ranged');
    expect(longbow.attackBonus).toBe(2 + 3); // DEX +2, proficiency +3
    expect(longbow.damage.modifier).toBe(2);
  });

  it('skips dangling instance ids (id valid but absent from itemInstances)', () => {
    const dangling = makeItemInstance('longsword');
    const character = buildFighter({ level: 5, inventory: [dangling.id] });
    const sheet = buildCharacterSheet({ character, itemInstances: {}, content: TEST_CONTENT });
    expect(sheet.attacks).toEqual([]);
  });
});

describe('slice 415: buildCharacterSheet spellcasting', () => {
  const SRD = resolveContent([loadStarterPack()]);

  const buildWizard = (knownSpells: string[], preparedSpells: string[]) =>
    CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Wiz',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 16, WIS: 10, CHA: 10 },
      hp: { current: 22, max: 22, temp: 0 },
      knownSpells,
      preparedSpells,
    });

  const wizardSheet = (known: string[], prepared: string[]) =>
    buildCharacterSheet({ character: buildWizard(known, prepared), itemInstances: {}, content: SRD });

  it('a non-caster has no spellcasting block', () => {
    const sheet = buildCharacterSheet({
      character: buildFighter({ level: 5 }),
      itemInstances: {},
      content: TEST_CONTENT,
    });
    expect(sheet.spellcasting).toBeUndefined();
  });

  it('a caster carries per-class save DC and attack bonus', () => {
    const sheet = wizardSheet(['fire-bolt'], []);
    expect(sheet.spellcasting).toBeDefined();
    expect(sheet.spellcasting!.classes).toHaveLength(1);
    const wizard = sheet.spellcasting!.classes[0]!;
    expect(wizard.classId).toBe('wizard');
    expect(wizard.ability).toBe('INT');
    expect(wizard.saveDC).toBe(8 + 3 + 3); // base 8 + PB 3 (L5) + INT mod 3
    expect(wizard.attackBonus).toBe(3 + 3); // PB 3 + INT mod 3
  });

  it('groups castable spells by level (ascending), name-sorted, with prepared flags', () => {
    const sheet = wizardSheet(['fire-bolt', 'magic-missile', 'fireball'], ['magic-missile', 'fireball']);
    const groups = sheet.spellcasting!.spellsByLevel;
    expect(groups.map((g) => g.level)).toEqual([0, 1, 3]);
    expect(groups[0]!.spells.map((s) => s.spellId)).toEqual(['fire-bolt']);
    expect(groups[1]!.spells[0]!).toMatchObject({ spellId: 'magic-missile', level: 1, prepared: true, alwaysPrepared: false });
    expect(groups[0]!.spells[0]!.prepared).toBe(false); // fire-bolt known but not prepared
  });

  it('skips spell ids with no matching definition', () => {
    const sheet = wizardSheet(['fireball', 'not-a-real-spell'], []);
    const allIds = sheet.spellcasting!.spellsByLevel.flatMap((g) => g.spells.map((s) => s.spellId));
    expect(allIds).toEqual(['fireball']);
  });
});

describe('slice 416: buildCharacterSheet speeds', () => {
  const SRD = resolveContent([loadStarterPack()]);

  it('a grounded character reports only walk', () => {
    const sheet = buildCharacterSheet({
      character: buildFighter({ level: 5 }),
      itemInstances: {},
      content: TEST_CONTENT,
    });
    expect(sheet.speeds.walk).toBe(30);
    expect(sheet.speeds.fly).toBeUndefined();
    expect(sheet.speeds.swim).toBeUndefined();
    expect(sheet.speeds.climb).toBeUndefined();
    expect(sheet.speeds.burrow).toBeUndefined();
  });

  it('includes a non-walk mode when an effect grants it (flying-active sets fly 60)', () => {
    const character = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Flyer',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 30, max: 30, temp: 0 },
      speedFeet: 30,
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'flying-active' }],
    });
    const sheet = buildCharacterSheet({ character, itemInstances: {}, content: SRD });
    expect(sheet.speeds.walk).toBe(30);
    expect(sheet.speeds.fly).toBe(60);
  });
});

describe('slice 417: buildCharacterSheet inventory', () => {
  it('an empty inventory still reports carrying capacity (STR x 15)', () => {
    const sheet = buildCharacterSheet({
      character: buildFighter({ STR: 16 }),
      itemInstances: {},
      content: TEST_CONTENT,
    });
    expect(sheet.inventory.items).toEqual([]);
    expect(sheet.inventory.encumbrance.maxCarryingCapacity).toBe(16 * 15);
    expect(sheet.inventory.encumbrance.level).toBe('unencumbered');
  });

  it('lists a carried item with quantity and no equipped slot', () => {
    const dagger = makeItemInstance('dagger', { quantity: 3 });
    const character = buildFighter({ inventory: [dagger.id] });
    const sheet = buildCharacterSheet({ character, itemInstances: { [dagger.id]: dagger }, content: TEST_CONTENT });
    expect(sheet.inventory.items).toHaveLength(1);
    expect(sheet.inventory.items[0]!).toMatchObject({
      definitionId: 'dagger',
      itemKind: 'weapon',
      quantity: 3,
      attuned: false,
    });
    expect(sheet.inventory.items[0]!.equippedSlot).toBeUndefined();
  });

  it('flags an equipped item with its slot (even when not in the inventory array)', () => {
    const armor = makeItemInstance('leather-armor');
    const character = buildFighter({ armorInstanceId: armor.id });
    const sheet = buildCharacterSheet({ character, itemInstances: { [armor.id]: armor }, content: TEST_CONTENT });
    const entry = sheet.inventory.items.find((i) => i.instanceId === armor.id)!;
    expect(entry.equippedSlot).toBe('armor');
    expect(entry.itemKind).toBe('armor');
  });

  it('flags an attuned item and surfaces charges + custom name', () => {
    const wand = makeItemInstance('dagger', {
      customName: 'Heirloom Blade',
      chargesRemaining: 2,
      maxCharges: 7,
    });
    const character = buildFighter({ inventory: [wand.id], attunedInstanceIds: [wand.id] });
    const sheet = buildCharacterSheet({ character, itemInstances: { [wand.id]: wand }, content: TEST_CONTENT });
    const entry = sheet.inventory.items[0]!;
    expect(entry.name).toBe('Heirloom Blade');
    expect(entry.attuned).toBe(true);
    expect(entry.charges).toEqual({ remaining: 2, max: 7 });
  });

  it('skips dangling instance ids', () => {
    const ghost = makeItemInstance('dagger');
    const character = buildFighter({ inventory: [ghost.id] });
    const sheet = buildCharacterSheet({ character, itemInstances: {}, content: TEST_CONTENT });
    expect(sheet.inventory.items).toEqual([]);
  });
});

describe('slice 418: buildCharacterSheet unarmed strike', () => {
  const SRD = resolveContent([loadStarterPack()]);

  it('appends an always-available, always-proficient unarmed strike entry', () => {
    // L5 fighter (PB +3), STR 16 (+3): attack +6, damage 1d4 + 3 bludgeoning.
    const sheet = buildCharacterSheet({
      character: buildFighter({ level: 5, STR: 16 }),
      itemInstances: {},
      content: SRD,
    });
    expect(sheet.attacks).toHaveLength(1);
    const unarmed = sheet.attacks[0]!;
    expect(unarmed).toMatchObject({ unarmed: true, name: 'Unarmed Strike', attackKind: 'melee', attackBonus: 6 });
    expect(unarmed.damage).toEqual({ dice: '1d4', modifier: 3, type: 'bludgeoning' });
    expect(unarmed.weaponInstanceId).toBeUndefined();
  });

  it('comes after inventory weapons', () => {
    const longsword = makeItemInstance('longsword');
    const character = buildFighter({ level: 5, STR: 16, inventory: [longsword.id] });
    const sheet = buildCharacterSheet({ character, itemInstances: { [longsword.id]: longsword }, content: SRD });
    expect(sheet.attacks.map((a) => a.name)).toEqual(['Longsword', 'Unarmed Strike']);
    expect(sheet.attacks.at(-1)!.unarmed).toBe(true);
    expect(sheet.attacks[0]!.unarmed).toBeUndefined();
  });

  it('absent when the pack defines no unarmed strike', () => {
    const sheet = buildCharacterSheet({
      character: buildFighter({ level: 5 }),
      itemInstances: {},
      content: TEST_CONTENT,
    });
    expect(sheet.attacks.some((a) => a.unarmed)).toBe(false);
  });
});
