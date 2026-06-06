# Slice 695 — feat: tactical movement policy + opportunity-attack resolution

**Type:** Engine fuzz-harness primitive (third of three, completing the tactical mode). Combatants now move intelligently during a tactical battle — melee close, ranged kite, low-HP flee/break-LoS — and a move that provokes is fully resolved as an opportunity attack. `'none'` stays byte-identical.

## Why

Slices 693-694 added the `movement: 'none' | 'tactical'` option, the move-policy seam, and spread placement on a generated arena (combatants spawned positioned but stationary). This slice fills in the tactical arm of the seam: the decision logic that emits `CombatantMoved` events and resolves the `OpportunityAvailable` notifications a move produces. That is the full set of behavior dnd-web's `tactical-replay` viewer needs.

## What's wired

### `scripts/tactical/policy.ts` (new) — pure, RNG-free decision logic

- `planTacticalMove(input) -> { to: Position; disengage: boolean } | null`. Heuristic cascade, first match wins, over `reachableCells` / `hasLineOfSight` / `chebyshevDistanceFeet`:
  1. **Flee** (HP < `FLEE_HP_FRACTION`): maximize distance, strongly preferring to break line of sight; `disengage: true`.
  2. **Kite** (ranged + enemy within `MELEE_THREAT_DISTANCE_FEET`, *or* line of sight lost): reposition to a cell that keeps LoS and stays in range, maximizing distance, preferring cover.
  3. **Close** (melee + beyond reach): minimize distance to the enemy, tiebreaking toward cornering (fewer open neighbours).
  4. Else `null` (stay and act).
- **Determinism:** `reachableCells` returns cells in arbitrary order, so every choice runs through `pickByTotalOrder` — an argmax with an explicit `(score desc, x asc, y asc)` total order, independent of input order. No `Math.random`/`Date`/Map-Set iteration. Geometry runs in cell-coords (what the terrain helpers expect), converting to feet only at the boundary.
- `classifyTacticalRole(pack, weaponDefinitionId, cantripIds)`: ranged weapon or any cantrip ⇒ ranged, else melee; a `reach` weapon bumps reach to 10 ft. Binary by design (a documented harness simplification).

### `scripts/tactical/move-policy.ts` (new) — engine orchestration

