# Slice 882 — falling damage is rolled, not averaged

**Type:** Engine (falling planner). Closes the L7 audit Area-8 quirk `falling-averaged-not-rolled`.

## RAW

rules-glossary "Falling": *"the creature takes 1d6 Bludgeoning damage for every 10 feet it fell, to a maximum of 20d6."* The damage is **rolled**.

## What was wrong

`planFalling` substituted the fixed average — `round(dice × 3.5)` — for the dice. A 30-ft fall always dealt 11 (the average of 3d6), never anything in the legal 3–18 range. Every other damage source in the engine rolls; falling was the lone averaged outlier.

## The fix

`planFalling` already received the plan/commit `rng` (it uses it for the post-damage Concentration check), so the change is local: a new `rollFallingDamage(distanceFeet, rng)` rolls `1d6` per 10 ft fallen (capped at 20 dice) through the shared `rollDie(6, rng, 'damage')` — the same draw path as weapon/spell damage, so it's deterministic under replay capture and varies by seed. A sub-10-ft fall rolls no dice and is guarded to return **before** drawing any RNG, so a no-op fall stays byte-identical. The averaged helper (`expectedFallingDamage` / `FALLING_DIE_AVERAGE`) is removed.

Ordering is unchanged: the dice roll happens first, then the Slow Fall reduction (arithmetic, no RNG), then mitigation, then the Concentration check — so the Slow Fall arm subtracts `5 × monk level` from the *rolled* total exactly as before.

## Tests

- New `tests/unit/engine/slice-882-falling-rolled.test.ts` (5 tests): a 50-ft fall lands in [5, 30]; the total varies across seeds (a fixed average never could); the 20d6 cap (200-ft and 500-ft falls share the [20, 120] envelope); determinism under a fixed seed; a sub-10-ft fall deals 0.
- Updated `tests/unit/engine/plan-falling-slow-fall.test.ts`: the three exact-average assertions became roll-aware — the two "reduced to 0" cases now cite dice maxima below the reduction (3d6 < 20 at L4 30 ft; 6d6 < 40 at L8 60 ft, guaranteed for any roll), and the 200-ft case compares a same-seed no-Slow-Fall roll against the Slow-Fall total to prove the exact `−20` reduction without pinning a specific roll.

## Goldens

Regenerated the two transcripts that include a fall: `s14-environmental` (30-ft fall 11→12, 300-ft fall 70→67) and `showcase` (Vex's 20-ft fall 7→4, plus the downstream RNG-stream shift — the fall now consumes dice draws it previously didn't, so subsequent attack/damage rolls shift; combat still resolves consistently). Diff inspected: every change is attributable to the rolled fall + that stream shift.

## Counts

No count change — no new condition, effect kind, or wired spell. `doc-counts` untouched.

## Audit

- Struck `falling-averaged-not-rolled` (Area 8 QUIRK).
- Rollup: **Area 8** `5 → 4` open / `9 → 10` closed / `0/0/5 → 0/0/4`; **Total** `36 → 35` open / `81 → 82` closed / `0/13/23 → 0/13/22`. "Updated through slice 882."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (657 files, 4901 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
