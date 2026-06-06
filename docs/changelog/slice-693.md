# Slice 693 — feat: movement option + no-op move-policy seam on the combat fuzz

**Type:** Engine fuzz-harness primitive (first of three). Adds the `movement: 'none' | 'tactical'` option to `runBattle` plus the strategy seam the tactical policy plugs into, with `'none'` proven byte-identical to the legacy positionless path. No behavior change yet — slices 694 (arena + placement) and 695 (movement policy + opportunity attacks) fill in the `'tactical'` arm.

## Why

The dnd-web consumer wants a `tactical-replay` viewer mode: combatants spread out on a generated arena and moving intelligently, replayed from the engine's deterministic event log. The generation that emits those `CombatantMoved` events must live where the deterministic log is produced — `runBattle` in [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) — so the consumer never re-derives movement and diverges. See the handoff design (Part A) for the full rationale.

The load-bearing constraint: the default (`'none'`) path must stay **byte-identical** to today's log so the existing fuzz-matrix + replay-equivalence suites — which both consumers depend on — keep passing unchanged. This slice establishes the seam that guarantees that, before any tactical code exists.

## What's wired

### `runBattle` option + result fields

- New exported `FuzzMovement = 'none' | 'tactical'`. `FuzzBattleOptions.movement?` (default `'none'`).
- `FuzzBattleResult` gains `movement: FuzzMovement` (which mode produced the battle) and `locationId?: string` (set in slice 694; the arena's location id, a convenience pointer — the map + positions live in the event log / state).

### Move-policy seam (the design's "strategy seam, not a flag-littered loop")

- New exported `MovePolicy = (ctx: MovePolicyContext) => Campaign` and `MovePolicyContext` (carries `engine`, `pack`, `campaign`, `encounterId`, `active`, `opponent`, `allies`, `combatants`). `Engine = ReturnType<typeof createEngine>`.
- `const NO_MOVE: MovePolicy = (ctx) => ctx.campaign` — the identity policy.
- The turn loop calls `campaign = movePolicy({ ... })` exactly once per turn, after the dead-combatant check and before the action loop. `runBattle` selects `movePolicy = NO_MOVE` (slice 695 swaps in the tactical factory for `movement === 'tactical'`).
- Varying behavior through one injected policy — rather than scattered `if (tactical)` branches — keeps `'none'` byte-identity robust against future turn-loop edits. With `NO_MOVE`, the per-turn call is a pure identity: no events, no RNG, no state change.

### Test-fixture helper: `normalizeEvents`

- New export in [tests/fixtures/index.ts](../../tests/fixtures/index.ts). Two same-seed `runBattle` runs are **not** raw-JSON-identical: entity ids are fresh `ulid()`s (timestamp + entropy) each run, and engine-planned events stamp `at` from the wall clock (`nowIso()`), since the fuzz passes no `at`. Neither encodes a decision. `normalizeEvents` interns every ULID-shaped string (26-char Crockford base32) to a stable positional token and blanks every `at` field, leaving event types, order, and every RNG-driven value (rolls, damage, chosen cells) intact. This is the correct cross-run determinism oracle and is reused by the slice-695 golden test (which is why the design's "JSON.stringify-identical" phrasing is realized as `normalizeEvents`-equality).

## Files

- Edited: [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) (option, result fields, seam types, `NO_MOVE`, per-turn call, return), [tests/fixtures/index.ts](../../tests/fixtures/index.ts) (`normalizeEvents`).
- Added: [tests/integration/fuzz-tactical-default-guard.test.ts](../../tests/integration/fuzz-tactical-default-guard.test.ts), [docs/changelog/slice-693.md](slice-693.md).

## Tests

- `npx tsc --noEmit`: clean.
- New guard test (3 cases): default reports `movement:'none'` + no `locationId`; default path emits no `CombatantMoved`/`LocationCreated`/`CharacterLocationChanged` and creates the encounter positionless (no `combatants` array on `EncounterCreated`); explicit `movement:'none'` is `normalizeEvents`-identical to the default across 5 seeds (proves same code path).
- Byte-identity proof: [tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts) (37 tests), [tests/golden/replay-equivalence.test.ts](../../tests/golden/replay-equivalence.test.ts), [tests/integration/combat-fuzz-flags.test.ts](../../tests/integration/combat-fuzz-flags.test.ts) all pass unchanged.
- Full `npx vitest run`: green.

## RNG impact / Breaking change

**No RNG impact in `'none'` mode** (the default). The per-turn `NO_MOVE` call constructs no events and consumes no RNG. `FuzzBattleResult` gains a required `movement` field; `runBattle` is the sole producer, and all consumers (`scripts/combat-fuzz.ts`, the fuzz tests) only read the result, so this is non-breaking.

## Audit (Uncle Bob)

- **Scope**: the slice does only what its title says — the option, the result fields, the seam, and a guard test. No tactical logic, no arena, no movement events. The `'tactical'` arm is still `NO_MOVE`.
- **SRP / strategy pattern**: behavior varies through one injected `MovePolicy`, not flag branches in the loop body. The seam has one job: let a future policy act once per turn.
- **DRY**: the cross-run determinism oracle (`normalizeEvents`) lives in one place (fixtures) and is reused by slice 695, not re-implemented per test.
- **Magic numbers**: none introduced.
- **Pattern-check**: searched for other `FuzzBattleResult` producers/constructors — `runBattle` is the only one; every other reference is a read. The added field can't desync a second producer because there isn't one.

## Open follow-ups

- Slice 694: `generateArenaMap` + spread placement (`LocationCreated` → `CharacterLocationChanged` → positioned `createEncounter`); the `tactical` constants module first appears there (deferred from this slice to avoid landing a dead, unimported file — minor, deliberate deviation from the Part A sketch).
- Slice 695: `planTacticalMove` (RNG-free, total-ordered) + the tactical `MovePolicy` factory (disengage / move / opportunity-attack resolution), the golden replay test, and the tactical fuzz/replay matrix.
