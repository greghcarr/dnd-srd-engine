# Slice 903 — CHANGELOG eviction: archive Unreleased pointers 861-866

**Type:** Docs / infra (changelog maintenance). No source or behavior change.

## Why

The live [CHANGELOG.md](../../CHANGELOG.md) reached **59,915 bytes** after the slice-902 pointer — 85 bytes under the `doc-size` audit's 60,000-byte single-Read ceiling. The next changelog write would overflow it and fail CI, so the oldest six Unreleased pointers are evicted now to restore headroom.

## What

- The compact pointers for slices **861-866** moved verbatim to a new per-cohort archive, [archive-slices-861-866.md](archive-slices-861-866.md) — the same release-eviction pattern as the 855-860 eviction (slice 896) and the cohorts before it.
- The live "Earlier Unreleased slices" pointer block extended from `778-860` to `778-866` (+ the new archive link).
- The [changelog README](README.md) cohort index gained the `861-866` entry (evicted in slice 903).

Each evicted slice's full `slice-NNN.md` detail file is untouched; only the live one-paragraph pointer moved. Restores ~8 KB of headroom (live CHANGELOG back to ~52 KB).

## Verification

`doc-size` (live CHANGELOG back under the ceiling; the new archive is ~10 KB, well within it) + `doc-links` (the new archive link + README entry resolve) green.
