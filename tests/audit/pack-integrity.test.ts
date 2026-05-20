// Pack-integrity audits (slice 303).
//
// Two repeatable checks promoted from ad-hoc pattern-check sweeps that
// surfaced real bugs in slices 298 + 301. The promotion path mirrors
// srd-drift (slice 195, from the slices 177-194 ad-hoc fixes) and
// doc-size (slice 285, from the slices 270/277 recurring archives):
// when a sweep is something a script can check repeatably, it belongs
// in tests/audit/ so CI catches regressions at commit time instead of
// relying on an agent remembering to sweep.
//
// 1. Duplicate pack entries (slice 298 found Stone of Good Luck shipped
//    twice — one wired, one empty stub — invisible to the SRD-drift
//    audit because the wired entry's name mismatched SRD canonical).
// 2. Orphan conditions (slice 301 found 6 dead 2014-era conditions with
//    effects but no spell / item / feature / planner applying them).
//
// Lesson encoded here (the slice-301 false-positive trap): a reference
// sweep must account for EVERY way a thing can be referenced. The
// slice-301 first pass walked only content-side `conditionId` refs and
// flagged planner-emitted + already-wired conditions as false orphans.
// This audit walks content refs AND the engine source AND explicitly
// allowlists conditions applied via runtime string interpolation
// (which a static substring scan cannot see). Under-walking references
// is the false-positive mirror of the "filter shape determines what a
// sweep can find" false-negative trap (CLAUDE.md, slices 264/268).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, '../../src');
const PACK_PATH = resolve(HERE, '../../src/content/packs/starter-pack.json');

interface Entry {
  readonly id: string;
  readonly name?: string;
  readonly effects?: ReadonlyArray<unknown>;
  readonly onUse?: ReadonlyArray<unknown>;
  readonly onConsume?: ReadonlyArray<unknown>;
  readonly charges?: unknown;
  readonly mechanicalEffects?: ReadonlyArray<unknown>;
  readonly dedicatedPlanner?: boolean;
}
interface Pack {
  items: Entry[];
  spells: Entry[];
  conditions: Entry[];
  monsters: Entry[];
}

const pack: Pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));

// Strip parenthetical qualifiers ("(Acid)", "(Luckstone)") so variant
// families and their alternate-name twins land in the same group.
const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const itemIsWired = (e: Entry): boolean =>
  (e.effects?.length ?? 0) > 0 ||
  (e.onUse?.length ?? 0) > 0 ||
  (e.onConsume?.length ?? 0) > 0 ||
  e.charges !== undefined;

const conditionIsWired = (e: Entry): boolean => (e.effects?.length ?? 0) > 0;

describe('pack integrity: no duplicate ids within a category', () => {
  // Ids are looked up per category, so a spell `shield` and an armor
  // item `shield` legitimately coexist. The invariant is per-category
  // uniqueness, not global.
  for (const [category, list] of [
    ['items', pack.items],
    ['spells', pack.spells],
    ['conditions', pack.conditions],
    ['monsters', pack.monsters],
  ] as const) {
    it(`${category} have unique ids`, () => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const e of list) {
        if (seen.has(e.id)) dupes.push(e.id);
        seen.add(e.id);
      }
      expect(dupes).toEqual([]);
    });
  }
});

describe('pack integrity: no wired/empty duplicate within a name group', () => {
  // The Stone of Good Luck signature (slice 298): two entries sharing
  // a normalized name, one wired and one an empty stub. Intentional
  // variant families (Armor/Ring/Potion of Resistance, Greatclub /
  // Ogre Greatclub, absorb-elements-charged-*) are internally
  // consistent: every member is wired, or every member is empty. A
  // wired/empty MIX inside one group is the accidental-duplicate tell.
  const check = (
    list: Entry[],
    wired: (e: Entry) => boolean,
    label: string,
  ): void => {
    it(`${label}: no name group mixes wired and empty entries`, () => {
      const groups = new Map<string, Entry[]>();
      for (const e of list) {
        if (e.name === undefined) continue;
        const key = normalizeName(e.name);
        const bucket = groups.get(key) ?? [];
        bucket.push(e);
        groups.set(key, bucket);
      }
      const offenders: string[] = [];
      for (const [key, entries] of groups) {
        if (entries.length < 2) continue;
        const wiredCount = entries.filter(wired).length;
        if (wiredCount > 0 && wiredCount < entries.length) {
          offenders.push(
            `${key}: ${wiredCount}/${entries.length} wired (${entries.map((e) => e.id).join(', ')})`,
          );
        }
      }
      expect(offenders).toEqual([]);
    });
  };
  check(pack.items, itemIsWired, 'items');
  check(pack.conditions, conditionIsWired, 'conditions');
});

