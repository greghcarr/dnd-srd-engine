// Slice 644: fuzz matrix audit (L1 + L2 across combat shapes + rests).
//
// Supersedes the slice-643 L2 fuzz floor (which covered only one cell
// of this matrix: L2 / 1v1 / PC / rest=none). That earlier audit's
// scope was minimal-viable-floor for the L2-complete claim; this
// audit extends fuzz coverage across BOTH levels and across every
// reasonable combat shape + rest cadence the combat-fuzz CLI
// supports.
//
// Matrix (24 cells, 20 seeds each = 480 battles per CI run):
//   - Levels:  1, 2
//   - Shapes:  1v1 PC-vs-PC, 2v2 PC-vs-PC, 1v1 PC-vs-monster,
//              2v2 PC-vs-monster
//   - Rests:   none, short, long
//
// Each test runs all 20 seeds for one (level, shape, rest) cell and
// asserts every battle completes without throwing. A failure includes
// the cell coordinates AND the seed in the error message so a
// regression points at the exact reproduction:
//   "L2 2v2 PC rest=short seed=7 threw: ..."
//
// Why this audit:
//   - Static audits (feature presence, planner exported, resource
//     max + recharge, multiclass build) catch surface-area drift but
//     NOT runtime explosions inside the planner / reducer / trigger
//     pipeline.
//   - The slice-620-627 L1 fuzz cycle found 7 real bugs the static
//     tests missed (concentration RAW dispatch, rider-damage triggers,
//     Vex auto-expiry, etc.). None of that cycle's fuzz coverage was
//     promoted to a permanent CI guard before this slice.
//   - The CLI (`npx tsx scripts/combat-fuzz.ts`) remains the harness
//     for deep multi-thousand-seed regression hunts. This audit is
//     the always-on canary.
//
// Cost: ~5 sec wall-clock per CI run (480 battles × ~10ms each).
// Tunable: bump SEEDS_PER_CELL if a regression squeezes through and
// you want a wider net.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import {
  runBattle,
  type FuzzRest,
  type FuzzVs,
} from '../../scripts/combat-fuzz-core.js';

const PACK = loadStarterPack();
// Slice 651: extended from [1, 2] to [1, 2, 3] to cover the L3
// surface introduced in slices 645-650 (subclass selection at L3,
// new planners — Steady Aim / Fast Hands / Deflect Attacks — plus
// Paladin Channel Divinity + scaled-to-3 resources). The pre-slice
// fuzz cycle ran each shipped L3 planner through its dedicated
// per-planner test; this audit catches cross-cutting regressions
// that show up only under random encounter shapes.
const LEVELS = [1, 2, 3] as const;
const SHAPES: ReadonlyArray<{
  teamSize: 1 | 2;
  vs: FuzzVs;
  label: string;
}> = [
  { teamSize: 1, vs: 'pc', label: '1v1 PC' },
  { teamSize: 2, vs: 'pc', label: '2v2 PC' },
  { teamSize: 1, vs: 'monster', label: '1v1 monster' },
  { teamSize: 2, vs: 'monster', label: '2v2 monster' },
];
const RESTS: ReadonlyArray<FuzzRest> = ['none', 'short', 'long'];
const SEEDS_PER_CELL = 20;

describe('slice 644: fuzz matrix audit (L1 + L2 across shapes + rests)', () => {
  it(`enumerates ${LEVELS.length * SHAPES.length * RESTS.length} matrix cells (${LEVELS.length} levels x ${SHAPES.length} shapes x ${RESTS.length} rests)`, () => {
    expect(LEVELS.length * SHAPES.length * RESTS.length).toBe(36);
  });

  for (const level of LEVELS) {
    for (const shape of SHAPES) {
      for (const rest of RESTS) {
        const cellLabel = `L${level} ${shape.label} rest=${rest}`;
        it(`${cellLabel}: ${SEEDS_PER_CELL} seeds run to completion without throwing`, () => {
          for (let i = 0; i < SEEDS_PER_CELL; i += 1) {
            const seed = i + 1;
            let result;
            try {
              result = runBattle({
                seed,
                pack: PACK,
                level,
                rest,
                teamSize: shape.teamSize,
                vs: shape.vs,
              });
            } catch (err) {
              throw new Error(
                `${cellLabel} seed=${seed} threw: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            }
            expect(result, `${cellLabel} seed=${seed} returned no result`).toBeDefined();
            expect(
              result.rounds,
              `${cellLabel} seed=${seed} did not advance any rounds`,
            ).toBeGreaterThan(0);
          }
        });
      }
    }
  }
});
