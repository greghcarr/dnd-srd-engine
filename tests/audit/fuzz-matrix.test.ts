// Slice 644 / 651 / 674: fuzz matrix audit (L1 + L2 + L3 across
// combat shapes + rests).
//
// History:
//   - Slice 643: L2 fuzz floor (1 cell: L2 / 1v1 / PC / rest=none).
//   - Slice 644: extended to a 24-cell matrix (L1+L2 × 4 shapes × 3 rests).
//   - Slice 651: extended LEVELS from [1,2] to [1,2,3] (36 cells).
//   - Slice 674: SEEDS_PER_CELL bumped 20 → 30 (L3 surface needs
//     wider coverage given the 8 spell-wiring slices 665-672 + the
//     L3 planners shipped in 646-648 + the resource scaffolding in
//     650). 36 cells × 30 seeds = 1,080 battles per CI run.
//
// Matrix (48 cells, 30 seeds each = 1,440 battles per CI run):
//   - Levels:  1, 2, 3, 4
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
// Slice 709: extended from [1, 2, 3] to [1, 2, 3, 4] to cover the L4
// surface — every class's L4 Ability Score Improvement choice (slice
// 707) is resolved by `drainPendingChoices` as each fuzz character
// levels to 4 (it walks the feat → +2/+1 allocate → ability-picker
// cascade), plus Monk Slow Fall / Fighter Second Wind 3 at L4.
// Slice 725: extended to L5 — Extra Attack (the five martial classes),
// 3rd-level slots (full casters) / 2nd (half-casters), and the L5
// feature cohort (slices 718-724: Font of Inspiration, Sorcerous
// Restoration, Sear Undead, Wild Resurgence, Faithful Steed, Tactical
// Shift, Memorize Spell). No new level-up choices at L5, so
// drainPendingChoices reaches L5 unchanged.
const LEVELS = [1, 2, 3, 4, 5] as const;
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
// Slice 674: bumped 20 → 30 to widen the L3 net post the 8 spell-
// wiring slices (665-672) that introduced new event chains, plus
// the L3 RAW behavior closures (661-664). 30 seeds per cell × 36
// cells = 1,080 battles per CI run; ~10ms/battle = ~10s wall-clock.
const SEEDS_PER_CELL = 30;

describe('slice 644 / 651 / 674 / 709 / 725: fuzz matrix audit (L1-L5 across shapes + rests)', () => {
  it(`enumerates ${LEVELS.length * SHAPES.length * RESTS.length} matrix cells (${LEVELS.length} levels x ${SHAPES.length} shapes x ${RESTS.length} rests)`, () => {
    expect(LEVELS.length * SHAPES.length * RESTS.length).toBe(60);
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
