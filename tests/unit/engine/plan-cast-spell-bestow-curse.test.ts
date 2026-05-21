import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

// Tests Bestow Curse's four caster-chosen variants. All four conditions
// ship narrative-only (their mechanical effects need engine primitives
// that don't exist yet — see condition descriptions in the pack). This
// test verifies the variant routing puts the right ConditionApplied
// onto the failed-save target.

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Curser',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 7, hitDiceRemaining: 7 }],
    abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 18, CHA: 12 },
    hp: { current: 42, max: 42, temp: 0 },
    featsTaken: [],
    preparedSpells: ['bestow-curse'],
  });

const buildLowWISTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 6, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    featsTaken: [],
  });

const buildCampaign = (caster: Character, target: Character, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: `curse-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const castUntilFail = (variantKey: string): ConditionAppliedEvent => {
  for (const seed of [1, 2, 3, 5, 7, 11, 13, 17, 19, 23]) {
    const caster = buildCleric();
    const target = buildLowWISTarget();
    const { engine, campaign } = buildCampaign(caster, target, seed);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: caster.id,
      spellId: 'bestow-curse',
      slotLevel: 3,
      targetIds: [target.id],
      casterChoice: { kind: 'variant', value: variantKey },
    }).events;
    const applied = events.find((e) => e.type === 'ConditionApplied') as ConditionAppliedEvent | undefined;
    if (applied !== undefined) return applied;
  }
  throw new Error(`No seed produced a failed WIS save for variant ${variantKey}`);
};

describe('Bestow Curse caster-chosen variant (9-variant save)', () => {
  it.each([
    ['ability-disadvantage-str', 'cursed-ability-str-active'],
    ['ability-disadvantage-wis', 'cursed-ability-wis-active'],
    ['attack-disadvantage', 'cursed-attacks-active'],
    ['inactive-turn', 'cursed-inert-active'],
    ['extra-damage', 'cursed-vulnerable-active'],
  ])("the '%s' variant applies %s on failed save", (key, expectedConditionId) => {
    const applied = castUntilFail(key);
    expect(applied.conditionId).toBe(expectedConditionId);
  });

  it('throws when no casterChoice is supplied', () => {
    const caster = buildCleric();
    const target = buildLowWISTarget();
    const { engine, campaign } = buildCampaign(caster, target, 0);
    expect(() =>
      engine.plan.castSpell(campaign.state, {
        characterId: caster.id,
        spellId: 'bestow-curse',
        slotLevel: 3,
        targetIds: [target.id],
      }),
    ).toThrow(/casterChoice/);
  });
});
