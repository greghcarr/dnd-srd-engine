import { describe, expect, it } from 'vitest';
import { apply, applyAll } from '../../src/engine/apply.js';
import { emptyCampaignState } from '../../src/schemas/runtime/campaign.js';
import { buildFighter, eventId, isoTimestamp, TEST_CONTENT } from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { DamageAppliedEvent, HealedEvent } from '../../src/schemas/events/combat.js';
import type {
  LongRestEndedEvent,
  LongRestStartedEvent,
} from '../../src/schemas/events/rest.js';
import type { Event } from '../../src/schemas/events/index.js';
import { replay } from '../../src/engine/replay.js';
import { formatTranscript } from '../transcript.js';

describe('golden: create → damage → heal → long rest', () => {
  it('produces expected end state', async () => {
    const character = buildFighter({
      level: 3,
      hpMax: 26,
      hpCurrent: 26,
      hitDiceRemaining: 1,
      exhaustion: 2,
      resources: [{ resourceId: 'second-wind', current: 0, max: 2 }],
    });
    const created: CharacterCreatedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    };
    const damage: DamageAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(10),
      type: 'DamageApplied',
      targetId: character.id,
      components: [{ amount: 8, type: 'slashing' }],
    };
    const heal: HealedEvent = {
      id: eventId(),
      at: isoTimestamp(20),
      type: 'Healed',
      targetId: character.id,
      amount: 3,
    };
    const longStart: LongRestStartedEvent = {
      id: eventId(),
      at: isoTimestamp(30),
      type: 'LongRestStarted',
      participantIds: [character.id],
    };
    const longEnd: LongRestEndedEvent = {
      id: eventId(),
      at: isoTimestamp(40),
      type: 'LongRestEnded',
    };

    const events: Event[] = [created, damage, heal, longStart, longEnd];
    const final = applyAll(emptyCampaignState(), events);

    const result = final.characters[character.id];
    expect(result?.hp.current).toBe(26);
    expect(result?.hp.temp).toBe(0);
    expect(result?.exhaustion).toBe(1);
    // SRD 5.2.1: a Long Rest restores ALL spent Hit Dice, so a level-3
    // fighter who had spent 2 (1 remaining) is back to 3 (slice 781).
    expect(result?.classes[0]?.hitDiceRemaining).toBe(3);
    expect(result?.resources[0]?.current).toBe(2);
    expect(final.version).toBe(events.length);

    await expect(
      formatTranscript(events, TEST_CONTENT, { title: 'Long rest restores HP, hit dice, and resources' }),
    ).toMatchFileSnapshot('./transcripts/s1-long-rest.transcript.md');
  });

  it('damage to 0 HP then heal revives with cleared death saves', async () => {
    const character = buildFighter({ hpMax: 12, hpCurrent: 5 });
    const created: CharacterCreatedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    };
    const kill: DamageAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(10),
      type: 'DamageApplied',
      targetId: character.id,
      components: [{ amount: 5, type: 'slashing' }],
    };
    const damageWhileDown: DamageAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(20),
      type: 'DamageApplied',
      targetId: character.id,
      components: [{ amount: 2, type: 'slashing' }],
    };
    const heal: HealedEvent = {
      id: eventId(),
      at: isoTimestamp(30),
      type: 'Healed',
      targetId: character.id,
      amount: 5,
    };
    const events = [created, kill, damageWhileDown, heal];
    const final = applyAll(emptyCampaignState(), events);
    const result = final.characters[character.id];
    expect(result?.hp.current).toBe(5);
    expect(result?.deathSaves.failures).toBe(0);
    expect(result?.deathSaves.successes).toBe(0);

    await expect(
      formatTranscript(events, TEST_CONTENT, { title: 'Damage to 0 HP, more damage while down, then healed back up' }),
    ).toMatchFileSnapshot('./transcripts/s1-damage-to-zero-revive.transcript.md');
  });
});

describe('golden: replay equivalence', () => {
  it('replay of recorded events yields identical state', () => {
    const character = buildFighter({ hpMax: 12, hpCurrent: 12 });
    const created: CharacterCreatedEvent = {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    };
    const damage: DamageAppliedEvent = {
      id: eventId(),
      at: isoTimestamp(10),
      type: 'DamageApplied',
      targetId: character.id,
      components: [{ amount: 3, type: 'fire' }],
    };
    const events: Event[] = [created, damage];

    const direct = applyAll(emptyCampaignState(), events);
    const replayed = replay(events);

    expect(JSON.stringify(replayed)).toBe(JSON.stringify(direct));
  });
});
