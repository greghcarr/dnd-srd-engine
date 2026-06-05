# Slice 646 — engine + schema: Rogue L3 Steady Aim planner

**Type:** Engine primitive + event schema additions + canonical user.

Closes the first of slice 645's three L3 planner xfails (2 remaining: planFastHands, planDeflectAttacks).

RAW (SRD 5.2.1 Rogue L3): "As a Bonus Action, you give yourself Advantage on your next attack roll on the current turn. You can use this feature only if you haven't moved during this turn, and after you use it, your Speed is 0 until the end of the current turn."

Two mechanical arms, both surfaced as per-combatant `turnUsage` flags (mirroring the Reckless Attack pattern from slice 461):

1. **`steadyAimActive`** — set by `SteadyAimActivated`, consumed by the next attack roll's resolution. The attack-side gate adds it to the existing advantage-source disjunction (alongside `attackerRecklessAdvantage`, `targetGrantsAdvantage`, etc.). A new `SteadyAimConsumed` event clears the flag post-roll so subsequent attacks this turn don't also gain advantage.
2. **`speedZeroUntilEndOfTurn`** — set alongside `steadyAimActive`. The move planner rejects movement intents while set. Cleared by the next `TurnStarted` (RAW: "until the end of the current turn").

## Files

### Schema + reducer (new event types + turnUsage fields)

- **[../../src/schemas/runtime/encounter.ts](../../src/schemas/runtime/encounter.ts)**: two new `turnUsage` fields (`steadyAimActive`, `speedZeroUntilEndOfTurn`); both added to `EMPTY_TURN_USAGE`.
- **[../../src/schemas/events/action-economy.ts](../../src/schemas/events/action-economy.ts)**: two new event schemas — `SteadyAimActivatedEvent` (planner-emitted) and `SteadyAimConsumedEvent` (attack-side; clears `steadyAimActive`).
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: five touchpoints per event (schema import twice, discriminated union, name array, type re-export).
- **[../../src/engine/reducers/action-economy.ts](../../src/engine/reducers/action-economy.ts)**: `applySteadyAimActivated` sets both flags; `applySteadyAimConsumed` clears `steadyAimActive` only (speed-0 persists until TurnStarted).
- **[../../src/engine/reducers/encounter.ts](../../src/engine/reducers/encounter.ts)**: extended both the `EncounterCreated` initializer (combatant turnUsage seed) AND the `TurnStarted` per-turn reset to handle the two new flags. The reset is defensive — if a rogue uses Steady Aim and then doesn't attack, the activated flag would otherwise persist into next turn.
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: imports + dispatch cases for both new events.
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: format cases for both events (required by the exhaustive event switch).

### Planner + wiring + attack/move integration

- **[../../src/engine/plan/steady-aim.ts](../../src/engine/plan/steady-aim.ts)** (new): planner + `SteadyAimIntent`. Gates on Rogue L3+, active encounter on the rogue's turn, BA available, `feetMovedThisTurn === 0`, and `steadyAimActive !== true`. Emits `ActionEconomyConsumed { bonusAction } + SteadyAimActivated`.
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export `planSteadyAim`, `SteadyAimIntent`.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: `engine.plan.steadyAim` method.
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: `SteadyAim` dispatch (planner-wiring audit requirement).
- **[../../src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)**: in `resolveAttack`, new `attackerSteadyAimAdvantage` boolean (read from `turnUsage.steadyAimActive`). Added to the advantage-source disjunction at line ~970. A `steadyAimConsumedEvents` array is built when the flag fired and spread into both the hit AND miss return paths so the reducer clears the flag post-roll.
- **[../../src/engine/plan/movement.ts](../../src/engine/plan/movement.ts)**: `planMove` now rejects with `"... cannot move: speed is 0 until end of turn (Steady Aim)"` when the active combatant's `speedZeroUntilEndOfTurn` is set.

### Tests + audit flip

