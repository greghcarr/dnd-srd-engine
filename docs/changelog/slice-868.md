# Slice 868 — doc reconcile: the already-closed `exhaustion-6-not-fatal` Area-8 cross-ref

**Type:** Doc reconcile (no source / test change). Corrects a stale row + the Rollup counts in [docs/l7-completion-audit.md](../l7-completion-audit.md).

## What was wrong

`exhaustion-6-not-fatal` (Exhaustion level 6 = death) appears as a full table row in **two** areas: its primary in Area 4 (Core combat correctness) and a cross-ref in Area 8 (Exploration). Slice 800 closed it — both exhaustion mutation paths (`ConditionApplied`'s exhaustion branch and `ExhaustionChanged`) call the shared `markCreatureDead` helper when exhaustion reaches `EXHAUSTION_MAX`, verified at `src/engine/reducers/combat.ts:194,316` — and struck the **Area 4** row, but the **Area 8** cross-ref row was left unstruck.

Because the Rollup counts every table row exactly once (`open + closed = 117 rows`), this phantom open row inflated Area 8's open count and registered a non-existent open DIVERGENCE there. So Area 8 read "6 open · 0/1/5" when the truth was "5 open · 0/0/5" (quirks only, like Area 4).

## The reconcile

- Struck the Area-8 `exhaustion-6-not-fatal` row, pointing at the slice-800 closure on the Area-4 row.
- Rollup: **Area 8** `6 → 5` open, `8 → 9` closed, `0/1/5 → 0/0/5` (now "open — quirks only"); **Total** `49 → 48` open, `68 → 69` closed, `0/21/28 → 0/20/28`. Row count unchanged at 117 (the row moved open → closed, not added/removed).
- Refreshed the "Recommended order" Area-8 figure (`6 → 5`) and noted it is now quirks-only.

No engine behavior changed — slice 800 did the work; this only makes the audit reflect it. The remaining Area-8 open rows are all QUIRKs: `falling-averaged-not-rolled`, `no-suffocation`, `no-environmental-hazards`, `long-rest-no-24h-lockout`, and the consumer-owned `no-group-check-helper`.

## Verification

Docs only. `doc-size` + `doc-links` audits green; the audit table and Rollup are internally consistent (`48 + 69 = 117`).
