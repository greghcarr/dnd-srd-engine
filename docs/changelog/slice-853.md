# Slice 853 — Topple's CON save goes through the full save derivation

**Type:** Engine fix (no content). Closes the [L7 audit](../l7-completion-audit.md) Area-6 quirk `topple-save-bypasses-effect-stack`; the pattern-check spins off a new Area-4 row for two siblings.

## The divergence

The Topple weapon mastery (a hit lets the target be knocked Prone on a failed CON save) hand-rolled that save in `weapon-mastery.ts`:

```ts
const conBonus = abilityModifier(target.abilityScores.CON);
const total = d20 + conBonus;
```

A raw ability modifier — no `computeSavingThrow`. So Topple's save silently skipped everything the standard derivation applies:

- **CON-save proficiency** — a Fighter (proficient in CON saves) defended with only its raw CON mod, missing its whole proficiency bonus.
- **Bless / Bane** and other save bonus dice.
- **Advantage / disadvantage** (e.g. a Raging Barbarian's advantage on STR/CON... not CON, but generally any save-advantage source).
- **Magic Resistance** and the **Paralyzed / Stunned / Unconscious auto-fail**.

## The fix

The save now routes through the shared `rollSaveAgainstDC` primitive — the same one `cast-spell` (single-target + AoE), recurring-save, the on-hit-save rider, and breath weapons use:

```ts
const saveResult = rollSaveAgainstDC({
  state, content, targetId: intent.targetId, ability: 'CON', dc,
  sourceIsMagical: false, rng, at,
});
if (saveResult !== undefined) {
  events.push(saveResult.event);
  if (!saveResult.success) { /* apply prone */ }
}
```

`sourceIsMagical: false` because Topple is a **nonmagical** weapon property — a creature with Magic Resistance does **not** get Advantage against it. The hand-rolled Halfling Luck (added separately in slice 543) is now handled inside the primitive, and the three imports it needed (`rollDie`, `D20_SIDES`, `applyHalflingLuckForCharacter`) plus the `SaveRolledEvent` type are removed as dead.

The `masterySaveDC` (the attacker-side DC) is unchanged — this row is about the **target's** save, not the DC.

## Pattern-check

Topple is the only save-bearing weapon mastery, so the fix is complete within `weapon-mastery.ts`. But a sweep for hand-constructed `SaveRolled` events that bypass the derivation found **two siblings** of the same raw-mod bug:

- the Monk's **Open Hand Technique** (Flurry of Blows Prone/Push STR-or-DEX save) — `open-hand-technique.ts:47`;
- the 2024 **Grapple / Shove** STR-or-DEX saves — `contested.ts:123,183`.

These are tracked as the new Area-4 row `hand-rolled-saves-bypass-stack` rather than folded in here, because each carries its own unit tests and golden transcripts that need regen-with-inspection — a clean separate sweep.

## What shipped

New 3-test `tests/unit/engine/slice-853-topple-save-effect-stack.test.ts`: the Topple save carries a `computeSavingThrow` breakdown (the old hand-rolled event had none); a CON-save-proficient Fighter target now adds proficiency (bonus +4) vs an otherwise-identical non-proficient Wizard target (+2) — the pre-853 raw roll gave both +2; and a Bless on the target adds its 1d4 to the save. The s23-weapon-mastery golden and the slice-380 / 502 / 624 / 626 mastery tests stay green: their Topple targets are non-proficient and unblessed, so the serialized save is byte-identical.

## Verification

`npx tsc --noEmit` clean; new 3-test slice-853 green; the weapon-mastery golden + mastery unit tests unchanged. No content / condition / snapshot change. `npm run test:fast` + doc audits green.
