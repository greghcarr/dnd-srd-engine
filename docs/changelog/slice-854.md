# Slice 854 — Open Hand Technique's save goes through the full derivation

**Type:** Engine fix (no content). Advances the [L7 audit](../l7-completion-audit.md) Area-4 row `hand-rolled-saves-bypass-stack` (the Open Hand Technique arm); the Grapple/Shove arm stays tracked.

## The divergence

The pattern-check on slice 853 (Topple) found two siblings of the same raw-mod-save bypass. This slice fixes the cleaner one: the Monk's **Open Hand Technique** (a Flurry of Blows hit may impose Push or Topple, each on a save vs the Monk's Ki DC). Its `rollSave` helper in `open-hand-technique.ts` hand-rolled the target's STR/DEX save:

```ts
const bonus = abilityModifier(target.abilityScores[ability]);
```

A raw modifier — no `computeSavingThrow`. So the save skipped save **proficiency** (a Rogue defending against Topple with only its raw DEX mod), Bless/Bane and other bonus dice, advantage/disadvantage, Magic Resistance, and the auto-fail.

## The fix

`rollSave` now delegates to the shared `rollSaveAgainstDC` primitive — the same one cast-spell, recurring-save, breath weapons, and now Topple (slice 853) use:

```ts
const result = rollSaveAgainstDC({
  state, content, targetId, ability, dc, sourceIsMagical: false, rng, at,
});
```

`sourceIsMagical: false` — Open Hand Technique is a Monk martial feature, not a magical effect, so Magic Resistance grants no Advantage. The hand-rolled Halfling Luck (slice 543) folds into the primitive, and the now-dead `rollDie` / `D20_SIDES` / `applyHalflingLuckForCharacter` imports are removed; the `target` parameter (now redundant — the primitive resolves the target) is dropped from the helper's two call sites. The attacker-side `monkSaveDC` is unchanged.

## Scope

This is the **Open Hand arm** of `hand-rolled-saves-bypass-stack`. The other arm — the 2024 **Grapple / Shove** STR/DEX saves in `contested.ts:123,183` — stays tracked: those carry their own golden transcripts (`s21-contested`, `s15-conditions`, `showcase`) that need regen-with-inspection, and `contested.ts` has a third (already-derived) roll sharing the same imports, so its cleanup needs separate care. The row stays open; this slice doesn't change the rollup counts.

## What shipped

New 2-test `tests/unit/engine/slice-854-open-hand-save-effect-stack.test.ts`: the Topple save now carries a `computeSavingThrow` breakdown (the old hand-rolled event had none); and a DEX-save-proficient Rogue target adds proficiency (bonus +4) vs an otherwise-identical non-proficient Cleric target (+2) — the pre-854 raw roll gave both +2. The slice-380 Open Hand tests + the srd-l3 / srd-l6 floor audits stay green (their targets are non-proficient, so the serialized save is unchanged).

## Verification

`npx tsc --noEmit` clean; new 2-test slice-854 green; slice-380 + srd-l3/l6 unchanged. No content / condition / snapshot change. `npm run test:fast` + doc audits green.
