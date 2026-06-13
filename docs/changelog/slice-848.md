# Slice 848 — `heroism-no-recurring-temp-hp` is NOT A BUG (stale L7 finding)

**Type:** Docs + guard test (no source change). Resolves the [L7 audit](../l7-completion-audit.md) Area-2 `heroism-no-recurring-temp-hp` row as a confirmed non-bug.

## The finding

The audit row read: *"`heroic-active` grants only Frightened immunity; RAW also grants temp HP = spell mod at the start of each of the target's turns."* It looked only at the **condition**.

## Why it's not a bug

RAW 2024 Heroism (`spells.md`):

> the creature is immune to the Frightened condition and gains Temporary Hit Points equal to your spellcasting ability modifier at the start of each of its turns.

The temp HP **is** fully modeled — just not stored on `heroic-active` (by design; the condition's own description says *"The per-turn temp HP grant fires via engine.plan.tickRecurring at the start of each target's turn (not stored on this condition)."*). It lives on the spell's **`recurring` SpellMechanic**:

```json
{ "kind": "recurring", "effect": "temp-hp", "addCasterAbilityMod": "CHA" }
```

driven by **`planTickRecurring`** / `engine.plan.tickRecurring` (the slice-79 recurring-rider primitive). At the start of each target's turn the consumer ticks it; `planTickRecurring` reads the caster's concentration effect, finds the `recurring` mechanic, computes `rolled + flat + casterAbilityMod`, and for `effect: 'temp-hp'` emits `TempHPGranted`. For Heroism that's the caster's **CHA** modifier (RAW "your spellcasting ability modifier" — CHA for both SRD Heroism classes, Bard and Paladin), with RAW **max-not-stack** semantics: `applyTempHPGranted` keeps the higher of current vs. new temp HP, so the per-turn grant refreshes rather than accumulates.

So the two RAW arms are split across the right surfaces:

- **Frightened immunity** → on the `heroic-active` condition (`GrantConditionImmunity frightened`).
- **Recurring temp HP** → on the spell's `recurring` mechanic + the tick planner.

The audit author saw only the first and concluded the second was missing — the same misread-the-surface pattern as slices 841 (`disease-generic-condition`) and 842 (`variable-ac-by-posture`). Nothing is missing; modeling the temp HP a second time on the condition would be wrong (double grant).

The functional grant has been covered since slice 79 by `tests/unit/engine/recurring-tick.test.ts` (CHA 18 → +4 temp HP per tick; negative CHA mod → 0/no event).

## What shipped

- The audit row is **struck through** (`~~DIVERGENCE~~ → NOT A BUG`) in place and a bullet added to **Confirmed correct / by-design**.
- New guard `tests/audit/slice-848-heroism-recurring-temp-hp.test.ts` (3): Heroism ships the `recurring` temp-HP mechanic with `addCasterAbilityMod: 'CHA'`; `heroic-active` carries the Frightened immunity and no recurring arms of its own; and an end-to-end cast → tick grants the caster's CHA mod as temp HP and a second tick refreshes (max-not-stack) rather than accumulating.

The upcast arm ("one additional target per slot above 1") is a target-*count* rule on the consumer/targeting seam (Area 3), not part of this temp-HP finding.

## Verification

`npx tsc --noEmit` clean; new 3-test slice-848 green; `recurring-tick` (slice 79) still green. Doc + test only — no condition/effect/mechanic added (counts unchanged), no coverage-snapshot change. `npm run test:fast` green.
