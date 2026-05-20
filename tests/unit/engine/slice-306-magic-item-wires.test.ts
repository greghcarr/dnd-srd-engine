// Slice 306 — magic-item buff sweep (cont.). Three attunement-gated
// wearables wired via existing primitives, no engine changes.
//
// - Ioun Stone, Awareness: SetAdvantage on initiative + on
//   skill:perception (RAW: "Advantage on Initiative rolls and Wisdom
//   (Perception) checks").
// - Robe of the Archmagi (3/3 arms): OverrideACFormula base 15 + DEX
//   when unarmored; GrantMagicResistance; AddModifier spellSaveDC +2
//   and spellAttack +2.
// - Belt of Dwarvenkind (Resilience arm): GrantResistance poison +
//   SetAdvantage on saves vs the Poisoned condition (slice-298
//   Necklace of Adaptation predicate). The Toughness CON +2 and the
//   dwarf-conditional arms are deferred (need an additive-ability
//   primitive / unconditional-projection gating).
import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeAC } from '../../../src/derive/ac.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import {
  computeSpellSaveDC,
  computeSpellAttackBonus,
} from '../../../src/derive/spell-dc.js';
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
    name: 'Archmage',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level: 19, hitDiceRemaining: 19 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    ...overrides,
  });

const attuneStack = (defId: string) => {
  const item = makeItemInstance(defId);
  const wearer = buildWizard({ inventory: [item.id], equipped: { attuned: [item.id] as never } });
  return { item, wearer };
};

describe('slice 306: Ioun Stone, Awareness (advantage on Initiative + Perception)', () => {
  it('grants advantage on initiative and Perception while attuned', () => {
    const { item, wearer } = attuneStack('ioun-stone-awareness');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.advantageFor('initiative').advantage).toBe(true);
    expect(effects.advantageFor({ kind: 'skill', skill: 'perception' }).advantage).toBe(true);
  });

  it('does not bleed advantage to an unrelated skill', () => {
    const { item, wearer } = attuneStack('ioun-stone-awareness');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.advantageFor({ kind: 'skill', skill: 'stealth' }).advantage).toBe(false);
  });
});

describe('slice 306: Robe of the Archmagi (3 arms)', () => {
  it('Armor: unarmored base AC becomes 15 + DEX', () => {
    const { item, wearer } = attuneStack('robe-of-the-archmagi');
    const withRobe = computeAC({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT });
    const bare = buildWizard();
    const without = computeAC({ character: bare, itemInstances: {}, content: CONTENT });
    expect(withRobe.total).toBe(17); // 15 + DEX(+2)
    expect(without.total).toBe(12); // 10 + DEX(+2)
  });

  it('Magic Resistance: advantage on saves vs magical sources', () => {
    const { item, wearer } = attuneStack('robe-of-the-archmagi');
    const r = computeSavingThrow({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      ability: 'WIS',
      sourceIsMagical: true,
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it('Magic Resistance: no advantage vs non-magical sources', () => {
    const { item, wearer } = attuneStack('robe-of-the-archmagi');
    const r = computeSavingThrow({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      ability: 'WIS',
    });
    expect(r.hasAdvantage).toBe(false);
  });

  it('War Mage: spell save DC and spell attack each +2', () => {
    const { item, wearer } = attuneStack('robe-of-the-archmagi');
    const bare = buildWizard();
    const dcWith = computeSpellSaveDC({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, classId: 'wizard' });
    const dcWithout = computeSpellSaveDC({ character: bare, itemInstances: {}, content: CONTENT, classId: 'wizard' });
    const atkWith = computeSpellAttackBonus({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, classId: 'wizard' });
    const atkWithout = computeSpellAttackBonus({ character: bare, itemInstances: {}, content: CONTENT, classId: 'wizard' });
    expect(dcWith.total - dcWithout.total).toBe(2);
    expect(atkWith.total - atkWithout.total).toBe(2);
  });
});

describe('slice 306: Belt of Dwarvenkind (Resilience arm)', () => {
  it('grants Resistance to poison while attuned', () => {
    const { item, wearer } = attuneStack('belt-of-dwarvenkind');
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      pendingChoices: {},
    });
    expect(effects.hasResistance('poison')).toBe(true);
  });

  it('grants advantage on saves to avoid/end the Poisoned condition', () => {
    const { item, wearer } = attuneStack('belt-of-dwarvenkind');
    const r = computeSavingThrow({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      ability: 'CON',
      savePreventsCondition: 'poisoned',
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it('does not grant advantage on saves vs other conditions', () => {
    const { item, wearer } = attuneStack('belt-of-dwarvenkind');
    const r = computeSavingThrow({
      character: wearer,
      itemInstances: { [item.id]: item },
      content: CONTENT,
      ability: 'CON',
      savePreventsCondition: 'frightened',
    });
    expect(r.hasAdvantage).toBe(false);
  });
});
