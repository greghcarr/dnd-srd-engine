# Slice 818 — Priest Divine Aid (3/Day): shared per-day pool + cast-time override

**Type:** Engine (two GrantSpell fields + the per-day metering / cast-economy paths) + canonical content (the Priest). Advances the [L7 audit](../l7-completion-audit.md) `npc-caster-bonus-action-groups` quirk — the hardest of its items.

## The gap

The Priest's RAW Bonus Action **Divine Aid (3/Day)** casts one of *Bless, Dispel Magic, Healing Word,* or *Lesser Restoration* — **3 uses TOTAL across the four**, all as a Bonus Action. Two things the slice-794 per-day model couldn't express:

1. **Shared budget.** `perDayCastsUsed` is keyed per-spell, so four `perLongRest` grants would give 3 casts *each* (12 total), not 3 shared.
2. **Cast-time override.** Bless and Dispel Magic are **Action** spells; cast through Divine Aid they're a **Bonus Action**. The cast path consumes economy from the spell's printed `castingTime`, so it would spend the Action.

## The design (two GrantSpell fields)

Both additive, on the `GrantSpell` effect:

- **`perDayPoolId`** — a shared "N/Day" pool. Every grant tagged with the same id shares one budget: the cast path sums each member spell's `perDayCastsUsed` counter against `usesPerLongRest`. Each cast still increments its **own** spell's counter (so `PerDayCastUsed.spellId` stays accurate), and the long rest clears them all (existing slice-794 wiring). **No resource seeding needed** — unlike a `freeCastResourceId` pool (which reads `character.resources`, populated only by the consumer-side `seedResourcesFromContent` and not seeded for monsters by any current consumer), the per-day counter is base character state, so it works for a monster out of the box. *(This is why the resource-pool approach was rejected: the Priest is the first monster with a resource, and the combat-fuzz driver doesn't seed monster resources — Divine Aid would have been dormant.)*
- **`castAsBonusAction`** — a cast-time override. When the matched free-cast grant carries it, `castSpell` forces `castingTimeKind = 'bonusAction'`, so the cast consumes (and gates on) the Bonus Action regardless of the spell's printed Action. Scoped to the grant, so a normal slot cast of Bless is unaffected.

Both flow through `effects.grantedSpells()` (threaded like `freeCastResourceId`). The cast-time override reads from whichever free-cast grant matched (`once ?? pool ?? perDay`).

## Content

The Priest gains four `perLongRest` `GrantSpell`s — Bless / Dispel Magic / Healing Word / Lesser Restoration — each `usesPerLongRest: 3`, `perDayPoolId: 'divine-aid'`, `spellcastingAbility: 'WIS'`; Bless + Dispel Magic also `castAsBonusAction: true`. (All four spells already exist in the pack.)

## Uncle Bob audit

- **Single responsibility:** `perDayPoolId` changes only *which counters the budget sums*; `castAsBonusAction` changes only *which economy slot the cast spends*. Each is one localized branch in the existing per-day / casting-time logic — no new metering model, event, or planner.
- **Open/closed:** the per-day path now keys on `perDayPoolId ?? per-spell` and the casting-time on `override ?? printed`; existing per-day spells (the Priest's own Spirit Guardians) are untouched (verified — slice-795 stays green).
- **No new coupling:** reuses `perDayCastsUsed`, `PerDayCastUsed`, and the long-rest clear; the two fields ride the established `grantedSpells()` passthrough.
- **Names reveal intent:** `perDayPoolId`, `castAsBonusAction`.
- **Tests pin behavior:** the *shared* budget (three different spells block a fourth never-cast pool spell — the assertion a per-spell model fails), the long-rest refresh, and the Action→Bonus-Action override.

## Tests

`tests/unit/engine/slice-818-priest-divine-aid.test.ts` (4): the Priest ships the four pooled grants (Bless/Dispel Magic flagged Bonus Action); **three different** pool spells exhaust the 3/Day budget and a **fourth never-cast** spell (Dispel Magic) is blocked — plus a repeat is blocked (the shared-pool proof); a long rest refreshes it; and casting Bless (an Action spell) through Divine Aid spends the **Bonus Action**, not the Action.

## Verification

`npx tsc --noEmit` clean; coverage/exports/phantom-field snapshots unchanged; `npm run test:fast` green.
