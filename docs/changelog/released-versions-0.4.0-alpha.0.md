# Released versions: 0.4.0-alpha.0

Frozen release narrative for `0.4.0-alpha.0` (2026-06-05), evicted from the live [CHANGELOG.md](../../CHANGELOG.md) in slice 700 per the active-cycle invariant (the live file holds only the active cycle + the newest release). Sibling archives: [released-versions-0.2.0-alpha.0.md](released-versions-0.2.0-alpha.0.md), [released-versions-alpha-15.md](released-versions-alpha-15.md), [released-versions-alpha-14.md](released-versions-alpha-14.md), [released-versions-alpha-6-13.md](released-versions-alpha-6-13.md). Per-slice detail lives in the `slice-NNN.md` files alongside this one.

---

## 0.4.0-alpha.0 - 2026-06-05

**Release (slice 688): bump to 0.4.0-alpha.0**

Promotes the spatial combat support cycle (slices 683-685) plus the in-repo web-demo retirement (slice 686) to a tagged release. The minor pre-1.0 bump (per [VERSIONING.md](../../VERSIONING.md)'s escape hatch) marks this cycle's chapter status — **spatial combat support is shipped**: combatants can start an encounter at positions, `plan.move` costs the shortest legal path, and `plan.attack` + `plan.castSpell` gate on weapon range / spell range + line of sight when both actor and target are positioned on a mapped location. `package.json` bumps `0.3.0-alpha.0` → `0.4.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the new event shapes are additive.

Back-to-back with [slice 687](slice-687.md) (the v0.3.0-alpha.0 cut). The two release tags exist because the strict-RAW cohort (633-682) and the spatial + infra cohort (683-686) are independently meaningful milestones that a consumer might want to adopt separately.

### Highlights

- **Spatial combat support cycle (slices 683-685).** Combatants can now START an encounter at positions: `engine.plan.createEncounter` accepts an optional `combatants: ReadonlyArray<{ characterId, position? }>` alongside the legacy `combatantIds: ULID[]` (slice 683). New `engine.plan.placeCombatant` handles mid-encounter placement (summons, teleports). New `src/derive/pathing.ts` exposes `findPath` and `reachableCells` (Dijkstra over `movementCostAt`, respecting impassable terrain + closed/locked doors + occupied cells); `plan.move` now costs the shortest LEGAL path, not the straight Bresenham line (slice 684). New `src/engine/plan/_spatial-gates.ts` gates `plan.attack` on line-of-sight and `plan.castSpell` on RAW spell range + line-of-effect, both throwing at plan time when violated (slice 685). All three gates are no-ops when the spatial context can't be resolved (positionless / map-less encounters), preserving pre-cycle behavior for the bulk of existing test fixtures.
- **In-repo web demo retired (slice 686).** The browser GUI built around the combat-fuzz replay viewer (slice 32, expanded through slices 583-619) moved to a sibling project so it can evolve on its own cadence without gating engine CI on front-end concerns. Deletes `web/`, `vite.web.config.ts`, `dist-web/`, `tests/integration/web-scenarios.test.ts`, `tests/unit/web-scrub-cache.test.ts`, `docs/web-demo-plan.md`, `.github/workflows/deploy-demo.yml`, and the `dev:web` / `build:web` / `preview:web` package scripts. **The fuzz CODE stays** — `scripts/combat-fuzz.ts` (CLI) and `scripts/combat-fuzz-core.ts` (pure simulator) remain in-repo as engine-debug surfaces and continue to back the four fuzz audit / integration tests.

### Breaking changes

#### Slice 683: `EncounterCreatedEvent` schema gains optional `combatants` field (additive, no migration)

**Pre-slice:** `EncounterCreatedEvent` carried only `combatantIds: ULID[]`. Encounters started with no per-combatant position state.

**Post-slice:** `EncounterCreatedEvent` carries either `combatantIds: ULID[]` (legacy) OR `combatants: ReadonlyArray<{ characterId, position? }>` (new). The new shape lets the consumer seed positions at encounter start. The either-or invariant is enforced in the planner and reducer (the Zod discriminated union doesn't carry a `.refine` so downstream type narrowing keeps working).

**Why:** unblocks position-aware consumers (top-down viewers, VTTs) that need to render real combatant positions from the event log instead of synthesizing formations.

**Migration:** existing consumers using `combatantIds` are unaffected; the planner accepts both shapes. Replay of pre-683 events is byte-identical (no migration needed).

**Detection:** new code only. Existing event logs replay unchanged.

#### Slice 684: `plan.move` cost is now shortest LEGAL path, not straight Bresenham

**Pre-slice:** `plan.move` costed a move by walking the Bresenham line from origin to target. A move whose Bresenham line passed through impassable terrain threw "Path crosses impassable terrain"; a move whose Bresenham crossed a closed door similarly threw.

**Post-slice:** `plan.move` calls `findPath` (Dijkstra). If a legal path exists, the cost is the path's total feet. If no legal path exists, it throws "No legal path from (X,Y) to (X,Y)..." If the path cost exceeds the actor's remaining movement, it throws (same `exceeds available movement` shape as before).

**Why:** RAW correction. A 5e move resolves over the shortest LEGAL route, not a straight line. Pre-684 the engine rejected RAW-correct routes that detoured around obstacles.

**Migration:** byte-identical when no obstacles sit between origin and destination (the Bresenham line === the shortest path). Tests or transcripts asserting on the old "Path crosses impassable terrain" throw will need to update to either "No legal path" (when sealed) or accept the now-correct detour cost.

**Detection:** any test that previously asserted a throw containing "crosses impassable" will fail. Tests asserting on `feetTraveled` for obstructed routes will see the detour cost instead of the straight-line cost.

#### Slice 685: positioned attacks / spells throw on out-of-range or blocked LoS

**Pre-slice:** `plan.attack` enforced weapon range against position via `assertWeaponInRange` (since slice ~568) but did NOT check line of sight. `plan.castSpell` did not enforce spell range or line-of-effect.

**Post-slice:** `plan.attack` calls `assertLineOfSightForAttack` after `assertWeaponInRange` — throws "line of sight blocked" when the Bresenham ray crosses impassable terrain or a closed/locked door. `plan.castSpell` calls `assertWithinSpellRange` per target — throws "spell range N ft" when distance > range or "line of effect blocked" when the ray is blocked. Both gates are no-ops when the spatial context can't be resolved (positionless / map-less encounters), preserving pre-685 behavior for the majority of existing test fixtures.

**Why:** RAW correction. Pre-685 a positioned attacker could "attack" a target behind a wall, and a positioned caster could "cast Fire Bolt" 200 ft away (Fire Bolt's RAW range is 120 ft).

**Migration:** tests / transcripts that synthesize positions on a mapped location but assume no spatial enforcement will see new errors. Two opt-out paths: (a) drop positions from the combatants (positionless preserves pre-685 behavior), or (b) drop the map from the location.

**Detection:** any throw with "line of sight blocked", "line of effect blocked", or "spell range N ft".

#### Slice 686: `dev:web` / `build:web` / `preview:web` npm scripts removed

**Pre-slice:** `npm run dev:web` / `build:web` / `preview:web` launched the in-repo web demo via Vite.

**Post-slice:** those scripts no longer exist (npm exits with the usual missing-script error). The GUI moved to a sibling project; consumers who used the in-repo demo should track the sibling project for the equivalent.

**Why:** GUI moved out of the engine repo (see slice 686 rationale above).

**Migration:** none for engine consumers — the engine API is byte-identical. Anyone who had `dev:web` muscle memory uses the sibling project's equivalent.

**Detection:** `npm run dev:web` exits with `Missing script: "dev:web"`.

### RNG-stream changes (per-seed reproducibility shifts)

Per [docs/determinism.md](../determinism.md), per-seed RNG reproducibility is version-sensitive. The following changes in this cycle MAY change per-seed `combat-fuzz` transcripts:

- **Slice 684**: `plan.move` cost is now the shortest legal path. A move whose pre-684 Bresenham route differed from the post-684 shortest-path route emits a different `CombatantMoved` event (same shape, different `feetTraveled`). RNG itself is not consumed by `findPath`; the stream is identical, but downstream events that gate on remaining movement (e.g. "did the actor have 5 ft left to dash?") may diverge.
- **Slice 685**: positioned attacks / spells that pre-cycle silently emitted normal events now throw at plan time. A pre-cycle transcript with an out-of-range positioned attack would have emitted `AttackRolled` + `DamageRolled` + ...; post-cycle the plan rejects and emits nothing. RNG is not consumed; the stream is identical for any path that pre-cycle would have passed the gate.

A `combat-fuzz --seed N` transcript generated on `0.3.0-alpha.0` will byte-match the same command on `0.4.0-alpha.0` only if no positioned attack/spell hit a gate AND no `plan.move` had a Bresenham-vs-shortest-path mismatch.

### Cycle inventory

Per-slice detail for slices 683-688 lives in `docs/changelog/slice-NNN.md` files. The pointer list below indexes the cycle.

**Release (slice 687): bump to 0.3.0-alpha.0**
Promotes the strict-RAW completeness cohort (slices 633-682, 50 slices) to a tagged release. Engine is now strict-RAW-complete for L1, L2, L3. `SCHEMA_VERSION` stays 1.
Detail: [slice-687.md](slice-687.md).

**Infra (slice 686): retire the in-repo combat-fuzzer web demo (GUI moved to a sibling project)**
Deletes `web/`, `vite.web.config.ts`, `dist-web/`, `tests/integration/web-scenarios.test.ts`, `tests/unit/web-scrub-cache.test.ts`, `docs/web-demo-plan.md`, and `.github/workflows/deploy-demo.yml`. Prunes `dev:web` / `build:web` / `preview:web` from `package.json` and trims tsconfig + README + roadmap accordingly. **The fuzz code stays** — `scripts/combat-fuzz.ts` (CLI) and `scripts/combat-fuzz-core.ts` (pure simulator) remain in-repo as engine-debug surfaces and continue to back the fuzz audit tests. Extends `tests/audit/doc-links.test.ts` SKIP_PREFIXES to exclude `docs/changelog/archive-` + `docs/changelog/released-versions` (frozen historical narrative; their references to since-removed paths are accurate snapshots). No engine-API change; suite drops to 540/540 files / 4118 tests (exactly the two retired web test files).
Detail: [slice-686.md](slice-686.md).

**Engine (slice 685): range + line-of-sight enforcement on attacks and spells (Work item 3 of the spatial combat plan)**
**Final slice of the spatial combat support cycle (683-685) — cycle complete.** New `src/engine/plan/_spatial-gates.ts` with `resolveSpatialContext`, `assertLineOfSightForAttack`, `assertWithinSpellRange`, `parseSpellRange`. `planAttack` now throws on LoS-blocked attacks (range was already enforced); `planCastSpell` throws on out-of-range or LoE-blocked spell targets. Both gates are no-ops when the spatial context can't be resolved (positionless / map-less encounters), preserving pre-685 behavior. Per-target enforcement; first violation rejects the cast. `parseSpellRange` handles the RAW vocabulary (Self / Touch / N feet / Sight / Special / 1 mile). 14 new tests; full suite 542/542 files green. **The dnd-web viewer can now surface engine-thrown range / LoS errors directly to the player.**
Detail: [slice-685.md](slice-685.md).

**Engine (slice 684): pathfinding helpers + shortest-path move cost (Work item 2 of the spatial combat plan)**
New `src/derive/pathing.ts` with `findPath`, `reachableCells`, `feetToCell` / `cellToFeet` — Dijkstra over `movementCostAt`, respecting impassable, closed/locked doors, and occupied cells. `plan.move` refactored: cost is now the shortest LEGAL path (not straight Bresenham). Sealed destinations throw "No legal path"; detours that exceed remaining movement throw. Bundled slice-683 inline fix: placement validation now uses `feetToCell` to convert feet-coord positions (engine-wide convention) before bounds/terrain checks. 18 new tests (10 pathing + 4 plan.move + 4 fixture adjustments to slice 683); full suite 541/541 files green.
Detail: [slice-684.md](slice-684.md).

**Engine (slice 683): combatant placement (Work item 1 of the spatial combat plan)**
**First slice of the spatial combat support cycle (683-685).** Unblocks the dnd-web viewer: combatants can now start an encounter at real positions, and `planPlaceCombatant` handles mid-encounter placement (summons, teleports). `EncounterCreated` gains an optional `combatants: ReadonlyArray<{ characterId, position? }>` alongside legacy `combatantIds`; new `CombatantPlaced` event for mid-encounter. Placement validation: in-bounds + not impassable + no same-cell collision (when a location map is present). Map context resolves via existing `state.characterLocations[id] → state.locations[id].map` (same path `plan.move` uses). 9 new tests including replay-equivalence; full suite 539/539 files green.
Detail: [slice-683.md](slice-683.md).

