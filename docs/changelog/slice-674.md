# Slice 674 — tests: L3 fuzz floor (widen seed coverage post-L3-cycle)

**Type:** Audit refresh. **Fourteenth slice of the post-L3-RAW completeness push.**

The slice-645 L3 floor audit noted "L3 fuzz floor (deferred until the L3 punch-list xfails close; mirrors slice 643/644's place in the L2 cycle)." Slice 651 actually flipped LEVELS to `[1, 2, 3]` in `fuzz-matrix.test.ts` once the punch-list xfails closed (slices 646-648). So L3 fuzz coverage has been live since slice 651. Slice 674 is the **widening pass** post the 8 spell-wiring slices (665-672) + L3 RAW closures (661-664) that grew the L3 event surface substantially.

## What's wired

- `SEEDS_PER_CELL` bumped 20 → 30. 36 matrix cells × 30 seeds = **1,080 battles per CI run** (was 720). ~10s wall-clock cost (was ~5s).
- Header comment updated with the slice 643 → 644 → 651 → 674 history.
- `describe` title updated from "slice 644: ... (L1+L2)" to "slice 644 / 651 / 674: ... (L1+L2+L3)" reflecting the true scope.

## Scope decisions

- **30 seeds / cell, not 50**: 30 gives 50% more L3 coverage than 20 without breaking the ~10s wall-clock budget. The CLI (`combat-fuzz.ts`) remains the harness for deep multi-thousand-seed sweeps when chasing specific regressions.
- **No new cells**: 4 shapes × 3 rests stays appropriate. Adding party-of-4, additional rest cadences, or multiclass mixes would be a future expansion (note: slice 676 covers multiclass fuzz support specifically).

## Files

- **[../../tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts)**: header history updated; SEEDS_PER_CELL 20 → 30; describe title widened.

## Tests

- `npx vitest run tests/audit/fuzz-matrix.test.ts`: 37/37 pass in ~13s (was ~5s at 20 seeds).

## Verification

- `npx tsc --noEmit`: clean.

## Open follow-ups

- ~~660-673~~: L3 RAW behavior + 8 spell-wiring primitives + L2/L3 fully wired + triple-class audit. Landed.
- ~~674 (this slice)~~: L3 fuzz floor widening. Landed.
- **675**: Auto-populate `recharge` on `ResourceState` from grants.
- **676**: Multiclass fuzz support.

**Deferred**:
- 4-PC parties + intervening rests in single fuzz battle (multi-encounter campaigns).
- Multiclass fuzz integration (slice 676 covers).
