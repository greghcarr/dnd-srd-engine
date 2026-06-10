# Slice 801 — distinct picks on multi-select choices (ASI back-door)

**Type:** Engine validation. **Closes** the [L7 audit](../l7-completion-audit.md) Area 5 divergence `asi-distinctness`.

## The gap

The Ability Score Improvement feat models its two RAW modes as nested choices: `plus-2-one` → `asi-plus2-ability` (oneOf:1, pick one ability for +2), and `plus-1-two` → `asi-plus1-abilities` (**oneOf:2**, pick two abilities for +1 each). The generic choice gate validated the selection *count* and *membership* but not **distinctness** — so `asi-plus1-abilities` accepted `['str', 'str']` and the two `IncreaseAbilityScore` effects stacked into +2 to one ability: the illegal back-door to a +2 the separate `asi-plus2-ability` choice exists for. The same hole let Skilled (3 skills), Magic Initiate, and any `oneOf:N` menu take a duplicate.

## The fix

A distinctness check in **both** halves of the generic choice path — `planResolveChoice` (`src/engine/plan/level-up.ts`, the throw-on-invalid gate) and `applyChoiceResolved` (`src/engine/reducers/level-up.ts`, the replay-side invariant), right after the existing count + membership checks: the selected option ids must be unique (`new Set(ids).size === ids.length`). One fix covers every multi-select choice; single-select (`oneOf:1`) choices — including the +2-to-one ASI path — are unaffected (a 1-element list is trivially distinct).

## Tests

`tests/unit/engine/slice-801-asi-distinctness.test.ts` (3): driving the real L3→4 Fighter level-up cascade to the `asi-plus1-abilities` picker, `['str','str']` is rejected (`/distinct/`); `['str','dex']` succeeds and projects +1 STR / +1 DEX through the effect stack; and the +2-to-one path (oneOf:1 → `str`) still applies +2 STR, confirming the gate didn't touch single-select.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (583 files, 4507 passed) — no existing choice resolution relied on a duplicate pick.
