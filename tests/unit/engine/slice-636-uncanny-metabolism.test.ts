// Slice 636: Monk L2 Uncanny Metabolism.
//
// RAW (SRD 5.2.1 Monk L2): "When you roll Initiative, you can regain
// all expended Focus Points. When you do so, roll your Martial Arts
// die, and regain a number of Hit Points equal to your Monk level
// plus the number rolled. Once you use this feature, you can't use
// it again until you finish a Long Rest."
//
// planUncannyMetabolism is consumer-driven (RAW: "you can"): after
// RollInitiative emits, the consumer prompts the monk whether to
// spend the 1/long-rest Uncanny Metabolism this encounter. On
// invocation it emits ResourceSpent (uncanny-metabolism, 1) +
// ResourceRestored (ki, 'all') + Healed (monk level + martial-arts
// die).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { HealedEvent } from '../../../src/schemas/events/combat.js';
import type {
  ResourceRestoredEvent,
  ResourceSpentEvent,
} from '../../../src/schemas/events/resources.js';

const PACK = loadStarterPack();

// Build a monk at the requested level. `kiSpent` simulates expended
// Focus Points prior to invoking Uncanny Metabolism. `umAvailable`
// toggles whether the once-per-long-rest gate has been spent.
const buildMonk = (
  level: number,
  options: { kiSpent?: number; umAvailable?: boolean; hpCurrent?: number } = {},
): Character => {
  const { kiSpent = 0, umAvailable = true, hpCurrent = 5 } = options;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Nivix',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 8 },
    hp: { current: hpCurrent, max: 20, temp: 0 },
    resources: [
      { resourceId: 'ki', current: Math.max(0, level - kiSpent), max: level },
      { resourceId: 'uncanny-metabolism', current: umAvailable ? 1 : 0, max: 1 },
    ],
  });
};

const setup = (
  monk: Character,
  seed = 1,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign = engine.createCampaign({ name: 'uncanny-metabolism' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: monk,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 636: Uncanny Metabolism', () => {
  it('emits ResourceSpent (uncanny-metabolism) + ResourceRestored (ki all) + Healed (monk level + 1d6) at L2', () => {
    const monk = buildMonk(2, { kiSpent: 2 });
    const { engine, campaign } = setup(monk);
    const { events } = engine.plan.uncannyMetabolism(campaign.state, {
      monkId: monk.id,
    });

    const spent = events.find(
      (e): e is ResourceSpentEvent =>
        e.type === 'ResourceSpent' && e.resourceId === 'uncanny-metabolism',
    );
    expect(spent, 'uncanny-metabolism use was not consumed').toBeDefined();
    expect(spent!.amount).toBe(1);

    const restored = events.find(
      (e): e is ResourceRestoredEvent =>
        e.type === 'ResourceRestored' && e.resourceId === 'ki',
    );
    expect(restored, 'ki was not restored').toBeDefined();
    expect(restored!.amount).toBe('all');

    const healed = events.find((e): e is HealedEvent => e.type === 'Healed');
    expect(healed, 'no Healed event').toBeDefined();
    // L2 monk: martial-arts die is 1d6. Heal = 2 (monk level) + [1..6].
    expect(healed!.amount).toBeGreaterThanOrEqual(3);
    expect(healed!.amount).toBeLessThanOrEqual(8);
    expect(healed!.source).toBe('uncanny-metabolism');
  });

  it('scales the martial-arts die: 1d8 at L5, 1d10 at L11, 1d12 at L17', () => {
    // Sweep a few seeds at each tier and confirm the heal lands in
    // the expected envelope per the martial-arts-die ladder.
    const tiers = [
      { level: 5, dieMax: 8 },
      { level: 11, dieMax: 10 },
      { level: 17, dieMax: 12 },
    ];
    for (const tier of tiers) {
      for (let seed = 1; seed < 5; seed++) {
        const monk = buildMonk(tier.level);
        const { engine, campaign } = setup(monk, seed);
        const { events } = engine.plan.uncannyMetabolism(campaign.state, {
          monkId: monk.id,
        });
        const healed = events.find((e): e is HealedEvent => e.type === 'Healed')!;
        expect(healed.amount).toBeGreaterThanOrEqual(tier.level + 1);
        expect(healed.amount).toBeLessThanOrEqual(tier.level + tier.dieMax);
      }
    }
  });

  it('rejects: non-monk, monk under L2, monk who has already used Uncanny Metabolism', () => {
    const fighter = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Fyr',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 30, max: 30, temp: 0 },
    });
    const a = setup(fighter);
    expect(() =>
      a.engine.plan.uncannyMetabolism(a.campaign.state, { monkId: fighter.id }),
    ).toThrow(/Uncanny Metabolism/);

    const tooLow = buildMonk(1);
    const b = setup(tooLow);
    expect(() =>
      b.engine.plan.uncannyMetabolism(b.campaign.state, { monkId: tooLow.id }),
    ).toThrow(/Uncanny Metabolism/);

    const usedThisRest = buildMonk(2, { umAvailable: false });
    const c = setup(usedThisRest);
    expect(() =>
      c.engine.plan.uncannyMetabolism(c.campaign.state, { monkId: usedThisRest.id }),
    ).toThrow(/already used Uncanny Metabolism/);
  });

  it('does not emit ActionEconomyConsumed (RAW: fires *as* initiative is rolled, no action cost)', () => {
    const monk = buildMonk(2);
    const { engine, campaign } = setup(monk);
    const { events } = engine.plan.uncannyMetabolism(campaign.state, {
      monkId: monk.id,
    });
    expect(events.some((e) => e.type === 'ActionEconomyConsumed')).toBe(false);
  });
});
