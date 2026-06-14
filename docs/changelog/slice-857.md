# Slice 857 — Graze (and the weapon-mastery save DC) read effective STR, not base

**Type:** Engine fix (no content). Closes the [L7 audit](../l7-completion-audit.md) Area-6 quirk `graze-hardcodes-str`, plus its pattern-check sibling (`masterySaveDC`).

## The divergence

RAW (Graze weapon mastery): "the target takes damage equal to **the ability modifier you used** to make the attack." The engine computed it from the **raw snapshot** Strength:

```ts
const grazeAmount = Math.max(0, abilityModifier(attacker.abilityScores.STR));
```

So a Greatsword wielder with **Gauntlets of Ogre Power** (which set STR to 19) dealt Graze damage from their *unmodified* score, not the boosted 19 — under-counting by up to the full item bonus. Any effect-stack ability lift (Gauntlets / Belt of Giant Strength's floor, a post-snapshot background ASI) was ignored.

## The fix

A shared `effectiveStrMod(attacker, state, content)` helper reads the **effective** Strength modifier — `effectiveAbilityScore(base, floor, increase)` over the effect stack's `effectiveAbilityScoreFloor` / `effectiveAbilityScoreIncrease`, exactly the derivation the attack planner uses for to-hit and damage. Graze now calls it instead of the raw score.

## Pattern-check

`masterySaveDC` (the weapon-mastery save DC, `8 + PB + STR mod`, used by **Topple**) had the *identical* base-STR bug — it too hardcoded `abilityModifier(character.abilityScores.STR)`. It's the only sibling (Topple is the only save-bearing mastery, and Graze the only damage one), so it's fixed in the **same slice**: `masterySaveDC` now takes the attacker + state + content and uses `effectiveStrMod`. So Gauntlets of Ogre Power raise a STR-8 wielder's Topple DC from 10 to 15.

Every in-scope Graze weapon (Greatsword) is Heavy / non-Finesse, so the ability used is always STR — the helper reads STR directly rather than re-deriving STR-vs-DEX.

## What shipped

New 3-test `tests/unit/engine/slice-857-graze-effective-str.test.ts`: a STR-8 Greatsword wielder with Gauntlets of Ogre Power (effective STR 19) deals **4** Graze damage (not 0 from base −1); the same wielder *without* the Gauntlets deals no Graze damage (base −1 clamps to 0, no `DamageApplied`); and the Topple save DC reads effective STR too — Gauntlets raise it **10 → 15**. The s23-weapon-mastery golden and the slice-380 / 502 / 624 / 626 / 853 mastery tests stay green (their attackers have base STR = effective STR — no floor items — so both Graze and the DC are byte-identical).

## Verification

`npx tsc --noEmit` clean; new 3-test slice-857 green; the weapon-mastery golden + mastery unit tests unchanged. No content / condition / coverage-snapshot change. `npm run test:fast` + doc audits green.
