// Doc-links audit (slice 432).
//
// Every internal markdown link in the repo's docs must resolve from the
// linking file's own location (the way GitHub resolves relative links).
// This catches the link-rot class that a periodic manual review used to
// find: repo-root-relative hrefs (e.g. a link in docs/status.md to
// `tests/audit/x` resolves to docs/tests/audit/x and 404s on GitHub),
// links to moved/renamed/deleted files, and bad `../` depth in archives.
//
// It also checks the three classes that pass on a dev machine but fail in
// CI / on GitHub: empty hrefs `[text]()` (slice 437), links resolving above
// the repo root (slice 438), and case-only mismatches like `Status.md` for
// `status.md` (slice 439, caught via an exact-case path walk since macOS
// resolves case-insensitively but Linux CI and GitHub do not).
//
// External (http/mailto), in-page anchors (#...), and links inside code
// spans (inline `...` or fenced ```) are ignored, so documented example
// code that contains parens isn't mistaken for a link.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// `.claude` is local-only agent notes (gitignored); treated the same as
// `node_modules` — present on disk but not repo content the audit owns.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.claude']);
// references/srd-markdown is a vendored submodule (its own link conventions).
// docs/changelog/archive-* and docs/changelog/released-versions* are frozen
// historical narrative — by intent they reference paths that may have been
// since removed or renamed (slice 686 retired web/, for instance). Re-checking
// them every CI run turns historically-accurate prose into churn.
const SKIP_PREFIXES = [
  'references/srd-markdown',
  'docs/changelog/archive-',
  'docs/changelog/released-versions',
];

const markdownFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      markdownFiles(full, acc);
    } else if (entry.name.endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
};

// Remove fenced and inline code so code samples aren't scanned for links.
const stripCode = (md: string): string =>
  md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');

// `*` (not `+`) inside the parens so an empty href `[text]()` is captured too:
// it renders as a dead link on GitHub and is a real defect (slice 437 hit it
// when re-rooting moved links). A `+` here would silently skip empty hrefs.
const LINK_RE = /\[[^\]]*\]\(([^)]*)\)/g;

// Walk a within-repo target path segment by segment, verifying each exists
// with EXACT case. Subsumes a plain existence check and additionally catches
// case-only mismatches (a link to `Status.md` when the file is `status.md`),
// which resolve on case-insensitive macOS but 404 on case-sensitive Linux CI
// and on GitHub (slice 439 added this; the repo-escape and empty-href classes
// were the prior two "passes locally, fails in CI" gaps).
type CaseResult = { kind: 'ok' } | { kind: 'missing' } | { kind: 'case'; correct: string };

const resolveWithCase = (target: string): CaseResult => {
  const rel = relative(REPO_ROOT, target);
  if (rel === '') return { kind: 'ok' }; // the repo root itself
  let dir = REPO_ROOT;
  const corrected: string[] = [];
  for (const segment of rel.split(sep)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return { kind: 'missing' };
    }
    if (entries.includes(segment)) {
      corrected.push(segment);
      dir = join(dir, segment);
      continue;
    }
    const ci = entries.find((e) => e.toLowerCase() === segment.toLowerCase());
    if (ci !== undefined) return { kind: 'case', correct: [...corrected, ci].join('/') };
    return { kind: 'missing' };
  }
  return { kind: 'ok' };
};

describe('doc-links audit (slice 432): internal markdown links resolve from their file', () => {
  const files = markdownFiles(REPO_ROOT).filter((f) => {
    // Normalize to forward slashes so the `/`-form SKIP_PREFIXES match on
    // Windows too (path.relative yields `\`-separated paths there). Without
    // this the frozen archive changelogs aren't skipped and their
    // intentionally-stale links re-flag (slice 779).
    const rel = relative(REPO_ROOT, f).split(sep).join('/');
    return !SKIP_PREFIXES.some((p) => rel.startsWith(p));
  });

  it('discovers the doc set (sanity, not vacuous)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  const broken: string[] = [];
  for (const file of files) {
    const text = stripCode(readFileSync(file, 'utf8'));
    const base = dirname(file);
    for (const m of text.matchAll(LINK_RE)) {
      const href = m[1]!.trim();
      if (href === '') {
        broken.push(`${relative(REPO_ROOT, file)} -> (empty link href)`);
        continue;
      }
      if (/^(https?:|mailto:|#|file:|tel:)/.test(href)) continue;
      const path = href.split('#')[0];
      if (!path) continue; // pure anchor
      const target = resolve(base, path);
      // A link that resolves above the repo root can never render on GitHub
      // (it can't escape the repo) and is non-portable (it would pass only on
      // a machine that happens to have the out-of-repo file). Flag it
      // deterministically rather than letting it pass on one machine and fail
      // on CI (slice 438: the project CLAUDE.md's ../../../.claude link did
      // exactly that).
      if (relative(REPO_ROOT, target).startsWith('..')) {
        broken.push(`${relative(REPO_ROOT, file)} -> ${href} (escapes the repo root)`);
        continue;
      }
      const result = resolveWithCase(target);
      if (result.kind === 'missing') {
        broken.push(`${relative(REPO_ROOT, file)} -> ${href}`);
      } else if (result.kind === 'case') {
        broken.push(`${relative(REPO_ROOT, file)} -> ${href} (case mismatch: should be ${result.correct})`);
      }
    }
  }

  it('every internal link resolves (GitHub-relative)', () => {
    expect(
      broken,
      `Broken internal doc links (resolve from the file's own dir, not repo root):\n${broken.join('\n')}`,
    ).toEqual([]);
  });
});
