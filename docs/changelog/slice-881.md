# Slice 881 — CHANGELOG eviction: archive Unreleased pointers 843-848

**Type:** Doc / housekeeping (no source / test change). Keeps the live [CHANGELOG.md](../../CHANGELOG.md) under the 60 KB single-Read ceiling enforced by the `doc-size` audit.

## Why

After slice 880 the live CHANGELOG's "Unreleased" section reached **58,277 bytes** — within ~1.7 KB of the `MAX_BYTES = 60_000` ceiling (`tests/audit/doc-size.test.ts`). The recent engine-slice pointers run long (~1.4–1.6 KB each), so the next slice would have crossed it. This is the standing eviction discipline: when Unreleased approaches the ceiling before a release is cut, the oldest pointers move to a per-cohort archive (the slice-812 release-eviction pattern applied to un-tagged pointers).

## What moved

- Evicted the **oldest six** Unreleased pointers — slices **843-848** — verbatim into a new archive [docs/changelog/archive-slices-843-848.md](archive-slices-843-848.md) (newest-first, with the `Detail:` links rewritten to the within-folder `slice-NNN.md` form). This matches the prior cohorts' ~6-slice cadence (the last was 837-842 in slice 874).
- The live "Earlier Unreleased slices" pointer block extended `778-842 → 778-848` and gained the new archive link.
- The [changelog README](README.md) "Evicted Unreleased-pointer cohorts" index gained the `843-848 (evicted in slice 881)` entry.

Slices 849-881 stay inline. Each evicted slice's full `slice-NNN.md` detail file is untouched — only the compact live pointers moved.

## Result

The live CHANGELOG drops back to ~50 KB, restoring ~8 KB of headroom (≈ 5-6 slices before the next eviction).

## Verification

Docs only — no source, schema, or test change. `doc-size` (every front-door + `docs/changelog/*.md` file under 60 KB) and `doc-links` (no dangling references; the new archive + all its `slice-NNN.md` links resolve) audits green.
