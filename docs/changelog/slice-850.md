# Slice 850 — Blindness/Deafness: Blinded/Deafened choice + CON save-ends

**Type:** Content (no source/schema change). Closes the [L7 audit](../l7-completion-audit.md) Area-2 quirk `blindness-deafness-no-choice-no-saveends`.

## The divergence

RAW (SRD 5.2.1 Blindness/Deafness):

> One creature that you can see within range must succeed on a Constitution saving throw, or it has the Blinded or Deafened condition (your choice) for the duration. At the end of each of its turns, the target repeats the save, ending the spell on itself on a success.

The pack wired it as `{ kind: 'save', ability: 'CON', conditionOnFail: 'blinded' }`. Two arms were missing:

1. **No Blinded/Deafened choice** — it always applied Blinded.
2. **No save-ends** — it pointed at the *shared* `blinded` condition, which carries `recurringSave: null` **on purpose**: Blinded from a monster's gaze, a different spell, etc. must not auto-end on a Constitution save. So the end-of-turn save the spell promises never fired.

## The fix — content only

All three primitives needed already shipped (`casterChoosesVariant` on a save mechanic — the Command shape; `recurringSave` with no `fixedDC` → the caster's spell DC — the Hold Person / Searing Smite path; `autoExpiry` — the 1-minute cap), so there is **no engine, schema, or event change**.

- **Spell mechanic:** `conditionOnFail: 'blinded'` → `casterChoosesVariant: { variants: [{ key: 'blindness', conditionId: 'blindness-deafness-blinded' }, { key: 'deafness', conditionId: 'blindness-deafness-deafened' }] }`. The CON save-on-cast (success negates) is unchanged; the caster picks the variant via `intent.casterChoice = { kind: 'variant', value: 'blindness' | 'deafness' }`, and the chosen variant applies on a **failed** cast save.
- **Two new spell-only variant conditions**, each carrying the base condition's effects **directly** (so the shared `blinded` / `deafened` stay save-less for other sources — the same reason `color-sprayed-blinded-active` copies Blinded's effects):
  - `blindness-deafness-blinded` — base Blinded effects (`SetAdvantage attack: disadvantage` + `GrantAdvantageToAttackers`).
  - `blindness-deafness-deafened` — base Deafened effect (predicate-gated auto-fail on hearing checks, slice 580).
  - both add `recurringSave { ability: 'CON', trigger: 'turnEnd', onSuccess: 'removeCondition' }` (**no `fixedDC`** → resolves the caster's spell DC from the AppliedCondition's `sourceCharacterId`) and `autoExpiry { afterRounds: 10, trigger: 'turnEnd' }` (the 1-minute cap).

The consumer ticks `engine.plan.tickRecurringSave` at the target's turn-end; a success ends the spell, a failure leaves it; the `autoExpiry` lifts it after 1 minute if no save ever succeeds.

## Deferred / out of scope

- The **auto-fail sight-dependent-check** arm of Blinded is the same deferred gap as base `blinded` (no sight-check predicate exists).
- The upcast **"one additional creature per slot above 2"** is a target-*count* rule on the consumer/targeting seam (Area 3), not part of this row.

## What shipped

New 6-test `tests/unit/engine/slice-850-blindness-deafness-choice-saveends.test.ts`: the CON save offers the Blinded/Deafened caster choice (no hardwired `conditionOnFail`); each variant carries its base effects + the turn-end CON save-ends + the 10-round cap; a failed cast applies the chosen variant **sourced to the caster**; the end-of-turn recurring save resolves vs the caster's spell DC (15 for a wizard L5, INT 18) and ends the spell on a success while leaving it in place on a failure. Seeds 3 (cast fail → turn-end fail) and 9 (cast fail → turn-end success) pin both branches deterministically; the target is a Rogue (no CON-save proficiency) so the CON-4 modifier actually lands below the DC.

## Verification

`npx tsc --noEmit` clean; new 6-test slice-850 green. +2 conditions (169 → 171; rider 154 → 156) — getting-started + starter-pack-gaps counts bumped; coverage snapshot gains `blindness-deafness-blinded` / `-deafened` (`-u`). `npm run test:fast` + doc audits green.