- **[../../tests/unit/engine/slice-646-steady-aim.test.ts](../../tests/unit/engine/slice-646-steady-aim.test.ts)** (new): 4 tests — emission shape, move-rejection-while-speed-0, "already moved" gate, gating rejects (non-rogue / under-L3 / used-twice). The used-twice test asserts EITHER `Steady Aim already used` OR `bonus action` error (the BA gate fires first in the planner's current order; both gates correctly catch the regression).
- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**: flipped `planSteadyAim` from xfail to wired. L3 floor xfail count drops 3 → 2.

## Tests

- `npx vitest run tests/unit/engine/slice-646-steady-aim.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/{srd-l3-complete,planner-wiring,pack-integrity}.test.ts`: 60/60 pass.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green (see test counts below).

## RNG impact / Breaking change

**Schema additive**: two new event types + two new `turnUsage` fields. Old campaigns that never logged the events replay unchanged. Zod's default values mean old persisted states without the new flags parse with `false` defaults.

**No RNG consumption** in the planner itself (it's pure flag-flipping). The attack-side advantage adds one extra d20 roll when consumed, but the existing RNG-stream-shift convention already covers per-advantage-source variation.

**Note** on the empty-content stub pin in slice 645's L3 floor: the `rogue / steady-aim` content row still ships `effects: []` — wiring is via the planner, not declarative effects. The stub pin in Section 4 of the L3 floor stays green (asserts `effects.length === 0`). When a future content slice opts to add a Custom-handler stub or similar, the pin would need to be flipped.

## Audit (Uncle Bob)

- **Names**: `planSteadyAim`, `SteadyAimIntent`, `SteadyAimActivated`, `SteadyAimConsumed`, `steadyAimActive`, `speedZeroUntilEndOfTurn`, `attackerSteadyAimAdvantage`, `steadyAimConsumedEvents` — every name says exactly what it is. Constants `ROGUE_CLASS_ID`, `STEADY_AIM_LEVEL`.
- **DRY**: per-turn-flag pattern mirrors Reckless Attack's (slice 461). New event types follow the existing `ActionEconomy*` family shape. Schema touchpoints are mechanical 5-line edits per event, same as slice 637's `PactSlotsRegained`.
- **SRP**: planner does one thing (gate + emit). Attack-side gate is one disjunct in the existing advantage logic. Move-side gate is one early-throw in `planMove`. Reducer for `SteadyAimConsumed` only clears the activated flag, leaving `speedZeroUntilEndOfTurn` to the TurnStarted reset (RAW separation).
- **Magic numbers / strings**: every literal is a named constant.
- **Pattern-check**: searched for other "next attack gets advantage" features. The Sap-from-Vex chain (slice 484) uses the `consume-on-attack` condition pattern instead of a per-turn flag — different shape because Sap rides a target-applied condition, not a self-flag. Steady Aim is the first self-flag "next attack" feature; when the second arrives (Lucky feat's reroll, etc.), revisit shared abstraction.

## Open follow-ups

L3-complete punch list now stands at **2 remaining** (was 3):

- ~~`planSteadyAim`~~ — landed.
- **`planFastHands`** — thief subclass L3 (BA thieves' tools / sleight of hand / disarm-trap / use object).
- **`planDeflectAttacks`** — monk L3 (reaction: reduce weapon damage by 1d10 + DEX + monk level; optional Focus-Point counter or weapon throwback).

Plus 7 content-stub pins from slice 645's Section 4 (5 of which still need engine work: primal-knowledge OfferChoice, circle-of-the-land-cantrip OfferChoice, circle-of-the-land-spells OfferChoice + GrantSpell, hunters-lore decision, fast-hands paired with planner xfail).

Deferred RAW / scope notes:
- Spell-attack rolls don't yet consult `steadyAimActive`. Rogues at L3 rarely cast spell-attack cantrips (Arcane Trickster is L3 Wizard-subclass casting at higher levels; Eldritch Knight is Fighter), so the gap is narrow at L3. Add when a Multiclass arcane-trickster path needs it.
- Cleave / multiattack from a single primary attack: if the primary consumed Steady Aim, the Cleave should NOT also gain advantage (RAW: "next attack roll" already consumed). The current implementation clears the flag after the primary; Cleave reads `steadyAimActive` at planning time and sees it cleared — correct.
