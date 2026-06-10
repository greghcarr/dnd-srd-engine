# Slice 778 — fuzz harness: drop-in player character (`playerCharacter`)

**Type:** Fuzz-harness / interactive-play support (`scripts/combat-fuzz-core.ts`). Additive; the default path (no `playerCharacter`) is byte-identical. No engine API or content change.

dnd-web's interactive duel calls `runBattle` for the set-up, then branches the campaign and drives it live. Slice 717 let the player pick their CLASS (`playerClass`); this lets the consumer drop a fully **saved character** (a dndbnb sheet) into team A[0] — its own id, class, level, and gear — instead of any roll. The Free Duel can now pit *your actual character* against a seed-matched opponent.

## What changed

- **`FuzzBattleOptions.playerCharacter?: { character: Character; itemInstances: ReadonlyArray<ItemInstance> }`** — when set, team A index 0 is the supplied `character` verbatim (its own `id`), bypassing `buildL1` + `levelUpTo` for that slot. `playerClass` is ignored for A[0] (the character wins). Unset → A[0] behaves exactly as before.
- **Setup emission:** for the drop-in slot, the harness emits one `ItemAcquired` per `itemInstances` entry, then the `CharacterCreated` for `character`. It arrives already armed, so there is no weapon/armor/shield/potion synthesis and no auto-equip — the snapshot carries its own `equipped` state (same order as the normal path: all acquires, then all `CharacterCreated`).
- **New `buildFromPlayerCharacter` helper** wraps the caller's character as a `BuiltCharacter` so the turn loop can drive it. Nothing is rolled: `build.classId` is the character's actual class (the only `build` field the turn loop reads — for the action dispatch + the `MASTERY_CLASSES` gate); `weaponInstance` points at the equipped main hand (already among `itemInstances`), so Attack intents reference a real in-state instance and weapon-mastery resolves off the pack; `potionInstance` points at an inventory healing potion if present, else a placeholder that is never emitted and never in state (the low-HP ConsumeItem branch self-skips).
- **`runBattle` drops in A[0] on the verbatim path.** A[0] is ALWAYS built from the shared cursor first (drawn-and-discarded), so the seed-driven opponent + other combatants + map advance the stream identically whether or not a character is dropped in. The level-up loop skips the drop-in (it arrives at its own level); the opponent + others still level to `opts.level`.

## Determinism

The player character is a fully **independent axis** from the seed, exactly like `playerClass`:

- The seed-driven **opponent** (team B), the **other combatants**, and the tactical **map** are byte-identical with or without the drop-in (A[0]'s random shared-cursor build is still drawn-and-discarded to keep the shared stream aligned; the map is seed-derived).
- The opponent + other combatants are built at **`opts.level`**. The caller passes `level` = the character's total level so they match; the player character itself is **never re-leveled**, so a level mismatch (e.g. a L1 sheet dropped into a L5 set-up) leaves A[0] at its own level while the opponent is L5.
- `teamACharacterIds[0]` is the supplied `character.id`; the `FuzzBattleResult` shape is unchanged.
- Battle outcome (winner/rounds) naturally differs once A[0] is a specific character — only the *set-up* (opponent, others, arena) is held fixed.

Item/event IDs are random ULIDs (as before), so tests assert on build shape, ids, class, level, and gear — not raw bytes.

## Files

- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts): `FuzzBattleOptions.playerCharacter`; `buildFromPlayerCharacter`; `runBattle` verbatim drop-in of team A[0] (build, setup emission, level-up skip).
- [tests/integration/combat-fuzz-player-character.test.ts](../../tests/integration/combat-fuzz-player-character.test.ts): +4 tests — verbatim A[0] (id/class/level/gear); opponent + map byte-identical to a normal battle at `opts.level`; A[0] never re-leveled while the opponent is built at `opts.level`; `playerCharacter` wins over `playerClass`.

## Verification

> **Toolchain note:** this slice was authored on a fresh Windows session where Node.js/npm were not yet installed (no `node_modules`), so the local `npx tsc --noEmit` + `npx vitest run` gate could not be run here. The change is additive and the default path (no `playerCharacter`) is byte-identical, so the golden/determinism/fuzz-matrix suites are unaffected; **run `npx tsc --noEmit` and `npx vitest run` once the toolchain is available before committing.**

## Handoff (dnd-web)

`BattleConfig.playerCharacter → runBattle({ playerCharacter: { character, itemInstances } })`. Pass the saved sheet's `Character` snapshot plus the `ItemInstance[]` for its inventory (at minimum the equipped main hand, so attacks resolve). Pass `level` = the character's total level so the seed-driven opponent matches. The drop-in is an independent axis: the opponent + arena are identical to a no-drop-in battle at the same `(seed, level)`.
