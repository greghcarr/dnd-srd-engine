// Concentration-save coverage audit.
//
// Slice 621. RAW 2024 PHB Concentration: every time a concentrating
// creature takes damage, it must roll a CON save. `planConcentrationOnDamage`
// in src/engine/plan/concentration.ts implements the full RAW path
// (per-source save + 0-HP unconscious shortcut). Damage emission sites
// that omit it silently let concentration survive damage that should
// have rolled a save.
//
// The slice 614 pattern-check sweep CLAIMED every DamageApplied site
// was wired; a 12-seed fuzz batch at slice 620 surfaced 6 unwired
// sites (dragonborn-breath, breath-weapon, movement Thunder Step,
// paladins-smite, storms-thunder, trap). Slice 621 wired them and
// promoted that pattern-check to this permanent audit so any future
// DamageApplied emission has to either wire the helper or be
// allowlisted with a documented reason.
//
// When this audit fails:
//   - "missing planConcentrationOnDamage": you added a DamageApplied
//     emission and didn't wire the helper. Either import + call
//     planConcentrationOnDamage after the DamageApplied push, OR add
//     the file to EXCLUDED_FROM_CONC_COVERAGE with the reason.
//   - "stale allowlist entry": you removed an emission site; clean up
//     the allowlist.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAN_DIR = resolve(HERE, '../../src/engine/plan');

const DAMAGE_APPLIED_PATTERN = /type:\s*'DamageApplied'/;
const HELPER_CALL_PATTERN = /planConcentrationOnDamage\s*\(/;

// Files under src/engine/plan/ that emit DamageApplied but intentionally
// skip the per-damage CON save, with the documented reason. Add a new
// entry here ONLY when RAW genuinely doesn't call for a save at the
// emission site (the helper itself isn't a candidate; planners that
// re-emit damage already validated upstream aren't either).
const EXCLUDED_FROM_CONC_COVERAGE: ReadonlyMap<string, string> = new Map([
  // concentration.ts IS the helper file (and its planTickAura /
  // planTickMovementDamage / planTickRecurring already inline the call
  // at every damage emission inside). Self-reference would be tautological.
  ['concentration.ts', 'helper file itself; in-file emissions already inline planConcentrationOnDamage'],
]);

const PLAN_FILES = readdirSync(PLAN_DIR).filter((f) => f.endsWith('.ts'));

const damageEmitters = PLAN_FILES.filter((f) =>
  DAMAGE_APPLIED_PATTERN.test(readFileSync(resolve(PLAN_DIR, f), 'utf8')),
);

const helperWired = (f: string): boolean =>
  HELPER_CALL_PATTERN.test(readFileSync(resolve(PLAN_DIR, f), 'utf8'));

describe('concentration-save coverage audit: every DamageApplied emission rolls the RAW concentration save', () => {
  it('every src/engine/plan/ file that emits DamageApplied wires planConcentrationOnDamage (or is allowlisted)', () => {
    const missing = damageEmitters
      .filter((f) => !helperWired(f) && !EXCLUDED_FROM_CONC_COVERAGE.has(f))
      .sort();
    expect(
      missing,
      `these planner files emit DamageApplied without calling planConcentrationOnDamage: ${JSON.stringify(missing)}. Wire the helper after the DamageApplied push (see attack.ts:1423 for the canonical pattern) or add the file to EXCLUDED_FROM_CONC_COVERAGE with a one-line RAW reason.`,
    ).toEqual([]);
  });

  it('the allowlist stays accurate (every entry still emits DamageApplied)', () => {
    const stale = [...EXCLUDED_FROM_CONC_COVERAGE.keys()]
      .filter((f) => !damageEmitters.includes(f))
      .sort();
    expect(
      stale,
      `EXCLUDED_FROM_CONC_COVERAGE entries that no longer emit DamageApplied (remove them): ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });
});
