// Slice 613: ResourceSpent wording is now content-driven.
//   - The killing-blow special wording fires when the resource id is in
//     the set of `PreventFatalDamageConsumingResource` declarations in
//     content (any species/feat carrying that effect kind earns the
//     wording automatically).
//   - The display label comes from the GrantResource entry's optional
//     `label` field in content; falls back to a title-cased slug if
//     unlabeled.
//
// Pre-slice the formatter hardcoded `if (resourceId === 'relentless-
// endurance')` for the killing-blow wording and printed raw slugs for
// every other resource.

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

const seededResource = (resourceId: string, name: string, hpMax = 10) => {
  const target = buildFighter({
    name,
    hpMax,
    hpCurrent: hpMax,
    resources: [{ resourceId, current: 1, max: 1 }],
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
      resourceId,
      amount: 1,
    },
  ];
  return formatTranscript(events, CONTENT);
};

describe('slice 613: resource labels + killing-blow wording driven from content', () => {
  it('a resource that content marks as PreventFatalDamageConsumingResource gets the killing-blow wording', () => {
    // The starter pack ships Orc Relentless Endurance with the
    // PreventFatalDamageConsumingResource effect AND a `label`.
    const rendered = seededResource('relentless-endurance', 'Aria');
    expect(rendered).toContain(
      `**Aria**'s Relentless Endurance prevents the killing blow (drops to 1 HP).`,
    );
  });

  it('a resource that content marks with a `label` uses that label for the generic spend wording', () => {
    // Adrenaline Rush is granted by Orc with label "Adrenaline Rush".
    const rendered = seededResource('adrenaline-rush', 'Aria');
    expect(rendered).toContain('**Aria** spends 1 Adrenaline Rush.');
    expect(rendered).not.toContain('adrenaline-rush');
  });

  it('a resource without a content label falls back to a title-cased slug', () => {
    // Rage is currently in the pack via Barbarian level 1 features but
    // without an explicit `label`. Title-case fallback → "Rage".
    const rendered = seededResource('rage', 'Bran', 14);
    expect(rendered).toContain('**Bran** spends 1 Rage.');
  });

  it('does NOT print the killing-blow wording for non-prevent resources', () => {
    const rendered = seededResource('rage', 'Bran', 14);
    expect(rendered).not.toContain('prevents the killing blow');
  });
});
