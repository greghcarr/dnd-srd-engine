// Public-API contract test (a Required test layer, per the testing
// standard in CLAUDE.md). Locks the exported symbol surface of `src/index.ts` so
// any accidental addition, removal, or rename is caught at the type
// level and surfaces as a snapshot mismatch.
//
// Two complementary snapshots:
//   1. Runtime exports — names that show up in `Object.keys(import *)`
//   2. Source-level exports — every `export { ... }` and `export type
//      { ... }` declared in the barrel, extracted by parsing the file.
//      This catches type-only exports the runtime check misses.
//
// When a snapshot mismatch is intentional (you added a planner, renamed
// a type), run `npx vitest -u tests/contract/exports.test.ts` and review
// the diff in the PR. The diff is the canonical record of what changed
// about the public API.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as PublicAPI from '../../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BARREL_PATH = resolve(HERE, '../../src/index.ts');

describe('public API contract: src/index.ts', () => {
  it('runtime exports match the locked snapshot', () => {
    const names = Object.keys(PublicAPI).sort();
    expect(names).toMatchSnapshot();
  });

  it('source-level exports (runtime + type-only) match the locked snapshot', () => {
    const source = readFileSync(BARREL_PATH, 'utf8');
    const exports = extractExportedNames(source);
    expect(exports).toMatchSnapshot();
  });
});

/**
 * Parses the source of `src/index.ts` and returns a sorted, normalized
 * list of every name in `export { ... }` and `export type { ... }`
 * blocks. Tolerates renames (`a as b` → emits `b`) and the optional
 * `type` keyword on individual names.
 *
 * Doesn't try to be a real TypeScript parser — the barrel is
 * mechanically generated (one re-export per line, no aliasing tricks),
 * so a few well-scoped regexes are enough. If this ever needs to
 * understand more complex re-exports, swap to the TypeScript compiler
 * API.
 */
const extractExportedNames = (source: string): string[] => {
  const names = new Set<string>();
  // Match `export { ... } from '...'` and `export type { ... } from
  // '...'`, capturing everything between the braces. The `s` flag is
  // not used because the barrel doesn't span braces across lines for
  // any single export block in the current style — but we accept it
  // by chunking on newlines first.
  const blockPattern = /export\s+(?:type\s+)?\{([^}]+)\}\s*from\s*['"][^'"]+['"]\s*;?/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(source)) !== null) {
    const body = match[1] ?? '';
    for (const raw of body.split(',')) {
      const cleaned = raw.trim().replace(/^type\s+/, '');
      if (cleaned === '') continue;
      // Handle `Foo as Bar` — record the local name (Bar).
      const asMatch = /^([A-Za-z_][\w]*)\s+as\s+([A-Za-z_][\w]*)$/.exec(cleaned);
      if (asMatch !== null) {
        names.add(asMatch[2]!);
        continue;
      }
      const simple = /^[A-Za-z_][\w]*$/.exec(cleaned);
      if (simple !== null) names.add(cleaned);
    }
  }
  return [...names].sort();
};
