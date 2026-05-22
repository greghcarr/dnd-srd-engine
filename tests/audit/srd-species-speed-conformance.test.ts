// SRD species speed conformance (slice 426): a GROUND-TRUTH data check.
//
// srd-drift verifies MONSTER walk speeds against the SRD but not SPECIES,
// so species base speed was an unverified surface (and it varies: Goliath
// is 35, the rest 30). This parses each species' Speed from
// character-origins.md ("**Speed:** 35 feet") and asserts the pack's
// species walk speed matches, then confirms the walk-speed derivation
// returns that base for a character built without an explicit speed
// override (the createPC case).
//
// Slice 426 originally surfaced that a Goliath built via createPC reported
// 30, not 35 (the species walk speed never reached the derivation). The
// slice-427 fix made `character.speedFeet` an optional override that falls
// back to the species' / statblock's walk speed; this test now asserts the
// fixed behavior directly (createPC Goliath returns 35).
//
// Skips (does not fail) when the SRD clone is absent, mirroring srd-drift.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEffectiveSpeed } from '../../src/derive/speed.js';
import { resolveContent } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { createPC } from '../../src/engine/conveniences.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGINS_MD = resolve(HERE, '../../references/srd-markdown/character-origins.md');
const SRD_AVAILABLE = existsSync(ORIGINS_MD);

// Parse "#### Name ... **Speed:** N feet" for each species in the pack.
const parseSpeciesSpeeds = (
  md: string,
  isSpecies: (id: string) => boolean,
): ReadonlyArray<{ speciesId: string; walk: number }> => {
  const out: { speciesId: string; walk: number }[] = [];
  for (const section of md.split(/^#### /m)) {
    const name = /^([A-Za-z][\w' -]*)\n/.exec(section)?.[1]?.trim();
    if (name === undefined) continue;
    const speciesId = name.toLowerCase();
    if (!isSpecies(speciesId)) continue;
    const speed = /\*\*Speed:\*\*\s*(\d+)\s*feet/.exec(section);
    if (speed === null) continue;
    out.push({ speciesId, walk: Number(speed[1]) });
  }
  return out;
};

// No explicit speedFeet, so the walk speed must derive from the species
// (the slice-427 fix) rather than a stored override.
const buildSpeciesCharacter = (speciesId: string) =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: speciesId,
    speciesId,
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
  });

describe.runIf(SRD_AVAILABLE)('SRD species speed conformance (ground-truth, parsed from character-origins.md)', () => {
  const content = resolveContent([loadStarterPack()]);
  const md = SRD_AVAILABLE ? readFileSync(ORIGINS_MD, 'utf8') : '';
  const speeds = parseSpeciesSpeeds(md, (id) => content.species.has(id));

  it('parses a speed for every pack species (sanity, not vacuous)', () => {
    expect(speeds.length).toBe(content.species.size);
    expect(speeds.length).toBeGreaterThanOrEqual(9);
    // The pack must include the one non-30 species (Goliath 35), so a parse
    // that silently defaulted everything to 30 can't pass.
    expect(speeds.some((s) => s.walk !== 30)).toBe(true);
  });

  for (const { speciesId, walk } of speeds) {
    it(`${speciesId}: pack walk speed + base derivation match the SRD (${walk} ft)`, () => {
      const species = content.species.get(speciesId)!;
      // Data fidelity: pack species walk speed equals the SRD.
      expect(species.speed.walk, `${speciesId} pack speed`).toBe(walk);
      // Derivation: a character with no explicit speed override derives its
      // walk speed from the species (slice-427 fix).
      const character = buildSpeciesCharacter(speciesId);
      expect(
        getEffectiveSpeed({ character, content, itemInstances: {} }),
        `${speciesId} effective walk`,
      ).toBe(walk);
    });
  }

  it('createPC applies the species walk speed (the slice-426 gap, now fixed)', () => {
    // The headline regression: a Goliath (SRD 35) built via the content-free
    // createPC convenience used to report 30. It now derives from the species.
    const goliath = content.species.get('goliath');
    if (goliath === undefined) return; // pack without Goliath: nothing to assert
    const pc = createPC({ name: 'G', speciesId: 'goliath', backgroundId: 'soldier', classId: 'fighter', hpMax: 10 });
    expect(getEffectiveSpeed({ character: pc, content, itemInstances: {} })).toBe(goliath.speed.walk);
  });
});
