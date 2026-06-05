# Slice 648 — engine + schema: Monk L3 Deflect Attacks planner (reduction arm)

**Type:** Engine primitive + event schema addition + canonical user.

Closes the third and final of slice 645's L3 planner xfails. **All four L3 planner xfails are now wired** (slices 646-648); the only remaining items on the L3 punch list are the 4 non-planner content stubs from slice 645's Section 4 (slice 649) and the L3 hardening cycle (slice 650+).

RAW (SRD 5.2.1 Monk L3): "When an attack roll hits you and its damage includes Bludgeoning, Piercing, or Slashing damage, you can take a Reaction to reduce the attack's total damage against you. The reduction equals 1d10 plus your Dexterity modifier and Monk level."

The optional counter arm (RAW: "If you reduce the damage to 0, you can expend 1 Focus Point to redirect some of the attack's force ... DEX save ... 2× Martial Arts die + DEX mod") is **deferred to a follow-up slice**. The core reduction arm is what closes the L3 floor xfail; the counter arm needs additional engine work (Focus Point spend gate + DEX save against a counter target + Martial Arts die rolling + counter damage application).

## Scope decisions

| Arm | This slice | Deferred to |
|---|---|---|
| Gate (Monk L3+, reaction available, damage type B/P/S) | ✓ | — |
| Reduction roll (1d10 + DEX + monk level) | ✓ | — |
| `DeflectAttacksUsed` marker event for transcripts + audit | ✓ | — |
| `ActionEconomyConsumed { reaction }` emission | ✓ | — |
| Outcome-returning `DeflectAttacksOutcome` for consumer chain | ✓ | — |
| Counter arm (Focus Point + DEX save + 2× MA die damage) | — | Follow-up |
| Damage-pipeline auto-integration (reduce a pending DamageApplied automatically) | — | Follow-up |

## Files

### Schema + reducer (new marker event)

- **[../../src/schemas/events/action-economy.ts](../../src/schemas/events/action-economy.ts)**: new `DeflectAttacksUsedEventSchema` + type. Required fields: `encounterId`, `combatantId`, `triggeringAttackEventId`, `reduction`, `incomingDamage`, `remainingDamage`.
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: five touchpoints per event.
- **[../../src/engine/reducers/action-economy.ts](../../src/engine/reducers/action-economy.ts)**: `applyDeflectAttacksUsed` is a no-op reducer that validates the event shape. The reaction-used flag is set by the paired `ActionEconomyConsumed { reaction }` event.
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: import + dispatch case.
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: format case.

### Planner + wiring

