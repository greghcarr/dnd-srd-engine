# Slice 684 — engine: pathfinding helpers + shortest-path move cost (Work item 2 of the spatial combat plan)

**Type:** Derive helpers + planner refactor + slice-683 correctness fix. **Second slice of the spatial combat support cycle (683-685).**

Closes Work item 2 of the user's spatial plan. Two changes:

1. **New `src/derive/pathing.ts`** — `findPath`, `reachableCells`, plus the `feetToCell` / `cellToFeet` coordinate helpers. Dijkstra over the existing `movementCostAt` helper, respecting impassable terrain, closed/locked doors, and occupied cells.

2. **`plan.move` now costs the shortest LEGAL path**, not the straight Bresenham line. Pre-684 a move was costed by walking the Bresenham line — wrong when obstacles forced a detour, and a move whose Bresenham line passed through impassable terrain wrongly threw. Post-684, `plan.move` calls `findPath`; if no legal path exists it throws with a clear "No legal path" message; if the path cost exceeds remaining movement it throws (same `exceeds available movement` shape as before).

Slice-683 inline correction (bundled here so the cycle stays internally consistent):

- The slice-683 placement validation treated `Position` as cell-coords; `plan.move` treats it as feet-coords (`Math.floor(pos.x / cellSizeFeet)`). Slice 684 standardizes on **feet-coords** across both surfaces. Slice-683 tests where the cell-coord vs feet-coord distinction mattered (impassable, collision) updated to use feet-coord values.

## What's wired

### `src/derive/pathing.ts` (new)

- `feetToCell(pos, cellSize)` / `cellToFeet(cell, cellSize)` — coordinate conversion helpers.
- `findPath(map, doors, fromFeet, toFeet, { occupiedFeet? }): { path, costFeet } | null` — Dijkstra over `movementCostAt`. Returns the shortest legal cell-coord path + total cost in feet, or null when blocked. Searcher's own cell is never occupied.
- `reachableCells(map, doors, fromFeet, budgetFeet, { occupiedFeet? }): { cells, costFeetByCellKey }` — every cell within budget + per-cell cost map. Origin always included (cost 0).
- 8-neighbor adjacency (Chebyshev); closed/locked doors block; impassable cells skipped; occupied cells skipped.

### `src/engine/plan/movement.ts`

- `planMove` map-aware branch refactored from straight-Bresenham cost summation to `findPath`. Cost = `pathResult.costFeet`. When the path planner returns null, the planner throws "No legal path from (X,Y) to (X,Y)..." (impassable / blocked / occupied — same condition that pre-684 wrongly accepted some routes).
- Occupied cells: other in-encounter combatants' positions are passed as `occupiedFeet` so the path planner refuses to route through them.
- Doors: location's `doorIds` are resolved into Door records and passed to the path planner. Closed / locked door cells block movement (and routing).

### `src/engine/plan/encounter.ts`

- `validatePlacementAgainstMap` now converts feet-coord positions to cell-coords via `feetToCell` before:
  - bounds check (cell.x vs widthCells, cell.y vs heightCells).
  - impassable check.
  - collision check (two combatants in the same CELL collide, even if their exact feet-coords differ within the cell).
- Behavioral fix: prior to this slice, the validator's bounds were `position.x >= widthCells` (treating positions as cells). Slice 683's tests passed only because the test fixtures used cell-sized integers as feet-coords. Now correct under both conventions.

### Slice-683 test fixture adjustments

- impassable test: feet (0, 10) → cell (0, 2). Was `{x: 0, y: 2}` which under feet-coords is cell (0, 0) (normal).
- collision test: feet (0,0) and feet (3, 4) both land in cell (0, 0). Was `{x:0,y:0}` twice (still collides under either interpretation).
- placement test: feet (15, 0) → cell (3, 0). Was `{x: 3, y: 0}` which is cell (0, 0) under feet-coords.
- replay test: feet (25, 0) → cell (5, 0). Was `{x: 5, y: 0}` which is cell (1, 0).

## Scope decisions

