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
import { buildFighter, TEST_CONTENT } from '../../fixtures/index.js';

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
