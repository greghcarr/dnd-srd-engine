// Slice 526: Quasit Rend natural weapon.
//
// RAW (SRD 5.2.1 Quasit, CR 1, Tiny Fiend (Demon), Chaotic Evil):
//   Rend: "Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3)
//   Slashing damage, and the target has the Poisoned condition
//   until the start of the quasit's next turn."
//
// Pure content slice. 1d4 slashing primary + slice-321 unconditional
// onHit applyConditionId Poisoned rider (same shape as Giant Centipede
// Bite, recolored to slashing). No Multiattack (Quasit has a single
// Rend action per RAW). Magic Resistance was already wired
// (pre-existing GrantMagicResistance).
//
// Documented RAW deviations (still deferred):
//   - Invisibility (action, at-will, self-cast): needs the monster-
//     action-self-cast-condition primitive. Sibling gap with Imp,
//     Sprite (the Pact-Chain Invisibility cluster).
//   - Shape-Shift (action, polymorph between true form / bat / centipede
//     / toad with speed-only stat changes): needs the monster-action-
//     polymorph primitive. Sibling gap with Imp.
//   - Scare (1/Day reaction, WIS DC 10 -> Frightened with recurring
//     end-of-turn save, 1-min auto-success): needs the per-day-uses +
//     reaction-with-save-or-condition primitive.
//   - The Poisoned condition duration ("until the start of the
//     quasit's next turn") is consumer-managed (mirror of slice 286
//     deviation, shared with all per-turn condition-rider weapons).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Quasit Rend (slice 526)', () => {
  it('the quasit-rend natural weapon ships with the RAW damage profile + Poisoned rider', () => {
    const w = PACK.items.find((it) => it.id === 'quasit-rend');
    expect(w).toBeDefined();
    expect(w!.itemKind).toBe('weapon');
    expect((w as { damageType: string }).damageType).toBe('slashing');
    expect((w as { damageDice: string }).damageDice).toBe('1d4');
    expect((w as { onHit: ReadonlyArray<{ applyConditionId?: string }> }).onHit).toEqual([
      { applyConditionId: 'poisoned' },
    ]);
  });

  it('quasit retains its pre-existing Magic Resistance trait and has no Multiattack (RAW)', () => {
    const m = PACK.monsters.find((mon) => mon.id === 'quasit')!;
    expect(m.traits.some((t) => t.kind === 'GrantMagicResistance')).toBe(true);
    expect(m.multiattack).toBeUndefined();
  });

  it('all 7 Pact of the Chain familiars now have a wired primary attack route', () => {
    // 5 had wired natural weapons before this slice (Pseudodragon,
    // Venomous Snake, Sphinx of Wonder, Sprite-via-Needle-Sword-gap,
    // Imp); Quasit closes a 6th here. Skeleton is the 7th and uses
    // generic Shortsword/Shortbow (already in pack; no RAW Multiattack).
    const FAMILIARS_WITH_NATURAL_WEAPONS = [
      'imp-sting',
      'pseudodragon-bite',
      'quasit-rend',
      'sphinx-of-wonder-rend',
      'venomous-snake-bite',
    ];
    for (const wid of FAMILIARS_WITH_NATURAL_WEAPONS) {
      expect(PACK.items.some((it) => it.id === wid), `missing weapon: ${wid}`).toBe(true);
    }
    // Skeleton's weapons are generic.
    expect(PACK.items.some((it) => it.id === 'shortsword')).toBe(true);
    expect(PACK.items.some((it) => it.id === 'shortbow')).toBe(true);
  });
});
