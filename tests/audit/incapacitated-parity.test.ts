// Slice 575: INCAPACITATING_CONDITIONS <-> ACTION_BLOCKING_CONDITIONS
// parity audit.
//
// Slice 570 added a local `INCAPACITATING_CONDITIONS` set in
// src/engine/reducers/combat.ts that mirrors the planner-side
// `ACTION_BLOCKING_CONDITIONS` in src/engine/plan/_actor-state.ts.
// The two sets must stay aligned: RAW says "becoming Incapacitated
// ends Concentration" AND "an Incapacitated creature can't take
// actions, bonus actions, or reactions." Both arms are enforced
// against the same canonical set.
//
// This audit parses both source files via regex (the sets are
// declared as const ReadonlySet<string> = new Set([...])) and
// asserts they contain the same condition ids.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const extractSetFromFile = (relPath: string, constName: string): ReadonlySet<string> => {
  const src = readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
  // Match: const <constName>: ReadonlySet<string> = new Set([ ... ]);
  const pattern = new RegExp(
    String.raw`${constName}\s*:\s*ReadonlySet<string>\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)`,
  );
  const match = src.match(pattern);
  if (!match) {
    throw new Error(`Could not find const ${constName} in ${relPath}`);
  }
  // Strip line comments before extracting string literals — comments
  // routinely mention condition ids in backtick-style or quoted form,
  // and the simple /'(...)'/g matcher would pick those up too.
  const body = match[1]!.replace(/\/\/[^\n]*/g, '');
  const ids = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  return new Set(ids);
};

describe('INCAPACITATING_CONDITIONS <-> ACTION_BLOCKING_CONDITIONS parity (slice 575)', () => {
  it('the reducer-side and planner-side sets contain the same condition ids', () => {
    const planner = extractSetFromFile(
      'src/engine/plan/_actor-state.ts',
      'ACTION_BLOCKING_CONDITIONS',
    );
    const reducer = extractSetFromFile(
      'src/engine/reducers/combat.ts',
      'INCAPACITATING_CONDITIONS',
    );
    // Same size + same members.
    expect(planner.size).toBe(reducer.size);
    for (const id of planner) {
      expect(reducer.has(id), `reducer set should contain '${id}' (mirror parity)`).toBe(true);
    }
    for (const id of reducer) {
      expect(planner.has(id), `planner set should contain '${id}' (mirror parity)`).toBe(true);
    }
  });

  it('both sets include the 5 RAW conditions that compose Incapacitated', () => {
    const planner = extractSetFromFile(
      'src/engine/plan/_actor-state.ts',
      'ACTION_BLOCKING_CONDITIONS',
    );
    for (const cid of ['incapacitated', 'stunned', 'paralyzed', 'petrified', 'unconscious']) {
      expect(planner.has(cid), `planner set should contain RAW '${cid}'`).toBe(true);
    }
  });
});
