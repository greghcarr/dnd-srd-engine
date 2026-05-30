// Slice 525: Imp Sting natural weapon.
//
// RAW (SRD 5.2.1 Imp, CR 1, Tiny Fiend (Devil), Lawful Evil):
//   Sting: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3)
//   Piercing damage plus 7 (2d6) Poison damage."
//
// Pure content slice. 1d6 piercing primary + slice-316 unconditional
// onHit 2d6 poison rider (same shape as Spy Shortsword). No
// Multiattack (Imp has a single Sting action per RAW). Magic
// Resistance was already wired (pre-existing GrantMagicResistance).
//
// Documented RAW deviations (still deferred):
//   - Invisibility (action, at-will, self-cast): needs the monster-
//     action-self-cast-condition primitive.
//   - Shape-Shift (action, polymorph between true form / rat / raven
//     / spider with speed-only stat changes): needs the monster-
//     action-polymorph primitive composed with the existing spell-
//     side polymorph planner.
//   - Devil's Sight: narrative (magical-darkness vision; the engine
//     doesn't model magical darkness as obscurement).
//
// All three deferrals stay narrative/consumer-managed for now.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Imp Sting (slice 525)', () => {
  it('the imp-sting natural weapon ships with the RAW damage profile', () => {
    const w = PACK.items.find((it) => it.id === 'imp-sting');
    expect(w).toBeDefined();
    expect(w!.itemKind).toBe('weapon');
    expect((w as { damageType: string }).damageType).toBe('piercing');
    expect((w as { damageDice: string }).damageDice).toBe('1d6');
    expect((w as { onHit: ReadonlyArray<{ dice?: string; damageType?: string }> }).onHit).toEqual([
      { dice: '2d6', damageType: 'poison' },
    ]);
  });

  it('imp retains its pre-existing Magic Resistance trait and has no Multiattack (RAW)', () => {
    const m = PACK.monsters.find((mon) => mon.id === 'imp')!;
    expect(m.traits.some((t) => t.kind === 'GrantMagicResistance')).toBe(true);
    expect(m.multiattack).toBeUndefined();
  });
});
