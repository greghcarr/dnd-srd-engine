# Slice 717 — fuzz harness: Free Duel class pin (`playerClass`)

**Type:** Fuzz-harness / interactive-play support (`scripts/combat-fuzz-core.ts`). Additive; the default path (no `playerClass`) is byte-identical. No engine API or content change.

dnd-web's interactive duel reuses `runBattle` to generate the positioned 1v1 roster. The Free Duel already lets the player pick LEVEL (via `level`); this adds picking their CLASS. `runBattle` previously randomized every class from the seed with no override hook.

## What changed

- **`FuzzBattleOptions.playerClass?: string`** — when set to a valid `CLASS_POOLS` classId, team A index 0 (the player) builds as that class. All other combatants stay random. An unknown id (or unset) leaves A[0] random.
- **`buildL1` gained an optional `forcedClassId`** — it still consumes the pool-pick RNG draw (kept identical), then overrides the drawn pool with the matching `CLASS_POOLS` entry; an unknown id falls back to the random pick. Downstream draws come from the chosen pool.
- **`runBattle` pins A[0] on an isolated cursor.** A[0] is ALWAYS built from the shared cursor first (so the seed-driven opponent + map + other combatants advance the stream identically whether or not a class is pinned). When a valid class is pinned, that random A[0] is discarded and rebuilt as the chosen class from a separate, seed-derived `pinRngFloat` cursor — so the substitution never perturbs the shared stream.

## Determinism

Class is a fully **independent axis** from the seed:

- The seed-driven **opponent** (team B) and the tactical **map** are byte-identical with or without the pin (the pin uses an isolated cursor; A[0]'s random shared-cursor build is still drawn-and-discarded to keep the shared stream aligned; the map is seed-derived, not cursor-derived).
- The pinned A[0] is deterministic for a given `(seed, playerClass)` (its build draws from the seed-derived `pinRngFloat`).
- Battle outcome (winner/rounds) naturally differs once the player's class changes — only the *setup* (opponent, arena) is held fixed.

Item/event IDs are random ULIDs (as before), so the discarded build's extra ID generation is irrelevant (tests assert on build shape, not raw IDs).

## Leveling

The pinned A[0] levels via the existing `levelUpTo` + `drainPendingChoices` path exactly like everyone else: the level-up loop reads `pc.build.classId`, which for the pinned character is the chosen class, so the computer auto-resolves its level-up choices to the shared `level`.

## Files

- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts): `FuzzBattleOptions.playerClass`; `buildL1` `forcedClassId`; `runBattle` isolated-cursor pin of team A[0].
- [tests/integration/combat-fuzz-flags.test.ts](../../tests/integration/combat-fuzz-flags.test.ts): +4 tests (wizard pin at level 4; independent-axis opponent + map identity; `(seed, playerClass)` determinism; unknown-id random fallback). Existing flag-matrix tests unchanged.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. Default path byte-identical (no `playerClass` → no behavior change), so the golden/determinism/fuzz-matrix suites are unaffected.

## Handoff (dnd-web)

`BattleConfig.playerClass → runBattle({ playerClass })`. Field name `playerClass` on `FuzzBattleOptions`; valid ids are the `CLASS_POOLS` classes (the 12 SRD base classes); unknown id → random (no throw). The class-pin determinism-preserving draw was done (isolated-cursor approach: opponent + map identical with or without the pin).
