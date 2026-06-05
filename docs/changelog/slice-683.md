# Slice 683 — engine: combatant placement (Work item 1 of the spatial combat plan)

**Type:** Schema + reducer + planner. **First slice of the spatial combat support cycle (683-685).** Closes the BLOCKER for the dnd-web viewer: combatants can now start an encounter at real positions and be placed mid-encounter (summons, teleports).

Pre-683 the only path to set `combatant.position` was for the consumer to mutate state directly — and `plan.move` always threw `"Combatant has no position set"` because the encounter reducer never set it. Slice 683 makes positioned combat event-sourceable.

## What's wired

### Schema additions (encounter events)

- New `EncounterCombatantPlacementSchema` (per-combatant entry: `{ characterId, position? }`).
- `EncounterCreatedEventSchema` gains an optional `combatants: ReadonlyArray<EncounterCombatantPlacement>` field. The legacy `combatantIds: ReadonlyArray<ULID>` is retained for back-compat. Exactly one MUST be set (enforced in planner + reducer; not via `.refine()` to keep the discriminated-union narrowing clean).
- New `CombatantPlacedEventSchema { encounterId, combatantId, position }` for mid-encounter placement.

### Reducer changes

- `applyEncounterCreated` prefers `event.combatants` when set, falling back to `combatantIds`. Sets `combatant.position` when the placement entry includes one.
- New `applyCombatantPlaced` sets the named combatant's position; invariants assert the encounter + combatant exist.
- Apply dispatch wired for the new event.

### Planner additions

- New `CreateEncounterCombatant` type (`{ characterId, position? }`).
- `CreateEncounterIntent` accepts `combatants` OR `combatantIds` (mutually exclusive; throws on both-set).
- `planCreateEncounter` validates every placement that ships a `position` against the location map (when present): in-bounds, not impassable, no same-cell collision within the placement batch.
- New `planPlaceCombatant({ encounterId, combatantId, position })` for mid-encounter placement. Validates the same way, plus cross-combatant collision against existing positions in the encounter.
- Exposed as `engine.plan.placeCombatant`; performIntent dispatch + planner-wiring audit allowlist (`'placeCombatant'`) updated.

### Map context resolution

- A "battle map" is a `Location` with a `map` field. Combatants associate via the existing `state.characterLocations[combatantId]` mapping (set by `CharacterLocationChanged` events). `plan.move` already reads the map this way (slice ≤500-era wiring); slice 683 reuses it for placement validation — no new `encounter.locationId` field needed.
- Map is optional: positioned combat without a map just gets the positions (validation skipped; `plan.move` falls back to flat Chebyshev cost as before).

## Scope decisions

