# Slice 781 — edition drift: Long Rest restores ALL spent Hit Dice (not the 2014 half)

**Type:** Engine edition-drift fix (`src/engine/reducers/rest.ts`). First of the Area 1 sweep in the [L7 SRD-completion audit](../l7-completion-audit.md) (`long-rest-half-hd`). No API or content change; one reducer behavior corrected.

## The bug

`applyLongRestEnded` restored only `max(1, floor(totalHitDice / 2))` Hit Dice, distributed across the character's classes — the **2014** Long Rest rule. SRD 5.2.1 ([`references/srd-markdown/rules-glossary.md`](../../references/srd-markdown/rules-glossary.md) "Long Rest"): *"**Regain All HP.** You regain all lost Hit Points and all spent Hit Point Dice."* A level-7 character who spent 5 HD in a delve woke with 3, not all 7 — a flatly wrong-edition outcome an expert notices immediately.

## The fix

Each class enrollment's `hitDiceRemaining` is reset to its `level` (all spent HD regained). The 2014 half-budget loop and its now-unused `halfRoundedDown` / `oneMin` helpers were removed. Short Rest is unaffected (it spends HD, never restores them).

## Tests

- `tests/unit/reducers/rest.test.ts`: the "restores half hit dice" test became "restores ALL spent hit dice (SRD 5.2.1, not the 2014 half)" — a level-4 fighter at 0 HD now wakes with 4 (was 2).
- `tests/golden/s1-long-rest.test.ts`: a level-3 fighter with 1 HD remaining now wakes with 3 (was 2). The rendered transcript snapshot is unchanged (it's formatted from the event stream, and `LongRestEnded` carries no HD payload — the reducer computes it).

## Verification

`npx tsc --noEmit` clean; `npx vitest run` green. Long-rest HD recovery is the only behavior changed.
