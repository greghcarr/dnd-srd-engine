// Slice 637: Warlock L2 Magical Cunning.
//
// RAW (SRD 5.2.1 Warlock L2): "You can perform an esoteric rite for
// 1 minute. At the end of it, you regain expended Pact Magic spell
// slots but no more than a number equal to half your maximum (round
// up). Once you use this feature, you can't do so again until you
// finish a Long Rest."
//
// planMagicalCunning spends the per-long-rest gate (`magical-cunning`
// resource, max 1, recharge: 'longRest'), then emits the new
// PactSlotsRegained event (slice 637 schema addition) with
// count = min(ceil(maxPactSlots / 2), pactSlotsUsed). The reducer
// decrements pactSlotsUsed by `count`, clamped at 0.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  PactSlotsRegainedEvent,
  PactSlotConsumedEvent,
} from '../../../src/schemas/events/spellcasting.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';

const PACK = loadStarterPack();

const buildWarlock = (
  level: number,
  options: { pactSlotsUsed?: number; gateAvailable?: boolean } = {},
): Character => {
  const { pactSlotsUsed = 0, gateAvailable = true } = options;
  return CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Velsorin',
    speciesId: 'tiefling',
    backgroundId: 'criminal',
    classes: [{ classId: 'warlock', level, hitDiceRemaining: level, subclassId: 'fiend-patron' }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 10, CHA: 16 },
    hp: { current: 20, max: 20, temp: 0 },
    pactSlotsUsed,
    resources: [
      {
        resourceId: 'magical-cunning',
        current: gateAvailable ? 1 : 0,
        max: 1,
      },
    ],
  });
};

const setup = (
  warlock: Character,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'magical-cunning' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: warlock,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 637: Magical Cunning', () => {
  it('regains ceil(max/2) expended Pact Magic slots and spends one gate use', () => {
    // L2 Warlock: max 1 pact slot. ceil(1/2) = 1. With 1 expended,
    // regain 1.
    const warlock = buildWarlock(2, { pactSlotsUsed: 1 });
    const { engine, campaign } = setup(warlock);
    const { events } = engine.plan.magicalCunning(campaign.state, {
      warlockId: warlock.id,
    });

    const spent = events.find(
      (e): e is ResourceSpentEvent =>
        e.type === 'ResourceSpent' && e.resourceId === 'magical-cunning',
    );
    expect(spent, 'magical-cunning gate was not consumed').toBeDefined();
    expect(spent!.amount).toBe(1);

    const regained = events.find(
      (e): e is PactSlotsRegainedEvent => e.type === 'PactSlotsRegained',
    );
    expect(regained, 'no PactSlotsRegained event').toBeDefined();
    expect(regained!.count).toBe(1);
    expect(regained!.source).toBe('magical-cunning');
  });

  it('caps regain at ceil(max/2) even when more slots are expended', () => {
    // L5 Warlock: max 2 pact slots. ceil(2/2) = 1. With 2 expended,
    // regain only 1.
    const warlock = buildWarlock(5, { pactSlotsUsed: 2 });
    const { engine, campaign } = setup(warlock);
    const { events } = engine.plan.magicalCunning(campaign.state, {
      warlockId: warlock.id,
    });
    const regained = events.find(
      (e): e is PactSlotsRegainedEvent => e.type === 'PactSlotsRegained',
    );
    expect(regained!.count).toBe(1);
  });

  it('regains all expended when fewer than ceil(max/2) are spent', () => {
    // L11 Warlock: max 3 pact slots. ceil(3/2) = 2. With 1 expended,
    // regain only 1 (capped at expended).
    const warlock = buildWarlock(11, { pactSlotsUsed: 1 });
    const { engine, campaign } = setup(warlock);
    const { events } = engine.plan.magicalCunning(campaign.state, {
      warlockId: warlock.id,
    });
    const regained = events.find(
      (e): e is PactSlotsRegainedEvent => e.type === 'PactSlotsRegained',
    );
    expect(regained!.count).toBe(1);
  });

  it('reducer applies PactSlotsRegained by decrementing pactSlotsUsed (clamped at 0)', () => {
    // Sanity check the new reducer: build a warlock with 2 expended,
    // commit a PactSlotConsumed to bring to 3, then plan Magical
    // Cunning and commit; pactSlotsUsed should drop by 1 (the regain
    // count for L5 / 2-max).
    const warlock = buildWarlock(5, { pactSlotsUsed: 1 });
    const { engine, campaign } = setup(warlock);
    // Add a second expended slot via a direct PactSlotConsumed event
    // so we have 2/2 used. Then plan + commit Magical Cunning.
    let c = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'PactSlotConsumed',
        characterId: warlock.id,
      } satisfies PactSlotConsumedEvent,
    ]);
    expect(c.state.characters[warlock.id]!.pactSlotsUsed).toBe(2);

    const { events } = engine.plan.magicalCunning(c.state, {
      warlockId: warlock.id,
    });
    c = commit(c, events);
    // Started at 2 used; regained 1; left with 1 used.
    expect(c.state.characters[warlock.id]!.pactSlotsUsed).toBe(1);
    // Gate is spent (current = 0).
    const gate = c.state.characters[warlock.id]!.resources.find(
      (r) => r.resourceId === 'magical-cunning',
    );
    expect(gate?.current).toBe(0);
  });

  it('rejects: non-warlock, warlock under L2, gate already spent, no expended slots', () => {
    const wizard = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Pell',
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
      hp: { current: 28, max: 28, temp: 0 },
    });
    const a = setup(wizard);
    expect(() =>
      a.engine.plan.magicalCunning(a.campaign.state, { warlockId: wizard.id }),
    ).toThrow(/Magical Cunning/);

    const tooLow = buildWarlock(1);
    const b = setup(tooLow);
    expect(() =>
      b.engine.plan.magicalCunning(b.campaign.state, { warlockId: tooLow.id }),
    ).toThrow(/Magical Cunning/);

    const gateSpent = buildWarlock(2, { pactSlotsUsed: 1, gateAvailable: false });
    const c = setup(gateSpent);
    expect(() =>
      c.engine.plan.magicalCunning(c.campaign.state, { warlockId: gateSpent.id }),
    ).toThrow(/already used Magical Cunning/);

    const noExpended = buildWarlock(2, { pactSlotsUsed: 0 });
    const d = setup(noExpended);
    expect(() =>
      d.engine.plan.magicalCunning(d.campaign.state, { warlockId: noExpended.id }),
    ).toThrow(/no expended Pact Magic slots/);
  });
});
