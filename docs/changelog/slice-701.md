# Slice 701 — release: bump to 0.6.0-alpha.0

**Type:** Release. Promotes the post-0.5.0 cohort (slices 697-700) to a tagged release. `package.json` + `package-lock.json` bump `0.5.0-alpha.0` → `0.6.0-alpha.0`. `SCHEMA_VERSION` stays 1.

## Why

`main` is "stable, releasable, tagged" and is the consumers' deploy pin. The 0.6.0-alpha.0 tag captures the tactical-combat polish cycle: an engine forced-movement correctness fix and a richer arena generator, after a convergence experiment that was tried and reverted.

## What's in the cohort

- **Slice 697 (reverted):** a round-leashed convergence model that eliminated tactical stalemate draws. Reverted in slice 699 — the user opted to keep draws. Its `normalizeEvents` compound-ulid determinism-oracle fix was kept.
- **Slice 698:** the engine Push forced-movement fix. The weapon-mastery / Open Hand Push added a cell count to a feet coordinate with no map validation, shoving targets off-grid onto cover or off the map. New `pushDestination` helper clamps the shove to a legal, grid-aligned cell. Corrects positioned Push for every consumer.
- **Slice 699:** the revert of 697 (tactical movement back to the slice-695 kiting policy; draws accepted), keeping 698 + the oracle fix.
- **Slice 700:** richer tactical arenas — irregular per-seed rock borders, lower obstacle density, passable `difficult` + `water` terrain, and an occasional fenced pen with a guaranteed entrance. Connectivity stays structural; deterministic.

## No breaking changes, no SCHEMA bump

- **Public API:** unchanged. `pushDestination` is an internal `src/derive` helper, not added to the public barrel. No `src/index.ts` surface change.
- **RNG stream:** `'none'` (positionless) battles are byte-identical (fuzz-matrix + replay-equivalence unchanged). Tactical per-seed transcripts differ from 0.5.0 (Push positions + arena shapes), but tactical mode is new this cycle and behind the `movement: 'tactical'` option, so no consumer pins a tactical transcript.
- **`SCHEMA_VERSION` stays 1:** no new persisted shapes (arenas use the existing `LocationMap`; Push emits the existing `CombatantMoved`).

## Release steps performed

1. `release:doc-counts` (safeguard) + `release:doc-review` (COMPUTED figures all MATCH: wired 209, primitives 63/64, pack 254; JUDGMENT figures untouched by a tactical/arena cohort).
2. `package.json` + `package-lock.json`: `0.5.0-alpha.0` → `0.6.0-alpha.0`.
3. CHANGELOG: promote `## Unreleased` to `## 0.6.0-alpha.0 - 2026-06-05` (header + Breaking: none + RNG note), fresh `## Unreleased` with the slice-701 pointer. Evicted the 0.5.0-alpha.0 narrative to [released-versions-0.5.0-alpha.0.md](released-versions-0.5.0-alpha.0.md) (the previously-latest release; doc-size discipline).
4. `docs/breaking-changes-queued.md`: latest-tag pointer `0.5.0-alpha.0` → `0.6.0-alpha.0`.
5. `npm run ci` (typecheck + coverage + build) green; both sibling consumers (dndbnb, dnd-web) typecheck + build green against the new engine.
6. Ship via PR `dev` → `main`; tag `v0.6.0-alpha.0` on the merged `main`.

## Verification

- `npx tsc --noEmit` clean; full `npx vitest run` green.
- `npm run ci` green (coverage thresholds + build).
- Consumer builds: `dndbnb` + `dnd-web` `npm run typecheck && npm run build` green against the bumped engine.
