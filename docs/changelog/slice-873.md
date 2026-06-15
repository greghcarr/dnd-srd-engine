# Slice 873 — Guardian of Faith + the aura damage-budget primitive

**Type:** Engine primitive (a cumulative-damage budget on `aura-damage`) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `l4-guardian-of-faith` ("summoned guardian dealing 20 radiant (DEX half) to 60-total; nothing summoned") — the last of the L4 summon/aura block.

## The gap

RAW (SRD 5.2.1 Guardian of Faith, Cleric): "Any enemy that moves to a space within 10 feet of the guardian … makes a Dexterity saving throw, taking 20 Radiant damage on a failed save or half as much on a success. **The guardian vanishes when it has dealt a total of 60 damage.**" (Duration 8 hours — not Concentration.) The spell shipped `mechanicalEffects: []`.

The damage is an `aura-damage` tick (10-ft, DEX, 20 radiant, half), ticked via the slice-872 non-concentration path. The new piece — and the reason this was the hard summon — is the **60-damage budget that ends the spell**, which needs persistent per-effect state.

## The fix — the aura damage-budget primitive

- **`damageBudget`** on the `aura-damage` mechanic (Guardian's 60).
- A budgeted non-concentration aura now creates an **EffectInstance at cast** (the slice-665 `SpellEffectStarted` path, extended from zones to budgeted auras) carrying **`auraDamageBudgetRemaining`**. Unbudgeted auras (Grease, Faithful Hound) stay effect-less — they're ticked by `spellId`.
- **`planTickAura`** gains a third resolution path — `effectInstanceId` (the budgeted aura's effect). After the tick, it charges the **post-mitigation damage dealt** against the budget via a new **`AuraDamageBudgetSpent`** event (the reducer subtracts, clamped at 0), and when the budget is exhausted it emits a **`ConcentrationBroken('used')`** — the guardian vanishes, and the shared `clearConcentrationEffect` deletes the EffectInstance (it tolerates non-concentration effects).

Guardian's flat 20 radiant is authored as `"0d6+20"` (count 0 → no dice rolled, +20 modifier; the die size is an inert placeholder, since `DiceExpression` requires `NdM` form).

### Deferred

The guardian's placement (an unoccupied space within range), its invulnerability, the deity-appropriate form, and "is an enemy within 10 ft" membership are all positional — consumer-managed, as for every aura.

## What shipped

- Schema: `aura-damage.damageBudget`; `EffectInstance.auraDamageBudgetRemaining`; `SpellEffectStarted.auraDamageBudgetRemaining`; the new `AuraDamageBudgetSpent` event (registered in the event union / type-name list / apply dispatch / transcript formatter).
- `planTickAura`: the `effectInstanceId` path + the budget charge/vanish; `cast-spell` creates the budgeted-aura EffectInstance; `applyAuraDamageBudgetSpent` reducer.
- Content: `guardian-of-faith` wired.
- New 3-test `tests/unit/engine/slice-873-guardian-of-faith.test.ts`: the wire; the cast claims no Concentration and seeds the 60 budget on `SpellEffectStarted`; each tick deals DEX-save radiant, spends exactly that much budget, and the guardian vanishes (effect deleted) once it's dealt 60.
- `spell-coverage`: `guardian-of-faith` → wired aura-damage (`nonConcentration`); the generic harness exercises the damage, the dedicated test the budget.
- Counts: spell-wired `215 → 216` / schema-only `56 → 55` / L4 `24 → 25 wired`, `4 → 3 deferred`; pct `~63% → ~64%`. `api-overview` `tickAura` note updated.

## Verification

`npx tsc --noEmit` clean; new 3-test slice-873 green; spell-coverage green. `npm run test:fast` (650 files, 4869 passed — +1 file / +4 tests over slice 872). exports + migrations green (the new event isn't on the public barrel; the new optional EffectInstance field is back-compat). doc-counts + doc-size + doc-links + `release:doc-review` ("wired count 216 MATCHES") green. The concentration + stateless-non-concentration aura paths are byte-unchanged.
