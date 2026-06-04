// Slice 604: the transcript formatter clamps HP displays at 0.
//
// RAW PHB Damage at 0 HP: "When you take damage that would reduce your
// HP to 0, you have any remaining damage carried over to determine
// instant death, but your HP becomes 0." The engine keeps the signed
// post-damage value internally for the instant-death threshold calc
// (excess >= max HP); the transcript clamps every HP display at 0 so
// a reader doesn't see "-7/9" and wonder if the engine has a bug.
//
// Surfaced by the slice-600 fuzz-replay review of 15 battles.

import { describe, expect, it } from 'vitest';
import { formatTranscript } from '../transcript.js';
import { resolveContent, type ContentPack } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/starter-pack.js';
import {
  buildFighter,
  eventId,
  isoTimestamp,
  makeItemInstance,
} from '../fixtures/index.js';
import type { Event } from '../../src/schemas/events/index.js';

const STARTER: ContentPack = loadStarterPack();
const CONTENT = resolveContent([STARTER]);

describe('slice 604: transcript clamps HP displays at 0', () => {
  it('a DamageApplied that takes HP to -3 renders as "HP 5 -> 0", not "HP 5 -> -3"', () => {
    // Build a target at 5/10 HP, then apply damage of 8 (would take HP
    // to -3 internally). The transcript should clamp both sides at 0
    // for display while leaving the underlying state alone.
    const target = buildFighter({ name: 'Target', hpMax: 10, hpCurrent: 5 });
    const weapon = makeItemInstance('longsword');
    const events: ReadonlyArray<Event> = [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'DamageApplied',
        targetId: target.id,
        components: [{ amount: 8, type: 'slashing' }],
        source: 'test',
      },
    ];
    const rendered = formatTranscript(events, CONTENT);
    expect(rendered).toContain('HP 5 -> 0');
    expect(rendered).not.toContain('-3');
    expect(rendered).not.toContain('HP 5 -> -');
  });

  it('a Healed event that brings a 0-HP target up to 6 renders as "HP 0 -> 6", not "HP -3 -> 6"', () => {
    // Pre-state: damage drops HP to -3 internally. Then heal 9.
    // Internal HP after heal: -3 + 9 = 6. Display: 0 -> 6 (the source
    // side clamps before the arrow).
    const target = buildFighter({ name: 'Target', hpMax: 10, hpCurrent: 5 });
    const events: ReadonlyArray<Event> = [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: target,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'DamageApplied',
        targetId: target.id,
        components: [{ amount: 8, type: 'slashing' }],
        source: 'test',
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'Healed',
        targetId: target.id,
        amount: 9,
        source: 'cure-wounds',
      },
    ];
    const rendered = formatTranscript(events, CONTENT);
    expect(rendered).toMatch(/HP 0 ->.*\b(6|9)\b/);
    expect(rendered).not.toContain('HP -3');
  });
});
