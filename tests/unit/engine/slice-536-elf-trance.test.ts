// Slice 536: Elf Trance narrative marker trait.
//
// RAW (SRD 5.2.1 Elf): "Trance. You don't need to sleep, and magic
// can't put you to sleep. You can finish a Long Rest in 4 hours if
// you spend those hours in a trancelike meditation, during which
// you retain consciousness."
//
// Pure content slice. All three arms are narrative/consumer-managed:
//   - "Don't need to sleep": engine doesn't model a sleep state.
//   - "Magic can't put you to sleep": the engine has no Sleep-spell
//     "fall asleep" condition; the Sleep spell's Unconscious-equivalent
//     in 2024 is itself the gate, and Trance's RAW immunity arm would
//     compose with the existing condition-immunity machinery once it
//     lands. Today: consumer enforces.
//   - "Long Rest in 4 hours": the Long Rest reducer doesn't track
//     wall-clock duration. Consumer-managed.
//
// Ships as a Custom-handler marker (mirror of slice 535's Halfling
// markers + the long-established nimble-escape pattern). Added to
// pack-integrity's BACKED_INDIRECTLY allowlist with explicit
// narrative-marker documentation.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Elf Trance (slice 536)', () => {
  it('elf species ships the elf-trance Custom marker', () => {
    const sp = PACK.species.find((s) => s.id === 'elf')!;
    const trait = sp.traits.find(
      (t) => t.kind === 'Custom' && (t as { handlerId?: string }).handlerId === 'elf-trance',
    );
    expect(trait).toBeDefined();
  });

  it('elf still ships its pre-existing traits (no regression)', () => {
    const sp = PACK.species.find((s) => s.id === 'elf')!;
    const kinds = sp.traits.map((t) => t.kind);
    // Pre-existing: Darkvision, Fey Ancestry (SetAdvantage), Keen
    // Senses (OfferChoice), Elven Lineage (OfferChoice, slice 532).
    expect(kinds).toContain('GrantSense');
    expect(kinds).toContain('SetAdvantage');
    expect(kinds.filter((k) => k === 'OfferChoice')).toHaveLength(2);
  });
});
