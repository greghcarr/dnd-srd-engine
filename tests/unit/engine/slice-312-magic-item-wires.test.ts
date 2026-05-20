// Slice 312 — magic-item buff sweep (cont.). Five attunement-gated
// items, passive arms wired via existing primitives. Weapon +N
// bonuses / charged / reaction / drawback arms are deferred (see the
// pack entry descriptions). Held/worn-state is consumer-managed;
// attunement is the projection proxy.
//
// - Robe of Eyes: GrantSense truesight 120 + darkvision 120 +
//   SetAdvantage skill:perception.
// - Robe of Stars / Luck Blade: AddModifier { kind: save } +1
//   (all-saves, slice-299 wildcard).
// - Frost Brand: GrantResistance fire.
// - Quarterstaff of the Acrobat: SetAdvantage skill:acrobatics.
import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHero = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 8, hitDiceRemaining: 8 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 60, max: 60, temp: 0 },
    ...overrides,
  });

const attune = (defId: string) => {
  const item = makeItemInstance(defId);
  const wearer = buildHero({ inventory: [item.id], equipped: { attuned: [item.id] as never } });
  return { item, wearer };
};
const stack = (item: { id: string }, wearer: Character) =>
  buildEffectStack({ character: wearer, itemInstances: { [item.id]: item as never }, content: CONTENT, pendingChoices: {} });

describe('slice 312: Robe of Eyes', () => {
  it('grants truesight + darkvision 120 and advantage on Perception', () => {
    const { item, wearer } = attune('robe-of-eyes');
    const e = stack(item, wearer);
    expect(e.hasSense('truesight')).toBe(true);
    expect(e.hasSense('darkvision')).toBe(true);
    expect(e.advantageFor({ kind: 'skill', skill: 'perception' }).advantage).toBe(true);
  });
});

describe('slice 312: Frost Brand', () => {
  it('grants resistance to fire (and not cold)', () => {
    const { item, wearer } = attune('frost-brand');
    const e = stack(item, wearer);
    expect(e.hasResistance('fire')).toBe(true);
    expect(e.hasResistance('cold')).toBe(false);
  });
});

describe('slice 312: Quarterstaff of the Acrobat', () => {
  it('grants advantage on Acrobatics (and not another skill)', () => {
    const { item, wearer } = attune('quarterstaff-of-the-acrobat');
    const e = stack(item, wearer);
    expect(e.advantageFor({ kind: 'skill', skill: 'acrobatics' }).advantage).toBe(true);
    expect(e.advantageFor({ kind: 'skill', skill: 'stealth' }).advantage).toBe(false);
  });
});

describe('slice 312: Robe of Stars / Luck Blade (+1 to all saves)', () => {
  for (const defId of ['robe-of-stars', 'luck-blade'] as const) {
    it(`${defId}: +1 to every ability's save`, () => {
      const { item, wearer } = attune(defId);
      for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
        const delta = computeSavingThrow({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, ability }).total
          - computeSavingThrow({ character: buildHero(), itemInstances: {}, content: CONTENT, ability }).total;
        expect(delta, `save delta for ${ability}`).toBe(1);
      }
    });
  }
});
