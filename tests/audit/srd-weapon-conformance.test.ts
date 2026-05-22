// SRD weapon conformance (slice 422): a GROUND-TRUTH data + derivation check.
//
// Weapon stats are NOT covered by srd-drift, so the pack's damage dice /
// types / properties / mastery and the weapon damage line were 🟡/🔴 in the
// coverage ledger. This test parses the Weapons table out of
// references/srd-markdown/equipment.md and asserts (a) each pack weapon's
// data matches the SRD cell and (b) computeWeaponDamage / computeAttackBonus
// produce the SRD die + ability mod + proficiency for a plain melee wielder.
// Every expected value is parsed from the book, so a misread cannot pass.
//
// Skips (does not fail) when the SRD clone is absent, mirroring srd-drift.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeWeaponDamage, computeAttackBonus } from '../../src/derive/attack.js';
import { resolveContent } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { abilityModifier, proficiencyBonus } from '../../src/derive/ability.js';
import { buildFighter, makeItemInstance } from '../fixtures/index.js';
import type { Weapon } from '../../src/schemas/content/item.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EQUIPMENT_MD = resolve(HERE, '../../references/srd-markdown/equipment.md');
const SRD_AVAILABLE = existsSync(EQUIPMENT_MD);

interface SrdWeaponRow {
  readonly name: string;
  readonly dice?: string;
  readonly damageType?: string;
  readonly versatileDice?: string;
  readonly properties: ReadonlyArray<string>;
  readonly mastery?: string;
}

// Parse the Weapons table; every field comes straight from a cell.
const parseWeaponTable = (md: string): ReadonlyArray<SrdWeaponRow> => {
  const start = md.indexOf('<th>Mastery</th>'); // unique to the weapon-table header
  const end = md.indexOf('</table>', start);
  const region = md.slice(start, end);
  const rows: SrdWeaponRow[] = [];

  for (const rowChunk of region.split('<tr>')) {
    const cells = [...rowChunk.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1]!.trim());
    if (cells.length < 4) continue; // section headers have no <td>s
    const [name, damage, propertiesCell, mastery] = [cells[0]!, cells[1]!, cells[2]!, cells[3]!];

    const dmg = /^(\d+d\d+)\s+(\w+)$/.exec(damage);
    const versatile = /Versatile \((\d+d\d+)\)/.exec(propertiesCell);
    // Each property token, parenthetical stripped: "Thrown (Range 20/60)" -> thrown.
    const properties =
      propertiesCell === '—'
        ? []
        : propertiesCell.split(',').map((t) => t.split('(')[0]!.trim().toLowerCase()).filter(Boolean);

    rows.push({
      name,
      ...(dmg ? { dice: dmg[1], damageType: dmg[2]!.toLowerCase() } : {}),
      ...(versatile ? { versatileDice: versatile[1] } : {}),
      properties,
      ...(mastery !== '—' ? { mastery } : {}),
    });
  }
  return rows;
};

const normalize = (name: string): string => name.toLowerCase().trim();

describe.runIf(SRD_AVAILABLE)('SRD weapon conformance (ground-truth, parsed from equipment.md)', () => {
  const content = resolveContent([loadStarterPack()]);
  const md = SRD_AVAILABLE ? readFileSync(EQUIPMENT_MD, 'utf8') : '';
  const weapons = parseWeaponTable(md);

  // Base weapons only: exclude magic weapons (rarity / attackBonus) and the
  // monster natural weapons, which carry distinct names anyway.
  const packByName = new Map<string, Weapon>();
  for (const def of content.items.values()) {
    if (def.itemKind === 'weapon' && def.rarity === undefined && def.attackBonus === undefined) {
      packByName.set(normalize(def.name), def);
    }
  }

  it('parses the full SRD weapon table (sanity, not vacuous)', () => {
    expect(weapons.length).toBeGreaterThanOrEqual(30); // SRD lists ~37 weapons
  });

  for (const w of weapons) {
    it(`${w.name}: pack data + computeWeaponDamage match the SRD cell`, () => {
      const def = packByName.get(normalize(w.name));
      expect(def, `pack is missing SRD weapon "${w.name}"`).toBeDefined();
      const weapon = def!;

      // (a) Data fidelity — parsed straight from the SRD cell.
      if (w.dice !== undefined) {
        expect(weapon.damageDice, `${w.name} dice`).toBe(w.dice);
        expect(weapon.damageType, `${w.name} type`).toBe(w.damageType);
      }
      expect(weapon.versatileDice, `${w.name} versatile`).toBe(w.versatileDice);
      expect([...weapon.properties].sort(), `${w.name} properties`).toEqual([...w.properties].sort());
      expect(weapon.mastery, `${w.name} mastery`).toBe(w.mastery);

      // (b) Derivation — plain melee weapons resolve to STR. A STR-18
      // fighter (DEX 10) keeps STR the chosen ability for both plain and
      // finesse melee, so the modifier is unambiguous; skip ranged here
      // (DEX-driven, exercised by the slice-414 unit tests).
      if (w.dice !== undefined && weapon.attackKind === 'melee') {
        const instance = makeItemInstance(weapon.id);
        const character = buildFighter({ STR: 18, DEX: 10, level: 5, inventory: [instance.id] });
        const input = { character, itemInstances: { [instance.id]: instance }, content, weaponInstanceId: instance.id };
        const strMod = abilityModifier(18);
        expect(computeWeaponDamage(input).damage, `${w.name} damage line`).toEqual({
          dice: w.dice,
          modifier: strMod,
          type: w.damageType,
        });
        expect(computeAttackBonus(input).total, `${w.name} to-hit`).toBe(strMod + proficiencyBonus(5));
      }
    });
  }
});
