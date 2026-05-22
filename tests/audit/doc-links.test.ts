// Doc-links audit (slice 432).
//
// Every internal markdown link in the repo's docs must resolve from the
// linking file's own location (the way GitHub resolves relative links).
// This catches the link-rot class that a periodic manual review used to
// find: repo-root-relative hrefs (e.g. a link in docs/status.md to
// `tests/audit/x` resolves to docs/tests/audit/x and 404s on GitHub),
// links to moved/renamed/deleted files, and bad `../` depth in archives.
//
// External (http/mailto), in-page anchors (#...), and links inside code
// spans (inline `...` or fenced ```) are ignored, so documented example
// code that contains parens isn't mistaken for a link.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
// references/srd-markdown is a vendored submodule (its own link conventions).
const SKIP_PREFIXES = ['references/srd-markdown'];

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

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

describe('doc-links audit (slice 432): internal markdown links resolve from their file', () => {
  const files = markdownFiles(REPO_ROOT).filter(
    (f) => !SKIP_PREFIXES.some((p) => relative(REPO_ROOT, f).startsWith(p)),
  );

  it('discovers the doc set (sanity, not vacuous)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  const broken: string[] = [];
  for (const file of files) {
    const text = stripCode(readFileSync(file, 'utf8'));
    const base = dirname(file);
    for (const m of text.matchAll(LINK_RE)) {
      const href = m[1]!.trim();
      if (/^(https?:|mailto:|#|file:|tel:)/.test(href)) continue;
      const path = href.split('#')[0];
      if (!path) continue; // pure anchor
      if (!existsSync(resolve(base, path))) {
        broken.push(`${relative(REPO_ROOT, file)} -> ${href}`);
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
