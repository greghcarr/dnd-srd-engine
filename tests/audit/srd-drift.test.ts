// SRD 5.2.1 drift audit.
//
// Compares the wired content pack against the canonical SRD 5.2.1
// markdown clone at references/srd-markdown/ (gitignored, per-worktree).
// Each it() block asserts a single field across the pack matches SRD;
// failure surfaces drift that needs a content fix (or, occasionally, a
// schema-modeling decision).
//
// If references/srd-markdown/ is absent (fresh worktree without the
// clone symlinked from the primary), every audit skips with a clear
// note. The fixes that drove these checks live in slice 177-194's
// CHANGELOG entries.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRD_DIR = resolve(HERE, '../../references/srd-markdown');
const SPELLS_MD = resolve(SRD_DIR, 'spells.md');
const MONSTERS_MD = resolve(SRD_DIR, 'monsters-A-Z.md');
const ITEMS_MD = resolve(SRD_DIR, 'magic-items.md');
const CLASSES_MD = resolve(SRD_DIR, 'classes.md');
const PACK_PATH = resolve(HERE, '../../src/content/packs/starter-pack.json');

const SRD_AVAILABLE = existsSync(SPELLS_MD);

interface PackClass {
  id: string;
  levelTable: Record<string, { proficiencyBonus?: number; features?: Array<{ name: string }> }>;
}
interface Pack {
  spells: Array<Record<string, unknown>>;
  monsters: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  classes: PackClass[];
}
const pack: Pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));

// ----- SRD parsers ---------------------------------------------------

interface SrdSpell {
  name: string;
  level: number;
  school: string;
  classes: string[];
  castingTime: string;
  range: string;
  duration: string;
  components: { verbal: boolean; somatic: boolean; material: boolean };
  concentration: boolean;
  ritual: boolean;
  body: string;
}

const SCHOOL_PATTERN = /^_(?:Level (\d+)\s+(\w+)|(\w+) Cantrip)\s+\(([^)]+)\)_$/m;

function parseSrdSpells(): Map<string, SrdSpell> {
  const text = readFileSync(SPELLS_MD, 'utf8');
  const blocks = text.split('\n#### ').slice(1);
  const out = new Map<string, SrdSpell>();
  for (const b of blocks) {
    const lines = b.split('\n');
    const name = lines[0]!.trim();
    const headerBlock = lines.slice(0, 12).join('\n');
    const typeMatch = SCHOOL_PATTERN.exec(headerBlock);
    if (!typeMatch) continue;
    const level = typeMatch[1] !== undefined ? Number.parseInt(typeMatch[1], 10) : 0;
    const school = (typeMatch[2] ?? typeMatch[3] ?? '').toLowerCase();
    const classes = (typeMatch[4] ?? '')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .sort();
    const castingTime = /\*\*Casting Time:\*\*\s*(.+)/.exec(headerBlock)?.[1]?.trim() ?? '';
    const range = /\*\*Range:\*\*\s*(.+)/.exec(headerBlock)?.[1]?.trim() ?? '';
    const duration = /\*\*Duration:\*\*\s*(.+)/.exec(headerBlock)?.[1]?.trim() ?? '';
    const compStr = /\*\*Components?:\*\*\s*(.+)/.exec(headerBlock)?.[1] ?? '';
    const components = {
      verbal: /\bV\b/.test(compStr),
      somatic: /\bS\b/.test(compStr),
      material: /\bM\b/.test(compStr),
    };
    const concentration = /concentration/i.test(duration);
    const ritual = /ritual/i.test(castingTime);
    out.set(name, {
      name,
      level,
      school,
      classes,
      castingTime,
      range,
      duration,
      components,
      concentration,
      ritual,
      body: b,
    });
  }
  return out;
}

