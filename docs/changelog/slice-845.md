# Slice 845 — Searing Smite recurring burn (closes `searing-smite-no-recurring-burn`)

**Type:** Content (one new condition + an `ApplyCondition` rider action). No engine, schema, or event change — it reuses three shipped primitives. First Area-2 (spell-mechanics) closure of this session.

## The gap

RAW 2024 Searing Smite (`spells.md`):

> As you hit the target, it takes an extra 1d6 Fire damage from the attack. **At the start of each of its turns until the spell ends, the target takes 1d6 Fire damage and then makes a Constitution saving throw. On a failed save, the spell continues. On a successful save, the spell ends.**

The engine modeled only the one-time **+1d6 on the hit** — a self-buff (`searing-smite-active`) on the caster whose `OnEvent` rider added `1d6` fire and `consumeOnTrigger`-lifted itself. The whole **recurring burn** on the target (1d6 fire + a CON save each turn) was missing.

## What shipped — all reused machinery

The recurring burn lives on the **target**, not the caster, so the rider now applies a second condition to the victim:

- **`searing-smite-active`'s on-hit rider** gained an **`ApplyCondition`** trigger action (the slice-115 primitive) alongside the existing `AddDamage`. On a hit, `fireApplyCondition` stamps the new condition on the triggering attack's **target**, with `sourceCharacterId` = the rider's bearer (the **caster**).
- **`searing-smite-burning`** (new condition, applied to the target):
  - **`recurringDamage`** `{ 1d6 fire, turnStart }` (slice 825) — sourced to the caster, runs the normal mitigation / fatal-intercept / concentration pipeline.
  - **`recurringSave`** `{ CON, turnStart, onSuccess: removeCondition }` (slices 488/677) with **no `fixedDC`**, so the planner falls back to the **caster's spell save DC** (the Hold Person path) — read off the condition's `sourceCharacterId`.
  - **`autoExpiry`** `{ afterRounds: 10, turnEnd }` — the 1-minute cap (Searing Smite is non-concentration).

The consumer ticks `engine.plan.tickRecurringDamage` then `engine.plan.tickRecurringSave` at the target's turn-start: 1d6 fire, then a CON save that ends the spell on a success (and is bounded at 1 minute regardless). No engine code path changed.

**Deferred:** the higher-level-slot upcast (+1d6 per slot above 1st) — the condition's dice are static, as with every smite/rider condition; upcast scaling of condition dice is a separate, cross-cutting shape.

## Tests

`tests/unit/engine/slice-845-searing-smite-recurring-burn.test.ts` (4): the `searing-smite-burning` condition ships the exact recurring arms + autoExpiry and the rider applies it; a hit while armed ignites the target (burn sourced to the caster) and consumes the caster's self-buff; `tickRecurringDamage` deals 1d6 fire sourced to the caster; `tickRecurringSave` rolls a **CON save vs the paladin's spell DC (13)** and ends the spell on a success (ConditionRemoved). The slice-61 smite golden + slice-620 rider-concentration test stay green (the added `ApplyCondition` doesn't touch their assertions).

## Verification

`npx tsc --noEmit` clean; new 4-test slice-845 + the smite golden + rider tests green. +1 condition (167 → 168; rider 152 → 153) — bumped the getting-started / status / starter-pack-gaps citations; the coverage snapshot was unaffected (no `-u` needed). `npm run test:fast` green.
