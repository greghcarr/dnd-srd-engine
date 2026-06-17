// Slice 898 — `long-rest-no-24h-lockout`.
//
// SRD 5.2.1 (rules-glossary "Long Rest"): "After you finish a Long Rest, you
// must wait at least 16 hours before starting another one." (The audit row's
// "~24h" was the 2014 once-per-24h-period rule; 2024 is a 16-hour gap.) The
// engine never enforced any cadence. Now an opt-in `enforceLongRestCadence`
// setting makes `planLongRest` reject a participant's second Long Rest until
// 16 in-game hours (consumer clock) have elapsed since its last one. Off by
// default — the rule needs the consumer's `inGameTime` clock, so a default-on
// gate would break a no-clock consumer's rest-fight-rest loop.

import { describe, expect, it } from 'vitest';
import { createEngine, type Engine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { CampaignSettingsChangedEvent } from '../../../src/schemas/events/settings.js';
import type { InGameTimeAdvancedEvent } from '../../../src/schemas/events/session.js';

const PACK = loadStarterPack();

const buildFighter = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
  });

const campaignWith = (...characters: Character[]) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(0) });
  let campaign: Campaign = engine.createCampaign({ name: 'rest-cadence' });
  campaign = commit(
    campaign,
    characters.map((c) => ({
      id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c,
    }) satisfies CharacterCreatedEvent),
  );
  return { engine, campaign };
};

const enableCadence = (campaign: Campaign): Campaign =>
  commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CampaignSettingsChanged', enforceLongRestCadence: true } satisfies CampaignSettingsChangedEvent,
  ]);

const advanceTime = (campaign: Campaign, minutes: number): Campaign =>
  commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'InGameTimeAdvanced', minutes } satisfies InGameTimeAdvancedEvent,
  ]);

const doLongRest = (engine: Engine, campaign: Campaign, ids: string[]): Campaign =>
  commit(campaign, engine.plan.longRest(campaign.state, { participantIds: ids }).events);

describe('slice 898: SRD 16-hour Long Rest cadence (opt-in)', () => {
  it('with cadence OFF (default), back-to-back Long Rests at the same in-game time both succeed', () => {
    const pc = buildFighter('Tireless');
    const { engine, campaign } = campaignWith(pc);
    const after1 = doLongRest(engine, campaign, [pc.id]);
    // No time advance, no setting — the second rest is unrestricted.
    const events2 = engine.plan.longRest(after1.state, { participantIds: [pc.id] }).events;
    expect(events2.some((e) => e.type === 'LongRestEnded')).toBe(true);
  });

  it('with cadence ON, a second Long Rest within 16 in-game hours throws (naming the creature)', () => {
    const pc = buildFighter('Hasty');
    const seed = campaignWith(pc);
    const campaign = enableCadence(seed.campaign);
    const after1 = doLongRest(seed.engine, campaign, [pc.id]); // completion recorded at minute 0
    expect(() =>
      seed.engine.plan.longRest(after1.state, { participantIds: [pc.id] }),
    ).toThrow(/Hasty.*16 hours|wait at least 16 hours/i);
  });

  it('with cadence ON, a Long Rest after exactly 16 in-game hours succeeds (>= boundary)', () => {
    const pc = buildFighter('Patient');
    const seed = campaignWith(pc);
    let campaign = enableCadence(seed.campaign);
    campaign = doLongRest(seed.engine, campaign, [pc.id]);
    campaign = advanceTime(campaign, 16 * 60); // exactly 16h
    const events2 = seed.engine.plan.longRest(campaign.state, { participantIds: [pc.id] }).events;
    expect(events2.some((e) => e.type === 'LongRestEnded')).toBe(true);
  });

  it('with cadence ON, one minute short of 16 hours still throws', () => {
    const pc = buildFighter('Impatient');
    const seed = campaignWith(pc);
    let campaign = enableCadence(seed.campaign);
    campaign = doLongRest(seed.engine, campaign, [pc.id]);
    campaign = advanceTime(campaign, 16 * 60 - 1); // 15h59m
    expect(() =>
      seed.engine.plan.longRest(campaign.state, { participantIds: [pc.id] }),
    ).toThrow(/16 hours/i);
  });

  it('the lockout is per-character: a member who has not rested can rest while another is locked out', () => {
    const a = buildFighter('Rested');
    const b = buildFighter('Fresh');
    const seed = campaignWith(a, b);
    let campaign = enableCadence(seed.campaign);
    campaign = doLongRest(seed.engine, campaign, [a.id]); // only A rests
    campaign = advanceTime(campaign, 60); // 1h later — A is still locked out
    // B has no recorded completion, so B can long-rest now.
    const eventsB = seed.engine.plan.longRest(campaign.state, { participantIds: [b.id] }).events;
    expect(eventsB.some((e) => e.type === 'LongRestEnded')).toBe(true);
    // A within the window still throws.
    expect(() =>
      seed.engine.plan.longRest(campaign.state, { participantIds: [a.id] }),
    ).toThrow(/Rested/);
  });
});
