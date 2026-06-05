# Slice 687 — release 0.3.0-alpha.0 (pre-1.0 minor bump)

**Type:** Release.

Promotes the strict-RAW completeness cohort (slices 633-682, 50 slices) to a tagged release. Second minor pre-1.0 bump in the project's history (`0.2.0-alpha.0` → `0.3.0-alpha.0`), using the documented [pre-1.0 escape hatch](../../VERSIONING.md). The minor bump marks the chapter milestone: **the engine is strict-RAW-complete for L1, L2, and L3** — every documented "engine could enforce" arm is closed; engine-scope-excluded arms (positions, plane, scene) stay consumer-managed by design.

This release intentionally does NOT include the spatial combat support cycle (slices 683-685) or the in-repo web demo retirement (slice 686). Those land separately in 0.4.0-alpha.0 — see [slice-688.md](slice-688.md) and the release note in [CHANGELOG.md](../../CHANGELOG.md).

## Fix / Changes

### Pre-release doc-review drift fixes

`npm run release:doc-review` flagged one stale-regex false negative in the script itself: the `[COMPUTED] Spells wired` check hardcoded the prior denominator (`/351`) and the prior wired tally (`\b194\b`) in its MATCH detector, so it reported "wired count NOT FOUND" even though the live citations (status.md:17/27/81) all carry the correct `209/339` and `209 wired` figures (verified by re-derivation from `docs/gaps-spells.md` per-level headers: `17+45+42+32+18+13+17+8+9+8 = 209` wired out of `27+57+57+42+34+38+31+20+17+16 = 339` total).

- **[../../scripts/review-doc-figures.mjs](../../scripts/review-doc-figures.mjs)**: the spells-wired regex pair rewritten to derive the denominator + wired count from `spellSplit()` directly (`new RegExp(...${s.p}...)` and `new RegExp(...${s.w}...)`) so future shifts in either number don't drift the audit. Verdict now correctly reads `wired count 209 MATCHES the cited lines`.

No other COMPUTED checks flagged drift; JUDGMENT checks (magic items, subclasses, headline aggregate) were spot-confirmed against [docs/status.md](../status.md) and read true.

### Release bump

- **[../../package.json](../../package.json)** + **[../../package-lock.json](../../package-lock.json)**: `0.2.0-alpha.0` → `0.3.0-alpha.0`.
- **`SCHEMA_VERSION` stays 1**: no breaking persisted-shape changes in this cycle. New events shipped this cycle (`SpellCastFizzledEvent`, `SpellEffectStartedEvent`, the slice-664 `CombatantHealed` rider on `DeflectAttacksUsed`, `BlinkTurnEnded`, etc.) are all purely additive; new optional fields on existing events (e.g. `conditionOnHit` on attack mechanic content, `recurringSave` metadata on conditions) carry safe defaults; old saves parse unchanged.

### CHANGELOG promotion

- **[../../CHANGELOG.md](../../CHANGELOG.md)**: a SELECTIVE promotion (not the full slice-632 pattern). Only the strict-RAW cohort (slices 633-682) is lifted from `## Unreleased` into a new `## 0.3.0-alpha.0 - 2026-06-05` release header. The spatial combat + GUI-retirement cohort (slices 683-686) stays in `## Unreleased` to be promoted by the v0.4.0-alpha.0 bump (slice 688) immediately after. The new release header carries the headline (50-slice cycle, strict-RAW-complete for L1+L2+L3), themed highlights (L2 + L3 RAW closures, deferred-primitives backlog wins, Slow enforcement, multiclass + fuzz audits expanded to L3, ergonomics), the Breaking section, and the RNG-stream-shift list. A fresh empty `## Unreleased` (with slice-687 pointer at top + the carry-over slices 683-686 pointers below) sits above the new release.

### Breaking-changes queue

- **[../breaking-changes-queued.md](../breaking-changes-queued.md)**: the latest-tagged-release pointer updates from `0.2.0-alpha.0` to `0.3.0-alpha.0`. The queue was empty when this bump was cut — no breaking changes shipped in slices 633-682 (the cycle was additive: new effect primitives, new optional fields, new planners, new conditions, new content; nothing removed or renamed).

## Tests

- `npm run release:doc-review`: COMPUTED-Spells-wired and COMPUTED-EFFECT-KINDS both MATCH; remaining JUDGMENT lines confirmed by manual re-read.
- `npm run release:doc-counts:check`: clean (no diffs to test/file count citations).
- `npx vitest run`: full suite 540/540 files / 4118 tests passing + 173 skipped (state at the slice 686 boundary, unchanged by this release-prep commit — slice 687 only touches CHANGELOG / package version / a doc-review script regex).
- `npx tsc --noEmit`: clean.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.
- `wc -c CHANGELOG.md`: still well under the 60 KB single-Read ceiling after the selective promotion.
- `git tag -l v0.3.0-alpha.0`: the local tag points at this commit (the tag will be moved to main's merge commit per prior convention after the release PR merges).
