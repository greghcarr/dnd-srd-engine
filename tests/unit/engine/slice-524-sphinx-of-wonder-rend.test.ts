// Slice 524: Sphinx of Wonder Rend natural weapon.
//
// RAW (SRD 5.2.1 Sphinx of Wonder, CR 1, Tiny Celestial, Lawful Good):
//   Rend: "Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3)
//   Slashing damage plus 7 (2d6) Radiant damage."
//
// Pure content slice. 1d4 slashing primary + slice-316 unconditional
// onHit 2d6 radiant rider (same shape as Spy Shortsword's poison
// rider, recolored to radiant). No Multiattack (Sphinx of Wonder has
// a single Rend action per RAW). Magic Resistance was already wired
// (pre-existing GrantMagicResistance trait).
//
// Documented RAW deviation (deferred):
//   Burst of Ingenuity (2/Day reaction): adds +2 to an ability check
//   or saving throw made by the sphinx or a creature within 30 ft.
//   Needs the per-day-uses + reaction-with-numeric-modifier primitive;
//   substantial slice, not bundled here.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Sphinx of Wonder Rend (slice 524)', () => {
  it('the sphinx-of-wonder-rend natural weapon ships with the RAW damage profile', () => {
    const w = PACK.items.find((it) => it.id === 'sphinx-of-wonder-rend');
    expect(w).toBeDefined();
    expect(w!.itemKind).toBe('weapon');
    expect((w as { damageType: string }).damageType).toBe('slashing');
    expect((w as { damageDice: string }).damageDice).toBe('1d4');
    expect((w as { onHit: ReadonlyArray<{ dice?: string; damageType?: string }> }).onHit).toEqual([
      { dice: '2d6', damageType: 'radiant' },
    ]);
  });

  it('sphinx-of-wonder retains its pre-existing Magic Resistance trait and has no Multiattack (RAW)', () => {
    const m = PACK.monsters.find((mon) => mon.id === 'sphinx-of-wonder')!;
    expect(m.traits.some((t) => t.kind === 'GrantMagicResistance')).toBe(true);
    expect(m.multiattack).toBeUndefined();
  });
});
