# Slice 893 — Confusion's behavior table + no Bonus Actions/Reactions (`confusion-table-not-rolled`)

**Type:** Engine (action-economy reducer gate + a behavior-roll planner/event) + content (condition description). Closes the L7 audit Area-2 DIVERGENCE `confusion-table-not-rolled`.

## RAW

Confusion: a creature that fails the WIS save *"can't take Bonus Actions or Reactions and must roll 1d10 at the start of each of its turns to determine its behavior for that turn"* — 1: no action, all movement in a random direction (1d4); 2-6: no move or action; 7-8: no move, one melee attack on a random creature in reach (or nothing); 9-10: acts normally. End of each turn it repeats the save.

## What was already wired vs. what was missing

`confused-active` already carried the WIS save-on-cast (concentration) and the end-of-turn WIS `recurringSave`-ends. Missing: the **no Bonus Actions or Reactions** arm and the **1d10 behavior table** (the condition's description literally said "the behavior table itself is not modeled").

## The fix

- **No Bonus Actions or Reactions** — enforced engine-side in `applyActionEconomyConsumed` via an `isConfused` check that mirrors the existing Slow-spell (`slowed-by-spell-active`) gate: a confused combatant's `bonusAction` / `reaction` consumes throw. The `action` kind is **not** blocked here — whether/which action it can take is the behavior table's job, not a flat block.
- **The 1d10 behavior table** — `engine.plan.rollConfusionBehavior(characterId)` rolls the d10 (plus a 1d4 direction on a 1) through the plan/commit RNG (deterministic / replayable) and emits a notification-only **`ConfusionBehaviorRolled`** event with the bucket: `random-move` (+ `direction`) / `do-nothing` / `melee-random` / `normal`. The engine owns the dice; the consumer executes the **positional** outcome — a forced move in the rolled direction, or a melee attack on a random creature in reach — and respects the action-gate the bucket implies. (Positional execution is consumer-owned for every spell, per engine-scope.) Consumer-driven, called at the confused creature's turn-start; allowlisted in the planner-wiring audit.

`confused-active` stays `effects: []` (its behavior is engine-coded + consumer-executed, not effect-stack contributions); its description / engineNotes were updated to reflect the now-modeled arms.

## Tests

New `tests/unit/engine/slice-893-confusion.test.ts` (6 tests): a confused combatant's Bonus Action and Reaction consumes throw (`/Confused.*Bonus Action/`, `/Confused.*Reaction/`) while an Action does not; every rolled d10 maps to its RAW behavior bucket across 40 seeds (with a 1d4 direction present iff `random-move`); the roll is deterministic under a fixed seed; rolling for a non-Confused creature throws.

## Counts

No count change — `confused-active` already existed (description/engineNotes only); the new event isn't a doc-counted surface (`ConfusionBehaviorRolled` is in the `EVENT_TYPES` list + apply dispatch as a notification-only no-op + transcript).

## Audit

- Struck `confusion-table-not-rolled`; Rollup: **Area 2** `3 → 2` open / `21 → 22` closed / `0/2/1 → 0/1/1`; **Total** `25 → 24` open / `92 → 93` closed / `0/9/16 → 0/8/16`. The Area-2 frontier is now just `l4-giant-insect` (transformation) and `chromatic-orb-no-leap`.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (665 files, 4937 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` + planner-wiring audits green.
