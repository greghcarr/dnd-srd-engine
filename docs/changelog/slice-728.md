# Slice 728 — engine: Barbarian Mindless Rage (Berserker L6)

**Type:** Engine feature (planner rider + new condition). Additive; byte-identical for non-Berserker / sub-L6 barbarians. Wires the slice-54 Berserker L6 stub. L6 SRD-complete cycle.

SRD 5.2.1 Path of the Berserker L6 Mindless Rage: "You have Immunity to the Charmed and Frightened conditions while your Rage is active. If you're Charmed or Frightened when you enter your Rage, the condition ends on you."

## What changed

- New condition **`mindless-rage-active`** carrying `GrantConditionImmunity{charmed}` + `GrantConditionImmunity{frightened}` (`endsOn: longRest`, same consumer-managed lifecycle as `raging`).
- `planRage`: when the barbarian has the Berserker subclass (`path-of-the-berserker`) at level 6+, entering Rage now (a) applies `mindless-rage-active` alongside `raging` — so while raging the barbarian is immune to Charmed/Frightened (every planner that applies those calls the `isImmuneToCondition` gate), and (b) emits `ConditionRemoved` for Charmed/Frightened already on the barbarian (the "ends on you when you enter Rage" arm).

Gated on subclass + level in the planner; the pack's `mindless-rage` subclass feature stays a marker (the Sear Undead / Cunning Action convention). The immunity lives on the `raging`-lifecycle condition rather than the always-on feature, so it correctly applies only while raging.

## Files

- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): `mindless-rage-active` condition.
- [src/engine/plan/rage.ts](../../src/engine/plan/rage.ts): apply `mindless-rage-active` + end Charmed/Frightened at Berserker L6+.
- [tests/unit/engine/slice-728-mindless-rage.test.ts](../../tests/unit/engine/slice-728-mindless-rage.test.ts) (new): L6 Berserker becomes immune on raging; entering Rage ends an existing Frightened; a L5 Berserker doesn't get it yet.
- [docs/getting-started.md](../../docs/getting-started.md), [docs/status.md](../../docs/status.md), [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md): condition counts 157→158 (rider 142→143), CI-guarded by doc-counts.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. doc-counts updated for the new condition; non-Berserker / sub-L6 rage byte-identical.

## Audit (Uncle Bob)

- **Reuse**: the immunity uses the existing `GrantConditionImmunity` primitive + the `isImmuneToCondition` gate every condition-applying planner already calls; no new immunity machinery.
- **SRD-faithful**: immune only while raging (immunity on the rage-lifecycle condition), and entering Rage ends existing Charmed/Frightened.
- **Byte-identity**: gated on Berserker subclass + L6; all other rages unchanged.
- **Pattern-check**: level/subclass-gate marker convention; verified `GrantConditionImmunity`'s predicate gate only sees source facts, so a rage-lifecycle condition (not a feature predicate) is the right carrier.
