# Slice 632 — release 0.2.0-alpha.0 (pre-1.0 minor bump)

**Type:** Release.

Promotes the post-alpha.15 cohort (slices 472-631, ~160 slices) to a tagged release. First minor pre-1.0 bump in the project's history (`0.1.0-alpha.15` → `0.2.0-alpha.0`), using the documented [pre-1.0 escape hatch](../../VERSIONING.md) since the cycle ships a documented breaking change (slice 603 Produce Flame) plus five RNG-stream shifts. The minor bump marks the chapter milestone (full L1 SRD coverage now audit-floor-guarded) without claiming beta-ready API stability.

## Fix / Changes

### Pre-release doc-review drift fixes

`npm run release:doc-review` surfaced one COMPUTED drift the existing audit didn't catch: `EFFECT_KINDS.length === 61` (60 primitives + Custom), but README.md said "52 declarative primitives" / "currently 52 primitives plus the `Custom` escape hatch" / "(52 primitives + `Custom` escape hatch in `EFFECT_KINDS`)" in 3 places and docs/status.md said "52 wired primitives ... (53 `EFFECT_KINDS` entries total)" in 1 place. The vocabulary had grown across multiple slices without the front-door citations being updated.

- **[../../README.md](../../README.md)** + **[../status.md](../status.md)**: 4 stale "52 primitives" / "53 EFFECT_KINDS entries" citations updated to "60 primitives" / "61 EFFECT_KINDS entries" (and the slice-631 doc-overhaul citation in README.md:168 corrected as part of this — that line had been copy-edited from prior text and inherited the stale number).
- **[../../tests/audit/doc-counts.test.ts](../../tests/audit/doc-counts.test.ts)**: added four pinned CHECKs for the front-door EFFECT_KINDS citations (README "declarative primitives", README "currently N primitives plus the Custom escape hatch", README "(N primitives + `Custom` escape hatch in `EFFECT_KINDS`)", docs/status.md "Effect-primitive vocabulary row (N wired primitives + M EFFECT_KINDS entries total)"), each derived from `EFFECT_KINDS.length`. The next time the vocabulary grows, the audit fails the same slice instead of waiting for the next release-doc-review. The `effectKinds: EFFECT_KINDS.length` comment in the ground-truth object also stripped its stale "// 52" comment.

### Release bump

- **[../../package.json](../../package.json)** + **[../../package-lock.json](../../package-lock.json)**: `0.1.0-alpha.15` → `0.2.0-alpha.0`.
- **`SCHEMA_VERSION` stays 1**: no breaking persisted-shape changes in this cycle. The cycle's persisted-shape additions are all purely additive with safe defaults, so old saves parse unchanged.

### CHANGELOG promotion

- **[../../CHANGELOG.md](../../CHANGELOG.md)**: `## Unreleased` (slices 622-631 pointers + the cycle-archive pointer block) promoted to `## 0.2.0-alpha.0 - 2026-06-03`. New release header carries the headline ("160-slice cycle, L1 SRD floor, doc overhaul, vocabulary growth"), themed highlights (L1 SRD floor, fuzz tooling + web replay, doc overhaul, engine vocabulary growth, content depth), the Breaking section (slice 603 Produce Flame, lifted from the queue), and the RNG-stream-shift list. A fresh empty `## Unreleased` heading sits above the new release. No previously-tagged release narrative needed eviction this cycle — alpha.15 was already evicted to [released-versions-alpha-15.md](released-versions-alpha-15.md) in slice 628.

### Breaking-changes queue cleared

- **[../breaking-changes-queued.md](../breaking-changes-queued.md)**: the slice-603 Produce Flame entry + the five RNG-stream entries (slices 601, 602, 611, 612, 614) all moved into the 0.2.0-alpha.0 release notes; the queue now reads "(none queued)" under both sections, with the latest-tagged-release pointer updated from alpha.15 to 0.2.0-alpha.0 and a fresh empty queue ready for the next cycle.

## Tests

- `npm run release:doc-counts`: no-op (the test/file count citation it used to reconcile was removed under "CI-guarded or not stated" — kept running so any future precise test/file claim trips it).
- `npm run release:doc-review`: re-run confirms no remaining drift; the EFFECT_KINDS COMPUTED row now reports MATCH.
- `npx vitest run tests/audit/doc-counts.test.ts`: 19 cases passing (was 15; +4 EFFECT_KINDS front-door CHECKs).
- All doc audits (doc-size, doc-links, doc-counts, doc-examples, gaps-spells-counts): green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 501 files / N tests passing (the count drifted from slice 631's 3370 by the +4 doc-counts CHECKs to a new total; no other tests changed).
- `wc -c CHANGELOG.md`: still well under the 60 KB single-Read ceiling after the promotion.
- `npm run build`: ESM + CJS + `.d.ts` outputs produced.

## RNG impact / Breaking change

All breaking changes in this release are inherited from the cycle (already documented in their per-slice files and rolled up into the 0.2.0-alpha.0 release-header Breaking section). This release-cut slice itself ships no new RNG-stream change or API-shape change.

## Audit

- **Names**: the four new CHECK labels (`'declarative primitives (Why this engine bullet)'` etc.) name the citation site in the doc, matching the existing CHECK-naming convention.
- **DRY**: each CHECK pins a distinct prose form of the same `GT.primitives` / `GT.effectKinds` derived value; the values come from one source (`EFFECT_KINDS.length`) and feed five existing + four new CHECKs. The duplication is intentional — different docs use different prose, and one regex per citation is the right granularity for "the audit names the exact doc + stale count when it fires."
- **SRP**: the slice does three things (drift fixes, version bump, CHANGELOG promotion) but each is a load-bearing step of the documented release process. They cannot be three separate slices — a release IS the bundle.
- **Pattern-check**: ran `npm run release:doc-review` after the drift fixes to confirm no other COMPUTED drift remained. Two JUDGMENT signals (magic-item wired %, subclass wired %) remain qualitative as documented in [VERSIONING.md](../../VERSIONING.md) / [CONTRIBUTING.md](../../CONTRIBUTING.md) "Doc accuracy: CI-guarded or not stated"; these are intentionally not pinned (no derivable signal yet).
- **Magic numbers**: none introduced.

## Open follow-ups

- **Tag + push**: the documented release-process step 7 (`git tag v0.2.0-alpha.0` + push the tag + open the PR for `dev` → `main`) is gated on explicit user instruction per [CLAUDE.md](../../CLAUDE.md#commit-dont-push). This slice ships the local prep only.
- **dndbnb upgrade**: the consumer ([greghcarr/dndbnb](https://github.com/greghcarr/dndbnb), extracted to its own sibling repo in slice 689 — was co-located in this repo at the time of slice 632) will need a version bump + Produce Flame migration check (verifies whether any logged cast paths trigger the new Action-availability gate); not blocking for the release tag itself.
