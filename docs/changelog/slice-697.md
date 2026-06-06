# Slice 697 — fix: tactical movement converges instead of stalemating

**Type:** Engine fuzz-harness behavior fix. The slice-695 tactical movement policy let combatants kite to opposite arena edges and hold there until the round cap, producing draws. This replaces the flee/kite/close cascade with a round-leashed desired-distance model so the gap to the enemy trends down to melee every round. `movement: 'none'` stays byte-identical.

## Why

The dnd-web consumer reported tactical battles stalemating: e.g. seed 42 (1v1 and 2v2) ran the full 20 rounds to a DRAW, with combatants camped at the fixed 1v1 spawns (~65 ft apart) and a low-HP combatant repeatedly drinking potions to reset, so neither side closed. Measured baseline over seeds 1-40 × {1v1, 2v2}: **5.0% draws (4/80), 4 battles at the round cap**. The round cap is a safety net, not a fix; the goal is behavioral convergence.

Root causes (all in `planTacticalMove`):
1. **No closing pressure** — a ranged combatant held at max range indefinitely.
2. **Unbounded flee/kite** — the flee branch's line-of-sight-break bonus dominated the distance term, so a wounded combatant ran to any sightless corner regardless of distance; with healing it never re-engaged.
3. **Mutual non-engagement** — when neither side closed, nothing escalated toward the round cap.

## The fix: a round standoff leash

`planTacticalMove` is rewritten ([scripts/tactical/policy.ts](../../scripts/tactical/policy.ts)) around a single idea — every combatant has a **desired distance** to its enemy (melee → reach; ranged → kite standoff; fleeing → back off), and a **round leash** caps that distance and shrinks each round:

```
maxStandoffFeet(round) = max(MIN_STANDOFF_FEET, INITIAL_STANDOFF_FEET - CLOSE_RATE_FEET_PER_ROUND * (round - 1))
```

`INITIAL_STANDOFF_FEET` (50) sits below the 1v1 spawn gap, so both sides close from turn one; by the round the leash reaches its floor (5 ft) even a kiter or fleer is forced into melee. This subsumes a "no-progress detector" — the pressure is unconditional and monotonic, so the gap can only trend down. The decision is still pure and RNG-free: among `reachableCells`, score = strong line-of-sight preference (a combatant must see its enemy to attack) − |distance − desired|, with sub-one-cell cover / corner / stay tiebreaks, chosen through the explicit `(score, x, y)` total order.

Specific cause fixes:
- **Closing pressure / mutual non-engagement** — the leash forces convergence by ~round 6.
- **Bounded flee** — flee now targets the leash edge with line-of-sight-break demoted to a sub-one-cell tiebreak (`FLEE_BREAK_LOS_BONUS = 4`), so a wounded combatant backs off only as far as the leash allows and is pulled back in as it shrinks. This was the residual draw (seed 29) the first cut still had.
- **Stay bias** (`STAY_BIAS_BONUS = 0.1`, the smallest tiebreak) — when the current cell is already optimal, hold rather than shuffle sideways to an equally-scored neighbour (no jitter; correct "stay and act").

The move policy threads the encounter round into the pure function ([scripts/tactical/move-policy.ts](../../scripts/tactical/move-policy.ts)).

## Test-oracle fix (`normalizeEvents`)

Slice 697's new melee convergence makes a Rogue reliably land sneak attack, which surfaced a latent blind spot in the slice-693 determinism oracle: some ids are compound, `<effectInstanceUlid>:sneak-attack`, and `normalizeEvents` only interned **whole-string** ulids, so the embedded per-run ulid leaked into the same-seed compare and looked like a divergence. The battle was fully deterministic. Fixed by interning ulid **substrings** globally (`/[0-9A-HJKMNP-TV-Z]{26}/g`), so compound ids normalize too. This strengthens the oracle for every test that uses it.

## Results

Over seeds 1-40 × {1v1, 2v2} (the consumer's matrix, 80 battles):

| | draws | avg rounds | at round cap |
|---|---|---|---|
| Before (slice 695) | 4 (5.0%) | 6.1 | 4 |
| After (slice 697) | **0 (0.0%)** | 4.8 | 0 |

Seed 42 1v1 and 2v2 now resolve in **3 rounds**. Movement is preserved (≈9 `CombatantMoved` per battle across the matrix) — early rounds still kite + use cover, then close. Over a wider seeds 1-60 × {1v1, 2v2} sweep the draw rate is 1.7%; the two residuals are low-HP slugfests (both combatants near death, healing + misses stalling the kill), not edge-camping — a qualitatively different, acceptable outcome.

## Files

- Edited: [scripts/tactical/policy.ts](../../scripts/tactical/policy.ts) (leashed model + `maxStandoffFeet`, `round` on the input), [scripts/tactical/constants.ts](../../scripts/tactical/constants.ts) (leash + standoff + stay-bias constants), [scripts/tactical/move-policy.ts](../../scripts/tactical/move-policy.ts) (thread round), [tests/fixtures/index.ts](../../tests/fixtures/index.ts) (`normalizeEvents` compound-ulid interning), [tests/unit/tactical-policy.test.ts](../../tests/unit/tactical-policy.test.ts) (new-model assertions + leash schedule), [tests/audit/fuzz-tactical-matrix.test.ts](../../tests/audit/fuzz-tactical-matrix.test.ts) (convergence assertion).
- Added: [docs/changelog/slice-697.md](slice-697.md).

## Tests

- `npx tsc --noEmit` clean; full `npx vitest run` green.
- `tactical-policy` unit (15): role classification, total-order selection, `maxStandoffFeet` schedule + monotonicity, melee close / hold-adjacency, ranged kite-out / close-when-beyond-standoff / hold-then-forced-close-by-round, bounded-flee (early backs off, late cannot retreat), determinism.
- `fuzz-tactical-matrix` audit: convergence — **draw rate ≤ 3% across seeds 1-40 × {1v1, 2v2}** (pinned threshold; observed 0%, baseline 5% would fail), seed 42 1v1 resolves; plus the existing complete/replay/positive-presence checks.
- `s-tactical-movement` golden: same-seed determinism now passes via the fixed oracle (and exercises the compound-id path).
- Byte-identity for `'none'`: fuzz-matrix + replay-equivalence + default-guard pass unchanged.

## RNG impact / Breaking change

**No RNG impact in `'none'` mode** (the default) — the policy runs tactical-only; the seam is still `NO_MOVE` for `'none'`. The tactical event stream changes vs slice 695 (combatants now converge), but tactical mode is new in this release cycle and behind the option, so no consumer relies on the old kiting transcript. No engine `src/` change; no API change.

## Audit (Uncle Bob)

- **SRP / purity**: convergence logic stays in the pure `planTacticalMove`; the orchestration only threads the round. The model collapsed three special-case branches into one desired-distance score — less code, clearer intent.
- **No magic numbers**: the leash (`INITIAL`/`RATE`/`MIN`), the kite standoff, and every scoring weight (with the stay-bias < corner < cover < flee-LoS < LoS ordering documented) are named constants.
- **Determinism**: still RNG-free; arbitrary-order `reachableCells` runs through the explicit total order; the stay-bias removes nondeterministic-looking lateral jitter.
- **Pattern-check (the oracle)**: the compound-ulid leak is a class — any `<ulid>:<name>` id. Fixed at the root (substring interning) rather than special-casing `triggerId`, so every current and future compound id normalizes.
