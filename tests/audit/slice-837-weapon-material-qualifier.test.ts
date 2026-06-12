// Slice 837: weapon-material-qualifier — the audit's "needs silvered/adamantine
// GrantResistance qualifier" finding was 2014-based and is NOT A BUG in SRD
// 5.2.1. The 2024 SRD removed the weapon-material resistance qualifier entirely:
// monster resistances are flat typed lists with no source gate, "silvered"
// isn't a 2024 mechanic, and "adamantine" is only an object-AC value + the
// Adamantine Armor crit rule. Implementing silvered/adamantine would be edition
// drift. This guard pins the named creatures' flat 2024 resistances and that no
// monster carries the 2014 nonmagical-qualifier resistance pattern, so a future
// edit can't silently re-introduce the 2014 wording.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';

const PACK = loadStarterPack();
const monster = (id: string) => PACK.monsters.find((m) => m.id === id)!;
const BPS = ['bludgeoning', 'piercing', 'slashing'] as const;

describe('weapon-material-qualifier is NOT A BUG: 2024 SRD flat resistances (slice 837)', () => {
  it('the Chain Devil resists B/P/S + Cold as a FLAT list (no nonmagical/silvered gate)', () => {
    // SRD 5.2.1 Chain Devil: "Resistances Bludgeoning, Cold, Piercing, Slashing".
    expect([...monster('chain-devil').damageResistances].sort()).toEqual(
      ['bludgeoning', 'cold', 'piercing', 'slashing'],
    );
  });

  it('the Clay Golem resists B/P/S as a FLAT list (no adamantine gate)', () => {
    // SRD 5.2.1 Clay Golem: "Resistances Bludgeoning, Piercing, Slashing".
    expect([...monster('clay-golem').damageResistances].sort()).toEqual(
      ['bludgeoning', 'piercing', 'slashing'],
    );
  });

  it('the Werewolf and Stone Golem have NO B/P/S resistance (2024 dropped the silvered/adamantine arm)', () => {
    // SRD 5.2.1: the Werewolf has no Resistances line; the Stone Golem has only
    // Poison/Psychic immunity. The 2014 "B/P/S from nonmagical not silvered/
    // adamantine" resistance is gone.
    for (const id of ['werewolf', 'stone-golem']) {
      const m = monster(id);
      expect(BPS.some((t) => m.damageResistances.includes(t)), `${id} resistances`).toBe(false);
      expect(BPS.some((t) => m.damageImmunities.includes(t)), `${id} immunities`).toBe(false);
    }
  });

  it('no monster carries a GrantResistance qualifier (monsters use flat 2024 resistances, not the 2014 nonmagical/silvered pattern)', () => {
    const offenders: string[] = [];
    const walk = (node: unknown, owner: string): void => {
      if (Array.isArray(node)) {
        for (const v of node) walk(v, owner);
        return;
      }
      if (node !== null && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        if (o.kind === 'GrantResistance' && o.qualifier !== undefined) {
          offenders.push(`${owner}:${String(o.damageType)}:${String(o.qualifier)}`);
        }
        for (const v of Object.values(o)) walk(v, owner);
      }
    };
    for (const m of PACK.monsters) walk(m.traits ?? [], m.id);
    expect(
      offenders,
      `monster GrantResistance qualifiers found (the 2024 SRD uses flat resistances for monsters; a nonmagical/magical qualifier here is 2014 drift): ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });
});
