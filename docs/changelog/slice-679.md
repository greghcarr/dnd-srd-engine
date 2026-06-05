# Slice 679 — engine + content: `GrantDeathSaveAdvantage` (Beacon of Hope arm)

**Type:** Engine schema + planner threading + content. **Third slice of the strict-RAW completeness cycle (677-682).**

Pre-679, `beacon-of-hope-active` projected the WIS-save advantage arm + the max-healing arm via existing primitives, but the **Death-save advantage** arm of RAW Beacon of Hope was consumer-managed: `planDeathSaveAtTurnStart` rolled a single d20 without consulting the bearer's effect stack. Slice 679 closes the gap.

## What's wired

- New `GrantDeathSaveAdvantage` marker effect (63 primitives total).
- New `EffectAccumulator` flag + `markDeathSaveAdvantage` / `hasDeathSaveAdvantage` methods.
- `planDeathSaveAtTurnStart` builds the bearer's effect stack and, when the marker is set, rolls 2d20 + takes the max (RAW advantage). Halfling Luck reroll-on-nat-1 still composes on top (the chosen d20 is checked AFTER the max-pick).
- Content: `beacon-of-hope-active` projects `GrantDeathSaveAdvantage`.

## Scope decisions

- **Marker, not RollTarget extension**: extending `RollTarget` with a `deathSave` kind would require touching every `SetAdvantage` consumer + the predicate framework. A single marker is simpler and matches the existing pattern for "this thing is checked at one specific roll site."
- **Rolls array preserved**: `applyHalflingLuckForCharacter` reads + appends to `rolls`. With advantage, we push both initial dice; with Halfling Luck reroll on a nat-1, that's appended too. The `chosen` d20 is what enters the event.
- **No SetAdvantage union variant**: keep advantage routing for death saves to the marker; it's the single use case today. If a second source ever arrives (a feat, a magic item), they all project the same marker.

## Files

- **[../../src/schemas/effects.ts](../../src/schemas/effects.ts)**: new `GrantDeathSaveAdvantage` arm + Zod schema + ALL_EFFECT_KINDS entry.
- **[../../src/effects/builder.ts](../../src/effects/builder.ts)**: new accumulator flag + mark/has methods + builder dispatch case.
- **[../../src/engine/plan/encounter.ts](../../src/engine/plan/encounter.ts)**: `planDeathSaveAtTurnStart` consults the bearer's effect stack; advantage → 2d20 max.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: `beacon-of-hope-active` projects the marker.
- **[../../tests/unit/engine/slice-679-death-save-advantage.test.ts](../../tests/unit/engine/slice-679-death-save-advantage.test.ts)** (new): 3 tests (condition projection + EffectAccumulator pickup + math sanity for max-of-2d20 vs single d20).
- **README.md / status.md / concepts.md / authoring-content-packs.md**: primitive count 62 → 63.

## Tests

- `npx vitest run tests/unit/engine/slice-679-death-save-advantage.test.ts`: 3/3 pass.
- `npx vitest run tests/audit/doc-counts.test.ts tests/audit/pack-integrity.test.ts`: 43/43 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Additive primitive + behavior change for death saves under Beacon of Hope**: pre-679 a 0-HP creature with beacon-of-hope-active rolled a single d20. Post-679 they roll 2d20 and take the max. **This changes RNG-stream consumption when a benefited death save is rolled** (one extra d20 pull). Consumers replaying transcripts that include death saves under Beacon of Hope will see different d20 outcomes; this is the RAW-correct behavior.

## Audit (Uncle Bob)

- **Names**: `GrantDeathSaveAdvantage` matches the `Grant*Advantage*` naming pattern.
- **DRY**: marker pattern matches the existing `GrantHalflingLuck` / `HalvesStrengthWeaponDamage` family.
- **SRP**: schema declares; accumulator stores; planner applies the advantage roll at exactly one site.
- **Magic numbers**: none added.
- **Pattern-check**: searched for other RAW death-save modifiers: Aid (HP-floor for stable), Heal/Revivify (consumer-driven). None project an advantage marker today. Beacon of Hope is unique at this point.

## Open follow-ups

Strict-RAW completeness cycle (slice 679 of 6):

- ~~677-678~~: recurring-save spell-ends + HalvesStrengthWeaponDamage. Landed.
- ~~679 (this slice)~~: Death-save advantage threading. Landed.
- **680**: Slow's no-reactions + action-OR-bonus restrictions.
- **681**: Slow's max-one-attack cap.
- **682**: Slow's spellcasting 50% V/S/M failure gate.
