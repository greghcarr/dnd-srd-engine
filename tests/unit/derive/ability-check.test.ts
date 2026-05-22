import { describe, expect, it } from 'vitest';
import { computeAbilityCheck, computePassiveScore } from '../../../src/derive/ability-check.js';
import { buildFighter, TEST_CONTENT } from '../../fixtures/index.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { newAppliedConditionId, newItemInstanceId } from '../../../src/ids.js';
import type { AbilityScore } from '../../../src/schemas/primitives.js';

describe('computeAbilityCheck', () => {
  it('raw ability check: just the ability modifier', () => {
    const character = buildFighter({ STR: 16 });
    const r = computeAbilityCheck({
      character,
      itemInstances: {},
      content: TEST_CONTENT,
      ability: 'STR',
    });
    expect(r.total).toBe(3);
  });

  it('skill check with no proficiency: just the ability modifier', () => {
    // Acrobatics (DEX): the soldier background grants Athletics +
    // Intimidation, not Acrobatics, so this exercises the no-proficiency path.
    const character = buildFighter({ DEX: 14 });
    const r = computeAbilityCheck({
      character,
      itemInstances: {},
      content: TEST_CONTENT,
      ability: 'DEX',
      skill: 'acrobatics',
    });
    expect(r.total).toBe(2);
  });

  it('background-granted skill proficiency adds the proficiency bonus', () => {
    // Slice 412 fix: the soldier background grants Athletics; before the
    // fix this returned just the STR mod (the structured
    // skillProficiencies array never reached the effect stack).
    const character = buildFighter({ level: 5, STR: 16 });
    const r = computeAbilityCheck({
      character,
      itemInstances: {},
      content: TEST_CONTENT,
      ability: 'STR',
      skill: 'athletics',
    });
    expect(r.total).toBe(3 + 3); // STR +3, proficiency bonus +3 at level 5
  });

  it('exhaustion penalty applies to ability checks', () => {
    const character = buildFighter({ STR: 16, exhaustion: 2 });
    const r = computeAbilityCheck({
      character,
      itemInstances: {},
      content: TEST_CONTENT,
      ability: 'STR',
    });
    expect(r.total).toBe(3 - 4);
  });

  it('breakdown sums to total', () => {
    const character = buildFighter({ STR: 16, exhaustion: 1 });
    const r = computeAbilityCheck({
      character,
      itemInstances: {},
      content: TEST_CONTENT,
      ability: 'STR',
    });
    const sum = r.breakdown.reduce((acc, e) => acc + e.value, 0);
    expect(sum).toBe(r.total);
  });
});

describe('computePassiveScore', () => {
  it('passive perception = 10 + WIS mod (no proficiency baseline)', () => {
    const character = buildFighter({ WIS: 14 });
    expect(
      computePassiveScore({
        character,
        itemInstances: {},
        content: TEST_CONTENT,
        ability: 'WIS',
        skill: 'perception',
      }),
    ).toBe(12);
  });
});

// Slice 263: predicated SetAdvantage on ability checks honored end-to-
// end. Canonical user: Eyes of the Eagle (advantage on Perception
// checks that rely on sight, gated on `event.sense === 'sight'`).
// Uses the slice-258 SetAdvantage.condition plumbing + the new
// slice-263 `sense?` input field.
const STARTER_PACK = loadStarterPack();
const STARTER_CONTENT = resolveContent([STARTER_PACK]);

const makeEyes = (): ItemInstance =>
  ItemInstanceSchema.parse({
    id: newItemInstanceId(),
    definitionId: 'eyes-of-the-eagle',
  });

