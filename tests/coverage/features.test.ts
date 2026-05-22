// Layer 8 (feature-coverage matrix, per the testing standard in
// CLAUDE.md). Enumerates the 5.5e features in the starter content
// pack and asserts which ones ship "wired" (effects-bearing).
//
// Slice 126 narrowed each per-id catalog snapshot to wired entries
// only. Pure stub additions (a feature / condition / feat / magic
// item with `effects: []` and no other engine consumption) no
// longer trip the snapshot — they're content authoring, not
// engineering work, and the JSON diff in the PR is already the
// audit trail.
//
// What the snapshots catch:
//   - A wired entry disappeared (removed or renamed)
//   - A previously-stub entry became wired (engineering wired a
//     new mechanic that deserves review)
//   - A previously-wired entry became stub (engineering removed a
//     wire — sometimes legitimate, always worth surfacing)
//
// What the snapshots intentionally do NOT catch:
//   - Pure stub additions (new content with effects: [])
//   - Pure stub removals (rarely a regression; the PR diff catches
//     it if it is)
//
// One nuance: planner-driven conditions (mirror-image-active, ones
// where the engine handles the mechanic in code rather than via
// the effects array) ship with `effects: []` and therefore classify
// as "stub" here. That's intentional — those wires are exercised
// by the planner's own dedicated tests; this snapshot doesn't
// duplicate the audit.
//
// `npx vitest -u tests/coverage/features.test.ts` to accept
// intentional changes.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { loadPhbExtrasTestPack } from '../fixtures/index.js';
import { resolveContent } from '../../src/content/pack.js';
import { WEAPON_MASTERIES } from '../../src/schemas/primitives.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const isWired = (effectsCount: number): boolean => effectsCount > 0;

interface ClassFeatureRow {
  readonly classId: string;
  readonly level: number;
  readonly featureId: string;
  readonly wired: boolean;
}