describe('pack integrity: conditions with effects are reachable', () => {
  // A condition that carries effects but is never applied by any
  // spell, item, feature, or planner is dead weight. This audit walks
  // BOTH content refs and the engine source. Two allowlists encode
  // the two legitimate "unreferenced by a static scan" cases.

  // Dead 2014-era conditions: no SRD 5.2.1 spell carrier exists. These
  // SHOULD eventually be removed (tracked in starter-pack-gaps.md). If
  // a future slice wires one (adds the spell), drop it from this list;
  // if a cleanup slice removes the condition, drop it too. Either way
  // this test guides the edit.
  const KNOWN_DEAD_ORPHANS: ReadonlySet<string> = new Set([
    'wrathful-smite-active',
    'thunderous-smite-active',
    'branding-smite-active',
    'holy-weapon-active',
    'invulnerable-active',
    'earthbound-active',
  ]);

  // Applied at runtime via string interpolation, so a static source
  // scan cannot see the literal id. `planAbsorbElements` builds
  // `absorb-elements-charged-${damageType}-active` (reactive-spells.ts).
  // These are correctly wired — the allowlist documents why the scan
  // misses them. This is the slice-301 false-positive lesson made
  // durable: the orphan sweep there wrongly flagged dynamically-applied
  // conditions because it didn't account for interpolated ids.
  const DYNAMICALLY_APPLIED: ReadonlySet<string> = new Set([
    'absorb-elements-charged-acid-active',
    'absorb-elements-charged-cold-active',
    'absorb-elements-charged-fire-active',
    'absorb-elements-charged-lightning-active',
    'absorb-elements-charged-thunder-active',
  ]);

  const collectTsFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collectTsFiles(p));
      else if (entry.name.endsWith('.ts')) out.push(p);
    }
    return out;
  };

  const collectReferencedIds = (): Set<string> => {
    const referenced = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const v of node) walk(v);
        return;
      }
      if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (
            (k === 'conditionId' ||
              k === 'allyConditionId' ||
              k === 'conditionOnFail' ||
              k === 'bearerConditionId') &&
            typeof v === 'string'
          ) {
            referenced.add(v);
          }
          walk(v);
        }
      }
    };
    walk(pack);
    return referenced;
  };

  it('every condition with effects is applied somewhere (content, planner, or allowlisted)', () => {
    const referenced = collectReferencedIds();
    const sourceBlob = collectTsFiles(SRC_DIR)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const isReachable = (id: string): boolean =>
      referenced.has(id) ||
      sourceBlob.includes(id) ||
      DYNAMICALLY_APPLIED.has(id) ||
      KNOWN_DEAD_ORPHANS.has(id);

    const unexpectedOrphans = pack.conditions
      .filter(conditionIsWired)
      .map((c) => c.id)
      .filter((id) => !isReachable(id));

    expect(unexpectedOrphans).toEqual([]);
  });

  it('the known-dead-orphans allowlist stays accurate (no entry has become reachable)', () => {
    const referenced = collectReferencedIds();
    const sourceBlob = collectTsFiles(SRC_DIR)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    // If a dead orphan becomes referenced (a future slice wired its
    // spell) or stops existing (a cleanup slice removed it), it should
    // leave this list. Flag stale allowlist entries so the list can't
    // silently rot.
    const conditionIds = new Set(pack.conditions.map((c) => c.id));
    const stale: string[] = [];
    for (const id of KNOWN_DEAD_ORPHANS) {
      const stillExists = conditionIds.has(id);
      const nowReferenced = referenced.has(id) || sourceBlob.includes(id);
      if (!stillExists || nowReferenced) stale.push(id);
    }
    expect(stale).toEqual([]);
  });
});
