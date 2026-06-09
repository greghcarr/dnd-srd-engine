# Released versions: 0.6.0-alpha.0

## 0.6.0-alpha.0 - 2026-06-05

**Release (slice 701): bump to 0.6.0-alpha.0**

Promotes the post-0.5.0 cohort (slices 697-700) to a tagged release. `package.json` bumps `0.5.0-alpha.0` → `0.6.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1 (no persisted-shape changes). Net effect over 0.5.0: positioned Push now lands on a legal cell (an engine correctness fix), tactical arenas are richer (irregular rock borders, `difficult` + `water` terrain, occasional fenced pens), and the `normalizeEvents` determinism oracle handles compound ids — while the tactical movement policy itself is unchanged from 0.5.0 (the slice-697 convergence push was reverted in slice 699, so battles still accept draws).

**Breaking:** none. No engine `src/` public surface changed; `pushDestination` is an internal derive helper (not in the public barrel). `docs/breaking-changes-queued.md` was empty at cut time.

**RNG stream:** `'none'` (positionless) battles are byte-identical (fuzz-matrix + replay-equivalence pass unchanged). Tactical per-seed transcripts differ from 0.5.0 (the Push fix changes positioned shove destinations; the arena generator changed), but tactical mode is new this release cycle and behind the `movement: 'tactical'` option, so no consumer pins a tactical transcript across the boundary.

**Feat (slice 700): richer tactical arenas (irregular rock border, terrain types, fenced pens)**
Rewrites `generateArenaMap`: an irregular per-seed rock border (smooth edge random walks, so the playable shape varies by seed), fewer hard obstacles (impassable cover 0.18 → 0.07) plus passable `difficult` + `water` terrain, and an occasional fenced pen (an impassable ring with a guaranteed non-corner side gate, so it always has a real entrance) on the larger map. Dims enlarged a little (duel 18×13, squad 22×16). Connectivity stays structural via a protected spawn-to-spawn corridor (no border/fence/pillar can disconnect A↔B); deterministic; `'none'` unaffected (tactical-only). Verified over seeds 1-100: 0 connectivity failures, fences ~15% of seeds, every pen interior reachable from a spawn, draw rate unchanged (3.8%), 0 illegal moves. CHANGELOG note: this slice also evicted the 0.4.0-alpha.0 release narrative to [released-versions-0.4.0-alpha.0.md](released-versions-0.4.0-alpha.0.md) (doc-size discipline).
Detail: [slice-700.md](slice-700.md).

**Revert (slice 699): restore the slice-695 kiting tactical policy (accept draws again)**
Undoes the slice-697 convergence push: `planTacticalMove` goes back to the slice-695 flee/kite/close cascade, so tactical battles stalemate to draws again (≈4% over seeds 1-40 × {1v1,2v2}; seed 42 1v1 draws at the round cap), as at the 0.5.0 release — per request, forcing convergence wasn't wanted. **Kept** as orthogonal correctness improvements: slice 698 (Push lands on a legal cell) and the slice-697 `normalizeEvents` compound-ulid oracle fix. `policy.ts` / `constants.ts` / `move-policy.ts` + their unit tests restored to slice-695; the slice-697 convergence assertion removed (the slice-698 move-legality guard stays). `'none'` byte-identical; no API change.
Detail: [slice-699.md](slice-699.md).

**Fix (slice 698): Push forced-movement lands on a legal cell, not an off-grid vector**
The weapon-mastery Push (and, by pattern-check, Open Hand Push) computed the shove destination by adding a *cell count* to a *feet* coordinate with no map validation, so a target could be shoved off-grid onto cover or off the map (seeds 19, 29 at 2v2). Slice 697's convergence surfaced it (melee Push hits now land). New pure `pushDestination` helper (`src/derive/pathing.ts`) steps the shove cell-by-cell and stops against the first out-of-bounds / impassable / occupied / closed-door cell, returning a grid-aligned position; both Push planners now use it. Verified: 0 illegal `CombatantMoved`/final positions across seeds 1-40 × {1v1,2v2} (matrix assertion added). Corrects positioned Push for every consumer, not just the fuzz. `'none'` byte-identical (positionless → Push emits no move); no API change.
Detail: [slice-698.md](slice-698.md).

**Fix (slice 697): tactical movement converges instead of stalemating** — **Reverted by slice 699.**
The round-leashed `planTacticalMove` convergence model is no longer in the tree (the user opted to accept draws). Its `normalizeEvents` compound-ulid oracle fix was kept. Original detail (for the record): [slice-697.md](slice-697.md).

**Release (slice 696): bump to 0.5.0-alpha.0**
Promotes the post-0.4.0 cohort (slices 689-695) to a tagged release: cross-repo sibling-consumer infra (689-692) + tactical movement support for the combat fuzz (693-695). No engine-API breaking change; `'none'` byte-identical; `SCHEMA_VERSION` stays 1.
Detail: [slice-696.md](slice-696.md).
