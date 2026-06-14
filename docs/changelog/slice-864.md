# Slice 864 — `validateAttunement` (attunement preconditions)

**Type:** Engine derive (additive consumer-validator, no behavior change). Closes the [L7 audit](../l7-completion-audit.md) Area-6 quirk `attune-prereq-not-validated`.

## The divergence

`applyItemAttuned` (the reducer) gates the 3-slot limit and double-attunement, but it is **content-less** — it can't read the item definition, so it never checks whether an item even **requires attunement**, nor its **restriction** (`attunementCondition`). So any character could attune a non-attunement item (wasting one of their three slots) or a class/species-locked item.

Attunement entry is **consumer-committed** — there's no `planAttune` planner that could throw; the consumer commits an `ItemAttuned` event directly. So the engine can't gate it at transaction time.

## The fix

The **consumer-validator** pattern (as with `validateMulticlass`, slice 810, and `validateBackgroundAbilityIncrease`, slice 793): a new derive the consumer's UI runs *before* committing the event —

```ts
validateAttunement(character, instance, content): AttunementValidation
// { issues: string[]; unverifiedCondition?: string }
```

- **`issues`** — the machine-checkable blockers: the item doesn't `requiresAttunement`, the instance is already attuned, or the character is at the 3-slot limit. Empty ⇒ the engine sees no blocker.
- **`unverifiedCondition`** — the item's free-form `attunementCondition` ("Dwarf or a creature attuned to a Belt of Dwarvenkind", "by a Spellcaster"). It's prose, not a predicate, so the engine **can't** verify it — it's returned for the consumer / DM to confirm. (Surfacing it, rather than guessing a class/species match and risking false positives, is the honest engine boundary — the same reason the SRD writes these as DM-adjudicated text.)

## What shipped

New 5-test `tests/unit/derive/slice-864-validate-attunement.test.ts`: an unrestricted attunement item (Gauntlets of Ogre Power) is attunable (no issues, no condition); a restricted item (Dwarven Thrower) passes the engine-checkable rules but returns its `unverifiedCondition`; a non-attunement item (a dagger) is rejected; an already-attuned instance is rejected; and a 4th item is rejected when the 3-slot limit is full. Exported `validateAttunement` + `MAX_ATTUNED_ITEMS` + the `AttunementValidation` type from `src/index.ts` (and the `derive` barrel); the exports snapshot gains all three (additive). Documented next to the other validators in `api-overview.md`.

## Verification

`npx tsc --noEmit` clean; new 5-test slice-864 green; exports snapshot regenerated (additive). No content / reducer / behavior change to any existing surface — the reducer's existing slot/double-attunement guards are untouched. `npm run test:fast` (642 files, 4819 passed) + doc audits green.
