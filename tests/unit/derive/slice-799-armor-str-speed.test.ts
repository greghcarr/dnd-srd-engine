// Slice 799: heavy-armor Strength-requirement speed penalty.
// RAW equipment.md "Strength": armor whose entry lists a Strength score
// "reduces the wearer's speed by 10 feet unless the wearer has a Strength
// score equal to or higher than the listed score." Chain Mail needs 13,
// Splint + Plate need 15. The `strRequirement` field was authored but
// `getEffectiveSpeed` never read it — under-STR plate-wearers kept full
// speed. The check uses EFFECTIVE Strength (base + floor + increases).

import { describe, expect, it } from 'vitest';
import { getEffectiveSpeed } from '../../../src/derive/speed.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

interface Opts {
  exhaustion?: number;
  backgroundStr?: 1 | 2;
}

const walkSpeed = (armorId: string | undefined, str: number, opts: Opts = {}): number => {
  const itemInstances: Record<string, ReturnType<typeof ItemInstanceSchema.parse>> = {};
  let armorInstanceId: string | undefined;
  if (armorId !== undefined) {
    const inst = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: armorId });
    itemInstances[inst.id] = inst;
    armorInstanceId = inst.id;
  }
  const character: Character = CharacterSchema.parse({
    id: newCharacterId(), name: 'Knight', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: str, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    exhaustion: opts.exhaustion ?? 0,
    ...(opts.backgroundStr !== undefined ? { backgroundAbilityIncrease: { STR: opts.backgroundStr } } : {}),
    equipped: armorInstanceId !== undefined ? { armor: armorInstanceId, attuned: [] } : { attuned: [] },
  });
  return getEffectiveSpeed({ character, content: CONTENT, itemInstances });
};

describe('Heavy-armor Strength-requirement speed penalty (slice 799)', () => {
  it('Chain Mail (Str 13): below the requirement drops walk speed by 10; meeting it does not', () => {
    expect(walkSpeed('chain-mail', 12)).toBe(20);
    expect(walkSpeed('chain-mail', 13)).toBe(30); // "equal to or higher" — exactly 13 is fine
    expect(walkSpeed('chain-mail', 16)).toBe(30);
  });

  it('Plate + Splint (Str 15): below drops 10, at/above is full', () => {
    expect(walkSpeed('plate', 13)).toBe(20);
    expect(walkSpeed('plate', 15)).toBe(30);
    expect(walkSpeed('splint', 14)).toBe(20);
    expect(walkSpeed('splint', 15)).toBe(30);
  });

  it('armor without a Strength requirement (Studded Leather) and no armor never penalize', () => {
    expect(walkSpeed('studded-leather', 6)).toBe(30);
    expect(walkSpeed(undefined, 6)).toBe(30);
  });

  it('uses EFFECTIVE Strength: a +2 background increase lifts base 13 to 15, meeting Plate', () => {
    expect(walkSpeed('plate', 13)).toBe(20); // base 13, no boost -> penalized
    expect(walkSpeed('plate', 13, { backgroundStr: 2 })).toBe(30); // effective 15 -> meets
  });

  it('stacks with the exhaustion speed penalty (-10 armor, -5/level exhaustion)', () => {
    // STR 8 in Chain Mail (Str 13) with 1 level of exhaustion: 30 - 10 - 5 = 15.
    expect(walkSpeed('chain-mail', 8, { exhaustion: 1 })).toBe(15);
  });
});
