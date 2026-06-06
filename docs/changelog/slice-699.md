# Slice 699 — revert: restore the slice-695 kiting tactical policy (accept draws again)

**Type:** Behavior revert. Undoes the slice-697 convergence push. Tactical battles go back to the slice-695 flee/kite/close cascade and accept stalemate draws, as they did at the 0.5.0 release. The slice-698 Push correctness fix and the slice-697 `normalizeEvents` oracle improvement are **kept** (both orthogonal to draws).

## Why

Slice 697 added a round standoff leash so tactical battles always converged to a decisive outcome (0 draws). The user decided that forcing convergence wasn't wanted and that accepting draws (the slice-695 behavior, shipped in 0.5.0) is preferable. This reverts the convergence behavior while keeping the genuine correctness fixes that landed alongside it.

## What was reverted

Restored to their slice-695 (commit 6e67feb) state:

- [scripts/tactical/policy.ts](../../scripts/tactical/policy.ts) — back to the flee/kite/close/stay cascade; the round-leashed desired-distance model (`maxStandoffFeet`, `RANGED_KITE_STANDOFF_FEET`, stay-bias) is gone, and `TacticalMoveInput` no longer carries `round`.
- [scripts/tactical/constants.ts](../../scripts/tactical/constants.ts) — back to the slice-695 policy constants (`MELEE_THREAT_DISTANCE_FEET`, `LOS_BREAK_BONUS`, `KITE_IN_RANGE_BONUS`); the leash / standoff / stay-bias constants removed.
- [scripts/tactical/move-policy.ts](../../scripts/tactical/move-policy.ts) — no longer threads the encounter round into the policy.
- [tests/unit/tactical-policy.test.ts](../../tests/unit/tactical-policy.test.ts) — back to the slice-695 cascade assertions.
- [tests/audit/fuzz-tactical-matrix.test.ts](../../tests/audit/fuzz-tactical-matrix.test.ts) — the slice-697 convergence/draw-rate assertion removed (the slice-698 move-legality guard stays; its seed list is renamed `LEGALITY_SEEDS`).

## What was kept (orthogonal to draws)

- **Slice 698 in full** — the engine Push forced-movement fix (`pushDestination` + the weapon-mastery / Open Hand call sites) and its move-legality matrix guard. A Push still lands on a legal, grid-aligned cell; that bug is real regardless of the movement policy.
- **The slice-697 `normalizeEvents` oracle fix** ([tests/fixtures/index.ts](../../tests/fixtures/index.ts)) — interning ulids inside compound `<ulid>:name` ids. It is a strictly-more-correct determinism oracle, unrelated to convergence, and guards against a false-positive determinism failure.

## Results

Draws are accepted again: ≈3.8% over seeds 1-40 × {1v1, 2v2} (3/80), and seed 42 1v1 draws at the 20-round cap. (Not identical to the pre-697 5.0% baseline because slice 698's legal-Push fix nudges a few outcomes — the policy is slice-695, the engine carries the kept Push fix.)

## Files

- Edited: the five files above + [CHANGELOG.md](../../CHANGELOG.md) (slice-697 entry annotated "Reverted by slice 699").
- Added: [docs/changelog/slice-699.md](slice-699.md).
- Unchanged (kept): slice 698's `src/derive/pathing.ts`, `src/engine/plan/weapon-mastery.ts`, `src/engine/plan/open-hand-technique.ts`, `tests/unit/derive/push-destination.test.ts`; and slice 697's `tests/fixtures/index.ts` oracle fix.

## Tests

- `npx tsc --noEmit` clean; full `npx vitest run` green.
- Tactical suite passes with the restored slice-695 policy: `tactical-policy` unit (12, the cascade tests), `fuzz-tactical-matrix` (slice-695 complete/replay/positive-presence + slice-698 legality), `s-tactical-movement` determinism (via the kept oracle fix), default-guard, setup, `push-destination`.
- Byte-identity for `'none'`: fuzz-matrix + replay-equivalence unchanged.

## RNG impact / Breaking change

**No RNG impact in `'none'` mode.** The tactical event stream reverts to slice-695 movement behavior (draws return). No engine `src/` revert — slice 698's engine Push fix is retained, so positioned Push remains correct for all consumers. No API change.

## Audit (Uncle Bob)

- **Surgical, not blanket**: reverted exactly the convergence behavior (policy + its tests + the convergence assertion), and deliberately kept the two orthogonal correctness improvements (the engine Push fix and the test-oracle fix) rather than throwing them out with the behavior change.
- **No dead code / no dangling refs**: the slice-698 legality test's shared seed constant was renamed (`LEGALITY_SEEDS`) since "convergence" no longer applies; no reference to the removed convergence symbols remains.
