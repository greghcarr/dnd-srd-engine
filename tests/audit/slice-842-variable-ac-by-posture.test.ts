// Slice 842: variable-ac-by-posture — the audit's "statblock AC is a single
// number; prone/posture AC variants (Ankheg 14/11) are dropped" finding is NOT
// A BUG in SRD 5.2.1. The "14/11" is a 2014-PHB artifact: the 2014 Ankheg had
// "Armor Class 14 (natural armor), 11 while prone". The 2024 SRD gives every
// monster a SINGLE AC number — it folded natural armor into a flat value and
// removed posture-based AC variants entirely. Across the whole 2024 monster
// corpus there is not one "(natural armor)" parenthetical, "while prone" clause,
// or dual AC. Modeling a posture-variable AC would be edition drift. The
// engine's scalar `ac: z.number().int()` is the correct 2024 model. This guard
// pins the Ankheg's flat AC 14 + that no monster carries a posture-AC field, so
// a future edit can't re-introduce the 2014 dual-AC mechanic.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';

const PACK = loadStarterPack();
const monster = (id: string) => PACK.monsters.find((m) => m.id === id)!;

// Field names a 2014-style posture/dual AC would plausibly hide behind, so the
// guard catches a re-introduction however it's spelled.
const POSTURE_AC_KEYS = [
  'acProne', 'acWhileProne', 'proneAc', 'acVariants', 'acPosture', 'acByPosture',
  'alternateAc', 'naturalArmorAc', 'acWhenProne',
];

describe('variable-ac-by-posture is NOT A BUG: 2024 SRD monster AC is a single number (slice 842)', () => {
  it('the Ankheg has a FLAT AC 14 (not the 2014 "14 / 11 while prone" dual)', () => {
    // SRD 5.2.1 Ankheg: "AC 14" — a scalar. The 2014 "11 while prone" arm is gone.
    expect(monster('ankheg').ac).toBe(14);
  });

  it('every monster carries exactly one scalar AC (the 2024 single-number model)', () => {
    for (const m of PACK.monsters) {
      expect(typeof m.ac, `${m.id} ac type`).toBe('number');
      expect(Number.isInteger(m.ac), `${m.id} ac integer`).toBe(true);
      expect(m.ac, `${m.id} ac >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  it('no monster carries a posture / prone / dual AC field (2024 dropped variable AC)', () => {
    const offenders: string[] = [];
    for (const m of PACK.monsters) {
      const o = m as unknown as Record<string, unknown>;
      for (const k of POSTURE_AC_KEYS) {
        if (o[k] !== undefined) offenders.push(`${m.id}.${k}`);
      }
    }
    expect(
      offenders,
      `posture/dual AC fields found (the 2024 SRD gives every monster a single AC; a posture variant here is 2014 drift): ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });
});
