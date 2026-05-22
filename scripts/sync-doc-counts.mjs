#!/usr/bin/env node
// Release-time reconciliation of the headline test/file count.
//
// The content counts (spells, items, monsters, conditions, EFFECT_KINDS,
// the spell wired/narrative/deferred split) are guarded per-commit by
// tests/audit/doc-counts.test.ts + gaps-spells-counts.test.ts, so they
// are always accurate. The headline "N tests across M files" total is
// intentionally NOT guarded per-slice (it moves every commit). This
// script pins it to ground truth at release time: it runs the real
// suite, parses vitest's summary, and rewrites the citations in the
// front-door docs so a tagged release never ships a stale total.
//
// Usage:
//   node scripts/sync-doc-counts.mjs          # run suite, rewrite docs in place
//   node scripts/sync-doc-counts.mjs --check  # fail (exit 1) if stale; don't write
//
// Run as a mandatory step in the release procedure (see DEVELOPMENT.md
// "Cutting a release"). Review the diff before committing the release.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

// Files carrying the headline "N tests across M files" citation.
const DOC_FILES = ['README.md', 'docs/status.md'];
// Matches "2170 tests across 331 files" (with or without thousands commas
// in the test count). Global so every occurrence in a file is reconciled.
const CITATION = /([\d,]+) tests across (\d+) files/g;

const runSuite = () => {
  console.log('Running the full suite to derive the live test/file count (this takes a couple of minutes)...');
  let output;
  try {
    output = execSync('npx vitest run', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // vitest exits non-zero on test failure; capture its output so we can
    // report the failure rather than a misleading parse.
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  return output;
};

const parseCounts = (output) => {
  if (/Test Files.*failed|Tests.*\d+ failed/.test(output)) {
    throw new Error('Suite is not green; refusing to pin counts from a failing run. Fix the suite first.');
  }
  const files = output.match(/Test Files\s+(\d+) passed/);
  const tests = output.match(/Tests\s+(\d+) passed/);
  if (!files || !tests) {
    throw new Error('Could not parse the vitest summary (Test Files / Tests lines). Did the runner change its output format?');
  }
  return { files: Number(files[1]), tests: Number(tests[1]) };
};

const reconcile = ({ files, tests }) => {
  const replacement = `${tests} tests across ${files} files`;
  let anyStale = false;
  for (const rel of DOC_FILES) {
    const path = resolve(REPO_ROOT, rel);
    const before = readFileSync(path, 'utf8');
    const occurrences = before.match(CITATION);
    if (!occurrences) {
      console.warn(`WARNING: no "N tests across M files" citation found in ${rel}. Did the phrasing change? Update CITATION in this script.`);
      continue;
    }
    const after = before.replace(CITATION, replacement);
    if (after === before) {
      console.log(`OK   ${rel}: ${occurrences.length} citation(s) already accurate (${replacement}).`);
      continue;
    }
    anyStale = true;
    const stale = [...new Set(occurrences)].filter((o) => o !== replacement);
    console.log(`STALE ${rel}: ${stale.join(', ')} -> ${replacement} (${occurrences.length} occurrence(s)).`);
    if (!CHECK_ONLY) writeFileSync(path, after);
  }
  return anyStale;
};

const main = () => {
  const counts = parseCounts(runSuite());
  console.log(`Live counts: ${counts.tests} tests across ${counts.files} files.`);
  const anyStale = reconcile(counts);
  if (!anyStale) {
    console.log('All headline counts are accurate. Nothing to do.');
    return;
  }
  if (CHECK_ONLY) {
    console.error('\nHeadline test/file count is stale. Run `npm run release:doc-counts` to fix, then commit.');
    process.exit(1);
  }
  console.log('\nDocs rewritten to the live count. Review the diff, then include it in the release commit.');
};

main();
