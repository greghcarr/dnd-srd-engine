# Slice 673 — tests: L3 triple-class multiclass build audit (L1+L1+L1)

**Type:** Audit-only. **Thirteenth slice of the post-L3-RAW completeness push. First of the 4 audit/polish slices (673-676).**

Sibling of slice 642 (L1+L1 pairs, 66 combos) and slice 656 (L1+L2 ordered pairs, 132 combos). Covers the third combinatoric shape of total-character-level-3 multiclass: three distinct classes each at L1. **220 unordered C(12,3) triples.**

## What's pinned

- All 220 distinct triples (e.g., barbarian+bard+cleric, fighter+wizard+rogue, etc.) build via `CharacterSchema.parse`, commit `CharacterCreated`, and derive via `engine.derive.character` without throwing.
- 1 enumeration sanity test confirms C(12,3) = 220.

## Scope decisions

- **Unordered triples (C(12,3)), not ordered**: distinct-class assignments at the same level don't have hit-die-distribution differences (all L1, all max HP from class), so ordering doesn't matter for the build path. ~3.6× fewer tests than ordered (P(12,3) = 1320).
- **All-14 ability scores**: clears every RAW multiclass prerequisite (13+ for most classes; STR 13 + CHA 13 for Paladin; etc.).
- **Build + derive smoke-test only**: no per-class feature-presence assertions. The L1 floor (slice 619) already pins per-class features; this audit just confirms the combined build path doesn't choke on triple-class composition.

## Files

- **[../../tests/audit/multiclass-l1l1l1-triples.test.ts](../../tests/audit/multiclass-l1l1l1-triples.test.ts)** (new): 221 tests (220 triples + 1 enumeration).

## Tests

- `npx vitest run tests/audit/multiclass-l1l1l1-triples.test.ts`: 221/221 pass in ~3s.

## Verification

- `npx tsc --noEmit`: clean.

## Open follow-ups

- ~~660-672~~: L3 RAW behavior + 8 spell-wiring primitives + L2/L3 fully wired. Landed.
- ~~673 (this slice)~~: L3 triple-class multiclass audit. Landed.
- **674**: L3 fuzz floor.
- **675**: Auto-populate `recharge` on `ResourceState` from grants.
- **676**: Multiclass fuzz support.

**Deferred**:
- Mixed-level triple combos (L1+L1+L2 etc.) not covered — total level 4 is outside the L3 audit scope.
- Per-triple feature presence assertions (covered implicitly by the L1 floor's per-class feature pins).
