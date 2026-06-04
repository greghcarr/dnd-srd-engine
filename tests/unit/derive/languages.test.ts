import { describe, expect, it } from 'vitest';
import { computeKnownLanguages } from '../../../src/derive/languages.js';
import { computeDerivedCharacter } from '../../../src/derive/character-view.js';
import { createPC } from '../../../src/engine/conveniences.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';

// Tests the wired Druidic feature plus the broader languages-derivation
// surface (species + background + effect-stack `GrantProficiency
// target: 'language'`). Bug this prevents: a Druid PC with no surfaced
// way to indicate they know Druidic.

const CONTENT = resolveContent([loadStarterPack()]);

describe('computeKnownLanguages', () => {
  it('Human PC speaks Common from their species', () => {
    const pc = createPC({
      name: 'Cass',
      speciesId: 'human',
      backgroundId: 'soldier',
      classId: 'fighter',
      hpMax: 12,
    });
    expect(computeKnownLanguages({ character: pc, itemInstances: {}, content: CONTENT })).toEqual([
      'common',
    ]);
  });

  it('Elf PC speaks Common + Elvish from their species', () => {
    const pc = createPC({
      name: 'Lirien',
      speciesId: 'elf',
      backgroundId: 'sage',
      classId: 'wizard',
      hpMax: 8,
    });
    expect(computeKnownLanguages({ character: pc, itemInstances: {}, content: CONTENT })).toEqual([
      'common',
      'elvish',
    ]);
  });

  it('Druid L1 knows Druidic via the wired Druidic feature', () => {
    const druid = createPC({
      name: 'Saoirse',
      speciesId: 'human',
      backgroundId: 'folk-hero',
      classId: 'druid',
      hpMax: 10,
    });
    expect(computeKnownLanguages({ character: druid, itemInstances: {}, content: CONTENT })).toEqual([
      'common',
      'druidic',
    ]);
  });

  it('Halfling Druid stacks species + class languages, sorted and deduplicated', () => {
    const druid = createPC({
      name: 'Pip',
      speciesId: 'halfling',
      backgroundId: 'outlander',
      classId: 'druid',
      hpMax: 9,
    });
    expect(computeKnownLanguages({ character: druid, itemInstances: {}, content: CONTENT })).toEqual([
      'common',
      'druidic',
      'halfling',
    ]);
  });

  it("Rogue L1 knows Thieves' Cant via the wired Thieves' Cant feature", () => {
    const rogue = createPC({
      name: 'Vex',
      speciesId: 'human',
      backgroundId: 'criminal',
      classId: 'rogue',
      hpMax: 10,
    });
    expect(computeKnownLanguages({ character: rogue, itemInstances: {}, content: CONTENT })).toEqual([
      'common',
      'thieves-cant',
    ]);
  });

  it('non-Druid fighters do not learn Druidic', () => {
    const fighter = createPC({
      name: 'Alyx',
      speciesId: 'human',
      backgroundId: 'soldier',
      classId: 'fighter',
      hpMax: 12,
    });
    const langs = computeKnownLanguages({ character: fighter, itemInstances: {}, content: CONTENT });
    expect(langs).not.toContain('druidic');
  });

  it('DerivedCharacter surfaces knownLanguages', () => {
    const druid = createPC({
      name: 'Saoirse',
      speciesId: 'elf',
      backgroundId: 'sage',
      classId: 'druid',
      hpMax: 10,
    });
    const view = computeDerivedCharacter({ character: druid, itemInstances: {}, content: CONTENT });
    expect(view.knownLanguages).toEqual(['common', 'druidic', 'elvish']);
  });
});