// The 15 RAW conditions and the 13 damage types, used to classify the
// tokens in a monster's `**Immunities**` / `**Resistances**` lines.
// Word-boundary matching distinguishes "Poison" (damage) from "Poisoned"
// (condition) and tolerates parenthetical qualifiers ("Charmed (except
// from its vampire master)").
const RAW_CONDITION_NAMES = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone',
  'restrained', 'stunned', 'unconscious',
] as const;
const DAMAGE_TYPE_NAMES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
] as const;
const wordBoundaryMatches = (text: string, vocab: readonly string[]): Set<string> =>
  new Set(vocab.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(text)));
const setEq = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x));

interface SrdMonster {
  name: string;
  ac: number;
  hp: number;
  cr: string;
  abilities: Record<string, number>;
  // Slice 374: secondary defensive fields. Parsed from the merged 2024
  // `**Immunities**` line (damage types before the `;`, conditions after)
  // and the `**Resistances**` / `**Speed**` lines.
  conditionImmunities: Set<string>;
  damageImmunities: Set<string>;
  damageResistances: Set<string>;
  walkSpeed: number; // NaN when the statblock has no walk Speed (fly/swim-only)
}

function parseSrdMonsters(): Map<string, SrdMonster> {
  const text = readFileSync(MONSTERS_MD, 'utf8');
  const blocks = text.split('\n### ').slice(1);
  const out = new Map<string, SrdMonster>();
  for (const b of blocks) {
    const lines = b.split('\n');
    const name = lines[0]!.trim();
    const headerBlock = lines.slice(0, 150).join('\n');
    const ac = Number.parseInt(/\*\*AC\*\*\s*(\d+)/.exec(headerBlock)?.[1] ?? '', 10);
    const hp = Number.parseInt(/\*\*HP\*\*\s*(\d+)/.exec(headerBlock)?.[1] ?? '', 10);
    const cr = /\*\*CR\*\*\s*([\d/]+)/.exec(headerBlock)?.[1] ?? '';
    const abilities: Record<string, number> = {};
    const abRe = /<td><strong>(STR|DEX|CON|INT|WIS|CHA)<\/strong><\/td>\s*<td>(\d+)<\/td>/g;
    for (let m = abRe.exec(headerBlock); m !== null; m = abRe.exec(headerBlock)) {
      abilities[m[1]!] = Number.parseInt(m[2]!, 10);
    }
    const immLine = (/\*\*Immunities\*\*\s*(.+)/.exec(headerBlock)?.[1] ?? '').split('<br>')[0] ?? '';
    const resLine = (/\*\*Resistances\*\*\s*(.+)/.exec(headerBlock)?.[1] ?? '').split('<br>')[0] ?? '';
    const speedLine = (/\*\*Speed\*\*\s*(.+)/.exec(headerBlock)?.[1] ?? '').split('<br>')[0] ?? '';
    const conditionImmunities = wordBoundaryMatches(immLine, RAW_CONDITION_NAMES);
    const damageImmunities = wordBoundaryMatches(immLine, DAMAGE_TYPE_NAMES);
    const damageResistances = wordBoundaryMatches(resLine, DAMAGE_TYPE_NAMES);
    const walkSpeed = Number.parseInt(/^\s*(\d+)\s*ft/.exec(speedLine)?.[1] ?? '', 10);
    if (!Number.isNaN(ac)) {
      out.set(name, {
        name, ac, hp, cr, abilities,
        conditionImmunities, damageImmunities, damageResistances, walkSpeed,
      });
    }
  }
  return out;
}

interface SrdItem {
  name: string;
  rarity: string | null;
  requiresAttunement: boolean;
  // The item-type word(s) before the first comma in the SRD spec line,
  // lowercased: "potion", "wondrous item", "ring", "armor (plate)",
  // "weapon (any)", etc. Used by the itemKind-categorization check.
  type: string;
}

