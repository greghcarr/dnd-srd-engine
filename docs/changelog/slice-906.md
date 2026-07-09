# Slice 906 — Reconcile the consumer hand-off status (dnd-web wired the light / cover / aim seams)

**Type:** Docs (consumer-seam reconciliation). Closes **Area 9** entirely and 6 of Area 3's open rows — the L7 audit drops to **3 open consumer QUIRKs**.

## The gap

Slice 902 shipped [consumer-handoff-dnd-web.md](../consumer-handoff-dnd-web.md) as the prioritized task list for the dnd-web session, with the convention (slice 902) that *consumer rows close when dnd-web wires them.* The dnd-web session has since wired four of the seams, but neither doc reflected it: the hand-off doc's per-gap "WIRED" notes were staged uncommitted, and the [L7 audit](../l7-completion-audit.md) still listed all the consumer rows as open (15 open / 102 closed).

## The fix

- **Committed the verified hand-off status** in `consumer-handoff-dnd-web.md`: gaps #1 (`lightLevel`), #2 (cover), #3 (AoE `aim`), and #7 (Storm's Thunder dispatch) are **WIRED** in dnd-web; #4 (sight facts) and #5 (weapon-instance) are **verified consumer-N/A** (no darkness model / no weapon picker yet); #6 (group checks) stays open. Each claim verified against the `../dnd-web` checkout — the cited commits exist (`99a8809` lightLevel, `4ec867e` cover, `ca00ac3` aim, `0c03feb` Storm's Thunder).
- **Struck the 12 now-satisfied consumer rows** in the L7 audit, each annotated with the dnd-web commit or the 2026-06-18 survey reference:
  - **Area 3 (6):** `positionless-range-los-trusts-consumer`, `cover-not-derived`, `lightlevel-packtactics-underfire`, `reaction-recentevents-required`, `reaction-economy-sequencing`, `encounterview-omits-scene-state`.
  - **Area 9 (6):** `consumer-populate-positions`, `consumer-populate-lightlevel`, `consumer-supply-cover`, `consumer-reaction-recentevents`, `consumer-scene-state-authority`, `consumer-aoe-geometry`.
- **Annotated (kept open) the two verified-N/A Area 3 QUIRKs** — `frightened-dodge-facts-overstrict-default` and `weaponinstance-not-validated` — with the verified reason they're not actionable in dnd-web today (uniform `'bright'` light; no weapon picker). RAW-safe defaults hold; they become real work only once a darkness model / weapon picker lands.
- Rewrote the Rollup preamble, per-area table, Area 3 / Area 9 intros, and the recommended-order prose to match.

## Counts

No content count change — docs only.

## Audit

- Rollup: **Area 3** `8 → 2` open / `6 → 12` closed (`0/3/5 → 0/0/2`); **Area 9** `6 → 0` open / `2 → 8` closed (**fully closed**); **Total** `15 → 3` open / `102 → 114` closed / `0/6/9 → 0/0/3`. The 3 remaining rows are all QUIRKs: the two consumer-N/A seams (Area 3) and `no-group-check-helper` (Area 8).

## Verification

- dnd-web commits cross-checked against the `../dnd-web` sibling checkout (all four present).
- `doc-size` + `doc-links` + `doc-counts` audits green (`l7-completion-audit.md` and `consumer-handoff-dnd-web.md` are worklists, not doc-size-guarded front-door docs).
