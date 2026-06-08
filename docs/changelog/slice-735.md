# Slice 735 — engine: Monk Empowered Strikes re-wired to SRD 5.2.1 (L6)

**Type:** Engine feature (new effect kind + attack-path damage-type override) + content fix + golden rewrite. Closes the slice-734 L6 drift follow-up.

SRD 5.2.1 Monk L6 Empowered Strikes: "Whenever you deal damage with your Unarmed Strike, it can deal your choice of Force damage or its normal damage type."

## The drift this fixes

The pack wired `empowered-strikes` (slice 207) to `GrantUnarmedAsMagical` — the **2014 "Ki-Empowered Strikes"** (unarmed strikes count as magical for overcoming nonmagical resistance/immunity). That is a different feature from the **2024 SRD 5.2.1** Empowered Strikes (the Force-damage-type choice). Surfaced while building the slice-734 L6-complete audit; tracked there and fixed here.

## What changed

- New marker effect **`GrantUnarmedForceOption`** (the `GrantPotentCantrip` marker pattern): surfaced as `effectStack.hasUnarmedForceOption()`.
- Opt-in **`unarmedStrikeAsForce`** flag on the attack intent (`AttackIntent` + `resolveAttack` input), `FlurryOfBlowsIntent`, and `OffHandAttackIntent`. When set AND the weapon is `unarmed-strike` AND the attacker bears the marker, the strike's damage type is overridden to **Force**. Inert otherwise, so every non-opted unarmed strike is byte-identical (golden / replay / fuzz unchanged).
- The override lands at the three unarmed-strike damage sites: `resolveAttack`'s `effectiveDamageType` (covers the Attack action + Flurry of Blows, which both route through `resolveAttack`) and the off-hand attack's damage payload + mitigation component.
- Pack: the Monk L6 `empowered-strikes` feature swaps `GrantUnarmedAsMagical` → `GrantUnarmedForceOption`.
- `GrantUnarmedAsMagical` is **kept** as an available primitive (it has no pack user now, but remains valid for magic items / monster traits that grant magical unarmed). Its schema/builder/magicality consumers are untouched.

## Tests

- [tests/unit/engine/plan-empowered-strikes.test.ts](../../tests/unit/engine/plan-empowered-strikes.test.ts) rewritten for 2024: a L6 monk who opts in deals Force; without opting in the same monk deals the normal type; a L5 monk opting in still deals the normal type (no feature); the Force option carries through Flurry of Blows.
- [tests/golden/s207-empowered-strikes.test.ts](../../tests/golden/s207-empowered-strikes.test.ts) repurposed: the monk chooses Force, which sidesteps a Stoneskinned target's nonmagical B/P/S resistance (transcript shows `force` damage, no mitigation). Transcript regenerated.
- [tests/audit/srd-l6-complete.test.ts](../../tests/audit/srd-l6-complete.test.ts): the Monk L6 assertion now pins `GrantUnarmedForceOption` (drift note removed); the behavioral 5→6 test checks `hasUnarmedForceOption()`.

## Files

- [src/schemas/effects.ts](../../src/schemas/effects.ts): `GrantUnarmedForceOption` (union + zod + `EFFECT_KINDS`); `GrantUnarmedAsMagical` comment updated to note the edition split.
- [src/effects/builder.ts](../../src/effects/builder.ts): `markUnarmedForceOption()` / `hasUnarmedForceOption()` + apply case.
- [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts): `unarmedStrikeAsForce` on the intent + resolveAttack input; `effectiveDamageType` Force override; plumbing.
- [src/engine/plan/flurry-of-blows.ts](../../src/engine/plan/flurry-of-blows.ts), [src/engine/plan/offhand-attack.ts](../../src/engine/plan/offhand-attack.ts): intent flag + override.
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Monk L6 `empowered-strikes` → `GrantUnarmedForceOption`.
- [README.md](../../README.md), [docs/concepts.md](../concepts.md), [docs/authoring-content-packs.md](../authoring-content-packs.md), [docs/status.md](../status.md): EFFECT_KINDS 66→67 (primitives 65→66).
- [docs/gaps-class-features.md](../gaps-class-features.md): empowered-strikes drift closed.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. doc-counts updated for the new effect kind; features coverage snapshot unchanged (feature id stable); exports contract unchanged.

## Audit (Uncle Bob)

- **Reuse**: the marker mirrors `GrantPotentCantrip`; the override rides the existing `effectiveDamageType` precedence chain (alongside Shillelagh's type override) and the off-hand damage payload.
- **SRD-faithful**: the 2024 Force-damage choice, opt-in per strike, applies to all unarmed-strike paths (Attack / Flurry / off-hand); the obsolete 2014 marker is removed from the monk.
- **Effect-driven**: no hardcoded subclass/level check in the attack path — the feature carries the marker and the choice is an opt-in consumer intent, so default behavior is byte-identical.
