// Slice 311 — magic-item buff sweep (cont.). Six attunement-gated
// staves/rods/medallion, passive arms wired via existing primitives.
// Their charged spell-lists / reaction / positional-aura arms are
// deferred (see the pack entry descriptions). Held-state is
// consumer-managed; attunement is the projection proxy.
//
// - Staff of Fire / Staff of Frost: GrantResistance fire / cold.
// - Rod of Alertness: SetAdvantage initiative + skill:perception.
// - Scarab of Protection: AddModifier ac +1 + GrantMagicResistance.
// - Staff of the Magi: AddModifier spellAttack +2 + GrantMagicResistance.
// - Staff of Power: AddModifier ac +2 + save +2 (slice-299 wildcard)
//   + spellAttack +2.
import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeAC } from '../../../src/derive/ac.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { computeSpellAttackBonus } from '../../../src/derive/spell-dc.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWizard = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mage',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level: 17, hitDiceRemaining: 17 }],
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    ...overrides,
  });

const attune = (defId: string, overrides: Partial<Character> = {}) => {
  const item = makeItemInstance(defId);
  const wearer = buildWizard({ ...overrides, inventory: [item.id], equipped: { attuned: [item.id] as never } });
  return { item, wearer };
};
const stack = (item: { id: string }, wearer: Character) =>
  buildEffectStack({ character: wearer, itemInstances: { [item.id]: item as never }, content: CONTENT, pendingChoices: {} });

describe('slice 311: Staff of Fire / Staff of Frost (damage resistance)', () => {
  it('Staff of Fire grants resistance to fire (and not cold)', () => {
    const { item, wearer } = attune('staff-of-fire');
    const e = stack(item, wearer);
    expect(e.hasResistance('fire')).toBe(true);
    expect(e.hasResistance('cold')).toBe(false);
  });
  it('Staff of Frost grants resistance to cold (and not fire)', () => {
    const { item, wearer } = attune('staff-of-frost');
    const e = stack(item, wearer);
    expect(e.hasResistance('cold')).toBe(true);
    expect(e.hasResistance('fire')).toBe(false);
  });
});

describe('slice 311: Rod of Alertness (Alertness arm)', () => {
  it('grants advantage on initiative and Perception', () => {
    const { item, wearer } = attune('rod-of-alertness');
    const e = stack(item, wearer);
    expect(e.advantageFor('initiative').advantage).toBe(true);
    expect(e.advantageFor({ kind: 'skill', skill: 'perception' }).advantage).toBe(true);
  });
});

describe('slice 311: Scarab of Protection', () => {
  it('+1 AC and advantage on saves vs magical sources', () => {
    const { item, wearer } = attune('scarab-of-protection');
    const acWith = computeAC({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT });
    const acWithout = computeAC({ character: buildWizard(), itemInstances: {}, content: CONTENT });
    expect(acWith.total - acWithout.total).toBe(1);
    const save = computeSavingThrow({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, ability: 'WIS', sourceIsMagical: true });
    expect(save.hasAdvantage).toBe(true);
  });
});

describe('slice 311: Staff of the Magi', () => {
  it('+2 spell attack and advantage on saves vs spells', () => {
    const { item, wearer } = attune('staff-of-the-magi');
    const atkWith = computeSpellAttackBonus({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, classId: 'wizard' });
    const atkWithout = computeSpellAttackBonus({ character: buildWizard(), itemInstances: {}, content: CONTENT, classId: 'wizard' });
    expect(atkWith.total - atkWithout.total).toBe(2);
    const save = computeSavingThrow({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, ability: 'INT', sourceIsMagical: true });
    expect(save.hasAdvantage).toBe(true);
  });
});

describe('slice 311: Staff of Power', () => {
  it('+2 AC, +2 to all saves, +2 spell attack', () => {
    const { item, wearer } = attune('staff-of-power');
    const acDelta = computeAC({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT }).total
      - computeAC({ character: buildWizard(), itemInstances: {}, content: CONTENT }).total;
    expect(acDelta).toBe(2);
    const atkDelta = computeSpellAttackBonus({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, classId: 'wizard' }).total
      - computeSpellAttackBonus({ character: buildWizard(), itemInstances: {}, content: CONTENT, classId: 'wizard' }).total;
    expect(atkDelta).toBe(2);
    // Save wildcard: +2 to every ability's save, not just one.
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      const delta = computeSavingThrow({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, ability }).total
        - computeSavingThrow({ character: buildWizard(), itemInstances: {}, content: CONTENT, ability }).total;
      expect(delta, `save delta for ${ability}`).toBe(2);
    }
  });
});
