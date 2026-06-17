// Slice 887 — Suffocation. Closes the L7 audit Area-8 quirk `no-suffocation`.
//
// RAW (rules-glossary "Suffocation", 2024): a suffocating creature "gains 1
// Exhaustion level at the end of each of its turns. When a creature can breathe
// again, it removes all levels of Exhaustion it gained from suffocating."
//
// The engine owns the Exhaustion accounting (accrue 1/tick, undo exactly those
// on recovery, tracked in `suffocationExhaustionLevels`); the "is it
// suffocating" trigger is the consumer's environmental model.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildSwimmer = (exhaustion = 0): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Diver', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 }, exhaustion, featsTaken: [],
  });

const setup = (exhaustion = 0) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const diver = buildSwimmer(exhaustion);
  let campaign: Campaign = engine.createCampaign({ name: 'suffocation' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: diver } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, id: diver.id };
};

const tick = (engine: ReturnType<typeof createEngine>, campaign: Campaign, id: string): Campaign =>
  commit(campaign, engine.plan.tickSuffocation(campaign.state, { characterId: id }).events);
const recover = (engine: ReturnType<typeof createEngine>, campaign: Campaign, id: string): Campaign =>
  commit(campaign, engine.plan.recoverFromBreath(campaign.state, { characterId: id }).events);
const chr = (campaign: Campaign, id: string): Character => campaign.state.characters[id]!;

describe('Suffocation (slice 887)', () => {
  it('a tick adds one Exhaustion level and records it against the reversible counter', () => {
    const { engine, campaign, id } = setup();
    const after = tick(engine, campaign, id);
    expect(chr(after, id).exhaustion).toBe(1);
    expect(chr(after, id).suffocationExhaustionLevels).toBe(1);
  });

  it('successive ticks accumulate', () => {
    let { engine, campaign, id } = setup();
    campaign = tick(engine, campaign, id);
    campaign = tick(engine, campaign, id);
    campaign = tick(engine, campaign, id);
    expect(chr(campaign, id).exhaustion).toBe(3);
    expect(chr(campaign, id).suffocationExhaustionLevels).toBe(3);
  });

  it('breathing again removes exactly the suffocation levels', () => {
    let { engine, campaign, id } = setup();
    campaign = tick(engine, campaign, id);
    campaign = tick(engine, campaign, id);
    campaign = recover(engine, campaign, id);
    expect(chr(campaign, id).exhaustion).toBe(0);
    expect(chr(campaign, id).suffocationExhaustionLevels).toBe(0);
  });

  it('recovery preserves Exhaustion from OTHER sources (only the suffocation subset is undone)', () => {
    // The diver already had 2 Exhaustion from another source before suffocating.
    let { engine, campaign, id } = setup(2);
    campaign = tick(engine, campaign, id); // -> 3 (1 from suffocation)
    campaign = tick(engine, campaign, id); // -> 4 (2 from suffocation)
    expect(chr(campaign, id).exhaustion).toBe(4);
    campaign = recover(engine, campaign, id);
    expect(chr(campaign, id).exhaustion).toBe(2); // back to the pre-suffocation level
    expect(chr(campaign, id).suffocationExhaustionLevels).toBe(0);
  });

  it('recovery with no accrued suffocation levels is a no-op (no event)', () => {
    const { engine, campaign, id } = setup(3);
    const events = engine.plan.recoverFromBreath(campaign.state, { characterId: id }).events;
    expect(events).toEqual([]);
  });

  it('ticking long enough reaches Exhaustion 6 and is fatal (RAW: level 6 = death)', () => {
    let { engine, campaign, id } = setup();
    for (let i = 0; i < 6; i += 1) campaign = tick(engine, campaign, id);
    expect(chr(campaign, id).exhaustion).toBe(6);
    expect(chr(campaign, id).hp.current).toBe(0);
    // A further tick at the lethal cap is a no-op.
    const after = engine.plan.tickSuffocation(campaign.state, { characterId: id }).events;
    expect(after).toEqual([]);
  });
});