- `makeTacticalMovePolicy({ content })` returns a `MovePolicy`. The factory captures `resolveContent([pack])` (resolved once, only in tactical mode — so `getEffectiveSpeed` gives the right movement budget and `'none'` does no extra work). Per turn: classify the active combatant, ask `planTacticalMove` for a destination, optionally Disengage, commit the move, then resolve provoked OAs. Legal-by-construction (destinations come from `reachableCells`); the surrounding try/catch is a stay-put backstop, not control flow.
- `resolveOpportunityAttacks(...)`: scans the move's emitted events for `OpportunityAvailable` **in array order** (so the multi-reactor 2v2 RNG stream is stable) and resolves each via `engine.plan.opportunityAttack` with a deterministic reactor policy (the reactor takes the OA when able). **Weapon selection:** a melee-capable weapon only; a purely ranged reactor has no melee OA and is skipped — the correct ruling, not a swallowed error.
- **Disengage vs accept-OA:** flee disengages first (it wasn't going to attack anyway, and survival is the point), so the retreat provokes nothing; **kiting accepts the OA** — which is exactly what exercises the OA-resolution path. So OAs fire from kiters leaving a melee enemy's reach.

### `runBattle` wiring

The move-policy selection becomes `movement === 'tactical' ? makeTacticalMovePolicy({ content: resolveContent([pack]) }) : NO_MOVE`. One line; the seam from slice 693 carries the rest. The local `Combatant` interface is now exported so the policy module can type the reactor lookup.

### Constants

`FLEE_HP_FRACTION`, `MELEE_THREAT_DISTANCE_FEET`, melee/reach feet, ranged/caster effective ranges, and the scoring weights (LoS-break + kite-in-range dominate; cover/corner bonuses are sub-one-cell tiebreaks) all join `scripts/tactical/constants.ts`.

## Files

- Added: [scripts/tactical/policy.ts](../../scripts/tactical/policy.ts), [scripts/tactical/move-policy.ts](../../scripts/tactical/move-policy.ts), [tests/unit/tactical-policy.test.ts](../../tests/unit/tactical-policy.test.ts), [tests/golden/s-tactical-movement.test.ts](../../tests/golden/s-tactical-movement.test.ts), [tests/audit/fuzz-tactical-matrix.test.ts](../../tests/audit/fuzz-tactical-matrix.test.ts), [docs/changelog/slice-695.md](slice-695.md).
- Edited: [scripts/tactical/constants.ts](../../scripts/tactical/constants.ts) (policy tunables), [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) (export `Combatant`, import + select the tactical policy).

## Tests

- `npx tsc --noEmit`: clean.
- `tactical-policy` unit (12): role classification; `pickByTotalOrder` order-independence + (x,y) tiebreak; flee/kite/close/stay behavior; flee breaks LoS behind cover; repeated-call determinism.
- `s-tactical-movement` golden (5): tactical log replays to the same state (8 seeds × 1v1/2v2); two same-seed runs are normalized-identical; presence of LocationCreated + CombatantMoved + positioned EncounterCreated; **OAs fire on deterministic anchors (seed 5 & 10, 2v2)**; `'none'` emits none of the tactical events.
- `fuzz-tactical-matrix` audit (2): 30 tactical battles (10 seeds × 1v1-pc / 2v2-pc / 2v2-monster) complete, advance rounds, and replay equivalently; **positive-presence** assertion that movement *and* a resolved OA actually occur across the matrix (not just "didn't crash").
- Byte-identity: fuzz-matrix + replay-equivalence + slice-693 guard + flags pass unchanged.
- Full `npx vitest run`: green.

Calibration (diagnostic, 80 battles): 680 `CombatantMoved`, every battle moved (the "ranged repositions when cover blocks LoS" rule guarantees it), opportunity attacks resolved in 25/80 battles, zero throws.

## RNG impact / Breaking change

**No RNG impact in `'none'` mode.** Movement + OA resolution are tactical-only; `resolveContent` runs only in tactical mode; the map RNG is an independent `fork`. The only new RNG consumer is opportunity-attack resolution, which never runs for `'none'`. No engine-API change. `Combatant` is now an exported type from the harness script (additive).

## Audit (Uncle Bob)

- **SRP**: decision (`policy.ts`, pure) vs orchestration (`move-policy.ts`, engine) vs wiring (`runBattle`, one line) are three separated jobs. `runBattle` did not grow an imperative movement block.
- **Determinism / no magic numbers**: every tunable is a named constant; the total order is explicit; scoring weights are chosen so bonuses are sub-one-cell tiebreaks. Documented why each weight dominates or ties.
- **Legal-by-construction**: destinations come from `reachableCells`; try/catch degrades to stay-put rather than steering flow.
- **Pattern-check (OA weapon selection)**: `OpportunityAvailable` only fires for melee-reach reactors, but a reactor's main hand may be a ranged weapon — selecting it blindly would build an illegal OA that the catch then hides. The melee-weapon check skips those (correct ruling), and the matrix's positive-presence assertion guards that genuine OAs still fire rather than all being silently skipped.
- **Pattern-check (determinism traps)**: arbitrary-order `reachableCells` is always run through the explicit total order; multi-reactor OA resolution iterates emitted-array order, never Set/object iteration.

## Open follow-ups

- Tactical mode is complete on the engine side. Part B (dnd-web's `tactical-replay` viewer: `formationFromEngine`, `TokenView.moveTo`, follow-cam, the `CombatantMoved` narrator line) is a separate consumer session — not engine work.
- Possible future polish (deferred, not needed by dnd-web): split move-attack-move instead of move-then-act; smarter cornering off the enemy's escape cells rather than the mover's open-neighbour proxy; range-aware kiting that sits exactly at weapon long-range.
