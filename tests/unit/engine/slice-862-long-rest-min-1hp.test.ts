// Slice 862 — `rest-no-min-1hp`.
//
// RAW (SRD 5.2.1, Long Rest): "To start a Long Rest, you must have at least 1
// Hit Point." `planLongRest` applied the rest's benefits (regain all HP, etc.)
// to every participant unconditionally, so a 0-HP / dying creature could
// long-rest straight to full. The planner now throws when any participant is
// below 1 HP — it must regain at least 1 HP first (a heal, or the
// stable-creature 1-HP-after-1d4-hours recovery).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();

const buildFighter = (name: string, hpCurrent: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hpCurrent, max: 28, temp: 0 },
  });

const campaignWith = (...characters: Character[]) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(0) });
  let campaign: Campaign = engine.createCampaign({ name: 'rest' });
  campaign = commit(
    campaign,
    characters.map((c) => ({
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c,
    }) satisfies CharacterCreatedEvent),
  );
  return { engine, campaign };
};

describe('slice 862: a creature must have at least 1 HP to start a Long Rest', () => {
  it('throws when a participant is at 0 HP (dying / unconscious)', () => {
    const downed = buildFighter('Downed', 0);
    const { engine, campaign } = campaignWith(downed);
    expect(() =>
      engine.plan.longRest(campaign.state, { participantIds: [downed.id] }),
    ).toThrow(/at least 1 Hit Point|0 Hit Points/i);
  });

  it('allows a Long Rest for a participant with at least 1 HP', () => {
    const hurt = buildFighter('Hurt', 1);
    const { engine, campaign } = campaignWith(hurt);
    const events = engine.plan.longRest(campaign.state, { participantIds: [hurt.id] }).events;
    expect(events.some((e) => e.type === 'LongRestStarted')).toBe(true);
    expect(events.some((e) => e.type === 'LongRestEnded')).toBe(true);
  });

  it('rejects a party Long Rest when any member is at 0 HP, naming them', () => {
    const healthy = buildFighter('Healthy', 28);
    const dying = buildFighter('Dying', 0);
    const { engine, campaign } = campaignWith(healthy, dying);
    expect(() =>
      engine.plan.longRest(campaign.state, { participantIds: [healthy.id, dying.id] }),
    ).toThrow(/Dying/);
  });
});
