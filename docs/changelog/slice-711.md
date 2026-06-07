# Slice 711 — release: bump to 0.7.0-alpha.0 ("L4 SRD complete")

**Type:** Release (version bump + CHANGELOG cut). No source behavior change beyond the version string.

Promotes the post-0.6.0 cohort (slices 702-710) to a tagged release on `dev`. Local only — no push / merge to `main` / npm publish.

## Version

- `package.json` + `package-lock.json`: `0.6.0-alpha.0` → `0.7.0-alpha.0`.
- `SCHEMA_VERSION` stays **1** — no persisted (event / state) shape changed this cycle.

## What's in 0.7.0-alpha.0

Two headline features plus an audit-found fix (full narrative + Breaking / RNG notes in [CHANGELOG.md](../../CHANGELOG.md)):

- **L4 SRD complete** (702-703, 707-709): the Ability Score Improvement choice at L4 for all 12 classes (ASI feat — +2 one / +1 two, max 20 — or another general feat via the `GrantFeat` cascade), which also completed the SRD 5.2.1 feat catalog (17/17). Monk Slow Fall (already via `planFalling`), Fighter Second Wind 3, Sorcery/Focus Points → 4. The "L4 SRD complete" floor audit is 20/20; the fuzz matrix covers L1-L4 (1,440 battles/run).
- **Interactive-play public seams** (704-706, the A1/A2/A3 cohort): `engine.query.*` affordance queries, the die-typed resumable `engine.withRollProvider` roll seam, and the tactical policy graduated to `src/ai/`.
- **Fix** (710): derived character + AC now reflect effective ability scores (ASI / items / floors), not base.

## Breaking / behavior

- **Breaking:** none — [docs/breaking-changes-queued.md](../breaking-changes-queued.md) was "(none queued)" at cut; its baseline pointer is advanced to 0.7.0-alpha.0.
- **Behavior (slice 710):** `engine.derive.character` / `buildCharacterSheet` ability **modifiers now reflect effective scores** (not base), and `DerivedCharacter` gains an effective `abilityScores` field. A consumer pinning the prior base-derived modifiers will see corrected values. The `engine.query.*` / roll-provider / `src/ai` additions are purely additive.

## RNG / determinism

Positionless `'none'` fuzz (L1-L3) + golden transcripts + replay-equivalence + rng-capture are **byte-identical**: the A2 roll-provider seam is a no-op with no provider installed, and L4 ASI changes a character's scores only via a post-level-up choice, not the combat RNG stream. L4 fuzz is new this cycle (slice 709), so no prior per-seed transcript is pinned across the boundary.

## Files

- [package.json](../../package.json), [package-lock.json](../../package-lock.json): version bump.
- [CHANGELOG.md](../../CHANGELOG.md): new `## 0.7.0-alpha.0 - 2026-06-06` section (the 702-710 cohort moved under it; the slice-701 Unreleased pointer, fully captured in the 0.6.0 section, removed).
- [docs/breaking-changes-queued.md](../breaking-changes-queued.md): baseline advanced to 0.7.0-alpha.0.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green (incl. doc-size / doc-links / doc-counts audits).

## Next

- The v0.7.0 narrative stays in CHANGELOG.md until a future slice evicts it to `released-versions-0.7.0-alpha.0.md` for the 60 KB single-Read ceiling (the slice-700 pattern).
- Open follow-ups carried forward: per-character feat-eligibility filter for the L4 ASI menu; the three tracked Tier-2 base-vs-effective ability edges (mirror-image dup AC, finesse ability-choice, fatal-save).
