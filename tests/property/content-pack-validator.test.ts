// Property test: content-pack validator
// fuzzing.
//
// ContentPackLoadError is the front door for any content pack a
// consumer authors. If Zod accepts garbage, every downstream bug is
// harder to diagnose; if it rejects something but reports the issue
// at a wrong path, content-pack authoring becomes a guessing game.
//
// This test starts from the (known-valid) starter pack, picks a random
// path into the JSON tree, applies a type-breaking mutation, and
// asserts one of:
//
//   - The mutation was on a path Zod tolerates (optional, default, loose
//     union): loadContentPack succeeds. Acceptable.
//   - The mutation broke validation: loadContentPack throws a
//     ContentPackLoadError whose issues contain a path that points
//     at or through the mutated location.
//
// The point isn't to find bugs in the *content* (Zod handles those);
// it's to find paths where Zod's error reporting doesn't *locate* the
// problem, which makes content-pack debugging miserable.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadContentPack, ContentPackLoadError } from '../../src/content/pack.js';
import { STARTER_PACK_RAW } from '../../src/content/packs/starter.js';

// Lower than the standard 1000 because each iteration deep-clones the
// starter pack (~80 ms/iter). 50 runs is a smoke check; bump via
// FAST_CHECK_NUM_RUNS for a deeper sweep (200 or 1000 are useful
// targets for periodic local fuzz runs).
const NUM_RUNS = Number.parseInt(process.env['FAST_CHECK_NUM_RUNS'] ?? '50', 10);

type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

const cloneDeep = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// Walk the JSON tree and collect every leaf path. Leaves are
// primitives or empty containers; we deliberately don't recurse into
// arrays of primitives (mutating one element rarely fails since arrays
// are loose). The collected paths are the candidates for mutation.
const collectLeafPaths = (
  node: JsonValue,
  prefix: ReadonlyArray<string | number>,
  out: Array<ReadonlyArray<string | number>>,
): void => {
  if (node === null || typeof node !== 'object') {
    out.push(prefix);
    return;
  }
  if (Array.isArray(node)) {
    if (node.length === 0) {
      out.push(prefix);
      return;
    }
    for (let i = 0; i < node.length; i++) {
      const child = node[i];
      if (child !== undefined) collectLeafPaths(child, [...prefix, i], out);
    }
    return;
  }
  const entries = Object.entries(node);
  if (entries.length === 0) {
    out.push(prefix);
    return;
  }
  for (const [k, v] of entries) {
    collectLeafPaths(v, [...prefix, k], out);
  }
};

// Apply `mutate(currentValue) -> newValue` at the given path. Returns
// a new object; the input is not modified. `null` for newValue deletes
// the leaf's parent key (when the parent is an object).
const setAtPath = (
  root: JsonValue,
  path: ReadonlyArray<string | number>,
  newValue: JsonValue | symbol,
  DELETE: symbol,
): JsonValue => {
  if (path.length === 0) return newValue === DELETE ? root : (newValue as JsonValue);
  const clone = cloneDeep(root);
  let cursor: { [k: string]: JsonValue } | JsonValue[] = clone as { [k: string]: JsonValue };
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (key === undefined) return clone;
    cursor = (cursor as { [k: string]: JsonValue })[key as string] as { [k: string]: JsonValue } | JsonValue[];
    if (cursor === undefined || cursor === null) return clone;
  }
  const last = path[path.length - 1];
  if (last === undefined) return clone;
  if (newValue === DELETE) {
    delete (cursor as { [k: string]: JsonValue })[last as string];
  } else {
    (cursor as { [k: string]: JsonValue })[last as string] = newValue as JsonValue;
  }
  return clone;
};

interface Mutation {
  readonly kind: 'replace-with-number' | 'replace-with-string' | 'replace-with-bool' | 'replace-with-null' | 'replace-with-array' | 'delete-key';
}

const mutationArb = (): fc.Arbitrary<Mutation> =>
  fc.constantFrom<Mutation>(
    { kind: 'replace-with-number' },
    { kind: 'replace-with-string' },
    { kind: 'replace-with-bool' },
    { kind: 'replace-with-null' },
    { kind: 'replace-with-array' },
    { kind: 'delete-key' },
  );

const DELETE_MARKER: unique symbol = Symbol('DELETE');

const applyMutation = (root: JsonValue, path: ReadonlyArray<string | number>, m: Mutation): JsonValue =>
  setAtPath(
    root,
    path,
    m.kind === 'delete-key'
      ? (DELETE_MARKER as unknown as symbol)
      : m.kind === 'replace-with-number'
        ? 999999
        : m.kind === 'replace-with-string'
          ? '__FUZZ_STRING__'
          : m.kind === 'replace-with-bool'
            ? true
            : m.kind === 'replace-with-null'
              ? null
              : ['__fuzz_arr__'],
    DELETE_MARKER,
  );

const pathAsString = (path: ReadonlyArray<string | number>): string =>
  path.length === 0 ? '<root>' : path.map((p) => String(p)).join('.');

// Pre-collect leaf paths once (the starter pack JSON is large; this
// avoids re-walking it on every fast-check iteration).
const LEAF_PATHS: ReadonlyArray<ReadonlyArray<string | number>> = (() => {
  const out: Array<ReadonlyArray<string | number>> = [];
  collectLeafPaths(STARTER_PACK_RAW as JsonValue, [], out);
  return out;
})();

describe('content pack validator fuzzing', () => {
  it('every mutation either parses cleanly or reports a Zod issue with a usable path', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: LEAF_PATHS.length - 1 }),
        mutationArb(),
        (pathIdx, mutation) => {
          const path = LEAF_PATHS[pathIdx];
          if (path === undefined) return;
          const mutated = applyMutation(STARTER_PACK_RAW as JsonValue, path, mutation);

          try {
            loadContentPack(mutated);
            // The mutation was tolerable (optional, default, loose union).
            // That's fine; the test doesn't require every mutation to
            // fail, only that *when* it fails, the path is reported.
          } catch (err) {
            expect(err).toBeInstanceOf(ContentPackLoadError);
            const e = err as ContentPackLoadError;
            // The error must carry at least one issue.
            expect(e.issues.length).toBeGreaterThan(0);
            // Each issue's path must be a non-empty string. The Zod
            // path format is dot-separated; "<root>" is the path when
            // the mutation broke at the top level.
            for (const issue of e.issues) {
              expect(typeof issue.path).toBe('string');
              expect(issue.path.length).toBeGreaterThan(0);
              expect(typeof issue.message).toBe('string');
              expect(issue.message.length).toBeGreaterThan(0);
            }
            // The strongest claim: at least one reported issue's path
            // overlaps with the mutated path. We allow partial overlap
            // because a typed union mutation can produce issues at
            // every union branch (and those paths are siblings, not
            // equal). The mutated path's last segment usually appears
            // in at least one issue.
            const mutatedStr = pathAsString(path);
            const lastSegment = String(path[path.length - 1] ?? '');
            const overlap = e.issues.some(
              (i) =>
                i.path === mutatedStr ||
                i.path.startsWith(mutatedStr) ||
                mutatedStr.startsWith(i.path) ||
                (lastSegment.length > 0 && i.path.includes(lastSegment)),
            );
            expect(
              overlap,
              `mutation at ${mutatedStr} (${mutation.kind}) produced issues at unrelated paths: ${e.issues
                .map((i) => i.path)
                .join(', ')}`,
            ).toBe(true);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
