# Slice 771 — actionTargets query (target enumeration for creature-target actions)

**Type:** Engine query surface (additive). The symmetric finish to the action affordance layer — the `bonusActionTargets` sibling for the Action menu.

## Why

The creature-target general/class actions (Grapple, Shove, Help, Divine Spark) were drivable and discoverable (slices 764/769) but had no target enumeration — a consumer had to reuse `legalTargets` (attack reach) or hardcode each one's range/self/defeated rules. This adds `actionTargets`, mirroring `bonusActionTargets`, and factors the shared enumeration out of `bonus-actions.ts` so the two can't drift.

## How

- New [src/query/_targeting.ts](../../src/query/_targeting.ts): `creatureTargetsInReach(state, encounterId, combatantId, targeting)` — the shared enumerator (chebyshev on positions; positionless / undefined `rangeFeet` → no range filter; `includeSelf` / `includeDefeated` filters). `CreatureTargeting` now allows an undefined `rangeFeet` for consumer-managed ranges.
- [src/query/bonus-actions.ts](../../src/query/bonus-actions.ts) **refactored** to use it: `BonusActionTarget` = the shared `CreatureTarget`, the descriptor's `targeting` is the shared `CreatureTargeting`, and `bonusActionTargets` delegates to `creatureTargetsInReach` (its inline copy removed). Behavior unchanged (52 tests green).
- [src/query/action-options.ts](../../src/query/action-options.ts): a `targeting` spec on the four creature-target actions + the `actionTargets(state, encounterId, combatantId, optionId)` query (exposed on `engine.query.*`). Specs:
  - **Grapple / Shove** — 5 ft, no self, no defeated.
  - **Help** — no range filter (the 5-ft / see-and-hear gate is consumer-managed; `planHelp` doesn't range-check), never self.
  - **Divine Spark** — 30 ft, self allowed (self-heal), **includes the dying** (heal mode revives a downed ally; the consumer picks mode + target, the planner validates).

## Tests

[tests/unit/query/action-options.test.ts](../../tests/unit/query/action-options.test.ts) — slice 771 block: Grapple/Shove (within 5 ft, no self/far); Help (no range filter, no self); Divine Spark (within 30 ft incl. self + a dying ally, excludes the far one); non-creature / unknown → `[]`. `bonusActionTargets` tests stay green through the refactor.

Full `npx vitest run` green.

## Status

The action affordance layer is symmetric with the bonus-action one (enumerate → target → execute). Remaining deferred items are the larger follow-ups noted in [slice-764.md](slice-764.md) / [slice-768.md](slice-768.md): more class-feature actions (Breath Weapon, Preserve Life, Sacred Weapon, Intimidating Presence) and the post-hit Paladin's Smite *feature* affordance.
