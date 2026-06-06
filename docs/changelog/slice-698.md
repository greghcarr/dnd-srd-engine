# Slice 698 — fix: Push forced-movement lands on a legal cell, not an off-grid vector

**Type:** Engine correctness fix (forced movement). The weapon-mastery Push and Open Hand Push computed the shove destination by adding a *cell count* to a *feet* coordinate, producing off-grid positions with no bounds / impassable / occupancy check — a target could be shoved off the map or onto cover. Slice 697's convergence (melee hits now land reliably) surfaced it. `movement: 'none'` stays byte-identical.

## Why

The dnd-web consumer reported that slice 697 "introduced illegal moves": some `CombatantMoved.toPosition` values were off the cell grid and landed on impassable cover or out of bounds. Repro (engine `dev`, `runBattle({ seed, pack, level:1, movement:'tactical' })`, map 20×14):

- seed 19, 2v2: a `CombatantMoved` to `{x:18,y:33}` = cell (3,6), **impassable**.
- seed 29, 2v2: a `CombatantMoved` to `{x:37,y:-2}` = cell (7,-1), **out of bounds**.

The trace showed the illegal move directly follows a `WeaponMasteryActivated mastery=Push`, not any movement-policy code: the cause is the **Push mastery**, not the slice-697 closing path (the policy already routes through `reachableCells` + `cellToFeet`, which are in-bounds and grid-aligned). Slice 697 only exposed it — before convergence the ranged stalemate rarely landed melee Push hits.

## Root cause

[src/engine/plan/weapon-mastery.ts](../../src/engine/plan/weapon-mastery.ts) (and, by pattern-check, [src/engine/plan/open-hand-technique.ts](../../src/engine/plan/open-hand-technique.ts)) did:

```ts
const cells = PUSH_DISTANCE_FEET / CELL_SIZE_FEET;     // 10 / 5 = 2
toPosition: { x: pos.x + dx * cells, y: pos.y + dy * cells }  // adds 2 (cells) to a FEET coord
```

Two bugs in one: it added `2` (a cell count) to a feet coordinate, so the target moved 2 ft (off-grid: feet should be cell multiples) instead of 10 ft (2 cells); and it never validated the destination against the map. The third forced-movement site, `CreaturePushed` in [cast-spell.ts](../../src/engine/plan/cast-spell.ts), is informational-only (no `toPosition`) and was already correct.

## The fix

New pure helper `pushDestination(fromFeet, dir, distanceFeet, { map?, doors?, occupiedFeet? })` in [src/derive/pathing.ts](../../src/derive/pathing.ts): steps the target cell-by-cell in the sign direction up to the distance, stopping before the first out-of-bounds / impassable / occupied / closed-door cell (RAW: forced movement stops against an obstacle), and returns a **grid-aligned** feet position. With no map it returns the raw grid-aligned destination (the engine-wide map-less convention). Both Push sites now resolve the location map + doors the same way `plan.move` does, call the helper, derive `feetTraveled` from the actual (possibly clamped) distance, and emit no `CombatantMoved` when the shove is fully blocked.

`'none'` byte-identity holds because positionless encounters have no combatant positions, so the Push case never emitted a move there in the first place (the guard `targetCombatant?.position !== undefined`).

## Verification

Across seeds 1-40 × {1v1, 2v2} (80 tactical battles, 642 `CombatantMoved`): **0 off-grid / out-of-bounds / impassable destinations and 0 illegal final positions** (was: seeds 19, 29 illegal). The consumer's requested matrix assertion is added and would have caught both cases.

## Files

- Added: `pushDestination` in [src/derive/pathing.ts](../../src/derive/pathing.ts); [tests/unit/derive/push-destination.test.ts](../../tests/unit/derive/push-destination.test.ts); [docs/changelog/slice-698.md](slice-698.md).
- Edited: [src/engine/plan/weapon-mastery.ts](../../src/engine/plan/weapon-mastery.ts) (Push → validated shove), [src/engine/plan/open-hand-technique.ts](../../src/engine/plan/open-hand-technique.ts) (Push → validated shove; pattern-check), both with the dead `CELL_SIZE_FEET` removed; [tests/audit/fuzz-tactical-matrix.test.ts](../../tests/audit/fuzz-tactical-matrix.test.ts) (move-legality assertion).

## Tests

- `npx tsc --noEmit` clean; full `npx vitest run` green.
- `push-destination` unit (7): full-distance grid-aligned shove; clamp at edge / impassable / occupied; origin when first cell blocked; diagonal clamp; map-less raw destination.
- `fuzz-tactical-matrix`: new legality assertion (no off-grid / OOB / impassable `CombatantMoved` or final position over seeds 1-40 × {1v1, 2v2}); convergence (draws ≤ 3%, seed 42 resolves) still holds.
- Existing Push tests pass unchanged: `slice-386` size gate (still emits a move for a Large-or-smaller target), `slice-380` Open Hand, `push-mechanic` (Gust of Wind `CreaturePushed`).
- Byte-identity for `'none'`: fuzz-matrix + replay-equivalence + default-guard unchanged.

## RNG impact / Breaking change

**No RNG impact** — Push emits no roll. The tactical event stream's Push `toPosition` / `feetTraveled` change (now correct), but tactical mode is new this cycle and `'none'` is positionless (Push emits no move there). This corrects positioned Push for **every** consumer, not just the fuzz: a Push now lands on a legal, grid-aligned cell. No API change; `pushDestination` is an internal derive helper (not added to the public barrel).

## Audit (Uncle Bob)

- **Root-cause + pattern-check**: fixed the unit/validation bug at its source (a shared `pushDestination` helper) and applied it to *both* push sites, not just the reported weapon-mastery one; verified the third site (`CreaturePushed`) was already correct.
- **DRY / no magic numbers / no dead code**: the cell-step + clamp logic lives once in `pushDestination`; the now-redundant `CELL_SIZE_FEET` locals were removed from both planners.
- **Purity / SRP**: `pushDestination` is pure geometry over the map; the planners only resolve context and emit the event.
- **No defensive cruft**: the helper returns the origin (caller emits nothing) when a shove is fully blocked, rather than throwing for a legitimate "can't be pushed" case.
