// Slice 535: Halfling Nimbleness + Naturally Stealthy.
//
// RAW (SRD 5.2.1 Halfling):
//   "Halfling Nimbleness. You can move through the space of any
//   creature that is a size larger than you, but you can't stop in
//   the same space."
//   "Naturally Stealthy. You can take the Hide action even when you
//   are obscured only by a creature that is at least one size larger
//   than you."
//
// Pure content slice. Both traits are narrative/consumer-managed --
// they affect positional / Hide-action gates the engine doesn't
// model. Wired as declarative Custom-handler markers so consumers
// can detect that a Halfling has these traits and enforce the
// narrative rule. No engine code, no handler implementation
// required (mirror of nimble-escape's pattern for narrative-marker
// custom handlers).
//
// Documented (not a deviation): Halfling Luck (reroll a 1 on any
// d20 test) needs a new reroll-on-1 primitive and ships in a
// separate slice. This slice covers ONLY Nimbleness + Naturally
// Stealthy. The other Halfling L1 RAW trait already shipped is
// Brave (advantage on Frightened saves).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Halfling Nimbleness + Naturally Stealthy (slice 535)', () => {
  it('halfling species ships the halfling-nimbleness Custom marker', () => {
    const sp = PACK.species.find((s) => s.id === 'halfling')!;
    const trait = sp.traits.find(
      (t) => t.kind === 'Custom' && (t as { handlerId?: string }).handlerId === 'halfling-nimbleness',
    );
    expect(trait).toBeDefined();
  });

  it('halfling species ships the halfling-naturally-stealthy Custom marker', () => {
    const sp = PACK.species.find((s) => s.id === 'halfling')!;
    const trait = sp.traits.find(
      (t) => t.kind === 'Custom' && (t as { handlerId?: string }).handlerId === 'halfling-naturally-stealthy',
    );
    expect(trait).toBeDefined();
  });

  it('halfling still ships its pre-existing Brave trait (no regression)', () => {
    const sp = PACK.species.find((s) => s.id === 'halfling')!;
    // Brave = SetAdvantage on saves preventing Frightened
    const brave = sp.traits.find(
      (t) =>
        t.kind === 'SetAdvantage' &&
        JSON.stringify((t as unknown as { condition: unknown }).condition).includes('frightened'),
    );
    expect(brave).toBeDefined();
  });
});
