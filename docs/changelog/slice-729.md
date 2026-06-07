# Slice 729 — engine: Druid Natural Recovery slot recovery (Circle of the Land L6)

**Type:** Engine feature (new planner). Additive; reuses the slice-721 `SpellSlotsRegained` event. L6 SRD-complete cycle.

SRD 5.2.1 Circle of the Land L6 Natural Recovery (slot-recovery arm): "When you finish a Short Rest, you can choose expended spell slots to recover. The spell slots can have a combined level ≤ half your Druid level (round up), and none of them can be level 6+. Once you recover spell slots with this feature, you can't do so again until you finish a Long Rest."

## What changed

New `engine.plan.naturalRecovery(state, { druidId, slots: [{ level, count }] })` (`planNaturalRecovery`):

- Gated by the `natural-recovery` resource (max 1, recharge longRest) the subclass already grants — its presence IS the feature, so no separate subclass/level check.
- Validates: combined recovered level ≤ `ceil(druidLevel / 2)`; no slot level 6+; can't recover more than were expended (aggregated per level).
- Emits `ResourceSpent(natural-recovery)` + one `SpellSlotsRegained` per recovered level. Reuses the standard-slot regain event from Wild Resurgence (721).

The other arm (cast one prepared Circle spell without a slot, 1/long rest) depends on the land-specific Circle Spells list and is deferred to that feature's wiring — documented in the planner. This slice covers the distinctive slot-recovery mechanic.

## Files

- [src/engine/plan/natural-recovery.ts](../../src/engine/plan/natural-recovery.ts) (new): `planNaturalRecovery`.
- [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts), [src/engine/conveniences.ts](../../src/engine/conveniences.ts): `engine.plan.naturalRecovery` + `planIntent` dispatch.
- [tests/unit/engine/slice-729-natural-recovery.test.ts](../../tests/unit/engine/slice-729-natural-recovery.test.ts) (new): recovers up to the combined-level budget once per long rest; rejects over-budget, over-expended, level-6+, and a druid without the feature.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No new event/condition (reuses `SpellSlotsRegained`); planner-wiring audit accounts for `NaturalRecovery`.

## Audit (Uncle Bob)

- **Reuse**: the standard-slot regain reuses `SpellSlotsRegained` (slice 721); the once-per-LR gate is the existing `natural-recovery` resource.
- **SRD-faithful**: combined-level ≤ ceil(level/2), no L6+, can't exceed expended, once per long rest.
- **Determinism**: pure; no RNG.
- **Honest scope**: the free-Circle-spell-cast arm is deferred to the (land-dependent) Circle Spells wiring, documented.
