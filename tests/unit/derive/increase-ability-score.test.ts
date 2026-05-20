// Slice 308 — IncreaseAbilityScore primitive (additive ability-score
// increase capped at `max`, distinct from OverrideAbilityScore which
// sets/floors). Canonical users: the six ability Ioun Stones (+2 to
// max 20) and Belt of Dwarvenkind's Toughness arm (CON +2 to max 20).
//
// The free-function tests pin the composition rules (floor-then-
// increase, never-lower, cap). The integration tests prove the wired
// items surface through a real derive (CON save / ability check).
import { describe, expect, it } from 'vitest';
import { effectiveAbilityScore } from '../../../src/derive/ability.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

describe('slice 308: effectiveAbilityScore with an additive increase', () => {
  it('adds the amount, capped at max', () => {
    expect(effectiveAbilityScore(14, undefined, { amount: 2, max: 20 })).toBe(16);
    expect(effectiveAbilityScore(19, undefined, { amount: 2, max: 20 })).toBe(20);
    expect(effectiveAbilityScore(8, undefined, { amount: 2, max: 20 })).toBe(10);
  });

  it('never lowers a score that already meets or exceeds max', () => {
    expect(effectiveAbilityScore(20, undefined, { amount: 2, max: 20 })).toBe(20);
    // A high floor (Belt of Giant Strength STR 29) must not be clamped
    // down to a +2-to-max-20 increase's cap.
    expect(effectiveAbilityScore(10, 29, { amount: 2, max: 20 })).toBe(29);
  });

  it('composes floor-then-increase (Amulet of Health 19 + an Ioun Stone +2 reaches 20)', () => {
    expect(effectiveAbilityScore(14, 19, { amount: 2, max: 20 })).toBe(20);
  });

  it('with no increase, behaves exactly as the floor-only form', () => {
    expect(effectiveAbilityScore(14, 19)).toBe(19);
    expect(effectiveAbilityScore(14)).toBe(14);
  });
});

const buildHero = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    ...overrides,
  });

const attune = (defId: string, overrides: Partial<Character> = {}) => {
  const item = makeItemInstance(defId);
  const wearer = buildHero({ ...overrides, inventory: [item.id], equipped: { attuned: [item.id] as never } });
  return { item, wearer };
};

describe('slice 308: Ioun Stones (+2 ability, max 20)', () => {
  it('Ioun Stone of Fortitude raises CON by 2 (surfaces in CON saves)', () => {
    const { item, wearer } = attune('ioun-stone-fortitude');
    const effects = buildEffectStack({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, pendingChoices: {} });
    expect(effects.effectiveAbilityScoreIncrease('CON')).toEqual({ amount: 2, max: 20 });
    const withStone = computeSavingThrow({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, ability: 'CON' });
    const without = computeSavingThrow({ character: buildHero(), itemInstances: {}, content: CONTENT, ability: 'CON' });
    // CON 14 (+2) -> 16 (+3): the save bonus rises by exactly 1.
    expect(withStone.total - without.total).toBe(1);
  });

  it('Ioun Stone of Intellect raises INT by 2 (surfaces in an INT check)', () => {
    const { item, wearer } = attune('ioun-stone-intellect');
    const withStone = computeAbilityCheck({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, ability: 'INT', skill: 'arcana' });
    const without = computeAbilityCheck({ character: buildHero(), itemInstances: {}, content: CONTENT, ability: 'INT', skill: 'arcana' });
    // INT 10 (+0) -> 12 (+1).
    expect(withStone.total - without.total).toBe(1);
  });

  it('caps at 20: a wearer with CON 20 sees no change from Ioun Stone of Fortitude', () => {
    const { item, wearer } = attune('ioun-stone-fortitude', { abilityScores: { STR: 16, DEX: 14, CON: 20, INT: 10, WIS: 12, CHA: 10 } });
    const withStone = computeSavingThrow({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, ability: 'CON' });
    const without = computeSavingThrow({
      character: buildHero({ abilityScores: { STR: 16, DEX: 14, CON: 20, INT: 10, WIS: 12, CHA: 10 } }),
      itemInstances: {},
      content: CONTENT,
      ability: 'CON',
    });
    expect(withStone.total).toBe(without.total);
  });

  it('does not require attunement to be skipped: an unattuned stone in inventory does not project', () => {
    const item = makeItemInstance('ioun-stone-fortitude');
    const wearer = buildHero({ inventory: [item.id] }); // not attuned
    const effects = buildEffectStack({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, pendingChoices: {} });
    expect(effects.effectiveAbilityScoreIncrease('CON')).toBeUndefined();
  });
});

describe('slice 308: Belt of Dwarvenkind Toughness arm', () => {
  it('raises CON by 2 in addition to the Resilience arm', () => {
    const { item, wearer } = attune('belt-of-dwarvenkind');
    const effects = buildEffectStack({ character: wearer, itemInstances: { [item.id]: item }, content: CONTENT, pendingChoices: {} });
    expect(effects.effectiveAbilityScoreIncrease('CON')).toEqual({ amount: 2, max: 20 });
    // Resilience arm still present.
    expect(effects.hasResistance('poison')).toBe(true);
  });
});
