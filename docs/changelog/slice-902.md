# Slice 902 — Consumer hand-off doc for dnd-web

**Type:** Docs (consumer hand-off + audit reconciliation). Not an audit-row *closure* — a distillation of the open consumer-owned rows into an actionable, wiring-status-verified task list for the dnd-web session, now that the engine half of the L7 audit is complete (slice 901 closed the last engine row).

## What shipped

New [docs/consumer-handoff-dnd-web.md](../consumer-handoff-dnd-web.md): the prioritized list of consumer-coordinated seams dnd-web must wire, grounded in a **read-only survey of the dnd-web checkout (2026-06-18)** so each item carries its real current status, not a generic "the consumer should…".

Key findings from the survey:

- **Already wired** (so the hand-off doesn't re-request them): combatant positions + map + cell size (`positionless-range-los-trusts-consumer` / `consumer-populate-positions`), `recentEvents` → `reactionsForTrigger` (`reaction-recentevents-required` / `consumer-reaction-recentevents`), and per-intent reaction dispatch/commit (`reaction-economy-sequencing`). dnd-web's scene model is already the cover/light/position authority (`consumer-scene-state-authority`).
- **Live gaps** (priority order): `lightLevel`, cover (`AttackIntent.cover` + `CastSpellIntent.coverByTargetId`), AoE membership via `CastSpellIntent.aim`, then the sight facts (`attackerCanSeeTarget` / `targetCanSeeAttacker` / `bearerCanSeeFearSource`), weapon-instance validation, and a group-check affordance.
- **dndbnb** is a merged React subtree at `dnd-web/src/dndbnb/` (not a separate consumer), so there is only one consumer session to coordinate.

## Audit reconciliation

- `consumer-aoe-geometry` was **stale**: it read "until `aoe-shape-coverage` ships an engine helper," but that BLOCKER closed at slices 786/787 (the `coveredCells` rasterizer + opt-in `CastSpellIntent.aim`, now corner-aware per slice 901). The row is re-pointed: the hand-off item is for dnd-web to **adopt `aim`** instead of trusting hand-picked `targetIds`.
- The Area-9 intro now links the hand-off doc and records the three already-wired consumer rows + the two **engine-side residuals** that are *not* dnd-web's job: `engine-scope-encumbrance-doc` (an engine doc reconciliation) and `verify-reaction-registry-l1-7` (an engine verify). These two are the only remaining engine-repo tasks; everything else open is genuinely consumer work.

## No row struck

No audit row is *closed* by this slice — the consumer rows close when dnd-web wires them (its session's work), and the two engine residuals are tracked for a later engine slice. Rollup counts are unchanged (17 open / 100 closed).

## Counts

No count change — docs only.

## Verification

`doc-size` (the new doc is not a size-capped front-door doc and is well under the ceiling; CHANGELOG stays under 60 KB), `doc-links` (the new cross-links resolve), and `doc-counts` audits green.
