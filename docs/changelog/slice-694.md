# Slice 694 — feat: arena map generation + spread placement for the tactical fuzz

**Type:** Engine fuzz-harness primitive (second of three). Adds deterministic arena generation and spread placement to `runBattle`'s tactical mode: combatants now spawn spread out on a generated map with scattered cover. No movement yet — they spawn positioned but stationary; the movement policy + opportunity-attack resolution land in slice 695. `'none'` stays byte-identical.

## Why

Slice 693 added the `movement: 'none' | 'tactical'` option + the move-policy seam. For dnd-web's `tactical-replay` viewer to have something to render, the engine must emit a `LocationCreated` with a battle map and place each combatant at a distinct spot via a positioned `EncounterCreated`. The map + positions live in the event log / state; dnd-web reads them from there.

## What's wired

### `scripts/tactical/constants.ts` (new)

Named tunables so the harness doesn't grow magic numbers and the generator reads one source of truth: `MAP_SALT` (the arena RNG fork salt), `ARENA_DIMS` (`duel` 16×12, `squad` 20×14), `SPAWN_COLUMN_INSET_CELLS`, `COVER_BAND_MARGIN_CELLS`, `COVER_DENSITY`. (Deferred here from the slice-693 sketch so the file lands with its first consumer rather than as dead code.)

### `scripts/tactical/arena.ts` (new) — `generateArenaMap(seed, teamSize)`

Pure. Returns `{ map: LocationMap; spawnsA: Position[]; spawnsB: Position[] }` (spawns in feet-coords).

- **One PRNG family:** map randomness is `seededRNG(seed).fork(MAP_SALT)` — a fresh stream forked from a same-seed instance. `fork` reads but never advances its source, so the arena stream is independent of the engine's roll RNG and cannot perturb battle outcomes. It is only ever constructed in tactical mode.
- **Dimensions** scale with team size; `teamSize > 2` clamps to `squad`.
- **Spawns** sit on a left column (A) and a mirrored right column (B), spread evenly down each column, always on passable terrain.
- **Cover** (`impassable` pillars) is confined to a middle band, kept a 2-cell margin clear of the spawn columns, so cover never sits on or adjacent to a spawn.
- **Structural connectivity, not a regenerate loop:** pillars are placed greedily over a deterministically-shuffled candidate list, each accepted only if no existing pillar is within its 3×3 neighbourhood (isolation). A set of pairwise non-adjacent impassable cells cannot form a wall, so the passable region stays 8-connected and an A↔B path is guaranteed by construction. A single `findPath` check asserts this (throws if a future edit breaks the rule) — it does not loop to regenerate.

### `scripts/tactical/setup.ts` (new) — `emitTacticalSetup(...)`

Extracted from `runBattle` so the script only wires it. Engine-free (it constructs record events directly, since there is no `plan.*` for `LocationCreated`/`CharacterLocationChanged`). Emits, in the mandatory order, `LocationCreated` then one `CharacterLocationChanged` per combatant (so the positioned `createEncounter` and later `plan.move` resolve the map via `state.characterLocations`), and returns the updated campaign + `locationId` + the per-combatant `placements`.

### `runBattle` wiring

The encounter-creation block branches once on `movement`: tactical calls `emitTacticalSetup`, sets `result.locationId`, and creates the encounter via the positioned `combatants: placements` path; `'none'` keeps the legacy `combatantIds` call unchanged. ~6 lines of wiring; the generation lives in the extracted modules.

## Files

- Added: [scripts/tactical/constants.ts](../../scripts/tactical/constants.ts), [scripts/tactical/arena.ts](../../scripts/tactical/arena.ts), [scripts/tactical/setup.ts](../../scripts/tactical/setup.ts), [tests/unit/tactical-arena.test.ts](../../tests/unit/tactical-arena.test.ts), [tests/integration/fuzz-tactical-setup.test.ts](../../tests/integration/fuzz-tactical-setup.test.ts), [docs/changelog/slice-694.md](slice-694.md).
- Edited: [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) (import + encounter-creation branch + `locationId` on the result).

## Tests

- `npx tsc --noEmit`: clean.
- `tactical-arena` unit (6 cases over 8 seeds × team sizes): dimension scaling/clamp; one distinct passable spawn per combatant with A left of B; cover confined to the band and never on/adjacent to a spawn; pillar isolation; A↔B path for every spawn pair; same-seed deep-equality.
- `fuzz-tactical-setup` integration (4 cases): 1v1 emits `LocationCreated` + 2 `CharacterLocationChanged` + positioned `EncounterCreated` + map in `state.locations` + positioned combatants; 2v2 → 4 of each; same-seed normalized-determinism; **tactical event log replays to the same state** (replay-equivalence on the new location/positioned events).
- Byte-identity for `'none'`: fuzz-matrix (37) + replay-equivalence + the slice-693 default-guard pass unchanged.
- Full `npx vitest run`: green.

## RNG impact / Breaking change

**No RNG impact in `'none'` mode.** The tactical branch is gated behind `if (movement === 'tactical')`; the `'none'` path is the unchanged legacy `combatantIds` call. The arena RNG is a `fork` (independent stream) constructed only in tactical mode. No engine-API change; `runBattle` gains no new required option.

## Audit (Uncle Bob)

- **Scope**: arena generation + placement + the wiring branch. No movement, no opportunity attacks — combatants spawn positioned but stationary.
- **SRP**: `generateArenaMap` (pure geometry), `emitTacticalSetup` (event emission), `runBattle` (orchestration) are three separate jobs in three files. The script gained wiring, not logic.
- **DRY / magic numbers**: every tunable is a named constant in one module. The spawn/band geometry derives from `SPAWN_COLUMN_INSET_CELLS` + `COVER_BAND_MARGIN_CELLS`, not scattered literals.
- **No defensive cruft**: connectivity is structural; the lone `findPath` guard throws on a logic violation rather than silently regenerating.
- **Pattern-check**: the direct-construct-and-commit of `LocationCreated`/`CharacterLocationChanged` mirrors the existing `ItemAcquired`/`CharacterCreated` emission in the same script (same `newEventId()` + `nextAt()` + `as Event` shape), so timestamps stay deterministic and ordered with the rest of setup.

## Open follow-ups

- Slice 695: `planTacticalMove` (RNG-free, total-ordered candidate selection) + the tactical `MovePolicy` factory (disengage / move / opportunity-attack resolution with melee-weapon selection), the golden replay test, and the tactical fuzz/replay matrix with a positive-presence assertion that movement + OA paths actually fire.
