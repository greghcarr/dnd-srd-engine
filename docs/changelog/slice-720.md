# Slice 720 — engine: Cleric Sear Undead (L5)

**Type:** Engine feature (planner rider). Additive; byte-identical for clerics below L5. Wires a slice-463 documented deferral; part of the L5 SRD-complete cycle.

SRD 5.2.1 Cleric L5 Sear Undead: "Whenever you use Turn Undead, you can roll a number of d8s equal to your Wisdom modifier (minimum of 1d8) and add the rolls together. Each Undead that fails its saving throw against that use of Turn Undead takes Radiant damage equal to the roll's total. This damage doesn't end the turn effect."

## What changed

`planTurnUndead` now applies Sear Undead when the cleric is level 5+:

- One pooled roll of `max(1, WIS mod)` d8s (WIS mod read from the effective-score-aware save-DC breakdown, mirroring Divine Spark), rolled once and applied as Radiant to **each** Undead that fails its save.
- Routed through the normal `mitigateDamage` + `interceptFatalDamage` pipeline, so radiant resistance/immunity/vulnerability and Undead Fortitude apply, and `planConcentrationOnDamage` is wired (the RAW take-damage concentration save, enforced by the concentration-save-coverage audit).
- Emitted **before** the Frightened/Incapacitated `ConditionApplied` events for that target. Those conditions carry `endsOnDamage: true` (the Channel Divinity "ends early on damage" arm); emitting Sear Undead's damage first means the conditions are applied to a target that has not yet taken that damage, so they survive it — matching RAW's "This damage doesn't end the turn effect." Subsequent OTHER damage still ends them.

Gating is on cleric level ≥ 5 (Sear Undead is a base Cleric L5 feature), matching the established class+level convention (the pack's `sear-undead` feature stays a marker, like Cunning Action). No pack change.

## Files

- [src/engine/plan/turn-undead.ts](../../src/engine/plan/turn-undead.ts): Sear Undead roll + per-failed-target Radiant `DamageApplied` (before conditions); deferral comment updated.
- [tests/unit/engine/slice-463-turn-undead.test.ts](../../tests/unit/engine/slice-463-turn-undead.test.ts): +2 tests — L5 failed-save Undead takes Radiant that is ordered before (and does not end) the turn conditions, HP drops and conditions persist after commit; L4 cleric emits no Sear damage.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. Existing L2 Turn Undead tests byte-identical (Sear roll gated on L5, so the RNG draw order for sub-L5 clerics is unchanged).

## Audit (Uncle Bob)

- **Reuse**: damage flows through the same `mitigateDamage`/`interceptFatalDamage` pipeline Divine Spark uses; WIS mod read from the save-DC breakdown (no second ability-mod path).
- **SRD-faithful**: WIS-mod d8s (min 1), one pooled roll applied to each failed save, Radiant, doesn't end the turn effect (ordering guarantees it).
- **Byte-identity**: gated on L5, so sub-L5 Turn Undead (all existing tests) is unchanged.
- **Determinism**: one pooled roll before the per-target loop; deterministic under a seeded RNG.
- **Pattern-check**: level-gate convention matches Cunning Action / Channel Divinity (feature row stays a marker).
