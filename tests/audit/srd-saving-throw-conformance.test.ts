// SRD saving-throw proficiency conformance (slice 424): GROUND-TRUTH.
//
// Each class grants two fixed saving-throw proficiencies. This test parses
// them from each class's Core Traits table in classes.md
// ("<td>Saving Throw Proficiencies</td><td>Dexterity and Charisma</td>")
// and asserts the engine makes a character of that class proficient in
// exactly those two saves and no others. All six abilities are given the
// SAME modifier, so the only thing that can move a save total is the
// proficiency bonus — meaning the test pins WHICH saves the engine treats
// as proficient against the pair the SRD names. A class wired with the
// wrong save proficiencies (e.g. Fighter as STR+DEX) cannot pass.
//
// Skips (does not fail) when the SRD clone is absent, mirroring srd-drift.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSavingThrow } from '../../src/derive/save.js';
import { resolveContent } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { abilityModifier, proficiencyBonus } from '../../src/derive/ability.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { ABILITY_SCORES, type AbilityScore } from '../../src/schemas/primitives.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLASSES_MD = resolve(HERE, '../../references/srd-markdown/classes.md');
const SRD_AVAILABLE = existsSync(CLASSES_MD);

const ABILITY_WORD: Record<string, AbilityScore> = {
  Strength: 'STR',
  Dexterity: 'DEX',
  Constitution: 'CON',
  Intelligence: 'INT',
  Wisdom: 'WIS',
  Charisma: 'CHA',
};

const LEVEL = 5;
const UNIFORM_SCORE = 14; // every ability +2, so only proficiency moves a save

const buildClassCharacter = (classId: string) =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: classId,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId, level: LEVEL, hitDiceRemaining: LEVEL }],
    abilityScores: Object.fromEntries(ABILITY_SCORES.map((a) => [a, UNIFORM_SCORE])),
    hp: { current: 40, max: 40, temp: 0 },
  });

// Parse each class's Core Traits "Saving Throw Proficiencies" cell.
const parseClassSaves = (
  md: string,
  isClass: (id: string) => boolean,
): ReadonlyArray<{ classId: string; saves: ReadonlyArray<AbilityScore> }> => {
  const headings = [...md.matchAll(/^## (\w+)\s*$/gm)];
  const out: { classId: string; saves: AbilityScore[] }[] = [];
  for (let i = 0; i < headings.length; i++) {
    const classId = headings[i]![1]!.toLowerCase();
    if (!isClass(classId)) continue;
    const sectionEnd = i + 1 < headings.length ? headings[i + 1]!.index! : md.length;
    const section = md.slice(headings[i]!.index!, sectionEnd);
    const cell = /<td>Saving Throw Proficiencies<\/td>\s*<td>([^<]+)<\/td>/.exec(section);
    if (cell === null) continue;
    const saves = cell[1]!.split(/\s+and\s+/).map((w) => ABILITY_WORD[w.trim()]!).filter(Boolean);
    out.push({ classId, saves });
  }
  return out;
};

describe.runIf(SRD_AVAILABLE)('SRD saving-throw conformance (ground-truth, parsed from classes.md)', () => {
  const content = resolveContent([loadStarterPack()]);
  // CRLF → LF so the parse is robust on a Windows (core.autocrlf) checkout
  // of the submodule markdown (slice 779).
  const md = SRD_AVAILABLE ? readFileSync(CLASSES_MD, 'utf8').replace(/\r\n/g, '\n') : '';
  const classSaves = parseClassSaves(md, (id) => content.classes.has(id));
  const pb = proficiencyBonus(LEVEL);
  const mod = abilityModifier(UNIFORM_SCORE);

  it('parses save proficiencies for all 12 classes (sanity, not vacuous)', () => {
    expect(classSaves.length).toBe(12);
    expect(classSaves.every((c) => c.saves.length === 2)).toBe(true);
  });

  for (const { classId, saves } of classSaves) {
    it(`${classId}: proficient in exactly the SRD saves (${saves.join(', ')})`, () => {
      const character = buildClassCharacter(classId);
      const proficient = new Set(saves);
      for (const ability of ABILITY_SCORES) {
        const total = computeSavingThrow({ character, itemInstances: {}, content, ability }).total;
        const expected = proficient.has(ability) ? mod + pb : mod;
        expect(total, `${classId} ${ability} save`).toBe(expected);
      }
    });
  }
});
