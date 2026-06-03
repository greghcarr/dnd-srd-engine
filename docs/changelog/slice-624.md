# Slice 624 — Graze weapon mastery fires on MISS only (RAW gate)

**Type:** Engine + tests.

The slice-623 fuzz review caught Graze firing on hit (seed 6009: Aria glaive HIT for 7, then engine added 2 graze damage on top). RAW 2024 ([../../references/srd-markdown/equipment.md](../../references/srd-markdown/equipment.md)): Graze fires *"if your attack roll with this weapon misses a creature"* — miss-only. Other 6 hit-and-damage masteries all fire on hit. Two-layer bug: [../../src/engine/plan/weapon-mastery.ts](../../src/engine/plan/weapon-mastery.ts)'s Graze case dealt damage unconditionally (comment even said "miss-fallback" but no invariant); [../../scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) dispatch fired all masteries on `atk.hit === true`.

## Fix

`WeaponMasteryIntent` gained optional `attackHit?: boolean`. `planWeaponMastery` invariants: Graze requires `false`; Sap/Vex/Slow/Topple/Push/Cleave require `true`; Nick/Flex unaffected (handled in attack planner). Legacy callers (no field) keep working for non-Graze. Fuzz dispatch threads `atk.hit` into `pendingMasteryFire` and gates: `mastery === 'Graze' ? !atk.hit : atk.hit`.

## Tests

[../../tests/unit/engine/slice-624-graze-miss-gate.test.ts](../../tests/unit/engine/slice-624-graze-miss-gate.test.ts), 4 cases: Graze+miss emits STR-mod damage; Graze+hit throws; Sap+miss throws; legacy no-field caller still works.

## Verification

`npx tsc --noEmit` clean, full suite green. Re-running seed 6009 confirms the spurious "Mastery: Graze ... +2 damage" line is gone.

## RNG impact

Per-seed shift in mastery-class + Graze-weapon battles only (greatsword, glaive). Tracked in [../../docs/breaking-changes-queued.md](../../docs/breaking-changes-queued.md).

## Audit

- **Names**: `attackHit` matches `AttackRolledEvent.hit: boolean`.
- **DRY**: single invariant block covers all 7 gated masteries.
- **Pattern-check**: swept `src/engine/triggers/` and `src/engine/plan/` for other "on miss" handlers (`onMiss`, `missFallback`, `attackOutcome`, `hit: false`). Graze is the single instance.
- **Tests**: each pins one RAW shape; backwards-compat case prevents golden-test breakage.

## Open follow-ups

- On-hit masteries (Sap et al.) RAW also gates on "deal damage" — 0-damage hits (resistance) shouldn't fire them either. Rare; not in scope. ~~**Closed by slice 626.**~~
- s23-weapon-mastery.test.ts "Graze deals ability mod damage" still fires Sap (mislabeled pre-slice-622). Could tighten now that starter pack has Graze weapons. ~~**Closed by slice 626.**~~
