import { describe, expect, it } from 'vitest';
import { apply, applyAll } from '../../../src/engine/apply.js';
import { emptyCampaignState } from '../../../src/schemas/runtime/campaign.js';
import { buildFighter, eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  LongRestEndedEvent,
  LongRestStartedEvent,
  ShortRestEndedEvent,
  ShortRestStartedEvent,
} from '../../../src/schemas/events/rest.js';

const seedFighter = (overrides: Parameters<typeof buildFighter>[0] = {}) => {
  const character = buildFighter({
    resources: [
      { resourceId: 'second-wind', current: 0, max: 2 },
      { resourceId: 'action-surge', current: 0, max: 1 },
    ],
    ...overrides,
  });
  const created: CharacterCreatedEvent = {
    id: eventId(),
    at: isoTimestamp(),
    type: 'CharacterCreated',
    snapshot: character,
  };
  const state = apply(emptyCampaignState(), created);
  return { state, characterId: character.id };
};

describe('LongRest reducers', () => {
  it('long rest restores HP to max', () => {
    const { state, characterId } = seedFighter({ level: 3, hpMax: 26, hpCurrent: 8 });
    const start: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [characterId],
    };
    const end: LongRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestEnded',
    };
    const next = applyAll(state, [start, end]);
    expect(next.characters[characterId]?.hp.current).toBe(26);
    expect(next.characters[characterId]?.hp.temp).toBe(0);
  });

  it('long rest restores ALL spent hit dice (SRD 5.2.1, not the 2014 half)', () => {
    const { state, characterId } = seedFighter({ level: 4, hitDiceRemaining: 0 });
    const start: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [characterId],
    };
    const end: LongRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestEnded',
    };
    const next = applyAll(state, [start, end]);
    expect(next.characters[characterId]?.classes[0]?.hitDiceRemaining).toBe(4);
  });

  it('long rest reduces exhaustion by 1', () => {
    const { state, characterId } = seedFighter({ exhaustion: 3 });
    const start: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [characterId],
    };
    const end: LongRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestEnded',
    };
    const next = applyAll(state, [start, end]);
    expect(next.characters[characterId]?.exhaustion).toBe(2);
  });

  it('long rest restores resources', () => {
    const { state, characterId } = seedFighter();
    const start: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [characterId],
    };
    const end: LongRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestEnded',
    };
    const next = applyAll(state, [start, end]);
    const resources = next.characters[characterId]?.resources ?? [];
    for (const r of resources) {
      expect(r.current).toBe(r.max);
    }
  });

  it('starting long rest while already in long rest throws', () => {
    const { state, characterId } = seedFighter();
    const start: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [characterId],
    };
    const mid = apply(state, start);
    expect(() => apply(mid, start)).toThrow(/already in progress/);
  });

  it('ending long rest without starting throws', () => {
    const { state } = seedFighter();
    const end: LongRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestEnded',
    };
    expect(() => apply(state, end)).toThrow(/No active long rest/);
  });
});

describe('ShortRest reducers', () => {
  it('start + end short rest', () => {
    const { state, characterId } = seedFighter();
    const start: ShortRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ShortRestStarted',
      participantIds: [characterId],
    };
    const end: ShortRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ShortRestEnded',
    };
    const next = applyAll(state, [start, end]);
    expect(next.activeShortRest).toBeUndefined();
  });

  it('cannot start short rest during long rest', () => {
    const { state, characterId } = seedFighter();
    const long: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [characterId],
    };
    const short: ShortRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ShortRestStarted',
      participantIds: [characterId],
    };
    const midLong = apply(state, long);
    expect(() => apply(midLong, short)).toThrow(/long rest/);
  });

  it('cannot start long rest during short rest', () => {
    const { state, characterId } = seedFighter();
    const short: ShortRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ShortRestStarted',
      participantIds: [characterId],
    };
    const long: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'LongRestStarted',
      participantIds: [characterId],
    };
    const midShort = apply(state, short);
    expect(() => apply(midShort, long)).toThrow(/short rest/);
  });
});
