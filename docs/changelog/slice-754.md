# Slice 754 — engine two-phase attack API (`attackRoll` / `attackDamage`)

**Type:** Engine primitive. Splits the monolithic attack resolution into two consumer-orchestrable phases, exposed on `engine.plan`, with the bundled `engine.plan.attack` preserved as a byte-identical composer. Also performs the CHANGELOG split (doc-size discipline).

## Why

The combat-fuzz reaction layer (slices 749-753) prevents-the-trigger by planning a full attack and then *slicing off* the damage chain. That works, but the engine had no first-class "roll → reaction window → damage" seam: the damage dice were rolled and on-hit riders computed even for an attack a reaction then prevents, and an interactive consumer (dnd-web live play) had no clean API to open a reaction window mid-attack. This slice gives the engine that seam. (Slice 755 re-wires the fuzz reactions onto it so prevented attacks no longer roll discarded damage.)

**Honest scope note:** the split does **not** change `AttackRolled.hit`. The reaction window needs the roll's hit to decide, so `AttackRolled` is emitted in phase 1 with the real hit even when a reaction then prevents the damage (RAW-faithful for Shield — the AC bump is known before damage, the attacker still "hit" the lower AC). The wins are a reusable engine API + not computing damage / riders that get discarded.

## How

`resolveAttack` ([attack.ts](../../src/engine/plan/attack.ts)) splits at the miss early-return into:

- `resolveAttackRollPhase(input)` → `AttackRollResult` — the attack-bonus / advantage / d20 / AC / hit / critical computation, emitting `AttackRolled` + on-attack consumes + triggers, and (on a hit) a `RollContext` capturing exactly the locals the damage phase needs (discovered by extraction + `tsc`: `attacker` / `target` / `weaponDef` / `weaponInstance` / `attackerEffects` / `critical` / `attackRolled` / `stateAfterAttack` / `input`).
- `resolveAttackDamage(ctx)` → the damage chain (damage ability / dice / riders / mitigation / fatal-intercept / concentration), reading only from `ctx`.
- `resolveAttack(input)` becomes the composer: `const r = resolveAttackRollPhase(input); return r.hit ? [...r.events, ...resolveAttackDamage(r.ctx)] : r.events;` — same locals, same order, **byte-identical**.

The plan wrappers mirror the same shape:
- `planAttackRoll(state, content, rng, intent)` → `{ events, roll: AttackRollHandle }` (the action-economy prelude + range / LoS / loading gates, then `resolveAttackRollPhase`; the loading-weapon `WeaponLoaded` event is surfaced on `roll.tail` so the weapon is recorded as fired even when a reaction prevents the damage).
- `planAttackDamage(roll)` → `{ events }` (`resolveAttackDamage(roll.phase.ctx)` + the tail, or just the tail on a miss / prevent).
- `planAttack` (bundled, unchanged output) = `planAttackRoll` then `planAttackDamage`. `planMultiattack` keeps calling the bundled `resolveAttack` per swing.

`AttackRolled`'s reducer is record-only and no reducer / derivation reads `.hit` from state, so the split is purely event-shape-preserving.

### Exposed API

- `engine.plan.attackRoll(state, intent)` → `AttackRollPlanResult { events, roll }` (`roll.hit` surfaces whether the swing connected; `roll` is the opaque handle to resume with).
- `engine.plan.attackDamage(roll)` → `PlanResult { events }`.
- Both injected with `content` + `rng` exactly like the `attack(state, intent)` wrapper. Re-exported from the root barrel ([src/index.ts](../../src/index.ts)) with the `AttackRollHandle` / `AttackRollPlanResult` types.

A consumer flow: `attackRoll` → commit the roll events → open a reaction window (the defender may prevent the hit) → on prevent, stop (damage never planned, no wasted rng / riders); otherwise commit `attackDamage(roll).events`.

## Files

- [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) — the split: `RollContext` / `AttackRollResult` / `AttackRollHandle` types, `resolveAttackRollPhase`, `resolveAttackDamage`, the `resolveAttack` composer, and `planAttackRoll` / `planAttackDamage` / bundled `planAttack`.
- [src/engine/plan/index.ts](../../src/engine/plan/index.ts) — export the new planners + types.
- [src/engine/index.ts](../../src/engine/index.ts) — `attackRoll` / `attackDamage` interface methods + wrappers; `AttackRollPlanResult` type.
- [src/index.ts](../../src/index.ts) — root re-exports.

## Tests

- [tests/golden/s-two-phase-attack.test.ts](../../tests/golden/s-two-phase-attack.test.ts) — NEW. Across seeds, `attackRoll(...).events ++ attackDamage(roll).events` normalized-equals `attack(...).events` (the composition === bundled invariant; covers both hits — exercising the damage phase — and misses), `roll.hit` agrees with damage presence, and the committed two-phase log replays equivalently.
- [tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts) — `attackRoll` / `attackDamage` added to `EXCLUDED_FROM_DISPATCH` (consumer-orchestrated sub-phases, not their own intent types).
- The full existing golden / fuzz / replay-equivalence / rng-capture net stays green **unchanged** (the byte-identity gate proving the split preserves `planAttack` output).

## Changelog split

The slice-754 entry crossed the 60 KB single-Read ceiling, so the `## 0.10.0-alpha.0` release narrative (slices 737-748) was evicted to [released-versions-0.10.0-alpha.0.md](released-versions-0.10.0-alpha.0.md) (re-rooted detail links + an "Older releases" pointer), exactly as slice 748 evicted 0.9.0. CHANGELOG.md: ~60 KB → ~48 KB.

## Status

The engine two-phase attack API (the last item deferred when the reaction layer landed) is now shipped. Slice 755 re-wires the combat-fuzz pre-damage reactions onto it (no discarded damage rolls for prevented attacks).
