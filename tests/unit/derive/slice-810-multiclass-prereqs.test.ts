// Slice 810: `validateMulticlass` — the 13+ ability prerequisite for
// multiclassing (Area 5 divergence `multiclass-prereqs`). RAW: "you must
// have a score of at least 13 in the primary ability of the new class and
// your current classes." Multiclass entry is snapshot-only (no engine
// gate), so this ships as a consumer validator (mirror of slice 793's
// validateBackgroundAbilityIncrease). The prereq abilities come from the
// class `primaryAbility`; `multiclassAbilityMode` resolves the or/and
// (Fighter "Strength OR Dexterity" = any; Monk/Paladin/Ranger "X AND Y" =
// all; default all).

import { describe, expect, it } from 'vitest';
import { validateMulticlass } from '../../../src/derive/multiclass-prereq.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { AbilityScores } from '../../../src/schemas/primitives.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const build = (classIds: string[], scores: Partial<AbilityScores>): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'PC', speciesId: 'human', backgroundId: 'soldier',
    classes: classIds.map((classId) => ({ classId, level: 1, hitDiceRemaining: 1 })),
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, ...scores },
    hp: { current: 10, max: 10, temp: 0 },
  });

describe('Multiclass ability prerequisites (slice 810)', () => {
  it('a single-classed character is not multiclassing → no issues', () => {
    expect(validateMulticlass(build(['fighter'], { STR: 8, DEX: 8 }), CONTENT)).toEqual([]);
  });

  it('a valid Fighter/Wizard (STR 15, INT 14) passes', () => {
    expect(validateMulticlass(build(['fighter', 'wizard'], { STR: 15, INT: 14 }), CONTENT)).toEqual([]);
  });

  it('an under-stat Fighter/Wizard reports the unmet class', () => {
    const issues = validateMulticlass(build(['fighter', 'wizard'], { STR: 8, DEX: 8, INT: 14 }), CONTENT);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Fighter requires .* to multiclass/i);
  });

  it('Fighter\'s prereq is "or": DEX 14 (STR 8) satisfies it', () => {
    expect(validateMulticlass(build(['fighter', 'wizard'], { STR: 8, DEX: 14, INT: 14 }), CONTENT)).toEqual([]);
  });

  it('Paladin\'s prereq is "and": STR 14 / CHA 8 fails, STR 14 / CHA 14 passes', () => {
    // Paladin + Fighter; Fighter is met via STR/DEX 14, so any issue is Paladin's.
    const fails = validateMulticlass(build(['paladin', 'fighter'], { STR: 14, CHA: 8, DEX: 14 }), CONTENT);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatch(/Paladin requires .* and .* to multiclass/i);
    expect(validateMulticlass(build(['paladin', 'fighter'], { STR: 14, CHA: 14, DEX: 14 }), CONTENT)).toEqual([]);
  });
});
