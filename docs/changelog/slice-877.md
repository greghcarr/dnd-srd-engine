# Slice 877 — doc reconcile: the already-closed `prone-cant-crawl` Area-4 row

**Type:** Doc reconcile (no source / test change). Corrects a stale row + the Rollup counts in [docs/l7-completion-audit.md](../l7-completion-audit.md).

## What was wrong

Slice 867 (climb / swim / crawl movement-cost surcharge) added a `'crawl'` movement mode to `planMove` that keeps the mover Prone (no stand-up, no `ConditionRemoved`) and charges the +1 ft/ft crawl surcharge. That closed the Area-8 row `climb-swim-crawl-cost` (struck in slice 867) — **and** the Area-4 quirk `prone-cant-crawl`, whose two gaps were exactly "no crawl modality, and crawl's +1 ft/ft cost is unmodeled." But the Area-4 row was left unstruck.

Same shape as slice 868 (the exhaustion-6 cross-area miss): the closing slice struck one area's row and missed the sibling, so an open/closed scan over-counted by one.

## The reconcile

- Struck the Area-4 `prone-cant-crawl` row, pointing at the slice-867 closure.
- Rollup: **Area 4** `4 → 3` open / `8 → 9` closed / `0/0/4 → 0/0/3`; **Total** `40 → 39` open / `77 → 78` closed / `0/13/27 → 0/13/26`. Row count unchanged at 117 (the row moved open → closed).

No engine behavior changed — slice 867 did the work; this only makes the audit reflect it. Area 4 stays divergence-free (quirks only), now 3 open: `reaction-reset-timing`, `no-hostility-model`, `frightened-single-source-positional`.

## Verification

Docs only. `doc-size` + `doc-links` audits green; the table and Rollup are internally consistent (`39 + 78 = 117`).
