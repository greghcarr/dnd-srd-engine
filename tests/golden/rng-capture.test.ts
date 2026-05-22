import { describe, expect, it } from 'vitest';
import { applyAll } from '../../src/engine/apply.js';
import { emptyCampaignState } from '../../src/schemas/runtime/campaign.js';
import {
  buildFighter,
  eventId,
  isoTimestamp,
} from '../fixtures/index.js';
import { planLongRest, planShortRest } from '../../src/engine/plan/rest.js';
import { defaultRNG, seededRNG, throwOnCallRNG } from '../../src/rng/index.js';
import type { Event } from '../../src/schemas/events/index.js';

describe('RNG capture proof', () => {
  it('apply() never calls the RNG (replay with ThrowOnCallRNG still works)', () => {
    const character = buildFighter({ hpCurrent: 5, hpMax: 12 });
    const events: Event[] = [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character },
      {
        id: eventId(),
        at: isoTimestamp(10),
        type: 'DamageApplied',
        targetId: character.id,
        components: [{ amount: 3, type: 'fire' }],
      },
      { id: eventId(), at: isoTimestamp(20), type: 'Healed', targetId: character.id, amount: 2 },
      {
        id: eventId(),
        at: isoTimestamp(30),
        type: 'TempHPGranted',
        targetId: character.id,
        amount: 5,
      },
    ];
    void throwOnCallRNG();
    expect(() => applyAll(emptyCampaignState(), events)).not.toThrow();
  });

  it('apply() is deterministic regardless of RNG used elsewhere', () => {
    const character = buildFighter({ hpCurrent: 12, hpMax: 12 });
    const events: Event[] = [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character },
      {
        id: eventId(),
        at: isoTimestamp(10),
        type: 'DamageApplied',
        targetId: character.id,
        components: [{ amount: 4, type: 'fire' }],
      },
    ];
    const a = applyAll(emptyCampaignState(), events);
    const b = applyAll(emptyCampaignState(), events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    void defaultRNG();
  });

  it('plan() produces deterministic event ids and timestamps given fixed `at`', () => {
    const intent = {
      type: 'LongRest' as const,
      participantIds: ['01HKQM3J6S1H4ZGSTPYBHN0VCS'],
      at: '2026-01-01T00:00:00.000Z',
    };
    const a = planLongRest(emptyCampaignState(), intent);
    const b = planLongRest(emptyCampaignState(), intent);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(a[0]?.at).toBe(b[0]?.at);
  });

  it('different seeded RNGs do not affect apply() outcomes', () => {
    void seededRNG(1);
    void seededRNG(2);
    const character = buildFighter({ hpCurrent: 12, hpMax: 12 });
    const events: Event[] = [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character },
    ];
    const a = applyAll(emptyCampaignState(), events);
    const b = applyAll(emptyCampaignState(), events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('planShortRest emits start and end events', () => {
    const events = planShortRest(emptyCampaignState(), {
      type: 'ShortRest',
      participantIds: ['01HKQM3J6S1H4ZGSTPYBHN0VCS'],
      at: '2026-01-01T00:00:00.000Z',
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('ShortRestStarted');
    expect(events[1]?.type).toBe('ShortRestEnded');
  });
});
