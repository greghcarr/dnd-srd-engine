# Slice 719 — content: Warlock Eldritch Invocation count labels match SRD 5.2.1

**Type:** Content accuracy (label fix). No engine change; no behavior change. L5-cycle content-drift cleanup.

The L5 audit found the Warlock's L5 Eldritch Invocations feature read "(4 known)" but SRD 5.2.1 grants 5 at L5. Pattern-checking the column found the whole progression was drifted, not just L5. These are display-only labels (`effects: []`) — the engine offers the L1 invocation choice and no more, so the per-tier gain/replace system is unwired (tracked in [docs/gaps-class-features.md](../gaps-class-features.md)) — but the labels should still read the SRD counts.

## What changed

Corrected the `name` of each Warlock `eldritch-invocations-*` feature to the SRD 5.2.1 "Eldritch Invocations" column:

| Level | was | now (SRD) |
|---|---|---|
| 1 | 2 known | **1 known** |
| 2 | 3 known | 3 known (unchanged) |
| 5 | 4 known | **5 known** |
| 7 | 5 known | **6 known** |
| 9 | 6 known | **7 known** |
| 12 | 7 known | **8 known** |
| 15 | 8 known | **9 known** |
| 18 | 9 known | **10 known** |

The feature **ids** keep their original numeric suffixes (`eldritch-invocations-2` etc.) — they're load-bearing for the L1/L2 complete audits, the slice-510–515 invocation tests, and the feature coverage snapshot (all key on the id, not the name) — so the suffix no longer tracks the count. Only the displayed `name` changed.

## Files

- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): 7 Warlock invocation `name` labels.
- [docs/gaps-class-features.md](../../docs/gaps-class-features.md): note the corrected counts + that the per-tier gain system is still unwired.
- [tests/unit/content/slice-719-warlock-invocation-counts.test.ts](../../tests/unit/content/slice-719-warlock-invocation-counts.test.ts) (new): pins each tier's label to the SRD count.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. Name-only change — the id-keyed L1/L2 audits, invocation tests, and coverage snapshot are unaffected.

## Audit (Uncle Bob)

- **SRD-faithful**: counts read from the SRD 5.2.1 Warlock table; the pin test encodes the source-of-truth mapping.
- **Pattern-check**: the L5 drift was checked against the whole column; all eight tiers corrected, not just the reported one.
- **No churn risk**: ids (the stable keys) untouched; only human-readable labels changed.
- **Honest**: the deeper gap (counts are display-only; the gain/replace system is unwired) is tracked, not papered over.
