// SRD Armor Class conformance (slice 421): a GROUND-TRUTH derivation check.
//
// The coverage ledger flags AC as 🟡 (probe-tested): implemented and
// unit-tested, but the expected values were author-asserted. This test
// upgrades AC to 🟢 by deriving every expected value from the SRD itself
// — it parses the Armor table out of references/srd-markdown/equipment.md
// and recomputes AC from the table cells, then asserts computeAC agrees.
// Because the base AC and the Dex-cap semantics both come from the SRD
// text (the cell reads "11 + Dex modifier", "14 + Dex modifier (max 2)",
// or a flat "16"), a misreading in the engine cannot pass: the engine is
// checked against the book, not against the author's memory.
//
// Skips (does not fail) when the SRD clone is absent, mirroring
// srd-drift. The clone is a gitignored per-worktree submodule.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAC } from '../../src/derive/ac.js';
import { resolveContent } from '../../src/content/pack.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { abilityModifier } from '../../src/derive/ability.js';
import { buildFighter, makeItemInstance } from '../fixtures/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EQUIPMENT_MD = resolve(HERE, '../../references/srd-markdown/equipment.md');
const SRD_AVAILABLE = existsSync(EQUIPMENT_MD);

// SRD unarmored AC, stated in the combat rules (not the Armor table):
// "Without armor, your base AC equals 10 plus your Dexterity modifier."
const SRD_UNARMORED_BASE = 10;

// Dexterity scores spanning negative / zero / capped / high modifiers,
// so the medium "max 2" cap, the heavy no-Dex rule, and negative mods
// are all exercised.
const DEX_SCORES = [6, 10, 14, 18, 20];

interface SrdArmorRow {
  readonly name: string;
  readonly base: number;
  // Expected Dex contribution to AC for a given Dex modifier, per the SRD
  // cell text. Heavy armor contributes none; medium caps at the parsed max.
  readonly dexContribution: (dexMod: number) => number;
}

interface ParsedTable {
  readonly armors: ReadonlyArray<SrdArmorRow>;
  readonly shieldBonus: number;
}

// Parse the Armor table out of equipment.md. Each row's AC cell encodes
// the rule directly, so no rule is transcribed from memory.
const parseArmorTable = (md: string): ParsedTable => {
  const start = md.indexOf('<th>Armor Class (AC)</th>');
  const end = md.indexOf('</table>', start);
  const region = md.slice(start, end);
  const armors: SrdArmorRow[] = [];
  let shieldBonus = 0;

  for (const rowChunk of region.split('<tr>')) {
    const cells = [...rowChunk.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1]!.trim());
    if (cells.length < 2) continue; // section-header rows have no <td>s
    const [name, ac] = [cells[0]!, cells[1]!];

    const cappedDex = /^(\d+) \+ Dex modifier \(max (\d+)\)$/.exec(ac);
    const fullDex = /^(\d+) \+ Dex modifier$/.exec(ac);
    const flat = /^(\d+)$/.exec(ac);
    const shield = /^\+(\d+)$/.exec(ac);

    if (cappedDex) {
      const base = Number(cappedDex[1]);
      const cap = Number(cappedDex[2]);
      armors.push({ name, base, dexContribution: (d) => Math.min(d, cap) });
    } else if (fullDex) {
      armors.push({ name, base: Number(fullDex[1]), dexContribution: (d) => d });
    } else if (flat) {
      armors.push({ name, base: Number(flat[1]), dexContribution: () => 0 });
    } else if (shield) {
      shieldBonus = Number(shield[1]);
    }
  }
  return { armors, shieldBonus };
};

// "Leather Armor" / "Studded Leather Armor" (SRD) vs "Leather Armor" /
// "Studded Leather" (pack): match on the name with a trailing " armor"
// dropped. Magic armors ("Dragon Scale Mail", "Armor of Invulnerability")
// normalize to distinct keys, so they don't shadow the base entries.
const normalize = (name: string): string => name.toLowerCase().replace(/\s+armor$/, '').trim();

describe.runIf(SRD_AVAILABLE)('SRD AC conformance (ground-truth, parsed from equipment.md)', () => {
  const content = resolveContent([loadStarterPack()]);
  const md = SRD_AVAILABLE ? readFileSync(EQUIPMENT_MD, 'utf8') : '';
  const { armors, shieldBonus } = parseArmorTable(md);

  const packArmorByName = new Map<string, string>(); // normalized name -> definition id
  for (const [id, def] of content.items) {
    if (def.itemKind === 'armor' && def.category !== 'shield' && def.acBonus === undefined) {
      packArmorByName.set(normalize(def.name), id);
    }
  }

  it('parses the full SRD armor table (sanity, not vacuous)', () => {
    // 13 base armors (3 light + 5 medium + 4 heavy ... SRD lists 12 + shield);
    // pin a floor so a parse regression can't make the suite silently green.
    expect(armors.length).toBeGreaterThanOrEqual(12);
    expect(shieldBonus).toBe(2);
  });

  // Each per-armor test asserts its own pack match, so a missing SRD
  // armor fails that armor's case (no separate coverage counter needed).
  for (const armor of armors) {
    it(`${armor.name}: computeAC matches base ${armor.base} + SRD Dex rule`, () => {
      const id = packArmorByName.get(normalize(armor.name));
      expect(id, `pack is missing SRD armor "${armor.name}"`).toBeDefined();
      for (const dex of DEX_SCORES) {
        const instance = makeItemInstance(id!);
        const character = buildFighter({ DEX: dex, armorInstanceId: instance.id });
        const ac = computeAC({ character, itemInstances: { [instance.id]: instance }, content });
        const expected = armor.base + armor.dexContribution(abilityModifier(dex));
        expect(ac.total, `${armor.name} @ DEX ${dex}`).toBe(expected);
      }
    });
  }

  it('a shield adds the SRD +2 over unarmored AC', () => {
    for (const dex of DEX_SCORES) {
      const shield = makeItemInstance('shield');
      const character = buildFighter({ DEX: dex, shieldInstanceId: shield.id });
      const ac = computeAC({ character, itemInstances: { [shield.id]: shield }, content });
      expect(ac.total, `shield @ DEX ${dex}`).toBe(SRD_UNARMORED_BASE + abilityModifier(dex) + shieldBonus);
    }
  });
});
