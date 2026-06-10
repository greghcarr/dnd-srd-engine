// SRD spell save DC / attack conformance (slice 423): a GROUND-TRUTH check.
//
// Spell save DC and spell attack are stated as formulas, not a table, so
// this upgrade parses two things from the SRD and recomputes:
//   1. The DC base constant — from spells.md "**Spell save DC** = 8 + ...".
//   2. Each caster class's spellcasting ability — from classes.md
//      "_Spellcasting Ability._ <Ability> is your spellcasting ability for
//      your <Class> spells."
// Then, giving a caster DISTINCT INT/WIS/CHA modifiers, it asserts
// computeSpellSaveDC / computeSpellAttackBonus equal the SRD formula using
// the SRD-parsed ability. The distinct mods are the teeth: if the engine
// picked the wrong spellcasting ability for a class, the DC would not match
// the value computed from the ability the SRD names. The +PB structure is
// transcribed but quoted from spells.md:
//   "Spell save DC = 8 + your spellcasting ability modifier + your Proficiency Bonus"
//   "Spell attack modifier = your spellcasting ability modifier + your Proficiency Bonus"
//
// Skips (does not fail) when the SRD clone is absent, mirroring srd-drift.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSpellSaveDC, computeSpellAttackBonus } from '../../src/derive/spell-dc.js';
import { resolveContent } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { abilityModifier, proficiencyBonus } from '../../src/derive/ability.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import type { AbilityScore } from '../../src/schemas/primitives.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRD_DIR = resolve(HERE, '../../references/srd-markdown');
const SPELLS_MD = resolve(SRD_DIR, 'spells.md');
const CLASSES_MD = resolve(SRD_DIR, 'classes.md');
const SRD_AVAILABLE = existsSync(SPELLS_MD) && existsSync(CLASSES_MD);

const ABILITY_CODE: Record<string, AbilityScore> = {
  Intelligence: 'INT',
  Wisdom: 'WIS',
  Charisma: 'CHA',
};

// Distinct INT/WIS/CHA modifiers (+3 / +2 / +1) and zero elsewhere, so the
// DC uniquely identifies which ability the engine used.
const LEVEL = 5;
const SCORES = { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 14, CHA: 12 } as const;

const buildCaster = (classId: string) =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: classId,
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId, level: LEVEL, hitDiceRemaining: LEVEL }],
    abilityScores: { ...SCORES },
    hp: { current: 20, max: 20, temp: 0 },
  });

// Parse "**Spell save DC** = 8 + ..." -> the base constant.
const parseDcBase = (md: string): number => {
  const m = /\*\*Spell save DC\*\*\s*=\s*(\d+)\s*\+/.exec(md);
  if (m === null) throw new Error('Could not parse the SRD spell save DC base from spells.md');
  return Number(m[1]);
};

// Parse each caster class's spellcasting ability (italic or bold heading,
// "your" or "the"); excludes the subclass cantrip lines ("for them").
const parseClassAbilities = (md: string): ReadonlyArray<{ classId: string; ability: AbilityScore }> => {
  const re = /(?:\*\*|_)Spellcasting Ability\.(?:\*\*|_)\s*(Intelligence|Wisdom|Charisma) is (?:your|the) spellcasting ability for your (\w+) spells/g;
  const out: { classId: string; ability: AbilityScore }[] = [];
  for (const m of md.matchAll(re)) {
    out.push({ classId: m[2]!.toLowerCase(), ability: ABILITY_CODE[m[1]!]! });
  }
  return out;
};

describe.runIf(SRD_AVAILABLE)('SRD spell save DC / attack conformance (ground-truth, parsed from SRD)', () => {
  const content = resolveContent([loadStarterPack()]);
  // CRLF → LF so the parse is robust on a Windows (core.autocrlf) checkout
  // of the submodule markdown (slice 779).
  const dcBase = SRD_AVAILABLE ? parseDcBase(readFileSync(SPELLS_MD, 'utf8').replace(/\r\n/g, '\n')) : 0;
  const classAbilities = SRD_AVAILABLE ? parseClassAbilities(readFileSync(CLASSES_MD, 'utf8').replace(/\r\n/g, '\n')) : [];
  const pb = proficiencyBonus(LEVEL);

  it('parses the SRD DC base and all caster abilities (sanity, not vacuous)', () => {
    expect(dcBase).toBe(8);
    // Bard, Cleric, Druid, Paladin, Ranger, Sorcerer, Warlock, Wizard.
    expect(classAbilities.length).toBeGreaterThanOrEqual(8);
  });

  for (const { classId, ability } of classAbilities) {
    it(`${classId}: spell save DC + attack use the SRD spellcasting ability (${ability})`, () => {
      const cls = content.classes.get(classId);
      expect(cls?.spellcasting, `pack class "${classId}" is not a spellcaster`).toBeDefined();

      const character = buildCaster(classId);
      const input = { character, itemInstances: {}, content, classId };
      const abilityMod = abilityModifier(SCORES[ability]);

      expect(computeSpellSaveDC(input).total, `${classId} save DC`).toBe(dcBase + abilityMod + pb);
      expect(computeSpellAttackBonus(input).total, `${classId} attack`).toBe(abilityMod + pb);
    });
  }
});