function parseSrdItems(): Map<string, SrdItem> {
  const text = readFileSync(ITEMS_MD, 'utf8');
  const blocks = text.split('\n#### ').slice(1);
  const out = new Map<string, SrdItem>();
  for (const b of blocks) {
    const lines = b.split('\n');
    const name = lines[0]!.trim();
    const headerBlock = lines.slice(0, 5).join('\n');
    const spec = /^_([^_]+)_$/m.exec(headerBlock)?.[1];
    if (!spec) continue;
    const rarities = /(common|uncommon|rare|very rare|legendary|artifact)/gi;
    const firstRarity = rarities.exec(spec)?.[1]?.toLowerCase().replace(/\s+/g, '-') ?? null;
    const requiresAttunement = /requires attunement/i.test(spec);
    const type = (spec.split(',')[0] ?? '').trim().toLowerCase();
    out.set(name, { name, rarity: firstRarity, requiresAttunement, type });
  }
  return out;
}

// ----- Utilities -----------------------------------------------------

function crToNum(c: unknown): number {
  if (typeof c === 'number') return c;
  if (typeof c !== 'string') return Number.NaN;
  if (c.includes('/')) {
    const [a, b] = c.split('/').map(Number);
    return (a ?? Number.NaN) / (b ?? Number.NaN);
  }
  return Number(c);
}

function asStr(v: unknown): string {
  return v === undefined || v === null ? '<unset>' : String(v);
}

// ----- SRD class-feature-table parser (slice 377) --------------------
//
// Each class's progression lives in a `**<Class> Features**` HTML table
// in classes.md, with columns Level / Proficiency Bonus / Class Features
// (plus class-specific numeric columns the pack does not model). This
// parser reads the two script-detectable columns: the Proficiency Bonus
// and the comma-separated feature names per level. The numeric columns
// (Rages, Sneak Attack, spell slots, etc.) and the per-feature numeric
// values that live in body prose (e.g. Roving's "+10 feet") are NOT
// table-parseable against the pack's milestone-compressed wiring, so the
// audit deliberately covers only PB and feature presence/placement.

interface SrdClassLevel {
  pb: number;
  feats: string[];
}
const CLASS_NAMES = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
] as const;

