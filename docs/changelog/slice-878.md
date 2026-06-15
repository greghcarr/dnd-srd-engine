# Slice 878 — Frightened by multiple sources (multi-source movement gate)

**Type:** Engine (condition reducer + move planner). Closes the L7 audit Area-4 quirk `frightened-single-source-positional` — the **multi-source arm**. Positionless / sourceless fear stays a deferred consumer/positional concern.

## RAW

Appendix / rules-glossary **Frightened**: *"while frightened by a source, you can't willingly move closer to the source of your fear."* A creature can be Frightened by more than one source at once (two dragons' Frightful Presence, a Fear spell plus a monster aura), and the restriction applies to **each** source independently — you can't move closer to *any* of them.

## What was wrong

Two pre-878 defects compounded so that a second fear source was effectively invisible to the movement gate:

1. **The condition reducer deduped Frightened by `conditionId`.** `applyConditionApplied` (in `src/engine/reducers/combat.ts`) skipped a `ConditionApplied` whose `conditionId` already sat on the character. So a *second* source's Frightened could never even be **stored** — the creature held exactly one Frightened condition regardless of how many things had frightened it.

2. **The move planner read a single `.find()`.** `planMove` (in `src/engine/plan/movement.ts`) located *the first* Frightened condition and checked Chebyshev distance to that one source. Even if two Frightened conditions had somehow been stored, a move toward the *second* source slipped straight through.

## The fix

- **Reducer — stack per source.** The Frightened dedup is now keyed by `(conditionId, sourceCharacterId)` rather than `conditionId` alone: a re-application from the *same* source still dedupes to one, but a *distinct* source adds a second Frightened condition. Other conditions are unchanged (still id-keyed). This is safe because Frightened's effects (the slice-276 LoS-gated disadvantage on attack + ability check) are gated per-bearer on `canSeeFearSource` and are idempotent — stacking two identical disadvantage entries grants disadvantage once, not twice.

  ```ts
  const existing = character.appliedConditions.find(
    (c) =>
      c.conditionId === event.conditionId &&
      (c.conditionId !== 'frightened' || c.sourceCharacterId === event.sourceCharacterId),
  );
  if (existing) return;
  ```

- **Planner — check every source.** The Frightened block in `planMove` is now a loop over **all** of the mover's Frightened conditions that name a positioned source; the move is rejected if the destination is closer (Chebyshev) to *any* of them. The error names the specific source (`is Frightened by <source> and cannot move closer to them`).

A Frightened condition with no `sourceCharacterId` (a sourceless gaze) or whose source has no encounter position (off the map) imposes **no** movement constraint — RAW's "the source" needs a known location, which is a consumer/positional fact the engine doesn't own. That arm stays deferred (it's the residual of this row, now narrowed to positionless/sourceless only).

## Tests

- New `tests/unit/engine/slice-878-frightened-multi-source.test.ts` (5 tests): the reducer stacks Frightened per distinct source (2 conditions); a same-source re-apply still dedupes to 1; frightened by two sources → can move closer to neither (asserts each source's name in the rejection); moving away from both is allowed; the single-source regression (constrains that source, but moving toward a *non*-fear creature is fine).
- Updated `tests/unit/engine/slice-581-frightened-movement-gate.test.ts`: its load-bearing **source smoke check** pins literal substrings of the Frightened block. Slice 878's refactor flipped the find predicate (`=== 'frightened'`) into a loop continue-guard (`!== 'frightened'`), so the assertion now accepts either form — it still asserts the block (RAW comment + the `chebyshevDistance(combatant.position, sourceCb.position)` comparison) is present, surviving the intentional refactor.

## Counts

No count change. Frightened was already a wired condition (no new condition), and the fix reuses the existing condition machinery + a `.find()` → loop rewrite (no new EFFECT_KIND). The `doc-counts` surfaces (condition count, EFFECT_KINDS, spell-wired) are untouched.

## Audit

- Struck `frightened-single-source-positional` (Area 4 QUIRK), pointing at slice 878 for the multi-source arm; the row text retains the positionless/sourceless deferral.
- Rollup: **Area 4** `3 → 2` open / `9 → 10` closed / `0/0/3 → 0/0/2`; **Total** `39 → 38` open / `78 → 79` closed / `0/13/26 → 0/13/25` (117 rows unchanged — the row moved open → closed). Area 4 stays divergence-free (quirks only), now 2 open: `reaction-reset-timing`, `no-hostility-model`. "Updated through slice 878."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (654 files, 4886 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green (no count surface moved).
