// Slice 537: Human Resourceful narrative marker trait.
//
// RAW (SRD 5.2.1 Human): "Resourceful. You gain Heroic Inspiration
// whenever you finish a Long Rest."
//
// Pure content slice. Heroic Inspiration is not modeled in the
// engine at all today (no field on Character, no events, no
// planner, no reroll mechanic). The full Heroic Inspiration
// primitive (grant on Long Rest + consume to reroll any d20)
// is a substantial multi-slice primitive deferred to a future
// dedicated slice.
//
// Ships as a Custom-handler marker so consumers that DO model
// Heroic Inspiration can detect Resourceful and grant an
// Inspiration token on Long Rest. Mirror of slices 535-536's
// narrative-marker pattern.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Human Resourceful (slice 537)', () => {
  it('human species ships the human-resourceful Custom marker', () => {
    // Slice 542 promoted the human-resourceful marker from a
    // narrative Custom-handler stub to a real
    // GrantHeroicInspirationOnLongRest effect primitive (observable
    // in the effect stack via hasHeroicInspirationOnLongRest). This
    // test asserts the new shape; the deeper grant + consume +
    // reroll-deferral surface is tested in slice 542's test.
    const sp = PACK.species.find((s) => s.id === 'human')!;
    const trait = sp.traits.find((t) => t.kind === 'GrantHeroicInspirationOnLongRest');
    expect(trait).toBeDefined();
  });

  it('human retains its other traits (no regression)', () => {
    const sp = PACK.species.find((s) => s.id === 'human')!;
    const kinds = sp.traits.map((t) => t.kind);
    // Pre-existing: Skillful (OfferChoice), Versatile (OfferChoice slice 533).
    // Slice 560 added human-size (OfferChoice for Medium / Small).
    expect(kinds.filter((k) => k === 'OfferChoice')).toHaveLength(3);
  });
});
