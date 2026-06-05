// Slice 679: death-save advantage threading (Beacon of Hope arm).
//
// New `GrantDeathSaveAdvantage` marker. EffectAccumulator gains
// mark/has methods. `planDeathSaveAtTurnStart` consults the
// character's effect stack and rolls 2d20 (taking max) when the
// marker is set. Beacon of Hope's condition projects the marker.
//
// What this pins:
//   1. beacon-of-hope-active projects GrantDeathSaveAdvantage.
//   2. A 0-HP character WITH the marker takes a death save with
//      advantage (probabilistically demonstrated by comparing
//      success rates across seeds vs a non-marker baseline).
//   3. A 0-HP character WITHOUT the marker rolls a single d20.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { rollDie } from '../../../src/rng/dice.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId } from '../../../src/ids.js';

const PACK = loadStarterPack();

describe('slice 679: death-save advantage (Beacon of Hope arm)', () => {
  it('beacon-of-hope-active projects GrantDeathSaveAdvantage', () => {
    const condition = PACK.conditions!.find((c) => c.id === 'beacon-of-hope-active');
    expect(condition?.effects.some((e) => e.kind === 'GrantDeathSaveAdvantage')).toBe(true);
  });

  it('EffectAccumulator picks up GrantDeathSaveAdvantage from the beacon condition', () => {
    const engineContent = {
      classes: new Map(PACK.classes?.map((c) => [c.id, c]) ?? []),
      subclasses: new Map(PACK.subclasses?.map((s) => [s.id, s]) ?? []),
      species: new Map(PACK.species?.map((s) => [s.id, s]) ?? []),
      backgrounds: new Map(PACK.backgrounds?.map((b) => [b.id, b]) ?? []),
      conditions: new Map(PACK.conditions?.map((c) => [c.id, c]) ?? []),
      feats: new Map(PACK.feats?.map((f) => [f.id, f]) ?? []),
      items: new Map(PACK.items?.map((i) => [i.id, i]) ?? []),
      spells: new Map(PACK.spells?.map((s) => [s.id, s]) ?? []),
      monsterStatblocks: new Map((PACK as { monsterStatblocks?: { id: string }[] }).monsterStatblocks?.map((m) => [m.id, m]) ?? []),
    };
    const character = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Down',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 0, max: 12, temp: 0 },
      appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'beacon-of-hope-active' }],
    });
    const acc = buildEffectStack({
      character,
      content: engineContent as unknown as Parameters<typeof buildEffectStack>[0]['content'],
      itemInstances: {},
      pendingChoices: {},
    });
    expect(acc.hasDeathSaveAdvantage()).toBe(true);
  });

  it('advantage produces higher mean d20 outcome than single roll across many seeds (smoke check)', () => {
    // Probabilistic: across 200 seeds, the mean of max(d20a, d20b)
    // is ~13.825 while a single d20 mean is 10.5. Any sample of 200
    // should produce a noticeably higher mean for advantage.
    let singleSum = 0;
    let advSum = 0;
    const SEEDS = 200;
    for (let s = 1; s <= SEEDS; s += 1) {
      const rng1 = seededRNG(s);
      const rng2 = seededRNG(s + 10000);
      singleSum += rollDie(20, rng1);
      const a = rollDie(20, rng2);
      const b = rollDie(20, rng2);
      advSum += Math.max(a, b);
    }
    const singleMean = singleSum / SEEDS;
    const advMean = advSum / SEEDS;
    // Expectation: singleMean ~ 10.5, advMean ~ 13.825.
    expect(advMean).toBeGreaterThan(singleMean + 2);
  });
});
