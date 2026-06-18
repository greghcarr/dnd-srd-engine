# Slice 901 — Corner-aware line of sight / line of effect (`los-equals-loe`)

**Type:** Engine (derivation geometry). Closes the L7 audit Area-3 (Seam) quirk `los-equals-loe` — the **last engine-actionable row** in the whole audit.

## The gap

`hasLineOfSight` / `hasLineOfEffect` (`src/derive/terrain.ts`) walked a single **centre-to-centre Bresenham ray** and reported "blocked" if that one ray clipped any impassable cell or closed/locked door. That diverges from RAW two ways:

- **The corner rule.** The SRD treats the line-of-sight/effect origin as a *point* and the target as a *space*. An area of effect excludes a location only "if **all** straight lines extending from the point of origin … are blocked" (rules-glossary, "Area of Effect"), and Total Cover is the obstruction that "covers the **whole** target" (rules-glossary, "Cover"). A single centre ray under-reports: it calls a target blocked whenever the *centre* line clips a wall, even when a corner of the target is plainly exposed — and Bresenham's own corner-cutting could clip a cell no real sightline passes through.
- **Sight vs. effect.** The alias `hasLineOfEffect = hasLineOfSight` was flagged as an unsplit deferral.

## The fix

Both helpers are now **corner-aware**, computed in doubled cell coordinates (so a cell's centre and four corners are integer lattice points and the geometry is exact, no floats):

- Origin = the source cell's **centre**; target sample points = the target cell's **centre + four corners**.
- A target is reachable iff **at least one** straight line from the origin to one of those five points is unobstructed — i.e. blocked only when *every* line is blocked, matching the RAW "all straight lines … blocked" / "covers the whole target" language.
- A **"both shoulders" seam rule**: where a ray passes exactly through a cell corner (the junction of four cells), the diagonal is sealed iff the two flanking cells are both blockers — so a sightline never leaks through the seam where two solid walls meet (the diagonal-squeeze case). Off-map cells seal like walls (a map edge is a wall).

Each ray's obstruction test is an exact integer segment-vs-open-cell-interior check (Liang–Barsky with fraction comparisons), iterated over the small bounding box of the two endpoints.

## Sight = effect stays a deliberate identity

The audit row's "sight-vs-effect distinction" half is **moot** in the current terrain vocabulary: every blocker — impassable terrain, a closed/locked door, off-map — stops **both** sight and effect, and nothing stops only one (no see-through-but-solid glass wall, no solid-but-see-through magical darkness). So `hasLineOfEffect === hasLineOfSight` is *correct*, not a gap. The alias is kept as the obvious split point for a future one-sided blocker.

## Why it's non-regressive

Every blocker in the existing terrain / golden / tactical-policy tests sits **directly between** its endpoints (same row, column, or diagonal, with no room to route around) — exactly the case where the corner rule agrees with the old single ray. So all of them stay byte-for-byte the same answer; the corner rule only changes genuine corner-peek cases the old ray got wrong (e.g. a target whose far corner pokes past a single pillar). The new test pins one such flip explicitly.

## Pattern-check

All consumers of the two helpers route through the single rewritten pair, so the fix lands everywhere at once: the AoE rasterizer (`_spell-area.ts` line of effect), `legalTargets` / `legalSpellTargets` / `creatureCandidatesInRange` (`affordances.ts`), the spatial gates (`_spatial-gates.ts`), and the tactical-move policy (`tactical-policy.ts`). `bresenhamCells` is untouched (it stays the cell walk that `movement.ts` uses for step-cost summation — a different job).

## Tests

New `tests/unit/derive/slice-901-corner-line-of-sight.test.ts` (8 tests): open map clear; same/adjacent cell clear; a target whose corner pokes past a single blocker is now reachable (the old single ray was not); a wall directly between with no room around blocks; a solid wall column blocks but an aligned gap is clear; the diagonal wall-seam does **not** leak; closed/locked doors block and open doors don't; `hasLineOfEffect` agrees with `hasLineOfSight`. The existing `terrain.test.ts`, `s19-locations-terrain.test.ts`, and `tactical-policy.test.ts` assertions pass unchanged.

## Counts

No count change — no new condition / effect / spell / feat / event type / mechanic kind. This is a derivation-geometry change behind two existing exports.

## Audit

- Struck `los-equals-loe`; Rollup: **Area 3** `9 → 8` open / `5 → 6` closed (`0/3/6 → 0/3/5`, owner now all-Consumer); **Total** `18 → 17` open / `99 → 100` closed / `0/6/12 → 0/6/11`. This was the **last engine-actionable row** — every open row is now a consumer or docs hand-off, and the header/recommended-order reflect that.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (671 files, 4971 passed / 165 skipped); the **full** `npx vitest run` green (693 files, 5213 passed / 165 skipped — fuzz/property/integration tiers included, given the geometry sits under the AoE rasterizer + tactical AI). `doc-size` + `doc-links` + `doc-counts` audits green.
