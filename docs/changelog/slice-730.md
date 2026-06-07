# Slice 730 — engine: Warlock Dark One's Own Luck (Fiend Patron L6)

**Type:** Engine feature (new outcome-returning planner). Additive; no new event/condition. L6 SRD-complete cycle.

SRD 5.2.1 Fiend Patron L6 Dark One's Own Luck: "When you make an ability check or a saving throw, you can use this feature to add 1d10 to your roll. You can do so after seeing the roll but before any of the roll's effects occur. ... uses equal to your Charisma modifier (minimum of once) ... regain all expended uses when you finish a Long Rest."

## What changed

New `engine.plan.darkOnesOwnLuck(state, { warlockId })` → `{ events, d10 }` (an **outcome**, not a PlanResult — the Hero Points / Deflect Attacks shape): it validates the `dark-ones-own-luck` resource (max `max(1, CHA mod)`, recharge longRest, granted by the subclass — its presence IS the feature), spends one use (`ResourceSpent`), rolls a d10, and returns it for the consumer to add to whichever check/save it augments. The "after seeing the roll" timing is naturally consumer-managed: read the d20 result, then call this for the d10.

Like Hero Points, the engine doesn't mutate the linked roll — the consumer folds the returned `d10` into its recorded check/save event. No new event or condition (the resource spend is the only state change).

## Files

- [src/engine/plan/dark-ones-own-luck.ts](../../src/engine/plan/dark-ones-own-luck.ts) (new): `planDarkOnesOwnLuck`.
- [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts): `engine.plan.darkOnesOwnLuck` (returns the outcome).
- [tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts): allowlisted (outcome-returning reaction, not a `planIntent` dispatch target — like `deflectAttacks` / `stonesEndurance`).
- [tests/unit/engine/slice-730-dark-ones-own-luck.test.ts](../../tests/unit/engine/slice-730-dark-ones-own-luck.test.ts) (new): rolls a 1d10 + spends a use; runs out after CHA-mod uses; a non-Fiend warlock has no such feature.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No new event/condition; planner-wiring audit allowlists `darkOnesOwnLuck`.

## Audit (Uncle Bob)

- **Reuse**: the Hero Points / Deflect Attacks outcome shape (engine rolls the augment die, returns it; consumer folds it into the roll); the once-per-feature gate is the existing `dark-ones-own-luck` resource.
- **SRD-faithful**: 1d10, CHA-mod uses (min 1), long-rest recharge; "after seeing the roll" is consumer-timed.
- **Minimal surface**: no new event or condition — the resource decrement is the only committed state.
