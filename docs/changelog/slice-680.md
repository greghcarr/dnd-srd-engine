# Slice 680 — engine: Slow's no-reactions + action-OR-bonus restrictions

**Type:** Reducer-side gate. **Fourth slice of the strict-RAW completeness cycle (677-682).**

Pre-680 the Slow spell's `slowed-by-spell-active` projected `ModifySpeed walk *0.5` + AC -2 + DEX-save -2 (slice 670), but the RAW arms "the target can take only one Action or one Bonus Action on a turn, not both" + "it can't take Reactions" were consumer-managed. Slice 680 enforces both arms in the `applyActionEconomyConsumed` reducer.

## What's wired

`applyActionEconomyConsumed` checks the combatant for the `slowed-by-spell-active` condition and enforces:
- **Reactions blocked**: any `ActionEconomyConsumed { kind: 'reaction' }` against a slowed combatant throws.
- **One-action-OR-bonus**: a slowed combatant who has already used their Action throws on a subsequent Bonus Action consume; same vice versa.

Non-slowed combatants are unaffected (existing baseline behavior preserved).

## Scope decisions

- **Hardcoded condition id, not a generic primitive**: Slow is the only RAW user today. The bare condition-id check (`'slowed-by-spell-active'`) lives in one file (the reducer). When a second user arrives, lift to a `BlocksReactions` / `RestrictsToOneActionOrBonus` marker pair.
- **Gate at reducer, not planner**: every reaction planner already checks `reactionUsedThisRound` (5+ sites). Adding a separate "check for slowed marker" call at each would be 5+ edits. The reducer gate catches every reaction consume in one place via the same `invariant` helper.
- **Throws on commit, not on plan**: the planner can attempt the consume; the reducer's invariant throw on `commit()` is what surfaces the error. This is the standard pattern for action-economy gates (e.g., `'Reaction already used this round'` already throws here pre-680).
- **Other Slow RAW arms separate**: max-one-attack (slice 681) and spellcasting 50% V/S/M (slice 682) ship in their own slices.

## Files

- **[../../src/engine/reducers/action-economy.ts](../../src/engine/reducers/action-economy.ts)**: new helper `isSlowedBySpell`; 3 new invariant checks in `applyActionEconomyConsumed`.
- **[../../tests/unit/engine/slice-680-slow-action-economy.test.ts](../../tests/unit/engine/slice-680-slow-action-economy.test.ts)** (new): 5 tests
  - Reaction throws.
  - Action-then-bonus throws on bonus.
  - Bonus-then-action throws on action.
  - Action alone OK; bonus alone OK.
  - Non-slowed baseline: action + bonus + reaction all OK.

## Tests

- `npx vitest run tests/unit/engine/slice-680-slow-action-economy.test.ts`: 5/5 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Behavior change for slowed combatants only.** Pre-680 a slowed combatant could spam reactions, do action+bonus on the same turn — all consumer-managed. Post-680 the engine refuses. Any consumer that was manually enforcing these arms can stop.

## Audit (Uncle Bob)

- **Names**: `isSlowedBySpell`, `SLOWED_BY_SPELL_CONDITION_ID` — explicit about the specific condition.
- **DRY**: single helper used by 3 invariant checks; the 3 checks share the same pattern.
- **SRP**: reducer's invariants are the gate; planners stay unchanged. No need to thread effect-stack access through planners.
- **Magic numbers/strings**: condition id is a named constant.
- **Pattern-check**: scanned for other "this condition restricts action economy" cases. `power-word-stunned-active` and `held-paralyzed-active` use `ACTION_BLOCKING_CONDITIONS` (a different mechanism — blocks all actions). Slow is the unique "partial" restriction case.

## Open follow-ups

Strict-RAW completeness cycle (slice 680 of 6):

- ~~677-679~~: recurring-save + HalvesStrengthWeaponDamage + GrantDeathSaveAdvantage. Landed.
- ~~680 (this slice)~~: Slow's no-reactions + action-OR-bonus. Landed.
- **681**: Slow's max-one-attack cap.
- **682**: Slow's spellcasting 50% V/S/M failure gate.
