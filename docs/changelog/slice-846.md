# Slice 846 — Heat Metal: damage ignores the save (closes `heat-metal-save-on-wrong-arm`)

**Type:** Engine primitive (one save-mechanic flag) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 `heat-metal-save-on-wrong-arm` row.

## The gap

RAW 2024 Heat Metal (`spells.md`):

> Any creature in physical contact with the object takes 2d8 Fire damage when you cast the spell. … If a creature is holding or wearing the object and takes the damage from it, **the creature must succeed on a Constitution saving throw or** drop the object if it can. If it doesn't drop the object, **it has Disadvantage on attack rolls and ability checks until the start of your next turn.**

The damage is **automatic** — the CON save only decides drop-object / Disadvantage. The pack wired it as a `save` mechanic with `halfOnSuccess: false`, so a **successful save negated the 2d8 entirely** — backwards. An expert sees a creature shrug off Heat Metal's signature automatic burn.

## What shipped — the flag

The save mechanic computes its damage at one chokepoint (`outcomeAmount` in `cast-spell.ts`), which folds success / `halfOnSuccess` / Evasion. A new opt-in flag short-circuits it:

- **`SpellSaveMechanicSchema.damageIgnoresSave`** (`boolean`, optional) — when set, `outcomeAmount` returns the raw rolled damage regardless of the save result; the save then governs **only** `conditionOnFail` (applied on a failure, the existing `!success` branch). Composes with `extraDicePerSlotLevel` (full upcast damage) and `additionalDamage`. Unset → the historical save-gates-damage behavior, so **every other save spell is byte-unchanged**.

This is the RAW-faithful shape (correct for multiple creatures in contact and for upcast), versus modelling the automatic hit as a 1-dart `auto-hit` (single-target, no `+1d8/slot` scaling).

## Content

- **Heat Metal** rewired to `{ save CON, 2d8 fire, extraDicePerSlotLevel 1, damageIgnoresSave, conditionOnFail: heat-metal-gripped }`.
- **`heat-metal-gripped`** (new condition): `SetAdvantage disadvantage` on `attack` + on `{ check }` (all-ability checks) — Frightened's effect shape minus the line-of-sight gate — with `autoExpiry { afterRounds 1, turnStart }` = "until the start of your next turn" (source-keyed to the caster).

The "drop the object if it can" branch stays consumer/DM-narrative (held-item state is unmodeled — the engine applies the Disadvantage arm, which is the mechanically-enforceable consequence).

## Tests

`tests/unit/engine/slice-846-heat-metal-save-on-wrong-arm.test.ts` (4): the mechanic + condition wiring; **full 2d8 fire on a SUCCESSFUL save** (the bug) with no grip; full 2d8 + the grip (sourced to the caster) on a failure; and a slot-3 upcast that rolls above the 2d8 ceiling (proving 3d8) while still ignoring the save. The CON save is rolled vs the druid's spell DC (14) in both branches.

## Verification

`npx tsc --noEmit` clean; new 4-test slice-846 + spell-coverage (heat-metal still `{ kind: 'save' }`) green. +1 condition (168 → 169; rider 153 → 154) — bumped the getting-started/status/starter-pack-gaps citations. The flag is opt-in, so the full save-spell golden + fuzz tiers are unaffected. `npm run test:fast` green.
