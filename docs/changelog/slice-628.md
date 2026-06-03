# Slice 628 — CHANGELOG sustainability: pointer-per-slice + detail-per-file

**Type:** Docs.

The live `CHANGELOG.md` had hit the 60 KB single-Read ceiling every 5-6 slices, requiring a manual archive operation roughly weekly. The slice-437 active-cycle rule fixed the released-versions side (one tagged release narrative + a pointer), but the Unreleased section still accumulated 4-9 KB per slice's verbose entry — slice 617's "25-40 line template" capped prose density but not entry count × release-narrative bytes. This slice closes the cadence-trimming friction structurally.

## Fix

**Two-file convention**: full per-slice detail moves to `docs/changelog/slice-NNN.md`; the live `CHANGELOG.md` Unreleased section holds a compact 3-line pointer per slice:

```
**<Type> (slice N): <one-line headline>**
<one-sentence summary>.
Detail: [slice-NNN.md](docs/changelog/slice-NNN.md).
```

Live-file growth per slice: ~150 bytes (the pointer) instead of 4-9 KB (the prior verbose entry). The live CHANGELOG would now hit the 60 KB ceiling at roughly 400 slices instead of 5-6.

## Changes

- **Created 7 per-slice files** at [../../docs/changelog/](.) — `slice-622.md` through `slice-628.md` (this file). Each holds the full Files / Tests / Verification / Audit / Open-follow-ups blocks for that slice.
- **Created [released-versions-alpha-15.md](released-versions-alpha-15.md)** — migrated the inline alpha.15 release narrative out of the live CHANGELOG (siblings: `released-versions.md`, `released-versions-alpha-6-13.md`, `released-versions-alpha-14.md`).
- **Rewrote [../../CHANGELOG.md](../../CHANGELOG.md)** — Unreleased section now uses 7 compact pointers; "Older releases" pointer block updated with the new alpha-15 file. Live file shrank from ~59 KB to ~12 KB.
- **Updated [../../CLAUDE.md](../../CLAUDE.md)** — "Doc updates per slice" + "CHANGELOG entry shape" + "Doc size discipline" sections all reflect the new convention. The CHANGELOG entry shape now has two templates (pointer + per-slice file).
- **Updated [README.md](README.md)** (this archive index) — new "Per-slice files (slice 622 onward)" section above the per-cohort archives.
- **Updated [../slice-template.md](../slice-template.md)** — the per-slice CHANGELOG step now points at the per-slice-file convention.

## Path convention in per-slice files

Repo links use `../../` to escape `docs/changelog/`. E.g. `[../../src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)`. The doc-links audit verifies these resolve.

## Verification

- `npx vitest run tests/audit/doc-size.test.ts` — live CHANGELOG passes (~12 KB, under 60 KB); each per-slice file passes (~2-7 KB).
- `npx vitest run tests/audit/doc-links.test.ts` — every pointer resolves; every per-slice file's repo-relative links resolve.
- `wc -c CHANGELOG.md` — 12 KB; growth at ~150 bytes per future slice.

## Risk / rollback

Low. Per-slice files are pure adds; live CHANGELOG rewrite is reversible from git. Old `archive-slices-NNN-MMM.md` cohort files stay as-is — only slice 622 onward gets the per-slice files, so the historical record is preserved.

## Audit

- **Names**: `slice-NNN.md` matches the existing `archive-slices-NNN-MMM.md` convention.
- **DRY**: each per-slice file is the canonical source; the live CHANGELOG pointer carries only the headline + summary (avoids duplicating detail).
- **SRP**: live CHANGELOG = navigation; per-slice files = detail.
- **Pattern-check**: swept the repo for scripts that parse CHANGELOG (`grep -rl CHANGELOG scripts/`) — none. The release-notes generation flow uses tagged release narratives (per-release files), unaffected.

## Open follow-ups

- **Slice 629**: CLAUDE.md split + tone polish + engine-scope doc.
- **Slice 630**: comprehensive feature tutorial.
- **Slice 631**: numerical accuracy sweep + audit extension.
