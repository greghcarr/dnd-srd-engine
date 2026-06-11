# Slice 809 — L4 feat-menu eligibility filter

**Type:** Schema field + content + planner filter. **Closes** the [L7 audit](../l7-completion-audit.md) Area 5 divergence `l4-feat-menu-eligibility` (the prerequisite-filter arm); the Fighting-Style-injection arm is split out as a tracked quirk.

## The gap

The L4 ability-score-improvement choice offered a static `{ASI, Grappler}` to every character, ignoring Grappler's prerequisite. RAW: the improvement offers *"an Ability Score Improvement or a feat for which you qualify."* A character with STR 8 / DEX 8 was wrongly offered Grappler (Strength **or** Dexterity 13+).

The blocker to fixing it: feat `prerequisites` is a free-text `string[]` (display-only), not machine-checkable.

## The fix

- **New `Feat.abilityPrerequisite`** — a structured `{ abilities: AbilityScore[], min: number }` (the machine-checkable form; the free-text array stays for display). A character qualifies when **any** listed ability's *effective* score meets `min`. Authored on Grappler: `{ abilities: ['STR', 'DEX'], min: 13 }`. Reusable for any prereq'd feat (and a building block for the deferred `multiclass-prereqs`).
- **`planLevelUp` eligibility filter** — when emitting a feat-choice's `ChoiceRequired`, each option whose `GrantFeat` references a feat with an unmet `abilityPrerequisite` is dropped (effective scores via the bearer's effect stack, so a Gauntlets-of-Ogre-Power STR boost counts). The level prereq is satisfied by reaching the choice; non-feat options (the ASI) are always kept.

## Arm 2 deferred (now a tracked quirk)

The row's second arm — offering **Fighting Style feats** at the L4 general-feat slot to classes that have the Fighting Style feature — needs feature-detection + "can't take the same Fighting Style twice" de-dup that the content doesn't model. Split out as the new `l4-menu-no-fighting-style-feats` quirk. It's a *missing option* (a lesser concern), not the *wrong outcome* (offering an ineligible feat) this slice fixed.

## Tests

`tests/unit/engine/slice-809-feat-menu-eligibility.test.ts` (4): Grappler carries the structured prereq; a STR 16 Fighter is still offered Grappler; a STR 10 / DEX 10 Fighter is **not** (ASI remains); and the "or" semantics hold (DEX 14 / STR 8 qualifies).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (592 files, 4542 passed) — no level-up test relied on an ineligible-feat offer.
