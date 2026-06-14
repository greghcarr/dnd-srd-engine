# Slice 859 — doc reconcile after the 849–858 run (spell-wired count + L7 frontier)

**Type:** Docs only (no source change). Syncs the session-level narrative surfaces the per-slice doc updates didn't touch.

## What drifted

The 849–858 run kept the per-slice surfaces current (changelog, audit rows + rollup table, condition counts), but two session-level figures went stale:

1. **Spell-wired count.** Slices 851 (Resilient Sphere) and 852 (Banishment) moved two L4 spells from `mechanicalEffects: []` (deferred / schema-only) to **wired**, but `gaps-spells.md` and the wired-count citations still read 209 / 62. That count is CI-guarded by `scripts/review-doc-figures.mjs` (it sums the `gaps-spells.md` per-level `N wired` headers and cross-checks the citations), so it has to move as a set.
2. **L7 "Recommended order" prose** still said Area 2 had "20" open (now 13) and predated the save-derivation sweep.

## What shipped

- **`gaps-spells.md`** — the **L4** header `18 wired … 10 deferred` → `20 wired … 8 deferred`; `banishment` (slice 852) and `resilient-sphere` (slice 851) walked from the L4 Deferred list into **Wired, cast-time**; the top-of-doc "deferred by primitive" summary updated (cross-plane-travel `~11 → ~10` minus banishment; force-cage `(3) → (2)` minus resilient-sphere).
- **Wired-count citations bumped 209 → 211 / schema-only 62 → 60** across `getting-started.md`, `starter-pack-gaps.md` (cast-time sub-tally 160 → 162), `status.md` (×3), and `README.md`. `npm run release:doc-review` now reports **"wired count 211 MATCHES the cited lines"**; `gaps-spells-counts` stays green (per-level `20 + 6 + 8 = 34`).
- **`l7-completion-audit.md` "Recommended order"** — Area 2 `20 → 13 open`; refreshed to name the current Area-2 frontier (the L4 summons/auras/charm block + the two damage-pipeline primitives) and to record that 849–858 closed the unwilling-save-on-buff primitive, Blindness/Deafness, Banishment, the whole raw-mod-save-bypass bug class, and the Graze / auto-crit-reach quirks.

Pre-existing acknowledged drift in `gaps-spells.md` (the line-23 `198 wired / 73 deferred` top summary, which the doc itself flags as needing a full slice-337-style reconcile) is left as-is — it predates this session and is independent of the CI-guarded per-level headers.

## Verification

`npm run release:doc-review` → wired 211 MATCHES; `gaps-spells-counts` + `doc-size` + `doc-links` + `doc-counts` green; `npm run test:fast` green (637 files, 4804 passed). No source/test change.
