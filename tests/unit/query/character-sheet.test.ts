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
