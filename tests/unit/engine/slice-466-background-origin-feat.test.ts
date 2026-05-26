// Slice 466: backgrounds auto-project their Origin Feat into the
// effect stack. Plus Sage RAW deviation fix (ability options
// INT/WIS/CHA -> CON/INT/WIS).
//
// Pre-slice the consumer building a Soldier had to hand-add
// 'savage-attacker' to character.featsTaken to get the feat to take
// effect. RAW (SRD 5.2.1): every background grants its Origin Feat
// to the character. New behavior: `getEffectiveFeatIds` returns
// featsTaken UNION the background's originFeatId; collectFeatEffects
// walks the union; if the consumer ALSO added the origin feat
// explicitly, dedup avoids double-projection.
//
// The four origin feats (savage-attacker, alert, magic-initiate-cleric,
// magic-initiate-wizard) all ship with effects: [], so this slice
// is a no-op for the rendered effect stack today. The plumbing
// lights up automatically when those feats are wired in future slices.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { getEffectiveFeatIds } from '../../../src/derive/effect-stack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { ResolvedContent } from '../../../src/content/pack.js';
import type { ContentPack } from '../../../src/content/pack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildSoldier = (featsTaken: ReadonlyArray<string> = []): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Recruit',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    featsTaken: [...featsTaken],
  });

describe('Background Origin Feat auto-projects (slice 466)', () => {
  it('Soldier with empty featsTaken yields effective list [savage-attacker]', () => {
    const soldier = buildSoldier([]);
    const ids = getEffectiveFeatIds(soldier, CONTENT);
    expect(ids).toEqual(['savage-attacker']);
  });

  it('Soldier with savage-attacker already in featsTaken stays single-instanced', () => {
    const soldier = buildSoldier(['savage-attacker']);
    const ids = getEffectiveFeatIds(soldier, CONTENT);
    expect(ids).toEqual(['savage-attacker']);
  });

  it('Soldier with a different feat carries both: the named feat plus the origin', () => {
    // Tough is a non-origin feat in the SRD pack. Both should appear.
    const soldier = buildSoldier(['tough']);
    const ids = [...getEffectiveFeatIds(soldier, CONTENT)].sort();
    expect(ids).toEqual(['savage-attacker', 'tough'].sort());
  });

  it('all four SRD backgrounds carry their RAW Origin Feat via the helper', () => {
    const cases: ReadonlyArray<{ backgroundId: string; expectedFeat: string }> = [
      { backgroundId: 'soldier', expectedFeat: 'savage-attacker' },
      { backgroundId: 'sage', expectedFeat: 'magic-initiate-wizard' },
      { backgroundId: 'criminal', expectedFeat: 'alert' },
      { backgroundId: 'acolyte', expectedFeat: 'magic-initiate-cleric' },
    ];
    for (const { backgroundId, expectedFeat } of cases) {
      const character = CharacterSchema.parse({
        id: newCharacterId(),
        name: backgroundId,
        speciesId: 'human',
        backgroundId,
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 12, WIS: 12, CHA: 12 },
        hp: { current: 10, max: 10, temp: 0 },
      });
      const ids = getEffectiveFeatIds(character, CONTENT);
      expect(ids).toContain(expectedFeat);
    }
  });

  it('integration: a feat carrying observable effects projects into the stack via the background', () => {
    // The four real origin feats ship effects: [] today, so we cannot
    // observe the projection through them. Build a small inline pack
    // where the background's originFeatId points at a feat with a
    // sentinel GrantProficiency, and verify it lands on the effect
    // stack of a character built against that pack.
    const inlinePack: ContentPack = {
      ...PACK,
      backgrounds: PACK.backgrounds.map((b) =>
        b.id === 'soldier' ? { ...b, originFeatId: 'sentinel-feat' } : b,
      ),
      feats: [
        ...PACK.feats,
        {
          id: 'sentinel-feat',
          name: 'Sentinel Feat',
          category: 'origin',
          repeatable: false,
          prerequisites: [],
          effects: [
            { kind: 'GrantProficiency', target: 'language', id: 'undercommon', level: 'proficient' },
          ],
        },
      ],
    };
    const inlineContent: ResolvedContent = resolveContent([inlinePack]);
    const soldier = buildSoldier([]);
    const stack = buildEffectStack({
      character: soldier,
      content: inlineContent,
      itemInstances: {},
    });
    // The proficiency-track for language doesn't surface via the public
    // accumulator's skill / save APIs; use the proficiencyLevel API
    // directly to confirm the GrantProficiency reached the stack.
    expect(stack.proficiencyLevel('language', 'undercommon')).toBe('proficient');
  });
});

describe('Sage background RAW conformance (slice 466)', () => {
  it('Sage ability score options are CON / INT / WIS (RAW correction)', () => {
    const sage = PACK.backgrounds.find((b) => b.id === 'sage')!;
    expect([...sage.abilityScoreIncreases.options].sort()).toEqual(['CON', 'INT', 'WIS']);
  });
});
