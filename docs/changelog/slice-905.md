# Slice 905 — Reconcile the engine-scope encumbrance note (`engine-scope-encumbrance-doc`)

**Type:** Docs (scope reconciliation). Closes the last engine-repo Area-9 row — **no engine-repo rows remain in the L7 audit.**

## The gap

[engine-scope.md](../engine-scope.md) listed "Carry weight / encumbrance" under **What your app tracks** with "Not modeled. Item weights live on definitions, but the engine ships no encumbrance derivation." That was true once, but slices 863/865/866 modeled it: `computeCarryingCapacity` (size-scaled carry + push/drag/lift), `computeEncumbrance` (binary `overCapacity`), the automatic over-capacity Speed-≤-5 cap, and `computeJumpDistances`. The doc told consumers to track something the engine now derives.

## The fix

- Removed the stale "Not modeled" bullet from **What your app tracks**.
- Added a **What the engine tracks** entry describing what's actually derived: `computeCarryingCapacity` (STR × 15 × size factor, Goliath Powerful Build counting one size larger, plus the double push/drag/lift), `computeEncumbrance`'s binary `overCapacity`, the automatic over-capacity Speed cap (slice 866), and `computeJumpDistances` (slice 863) — with the genuine residual called out (item weights are authored on item definitions; the engine sums them from the inventory).

## Counts

No count change — docs only.

## Audit

- Struck `engine-scope-encumbrance-doc`; Rollup: **Area 9** `7 → 6` open / `1 → 2` closed (`0/3/4 → 0/3/3`, owner now pure Consumer); **Total** `16 → 15` open / `101 → 102` closed / `0/6/10 → 0/6/9`. With this and slice 904, **the L7 audit has no engine-repo rows left** — every open row is a consumer hand-off (tracked in [consumer-handoff-dnd-web.md](../consumer-handoff-dnd-web.md)).

## Verification

`doc-size` + `doc-links` + `doc-counts` audits green.
