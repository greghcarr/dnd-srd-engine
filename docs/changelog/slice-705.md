# Slice 705 — engine: intent-shaped affordance query API (interactive-play A1)

**Type:** Engine read-layer (new `engine.query.*` namespace) + tests. Additive, pure, read-only; no event schema change.

Part A1 of interactive-play support: answer "what can this combatant legally do right now?" in INTENT-shaped terms, so a UI (the dnd-web interactive viewer) renders the answers and never reconstructs rules from primitives. Every function wraps the existing derive helpers (it does not duplicate their logic) and the planner precondition guard.

## The namespace

New `engine.query.*` (mirrors `engine.derive.*`; content closed over). Standalone implementations in [src/query/affordances.ts](../../src/query/affordances.ts), also exported from the barrel:

- `legalMoveDestinations(state, encounterId, combatantId): MoveDestination[]` — reachable cells within remaining movement (wraps `reachableCells` + `findPath`), honoring terrain, occupancy, Dash, Steady-Aim speed-0, and the Frightened "no closer to the source" rule. Each `{ position (feet), costFeet, path (feet) }`.
- `actionEconomy(state, encounterId, combatantId): ActionEconomyView | undefined` — action / bonus / reaction availability, movement (total / used / remaining feet), and attacks (per-action / made / remaining), from `computeActionEconomyBudget` + `combatant.turnUsage`. Exposes `extraActionsPerTurn` (Action Surge) since the single `actionAvailable` boolean can't encode it.
- `availableActions(state, encounterId, combatantId): AvailableAction[]` — `move | attack | dash | disengage | dodge`, each with `enabled` and, when disabled, a machine-readable `reason` (a blocking-condition id like `'stunned'`, or `'action-used'` / `'no-target-in-range'` / `'no-movement'` / `'speed-zero'`). Reuses `findActorBlockingCondition` (the check `assertActorCanAct` throws on) but returns the reason instead of throwing.
- `legalTargets(state, encounterId, combatantId, action): TargetCandidate[]` — for `'attack'`, the foes in weapon reach/range with line of sight (wraps `isInRangeFeet` + `hasLineOfSight`), nearest-first; positionless mode returns all living others. Self-scoped intents return `[]`.
- `castableSpells(state, characterId): CastableSpell[]` — prepared/known spells with at least one usable slot (wraps `computeAvailableSpellSlots`), each with its `levelOptions` (cantrips → `[0]`). Scaffold, per the milestone (Move + Attack first).

## Determinism + correctness notes

- All list outputs use an explicit total order (move destinations by x then y; targets by distance then id; spells by id; actions a fixed sequence) — never Map/Set iteration order. Named constants for reach/range thresholds.
- Coordinate convention (verified against source): `combatant.position` is **feet**; `reachableCells`/`findPath` take feet (convert internally), while `chebyshevDistanceFeet`/`isInRangeFeet`/`hasLineOfSight` take **cell** coords. The module converts at the boundary with `feetToCell`/`cellToFeet`.
- `combatant.combatantId === character.id`; map via `state.characterLocations[id] → state.locations[locId].map`; doors via `location.doorIds → state.doors[id]` — matching `planMove` exactly.

## Files

- **[src/query/affordances.ts](../../src/query/affordances.ts)** (new): the five queries + their result types.
- **[src/query/index.ts](../../src/query/index.ts)**, **[src/index.ts](../../src/index.ts)**: barrel re-exports.
- **[src/engine/index.ts](../../src/engine/index.ts)**: `engine.query` namespace (interface + impl + return).
- **[tests/unit/query/affordances.test.ts](../../tests/unit/query/affordances.test.ts)** (new): 11 tests over a positioned encounter (move budget/occupancy/Frightened/determinism, fresh-turn economy, action enable/disable reasons, attack range + LoS targeting, castable-spell level options).
- **[docs/api-overview.md](../../docs/api-overview.md)**: `engine.query.*` documented.
- **[tests/contract/__snapshots__/exports.test.ts.snap](../../tests/contract/__snapshots__/exports.test.ts.snap)**: new public names (`-u`, intended additions only).

## Public API (handoff)

```ts
engine.query.legalMoveDestinations(state, encounterId, combatantId): ReadonlyArray<MoveDestination>
engine.query.actionEconomy(state, encounterId, combatantId): ActionEconomyView | undefined
engine.query.availableActions(state, encounterId, combatantId): ReadonlyArray<AvailableAction>
engine.query.legalTargets(state, encounterId, combatantId, action: AffordanceActionId): ReadonlyArray<TargetCandidate>
engine.query.castableSpells(state, characterId): ReadonlyArray<CastableSpell>

interface MoveDestination { position: Position; costFeet: number; path: ReadonlyArray<Position> }  // feet
interface ActionEconomyView { actionAvailable; bonusActionAvailable; reactionAvailable: boolean;
  movement: { totalFeet; usedFeet; remainingFeet: number };
  attacks: { perAction; madeThisTurn; remaining: number };
  extraActionsPerTurn; extraBonusActionsPerTurn: number }
type AffordanceActionId = 'move' | 'attack' | 'dash' | 'disengage' | 'dodge'
interface AvailableAction { action: AffordanceActionId; enabled: boolean; reason?: string }
interface TargetCandidate { combatantId: string; position: Position | undefined; distanceFeet: number }
interface CastableSpell { spellId: string; minLevel: number; levelOptions: ReadonlyArray<number> }
```

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green (additive; existing suites unaffected).
- No existing event schema changed.

## Audit (Uncle Bob)

- **Wraps, doesn't duplicate**: each query delegates to the canonical derive helper; the only new logic is the intent-shaping + deterministic sort.
- **Names**: function + field names are intent-shaped (`legalMoveDestinations`, `availableActions`, `reason: 'no-target-in-range'`).
- **SRP**: one module, one job (affordances); geometry/economy/slots stay in their derive homes.
- **No magic values**: reach/range fallbacks are named constants; sort keys are explicit.
- **Pattern-check**: the feet-vs-cell coordinate convention is inconsistent across the spatial helpers by design (some take feet, some cells); verified each helper's convention against source and converted at the boundary (a unit-mismatch first showed as an excluded in-reach target, then fixed — the lesson is recorded here so the next query author converts up front).

## Open follow-ups

- `castableSpells` is a scaffold (no per-spell range/target validation yet); the Move+Attack milestone doesn't need it. Targeting rules for spell actions in `legalTargets` are likewise future work.
- `availableActions` move-gating approximates condition-driven immobility (it gates on remaining movement + Steady-Aim); the planner remains the source of truth on commit.
