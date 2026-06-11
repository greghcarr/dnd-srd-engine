# Slice 825 — Bearded Devil infernal wound (recurring-damage condition mechanism)

**Type:** Engine primitive (a `recurringDamage` condition field + the `tickRecurringDamage` planner) + content (the `infernal-wound` condition + the Infernal Glaive rider). Advances the [L7 audit](../l7-completion-audit.md) `monster-onhit-rider-pass` quirk (batch 3) — the hardest rider remainder.

## The gap

The Bearded Devil's Infernal Glaive imposes an **infernal wound** on a failed CON save: *"the target loses 5 (1d10) Hit Points at the start of each of its turns. The wound closes after 1 minute …"* The engine had `recurringSave` (a per-turn **save** the consumer ticks) but no per-turn **damage** — the wound needs automatic HP loss, no save.

## The primitive

- **`recurringDamage` condition field** — `{ dice, damageType, trigger: 'turnStart' | 'turnEnd' }`, the no-save analogue of `recurringSave`. Metadata only; like `recurringSave`, the engine doesn't track turn moments, so the consumer drives the tick and the condition's `autoExpiry` bounds the duration.
- **`engine.plan.tickRecurringDamage(state, { targetId, conditionId })`** — the sibling of `tickRecurringSave`: rolls the per-tick dice and runs the same damage pipeline as a recurring spell tick (`mitigateDamage` → `interceptFatalDamage` → `DamageApplied` → `planConcentrationOnDamage`), sourced to the condition's `sourceCharacterId` (the creature that inflicted the wound). Consumer-orchestrated (allowlisted in the planner-wiring audit, like `tickRecurringSave`).

## Content

- New **`infernal-wound`** condition: `recurringDamage { 1d10 necrotic, turnStart }` + `autoExpiry { 10 rounds, turnStart, bearer-keyed }` (closes after 1 minute). RAW the loss is **untyped** Hit Point loss; `necrotic` is the closest typed approximation (only a necrotic-resistant bearer differs). The heal-closes and DC-12-Medicine-stanch arms stay consumer/DM-managed (the engine has no heal→remove-condition hook) — documented in `engineNotes`.
- The **Bearded Devil Infernal Glaive** gains its onHit `save` rider: CON DC 12, `conditionOnFail: 'infernal-wound'` (the existing slice-318/319 save path, which stamps the wound's `autoExpiry` when applied in an encounter).

## Uncle Bob audit

- **Single responsibility / parallel structure:** `tickRecurringDamage` does one thing (one tick of one wound) and mirrors `tickRecurringSave`'s shape, intent, and consumer-driven contract — a reader who knows one knows the other.
- **Reuse over reinvention:** the damage emission reuses the established `mitigateDamage`/`interceptFatalDamage`/`planConcentrationOnDamage` pipeline (same as `planTickRecurring`), so resistances, death-prevention, and concentration breaks all work for free; the application reuses the onHit `save.conditionOnFail` path and `autoExpiry` (no new application or expiry machinery).
- **No new event:** emits `DamageApplied` (+ the intercept/concentration events the pipeline already produces).
- **Honest scope:** the untyped-HP-loss and heal-closes/Medicine arms are documented deferrals in `engineNotes`, not silently dropped.
- **Tests pin behavior:** the wound applies on a failed save (sourced by the devil), the tick drains 1d10 necrotic and lowers HP, and ticking a creature without the wound throws.

## Tests

`tests/unit/engine/slice-825-infernal-wound.test.ts` (4): the condition ships with `recurringDamage {1d10 necrotic}` + the 1-minute `autoExpiry` and the Glaive's CON-12 save rider; the Infernal Glaive inflicts the wound on a failed CON save (sourced by the devil); `tickRecurringDamage` drains 1d10 necrotic from a wounded creature (sourced by the devil) and lowers its HP; and ticking a creature without the wound throws.

## Verification

`npx tsc --noEmit` clean; player-facing-descriptions lint + pack-integrity + exports/coverage green; the new condition bumped the doc-cited count (164→165 / 149→150 rider) in 3 docs; `npm run test:fast` green.