function parseSrdClassTables(): Map<string, Map<number, SrdClassLevel>> {
  const text = readFileSync(CLASSES_MD, 'utf8');
  const out = new Map<string, Map<number, SrdClassLevel>>();
  for (const name of CLASS_NAMES) {
    const marker = `**${name} Features**`;
    const start = text.indexOf(marker);
    if (start < 0) continue;
    const tStart = text.indexOf('<table>', start);
    const tEnd = text.indexOf('</table>', tStart);
    const table = text.slice(tStart, tEnd);
    const byLevel = new Map<number, SrdClassLevel>();
    for (const tr of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...(tr[1] ?? '').matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => (m[1] ?? '').trim());
      if (cells.length < 3) continue; // header row has <th>, not <td>
      const level = Number.parseInt(cells[0] ?? '', 10);
      if (!Number.isFinite(level)) continue;
      const pb = Number.parseInt((cells[1] ?? '').replace('+', ''), 10);
      const feats = (cells[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      byLevel.set(level, { pb, feats });
    }
    out.set(name.toLowerCase(), byLevel);
  }
  return out;
}

// Normalize a feature name for comparison: lowercase, drop parenthetical
// qualifiers ("(two uses)", "(Mighty Roar)"), strip punctuation, collapse
// whitespace. A pack feature matches an SRD feature when it equals the
// normalized SRD name or extends it with trailing words (the pack appends
// recharge / count suffixes: "Indomitable (2/long rest)", "Mystic Arcanum
// 6th level", "Eldritch Invocations 2 known").
const normFeature = (s: string): string =>
  s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// SRD rows the pack models structurally rather than as a named feature
// row, so their absence from levelTable is correct, not drift:
//   - the em-dash placeholder marks a level whose only change is a
//     numeric column (spell slots, etc.), not a new feature;
//   - ASI / Epic Boon are feat-choice rows the feat system handles;
//   - Spellcasting / Pact Magic are wired by the spell-slot derivation;
//   - any "* Subclass" / "Subclass feature" marker is handled by
//     subclassLevel + the subclass content.
const STRUCTURAL_ROWS = new Set([
  'ability score improvement', 'epic boon', 'spellcasting', 'pact magic',
].map(normFeature));
const isStructuralRow = (norm: string): boolean =>
  norm === '' || norm === '-' || STRUCTURAL_ROWS.has(norm) || /subclass/.test(norm);

// SRD wording that the pack legitimately renames. Maps the normalized
// SRD name to the normalized pack feature it should match.
const FEATURE_ALIASES: Record<string, string> = {
  'two extra attacks': 'extra attack',
  'three extra attacks': 'extra attack',
};

// Genuine content gaps the audit surfaces, tracked in
// docs/gaps-class-features.md until a content slice closes them. Keyed
// `<classId> L<level> <normalized feature>`. Slice 378 closed the three
// Weapon Mastery gaps (Barbarian / Fighter / Paladin L1); slice 379
// closed Monk L10 Heightened Focus (the feature row; its two engine-
// modelable arms were already live in the Flurry of Blows / Patient
// Defense planners). The allowlist is now empty: every SRD-listed
// feature is present in the pack. Add an entry here only when a genuine
// gap is found and consciously deferred; the stale-allowlist self-check
// then forces it to be removed once the feature lands.
const KNOWN_FEATURE_GAPS = new Set<string>([]);

// Lazy-parse SRD at module scope, guarded on SRD_AVAILABLE. The
// describe() callbacks below are evaluated at test-discovery time
// even when their .runIf gate is false (the gate only skips the
// inner it() blocks). Parsing inside the describe body therefore
// would attempt to readFileSync the SRD markdown on every CI run,
// which fails on environments without the gitignored clone.
const srdSpells = SRD_AVAILABLE ? parseSrdSpells() : new Map<string, SrdSpell>();
const srdMonsters = SRD_AVAILABLE ? parseSrdMonsters() : new Map<string, SrdMonster>();
const srdItems = SRD_AVAILABLE ? parseSrdItems() : new Map<string, SrdItem>();
const srdClasses = SRD_AVAILABLE
  ? parseSrdClassTables()
  : new Map<string, Map<number, SrdClassLevel>>();

// ----- Tests ---------------------------------------------------------

describe.runIf(SRD_AVAILABLE)('SRD 5.2.1 drift audit', () => {
  describe('spells', () => {
    const srd = srdSpells;

    it('school matches SRD', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        if (sp.school !== s.school) {
          drift.push(`${sp.id as string}: pack=${asStr(sp.school)} SRD=${s.school}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('level matches SRD', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        if (sp.level !== s.level) {
          drift.push(`${sp.id as string}: pack=${asStr(sp.level)} SRD=${s.level}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('class list matches SRD', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        const packClasses = ((sp.classes as string[] | undefined) ?? [])
          .map((c) => c.toLowerCase())
          .sort();
        if (JSON.stringify(packClasses) !== JSON.stringify(s.classes)) {
          drift.push(`${sp.id as string}: pack=${JSON.stringify(packClasses)} SRD=${JSON.stringify(s.classes)}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('V/S/M component presence matches SRD', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        const pc = (sp.components ?? {}) as Record<string, unknown>;
        const packComp = { verbal: !!pc.verbal, somatic: !!pc.somatic, material: !!pc.material };
        if (JSON.stringify(packComp) !== JSON.stringify(s.components)) {
          drift.push(`${sp.id as string}: pack=${JSON.stringify(packComp)} SRD=${JSON.stringify(s.components)}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('concentration flag matches SRD Duration line', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        const packConc = !!sp.concentration;
        if (packConc !== s.concentration) {
          drift.push(`${sp.id as string}: pack=${packConc} SRD=${s.concentration} (SRD duration: ${s.duration})`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('ritual flag matches SRD Casting Time line', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        const packRit = !!sp.ritual;
        if (packRit !== s.ritual) {
          drift.push(`${sp.id as string}: pack=${packRit} SRD=${s.ritual}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('halfOnSuccess flag matches SRD body text for damage-save spells', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        const effects = (sp.mechanicalEffects as Array<Record<string, unknown>> | undefined) ?? [];
        for (const me of effects) {
          if (me.kind !== 'save') continue;
          if (!me.damageDice) continue;
          if (typeof me.halfOnSuccess !== 'boolean') continue;
          const srdHalf = /half (?:as much|the damage|the initial damage|damage on a successful)/i.test(s.body);
          if (me.halfOnSuccess !== srdHalf) {
            drift.push(`${sp.id as string}: pack=${me.halfOnSuccess} SRD=${srdHalf}`);
          }
        }
      }
      expect(drift).toEqual([]);
    });

    it('save spells attack-kind is not set (sanity); attack spells have attackKind', () => {
      const drift: string[] = [];
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        const effects = (sp.mechanicalEffects as Array<Record<string, unknown>> | undefined) ?? [];
        for (const me of effects) {
          if (me.kind !== 'attack') continue;
          if (typeof me.attackKind !== 'string' || me.attackKind === '') {
            // SRD body should specify melee/ranged
            const isRanged = /ranged spell attack/i.test(s.body);
            const isMelee = /melee spell attack/i.test(s.body);
            if (isRanged || isMelee) {
              drift.push(`${sp.id as string}: missing attackKind; SRD wants ${isRanged ? 'ranged' : 'melee'}`);
            }
          }
        }
      }
      expect(drift).toEqual([]);
    });

    it('damage dice (top-level + onFailure) match SRD body', () => {
      const drift: string[] = [];
      const dieRe = /\b(\d+d\d+)\s+(?:Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder)\s+damage/i;
      for (const sp of pack.spells) {
        const s = srd.get(sp.name as string);
        if (!s) continue;
        const effects = (sp.mechanicalEffects as Array<Record<string, unknown>> | undefined) ?? [];
        for (const me of effects) {
          if (me.kind !== 'attack' && me.kind !== 'save') continue;
          const onFail = (me.onFailure as Record<string, unknown> | undefined) ?? {};
          const packDice = (me.damageDice as string | undefined) ?? (onFail.damageDice as string | undefined);
          if (!packDice) continue;
          const m = dieRe.exec(s.body);
          if (!m) continue;
          if (packDice.toLowerCase() !== m[1]!.toLowerCase()) {
            drift.push(`${sp.id as string}: pack=${packDice} SRD=${m[1]}`);
          }
        }
      }
      expect(drift).toEqual([]);
    });
  });

  describe('monsters', () => {
    const srd = srdMonsters;

    it('AC matches SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s) continue;
        if (m.ac !== s.ac) drift.push(`${m.id as string}: pack=${asStr(m.ac)} SRD=${s.ac}`);
      }
      expect(drift).toEqual([]);
    });

    it('HP average matches SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s || !s.hp) continue;
        const packHp = (m.hp as Record<string, unknown> | undefined)?.average;
        if (packHp !== s.hp) drift.push(`${m.id as string}: pack=${asStr(packHp)} SRD=${s.hp}`);
      }
      expect(drift).toEqual([]);
    });

    it('CR matches SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s || !s.cr) continue;
        const packCr = crToNum(m.cr);
        const srdCr = crToNum(s.cr);
        if (Math.abs(packCr - srdCr) > 0.001) {
          drift.push(`${m.id as string}: pack=${asStr(m.cr)} SRD=${s.cr}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('ability scores match SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s) continue;
        const packAbs = (m.abilityScores as Record<string, number> | undefined) ?? {};
        for (const ab of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
          const srdV = s.abilities[ab];
          if (srdV === undefined) continue;
          const packV = packAbs[ab];
          if (packV !== srdV) drift.push(`${m.id as string}.${ab}: pack=${asStr(packV)} SRD=${srdV}`);
        }
      }
      expect(drift).toEqual([]);
    });

    // Slice 374: secondary defensive fields. srd-drift previously checked
    // only AC / HP / CR / abilities, so the ~100 monsters added in batches
    // 5.x after the one-time slice-154-163 secondary-field audit were
    // unguarded on these. All four read clean today.
    it('condition immunities match SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s) continue;
        const pack_ci = new Set(((m.conditionImmunities as string[] | undefined) ?? []).map((c) => c.toLowerCase()));
        if (!setEq(pack_ci, s.conditionImmunities)) {
          drift.push(`${m.id as string}: pack=${JSON.stringify([...pack_ci].sort())} SRD=${JSON.stringify([...s.conditionImmunities].sort())}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('damage immunities match SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s) continue;
        const pack_di = new Set(((m.damageImmunities as string[] | undefined) ?? []).map((c) => c.toLowerCase()));
        if (!setEq(pack_di, s.damageImmunities)) {
          drift.push(`${m.id as string}: pack=${JSON.stringify([...pack_di].sort())} SRD=${JSON.stringify([...s.damageImmunities].sort())}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('damage resistances match SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s) continue;
        const pack_dr = new Set(((m.damageResistances as string[] | undefined) ?? []).map((c) => c.toLowerCase()));
        if (!setEq(pack_dr, s.damageResistances)) {
          drift.push(`${m.id as string}: pack=${JSON.stringify([...pack_dr].sort())} SRD=${JSON.stringify([...s.damageResistances].sort())}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('walk speed matches SRD', () => {
      const drift: string[] = [];
      for (const m of pack.monsters) {
        const s = srd.get(m.name as string);
        if (!s || Number.isNaN(s.walkSpeed)) continue; // skip fly/swim-only statblocks
        const packWalk = (m.speed as Record<string, unknown> | undefined)?.walk;
        if (typeof packWalk !== 'number') continue;
        if (packWalk !== s.walkSpeed) drift.push(`${m.id as string}: pack=${asStr(packWalk)} SRD=${s.walkSpeed}`);
      }
      expect(drift).toEqual([]);
    });
  });

  describe('magic items', () => {
    const srd = srdItems;

    it('rarity matches SRD', () => {
      const drift: string[] = [];
      for (const it of pack.items) {
        if (it.itemKind !== 'magic' && it.itemKind !== 'armor' && it.itemKind !== 'weapon') continue;
        const s = srd.get(it.name as string);
        if (!s || !s.rarity) continue;
        if (it.rarity !== s.rarity) {
          drift.push(`${it.id as string}: pack=${asStr(it.rarity)} SRD=${s.rarity}`);
        }
      }
      expect(drift).toEqual([]);
    });

    it('attunement requirement matches SRD', () => {
      const drift: string[] = [];
      for (const it of pack.items) {
        if (it.itemKind !== 'magic' && it.itemKind !== 'armor' && it.itemKind !== 'weapon') continue;
        const s = srd.get(it.name as string);
        if (!s) continue;
        const packAttune = !!it.requiresAttunement;
        if (packAttune !== s.requiresAttunement) {
          drift.push(`${it.id as string}: pack=${packAttune} SRD=${s.requiresAttunement}`);
        }
      }
      expect(drift).toEqual([]);
    });

    // Slice 309. Categorization guard: an SRD item typed "Potion" is a
    // consumed-on-use item, so it must ship as `itemKind: 'consumable'`
    // (which carries `onConsume`), never as `itemKind: 'magic'` (which
    // carries only passive `effects` / `onUse` and cannot express
    // consumption). Slice 305 corrected three such items while wiring
    // them; the pattern-check was under-swept, so slice 309 found four
    // more (Oil of Etherealness, Philter of Love, Potion of
    // Clairvoyance, Potion of Longevity) and added this guard so the
    // mismatch can't regress. Scoped to the "potion" type only: the
    // dusts are RAW "Wondrous Item" (single-use but not Potion-typed),
    // so `magic` stays defensible for them.
    it('SRD Potion-typed items ship as itemKind consumable', () => {
      const offenders: string[] = [];
      for (const it of pack.items) {
        const s = srd.get(it.name as string);
        if (!s || s.type !== 'potion') continue;
        if (it.itemKind !== 'consumable') {
          offenders.push(`${it.id as string}: itemKind=${asStr(it.itemKind)} (SRD type: Potion -> expected consumable)`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  // Slice 377. The class progression tables drift the same way spell /
  // monster / item statblocks do: a feature can land at the wrong level
  // or go missing, and the Proficiency Bonus column can be mistyped.
  // These two columns are the script-detectable surface (see the parser
  // note above for why the numeric columns and prose values are not).
  describe('class features', () => {
    const srd = srdClasses;
    const packClass = (id: string): PackClass | undefined =>
      pack.classes.find((c) => c.id === id);

    it('parsed all 12 class tables with 20 levels each (guards against a vacuous-green reparse)', () => {
      expect(srd.size).toBe(CLASS_NAMES.length);
      for (const [classId, byLevel] of srd) {
        expect(byLevel.size, `${classId} should have 20 level rows`).toBe(20);
      }
    });

    it('Proficiency Bonus per level matches SRD for every class', () => {
      const drift: string[] = [];
      for (const [classId, byLevel] of srd) {
        const pc = packClass(classId);
        if (!pc) { drift.push(`${classId}: not in pack`); continue; }
        for (const [level, srdRow] of byLevel) {
          const packPb = pc.levelTable[String(level)]?.proficiencyBonus;
          if (packPb !== srdRow.pb) {
            drift.push(`${classId} L${level}: pack=${asStr(packPb)} SRD=${srdRow.pb}`);
          }
        }
      }
      expect(drift).toEqual([]);
    });

    it('every SRD-listed feature is present at its level in the pack', () => {
      const drift: string[] = [];
      for (const [classId, byLevel] of srd) {
        const pc = packClass(classId);
        if (!pc) { drift.push(`${classId}: not in pack`); continue; }
        for (const [level, srdRow] of byLevel) {
          const packNorms = (pc.levelTable[String(level)]?.features ?? []).map((f) => normFeature(f.name));
          for (const feat of srdRow.feats) {
            const nf = normFeature(feat);
            if (isStructuralRow(nf)) continue;
            if (KNOWN_FEATURE_GAPS.has(`${classId} L${level} ${nf}`)) continue;
            const alias = FEATURE_ALIASES[nf];
            const matches = (target: string): boolean =>
              packNorms.some((np) => np === target || np.startsWith(`${target} `));
            if (!matches(nf) && !(alias !== undefined && matches(alias))) {
              drift.push(`${classId} L${level}: "${feat}" not found [pack: ${packNorms.join(' | ') || '(none)'}]`);
            }
          }
        }
      }
      expect(drift).toEqual([]);
    });

    it('every tracked KNOWN_FEATURE_GAP is still genuinely absent (no stale allowlist entries)', () => {
      // If a follow-up slice wires one of the tracked gaps but forgets to
      // remove its allowlist entry, this catches the stale entry so the
      // allowlist can only shrink as gaps close.
      const stale: string[] = [];
      for (const key of KNOWN_FEATURE_GAPS) {
        const match = /^(\w+) L(\d+) (.+)$/.exec(key);
        if (!match) { stale.push(`${key}: malformed key`); continue; }
        const [, classId, levelStr, nf] = match;
        const pc = packClass(classId as string);
        const packNorms = (pc?.levelTable[String(levelStr)]?.features ?? []).map((f) => normFeature(f.name));
        if (packNorms.some((np) => np === nf || np.startsWith(`${nf} `))) {
          stale.push(`${key}: now present in pack, remove from KNOWN_FEATURE_GAPS`);
        }
      }
      expect(stale).toEqual([]);
    });
  });
});

// Compile-time hint when the SRD clone isn't present.
describe.skipIf(SRD_AVAILABLE)('SRD 5.2.1 drift audit', () => {
  it('skipped because references/srd-markdown/spells.md was not found', () => {
    expect(SRD_AVAILABLE).toBe(false);
  });
});
