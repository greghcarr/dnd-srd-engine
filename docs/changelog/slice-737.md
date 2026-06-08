# Slice 737 — fuzz harness: build every class to any level 1-20

**Type:** Fuzz-harness / tooling (scripts/combat-fuzz-core.ts). No rules-engine change. Enables the sibling dnd-web viewer to offer a 1-20 level picker.

## Goal

`runBattle({ level })` (the seam dnd-web's `EngineBridge.startBattle` forwards into) must reliably build every `CLASS_POOLS` class — and its auto-leveled opponent — to any level 1-20. Previously the documented cap was 6, and a level-up that hit an unresolvable choice was swallowed, silently leaving the character at L1 while the caller believed it was leveled.

## Root cause (and what was actually true)

The engine's level-up planner already supports L1-20 (hard stop at 20). The gap was the fuzz auto-resolver. Auditing it empirically (level every class 1→20 through the real `runBattle`) showed the **blind first-N picker already reaches L20 for all 12 classes** with zero unresolved choices and valid HP / proficiency / spell slots — because the pack's class levelTables above ~L6 are still being built out, so there are few new *choices* to resolve above L6. The real defects were robustness, not a hard failure:

1. The cap (`FUZZ_MAX_LEVEL = 6`) understated the real reach.
2. Failures were **silent**: `drainPendingChoices` did `catch { break }` on a resolution error, leaving a dangling choice; the next `levelUp` then threw, and `runBattle`'s `try/catch` swallowed it — the character stayed at L1 undetected.

## What changed (all in [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts))

- `FUZZ_MAX_LEVEL` 6 → 20 (+ rewritten comment describing the real behavior + the sparse-high-level-content caveat).
- **Deterministic legal-option-set resolver** (`choiceSelectionCandidates`): yields candidate selections in lexicographic k-combination order. The **first candidate is always the historical first-N pick**, so every choice that already resolved at the shipped levels (≤ L6) resolves with byte-identical events. Later candidates are a bounded (256-cap) fallback for any future choice where first-N isn't a legal/complete pick (e.g. "two distinct abilities", "a spell you don't already know"). RNG-free.
- `drainPendingChoices` tries each candidate in turn and **throws loud** if none resolves (instead of silently breaking).
- `levelUpTo` adds loud post-conditions: throws if the character didn't reach the target level or has any unresolved choice.
- `runBattle`'s leveling loop no longer swallows failures, and **skips statblock-based monsters** (vs=monster team B) so removing the swallow doesn't try to class-level a monster.
- Exported `FUZZ_CLASS_IDS` so the audit sweeps "every `CLASS_POOLS` class" without re-listing.
- CLI docstring + README: `--level 1..20`.

## Byte-identity

L1-6 builds are unchanged: the resolver tries first-N first (identical events on success), and the loud throws only fire on failures that don't occur at ≤ L6. Verified: fuzz matrix (73/73), `s-tactical-movement` golden, combat-fuzz flags, multiclass fuzz, pool loadouts — all green; full suite green.

## Tests

[tests/integration/combat-fuzz-level-range.test.ts](../../tests/integration/combat-fuzz-level-range.test.ts): for every `CLASS_POOLS` class, a 1v1 PC-vs-PC `runBattle` at every level 2..20 asserts the player AND opponent reach the requested level with zero unresolved choices (and `runBattle` throws loud if not); an L20 spot-check asserts level 20, proficiency bonus 6, HP well past L1, full-caster 9th-level slots / half-caster 5th-level slots / warlock pact L5; a vs=monster case confirms the player levels while the monster keeps its statblock.

## Known limitation (content, not harness)

The pack's class levelTables above ~L6 are sparse (slots + proficiency progress, but many higher feature rows — ASIs at 8/12/16/19, Metamagic, invocations, Magical Secrets, Mystic Arcanum, etc. — aren't modeled yet; subclass onAcquire choices also aren't surfaced by the fuzz, to keep ≤L6 byte-identical). So a high-level fuzz character is correctly-leveled (level / HP / proficiency / spell slots) but under-featured until that level-by-level content lands. The loud guard ensures that when those choices do land, any the picker can't handle surfaces immediately rather than silently under-leveling.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green (571 files, 4432 passed). Byte-identity confirmed via the fuzz + tactical + golden suite.
