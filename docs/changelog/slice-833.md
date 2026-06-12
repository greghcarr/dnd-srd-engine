# Slice 833 — combat-fuzz drop-in opponent character (PvP)

**Type:** Infra (the fuzz-harness consumer seam) + a slice test. No engine, content, or schema change.

## What & why

dnd-web's interactive duel calls `runBattle` to generate a positioned 1v1, then branches the campaign and drives it live. Slice 778 let the consumer drop a saved sheet into **team A[0]** (`playerCharacter`). This adds the mirror axis — **`opponentCharacter`** — that seats a second saved sheet into **team B[0]** verbatim (its own id / class / level / gear), so the web app can run **real-vs-real 1v1 (PvP)** instead of player-vs-seed-roll.

## The change (`scripts/combat-fuzz-core.ts`)

- **`FuzzBattleOptions.opponentCharacter?`** — `{ character, itemInstances }`, documented like `playerCharacter`: an INDEPENDENT axis from the seed, only meaningful for the 'pc' opponent team (ignored for `vs='monster'`).
- **`opponentCharacterBuilt`** — built next to `playerCharacterBuilt` via the same `buildFromPlayerCharacter` (no roll, no choice resolution; used verbatim).
- **`teamB` 'pc' branch** — now index-aware: it still draws-and-discards the shared `buildL1` for B[0] (keeping the seed stream aligned, exactly how `teamA[0]` seats `playerCharacterBuilt`), then seats `opponentCharacterBuilt` at index 0 when present.
- **Item-acquire loop** — the opponent drop-in emits its own `itemInstances` (ItemAcquired) with no weapon/armor/shield/potion synthesis, then `continue`s — the player-character treatment.
- **`level > 1` loop** — `if (pc === opponentCharacterBuilt) continue;`: it arrives at its own level and is never re-leveled (`opts.level` sizes only the map / other combatants).

## Invariants held

- **The no-`opponentCharacter` path is byte-identical to today** — verified by the full fuzz golden + matrix tier (`fuzz-matrix` 85, `fuzz-tactical-matrix`, `fuzz-reactions-matrix`, the `s-reactions` / `s-tactical-movement` goldens, the flag / level-range / pool integration tests — 139 tests). The seed-stream alignment (draw-and-discard B[0]'s build) is what keeps the rest of team B + the arena map seed-deterministic.
- `opts.level` still sizes only the map / other combatants; both drop-ins keep their own levels.

## Tests

`tests/integration/combat-fuzz-opponent-character.test.ts` (5): a battle with BOTH drop-ins seats A[0] = player and B[0] = opponent verbatim (own ids, classes, levels, gear); the battle is deterministic given the seed (same teams / winner / rounds across runs); adding `opponentCharacter` doesn't perturb the seed stream (the seed-built B[1] + arena map stay identical with/without it); B[0] keeps its own level while the seed-built B[1] is sized at `opts.level`; and it's ignored for `vs='monster'` (B[0] is a Beast, the opponent snapshot never enters state).

## Verification

`npx tsc --noEmit` clean; the 5-test slice + the slice-778 player-character test green; the full fuzz golden/matrix/integration tier (139 tests) green (byte-identity of existing battles preserved); `npm run test:fast` green.
