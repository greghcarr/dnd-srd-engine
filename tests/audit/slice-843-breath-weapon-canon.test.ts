// Slice 843: breath-weapon canon sweep. While canon-checking the Ankheg's
// statblock for slice 842 (variable-ac-by-posture), its Acid Spray was found
// drifted (pack DC 13 / 3d6 vs SRD 5.2.1 DC 12 / 4d6). A full sweep of every
// `breathWeapon` in the pack against `references/srd-markdown/monsters-A-Z.md`
// found 9 of 44 carrying stale 2014-MM stats (the adult chromatic dragons'
// inflated breath dice, plus young white/black, the Ankheg, and the Iron
// Golem's 2014 cone/DC/dice). The other 35 were already 2024-correct.
//
// This guard pins EVERY breath weapon to its exact SRD 5.2.1 signature, so a
// future edit can't silently re-introduce a 2014 value in any direction, and a
// newly-added breath weapon must be canon-checked (the table must cover exactly
// the set of pack monsters carrying a breathWeapon).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';

const PACK = loadStarterPack();

type BW = {
  recharge: number; save: string; dc: number;
  shape: 'cone' | 'line'; size: number; dice: string; type: string;
};

// The canonical SRD 5.2.1 breath-weapon table (monsters-A-Z.md). Every value
// here is the printed statblock value; halfOnSuccess is true for all (RAW).
const CANON: Record<string, BW> = {
  // — Chromatic dragons —
  'black-dragon-wyrmling': { recharge: 5, save: 'DEX', dc: 11, shape: 'line', size: 15, dice: '5d8', type: 'acid' },
  'young-black-dragon': { recharge: 5, save: 'DEX', dc: 14, shape: 'line', size: 30, dice: '14d6', type: 'acid' },
  'adult-black-dragon': { recharge: 5, save: 'DEX', dc: 18, shape: 'line', size: 60, dice: '12d8', type: 'acid' },
  'ancient-black-dragon': { recharge: 5, save: 'DEX', dc: 22, shape: 'line', size: 90, dice: '15d8', type: 'acid' },
  'blue-dragon-wyrmling': { recharge: 5, save: 'DEX', dc: 12, shape: 'line', size: 30, dice: '6d6', type: 'lightning' },
  'young-blue-dragon': { recharge: 5, save: 'DEX', dc: 16, shape: 'line', size: 60, dice: '10d10', type: 'lightning' },
  'adult-blue-dragon': { recharge: 5, save: 'DEX', dc: 19, shape: 'line', size: 90, dice: '11d10', type: 'lightning' },
  'ancient-blue-dragon': { recharge: 5, save: 'DEX', dc: 23, shape: 'line', size: 120, dice: '16d10', type: 'lightning' },
  'green-dragon-wyrmling': { recharge: 5, save: 'CON', dc: 11, shape: 'cone', size: 15, dice: '6d6', type: 'poison' },
  'young-green-dragon': { recharge: 5, save: 'CON', dc: 14, shape: 'cone', size: 30, dice: '12d6', type: 'poison' },
  'adult-green-dragon': { recharge: 5, save: 'CON', dc: 18, shape: 'cone', size: 60, dice: '16d6', type: 'poison' },
  'ancient-green-dragon': { recharge: 5, save: 'CON', dc: 22, shape: 'cone', size: 90, dice: '22d6', type: 'poison' },
  'red-dragon-wyrmling': { recharge: 5, save: 'DEX', dc: 13, shape: 'cone', size: 15, dice: '7d6', type: 'fire' },
  'young-red-dragon': { recharge: 5, save: 'DEX', dc: 17, shape: 'cone', size: 30, dice: '16d6', type: 'fire' },
  'adult-red-dragon': { recharge: 5, save: 'DEX', dc: 21, shape: 'cone', size: 60, dice: '17d6', type: 'fire' },
  'ancient-red-dragon': { recharge: 5, save: 'DEX', dc: 24, shape: 'cone', size: 90, dice: '26d6', type: 'fire' },
  'white-dragon-wyrmling': { recharge: 5, save: 'CON', dc: 12, shape: 'cone', size: 15, dice: '5d8', type: 'cold' },
  'young-white-dragon': { recharge: 5, save: 'CON', dc: 15, shape: 'cone', size: 30, dice: '9d8', type: 'cold' },
  'adult-white-dragon': { recharge: 5, save: 'CON', dc: 19, shape: 'cone', size: 60, dice: '12d8', type: 'cold' },
  'ancient-white-dragon': { recharge: 5, save: 'CON', dc: 22, shape: 'cone', size: 90, dice: '14d8', type: 'cold' },
  // — Metallic dragons —
  'brass-dragon-wyrmling': { recharge: 5, save: 'DEX', dc: 11, shape: 'line', size: 20, dice: '4d6', type: 'fire' },
  'young-brass-dragon': { recharge: 5, save: 'DEX', dc: 14, shape: 'line', size: 40, dice: '11d6', type: 'fire' },
  'adult-brass-dragon': { recharge: 5, save: 'DEX', dc: 18, shape: 'line', size: 60, dice: '10d8', type: 'fire' },
  'ancient-brass-dragon': { recharge: 5, save: 'DEX', dc: 21, shape: 'line', size: 90, dice: '13d8', type: 'fire' },
  'copper-dragon-wyrmling': { recharge: 5, save: 'DEX', dc: 11, shape: 'line', size: 20, dice: '4d8', type: 'acid' },
  'young-copper-dragon': { recharge: 5, save: 'DEX', dc: 14, shape: 'line', size: 40, dice: '9d8', type: 'acid' },
  'adult-copper-dragon': { recharge: 5, save: 'DEX', dc: 18, shape: 'line', size: 60, dice: '12d8', type: 'acid' },
  'ancient-copper-dragon': { recharge: 5, save: 'DEX', dc: 22, shape: 'line', size: 90, dice: '14d8', type: 'acid' },
  'bronze-dragon-wyrmling': { recharge: 5, save: 'DEX', dc: 12, shape: 'line', size: 40, dice: '3d10', type: 'lightning' },
  'young-bronze-dragon': { recharge: 5, save: 'DEX', dc: 15, shape: 'line', size: 60, dice: '9d10', type: 'lightning' },
  'adult-bronze-dragon': { recharge: 5, save: 'DEX', dc: 19, shape: 'line', size: 90, dice: '10d10', type: 'lightning' },
  'ancient-bronze-dragon': { recharge: 5, save: 'DEX', dc: 23, shape: 'line', size: 120, dice: '15d10', type: 'lightning' },
  'silver-dragon-wyrmling': { recharge: 5, save: 'CON', dc: 13, shape: 'cone', size: 15, dice: '4d8', type: 'cold' },
  'young-silver-dragon': { recharge: 5, save: 'CON', dc: 17, shape: 'cone', size: 30, dice: '11d8', type: 'cold' },
  'adult-silver-dragon': { recharge: 5, save: 'CON', dc: 20, shape: 'cone', size: 60, dice: '12d8', type: 'cold' },
  'ancient-silver-dragon': { recharge: 5, save: 'CON', dc: 24, shape: 'cone', size: 90, dice: '15d8', type: 'cold' },
  'gold-dragon-wyrmling': { recharge: 5, save: 'DEX', dc: 13, shape: 'cone', size: 15, dice: '4d10', type: 'fire' },
  'young-gold-dragon': { recharge: 5, save: 'DEX', dc: 17, shape: 'cone', size: 30, dice: '10d10', type: 'fire' },
  'adult-gold-dragon': { recharge: 5, save: 'DEX', dc: 21, shape: 'cone', size: 60, dice: '12d10', type: 'fire' },
  'ancient-gold-dragon': { recharge: 5, save: 'DEX', dc: 24, shape: 'cone', size: 90, dice: '13d10', type: 'fire' },
  // — Non-dragon breathers —
  'ankheg': { recharge: 6, save: 'DEX', dc: 12, shape: 'line', size: 30, dice: '4d6', type: 'acid' },
  'iron-golem': { recharge: 6, save: 'CON', dc: 18, shape: 'cone', size: 60, dice: '10d10', type: 'poison' },
  'dragon-turtle': { recharge: 5, save: 'CON', dc: 19, shape: 'cone', size: 60, dice: '16d6', type: 'fire' },
  'winter-wolf': { recharge: 5, save: 'CON', dc: 12, shape: 'cone', size: 15, dice: '4d8', type: 'cold' },
};

describe('breath-weapon canon sweep (slice 843)', () => {
  const breathers = PACK.monsters.filter((m) => m.breathWeapon);

  it('the canon table covers exactly the set of pack monsters with a breathWeapon', () => {
    // Forces a newly-added breath weapon to be canon-checked here.
    expect(breathers.map((m) => m.id).sort()).toEqual(Object.keys(CANON).sort());
  });

  it.each(Object.keys(CANON))('%s breath weapon matches SRD 5.2.1 exactly', (id) => {
    const m = PACK.monsters.find((mm) => mm.id === id)!;
    const b = m.breathWeapon!;
    const c = CANON[id]!;
    expect({
      recharge: b.rechargeMin, save: b.saveAbility, dc: b.saveDC,
      shape: b.area.shape, size: b.area.sizeFeet, dice: b.damageDice, type: b.damageType,
      half: b.halfOnSuccess,
    }).toEqual({ ...c, half: true });
  });
});
