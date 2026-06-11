# Slice 810 — multiclass ability prerequisites (`validateMulticlass`)

**Type:** Schema field + consumer validator. **Closes** the [L7 audit](../l7-completion-audit.md) Area 5 divergence `multiclass-prereqs`.

## The gap

Nothing enforced the 13+ ability prerequisite for multiclassing — an INT 8 character could carry a Wizard level. RAW (character-creation.md "Multiclassing"): *"To qualify for a new class, you must have a score of at least 13 in the primary ability of the new class and your current classes."*

## Why a validator (not a planner gate)

Multiclass **entry** is snapshot-only: `planLevelUp` (and its reducer) only advance an *existing* enrollment — there is no "enter a new class" planner. A consumer hands the engine a multiclass character via the `CharacterCreated` snapshot. So, exactly as with `validateBackgroundAbilityIncrease` (slice 793), the engine provides the **validation** and the consumer's chargen / level-up UI enforces it; the engine can't gate a snapshot it didn't transact.

## The fix

- The prereq abilities are the class's existing `primaryAbility` array (the pack authors it to match the SRD "Primary Ability" line — Fighter `[STR, DEX]`, Paladin `[STR, CHA]`, Monk/Ranger `[DEX, WIS]`, singles for the rest).
- New `Class.multiclassAbilityMode` (`'any' | 'all'`, default `'all'`) resolves the or/and: the SRD phrases Fighter as "Strength **or** Dexterity" (`any`), and Monk/Paladin/Ranger as "X **and** Y" (`all`). Only Fighter overrides the default; single-ability classes are unaffected (any ≡ all of one).
- New exported **`validateMulticlass(character, content, options?)`** — returns one human-readable issue per class whose multiclass prereq the character doesn't meet (empty = valid; a single-classed character isn't multiclassing). Uses the **effective** ability score (an `options` bag accepts `itemInstances` / `pendingChoices` so a pre-multiclass STR ASI counts). `MULTICLASS_MIN_ABILITY = 13` exported too.

## Tests

`tests/unit/derive/slice-810-multiclass-prereqs.test.ts` (5): a single-classed character yields no issues; a valid Fighter/Wizard (STR 15, INT 14) passes; an under-stat one reports the unmet class; Fighter's "or" is satisfied by DEX 14 / STR 8; and Paladin's "and" fails on STR 14 / CHA 8 but passes on STR 14 / CHA 14. Exports snapshot: +`validateMulticlass`, +`MULTICLASS_MIN_ABILITY`.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (593 files, 4547 passed).
