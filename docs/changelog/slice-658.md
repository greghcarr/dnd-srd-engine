# Slice 658 — engine: Deflect Attacks counter arm

**Type:** Engine extension (planner-only). Sixth slice of the L3 RAW-completeness push. Closes the deferred-from-slice-648 counter arm.

RAW (SRD 5.2.1 Monk L3 Deflect Attacks): "If you reduce the damage to 0, you can expend 1 Focus Point to redirect some of the attack's force. If you do so, choose a creature you can see within 5 feet of yourself if the attack was a melee attack or a creature you can see within 60 feet of yourself that isn't behind Total Cover if the attack was a ranged attack. That creature must succeed on a Dexterity saving throw or take damage equal to two rolls of your Martial Arts die plus your Dexterity modifier. The damage is the same type dealt by the attack."

The slice-648 reduction arm already shipped. This slice adds the counter:
- New optional `counterTargetId` field on `DeflectAttacksIntent`.
- New outcome fields: `counterFired: boolean`, `counterSaveSuccess?: boolean`, `counterDamage?: number`.
- Counter fires when ALL of: `remainingDamage === 0` AND `counterTargetId` supplied AND monk has ≥1 `ki`.
- Emits `ResourceSpent { ki, 1 } + SaveRolled` (DEX vs DC = 8 + WIS + PB) + `DamageApplied` (on failed save).
- Damage = `2 × Martial Arts die + DEX mod`, same type as the incoming attack.

## Scope decisions

- **Range constraints (5 ft melee / 60 ft ranged + Total Cover)**: consumer-supplied. The engine has no positions; the consumer passes whatever target satisfies RAW range. Documented in the planner header.
- **Damage type**: locked to the same type as the incoming attack (RAW "same type dealt by the attack"). Passes through via `intent.damageType`.
- **Mitigation pipeline**: counter damage goes through `mitigateDamage` + `interceptFatalDamage` (same path as planLandsAid / planDivineSpark). Resistance / vulnerability / fatal intercept all honored.
- **Save DC**: Monk feature DC formula `8 + WIS mod + PB` (RAW: PHB 2024 Monk "Saving Throws" header). Computed inline; mirrors the pattern in `planStunningStrike`.

## Files

- **[../../src/engine/plan/deflect-attacks.ts](../../src/engine/plan/deflect-attacks.ts)**:
  - New imports: `DamageAppliedEvent`, `ResourceSpentEvent`, `parseDiceExpression`, `proficiencyBonus`, `computeTotalLevel`, `mitigateDamage`, `interceptFatalDamage`, `applyAll`, `rollSaveAgainstDC`, `martialArtsDie`.
  - `DeflectAttacksIntent`: new optional `counterTargetId: string`.
  - `DeflectAttacksOutcome`: new `counterFired: boolean` + optional `counterSaveSuccess: boolean` + `counterDamage: number`.
  - Header comment: counter arm description updated from "deferred" to wired.
  - After the reduction logic: counter arm fires when conditions met; emits 1-3 events depending on save outcome.
- **[../../tests/unit/engine/slice-648-deflect-attacks.test.ts](../../tests/unit/engine/slice-648-deflect-attacks.test.ts)**: 5 new tests for the counter arm
  - Counter fires when conditions met (remainingDamage=0, counterTargetId, ki≥1).
  - Counter does NOT fire when remainingDamage > 0.
  - Counter does NOT fire when ki is 0.
  - Counter does NOT fire when no counterTargetId supplied (back-compat with the slice-648 reduction-only behavior).
  - Damage type matches the incoming attack (verified by seed sweep finding a failed save).

## Tests

- `npx vitest run tests/unit/engine/slice-648-deflect-attacks.test.ts`: 9/9 pass (was 4; +5 counter-arm tests).
- Full suite: green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive only.** New optional field on `DeflectAttacksIntent`; consumers that don't pass `counterTargetId` get the same behavior as before (no counter). Slice-648 tests continue to pass unchanged.

**RNG**: when the counter fires, consumes one d20 (DEX save) + `2 × Martial Arts die` per call. RNG-stream-shift convention covers this — opt-in usage doesn't affect campaigns that don't invoke the counter.

## Audit (Uncle Bob)

- **Names**: `counterTargetId`, `counterFired`, `counterSaveSuccess`, `counterDamage` — every name says exactly what it represents. `DEFLECT_COUNTER_SOURCE = 'deflect-attacks-counter'` is the canonical event source for the counter's DamageApplied; distinct from the reduction's marker (`DeflectAttacksUsed`).
- **DRY**: reuses every existing damage-pipeline primitive (`mitigateDamage`, `interceptFatalDamage`, `applyAll`, `rollSaveAgainstDC`) — the counter arm doesn't reinvent damage application. Reuses `martialArtsDie` from the attack planner (single source for the 1d6/1d8/1d10/1d12 ladder).
- **SRP**: the counter arm is one branch inside `planDeflectAttacks`; alternative would have been a separate `planDeflectCounter` planner, but the RAW chain "reduce → 0 → counter" is one player decision and atomic from the consumer's perspective. Splitting would force two planner calls for one player action.
- **Magic numbers / strings**: `DEFLECT_COUNTER_DIE_COUNT = 2` (RAW: "two rolls"), `MONK_FEATURE_DC_BASE = 8` (RAW: "8 + ability + PB"), `KI_RESOURCE_ID = 'ki'` (the engine's legacy id for Focus Points). All literals named.
- **Pattern-check**: confirmed counter damage goes through the same mitigation pipeline as planLandsAid / planDivineSpark. Also re-ran the slice-636 `'martial-arts'` substring lesson — the new planner uses `martialArtsDie` (camelCase, no hyphen) and the `'deflect-attacks-counter'` source string. No new literal-id traps. ALSO the concentration-save-coverage audit caught a missing `planConcentrationOnDamage` call after the counter's `DamageApplied` push — wired same-slice (RAW: any damage to a concentrating creature triggers a CON save).

## Open follow-ups

L3 RAW-completeness punch list (slice 658 of 8):

- ~~653~~: L3 OfferChoice emission tests. Landed.
- ~~654~~: Subclass-selection cascade. Landed.
- ~~655~~: Subclass spell-list scaffolding pin. Landed.
- ~~656~~: L3 multiclass build audit. Landed.
- ~~657~~: `partialShortFullLong` recharge primitive. Landed.
- ~~658 (this slice)~~: Deflect Attacks counter arm. Landed.
- **659**: Primal Knowledge ability-substitution.
- **660**: Circle of the Land long-rest swap.

**Deferred (post-cycle)**:
- Damage-pipeline auto-integration of the reduction arm (today the consumer manually subtracts; same as slice 648 noted).
- Range gate enforcement (5 ft / 60 ft) — engine-side range is a broader open question.
