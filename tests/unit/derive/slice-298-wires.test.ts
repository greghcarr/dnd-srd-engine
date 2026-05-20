// Slice 298 — content sweep + bug fix.
//
// Five new wires using existing primitives, plus a deduplication bug
// fix on Stone of Good Luck (the pack had two entries: a wired
// `stone-of-good-luck` and an empty `stone-of-good-luck-luckstone`
// — the duplicate was removed, with the surviving entry's name
// updated to the SRD-canonical "Stone of Good Luck (Luckstone)").
//
// Wires (each pinned by tests below):
// - Eyes of Minute Seeing: SetAdvantage on Investigation
// - Headband of Intellect: OverrideAbilityScore INT 19
// - Necklace of Adaptation: SetAdvantage on save gated on
//   event.savePreventsCondition='poisoned'
// - Periapt of Health: same as Necklace
// - Stone of Good Luck deduplication: only one entry now exists,
//   wired with all 12 save+check AddModifier entries.
import { describe, expect, it } from 'vitest';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { effectiveAbilityScore } from '../../../src/derive/ability.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../../src/schemas/runtime/item-instance.js';
import { newItemInstanceId } from '../../../src/ids.js';
import { buildFighter } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const makeItem = (definitionId: string): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId });

describe('Eyes of Minute Seeing — Investigation advantage (slice 298)', () => {
  it('grants advantage on Investigation while worn (no attunement)', () => {
    const eyes = makeItem('eyes-of-minute-seeing');
    const wearer = buildFighter({ INT: 12, inventory: [eyes.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: CONTENT,
      ability: 'INT',
      skill: 'investigation',
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it('does not affect other skills', () => {
    const eyes = makeItem('eyes-of-minute-seeing');
    const wearer = buildFighter({ INT: 12, inventory: [eyes.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: CONTENT,
      ability: 'INT',
      skill: 'arcana',
    });
    expect(r.hasAdvantage).toBe(false);
  });
});

describe('Headband of Intellect — OverrideAbilityScore INT 19 (slice 298)', () => {
  it('floors INT to 19 while attuned', () => {
    const band = makeItem('headband-of-intellect');
    const wearer = buildFighter({
      INT: 10,
      inventory: [band.id],
      attunedInstanceIds: [band.id],
    });
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [band.id]: band },
      content: CONTENT,
      pendingChoices: {},
    });
    const floor = effects.effectiveAbilityScoreFloor('INT')?.value;
    expect(floor).toBe(19);
    expect(effectiveAbilityScore(wearer.abilityScores.INT, floor)).toBe(19);
  });

  it('no effect when base INT already exceeds 19', () => {
    const band = makeItem('headband-of-intellect');
    const wearer = buildFighter({
      INT: 20,
      inventory: [band.id],
      attunedInstanceIds: [band.id],
    });
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [band.id]: band },
      content: CONTENT,
      pendingChoices: {},
    });
    const floor = effects.effectiveAbilityScoreFloor('INT')?.value;
    expect(effectiveAbilityScore(wearer.abilityScores.INT, floor)).toBe(20);
  });

  it('does not fire without attunement', () => {
    const band = makeItem('headband-of-intellect');
    const wearer = buildFighter({ INT: 10, inventory: [band.id] });
    const effects = buildEffectStack({
      character: wearer,
      itemInstances: { [band.id]: band },
      content: CONTENT,
      pendingChoices: {},
    });
    const floor = effects.effectiveAbilityScoreFloor('INT')?.value;
    expect(floor).toBeUndefined();
  });
});

describe('Necklace of Adaptation + Periapt of Health — Poisoned-save advantage (slice 298)', () => {
  for (const [label, defId] of [
    ['Necklace of Adaptation', 'necklace-of-adaptation'],
    ['Periapt of Health', 'periapt-of-health'],
  ] as const) {
    it(`${label}: advantage on saves vs Poisoned`, () => {
      const item = makeItem(defId);
      const wearer = buildFighter({
        CON: 14,
        inventory: [item.id],
        attunedInstanceIds: [item.id],
      });
      const r = computeSavingThrow({
        character: wearer,
        itemInstances: { [item.id]: item },
        content: CONTENT,
        ability: 'CON',
        savePreventsCondition: 'poisoned',
      });
      expect(r.hasAdvantage).toBe(true);
    });

    it(`${label}: no advantage on saves vs other conditions`, () => {
      const item = makeItem(defId);
      const wearer = buildFighter({
        CON: 14,
        inventory: [item.id],
        attunedInstanceIds: [item.id],
      });
      const r = computeSavingThrow({
        character: wearer,
        itemInstances: { [item.id]: item },
        content: CONTENT,
        ability: 'CON',
        savePreventsCondition: 'frightened',
      });
      expect(r.hasAdvantage).toBe(false);
    });

    it(`${label}: no advantage on generic saves (savePreventsCondition undefined)`, () => {
      const item = makeItem(defId);
      const wearer = buildFighter({
        CON: 14,
        inventory: [item.id],
        attunedInstanceIds: [item.id],
      });
      const r = computeSavingThrow({
        character: wearer,
        itemInstances: { [item.id]: item },
        content: CONTENT,
        ability: 'CON',
      });
      expect(r.hasAdvantage).toBe(false);
    });
  }
});

describe('Stone of Good Luck deduplication (slice 298 bug fix)', () => {
  it('only one Stone of Good Luck entry exists in the pack', () => {
    const matches = PACK.items.filter((i) => i.name.startsWith('Stone of Good Luck'));
    expect(matches).toHaveLength(1);
  });

  it('canonical entry has the SRD-matching name', () => {
    const entry = PACK.items.find((i) => i.id === 'stone-of-good-luck');
    expect(entry?.name).toBe('Stone of Good Luck (Luckstone)');
  });

  it('canonical entry still carries all 12 save+check AddModifier entries', () => {
    const entry = PACK.items.find((i) => i.id === 'stone-of-good-luck');
    if (entry === undefined || (entry.itemKind !== 'magic' && entry.itemKind !== 'consumable')) {
      throw new Error('expected stone-of-good-luck to be wired magic item');
    }
    expect(entry.itemKind).toBe('magic');
    if (entry.itemKind === 'magic') {
      expect(entry.effects).toHaveLength(12);
    }
  });
});
