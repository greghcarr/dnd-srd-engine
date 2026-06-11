# Slice 827 — CHANGELOG size discipline (evict Unreleased pointers 778-802)

**Type:** Doc / infra. No engine, content, or test-behavior change.

## The trigger

The live `CHANGELOG.md` had grown to **56,927 bytes** — within ~3 KB of the 60 KB single-Read ceiling the `doc-size` audit enforces — and the next feature slice would have crossed it and reddened the gate. Unlike slice 812 (which evicted a *tagged release* cohort), no release has been cut since `0.11.0-alpha.0`, so the growth is the long un-tagged **Unreleased** run (slices 778-826).

## The fix (the slice-812 pattern, applied to Unreleased)

Per the user's choice (evict, don't cut a release), moved the **oldest half** of the Unreleased pointers — slices **778-802** — verbatim into new [docs/changelog/archive-slices-778-802.md](archive-slices-778-802.md), and left a one-line reference in the live "Unreleased" section. The newer half (803-826) stays inline. Per-slice detail files (`slice-778.md` … `slice-802.md`) are untouched — they already lived alongside the new archive.

- Live `CHANGELOG.md`: **56.9 KB → 32.5 KB** (≈25 KB archived).
- Archive: ≈25 KB (single-Read-fit).
- Indexed in [docs/changelog/README.md](README.md) under the new "evicted Unreleased-pointer cohorts" note.

## Verification

`doc-size` / `doc-links` audits green (the live file is well under 60 KB; the archive is under it too; every link resolves). No engine/content/test-logic touched — the eviction is a pure cut-and-paste of pointer prose plus one reference line.
