# Slice 756 — bonus-action affordances: metered amount + creature targets

**Type:** Engine query surface (additive). Read-only affordance additions for the dnd-web Bonus Actions menu; no event shape or engine-dice change.

## Why

The browser viewer drives `engine.plan.useOption` from player input but couldn't drive **amount** or **target** selection for options like Lay on Hands: `BonusActionOption` didn't say an option needs an amount (or what the spendable pool is), and there was no query for an option's legal targets. The consumer was left to reconstruct touch/reach/range rules itself. This exposes both, additively.

## How

### `BonusActionOption` gains `requiresAmount` + `maxAmount?`
- `requiresAmount: boolean` mirrors the internal descriptor flag (true for the one metered option, Lay on Hands heal).
- `maxAmount?: number` (present iff `requiresAmount`) = the current value of the option's resource — the paladin's remaining Lay on Hands points. The UI offers 1..maxAmount; overheal clamping stays engine-side (the planner caps the effective heal).

### New `engine.query.bonusActionTargets(state, encounterId, combatantId, optionId)` → `BonusActionTarget[]`
Each `{ combatantId, position? }`. Returns the legal targets for a creature-target option, honoring the option's own reach + self / defeated rules, captured in a new per-descriptor `targeting` spec `{ rangeFeet, includeSelf, includeDefeated }`:
- **Lay on Hands heal / cure-poison**: touch (5 ft), self allowed, **includes the dying** (a 0-HP ally is the primary heal target).
- **Bardic Inspiration**: 60 ft, excludes self (RAW "a creature other than yourself"), excludes the dying (can't use the die).
- **Flurry of Blows**: reach (5 ft), excludes self, excludes the dying.

Range is chebyshev on the combatants' feet positions (the primitive the Protection resolver uses), so it works from combatant positions alone — no map / location required. In a positionless encounter the range gate is a no-op (positions are consumer scope per [engine-scope.md](../engine-scope.md); the consumer applies its own line-of-sight). The authoritative validity is still the planner at `useOption` time; this is the UI hint.

### Pattern-check within the file
Not just Lay on Hands: a `targeting` spec was added to **all four** creature-target options, so none gives the consumer a silent empty picker. A new test pins it — every `target: 'creature'` option must return a candidate when one is legal (the regression lock for the bug class).

A **sibling pattern-fix** in the spell-target affordance (`legalSpellTargets` was excluding downed allies from healing spells) ships separately as the next slice (757).

## Files

- [src/query/bonus-actions.ts](../../src/query/bonus-actions.ts) — `requiresAmount`/`maxAmount` on `BonusActionOption`; `BonusActionTarget` + `BonusActionTargeting` types; `targeting` on the four creature options; the `bonusActionTargets` query.
- [src/engine/index.ts](../../src/engine/index.ts) — `engine.query.bonusActionTargets` interface + wrapper.
- [src/query/index.ts](../../src/query/index.ts) + [src/index.ts](../../src/index.ts) — re-exports (`bonusActionTargets`, `BonusActionTarget`).

## Tests

- [tests/unit/query/bonus-actions.test.ts](../../tests/unit/query/bonus-actions.test.ts) — `requiresAmount`/`maxAmount` (tracks the pool); `bonusActionTargets` for Lay on Hands heal (self + adjacent incl. a dying ally, excludes the far creature; carries position), Cure Poison (touch range), Bardic (60 ft, no self/dying), Flurry (reach, no self), positionless (no range filter), non-creature / unknown id → `[]`; the pattern-lock (every creature-target option enumerates a target).
- Public-API exports contract snapshot updated (the two new symbols). Full `npx vitest run` green.

## Status

The consumer can now render Lay on Hands (amount slider + target picker) and every other bonus-action target picker straight from the engine. Additive query surface; `useOption` dispatch + event shapes unchanged.