describe('Eyes of the Eagle (slice 263)', () => {
  it('advantage on Perception with sense=sight', () => {
    const eyes = makeEyes();
    const wearer = buildFighter({ WIS: 14, inventory: [eyes.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
      sense: 'sight',
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it('no advantage on Perception with sense=hearing', () => {
    const eyes = makeEyes();
    const wearer = buildFighter({ WIS: 14, inventory: [eyes.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
      sense: 'hearing',
    });
    expect(r.hasAdvantage).toBe(false);
  });

  it('no advantage on Perception when sense is not specified (consumer didn\'t indicate)', () => {
    const eyes = makeEyes();
    const wearer = buildFighter({ WIS: 14, inventory: [eyes.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
    });
    expect(r.hasAdvantage).toBe(false);
  });

  it('no advantage on non-Perception WIS skills even with sense=sight (gate is per-skill)', () => {
    const eyes = makeEyes();
    const wearer = buildFighter({ WIS: 14, inventory: [eyes.id] });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'insight',
      sense: 'sight',
    });
    expect(r.hasAdvantage).toBe(false);
  });

  it('without Eyes of the Eagle in inventory: no advantage even with sense=sight', () => {
    const wearer = buildFighter({ WIS: 14 });
    const r = computeAbilityCheck({
      character: wearer,
      itemInstances: {},
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
      sense: 'sight',
    });
    expect(r.hasAdvantage).toBe(false);
  });
});

// Slice 264: poisoned condition disadvantage extended to all 6 ability
// checks per SRD 5.2.1 ("Disadvantage on attack rolls and ability
// checks"). Prior wire only penalized STR + DEX (narrower than RAW).
// Pattern-check sibling: frightened has the same narrow-checks bug
// PLUS a missing source-in-LoS gate; tracked as a deferred dual-bug
// row in starter-pack-gaps.md.
const ABILITIES: ReadonlyArray<AbilityScore> = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

const buildPoisonedFighter = () => {
  const base = buildFighter({ STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14 });
  return {
    ...base,
    appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'poisoned' }],
  };
};

describe('Poisoned condition disadvantage on all ability checks (slice 264)', () => {
  it('disadvantage applies on every ability check (RAW: all 6 abilities)', () => {
    const fighter = buildPoisonedFighter();
    for (const ability of ABILITIES) {
      const r = computeAbilityCheck({
        character: fighter,
        itemInstances: {},
        content: STARTER_CONTENT,
        ability,
      });
      expect(r.hasDisadvantage, `Poisoned should give disadvantage on ${ability} check`).toBe(true);
    }
  });

  it('unpoisoned character has no disadvantage (regression check)', () => {
    const fighter = buildFighter({ STR: 14 });
    for (const ability of ABILITIES) {
      const r = computeAbilityCheck({
        character: fighter,
        itemInstances: {},
        content: STARTER_CONTENT,
        ability,
      });
      expect(r.hasDisadvantage, `Unpoisoned ${ability} check should not have disadvantage`).toBe(false);
    }
  });
});

// Slice 265: a skill check IS an ability check (RAW: skill check =
// ability mod + skill bonus + d20). Pre-slice, advantageFor was
// queried only on the skill target when skill was set, missing
// advantage / disadvantage applied at the underlying ability-check
// level. This block tests the inheritance: ability-check entries
// flow through to skill checks of the matching ability.
const buildBullsStrengthFighter = () => {
  const base = buildFighter({ STR: 14 });
  return {
    ...base,
    appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'bulls-strength-active' }],
  };
};

describe('Skill check inherits underlying ability-check advantage (slice 265)', () => {
  it('Poisoned character rolling Athletics (STR skill) has disadvantage', () => {
    const fighter = buildPoisonedFighter();
    const r = computeAbilityCheck({
      character: fighter,
      itemInstances: {},
      content: STARTER_CONTENT,
      ability: 'STR',
      skill: 'athletics',
    });
    expect(r.hasDisadvantage).toBe(true);
  });

  it('Poisoned character rolling Perception (WIS skill) has disadvantage', () => {
    const fighter = buildPoisonedFighter();
    const r = computeAbilityCheck({
      character: fighter,
      itemInstances: {},
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
    });
    expect(r.hasDisadvantage).toBe(true);
  });

  it("Bull's Strength wearer rolling Athletics (STR skill) has advantage", () => {
    const fighter = buildBullsStrengthFighter();
    const r = computeAbilityCheck({
      character: fighter,
      itemInstances: {},
      content: STARTER_CONTENT,
      ability: 'STR',
      skill: 'athletics',
    });
    expect(r.hasAdvantage).toBe(true);
  });

  it("Bull's Strength wearer rolling Perception (WIS skill) has no advantage (cross-ability)", () => {
    const fighter = buildBullsStrengthFighter();
    const r = computeAbilityCheck({
      character: fighter,
      itemInstances: {},
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
    });
    expect(r.hasAdvantage).toBe(false);
  });

  it('Eyes of the Eagle still gates on sense=sight when querying skill target (regression for slice 263)', () => {
    const eyes = makeEyes();
    const wearer = buildFighter({ WIS: 14, inventory: [eyes.id] });
    const withSight = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
      sense: 'sight',
    });
    expect(withSight.hasAdvantage).toBe(true);
    const withoutSight = computeAbilityCheck({
      character: wearer,
      itemInstances: { [eyes.id]: eyes },
      content: STARTER_CONTENT,
      ability: 'WIS',
      skill: 'perception',
    });
    expect(withoutSight.hasAdvantage).toBe(false);
  });
});
