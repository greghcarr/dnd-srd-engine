# Slice 647 — engine + schema: Rogue Thief L3 Fast Hands planner

**Type:** Engine primitive + event schema addition + canonical user.

Closes the second of slice 645's three L3 planner xfails (1 remaining: planDeflectAttacks).

RAW (SRD 5.2.1 Thief L3): "As a Bonus Action, you can do one of the following. Sleight of Hand — Make a Dexterity (Sleight of Hand) check to pick a lock or disarm a trap with Thieves' Tools or to pick a pocket. Use an Object — Take the Utilize action, or take the Magic action to use a magic item that requires that action."

Fast Hands is a **BA dispatcher**, not an end-to-end sub-action wrapper. The planner consumes the Bonus Action and emits a `FastHandsActivated` marker tagged with the chosen mode (`'sleightOfHand' | 'utilize' | 'useMagicItem'`). The consumer chains to the appropriate follow-up planner:
- `'sleightOfHand'` → `planAbilityCheck` (DEX + `'sleight-of-hand'` skill).
- `'utilize'` → `planUtilize`.
- `'useMagicItem'` → `planUseItem`.

This dispatch-marker shape avoids double-action-consumption (each follow-up planner already consumes its own action economy if invoked standalone; chaining inside Fast Hands would double-charge). It also keeps the per-mode RNG / target / DC explicit on the consumer's side rather than buried inside a do-it-all planner.

## Files

### Schema + reducer (new marker event)

- **[../../src/schemas/events/action-economy.ts](../../src/schemas/events/action-economy.ts)**: new `FastHandsActivatedEventSchema` + type. Required fields: `encounterId`, `combatantId`, `mode: 'sleightOfHand' | 'utilize' | 'useMagicItem'`.
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: five touchpoints (schema import twice, discriminated union, name array, type re-export).
- **[../../src/engine/reducers/action-economy.ts](../../src/engine/reducers/action-economy.ts)**: `applyFastHandsActivated` is a no-op reducer that validates the event shape. The persistent state (BA used) is set by the paired `ActionEconomyConsumed` event; the marker event exists for transcript readability + the planner-wiring audit.
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: import + dispatch case.
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: format case (`"<Name> uses Fast Hands (<mode>)."`).

### Planner + wiring

- **[../../src/engine/plan/fast-hands.ts](../../src/engine/plan/fast-hands.ts)** (new): planner + `FastHandsIntent` + `FastHandsMode`. Gates on Rogue L3+ with `subclassId === 'thief'`, active encounter on the thief's turn, BA available. Emits `ActionEconomyConsumed { bonusAction } + FastHandsActivated { mode }`.
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export `planFastHands`, `FastHandsIntent`, `FastHandsMode`.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: `engine.plan.fastHands` method.
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: `FastHands` dispatch (planner-wiring audit requirement).

### Tests + audit flip

- **[../../tests/unit/engine/slice-647-fast-hands.test.ts](../../tests/unit/engine/slice-647-fast-hands.test.ts)** (new): 3 tests — emission shape + BA-flag set, all three modes accepted with correct mode tag, gating rejects (non-rogue / under-L3 / wrong subclass / BA used).
- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**: flipped `planFastHands` from xfail to wired. L3 floor xfail count drops 2 → 1.

## Tests

- `npx vitest run tests/unit/engine/slice-647-fast-hands.test.ts`: 3/3 pass.
- `npx vitest run tests/audit/{srd-l3-complete,planner-wiring,pack-integrity}.test.ts`: 60/60 pass.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

Schema additive. No RNG consumption (the planner is pure flag-flipping; the sub-action's RNG is on the consumer's chain).

The empty-content stub pin in slice 645's L3 floor still asserts the `thief / fast-hands` content row ships `effects: []` — wiring is via the planner. Stub pin stays green.

## Audit (Uncle Bob)

- **Names**: `planFastHands`, `FastHandsIntent`, `FastHandsMode`, `FastHandsActivated`. Constants `ROGUE_CLASS_ID`, `THIEF_SUBCLASS_ID`, `FAST_HANDS_LEVEL`.
- **DRY**: marker-event-only pattern is the same shape as similar dispatch markers in the engine (e.g. `RecklessAttackActivated`, `SteadyAimActivated`). The no-op reducer keeps the apply-dispatch exhaustive without inventing state.
- **SRP**: planner does one thing (validate + emit BA + marker). Sub-action resolution stays the consumer's job, matching the principle that the engine surfaces options and the consumer drives.
- **Magic numbers / strings**: every literal is named.
- **Pattern-check**: I considered composing planAbilityCheck / planUtilize / planUseItem inline (the auto-dispatch path). Rejected: each of those planners already consumes its own action economy when invoked, so inline composition would double-charge. The dispatch-marker shape is cleaner and forces the consumer to make per-mode targeting decisions explicit. Reckless Attack and Steady Aim follow the same minimal-marker pattern when they don't need to compute outcomes themselves. Also re-ran the slice-636 'martial-arts' substring lesson: no new literal-id traps in source.

## Open follow-ups

L3-complete punch list now stands at **1 remaining** (was 2):

- ~~`planSteadyAim`~~ — landed (slice 646).
- ~~`planFastHands`~~ — landed.
- **`planDeflectAttacks`** — monk L3 (reaction: reduce weapon damage by 1d10 + DEX + monk level; optional Focus-Point counter or weapon throwback). Biggest of the three; introduces the damage-reduction reaction primitive.

Plus 7 content-stub pins from slice 645's Section 4. Two are now paired with landed planners (steady-aim, fast-hands) but their content rows still ship `effects: []` — that's the right shape; the pinned stub list documents which surfaces are "planner-only, no content effects" intentionally.

Deferred RAW / scope:
- The consumer-chain pattern means a malformed chain (Fast Hands marker without a follow-up sub-action) leaves the BA spent with no observable effect. That's a consumer bug, not an engine one — the engine surfaces options; the consumer drives. A future "FastHandsCompleted" event paired with the follow-up would close the loop, but adds ceremony for little gain at L3 alpha quality.
