// Phantom-field audit.
//
// Slice 373. Generalizes and makes permanent the sweep from slices
// 370-372: a content field authored on an entity that its Zod schema
// doesn't have is *silently stripped* at parse, so the engine never sees
// it. That shipped four real bugs (Sacred Flame / Burning Hands /
// Thunderwave dealt zero damage via a stripped `save.onFailure`; five
// melee spell attacks were tagged ranged via a stripped `attackKind`;
// Ray of Frost / Shocking Grasp didn't scale via a stripped top-level
// `cantripScalingDice`; 52 items lost their `description`). Each looked
// correct in the raw JSON, so the SRD-drift audit (which reads the raw
// authored fields) passed while the runtime behavior was wrong.
//
// This audit parses the pack through ContentPackSchema and deep-diffs the
// raw JSON against the parsed result: any key present in the raw entity
// but absent after parsing was stripped. Defaults that Zod ADDS are
// parsed-only and ignored (we only flag raw-keys-missing-from-parsed).
//
// When this audit fails: a content field was authored that the schema
// doesn't support. Either (a) add the field to the schema (if the engine
// should honor it) and wire it, (b) fix the authoring (the field is
// misplaced / misspelled), or (c) if the strip is genuinely intentional,
// add the dotted path to ALLOWED_STRIPS with a one-line reason.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentPackSchema } from '../../src/content/pack.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = resolve(HERE, '../../src/content/packs/starter-pack.json');

const raw = JSON.parse(readFileSync(PACK_PATH, 'utf8')) as Record<string, unknown>;
const parsed = ContentPackSchema.parse(raw) as Record<string, unknown>;

// Dotted category paths (array indices collapsed) that are stripped on
// purpose. Empty today: every authored field is honored by its schema.
const ALLOWED_STRIPS: ReadonlySet<string> = new Set([]);

const CATEGORIES = [
  'spells',
  'conditions',
  'items',
  'monsters',
  'classes',
  'subclasses',
  'species',
  'backgrounds',
  'feats',
] as const;

const collectStrippedPaths = (rawNode: unknown, parsedNode: unknown, path: string, out: Set<string>): void => {
  if (Array.isArray(rawNode)) {
    if (!Array.isArray(parsedNode)) return;
    rawNode.forEach((rv, i) => collectStrippedPaths(rv, parsedNode[i], path, out));
    return;
  }
  if (rawNode !== null && typeof rawNode === 'object') {
    if (parsedNode === null || typeof parsedNode !== 'object') return;
    const p = parsedNode as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawNode as Record<string, unknown>)) {
      const childPath = `${path}.${k}`;
      if (!(k in p)) out.add(childPath);
      else collectStrippedPaths(v, p[k], childPath, out);
    }
  }
};

describe('phantom-field audit: no authored content field is silently stripped at parse', () => {
  it('every key in the raw pack survives ContentPackSchema parsing (or is allowlisted)', () => {
    const stripped = new Set<string>();
    for (const cat of CATEGORIES) {
      const rawArr = (raw[cat] as unknown[] | undefined) ?? [];
      const parsedArr = (parsed[cat] as unknown[] | undefined) ?? [];
      rawArr.forEach((rv, i) => collectStrippedPaths(rv, parsedArr[i], cat, stripped));
    }
    const unexpected = [...stripped].filter((p) => !ALLOWED_STRIPS.has(p)).sort();
    expect(
      unexpected,
      `these authored fields are dropped by Zod (the engine never sees them): ${JSON.stringify(unexpected)}. Add the field to its schema and wire it, fix the authoring, or allowlist the path in ALLOWED_STRIPS with a reason.`,
    ).toEqual([]);
  });

  it('the ALLOWED_STRIPS allowlist stays accurate (no entry has become un-stripped)', () => {
    const stripped = new Set<string>();
    for (const cat of CATEGORIES) {
      const rawArr = (raw[cat] as unknown[] | undefined) ?? [];
      const parsedArr = (parsed[cat] as unknown[] | undefined) ?? [];
      rawArr.forEach((rv, i) => collectStrippedPaths(rv, parsedArr[i], cat, stripped));
    }
    const stale = [...ALLOWED_STRIPS].filter((p) => !stripped.has(p)).sort();
    expect(stale, `ALLOWED_STRIPS paths that are no longer stripped (remove them): ${JSON.stringify(stale)}`).toEqual([]);
  });
});
