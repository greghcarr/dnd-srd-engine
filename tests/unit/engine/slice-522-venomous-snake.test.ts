// Slice 522: Venomous Snake monster statblock + venomous-snake-bite
// natural weapon. Closes slice 519's tracked open follow-up (the
// Pact of the Chain special-form familiar list was 6 of 7; this is
// the seventh).
//
// RAW (SRD 5.2.1 Venomous Snake, CR 1/8, Tiny Beast, Unaligned):
//   AC 12, HP 5 (2d4), Speed 30 ft + Swim 30 ft.
//   STR 2 DEX 15 CON 11 INT 1 WIS 10 CHA 3.
//   Senses Blindsight 10 ft; Passive Perception 10.
//   Languages None.
//   PB +2; XP 25.
//   Bite: +4 to hit, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage
//   plus 3 (1d6) Poison damage.
//
// Pure content slice; no engine work. The bite uses the slice-316
// unconditional onHit extra-damage rider (mirror of Giant Spider Bite
// scaled down).

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

describe('Venomous Snake (slice 522)', () => {
  it('the venomous-snake monster statblock ships with the SRD shape', () => {
    const m = PACK.monsters.find((mon) => mon.id === 'venomous-snake');
    expect(m).toBeDefined();
    expect(m!.name).toBe('Venomous Snake');
    expect(m!.size).toBe('Tiny');
    expect(m!.type).toBe('Beast');
    expect(m!.ac).toBe(12);
    expect(m!.hp.average).toBe(5);
    expect(m!.hp.formula).toBe('2d4');
    expect(m!.speed.walk).toBe(30);
    expect(m!.speed.swim).toBe(30);
    expect(m!.abilityScores).toEqual({ STR: 2, DEX: 15, CON: 11, INT: 1, WIS: 10, CHA: 3 });
    expect(m!.senses?.blindsight).toBe(10);
    expect(m!.cr).toBe(0.125);
    expect(m!.xp).toBe(25);
    expect(m!.proficiencyBonus).toBe(2);
  });

  it('the venomous-snake-bite natural weapon ships with the RAW damage profile', () => {
    const w = PACK.items.find((it) => it.id === 'venomous-snake-bite');
    expect(w).toBeDefined();
    expect(w!.itemKind).toBe('weapon');
    expect((w as { damageType: string }).damageType).toBe('piercing');
    expect((w as { damageDice: string }).damageDice).toBe('1d4');
    expect((w as { onHit: ReadonlyArray<{ dice?: string; damageType?: string }> }).onHit).toEqual([
      { dice: '1d6', damageType: 'poison' },
    ]);
  });

  it('all 7 Pact of the Chain RAW special-form familiars are now present (closes slice 519 follow-up)', () => {
    const SPECIAL_FORMS = [
      'imp',
      'pseudodragon',
      'quasit',
      'skeleton',
      'sphinx-of-wonder',
      'sprite',
      'venomous-snake',
    ];
    const missing = SPECIAL_FORMS.filter((id) => !PACK.monsters.some((m) => m.id === id));
    expect(missing).toEqual([]);
  });
});
