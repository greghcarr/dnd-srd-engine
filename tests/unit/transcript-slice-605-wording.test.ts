// Slice 605: transcript wording fixes for two confusing cases the
// slice-600 fuzz audit surfaced:
//   1. Relentless Endurance: previous output read "Aria spends 1
//      relentless-endurance" and required the reader to back-derive
//      "why?" from the damage arithmetic. Now reads as a RAW outcome.
//   2. Shield reaction: previous "+5 AC, turns the hit into a miss"
//      was misleading because the engine applies damage before Shield
//      fires (slice-592 documented limitation). New wording is honest.

import { describe, expect, it } from 'vitest';
import { formatTranscript } from '../transcript.js';
import { resolveContent, type ContentPack } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/starter-pack.js';
import {
  buildFighter,
  eventId,
  isoTimestamp,
} from '../fixtures/index.js';
import type { Event } from '../../src/schemas/events/index.js';

const STARTER: ContentPack = loadStarterPack();
const CONTENT = resolveContent([STARTER]);

describe('slice 605: transcript wording', () => {
  it('Relentless Endurance ResourceSpent renders as a named outcome', () => {
    const target = buildFighter({
      name: 'Aria',
      hpMax: 10,
      hpCurrent: 5,
      resources: [{ resourceId: 'relentless-endurance', current: 1, max: 1 }],
    });
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
        type: 'ResourceSpent',
        characterId: target.id,
        resourceId: 'relentless-endurance',
        amount: 1,
      },
    ];
    const rendered = formatTranscript(events, CONTENT);
    expect(rendered).toContain(`**Aria**'s Relentless Endurance prevents the killing blow (drops to 1 HP).`);
    // Old wording must not appear.
    expect(rendered).not.toContain('spends 1 relentless-endurance');
  });

  it('other resources still render with the generic spend wording', () => {
    const target = buildFighter({
      name: 'Bran',
      hpMax: 14,
      hpCurrent: 14,
      resources: [{ resourceId: 'rage', current: 2, max: 2 }],
    });
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
        type: 'ResourceSpent',
        characterId: target.id,
        resourceId: 'rage',
        amount: 1,
      },
    ];
    const rendered = formatTranscript(events, CONTENT);
    // Slice 613: resource ids now display as title-cased ("Rage", not
    // "rage") via the title-case fallback when no content label is set.
    expect(rendered).toContain('**Bran** spends 1 Rage.');
  });

  it('Shield (preventedHit) reads as the post-hit limitation, not "turns the hit into a miss"', () => {
    const caster = buildFighter({ name: 'Aria', hpMax: 8, hpCurrent: 8 });
    const events: ReadonlyArray<Event> = [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: caster,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ShieldCast',
        casterId: caster.id,
        preventedHit: true,
        triggeringAttackEventId: '01HTESTATTACK00000000000000',
      },
    ];
    const rendered = formatTranscript(events, CONTENT);
    expect(rendered).toContain('+5 AC (would have prevented this hit');
    expect(rendered).toContain('post-hit Shield limitation');
    expect(rendered).not.toContain('turns the hit into a miss');
  });

  it('Shield (!preventedHit) reads as "this attack still lands"', () => {
    const caster = buildFighter({ name: 'Bran' });
    const events: ReadonlyArray<Event> = [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'CharacterCreated',
        snapshot: caster,
      },
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ShieldCast',
        casterId: caster.id,
        preventedHit: false,
        triggeringAttackEventId: '01HTESTATTACK00000000000002',
      },
    ];
    const rendered = formatTranscript(events, CONTENT);
    expect(rendered).toContain('+5 AC for subsequent attacks (this attack still lands)');
  });
});
