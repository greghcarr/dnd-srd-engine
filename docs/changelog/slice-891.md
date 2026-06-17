# Slice 891 — Ammunition consumption + recovery (`ammunition-not-consumed`)

**Type:** Engine (attack planner tail + new event/reducer + a recovery planner + an `AttackIntent` field). Closes the L7 audit Area-6 DIVERGENCE `ammunition-not-consumed`. **Area 6 (Base equipment mechanics) is now fully closed.**

## RAW

equipment "Ammunition": *"You can use a weapon that has the Ammunition property to make a ranged attack only if you have ammunition to fire from it. ... Each attack expends one piece of ammunition. ... After a fight, you can spend 1 minute to recover half the ammunition (round down) you used in the fight; the rest is lost."*

## What was wrong

Firing an Ammunition-property weapon (Shortbow, Crossbow, Sling, Musket, …) neither consumed nor required ammunition, and there was no recover-half.

## The fix (opt-in consumer-coordinated seam)

The engine doesn't own ammo inventory cadence, so it's a consumer-coordinated arm — the consumer names the stack; the engine does the accounting:

- New **`AttackIntent.ammunitionInstanceId?`**. When the weapon has the `ammunition` property and is ranged AND this is set, the shot appends an **`AmmunitionQuantityChanged { delta: -1 }`** event to the attack's `tail` (the same handle slot the Loading-weapon `WeaponLoaded` event rides). The new reducer decrements the stack's `quantity`; the stack **retires** (instance removed) at 0 (since `ItemInstance.quantity` is min-1). A shot whose ammo stack is depleted/absent **throws** ("no ammunition") — the RAW "only if you have ammunition" gate.
- New **`engine.plan.recoverAmmunition({ characterId, ammunitionInstanceId, spent })`** — a consumer-driven post-fight downtime action that restores `floor(spent / 2)` to the stack via the same `AmmunitionQuantityChanged` event (`delta: +N`). The consumer knows how many it `spent` (it fired them); the 1-minute time cost is its scene model.

**Opt-in:** with no `ammunitionInstanceId`, the engine tracks/requires no ammo — every existing ranged attack is byte-unchanged (the consumer owns ammo inventory until it wires this).

Deferred (consumer-owned): the ammo-type-matches-weapon check (any named stack is decremented) and the free-hand-to-load rule.

## Tests

New `tests/unit/engine/slice-891-ammunition.test.ts` (5 tests): a shot expends one piece (3 → 2); the stack retires at 0 and a further shot throws `/no ammunition/`; without `ammunitionInstanceId` no `AmmunitionQuantityChanged` is emitted and the stack is untouched (opt-in); `recoverAmmunition({ spent: 5 })` adds `floor(5/2) = 2`; recovering from `spent ≤ 1` is a no-op.

## Counts

No content-count change — a new event + `AttackIntent` field + planner; no condition/effect/wired-spell. (Events aren't a doc-counted surface; `AmmunitionQuantityChanged` isn't in the partial `EVENT_TYPES` list, matching `ItemConsumed`.)

## Audit

- Struck `ammunition-not-consumed`; Rollup: **Area 6** `1 → 0` open / `8 → 9` closed → ✅ **fully closed**; **Total** `28 → 27` open / `89 → 90` closed / `0/10/18 → 0/9/18`. Header now reads "Areas 1, 4, 6, and 7 are fully closed."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (664 files, 4931 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green; `recoverAmmunition` allowlisted in the planner-wiring audit as a consumer-driven action.
