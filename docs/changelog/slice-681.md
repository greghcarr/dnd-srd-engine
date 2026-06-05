# Slice 681 — engine: Slow's max-one-attack cap

**Type:** Reducer-side gate. **Fifth slice of the strict-RAW completeness cycle (677-682).**

RAW Slow: "the target can make only one melee or ranged attack on its turn." Pre-681 the engine allowed slowed combatants to Extra Attack normally (Fighter L5+, Barbarian L5+, etc.). Slice 681 caps it.

## What's wired

`applyActionEconomyConsumed` `case 'attack'`: new invariant — when the combatant is slowed AND `attacksMadeThisTurn >= 1`, throws. Non-slowed combatants are unaffected.

## Files

- **[../../src/engine/reducers/action-economy.ts](../../src/engine/reducers/action-economy.ts)**: invariant added to `case 'attack'` reusing slice 680's `isSlowedBySpell` helper.
- **[../../tests/unit/engine/slice-681-slow-attack-cap.test.ts](../../tests/unit/engine/slice-681-slow-attack-cap.test.ts)** (new): 2 tests (slowed → first OK, second throws; non-slowed Fighter L5+ Extra Attack baseline preserved).
- **[../../tests/unit/engine/slice-680-slow-action-economy.test.ts](../../tests/unit/engine/slice-680-slow-action-economy.test.ts)**: added missing `modifier` field on `InitiativeRolledEvent.rolls[]` entries (typecheck nit surfaced during slice 681).

## Tests

- `npx vitest run tests/unit/engine/slice-681-slow-attack-cap.test.ts`: 2/2 pass.

## Verification

- `npx tsc --noEmit`: clean.

## Open follow-ups

- ~~677-680~~: Strict-RAW cycle slices 1-4. Landed.
- ~~681 (this slice)~~: Slow's max-one-attack cap. Landed.
- **682**: Slow's spellcasting 50% V/S/M failure gate.
