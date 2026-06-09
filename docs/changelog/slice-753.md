# Slice 753 — Protection reaction (positional, pre-damage attack window)

**Type:** Driver/infra (combat-fuzz). Composes the existing `planProtection` planner; adds the positional/adjacency integration. The last reactive-window reaction — it rounds out the layer (damage 749 / attack 750 / cast 751 / save 752) with the one that uses the position model.

## Why

Protection (a Fighter/Paladin/Ranger fighting style): a shield-bearing ally within 5 ft of an attacked creature imposes disadvantage on the attack roll. It modifies the attack roll, so it extends the slice-750 pre-damage attack window; it needs positions, so it only engages in `movement: 'tactical'` (+ `reactions: 'auto'`).

## How

The slice-750 resolver (`resolveAttackWithReactions`) gains an `isTactical` flag and a **Protection** branch in the cascade (after Shield, before Cutting Words), guarded on `isTactical` and a normal single-d20 attack (no advantage/disadvantage stacking):
- Read positions from `encounter.combatants[].position` (feet, slice 698). A protector candidate is a teammate (≠ target) with a shield equipped, `chebyshevDistance ≤ 5` ft of the target, and a reaction.
- Call `engine.plan.protection({ protectorId, attackerId, triggeringAttackEventId })` (it enforces the Protection fighting style — throwing, before any roll, for a shield-bearer without it). Recompute with the new pure `disadvantageFlipsHit(usedD20, newD20, attackBonus, targetAC)`: if the disadvantage reroll flips the hit to a miss, commit `dropDamageChain(attackEvents) + protection events`; else commit the full attack + protection events (the reaction is spent either way, RAW).

[combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) passes `isTactical: movement === 'tactical'` at the resolver call. No AI / build / pack change.

## Scope (per the user: build the positional layer + prove it)

The Protection fighting style is only an `OfferChoice` *option* in the pack (not a `featsTaken`-able feat), the fuzz never selects it, and tactical ally-adjacency is rare — so Protection **won't fire in random fuzz** (documented; no silent cap). The deliverable is the positional adjacency integration, proven by a **constructed test**. No pack content added (no doc-counts impact).

## Files

- `scripts/reactions/pre-damage-policy.ts` — `isTactical` arg + the Protection branch + `combatantPosition` helper (`chebyshevDistance` reused from [movement.ts](../../src/engine/plan/movement.ts)).
- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) — pass `isTactical` at the resolver call.
- [src/ai/reactions.ts](../../src/ai/reactions.ts) + [src/ai/index.ts](../../src/ai/index.ts) — `disadvantageFlipsHit`.

## Tests

- [tests/unit/ai/reactions.test.ts](../../tests/unit/ai/reactions.test.ts) — `disadvantageFlipsHit` (flips a marginal hit on a lower reroll; doesn't when the lower roll still clears AC or the reroll is higher).
- [tests/unit/reactions/protection-resolver.test.ts](../../tests/unit/reactions/protection-resolver.test.ts) — NEW. Constructed deterministic gate: two allies 5 ft apart, protector with Protection + shield, an enemy hit on the other ally → `ProtectionUsed` fires, damage is dropped exactly when the reroll flips, and the (sliced) log replays equivalently; an out-of-range (>5 ft) protector does NOT react (the hit lands).
- [tests/audit/fuzz-reactions-matrix.test.ts](../../tests/audit/fuzz-reactions-matrix.test.ts) — tactical + `reactions:'auto'` battles complete and replay equivalently (the adjacency scan doesn't break tactical battles).
- [tests/integration/fuzz-reactions-default-guard.test.ts](../../tests/integration/fuzz-reactions-default-guard.test.ts) — tactical-`'none'` emits no `ProtectionUsed` and normalized-equals the default tactical run (the resolver is auto-only).

No existing goldens/fuzz change. Full `npx vitest run` green.

## Status

This completes the combat-fuzz reaction layer's reactive windows (damage / attack / cast / save) plus the positional reaction. Only the clean engine two-phase attack API (RAW-perfect transcripts / interactive consumers) remains deferred.
