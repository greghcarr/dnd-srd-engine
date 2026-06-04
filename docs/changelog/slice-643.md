# Slice 643 — tests: L2 fuzz floor

**Type:** Tests (audit-only). Fifth and last of the L2 hardening slices. **Closes the L2-complete gate.**

The four previous hardening slices (639-642) pinned static invariants — feature ids present, planners exported, resource max + recharge, spell-wired floor, multiclass build cleanliness. None of them exercised the engine end-to-end: a planner could throw mid-turn, an action-economy reset could desync, a reaction could fire in the wrong slot, and the static audits wouldn't notice.

Slice 643 closes that gap. It drives the existing combat-fuzz harness ([scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts), slice 600) at L2: 20 seeded 1v1 PC-vs-PC battles, each runs to completion (HP 0 or MAX_ROUNDS=20). The invariant: every battle completes without throwing.

All 20 seeds pass with the current engine. Average per-seed wall-clock: ~10ms. Total CI overhead: ~200ms.

## Why 20 seeds

20 is light by fuzz standards (the L1 cycle's slices 620-627 ran thousands), but it's the right shape for a **CI floor**: enough to surface "the engine throws on a common L2 path" within seconds, not enough to inflate every commit's CI duration. Deep multi-seed regression hunts remain the fuzz CLI's job (`npx tsx scripts/combat-fuzz.ts --count 1000 --level 2`); this audit is the always-on canary.

## What this audit catches vs. doesn't

| Catches | Doesn't catch |
|---|---|
| A planner that throws on a previously-valid intent | RAW-correctness of individual mechanics (per-feature unit tests own that) |
| A reducer that violates an invariant under L2 conditions | Per-seed reproducibility / transcript byte-stability (the fuzz CLI's job) |
| An RNG-stream desync that produces an invalid event | Soft balance issues (the audit accepts any winner or no winner) |
| A new condition / effect that the apply pipeline can't apply | Multi-encounter campaigns (one encounter per seed) |

## Files

- **[../../tests/audit/l2-fuzz-floor.test.ts](../../tests/audit/l2-fuzz-floor.test.ts)** (new): drives `runBattle({ level: 2, vs: 'pc', teamSize: 1, seed: N })` for `N ∈ [1, 20]`. Each test catches and re-throws with the seed in the error message so a regression points at the exact reproduction. Asserts `result.rounds > 0` as a sanity check (the engine actually advanced turns rather than no-opping).

## Tests

- `npx vitest run tests/audit/l2-fuzz-floor.test.ts`: 20/20 pass.
- Full suite: 508 files / 3521 passing + 173 skipped (was 507 / 3501; +1 file, +20 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: file name (`l2-fuzz-floor`) + test description format (`L${LEVEL} 1v1 PC-vs-PC, seed ${seed}: runs to completion without throwing`) name the audit's job precisely. Failure error message wraps the underlying throw with `combat-fuzz threw on L${LEVEL} seed=${seed}: ${msg}` so a regression points at the reproduction one grep away.
- **DRY**: leans entirely on the existing `runBattle` harness from `scripts/combat-fuzz-core.ts` (slice 600 explicitly factored the simulation out of the CLI for reuse). No new fuzz logic in this audit; just the level + seed parameter sweep.
- **SRP**: the audit's one job is "every L2 fuzz seed completes without throwing." It explicitly does NOT assert on winners, durations, or specific RAW behaviors — those belong to per-feature tests.
- **Magic numbers / strings**: `LEVEL = 2`, `SEEDS = [1..20]` — both named at the top. Tunable; raising seed count is a one-line edit.
- **Pattern-check**: when an L3 floor lands, an analogous `l3-fuzz-floor.test.ts` should be a near-copy (same scaffold, `LEVEL = 3`). The pattern generalizes; if it grows to many files, lift the seed-sweep into a helper. With one file, the abstraction is premature.

## Open follow-ups

L2 floor hardening punch list (slice 643 of 5):

- ~~639~~: Resource max-value pin. Landed.
- ~~640~~: Recharge cadence pin. Landed.
- ~~641~~: Spell wiring floor enforcement. Landed.
- ~~642~~: Multiclass L1+L1 build audit. Landed.
- ~~643 (this slice)~~: L2 fuzz floor. Landed.

**The floor is now genuinely defensible.** The L2-complete claim covers:

1. Every per-class L2 feature id is present (slice 633).
2. Every L2 feature with a planner has its planner exported (633-637).
3. Every L2 resource has the RAW max value at L2 (639).
4. Every L2 resource has the engine-modeled recharge cadence pinned (640).
5. Per-level wired-spell counts can't silently regress (641).
6. Every multiclass L1+L1 pair (66 combos) builds + derives without throwing (642).
7. 20 seeded L2 1v1 encounters run to completion without throwing (643).

**Next step (consumer-gated):** tag `v0.3.0-alpha.0` ("L2 SRD complete"). The release flow is documented in [VERSIONING.md](../../VERSIONING.md) and the slice-632 release notes. Per [CLAUDE.md](../../CLAUDE.md), the push / PR / merge / tag steps are explicit-user-instruction-only.

**Deferred (post-release enrichments)**:
- Raise the L2 spell wiring floor by mechanically wiring more L2 spells (currently 36/57 = 63%).
- Deepen the fuzz floor: 2v2, vs monsters, multi-encounter campaigns with intervening rests.
- Add multiclass fuzz seeds (L1 X + L1 Y characters in the encounters).
- Introduce the partial-recharge primitive (`partialShortFullLong`) noted in slice 640 to close the Channel Divinity + Wild Shape RAW deviations.
