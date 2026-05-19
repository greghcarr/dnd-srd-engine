// Doc-size audit.
//
// Slice 285. Enforces the single-Read ceiling on front-door
// documentation. CLAUDE.md's "Doc size discipline" section
// requires index-type docs to fit in a single `Read` tool call;
// the Claude Code Read tool refuses files above ~25,000 tokens
// (~55-60 KB of dense technical prose). Slices 270 and 277 each
// had to ship an archive split when CHANGELOG.md or
// starter-pack-gaps.md silently drifted over the ceiling between
// content slices; this audit fails fast at commit / CI time so
// the drift is visible immediately rather than at the next
// fresh-agent Read.
//
// Threshold: 60,000 bytes per file. CLAUDE.md's "Doc size
// discipline" section names this as the practical ceiling
// ("anything safely under **60,000 bytes** will fit"). Empirical
// verification at slice 285: 59 KB and 56 KB archive files both
// Read cleanly; the prior CHANGELOG at 65 KB exceeded the
// ~25,000-token Read-tool limit. 60,000 catches files past the
// documented ceiling while leaving the historic archives that
// landed near the boundary intact.
//
// When this audit fails:
//
// 1. Run `wc -c <file>` to confirm the size.
// 2. Pick a clean boundary (CHANGELOG: slice numbers; gaps doc:
//    shipped vs. unshipped rows; archive: cohort splits).
// 3. Move the bulk to a focused sub-doc under docs/changelog/ or
//    docs/gaps-*.md, leaving a pointer in the source doc.
// 4. Update the archive pointer block in CHANGELOG.md if
//    splitting an archive.
//
// See [CLAUDE.md](../../CLAUDE.md) "Doc size discipline" for the
// full playbook.

import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const MAX_BYTES = 60_000;

const fixedFiles = [
  'README.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'docs/starter-pack-gaps.md',
  'docs/status.md',
  'docs/roadmap.md',
  'docs/api-overview.md',
];

const gatherGlobMd = (relDir: string, prefix?: string): string[] => {
  const dir = resolve(REPO_ROOT, relDir);
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .filter((name) => (prefix === undefined ? true : name.startsWith(prefix)))
      .map((name) => `${relDir}/${name}`);
  } catch {
    return [];
  }
};

const collectFiles = (): string[] => {
  const changelogArchives = gatherGlobMd('docs/changelog');
  // Per-category gap catalogs match `docs/gaps-*.md`.
  const gapCatalogs = gatherGlobMd('docs', 'gaps-');
  return [...fixedFiles, ...changelogArchives, ...gapCatalogs];
};

const sizeBytes = (rel: string): number => {
  const abs = resolve(REPO_ROOT, rel);
  return statSync(abs).size;
};

describe('doc-size audit (slice 285): front-door docs fit the single-Read ceiling', () => {
  const files = collectFiles();

  it('discovers at least the fixed front-door docs (sanity)', () => {
    // Catches a workflow regression: if the file list ever empties
    // (path renames, dir moves), this audit becomes vacuously green
    // and the ceiling is silently unenforced. Pin a floor count.
    expect(files.length).toBeGreaterThanOrEqual(fixedFiles.length);
  });

  for (const rel of fixedFiles) {
    it(`${rel} <= ${MAX_BYTES} bytes`, () => {
      const bytes = sizeBytes(rel);
      expect(
        bytes,
        `${rel} is ${bytes} bytes (limit ${MAX_BYTES}). Split or archive — see CLAUDE.md "Doc size discipline".`,
      ).toBeLessThanOrEqual(MAX_BYTES);
    });
  }

  // Archives and per-category gap catalogs ship with the same
  // ceiling so they're each Readable in one call too. Discovered
  // dynamically (per-directory glob) so new archives are picked
  // up without test edits.
  it('every docs/changelog/*.md and docs/gaps-*.md fits the ceiling', () => {
    const dynamic = files.filter((f) => !fixedFiles.includes(f));
    expect(
      dynamic.length,
      'No dynamic docs discovered; check the glob paths in collectFiles().',
    ).toBeGreaterThan(0);
    const oversized = dynamic
      .map((rel) => ({ rel, bytes: sizeBytes(rel) }))
      .filter(({ bytes }) => bytes > MAX_BYTES);
    expect(
      oversized,
      `Oversized archive / catalog docs (limit ${MAX_BYTES} bytes):\n${oversized
        .map(({ rel, bytes }) => `  - ${rel}: ${bytes} bytes`)
        .join('\n')}`,
    ).toEqual([]);
  });
});
