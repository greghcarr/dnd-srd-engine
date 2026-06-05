# Slice 664 — engine: Deflect Attacks damage-pipeline auto-integration

**Type:** Engine extension (planner-only). **Fourth slice of the post-L3-RAW completeness push.** Closes the slice-660 "Deflect Attacks damage-pipeline auto-integration" deferral (and the original slice-658 follow-up).

Pre-664 the slice-648 + slice-658 `planDeflectAttacks` returned the rolled `reduction` and computed `remainingDamage`, but **did not modify the damage chain**. Consumers had to manually subtract the reduction from the pending `DamageApplied` (by emitting a smaller damage event, or by intercepting the planAttack output before commit). This was a real gap: the engine knew the reduction but didn't apply it, leaving every consumer to reimplement the same math at the call site.

This slice closes the gap by emitting a `Healed` event for the deflected amount after the marker event. The consumer commits planAttack's events normally; then commits planDeflectAttacks; the engine restores the deflected damage automatically.

## What's wired

- `planDeflectAttacks` now emits a `Healed { targetId: monkId, amount: appliedReduction, source: 'deflect-attacks' }` immediately after the `DeflectAttacksUsed` marker event.
- `appliedReduction = max(0, min(reduction, incomingDamage))` — clamped so the reaction never grants HP beyond the incoming damage's worth. A reduction of 15 against an 8-damage attack heals 8 (not 15).
- `DeflectAttacksOutcome` gains a new `appliedReduction: number` field so consumers can inspect the actual healed amount. `remainingDamage` is retained for back-compat with slice-648/658 consumers that read it for UI / transcript purposes.
- Event order within `planDeflectAttacks.events`:
  1. `ActionEconomyConsumed { reaction }` (if in-encounter).
  2. `DeflectAttacksUsed` marker (transcript + audit).
  3. **`Healed`** (slice 664 new; amount = `appliedReduction`).
  4. Counter arm chain (slice 658: `ResourceSpent ki` + `SaveRolled` + `DamageApplied` + concentration if applicable) when fired.

## Scope decisions

- **Healed event over a new DamageReduced event**: a new event type would model the deflection more directly ("this damage didn't happen"), but `Healed` is the smallest-blast-radius implementation: existing reducer, existing transcript, no schema additions. The clamping behavior of `applyHealed` (caps at maxHP) gives the desired "monk doesn't gain HP beyond pre-attack state" behavior for free.
- **Consumer flow stays sequential**: planAttack first (DamageApplied lands), planDeflectAttacks second (Healed restores). The alternative — restructuring planAttack to consult the target's effect stack for reductions BEFORE emitting DamageApplied — would require an opt-in flag at attack-intent time AND would force every consumer to convert their planAttack flow. The Healed approach is purely additive.
- **Event-ordering artifact accepted**: a fatal attack drops the monk to 0 (or below, capped to 0) BEFORE the Healed lands. `applyHealed`'s `wasUnconscious` branch resets death saves when the heal brings HP > 0, so post-state matches RAW. The transcript shows a transient 0-HP step before the heal — documented as an event-ordering artifact, not a behavior bug. A future engine slice could restructure to interception-before-DamageApplied if a consumer's UI surfaces the 0-HP-blip as a problem.
- **Zero-incoming edge**: if the consumer somehow calls `planDeflectAttacks` with `incomingDamage: 0`, `appliedReduction` is 0 and no Healed is emitted. Reaction + marker still fire (the consumer committed to spending the reaction).
- **`remainingDamage` not removed**: even though the value is now redundant with `appliedReduction` (one is `incomingDamage - reduction`, the other is `min(reduction, incomingDamage)`), the slice-648/658 contract included it and external consumers may format it. Retaining costs nothing.

## Files

- **[../../src/engine/plan/deflect-attacks.ts](../../src/engine/plan/deflect-attacks.ts)**:
  - Imports `HealedEvent`.
  - New constant `DEFLECT_REDUCTION_SOURCE = 'deflect-attacks'`.
  - New `appliedReduction: number` field on `DeflectAttacksOutcome`.
  - Auto-emits `Healed` after the marker event.
  - Header comment updated: the slice-648 deferred note becomes the slice-664 wired-here note. Event-ordering caveat documented.
