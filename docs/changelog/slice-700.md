# Slice 700 — feat: richer tactical arenas (irregular rock border, terrain types, fenced pens)

**Type:** Engine fuzz-harness content. Rewrites `generateArenaMap` so tactical arenas are less cluttered, varied in shape per seed, edged with an irregular rock border, textured with `difficult` + `water` terrain, and occasionally enclose a fenced pen. Connectivity and determinism are preserved; `movement: 'none'` is unaffected (tactical-only).

## Why

The arenas were a plain rectangle scattered densely with a single obstacle type (rendered as trees in the viewer). The user asked for: fewer obstacles, other obstacle types, seed-varied irregular shapes, a rocky border, and an occasional fenced-in area (with an entrance).

## What's wired ([scripts/tactical/arena.ts](../../scripts/tactical/arena.ts))

- **Irregular rock border (seed-varied shape).** Every edge carries a rock wall whose inward depth follows a smooth per-position random walk (1-3 cells), so the playable region is an organic blob that differs by seed. The full outer ring is always rock.
- **Less dense, multi-type obstacles.** Impassable cover dropped from 0.18 to 0.07 (sparse, isolated pillars), plus passable `difficult` terrain (~0.06, slows movement 2×) and `water` ponds (~0.04, grown as small clusters). Fewer hard blocks, more texture.
- **Occasional fenced pen.** On the larger (squad) map only, ~40% of the time, a 4-6 cell impassable ring is placed in the lower interior with a single **side-cell gate** — a clean orthogonal doorway (never a corner), so the pen always has a real entrance into its open interior.
- **Structural connectivity, unchanged guarantee.** A "protected corridor" — each spawn column between its team's spawns, plus a horizontal connector at the top spawn row — is never allowed to hold impassable terrain. That corridor links every spawn, so no border / fence / pillar can disconnect A from B. The `findPath` assertion (now over every spawn pair) is the guard.
- **Dimensions** enlarged a little (duel 16×12 → 18×13, squad 20×14 → 22×16) so the border + features leave a comfortable interior. Spawn columns inset 4 to clear the thickest border.

All tunables (border thickness, the three densities, fence chance + size, spawn inset + clearance) are named constants in [scripts/tactical/constants.ts](../../scripts/tactical/constants.ts). The only randomness remains `seededRNG(seed).fork(MAP_SALT)`.

## Verification (measured)

Over seeds 1-100 (squad): **0 connectivity failures** across all spawn pairs; fenced pens in ~15% of seeds (occasional); maps are seed-deterministic. Over seeds 1-40 × {1v1, 2v2}: draw rate unchanged at 3.8% (the bigger maps didn't lengthen battles), and **0 off-grid / out-of-bounds / impassable moves** (slice-698 legality guard still holds with the richer terrain).

## Files

- Edited: [scripts/tactical/arena.ts](../../scripts/tactical/arena.ts) (full generator rewrite), [scripts/tactical/constants.ts](../../scripts/tactical/constants.ts) (new map constants), [tests/unit/tactical-arena.test.ts](../../tests/unit/tactical-arena.test.ts) (new-model assertions), [tests/integration/fuzz-tactical-setup.test.ts](../../tests/integration/fuzz-tactical-setup.test.ts) (duel width 16 → 18).
- Added: [docs/changelog/slice-700.md](slice-700.md).

## Tests

- `npx tsc --noEmit` clean; full `npx vitest run` green.
- `tactical-arena` unit (8): dim scaling/clamp; spawns on clean ground with a clear radius, A left of B; full outer ring is rock; all four terrain kinds appear; A↔B path for every spawn pair; fenced pens occur occasionally (not always/never); **every fenced pen's interior is reachable from a spawn** (the entrance works); seed-determinism.
- `fuzz-tactical-matrix` move-legality (slice 698) still holds on the richer terrain; `s-tactical-movement` determinism + OA anchors (seeds 5, 10) still hold; setup + default-guard pass.
- Byte-identity for `'none'`: fuzz-matrix + replay-equivalence unchanged (the generator only runs in tactical mode).

## RNG impact / Breaking change

**No RNG impact in `'none'` mode.** The arena RNG is the tactical-only `fork`. The tactical map shape changes (by design), but tactical mode is new this cycle and `'none'` is positionless. No engine `src/` change; no API change.

## Audit (Uncle Bob)

- **SRP / phases**: the generator reads as labelled phases (border → fence → pillars → soft terrain → assert), each a focused block; the connectivity invariant lives in one place (the protected-corridor sets) and every impassable write goes through one `setImpassable` guard.
- **No magic numbers**: every tunable is a named constant; geometry (spawn inset vs border thickness, fence region vs corridor) is derived, not hard-coded.
- **Structural, not retried**: connectivity is guaranteed by construction (the corridor), not a regenerate-on-miss loop; the assertion is a tautology guard.
- **Entrance guarantee (pattern-aware)**: the fence gate is restricted to a non-corner side cell so the doorway is orthogonally passable, and a dedicated test proves each pen's interior is reachable — closing the "sealed pen" failure mode at the test layer, not just by inspection.
