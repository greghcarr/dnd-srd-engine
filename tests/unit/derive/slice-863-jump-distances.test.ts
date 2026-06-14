// Slice 863 — `no-jump-distance`.
//
// RAW (SRD 5.2.1):
//   - Long Jump: "you leap horizontally a number of feet up to your Strength
//     score if you move at least 10 feet immediately before the jump. When you
//     make a standing Long Jump, you can leap only half that distance."
//   - High Jump: "you leap into the air a number of feet equal to 3 plus your
//     Strength modifier (minimum of 0 feet) ... standing High Jump ... half."
//
// `computeJumpDistances` (a pure derive in speed.ts) reports the four
// distances off the EFFECTIVE Strength (effect-stack floor/increase + drain),
// so Gauntlets of Ogre Power lengthen the jump. The engine doesn't gate
// movement on jump — the consumer spends a foot of Speed per foot jumped.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { computeJumpDistances } from '../../../src/derive/speed.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const build = (str: number, extra: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Jumper',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: str, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    ...extra,
  });

const jump = (character: Character, itemInstances: Record<string, ItemInstance> = {}) =>
  computeJumpDistances({ character, content: CONTENT, itemInstances, pendingChoices: {} });

describe('slice 863: jump distances (Long/High, running + standing)', () => {
  it('Long Jump = Strength score (standing = half); High Jump = 3 + STR mod (standing = half)', () => {
    expect(jump(build(16))).toEqual({
      longJumpFeet: 16,
      standingLongJumpFeet: 8,
      highJumpFeet: 6, // 3 + (+3)
      standingHighJumpFeet: 3,
    });
    expect(jump(build(8))).toEqual({
      longJumpFeet: 8,
      standingLongJumpFeet: 4,
      highJumpFeet: 2, // 3 + (−1)
      standingHighJumpFeet: 1,
    });
  });

  it('High Jump is clamped to a minimum of 0 for a low Strength', () => {
    // STR 3 → mod −4 → 3 + (−4) = −1 → clamped to 0.
    const j = jump(build(3));
    expect(j.highJumpFeet).toBe(0);
    expect(j.standingHighJumpFeet).toBe(0);
    expect(j.longJumpFeet).toBe(3);
  });

  it('reads EFFECTIVE Strength — Gauntlets of Ogre Power (STR 19) lengthen the jump', () => {
    const gauntlets = ItemInstanceSchema.parse({
      id: newItemInstanceId(),
      definitionId: 'gauntlets-of-ogre-power',
    });
    const wearer = build(8, {
      inventory: [gauntlets.id],
      equipped: { attuned: [gauntlets.id] as never },
    });
    expect(jump(wearer, { [gauntlets.id]: gauntlets })).toEqual({
      longJumpFeet: 19, // STR set to 19, not the base 8
      standingLongJumpFeet: 9,
      highJumpFeet: 7, // 3 + (+4)
      standingHighJumpFeet: 3,
    });
  });
});
