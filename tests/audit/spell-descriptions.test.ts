// Slice 813: every SRD spell now ships player-facing rules text in
// `description`, extracted from references/srd-markdown/spells.md (the
// CC-BY-4.0 SRD 5.2.1 clone — the only valid source). dnd-web's tap-to-read
// feature shows `description` verbatim, so a spell missing it would render a
// blank rules panel, and a truncated one would mislead a player.
//
// This guard fails if any spell loses its description or carries a
// suspiciously short one (an extraction regression). Cleanliness of the text
// (no `Slice <n>` / `RAW` / `consumer` artifacts) is covered by the sibling
// player-facing-descriptions lint, which walks spells too.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';

const PACK = loadStarterPack();

// The shortest real SRD spell body sits ~70 chars; 40 is a safe floor that
// only an empty/truncated extraction can trip.
const MIN_DESCRIPTION_CHARS = 40;

describe('every spell ships player-facing rules text (slice 813)', () => {
  it('the pack ships a full spell list to check', () => {
    expect(PACK.spells.length).toBeGreaterThan(300);
  });

  it('no spell is missing a description', () => {
    const missing = PACK.spells
      .filter((s) => !s.description || s.description.trim().length === 0)
      .map((s) => s.id);
    expect(missing, `${missing.length} spell(s) have no description`).toEqual([]);
  });

  it('no spell description is suspiciously short (extraction failure)', () => {
    const tooShort = PACK.spells
      .filter((s) => (s.description ?? '').trim().length < MIN_DESCRIPTION_CHARS)
      .map((s) => `${s.id} (${(s.description ?? '').trim().length} chars)`);
    expect(tooShort, `${tooShort.length} spell(s) fall under ${MIN_DESCRIPTION_CHARS} chars`).toEqual(
      [],
    );
  });
});