- **[../../tests/unit/engine/slice-664-deflect-attacks-pipeline.test.ts](../../tests/unit/engine/slice-664-deflect-attacks-pipeline.test.ts)** (new): 6 tests
  - Healed event emitted with `amount = min(reduction, incomingDamage)`.
  - Net post-state HP matches RAW: `current - max(0, incoming - reduction)`.
  - Over-heal cap: reduction > incoming → heal only incoming worth.
  - Zero-incoming edge: no Healed.
  - Back-compat: `remainingDamage` still reflects `max(0, incoming - reduction)`.
  - Fatal attack + deflect: monk transiently drops to 0 then Healed reverses (death saves reset).

## Tests

- `npx vitest run tests/unit/engine/slice-664-deflect-attacks-pipeline.test.ts`: 6/6 pass.
- `npx vitest run tests/unit/engine/slice-648-deflect-attacks.test.ts`: 9/9 pass (slice-648 + slice-658 tests live in one file; both arms still green with the new Healed event in the output).
- Full suite: 521 files / 3772 passing + 173 skipped. Previous baseline 520 / 3766: the +1 file / +6 tests are this slice's.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive event**, behavior change for committed flows. No schema change, no removed APIs.

**Behavior change for existing consumers**: pre-664 a consumer that called `planDeflectAttacks` after committing the attack chain and then DID NOTHING further (didn't manually emit a reduced DamageApplied) would have the monk take FULL damage — the reduction had no effect. Post-664 the engine emits the `Healed`, so the monk takes the RAW-correct reduced damage automatically. **This is a correction, not a regression**: any consumer that previously relied on the "full damage applied" behavior was already RAW-broken; the slice-664 behavior is what slice 648's planner was meant to deliver.

If a consumer was manually emitting a smaller `DamageApplied` post-648, they should now stop — the Healed event handles the math. Otherwise the monk would receive double-reduction.

## Audit (Uncle Bob)

- **Names**: `appliedReduction` is precise ("the amount we actually applied"), distinct from `reduction` ("the amount we computed before clamping"). `DEFLECT_REDUCTION_SOURCE` distinguishes the reduction's Healed event from the counter arm's separate `'deflect-attacks-counter'` source string on the counter's DamageApplied.
- **DRY**: the clamping math `max(0, min(reduction, incomingDamage))` is one line; no helper extracted (no second user).
- **SRP**: the planner has one job (handle the Deflect Attacks reaction); slice 664 adds one event emission to that job. No new module, no new derive helper.
- **Magic numbers / strings**: `DEFLECT_REDUCTION_SOURCE` named constant. The Healed `amount` is a computed value.
- **Pattern-check**: searched for other "planner returns numeric reduction the consumer must subtract" sites: the only sibling pattern was `Cutting Words` (Bard L3) which already emits the reduction directly via `ApplyAttackPenalty` (the d6 hit penalty applies before the attack rolls, so no post-damage subtraction is needed). No other planner currently leaves damage-reduction math to the consumer.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 664 of ~16):

- ~~660~~: Circle of the Land long-rest swap. Landed.
- ~~661~~: Land-swap supersession. Landed.
- ~~662~~: Generic `GrantAbilitySubstitution` primitive. Landed.
- ~~663~~: Always-enforce ability substitutions. Landed.
- ~~664 (this slice)~~: Deflect Attacks damage-pipeline auto-integration. Landed.
- **665-672**: Spell-wiring primitives (zone, on-hit-cast, recurring, flight, on-action, slow, beacon, blink).
- **673-676**: Audit + polish (triple-class multiclass, L3 fuzz, recharge auto-populate, multiclass fuzz).

**Deferred**:
- **Pre-DamageApplied interception path**: the Healed approach has a transient 0-HP timeline blip for fatal attacks. A future engine slice could thread a "post-hit, pre-damage-apply" interception primitive through planAttack so the monk's reduction is consulted BEFORE the DamageApplied lands, eliminating the blip. Deferred as a UI-quality improvement, not a correctness gap.

**With slice 664 landed, all three slice-660 RAW behavior gaps are closed** (land-swap supersession, always-enforce ability substitution, Deflect Attacks pipeline integration). The engine now matches RAW for every L3 punch-list arm; remaining post-L3 work is spell-wiring primitives and audit polish.