- **Coordinate convention: positions are FEET-coords when a map is present.** Matches the engine-wide `plan.move` convention since the slice-600 spatial cohort. Documented inline in `src/derive/pathing.ts`.
- **8-neighbor Chebyshev, not 4-neighbor Manhattan**: matches D&D 5e's "every-other-diagonal-costs-extra" rule when used with `movementCostAt` returning 1/2/Infinity per terrain. The simple 8-neighbor with uniform cost-1 diagonals is RAW-compliant.
- **Dijkstra over A***: A* would be marginally faster with a good heuristic, but Dijkstra is correct for any cost function. Maps are combat-scale (≤30x30 cells typically); the constant-factor difference doesn't matter.
- **Door blockers are 'closed' OR 'locked'**: matches the existing `hasLineOfSight` `doorBlocksSight` convention. Open doors don't block.
- **Tiny priority queue (sorted array)**: adequate for combat-scale maps; binary heap is a trivial future refinement.
- **Sealed-destination throws, not silently fails**: a move whose target is unreachable should surface the error so consumers can warn the player. Pre-684 some sealed routes silently succeeded (Bresenham crossed impassable but the throw wasn't catching the right condition).

## Files

- **[../../src/derive/pathing.ts](../../src/derive/pathing.ts)** (new): `findPath`, `reachableCells`, `feetToCell`, `cellToFeet`. ~200 lines.
- **[../../src/engine/plan/movement.ts](../../src/engine/plan/movement.ts)**: map-aware branch in `planMove` refactored from Bresenham cost to `findPath` cost. Occupied-cell + door context threaded in.
- **[../../src/engine/plan/encounter.ts](../../src/engine/plan/encounter.ts)**: `validatePlacementAgainstMap` uses `feetToCell` for bounds + terrain checks; collision is in cell-space.
- **[../../tests/unit/derive/slice-684-pathing.test.ts](../../tests/unit/derive/slice-684-pathing.test.ts)** (new): 10 tests for `findPath`, `reachableCells`, `feetToCell` / `cellToFeet`.
- **[../../tests/unit/engine/slice-684-move-shortest-path.test.ts](../../tests/unit/engine/slice-684-move-shortest-path.test.ts)** (new): 4 tests pinning `plan.move`'s shortest-path behavior.
- **[../../tests/unit/engine/slice-683-combatant-placement.test.ts](../../tests/unit/engine/slice-683-combatant-placement.test.ts)**: 4 fixture adjustments (impassable, collision, place, replay) to use feet-coords. Tests still 9/9 pass.

## Tests

- `npx vitest run tests/unit/derive/slice-684-pathing.test.ts`: 10/10 pass.
- `npx vitest run tests/unit/engine/slice-684-move-shortest-path.test.ts`: 4/4 pass.
- `npx vitest run tests/unit/engine/slice-683-combatant-placement.test.ts`: 9/9 pass (after fixture adjustments).
- Full suite: 541 files / 4,126 passing + 173 skipped (was 539 / 4,112 post slice 683; +2 files / +14 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Behavior change for `plan.move` on maps with obstacles.** Pre-684 a move whose Bresenham line crossed impassable terrain threw "Path crosses impassable terrain". Post-684 the move SUCCEEDS via detour (if one exists and fits in remaining movement). This is the RAW-correct behavior and unblocks position-aware play, but consumers whose tests/transcripts asserted on the old "crosses impassable" throw will see different outcomes.

The `(Bresenham cost path) === (shortest path)` case (no obstacles between from and to) is byte-identical.

## Audit (Uncle Bob)

- **Names**: `findPath` / `reachableCells` match common graph-traversal API names. `feetToCell` / `cellToFeet` are unambiguous about direction.
- **DRY**: `findPath` and `reachableCells` share the same Dijkstra implementation (`dijkstra` helper). The feet → cell conversion is centralized in `feetToCell` so both planners and the pathing module use the same flooring rule.
- **SRP**: `pathing.ts` does graph traversal; the planner does intent → events. Each module's job is single-step.
- **Magic numbers**: `NEIGHBORS_8` is the named 8-direction adjacency array. `DEFAULT_CELL_SIZE_FEET` reused from the schema's exported constant.
- **Pattern-check**: searched `src/derive/` for other Bresenham usages — `hasLineOfSight` and `hasLineOfEffect` still use Bresenham, which is correct for LoS (Bresenham IS the line-test). The Bresenham `bresenhamCells` export stays; planMove's use of it is what got replaced. No other planMove-style "cost summation along a straight line" patterns remain.

## Open follow-ups

Spatial combat support cycle (slice 684 of 3):

- ~~683~~: Combatant placement. Landed.
- ~~684 (this slice)~~: Pathfinding + shortest-path move cost. Landed.
- **685**: Range + LoS enforcement on `plan.attack` and `plan.castSpell` when both attacker and target have positions.

**Post-cycle deferred** (per the user's plan):
- Elevation, verticality, cover-as-AC (out of scope).
- Movement AI / scenario generation (above-engine layer).
- Heap-backed priority queue in `dijkstra` (constant-factor speedup; not needed at combat scale).
