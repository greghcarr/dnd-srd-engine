# Slice 839 — Legendary Resistance (Aboleth / Sphinx of Lore / Unicorn)

**Type:** Engine primitive (statblock spec + state field + event + consumer-driven planner) + content. Advances the [L7 audit](../l7-completion-audit.md) `legendary-lair-actions` row — the Legendary Resistance arm.

## The gap (and a canon correction)

Legendary creatures had no Legendary Resistance (SRD 5.2.1):

> **Legendary Resistance (3/Day, or 4/Day in Lair).** If the creature fails a saving throw, it can choose to succeed instead.

Two canon findings:
- The audit's **"only Aboleth"** was inaccurate. Legendary Resistance is a *trait* (separate from Legendary Actions) carried in scope by the **Aboleth** (3/Day, 4 In Lair), **Sphinx of Lore** (3/4), and **Unicorn** (3).
- The 2024 SRD **folded lair into the legendary framework** — there is no separate initiative-20 lair-action mechanic anymore; "In Lair" just grants +1 Legendary Resistance and +1 Legendary Action use.

## What shipped — Legendary Resistance

- **`MonsterStatblock.legendaryResistance`** (`{ usesPerDay, usesPerDayInLair? }`, optional).
- **`Character.legendaryResistanceUsed`** — a per-day counter (counts up, like `perDayCastsUsed`), reset on a Long Rest (`applyLongRestEnded`).
- **`engine.plan.legendaryResistance({ creatureId, triggeringSaveEventId?, inLair? })`** — the **Shield `preventedHit` shape**: the consumer orchestrates the encounter, sees a legendary creature fail a save, and calls this; the engine confirms the budgeted spend (throwing when exhausted), emits **`LegendaryResistanceUsed`** (+ increments the counter), and the consumer treats the triggering save as a **success** (it drops the fail consequences, exactly as it drops the damage chain on a Shield `preventedHit`). `inLair` is a consumer fact (the engine doesn't model lairs / positions) that raises the cap to `usesPerDayInLair`.

Consumer-orchestrated rather than inline because a fully-inline Legendary Resistance would have to thread a *consumer-decides* fact (you don't burn a use on a Fireball half-save) through every save site (`rollSaveAgainstDC` + cast-spell's separate inline save block) — a genuine cross-cut. The Shield-shape spend keeps the budget engine-authoritative while leaving the save-flip to the consumer, consistent with engine-scope (the consumer owns encounter flow).

## Still open (split out)

The **Legendary Actions** pool (3 uses, +1 In Lair, refreshed at turn-start, spent after another creature's turn — the Aboleth's Lash / Psychic Drain) is split out as `legendary-actions-pool` — it involves the turn/action economy.

## Tests

`tests/unit/engine/slice-839-legendary-resistance.test.ts` (6): the three creatures carry the SRD budget; spending one use emits `LegendaryResistanceUsed` + increments the counter; the 3/Day budget throws on the 4th use; In Lair raises the cap to 4; a Long Rest refreshes it; and it throws for a creature without the trait.

## Verification

`npx tsc --noEmit` clean; planner-wiring (`legendaryResistance` allowlisted) + pack-integrity + migrations (optional-default field is back-compatible) green; `npm run test:fast` green (619 files, 4692 passed). No new condition / effect kind / weapon → no doc-counts bump.
