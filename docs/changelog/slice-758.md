# Slice 758 — attack affordance fidelity (ranged long-range + Extra Attack)

**Type:** Bug fix (query affordance). Part of the affordance-layer correctness sweep. Two places where `availableActions` / `legalTargets` disagreed with what the attack planner actually accepts.

## Why

A consumer that drives attacks from `engine.query.*` got wrong answers in two cases:

1. **Ranged long range.** `weaponRangeFeet` (used by `legalTargets`) capped a ranged weapon's reach at `rangeNormal`, but the attack planner's range gate (`assertWeaponInRange`) caps at `rangeLong ?? rangeNormal`. RAW: an attack beyond normal range is legal with Disadvantage out to long range. So `legalTargets` omitted legal long-range targets and `availableActions` reported `attack` disabled with `no-target-in-range` when a long-range shot was available.
2. **Extra Attack.** `availableActions` disabled every action-cost intent (including `attack`) the moment `actionUsed` was true. But the attack planner (`planActionEconomyForAttack`) only rejects when the action was spent on a *non-attack* (`actionUsed && attacksMadeThisTurn === 0`) or the per-action budget is exhausted (`attacksMadeThisTurn >= maxAttacksPerAction`). A Fighter with Extra Attack who made attack 1 of 2 was shown `attack` disabled, even though the planner would accept the second swing.

## How

[src/query/affordances.ts](../../src/query/affordances.ts):
- `weaponRangeFeet`: ranged branch returns `rangeLong ?? rangeNormal ?? RANGED_FALLBACK_RANGE_FEET`, mirroring the planner's cap.
- `availableActions`: the `attack` intent now mirrors `planActionEconomyForAttack` — disabled only when `(actionUsed && attacksMadeThisTurn === 0)` or `attacksMadeThisTurn >= maxAttacksPerAction` (the budget comes from `computeActionEconomyBudget`, already used by `actionEconomy`). Dash / Disengage / Dodge keep the plain `actionUsed` gate (Action Surge resets `actionUsed`, so a surged second action re-enables them naturally).

Both are query-side only; no event shapes or planner logic change. The planner stays authoritative.

## Tests

[tests/unit/query/affordances.test.ts](../../tests/unit/query/affordances.test.ts) — new "slice 758" block:
- `legalTargets` includes a foe at 35 ft for a sling (normal 30 / long 120), and `availableActions` reports `attack` enabled.
- `attack` stays enabled mid-Extra-Attack (L5 Fighter, one of two attacks made; `actionEconomy` shows `perAction:2, madeThisTurn:1`), while Dash is now `action-used`.
- `attack` becomes `action-used` once the full budget is spent (L1 Fighter, one attack made).

Full `npx vitest run` green.

## Status

First of the affordance-layer correctness-sweep fixes. The sweep also found the same-class bugs covered by slices 759-761.
