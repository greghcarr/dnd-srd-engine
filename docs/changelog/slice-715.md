# Slice 715 — engine: complete the bonus-action surface

**Type:** Engine read-layer + dispatcher extension (`engine.query.bonusActions` / `engine.plan.useOption`). Additive; no new event schema; reuses existing planners. Interactive-play follow-up that closes the slice-714 bonus-action deferrals.

Slice 714 covered the bonus-action features expressible from `(combatantId, targetId)`. This slice grows `useOption` with a small param bag so the metered / strike features fit too, and adds the non-class bonus actions.

## 1. `useOption` param bag

`engine.plan.useOption(state, { combatantId, optionId, targetId?, amount?, weaponInstanceId? })`. Two new optional fields:

- `amount` — Hit Points to restore for a metered heal (Lay on Hands heal).
- `weaponInstanceId` — the unarmed-strike item instance for a strike (Flurry of Blows; consumer-managed, same as any attack).

`bonusActionIntent(optionId, combatantId, params?)` now takes a `BonusActionParams` bag and throws a clear error when a required param is missing (`requires a targetId` / `requires an amount` / `requires a weaponInstanceId`).

## 2. New `bonusActions` options

| id | feature | target | extra param | planner |
|---|---|---|---|---|
| `lay-on-hands-heal` | Paladin Lay on Hands (heal) | creature | `amount` | `planLayOnHands` |
| `flurry-of-blows` | Monk L2 Flurry of Blows | creature | `weaponInstanceId` (+ Focus Point) | `planFlurryOfBlows` |
| `adrenaline-rush` | Orc Adrenaline Rush (Dash + temp HP) | none | — | `planAdrenalineRush` |
| `nimble-escape-disengage` / `nimble-escape-hide` | Goblin Nimble Escape | none | — | `planNimbleEscape` |

Ownership for Nimble Escape reuses the planner's own statblock allowlist via a newly-exported `characterHasNimbleEscape` (mirrors slice 714's `characterHasCunningAction`). Adrenaline Rush gates on `speciesId === 'orc'`; Flurry on Monk L2 + a Focus Point (`no-focus` when ki is 0).

## Frenzy: intentionally excluded

The slice-714 note listed Frenzy (Berserker) as a deferred bonus action. On inspection it is **not** one: `planFrenzy` consumes a Rage charge and applies the `frenzied` condition (a Rage modifier), emitting no `ActionEconomyConsumed`. It belongs with Rage, not the Bonus Actions menu, so it is deliberately not enumerated. (Pattern-check: verify against the planner before adding.)

## Files

- [src/query/bonus-actions.ts](../../src/query/bonus-actions.ts): `BonusActionParams`; `bonusActionIntent` validates amount/weapon; five new registry entries; descriptor `requiresAmount` / `requiresWeapon`.
- [src/engine/plan/nimble-escape.ts](../../src/engine/plan/nimble-escape.ts): `characterHasNimbleEscape` exported + used internally.
- [src/engine/index.ts](../../src/engine/index.ts): `UseOptionOptions` gains `amount` / `weaponInstanceId`; `useOption` forwards the bag.
- [src/query/index.ts](../../src/query/index.ts), [src/index.ts](../../src/index.ts): export `BonusActionParams`.
- [tests/unit/query/bonus-actions.test.ts](../../tests/unit/query/bonus-actions.test.ts): +11 tests (30 total) — enumeration for Orc / Goblin / Paladin-heal / Monk-Flurry, the Frenzy-absent assertion, dispatch for each new option, and missing-amount / missing-weapon throws.
- [docs/api-overview.md](../../docs/api-overview.md): documents the param bag + new options.
- [tests/contract/__snapshots__/exports.test.ts.snap](../../tests/contract/__snapshots__/exports.test.ts.snap): `BonusActionParams` (`-u`).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. The planner-wiring audit still passes (the new options reuse already-routed planners; no new `engine.plan` method).

## Audit (Uncle Bob)

- **Reuse over duplication**: Nimble Escape ownership reuses the planner's allowlist (`characterHasNimbleEscape`); dispatch reuses the existing planners via the shared `planIntent` table.
- **Verify against source**: Frenzy excluded after reading its planner (no bonus-action consumption); Flurry's `weaponInstanceId` requirement honored (attacks always need an item instance).
- **Single source of truth**: one REGISTRY still backs enumeration + dispatch; the param-bag validation lives once in `bonusActionIntent`.
- **Determinism / byte-identity**: options sorted by id; `useOption` delegates unchanged dice paths through the RollProvider.

## Open follow-ups

- A consumer that wants Flurry without tracking an unarmed-strike instance would need the engine to resolve a default one; deferred (the engine's stance is that the consumer manages item instances).