- **[../../src/engine/plan/deflect-attacks.ts](../../src/engine/plan/deflect-attacks.ts)** (new): planner + `DeflectAttacksIntent` + `DeflectAttacksOutcome`. Gates on Monk L3+, B/P/S damage type, and (in-encounter) reaction-available. Rolls 1d10, computes `reduction = 1d10 + DEX mod + monkLevel`, returns `{ events, reduction, remainingDamage = max(0, incomingDamage - reduction) }`. The consumer integrates the reduction with their pending damage (the engine's damage pipeline doesn't yet auto-integrate; that's a future engine slice).
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export `planDeflectAttacks`, `DeflectAttacksIntent`, `DeflectAttacksOutcome`.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: `engine.plan.deflectAttacks` returns `DeflectAttacksOutcome` (matches the outcome-returning shape of `cuttingWords` / `peerlessSkill` / `shield`).
- **[../../tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts)**: added `deflectAttacks` to `EXCLUDED_FROM_DISPATCH` (reaction-style planner that returns a derived outcome the consumer branches on; mirror of `cuttingWords`).

### Tests + audit flip

- **[../../tests/unit/engine/slice-648-deflect-attacks.test.ts](../../tests/unit/engine/slice-648-deflect-attacks.test.ts)** (new): 4 tests
  - reduction math at L3 DEX 16: `[7, 16]` band (1d10 + 3 + 3)
  - `remainingDamage` math clamps at 0 for low damage; preserves positive remainder for high damage (incomingDamage=50)
  - emits `ActionEconomyConsumed { reaction } + DeflectAttacksUsed` with matching fields
  - gating rejects: non-monk / under-L3 / non-B/P/S damage / reaction-used.
- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**: flipped `planDeflectAttacks` from xfail to wired. **L3 floor planner xfail count drops 1 → 0**; only the 7 content-stub pins remain.

## Tests

- `npx vitest run tests/unit/engine/slice-648-deflect-attacks.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/{srd-l3-complete,planner-wiring,pack-integrity}.test.ts`: 60/60 pass (pack-integrity caught the `'martial-arts'` substring in a comment, same lesson from slice 636; rewrote to "Martial Arts die" without hyphen).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive.** Consumers who invoke `engine.plan.deflectAttacks` now consume one d10 per call. No existing path calls it.

**No breaking change.** New event type added with mandatory fields; old campaigns that never logged it replay unchanged.

The empty-content stub pin in slice 645's L3 floor still asserts `monk / deflect-attacks` ships `effects: []` — wiring is via the planner. Stub pin stays green.

## Audit (Uncle Bob)

- **Names**: `planDeflectAttacks`, `DeflectAttacksIntent`, `DeflectAttacksOutcome`, `DeflectAttacksUsed`, `DEFLECTABLE_DAMAGE_TYPES`, `DEFLECT_ATTACKS_DIE`, `DEFLECT_ATTACKS_LEVEL`. The Outcome includes `reduction` and `remainingDamage` (no abbreviations).
- **DRY**: reaction-gate pattern matches the existing `reactionUsedThisRound` reads in `cuttingWords` / `reactive-spells` / `falling`. Outcome-returning shape matches the `cuttingWords` / `peerlessSkill` / `shield` family. The DEX modifier read uses the same `effectiveAbilityScore` + `abilityModifier` path the rest of the engine uses (honors feat-granted floors).
- **SRP**: the planner does one thing (gate + reduce). The counter arm and damage-pipeline auto-integration are deliberately scoped out to keep this slice reviewable; each is a meaningful primitive on its own.
- **Magic numbers / strings**: every literal is a named constant. `DEFLECTABLE_DAMAGE_TYPES` is `as const` and the type derives from it.
- **Pattern-check**: searched for other "consumer integrates a derived value with their pending damage" planners. `planShield` is closest (consumer recomputes hit/miss after the boost). `planCuttingWords` similarly returns `turnedSuccess` for the consumer to decide. The pattern is well-established; this slice slots in. ALSO caught the `'martial-arts'` substring trip from slice 636's lesson; same fix (use "Martial Arts die" without hyphen in comments). Added `deflectAttacks` to the planner-wiring allowlist same-slice (lesson from slice 634).

## Open follow-ups

L3-complete punch list now stands at **0 planner xfails remaining**:

- ~~`planSteadyAim`~~ — landed (slice 646).
- ~~`planFastHands`~~ — landed (slice 647).
- ~~`planDeflectAttacks`~~ — landed (this slice).

Plus 7 content-stub pins from slice 645's Section 4. Three are "intentionally effects:[]" because the planner is the wiring (steady-aim, fast-hands, deflect-attacks). The other four still need content work:
- **649a**: barbarian / primal-knowledge — OfferChoice over rogue skill list.
- **649b**: circle-of-the-land / circle-of-the-land-cantrip — OfferChoice over druid cantrip list.
- **649c**: circle-of-the-land / circle-of-the-land-spells — OfferChoice over land type + per-land GrantSpell.
- **649d**: hunter / hunters-lore — wire-as-narrative OR convert to a real check planner.

Deferred Deflect Attacks engine work (separate slice when needed):
- **Counter arm**: spend 1 Focus Point on a `remainingDamage === 0` deflection to redirect 2× Martial Arts die + DEX mod to a target. Adds: Focus Point spend gate, range constraints (5 ft melee / 60 ft ranged + Total Cover gate), DEX save against the counter target, Martial Arts die rolling, counter damage application.
- **Damage-pipeline auto-integration**: today the consumer manually subtracts the reduction from a pending DamageApplied. A future engine slice could integrate the reduction directly into the damage pipeline (similar to `interceptFatalDamage`), so the consumer just invokes `deflectAttacks` and the resulting `DamageApplied` is automatically smaller. Out of scope here.
