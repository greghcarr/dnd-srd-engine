// Doc code-example typecheck audit (slice 434).
//
// Code we present in the docs as runnable copy-paste must actually compile
// against the real public API. This catches the broken-example class that the
// link and count guards can't: an example calling a renamed / removed export
// or a method that never existed (e.g. the bogus `engine.handlers.register(...)`
// a docs review once found). When an export is renamed or a signature changes,
// the example breaks CI in the same commit instead of shipping copy-paste-broken.
//
// Opt-in by design. Most doc `ts` blocks are reference sketches with intentional
// elisions (`...`, `/* ... */`), undeclared setup variables, or signature-only
// pseudo-syntax; compiling those would be all false positives. A block is checked
// only when the line immediately above its opening fence is the (GitHub-invisible)
// HTML comment marker:
//
//   <!-- typecheck -->            starts a new synthetic module with this block
//   <!-- typecheck:continue -->   appends this block to the doc's current module
//
// `:continue` lets a multi-step walkthrough (getting-started) build up state
// across blocks and be checked as one program. Each module is compiled as its
// own ES module (separate file), so two modules can both declare `engine`
// without colliding.
//
// Mechanism: each module is written to a temp .ts file and compiled with the
// project's own tsconfig (so `dnd-srd-engine` resolves to src/index.ts via its
// path mapping). The repo's source-barrel relative path (`./src/index.js`, used
// by the README's "work against source" framing) is normalized to the package
// name so the checked symbols match the bare-specifier docs; both are the same
// barrel. DOM lib is added so `console` resolves (the repo lib is ES2022-only).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const SKIP_PREFIXES = ['references/srd-markdown'];

const START_MARKER = '<!-- typecheck -->';
const CONTINUE_MARKER = '<!-- typecheck:continue -->';

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

interface DocModule {
  readonly doc: string; // repo-relative path
  readonly startLine: number; // 1-based line of the module's first fence
  code: string;
}

const isTsFence = (line: string): boolean => {
  const t = line.trim();
  return t === '```ts' || t === '```typescript';
};

// Normalize the repo's own source barrel to the package name so the symbols an
// in-repo example imports match a published consumer's imports. Same barrel.
const normalizeImports = (code: string): string =>
  code.replace(
    /(from\s+['"])(?:\.\.?\/)+src\/index(?:\.js)?(['"])/g,
    "$1dnd-srd-engine$2",
  );

// Parse one doc into the modules its markers opt in.
const modulesIn = (docPath: string): DocModule[] => {
  const repoRel = relative(REPO_ROOT, docPath);
  const lines = readFileSync(docPath, 'utf8').split('\n');
  const modules: DocModule[] = [];
  let current: DocModule | undefined;

  let i = 0;
  while (i < lines.length) {
    if (!isTsFence(lines[i]!)) {
      i += 1;
      continue;
    }
    // Marker is the nearest non-blank line above the opening fence.
    let j = i - 1;
    while (j >= 0 && lines[j]!.trim() === '') j -= 1;
    const marker = j >= 0 ? lines[j]!.trim() : '';

    // Collect the block body up to the closing fence.
    let k = i + 1;
    const body: string[] = [];
    while (k < lines.length && lines[k]!.trim() !== '```') {
      body.push(lines[k]!);
      k += 1;
    }
    const block = body.join('\n');

    if (marker === START_MARKER) {
      current = { doc: repoRel, startLine: i + 1, code: block };
      modules.push(current);
    } else if (marker === CONTINUE_MARKER) {
      if (!current || current.doc !== repoRel) {
        // A continue with no preceding start in this doc is an authoring error.
        current = { doc: repoRel, startLine: i + 1, code: block };
        modules.push(current);
      } else {
        current.code += '\n' + block;
      }
    }
    i = k + 1;
  }
  return modules;
};

describe('doc-examples audit (slice 434): marked runnable doc code compiles', () => {
  const docs = markdownFiles(REPO_ROOT).filter((f) => {
    // Forward-slash SKIP_PREFIXES must match Windows `\`-separated paths too
    // (slice 779; same portability fix as doc-links).
    const rel = relative(REPO_ROOT, f).split(sep).join('/');
    return !SKIP_PREFIXES.some((p) => rel.startsWith(p));
  });
  const modules = docs.flatMap(modulesIn);

  it('finds the marked runnable examples (sanity, not vacuous)', () => {
    expect(modules.length).toBeGreaterThanOrEqual(2);
  });

  it('every marked example typechecks against the public API', () => {
    if (modules.length === 0) return;

    const tmp = mkdtempSync(join(tmpdir(), 'doc-examples-'));
    const fileToModule = new Map<string, DocModule>();
    modules.forEach((m, idx) => {
      const file = `example-${idx}.ts`;
      writeFileSync(join(tmp, file), normalizeImports(m.code) + '\n');
      fileToModule.set(file, m);
    });
    writeFileSync(
      join(tmp, 'tsconfig.json'),
      JSON.stringify({
        extends: join(REPO_ROOT, 'tsconfig.json'),
        compilerOptions: {
          noEmit: true,
          declaration: false,
          declarationMap: false,
          sourceMap: false,
          skipLibCheck: true,
          lib: ['ES2022', 'DOM'],
        },
        include: ['*.ts'],
      }),
    );

    const tsc = resolve(REPO_ROOT, 'node_modules/.bin/tsc');
    let raw = '';
    try {
      execFileSync(tsc, ['-p', join(tmp, 'tsconfig.json')], {
        cwd: tmp,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      raw = (e.stdout ?? '') + (e.stderr ?? '');
    }

    // Attribute each tsc diagnostic back to its source doc + block start.
    const failures = raw
      .split('\n')
      .filter((l) => /example-\d+\.ts\(\d+,\d+\): error/.test(l))
      .map((l) => {
        const m = /(example-\d+\.ts)\((\d+),\d+\): (.*)/.exec(l)!;
        const mod = fileToModule.get(m[1]!)!;
        return `${mod.doc} (module starting at line ${mod.startLine}): ${m[3]}`;
      });

    expect(
      failures,
      `Doc code examples marked runnable failed to compile:\n${failures.join('\n')}`,
    ).toEqual([]);
  });
});