- **`combatants` AND `combatantIds` both kept**: legacy consumers shouldn't need to update. New consumers prefer `combatants`. The discriminated-union narrowing constraint (avoiding `.refine()`) means the either-or invariant lives in code paths, not the type system — documented inline.
- **Validation in planner, not reducer**: matches the existing convention (reducer invariants are structural-only; semantic validation is planner work).
- **Cross-batch collision split between paths**: `planCreateEncounter` validates within the placement batch only (no existing combatants to compare against — the encounter doesn't exist yet). `planPlaceCombatant` validates against existing in-encounter combatants.
- **Re-placing the same combatant to the same cell is OK**: planPlaceCombatant excludes the moving combatant from the collision check (matches the standard "moving to your own square" allowance).
- **No `encounter.locationId` field**: per-combatant `characterLocations` mapping already exists and `plan.move` uses it. Adding a redundant encounter-level pointer would invite drift.

## Files

- **[../../src/schemas/events/encounter.ts](../../src/schemas/events/encounter.ts)**: new placement schema; `EncounterCreatedEventSchema` extended; new `CombatantPlacedEventSchema`.
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: imports, discriminated-union entry, EVENT_TYPES entry, re-exports.
- **[../../src/engine/reducers/encounter.ts](../../src/engine/reducers/encounter.ts)**: updated `applyEncounterCreated`; new `applyCombatantPlaced`.
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: imports `applyCombatantPlaced`; dispatch case added.
- **[../../src/engine/plan/encounter.ts](../../src/engine/plan/encounter.ts)**: extended `CreateEncounterIntent`, new helpers + types, new `planPlaceCombatant`.
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-exports.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: import + type + `engine.plan.placeCombatant` method.
- **[../../tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts)**: `'placeCombatant'` in EXCLUDED_FROM_DISPATCH (encounter-lifecycle category).
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: EncounterCreated formatter widened to read either field; new CombatantPlaced case.
- **[../../tests/unit/engine/slice-683-combatant-placement.test.ts](../../tests/unit/engine/slice-683-combatant-placement.test.ts)** (new): 9 tests
  - `combatants` path sets positions on runtime.
  - Legacy `combatantIds` path preserved.
  - Rejects both-set.
  - Out-of-bounds throws.
  - Impassable terrain throws.
  - Same-cell collision (per-batch) throws.
  - `planPlaceCombatant` emits + reducer sets.
  - `planPlaceCombatant` rejects collision with existing combatant.
  - Replay-equivalent: rebuilt state from event log reproduces positions.

## Tests

- `npx vitest run tests/unit/engine/slice-683-combatant-placement.test.ts`: 9/9 pass.
- Full suite: 539 files / 4,112 passing + 173 skipped (was 538 / 4,102 post slice 682 — the +1 file / +9 tests are this slice's; +1 test is a snapshot regen from earlier).
- Audits green: planner-wiring (placeCombatant allowlisted), pack-integrity, doc-counts.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive event + additive intent fields.** No existing event shape changes. The legacy `combatantIds`-only path is preserved byte-identical; existing replay logs work unchanged.

**For the dnd-web viewer**: switch from synthesized formations to real `combatant.position`, animate `CombatantMoved` with no further engine changes. Placement is now `engine.plan.createEncounter({ combatants: [{ characterId, position }, ...] })` (with optional `position` per combatant).

## Audit (Uncle Bob)

- **Names**: `combatants` is the placement-aware shape; `combatantIds` is the legacy bare-id shape. `planPlaceCombatant` mirrors `planCreateEncounter` naming. `CombatantPlaced` event name matches the existing `CombatantMoved` pattern.
- **DRY**: `validatePlacementAgainstMap` helper shared by `planCreateEncounter` (batch validation) and `planPlaceCombatant` (cross-encounter validation). The reducer's runtime-shape construction is shared between the two paths via a unified placements array.
- **SRP**: schema declares; reducer persists; planner validates + emits. Each layer's job is single-step. The either-or invariant lives in the planner (validation site) not the schema (type-system site) because `.refine()` would break downstream union narrowing — documented inline.
- **Magic numbers/strings**: none added; cell coordinates are integers from the intent.
- **Pattern-check**: other event-shape extensions in this codebase (slice 654's `subclassChoiceForClassId`, slice 657's `recharge` on ResourceState, slice 661's `lifecycle` on OfferChoice) all use optional fields rather than `.refine()` — same convention.

## Open follow-ups

Spatial combat support cycle (slice 683 of 3):

- ~~683 (this slice)~~: Combatant placement. **Landed; viewer unblocked.**
- **684**: Pathfinding (`findPath`, `reachableCells`) + shortest-path `plan.move` cost. The current `plan.move` uses a straight bresenham line which is wrong when obstacles are present.
- **685**: Range + LoS enforcement on `plan.attack` and `plan.castSpell` when both attacker and target have positions.

**Deferred (per the user's plan)**:
- Movement AI / positioned scenario generation (out of scope; layer above the engine).
- Elevation, verticality, cover-as-AC (not in scope for this cycle).
- Adding an explicit `encounter.locationId` field (current per-combatant `characterLocations` mapping suffices).
