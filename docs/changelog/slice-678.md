# Slice 678 — engine + content: `HalvesStrengthWeaponDamage` primitive (enfeebled enforcement)

**Type:** Engine schema + planAttack + content. **Second slice of the strict-RAW completeness cycle (677-682).**

Pre-678, `enfeebled` (applied by Ray of Enfeeblement) was a marker the consumer had to manually interpret — the engine didn't enforce "deals only half damage with weapon attacks that use Strength." Slice 678 ships a marker effect the engine reads at attack-damage time.

## What's wired

- New `HalvesStrengthWeaponDamage` marker effect (62 primitives total).
- New `EffectAccumulator` flag + `markHalvesStrengthWeaponDamage` / `hasHalvesStrengthWeaponDamage` methods.
- `planAttack` damage computation: after `rawDamageTotal` is computed, if `attackerEffects.hasHalvesStrengthWeaponDamage() && damageAbility === 'STR'`, halve the base weapon damage (`Math.floor`).
- Riders (sneak attack, smite, on-hit dice, fires-burn, frosts-chill) pass through UNHALVED per the RAW reading "the weapon's damage line."
- Content: `enfeebled` condition projects `HalvesStrengthWeaponDamage`.

## Scope decisions

- **Marker, not a generic `HalvesDamageOfKind`**: today there's exactly one user (enfeebled). The marker shape matches the existing `GrantHalflingLuck` / `GrantEvasion` / `GrantPotentCantrip` family. If a second damage-halving condition arrives (e.g., a future "DEX-attacks halved" condition), the marker can generalize to `HalvesDamageWhen { ability }` cleanly.
- **Halves base weapon damage only, not riders**: RAW reading "the target deals only half damage with weapon attacks that use Strength" — the weapon's damage line is the natural reading. Sneak Attack / Smite / on-hit rider damages are bonus damage from the rider, not the weapon's line. Easier engineering and defensible RAW interpretation.
- **`damageAbility === 'STR'` check**: matches `chooseDamageAbility` precisely. Finesse weapons (where DEX is used) are unaffected; greatsword/maul/etc. (pure STR) are affected.
- **Floor rounding**: standard halving convention (RAW "half damage" rounds down).

## Files

- **[../../src/schemas/effects.ts](../../src/schemas/effects.ts)**: new `HalvesStrengthWeaponDamage` discriminated-union arm + Zod schema + ALL_EFFECT_KINDS entry.
- **[../../src/effects/builder.ts](../../src/effects/builder.ts)**: new accumulator flag + `markHalvesStrengthWeaponDamage` / `hasHalvesStrengthWeaponDamage` methods + builder dispatch case.
- **[../../src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)**: rawDamageTotal computed; halving applied when flag is set AND damageAbility === STR.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: `enfeebled` condition gets the projection.
- **[../../tests/unit/engine/slice-678-enfeebled-half-str.test.ts](../../tests/unit/engine/slice-678-enfeebled-half-str.test.ts)** (new): 3 tests (effect-projection check, STR-weapon halving via same-seed comparison, DEX-weapon unaffected).
- **README.md / status.md / concepts.md / authoring-content-packs.md**: primitive count 61 → 62.

## Tests

- `npx vitest run tests/unit/engine/slice-678-enfeebled-half-str.test.ts`: 3/3 pass.
- `npx vitest run tests/audit/doc-counts.test.ts tests/audit/pack-integrity.test.ts`: 43/43 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Additive primitive + behavior change for enfeebled attackers**: pre-678 enfeebled was a consumer-managed marker (the engine emitted full damage events). Post-678 the engine halves base weapon damage on STR-attacks for enfeebled creatures. Any consumer that was manually halving in their UI should stop — the engine handles it.

## Audit (Uncle Bob)

- **Names**: `HalvesStrengthWeaponDamage` is unambiguous — names exactly what it does.
- **DRY**: matches `GrantHalflingLuck` / `GrantPotentCantrip` marker pattern. No new helper extracted.
- **SRP**: schema declares; accumulator stores the flag; planner applies the halving at exactly one site (line 1406 of planAttack).
- **Magic numbers**: 2 (the divisor) is inline — halving is the named operation.
- **Pattern-check**: searched for other damage-halving conditions/effects: Resistance halves all damage of a type (different shape — already wired via `GrantResistance`). Evasion halves DEX-save damage on success (different mechanic — wired via `GrantEvasion`). HalvesStrengthWeaponDamage is the unique attacker-side halving today.

## Open follow-ups

Strict-RAW completeness cycle (slice 678 of 6):

- ~~677~~: recurring-save spell-ends arms. Landed.
- ~~678 (this slice)~~: HalvesStrengthWeaponDamage primitive. Landed.
- **679**: Death-save advantage threading (Beacon of Hope arm).
- **680**: Slow's no-reactions + action-OR-bonus restrictions.
- **681**: Slow's max-one-attack cap.
- **682**: Slow's spellcasting 50% V/S/M failure gate.