const buildClassFeatureMatrix = (): ClassFeatureRow[] => {
  const rows: ClassFeatureRow[] = [];
  for (const cls of PACK.classes) {
    const tbl = cls.levelTable as Record<string, { features?: Array<{ id: string; effects?: unknown[] }> }>;
    for (const [lvlStr, entry] of Object.entries(tbl)) {
      const level = Number.parseInt(lvlStr, 10);
      for (const feature of entry.features ?? []) {
        rows.push({
          classId: cls.id,
          level,
          featureId: feature.id,
          wired: isWired((feature.effects ?? []).length),
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      a.classId.localeCompare(b.classId) ||
      a.level - b.level ||
      a.featureId.localeCompare(b.featureId),
  );
};

describe('feature-coverage matrix: class features', () => {
  const matrix = buildClassFeatureMatrix();

  it('wired class features catalog is stable', () => {
    const wired = matrix
      .filter((r) => r.wired)
      .map((r) => `${r.classId} L${r.level} ${r.featureId}`);
    expect(wired).toMatchSnapshot();
  });

  it('Rogue Sneak Attack scales: a class-feature entry exists at every odd Rogue level', () => {
    // Sneak Attack is the one class feature that's fully wired
    // across the table. If a regression drops some odd-level entries,
    // this fails loudly.
    const sneakLevels = matrix
      .filter((r) => r.classId === 'rogue' && r.featureId === 'sneak-attack')
      .map((r) => r.level)
      .sort((a, b) => a - b);
    expect(sneakLevels).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  });
});

describe('feature-coverage matrix: subclasses', () => {
  it('one subclass per class ships (12 of 12 classes covered)', () => {
    const parentClassIds = new Set(PACK.subclasses.map((s) => s.parentClassId));
    const classIds = PACK.classes.map((c) => c.id).sort();
    for (const cid of classIds) {
      expect(parentClassIds.has(cid), `No subclass ships for class ${cid}`).toBe(true);
    }
    expect(PACK.subclasses.length).toBeGreaterThanOrEqual(12);
  });

  it('every subclass has an L3 grant (the 2024 subclass-choice level)', () => {
    for (const sub of PACK.subclasses) {
      const l3 = (sub.levelGrants as Record<string, unknown[]>)['3'];
      expect(l3, `Subclass ${sub.id} missing L3 grants`).toBeDefined();
      expect(Array.isArray(l3) && l3.length > 0, `Subclass ${sub.id} L3 is empty`).toBe(true);
    }
  });

  it('wired subclass features catalog is stable', () => {
    const rows: Array<{ subclass: string; level: number; featureId: string }> = [];
    for (const sub of PACK.subclasses) {
      const tbl = sub.levelGrants as Record<string, Array<{ id: string; effects?: unknown[] }>>;
      for (const [lvlStr, features] of Object.entries(tbl)) {
        const level = Number.parseInt(lvlStr, 10);
        for (const f of features) {
          if (!isWired((f.effects ?? []).length)) continue;
          rows.push({ subclass: sub.id, level, featureId: f.id });
        }
      }
    }
    rows.sort(
      (a, b) =>
        a.subclass.localeCompare(b.subclass) ||
        a.level - b.level ||
        a.featureId.localeCompare(b.featureId),
    );
    expect(rows.map((r) => `${r.subclass} L${r.level} ${r.featureId}`)).toMatchSnapshot();
  });
});

describe('feature-coverage matrix: weapon masteries', () => {
  it('every PHB-2024 mastery has at least one weapon in the starter pack', () => {
    const weapons = [...CONTENT.items.values()].filter((i) => i.itemKind === 'weapon');
    const masteryToWeapons = new Map<string, string[]>();
    for (const w of weapons) {
      if (w.itemKind !== 'weapon' || w.mastery === undefined) continue;
      const list = masteryToWeapons.get(w.mastery) ?? [];
      list.push(w.id);
      masteryToWeapons.set(w.mastery, list);
    }
    const missing: string[] = [];
    for (const m of WEAPON_MASTERIES) {
      if ((masteryToWeapons.get(m) ?? []).length === 0) missing.push(m);
    }
    // Flex is the engine's 9th-mastery extension; the starter pack
    // doesn't ship a Flex weapon (Greg's design choice — versatile
    // weapons map to their PHB masteries like Sap / Push / Topple).
    // The TEST_PACK adds a synthetic Flex weapon. We tolerate Flex
    // missing from the starter pack.
    expect(missing.filter((m) => m !== 'Flex')).toEqual([]);
    expect(masteryToWeapons.size).toBeGreaterThanOrEqual(8);
  });

  it('mastery → weapon mapping is stable', () => {
    const weapons = [...CONTENT.items.values()].filter((i) => i.itemKind === 'weapon');
    const summary: Record<string, string[]> = {};
    for (const w of weapons) {
      if (w.itemKind !== 'weapon' || w.mastery === undefined) continue;
      summary[w.mastery] = (summary[w.mastery] ?? []).concat(w.id).sort();
    }
    expect(summary).toMatchSnapshot();
  });
});

describe('feature-coverage matrix: conditions', () => {
  it('wired conditions catalog is stable', () => {
    // Reads the starter pack + the non-SRD test fixture (the 6 spell
    // conditions the engine tests live there since slice 403, not in the
    // shipped pack): the matrix asserts the full tested capability.
    const wired = [...PACK.conditions, ...loadPhbExtrasTestPack().conditions]
      .filter((c) => isWired(c.effects.length))
      .map((c) => c.id)
      .sort();
    expect(wired).toMatchSnapshot();
  });

  it('PHB-2024 official 15 conditions are all present', () => {
    const PHB_15 = [
      'blinded',
      'charmed',
      'deafened',
      'exhaustion',
      'frightened',
      'grappled',
      'incapacitated',
      'invisible',
      'paralyzed',
      'petrified',
      'poisoned',
      'prone',
      'restrained',
      'stunned',
      'unconscious',
    ];
    const have = new Set(PACK.conditions.map((c) => c.id));
    for (const id of PHB_15) {
      expect(have.has(id), `Missing PHB condition: ${id}`).toBe(true);
    }
  });
});

describe('feature-coverage matrix: feats', () => {
  // Since slice 403 the engine ships SRD-only: the 18 SRD-derived feats
  // are in the starter pack, and the 2 PHB-2024 fighting styles the engine
  // tests (Dueling, Protection) live in the non-SRD test fixture. The
  // other PHB-2024 feats are user-supplied (content-packs/) and not
  // asserted here. Reads starter + fixture for the tested surface.
  const ALL_FEATS = [...PACK.feats, ...loadPhbExtrasTestPack().feats];

  it('wired feats catalog is stable', () => {
    const wired = ALL_FEATS
      .filter((f) => isWired((f.effects ?? []).length))
      .map((f) => `${f.category}:${f.id}`)
      .sort();
    expect(wired).toMatchSnapshot();
  });

  it('all six 2024 Fighting Styles ship as feats', () => {
    const styles = ALL_FEATS.filter((f) => f.category === 'fighting-style').map((f) => f.id).sort();
    expect(styles).toEqual([
      'fighting-style-archery',
      'fighting-style-defense',
      'fighting-style-dueling',
      'fighting-style-great-weapon',
      'fighting-style-protection',
      'fighting-style-two-weapon',
    ]);
  });

  it('the SRD epic boons ship', () => {
    // Since slice 403 the engine ships SRD-only: 7 SRD-derived epic boons
    // in the starter pack. The 3 PHB-2024 boons (Energy Resistance /
    // Fortitude / Skill) are user-supplied (content-packs/), not part of
    // the distributed product, so they aren't asserted here.
    const boons = ALL_FEATS.filter((f) => f.category === 'epic-boon').map((f) => f.id).sort();
    expect(boons.length).toBeGreaterThanOrEqual(7);
  });
});

describe('feature-coverage matrix: magic items', () => {
  it('magic-item wire and charge state is stable', () => {
    // Pure stub items (effects: [], onUse: [], no charges) don't
    // appear in either list, so content sessions can append wondrous
    // items freely without tripping the snapshot. A magic item gaining
    // mechanics (engineering wired effects or an onUse action) or
    // charges (or losing them) trips, which is the audit signal we
    // want. Slice 254: onUse wires (slices 240-243 + 253: Wings of
    // Flying, Boots of Speed, Boots of Levitation, Hat of Disguise,
    // Staff of Healing, Wand of Magic Missiles) now register in
    // wiredIds; previously the matrix only checked the `effects`
    // array and the activate-as-action cohort was invisible.
    const items = [...CONTENT.items.values()].filter((i) => i.itemKind === 'magic');
    const wiredIds = items
      .filter(
        (i) =>
          i.itemKind === 'magic' && ((i.effects ?? []).length > 0 || (i.onUse ?? []).length > 0),
      )
      .map((i) => i.id)
      .sort();
    const withChargesIds = items
      .filter((i) => i.itemKind === 'magic' && i.charges !== undefined)
      .map((i) => i.id)
      .sort();
    expect({ wiredIds, withChargesIds }).toMatchSnapshot();
  });
});
