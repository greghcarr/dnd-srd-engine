# Slice 844 — L7 audit tracker tidy-up (Area 7 closure + Rollup refresh)

**Type:** Doc-only bookkeeping. No engine, content, schema, or test change.

## The drift

Three Area-7 rows were lineage-parents whose work had fully shipped via their split child rows, but whose IDs were never struck through — so an automated open/closed scan counted them as open when they weren't:

- `drain-undead-arms` — closed across slices 832 → 834 → 835 (the child `drain-undead-extra-arms` → `drain-undead-shadow`).
- `drain-undead-extra-arms` — closed by slice 834 + the split `drain-undead-shadow` (slice 835).
- `legendary-lair-actions` — closed by slices 839 + 840 (the split `legendary-actions-pool`).

The top-of-doc **Rollup** table also still showed the pre-slicing counts (compiled 2026-06-09): an `Items / Blockers / Divergences / Quirks` shape that predated ~50 closures and the row-splits, and the "Recommended order" prose still listed `multiattack` as "sweep underway" and `background-ability-bonus` as an open blocker (both long since closed).

## What changed

- **Struck the three Area-7 lineage-parent rows** and rewrote their trailing "Still open …" clauses into closure markers (which slice closed which split). Area 7 now reads **0 open / 21 closed** — fully closed, matching reality.
- **Replaced the Rollup** with a current-state tracker: `Open / Closed / open severity (B/D/Q) / owner of open work / status`, totalling **69 open, 46 closed (115 rows)**. Areas 1 and 7 are flagged fully closed; Area 9 (+ the consumer half of Area 3) is flagged as a dnd-web/doc hand-off rather than engine slices. Added a note that a row ≠ a slice (rows fan out), so the open count is a floor on remaining engine slices.
- **Refreshed the "Recommended order"** prose: all structural blockers struck as closed; forward guidance now points at the real frontier — Area 2 (spells, 20) and Area 8 (exploration, 13) as the largest engine blocks, then the smaller Area 4/5/6 cleanups and the engine half of Area 3.

No tracked finding changed state on the merits — this only makes the tracker's own counts read true.

## Verification

`doc-size` + `doc-links` audits green. An open/closed scan confirms Area 7 → 0 open and the totals (69 open / 46 closed) match the refreshed Rollup. No code path touched.
