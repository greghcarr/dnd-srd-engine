# Slice 626 — close three open follow-ups from the L1 fuzz cycle (on-hit mastery damage gate, s23 Graze test, Halfling Lucky transcript display)

**Type:** Engine + tests + transcript.

Three small, tightly-related closures:

## 1. On-hit masteries gate on damage > 0 (closes slice 624's open item)

RAW Sap/Vex/Slow/Topple/Push: *"If you hit a creature with this weapon **AND deal damage to the creature**..."* A hit reduced to 0 by resistance/immunity shouldn't fire the rider. `WeaponMasteryIntent` gained `attackDealtDamage?: boolean`; when `false` for one of the 5 damage-gated masteries, [../../src/engine/plan/weapon-mastery.ts](../../src/engine/plan/weapon-mastery.ts) emits only the activation event and skips the rider. Cleave is exempt (RAW: "if you hit... you can make a melee attack roll" — no damage gate). Graze is unaffected (miss-only). Fuzz dispatch ([../../scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts)) inspects the following `DamageApplied` event's component sum and threads `attackDealtDamage = atk.hit && damageTotal > 0`.

## 2. s23-weapon-mastery's "Graze deals ability mod damage" test now actually tests Graze (closes slice 624's open item)

Pre-slice the test fired Sap with a longsword because TEST_PACK had no Graze weapon (mislabel survived since the test was originally written). Slice 626 adds a `greatsword` (2d6 slashing, Graze) to [../../tests/fixtures/content/test-pack.json](../../tests/fixtures/content/test-pack.json) and the test now exercises `mastery: 'Graze', attackHit: false` and asserts the STR-mod-damage event with the right type.

## 3. Transcript shows ALL d20 rolls when Halfling Lucky reroll grew the array (closes the slice-625 review's transcript-display nit)

Pre-slice [../../tests/transcript.ts](../../tests/transcript.ts) collapsed length≥3 d20 arrays to just `event.d20[0]`, so a `[disadvantage]: d20(19)` line looked bizarre (it was actually disadvantage rolling [19, 1], halfling lucky rerolling the 1 to 19, used=19). New `formatD20Rolls(rolls, used)` helper renders length-1 as "X", length-2 as "X/Y", length-3+ as "X/Y→Z" (the "→" marks the reroll). Used by AttackRolled / SaveRolled / AbilityCheckRolled formatters.

## Tests

[../../tests/unit/engine/slice-626-mastery-damage-gate.test.ts](../../tests/unit/engine/slice-626-mastery-damage-gate.test.ts), 4 cases: Sap with `attackDealtDamage:false` → only the activation event (no Sapped); Sap with `attackDealtDamage:true` → Sapped applied; legacy caller (no field) still applies Sapped (backwards-compat); Cleave with `attackDealtDamage:false` still fires (Cleave has no damage gate per RAW). The s23 test now exercises real Graze. Transcript change is exercised implicitly by every golden + integration test that consumes `formatTranscript`; full suite green confirms no regressions.

## Verification

`npx tsc --noEmit` clean, full suite green. The transcript change is purely additive (formatting only): showcase golden regenerated with one line (d20(1/11) → d20(1→11) for a Halfling Lucky reroll).

## RNG impact

None. Damage-gate is a planner-side skip on borderline RAW (no new rolls). Transcript change is presentation-only.

## Audit

- **Names**: `attackDealtDamage` mirrors `attackHit` from slice 624; `formatD20Rolls(rolls, used)` reads as what it does.
- **DRY**: damage-gated mastery list is a `Set<string>` literal at the top of the gate block. `formatD20Rolls` collapses 3 duplicate `length === 2 ? ... : event.d20[0]` ternaries into one helper.
- **Pattern-check**: swept other `event.d20.length === 2` references in [../../tests/transcript.ts](../../tests/transcript.ts) — three sites (AttackRolled, SaveRolled, AbilityCheckRolled), all updated to the helper. No other "show only the first d20" patterns elsewhere.
- **Tests**: 4 cases pin the damage-gate logic per branch (skip, fire, legacy, Cleave-exempt).

## Open follow-ups

Deferred items rolled forward (Innate Sorcery class gate closed by slice 627; Power Word Speed Zero + fuzz reaction-spell dispatch still open).
