# Slice 871 — Aura of Life + the `recurringHeal` primitive

**Type:** Engine primitive (`recurringHeal` + `engine.plan.tickRecurringHeal`) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `l4-aura-of-life` ("30-ft emanation: necrotic resistance + 0-HP allies regain 1 HP; no aura").

## The gap

RAW (SRD 5.2.1 Aura of Life, Cleric/Paladin): "An aura radiates from you in a 30-foot Emanation for the duration. While in the aura, you and your allies have Resistance to Necrotic damage, and your Hit Point maximums can't be reduced. If an ally with 0 Hit Points starts its turn in the aura, that ally regains 1 Hit Point." (Concentration, up to 10 minutes.) The spell shipped `mechanicalEffects: []` — a cast did nothing.

## The fix

The **aura-as-condition** pattern (the same one the Paladin auras use): the aura is a condition applied to the in-range creatures; the consumer manages membership (the positional emanation), and the engine supplies the condition + its effects.

- **Cast**: a `buff` mechanic applies the new `aura-of-life-active` condition to the chosen creatures (caster + allies in range), **concentration-bound** — the buff conditions are tracked on the `ConcentrationStarted` event, so `clearConcentrationEffect` sweeps them when the caster's Concentration ends.
- **Necrotic Resistance**: `aura-of-life-active` carries `GrantResistance { damageType: 'necrotic' }` — a necrotic hit on a bearer is halved by `mitigateDamage`; other types pass through.
- **The 0-HP revive** is the new primitive — see below.

### New primitive: `recurringHeal`

The heal mirror of slice-825's `recurringDamage`. A condition can declare `recurringHeal { amount, trigger, onlyAtZeroHp? }`; `engine.plan.tickRecurringHeal` (the sibling of `tickRecurringDamage`) emits a flat `Healed` event when the consumer ticks it. `onlyAtZeroHp` gates the heal to a downed bearer — Aura of Life only revives the dying, so a conscious bearer is a no-op. The condition's lifetime (concentration link / autoExpiry) bounds how long it recurs; the engine doesn't track turn moments, exactly like `recurringDamage` / `recurringSave` (consumer-driven cadence). `aura-of-life-active` carries `recurringHeal { amount: 1, trigger: 'turnStart', onlyAtZeroHp: true }`.

Reusable for any heal-over-time / revive-at-0 effect (Aura of Vitality, regeneration auras, …).

### Deferred

The "Hit Point maximums can't be reduced" arm (no prevent-max-HP-reduction effect yet — it protects only against the rare Wraith/Wight max-HP drain) and the aura membership management (consumer-owned positional emanation, like every aura-as-condition).

## What shipped

- `RecurringHealSchema` + the `recurringHeal` field on `ConditionSchema` (`condition.ts`); `planTickRecurringHeal` (`recurring-heal.ts`) + `engine.plan.tickRecurringHeal` registration; `tickRecurringHeal` added to the planner-wiring excluded-dispatch allowlist (a consumer-orchestrated tick, like `tickRecurringDamage`).
- Content: new `aura-of-life-active` condition; `aura-of-life` wired (`buff`).
- New 4-test `tests/unit/engine/slice-871-aura-of-life.test.ts`: the wire + condition shape; a cast applies the condition to the chosen creatures, concentration-bound; the necrotic-Resistance halving (and fire untouched); `tickRecurringHeal` revives a 0-HP bearer by 1 and is a no-op above 0.
- `spell-coverage` flips `aura-of-life` → `buff`; wired-conditions coverage snapshot gains `aura-of-life-active`.
- Counts: +1 condition (`173 → 174` total / `158 → 159` rider) across status / getting-started / starter-pack-gaps; spell-wired `213 → 214` / schema-only `58 → 57` / L4 `22 → 23 wired`; `api-overview` gains `tickRecurringHeal` (+ `tickRecurringDamage`, previously unlisted).

## Verification

`npx tsc --noEmit` clean; new 4-test slice-871 green; spell-coverage green. `npm run test:fast` (648 files, 4859 passed — +1 file / +5 tests over slice 870). coverage snapshot regenerated (+1 condition); planner-wiring + doc-counts + doc-size + doc-links + `release:doc-review` ("wired count 214 MATCHES") green. No new effect kind (`EFFECT_KINDS` stays 69 + Custom); exports/types snapshots unchanged (the tick is an `engine.plan` method, not a new export name).
