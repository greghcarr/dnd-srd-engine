# Slice 688 — release 0.4.0-alpha.0 (pre-1.0 minor bump)

**Type:** Release.

Promotes the spatial combat support cycle (slices 683-685) plus the in-repo web-demo retirement (slice 686) to a tagged release. Third minor pre-1.0 bump in the project's history (`0.3.0-alpha.0` → `0.4.0-alpha.0`), using the documented [pre-1.0 escape hatch](../../VERSIONING.md).

The bump comes back-to-back with [slice 687](slice-687.md) (the v0.3.0-alpha.0 cut). v0.3.0-alpha.0 marked "strict-RAW-complete for L1, L2, L3"; v0.4.0-alpha.0 marks "spatial combat support shipped + GUI moved out of the engine repo."

## Fix / Changes

### Pre-release doc-review

`npm run release:doc-review`: all COMPUTED checks MATCH (spells-wired regex was fixed in slice 687; EFFECT_KINDS unchanged at 64; monster pack count unchanged at 254). JUDGMENT lines spot-confirmed against [docs/status.md](../status.md) and read true.

### Release bump

- **[../../package.json](../../package.json)** + **[../../package-lock.json](../../package-lock.json)**: `0.3.0-alpha.0` → `0.4.0-alpha.0`.
- **`SCHEMA_VERSION` stays 1**: no breaking persisted-shape changes. The slice-683 `CombatantPlacedEvent` and the optional `combatants` field on `EncounterCreatedEvent` are additive; the slice-685 spatial gates throw at plan time and emit no events.

### CHANGELOG promotion

- **[../../CHANGELOG.md](../../CHANGELOG.md)**: the remaining `## Unreleased` content (slice-687 pointer carried over from the v0.3 bump + slices 683-686 pointers) is promoted to a new `## 0.4.0-alpha.0 - 2026-06-05` release header. Fresh `## Unreleased` (with only the slice-688 pointer at the top) sits above the new release.

### Breaking-changes queue

- **[../breaking-changes-queued.md](../breaking-changes-queued.md)**: latest-tag pointer updates from `0.3.0-alpha.0` to `0.4.0-alpha.0`. The queue itself was empty when this bump was cut — the breaking changes shipped in slices 683-686 (the new spatial gates, the slice-684 `plan.move` shortest-path semantics, the slice-686 GUI retirement script removals) were not lodged in the queue file during the cycle because each slice rolled its breaking implications into its own per-slice file. The v0.4 release header's Breaking section pulls them together explicitly.

## Tests

- `npm run release:doc-review`: COMPUTED checks all MATCH; JUDGMENT lines confirmed.
- `npm run release:doc-counts:check`: clean.
- `npx vitest run`: full suite green (state unchanged by this release-prep commit; verified by the consolidated post-release run that wraps both v0.3 and v0.4 bumps).
- `npx tsc --noEmit`: clean.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.
- `npm run build`: ESM + CJS + `.d.ts` produced clean (no `web/`-aware shim left over after slice 686).
- `wc -c CHANGELOG.md`: still well under the 60 KB single-Read ceiling after the v0.3 + v0.4 back-to-back promotions.
- `git tag -l v0.4.0-alpha.0`: the local tag points at this commit (the tag will be moved to main's merge commit per prior convention after the release PR merges).
