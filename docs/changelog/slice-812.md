# Slice 812 — CHANGELOG size discipline (evict `0.11.0-alpha.0`)

**Type:** Doc / infra. No engine, content, or test-behavior change.

## The trigger

The `doc-size` audit (`tests/audit/doc-size.test.ts`, slice 285) caps front-door docs at the 60 KB single-Read ceiling. The live `CHANGELOG.md` had grown to **60,638 bytes** as the Unreleased pointer list accumulated (slices 778-811 on top of the inline `0.11.0-alpha.0` release narrative), so `npm run test:fast` was red on that one assertion — independent of any product change.

## The fix (the slice-754 precedent)

The CHANGELOG's active-cycle invariant: the live file holds only the **active cycle** (Unreleased) plus the **newest tagged release** — and the newest release is evicted to a `released-versions-*.md` archive once doc-size pressure demands it. That's exactly what slice 754 did to `0.10.0-alpha.0` while it was still the newest release.

Applied the same move to the now-superseded-by-Unreleased `0.11.0-alpha.0` cohort:

- Moved the entire `## 0.11.0-alpha.0 - 2026-06-09` section (the release bump slice 777 down through slice 749, verbatim) into new **[docs/changelog/released-versions-0.11.0-alpha.0.md](released-versions-0.11.0-alpha.0.md)**, with the conventional frozen-archive header + sibling-archive links.
- Prepended a `0.11.0-alpha.0` pointer to the "Older releases" block in the live CHANGELOG.
- The live file dropped from **60,638 B → 35,791 B** (≈25 KB archived); the archive is ≈26 KB (single-Read-fit).

Per-slice detail files (`slice-749.md` … `slice-777.md`) are untouched — they already lived alongside the new archive.

## Verification

`doc-size` audit green (CHANGELOG now well under 60 KB; the new archive is under the ceiling too). No engine/content/test-logic touched — the eviction is a pure cut-and-paste of frozen release prose plus one pointer line.
