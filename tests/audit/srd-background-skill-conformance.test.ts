// SRD background skill-proficiency conformance (slice 425): GROUND-TRUTH.
//
// Re-verifies the slice-412 fix (background skills must reach ability
// checks) against the SRD itself. Parses each background's granted skills
// from character-origins.md ("**Skill Proficiencies:** Insight and
// Religion") and asserts a character of that background is proficient in
// exactly those skills. Built on a Fighter (whose own skills are an
// unresolved choice) with a Human (no fixed skill grants) and uniform
// ability modifiers, so the proficiency bonus is the only mover and the
// proficient set is exactly the background's. A background whose pack skill
// list drifted from the SRD, or a derivation that dropped them, fails.
//
// Skips (does not fail) when the SRD clone is absent, mirroring srd-drift.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAbilityCheck } from '../../src/derive/ability-check.js';
import { resolveContent } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { abilityModifier, proficiencyBonus } from '../../src/derive/ability.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { SKILLS, SKILL_ABILITY, ABILITY_SCORES, type Skill } from '../../src/schemas/primitives.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGINS_MD = resolve(HERE, '../../references/srd-markdown/character-origins.md');
const SRD_AVAILABLE = existsSync(ORIGINS_MD);

const LEVEL = 5;
const UNIFORM_SCORE = 14; // every ability +2, so only proficiency moves a skill check

// Fighter: own skills are an unresolved choice, so they grant nothing here.
// Human: no fixed skill grants. -> proficient skills come only from the background.
const buildCharacter = (backgroundId: string) =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: backgroundId,
    speciesId: 'human',
    backgroundId,
    classes: [{ classId: 'fighter', level: LEVEL, hitDiceRemaining: LEVEL }],
    abilityScores: Object.fromEntries(ABILITY_SCORES.map((a) => [a, UNIFORM_SCORE])),
    hp: { current: 40, max: 40, temp: 0 },
  });

const toSkillId = (word: string): string => word.trim().toLowerCase().replace(/\s+/g, '-');

// Parse "#### Name ... **Skill Proficiencies:** X and Y" per background.
const parseBackgroundSkills = (
  md: string,
  isBackground: (id: string) => boolean,
): ReadonlyArray<{ backgroundId: string; skills: ReadonlyArray<Skill> }> => {
  const out: { backgroundId: string; skills: Skill[] }[] = [];
  for (const section of md.split(/^#### /m)) {
    const name = /^([A-Za-z][\w' ]*)\n/.exec(section)?.[1]?.trim();
    if (name === undefined) continue;
    const backgroundId = name.toLowerCase();
    if (!isBackground(backgroundId)) continue;
    const line = /\*\*Skill Proficiencies:\*\*\s*([^\n]+)/.exec(section);
    if (line === null) continue;
    const skills = line[1]!.split(/\s+and\s+/).map(toSkillId).filter((s): s is Skill => (SKILLS as readonly string[]).includes(s));
    out.push({ backgroundId, skills });
  }
  return out;
};

describe.runIf(SRD_AVAILABLE)('SRD background skill conformance (ground-truth, parsed from character-origins.md)', () => {
  const content = resolveContent([loadStarterPack()]);
  const md = SRD_AVAILABLE ? readFileSync(ORIGINS_MD, 'utf8') : '';
  const backgrounds = parseBackgroundSkills(md, (id) => content.backgrounds.has(id));
  const pb = proficiencyBonus(LEVEL);
  const mod = abilityModifier(UNIFORM_SCORE);

  it('parses skills for the SRD backgrounds in the pack (sanity, not vacuous)', () => {
    // The starter pack ships the 4 SRD backgrounds; the 15 PHB extras live
    // in a separate pack and aren't asserted here.
    expect(backgrounds.length).toBe(content.backgrounds.size);
    expect(backgrounds.length).toBeGreaterThanOrEqual(4);
    expect(backgrounds.every((b) => b.skills.length === 2)).toBe(true);
  });

  for (const { backgroundId, skills } of backgrounds) {
    it(`${backgroundId}: proficient in exactly the SRD skills (${skills.join(', ')})`, () => {
      const character = buildCharacter(backgroundId);
      const proficient = new Set<Skill>(skills);
      for (const skill of SKILLS) {
        const total = computeAbilityCheck({
          character,
          itemInstances: {},
          content,
          ability: SKILL_ABILITY[skill],
          skill,
        }).total;
        const expected = proficient.has(skill) ? mod + pb : mod;
        expect(total, `${backgroundId} ${skill}`).toBe(expected);
      }
    });
  }
});
