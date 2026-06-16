# Slice 884 — doc reconcile: `alert-initiative-swap` was already closed by slice 468

**Type:** Doc reconcile (no source / test change). Corrects a stale row + the Rollup counts in [docs/l7-completion-audit.md](../l7-completion-audit.md).

## What was wrong

The Area-5 row `alert-initiative-swap` read: *"The Initiative-Proficiency arm is wired; the swap-initiative-with-an-ally arm isn't (likely intentional)."* That's stale — **slice 468 wired both Alert arms**, including the swap.

RAW (Alert, Origin Feat): *"Initiative Swap. Immediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition."*

## What already exists (slice 468)

A full planner / event / reducer triple:

- `engine.plan.swapInitiative` → `planSwapInitiative` (`src/engine/plan/encounter.ts`) validates: the swapper has the Alert feat (effective feat list), the encounter is in `planning` status (RAW "immediately after you roll Initiative" — before the first turn), no self-swap, and neither the swapper nor the ally is Incapacitated. Willingness is consumer-asserted (a narrative fact the engine doesn't model — the consumer only offers a willing ally).
- `InitiativeSwapped` event (registered in `src/schemas/events/encounter.ts` + the union + the transcript formatter).
- `applyInitiativeSwapped` (`src/engine/reducers/encounter.ts`) exchanges the two combatants' `initiative` values and recomputes `initiativeOrder` across the whole list (the same descending sort `applyInitiativeRolled` runs), so a subsequent swap or `EncounterStarted` reads a consistent order.

Guarded by `tests/unit/engine/slice-468-alert.test.ts` — 9 tests, of which 7 cover the swap: a successful swap exchanges the initiatives; rejections for no-Alert, swapper-Incapacitated, ally-Incapacitated, self-swap, and post-`startEncounter` (planning-status) ; and the post-swap `initiativeOrder` recomputation across three combatants.

The auditor simply missed that slice 468 (much earlier than the audit pass) had already covered the swap arm — the "likely intentional" guess was wrong.

## The reconcile

- Struck the Area-5 `alert-initiative-swap` row, pointing at the slice-468 closure + its test guard.
- Rollup: **Area 5** `3 → 2` open / `8 → 9` closed / `0/1/2 → 0/1/1`; **Total** `34 → 33` open / `83 → 84` closed / `0/13/21 → 0/13/20`. Row count unchanged at 117 (the row moved open → closed).

No engine behavior changed — slice 468 did the work; this only makes the audit reflect it. Same shape as the slice-868 / slice-877 cross-reference reconciles.

## Verification

Docs only. The cited `slice-468-alert.test.ts` is green (9 tests). `doc-size` + `doc-links` + `doc-counts` audits green; the table and Rollup are internally consistent (`33 + 84 = 117`).
