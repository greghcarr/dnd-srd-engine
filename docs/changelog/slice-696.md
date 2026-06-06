# Slice 696 — release: bump to 0.5.0-alpha.0

**Type:** Release. Promotes the post-0.4.0 cohort (slices 689-695) to a tagged release: the cross-repo sibling-consumer infrastructure (689-692) plus tactical movement support for the combat fuzz (693-695). `package.json` bumps `0.4.0-alpha.0` → `0.5.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1.

## Why

`main` is "stable, releasable, tagged" and is the consumers' deploy pin (both dndbnb and dnd-web check out engine `ref: main` at deploy time). The 0.5.0-alpha.0 tag marks this cohort's chapter status: **tactical movement support is shipped** for the fuzz generator, so the dnd-web `tactical-replay` viewer has positioned `CombatantMoved` events to play back, and the engine + consumers now live as sibling repos with a pre-push verification hook.

## What's in the cohort

- **Sibling-consumer infra (689-692):** dndbnb extracted to its own sibling repo (689); a pre-push hook that builds both consumers before an engine `main` push, plus a `+dirty` engine-SHA marker in consumer badges (690); reverting the cross-repo `notify-dndbnb` auto-dispatch in favor of the symmetric "consumers rebuild on their own main" model (691); a clean-agent doc tune-up surfacing the arrangement (692).
- **Tactical movement (693-695):** a `movement: 'none' | 'tactical'` option on `runBattle` behind a move-policy seam, proven byte-identical for `'none'` (693); deterministic arena generation + spread placement (694); the RNG-free movement policy (flee / kite / close / stay) with full opportunity-attack resolution (695).

## No breaking changes, no RNG-stream changes

- **Public API:** unchanged. `runBattle` gains an optional `movement` parameter defaulting to `'none'`, which is byte-identical to the prior positionless path. No engine `src/` surface changed.
- **RNG stream:** `'none'` battles are byte-identical (proven by the fuzz-matrix + replay-equivalence suites passing unchanged). The tactical path is new behavior behind the option, not a shift to existing seeds. `docs/breaking-changes-queued.md` was empty at cut time.
- **`SCHEMA_VERSION` stays 1:** the location / positioned-encounter / movement event shapes this cohort exercises all shipped additively in the 0.4.0 spatial cycle (slices 683-685); no new persisted shapes.

## Release steps performed

1. `npm run release:doc-counts` (safeguard) + `npm run release:doc-review` (front-door figures: COMPUTED checks MATCH).
2. `package.json` + `package-lock.json`: `0.4.0-alpha.0` → `0.5.0-alpha.0`.
3. CHANGELOG: promote `## Unreleased` to `## 0.5.0-alpha.0 - 2026-06-05` (release header + Breaking: none + RNG: none), fresh `## Unreleased` above carrying the slice-696 pointer.
4. `docs/breaking-changes-queued.md`: latest-tag pointer `0.4.0-alpha.0` → `0.5.0-alpha.0`.
5. `npm run ci` (typecheck + coverage + build) green; both sibling consumers (dndbnb, dnd-web) typecheck + build green against the new engine.
6. Ship via PR `dev` → `main`; tag `v0.5.0-alpha.0` on the merged `main`.

## Verification

- `npx tsc --noEmit` clean; full `npx vitest run` green (546 files, 4150 passed / 173 skipped).
- `npm run ci` green (coverage thresholds + build).
- Consumer builds: `dndbnb` and `dnd-web` `npm run typecheck && npm run build` green against the bumped engine.
