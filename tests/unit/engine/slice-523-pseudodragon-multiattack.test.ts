// Slice 523: Pseudodragon Multiattack + pseudodragon-bite natural
// weapon.
//
// RAW (SRD 5.2.1 Pseudodragon, CR 1/4, Tiny Dragon, Neutral Good):
//   Multiattack: "The pseudodragon makes two Bite attacks."
//   Bite: "Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2)
//   Piercing damage."
//
// Pure content slice. Uses the slice-464 Multiattack primitive +
// slice-446 natural-weapon shape (Wolf Bite mirror, no on-hit rider).
// Magic Resistance was already wired (pre-existing GrantMagicResistance
// trait); Sting action stays deferred pending the margin-of-failure
// save-tier primitive (the deferred-mechanics doc tracks this as a
// shared shape with Giant Centipede + Ghost).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Pseudodragon Multiattack (slice 523)', () => {
  it('the pseudodragon statblock declares Multiattack (two Bite attacks)', () => {
    const m = PACK.monsters.find((mon) => mon.id === 'pseudodragon');
    expect(m).toBeDefined();
    expect(m!.multiattack).toBeDefined();
    expect(m!.multiattack!.name).toBe('Pseudodragon Multiattack');
    expect(m!.multiattack!.attacks).toEqual([{ weaponId: 'pseudodragon-bite', count: 2 }]);
  });

  it('the pseudodragon-bite natural weapon ships with the RAW damage profile', () => {
    const w = PACK.items.find((it) => it.id === 'pseudodragon-bite');
    expect(w).toBeDefined();
    expect(w!.itemKind).toBe('weapon');
    expect((w as { damageType: string }).damageType).toBe('piercing');
    expect((w as { damageDice: string }).damageDice).toBe('1d4');
    // No on-hit rider; Pseudodragon Bite is straight physical damage.
    // The venom is on the Sting action (deferred).
    expect((w as { onHit?: ReadonlyArray<unknown> }).onHit).toBeUndefined();
  });

  it('pseudodragon retains its pre-existing Magic Resistance trait', () => {
    const m = PACK.monsters.find((mon) => mon.id === 'pseudodragon')!;
    expect(m.traits.some((t) => t.kind === 'GrantMagicResistance')).toBe(true);
  });
});
