# Slice 855 — Grapple / Shove saves go through the full derivation (closes the pattern)

**Type:** Engine fix + golden regen (no content). **Closes** the [L7 audit](../l7-completion-audit.md) Area-4 row `hand-rolled-saves-bypass-stack` — the third and last arm of the raw-mod-save-bypass pattern (after 853 Topple / 854 Open Hand).

## The divergence

The 2024 Grapple and Shove (options of the Unarmed Strike) resolve on a target STR-or-DEX saving throw vs the attacker's unarmed DC. Both `planGrapple` and `planShove` in `contested.ts` hand-rolled that save:

```ts
const bonus = abilityModifier(target.abilityScores[ability]);  // grapple
const bonus = abilityModifier(target.abilityScores.STR);       // shove
```

Raw ability modifiers — no `computeSavingThrow`. So the saves skipped save **proficiency** (a Fighter resisting a grapple with only its raw STR mod), Bless/Bane and other bonus dice, advantage/disadvantage, Magic Resistance, and the auto-fail.

## The fix

Both saves now route through the shared `rollSaveAgainstDC` primitive — the same one slice 853 (Topple) and 854 (Open Hand) adopted:

```ts
const saveResult = rollSaveAgainstDC({
  state, content, targetId: intent.targetId, ability, dc, sourceIsMagical: false, rng, at,
});
```

`sourceIsMagical: false` — an Unarmed Strike is a nonmagical effect, so Magic Resistance grants no Advantage. The hand-rolled Halfling Luck (slice 543) folds into the primitive.

Import cleanup is careful here: `contested.ts` has a **third** roll — `planHide`'s DEX (Stealth) **ability check**, which already uses `computeAbilityCheck` and shares `rollDie` / `D20_SIDES` / `applyHalflingLuckFromFlag`. So only `applyHalflingLuckForCharacter` and the `SaveRolledEvent` type are removed (both now unused); `rollDie`, `D20_SIDES`, `applyHalflingLuckFromFlag`, `abilityModifier`, and `AbilityCheckRolledEvent` stay (Hide / `unarmedSaveDC` still use them).

## Golden regen

The `s21-contested` golden moved — and the diff is exactly the intended fix. Its two grapple/shove victims, "Goblin Boss" and "Goblin Cutter", are built via `buildFighter`, and Fighters **are** proficient in STR saves:

- Goblin Boss STR save: `d20(2) + 1` → `d20(2) + 3 (+1 STR-mod, +2 proficiency)`;
- Goblin Cutter STR save: `d20(6) + -1` → `d20(6) + 1 (-1 STR-mod, +2 proficiency)`.

Both still **fail** vs DC 15, so the grapple/shove outcomes are unchanged — only the (now-correct) save math + the inline breakdown changed. Regenerated and inspected. The `s15-conditions` / `showcase` goldens and the slice-803 gate tests stay green (their contested targets are non-proficient).

## What shipped

New 3-test `tests/unit/engine/slice-855-contested-save-effect-stack.test.ts`: the Grapple save carries a `computeSavingThrow` breakdown; a STR-save-proficient Fighter target adds proficiency to both the Grapple and the Shove save (bonus +4) vs an otherwise-identical non-proficient Wizard target (+2) — the pre-855 raw roll gave both +2.

This closes `hand-rolled-saves-bypass-stack` and the whole raw-mod-save-bypass pattern (Topple → Open Hand → Grapple/Shove).

## Verification

`npx tsc --noEmit` clean; new 3-test slice-855 green; `s21-contested` regenerated (legitimate proficiency fix, outcomes unchanged); slice-803 + s15/showcase goldens unchanged. No content/condition/coverage-snapshot change. `npm run test:fast` + doc audits green.
