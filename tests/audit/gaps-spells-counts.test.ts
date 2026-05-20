// gaps-spells.md count audit.
//
// Promotes the slice-NNN doc-reconciliation sweep to a permanent
// guard. docs/gaps-spells.md is a human-readable per-level catalog
// of which pack spells are wired vs deferred vs narrative. Before
// this audit it had drifted badly: its per-level headers tracked the
// full PHB 2024 spell list (e.g. "L2: 63/63") while the pack ships
// SRD 5.2.1 + 12 non-SRD = 351, so it listed phantom non-SRD spells
// (Frostbite, Crown of Madness, Toll the Dead, ...) as if wired and
// understated the real wired count.
//
// This audit re-derives the per-level spell counts from the pack and
// asserts the doc's machine-readable headers match. It catches the
// exact drift class that prompted it: a spell added / removed from
// the pack without the catalog header being updated, or a phantom
// spell row inflating a count.
//
// What it does NOT verify: the wired / narrative / deferred *split*
// within a level (that requires the classifier in
// tests/unit/engine/spell-coverage.test.ts, the canonical per-spell
// source of truth). The audit checks the three invariants a count
// header must satisfy: pack-membership total (P), internal
// consistency (W + R + X === P), and the cross-level sum. Keep the
// coverage test's SPELL_EXPECTATIONS in sync for the split itself.
//
// Header format parsed (one per level, 0..9):
//   ## Level N (P in pack): W wired, R narrative, X deferred

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const DOC = resolve(REPO_ROOT, 'docs/gaps-spells.md');
const PACK = resolve(REPO_ROOT, 'src/content/packs/starter-pack.json');

const SPELL_LEVELS = 10; // L0 through L9

interface ParsedHeader {
  level: number;
  inPack: number;
  wired: number;
  narrative: number;
  deferred: number;
}

const readDoc = (): string | undefined => {
  try {
    return readFileSync(DOC, 'utf8');
  } catch {
    return undefined;
  }
};

const parseHeaders = (text: string): ParsedHeader[] => {
  const re =
    /^## Level (\d+) \((\d+) in pack\): (\d+) wired, (\d+) narrative, (\d+) deferred\s*$/gm;
  const out: ParsedHeader[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      level: Number(m[1]),
      inPack: Number(m[2]),
      wired: Number(m[3]),
      narrative: Number(m[4]),
      deferred: Number(m[5]),
    });
  }
  return out;
};

const packCountsByLevel = (): Map<number, number> => {
  const pack = JSON.parse(readFileSync(PACK, 'utf8')) as {
    spells: ReadonlyArray<{ level: number }>;
  };
  const counts = new Map<number, number>();
  for (const spell of pack.spells) {
    counts.set(spell.level, (counts.get(spell.level) ?? 0) + 1);
  }
  return counts;
};

describe('gaps-spells.md count audit: per-level headers match the pack', () => {
  const text = readDoc();

  // The catalog is part of the repo; if it's somehow absent, fail
  // loudly rather than passing vacuously.
  it('docs/gaps-spells.md exists', () => {
    expect(text, 'docs/gaps-spells.md not found').toBeDefined();
  });

  if (text === undefined) return;

  const headers = parseHeaders(text);
  const packCounts = packCountsByLevel();

  it('parses one header for each spell level (L0..L9)', () => {
    const levels = headers.map((h) => h.level).sort((a, b) => a - b);
    expect(
      levels,
      'expected exactly one "## Level N (P in pack): ..." header per level 0..9',
    ).toEqual(Array.from({ length: SPELL_LEVELS }, (_, i) => i));
  });

  for (let level = 0; level < SPELL_LEVELS; level += 1) {
    const header = headers.find((h) => h.level === level);
    if (header === undefined) continue; // covered by the parse test above

    it(`L${level}: "in pack" count matches the pack`, () => {
      expect(
        header.inPack,
        `L${level} header says ${header.inPack} in pack; pack has ${packCounts.get(level) ?? 0}`,
      ).toBe(packCounts.get(level) ?? 0);
    });

    it(`L${level}: wired + narrative + deferred === in pack`, () => {
      const sum = header.wired + header.narrative + header.deferred;
      expect(
        sum,
        `L${level}: ${header.wired} + ${header.narrative} + ${header.deferred} = ${sum}, expected ${header.inPack}`,
      ).toBe(header.inPack);
    });
  }

  it('header levels sum to the pack total', () => {
    const docTotal = headers.reduce((acc, h) => acc + h.inPack, 0);
    const packTotal = [...packCounts.values()].reduce((a, b) => a + b, 0);
    expect(docTotal, `doc headers total ${docTotal}; pack has ${packTotal}`).toBe(packTotal);
  });
});
