# Slice 800 — Exhaustion level 6 is fatal

**Type:** Engine reducer. **Closes** the [L7 audit](../l7-completion-audit.md) Area 4 divergence `exhaustion-6-not-fatal` (also relevant to Area 8).

## The gap

RAW `rules-glossary.md` "Exhaustion": *"You die if your Exhaustion level is 6."* The reducer clamped exhaustion at `EXHAUSTION_MAX` (6) — `Math.min(EXHAUSTION_MAX, …)` — but never killed. A character ground down to level 6 (e.g. by travel/forced-march or dehydration) sat there alive carrying a −12 to all D20 Tests and −30 ft Speed, immortal.

## The fix

`src/engine/reducers/combat.ts`: extracted a shared **`markCreatureDead`** helper — HP 0 + death-save failures at the kill threshold (every "is dead" derivation reads death saves) + Concentration dropped (RAW: dying ends Concentration) — and call it whenever exhaustion lands on `EXHAUSTION_MAX`. Both mutation channels are covered:

- the `ConditionApplied { conditionId: 'exhaustion' }` path (`applyConditionApplied`), and
- the `ExhaustionChanged` event path (`applyExhaustionChanged`).

`markCreatureDead` is exactly the death shape the slice-323 instant-death (`CreatureDestroyed`) reducer already used; that reducer now delegates to the helper too (DRY — one canonical "mark dead", two callers, no behavior change for instant-death).

## Tests

`tests/unit/reducers/slice-800-exhaustion-death.test.ts` (5): reaching Exhaustion 6 via `ConditionApplied` kills (HP 0, death-save failures at the threshold, not stable); Exhaustion 5 is non-fatal (alive, full HP, 0 failures); crossing into 6 incrementally (5 then +1) kills; the `ExhaustionChanged` path kills on landing at 6; and instant-death (`CreatureDestroyed`) still kills after the shared-helper refactor.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (582 files, 4502 passed) — no existing test expected a live character at Exhaustion 6.
