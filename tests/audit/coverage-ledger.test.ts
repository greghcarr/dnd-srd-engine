// Coverage-ledger anchor audit (slice 420).
//
// The SRD rule-coverage ledger (docs/srd-coverage-ledger.md) cites a
// couple of headline coverage numbers ("49 behavioral probes", "7
// ground-truth table groups"). Those are the ledger's load-bearing
// honesty claims, so they must not silently outrun (or undershoot) the
// real test suite. This audit re-derives each number from the source and
// fails if the ledger's cited value drifts, the same way doc-counts
// guards the front-door content counts. It does NOT try to verify the
// per-rule G/P/U judgments (those are human-maintained); it pins only
// the machine-derivable anchors.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const read = (rel: string): string => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const LEDGER = read('docs/srd-coverage-ledger.md');

const countMatches = (source: string, re: RegExp): number => source.match(re)?.length ?? 0;

// The cited number is the bolded value on the named anchor line.
const citedNumber = (label: RegExp): number => {
  const line = LEDGER.split('\n').find((l) => label.test(l));
  if (line === undefined) throw new Error(`Ledger anchor line not found for ${label}`);
  const m = /\*\*(\d+)\*\*/.exec(line);
  if (m === null) throw new Error(`No bolded count on ledger anchor line: ${line}`);
  return Number(m[1]);
};

describe('coverage-ledger audit (slice 420): cited anchors match the live suite', () => {
  it('the RAW-compliance probe count matches raw-compliance.test.ts', () => {
    // Line-start `it(` so an `it()` mention in a comment / string isn't
    // miscounted as a probe (vitest runs only the real calls).
    const actual = countMatches(read('tests/audit/raw-compliance.test.ts'), /^\s*it\(/gm);
    expect(
      citedNumber(/RAW-compliance probes/),
      'docs/srd-coverage-ledger.md cites a stale raw-compliance probe count',
    ).toBe(actual);
  });

  it('the boundary table-group count matches tests/boundaries/', () => {
    const dir = resolve(REPO_ROOT, 'tests/boundaries');
    const actual = readdirSync(dir)
      .filter((n) => n.endsWith('.test.ts'))
      .reduce((sum, n) => sum + countMatches(read(`tests/boundaries/${n}`), /^\s*describe\(/gm), 0);
    expect(
      citedNumber(/table groups/),
      'docs/srd-coverage-ledger.md cites a stale boundary table-group count',
    ).toBe(actual);
  });
});
