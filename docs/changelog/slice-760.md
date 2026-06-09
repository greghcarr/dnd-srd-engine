# Slice 760 — legalMoveDestinations honors the prone stand-up surcharge

**Type:** Bug fix (query affordance). Affordance-correctness sweep.

## Why

The move planner (`planMove`) treats a move while Prone as an implicit stand-up-then-walk: it adds a stand-up surcharge of `floor(speed / 2)` to the move's cost and rejects when `distance + standUpCost > remaining`. But `remainingMovementFeet` (which feeds both `legalMoveDestinations` and the `availableActions` move gate) ignored Prone entirely and returned the full speed budget. So the query offered destinations a prone combatant can't actually reach (and could report `move` enabled when no legal move exists).

## How

[src/query/affordances.ts](../../src/query/affordances.ts) — `remainingMovementFeet` now subtracts the prone stand-up surcharge: `max(0, maxThisTurn - feetMovedThisTurn - standUpCost)` where `standUpCost = isProne ? floor(speed/2) : 0`. This matches `planMove`'s `distance + standUpCost <= remaining` gate exactly, so the reachable set and the planner agree. (The surcharge is read from the current `prone` condition, mirroring the planner's per-move check — once the combatant stands by moving, `prone` is removed and later moves carry no surcharge.)

Query-side only; planner unchanged. `actionEconomy.movement` still reports the raw speed budget (the pool the stand-up spends from), which is the correct meaning for that field.

## Tests

[tests/unit/query/affordances.test.ts](../../tests/unit/query/affordances.test.ts) — a prone Fighter (speed 30 → effective travel 15 ft): the reachable set caps at 15 ft (offers 15 ft, not 20 ft), and a planner cross-check confirms `move` to 15 ft is accepted while 20 ft is rejected.

Full `npx vitest run` green.

## Status

Affordance-correctness sweep (siblings: 758, 759, 761).
