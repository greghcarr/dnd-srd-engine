# Slice 889 — CHANGELOG eviction: archive Unreleased pointers 849-854

**Type:** Doc / housekeeping (no source / test change). Keeps the live [CHANGELOG.md](../../CHANGELOG.md) under the 60 KB single-Read ceiling enforced by the `doc-size` audit.

## Why

After slice 888 the live CHANGELOG's "Unreleased" section reached **~59 KB** — within ~1 KB of the `MAX_BYTES = 60_000` ceiling (`tests/audit/doc-size.test.ts`). The next slice would have crossed it. Standing eviction discipline: when Unreleased approaches the ceiling before a release is cut, the oldest pointers move to a per-cohort archive (the slice-812 release-eviction pattern applied to un-tagged pointers).

## What moved

- Evicted the **oldest six** Unreleased pointers — slices **849-854** — verbatim into a new archive [docs/changelog/archive-slices-849-854.md](archive-slices-849-854.md) (newest-first, with the `Detail:` links rewritten to the within-folder `slice-NNN.md` form). Matches the prior cohorts' ~6-slice cadence (the last was 843-848 in slice 881).
- The live "Earlier Unreleased slices" pointer block extended `778-848 → 778-854` and gained the new archive link.
- The [changelog README](README.md) "Evicted Unreleased-pointer cohorts" index gained the `849-854 (evicted in slice 889)` entry.

Slices 855-889 stay inline. Each evicted slice's full `slice-NNN.md` detail file is untouched — only the compact live pointers moved.

## Result

The live CHANGELOG drops back to ~51 KB, restoring ~8 KB of headroom (≈ 5-6 slices before the next eviction).

## Verification

Docs only — no source, schema, or test change. `doc-size` (every front-door + `docs/changelog/*.md` file under 60 KB) and `doc-links` (the new archive + all its `slice-NNN.md` links resolve) audits green.
