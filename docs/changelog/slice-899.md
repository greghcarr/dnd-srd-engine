# Slice 899 — `legalTargets` honors consumer Total Cover (`legaltargets-surfaces-total-cover`)

**Type:** Engine (affordance-query parameter + filter). Closes the L7 audit Area-3 (Seam) quirk `legaltargets-surfaces-total-cover`.

## The gap

RAW (rules-glossary "Cover"): *"A target with Total Cover can't be targeted directly by an attack or a spell."* The attack planner enforces it — `planAttack` throws `"<name> has total cover and cannot be targeted"` when the consumer passes `cover: 'total'` (`src/engine/plan/attack.ts:781`). But the affordance query `legalTargets` ("what can I attack right now?") didn't mirror that, so a UI built on it surfaced a target the planner would immediately reject — a dead-end "valid" target.

The engine doesn't *derive* cover (it has no geometry model for it — the `cover-not-derived` row; cover is a consumer judgment passed on the intent), so the fix is to let the query receive the same judgment the consumer already supplies to the planner.

## The fix

`legalTargets` (and the wired `engine.query.legalTargets`) gained an **optional** trailing `coverByTargetId?: Readonly<Record<string, CoverKind>>` parameter — the same per-target cover map the consumer passes on the `AttackIntent` (and the shape slice 885 added to `CastSpellIntent`). A candidate the consumer marks `'total'` is dropped from `others` at the source, so the filter applies in **both** positionless and positioned modes (cover is map-independent — it's the consumer's call). Partial cover (`'half'` / `'three-quarters'`) does **not** filter — only Total Cover blocks targeting. Omit the map and the result is byte-for-byte unchanged.

## Pattern-check

- The spell affordance `legalSpellTargets` / `creatureCandidatesInRange` is **deliberately left as-is**: the cast-spell planner has no total-cover rejection gate (it uses `coverByTargetId` only for the Dex-save bonus, slice 885), so adding a total-cover filter to the spell query would make it *stricter* than its planner — the opposite dead-end. The affordance should mirror its planner, and only the weapon-attack planner gates on total cover.
- `legalTargets` filters `others` once, before both the positionless early-return and the positioned in-range loop, so there's no second code path that could miss the gate.

## Tests

Three new tests in the `slice 899` block of `tests/unit/query/affordances.test.ts` (reusing the positioned-encounter harness): a Total-Cover target is dropped (positioned) while an omitted map keeps it, cross-checked against the planner actually throwing on that attack; partial (half / three-quarters) cover keeps the target; a Total-Cover target is dropped in positionless mode too.

## Counts

No count change — no new condition / effect / spell / feat / event type / mechanic kind. `CoverKind` is the existing attack-planner type; the new parameter is optional.

## Audit

- Struck `legaltargets-surfaces-total-cover`; Rollup: **Area 3** `11 → 10` open / `3 → 4` closed (`0/4/7 → 0/4/6`); **Total** `20 → 19` open / `97 → 98` closed / `0/7/13 → 0/7/12`. [api-overview.md](../api-overview.md) `legalTargets` signature updated.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (669 files, 4957 passed / 165 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
