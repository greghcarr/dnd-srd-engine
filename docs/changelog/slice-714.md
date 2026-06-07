# Slice 714 — engine: bonus-action affordances (bonusActions + useOption)

**Type:** Engine read-layer (`engine.query.*`) + a generic plan executor (`engine.plan.useOption`). Enumeration is additive, pure, read-only; the executor reuses existing planners (no rules duplication, no new event schema). Interactive-play part 2 of the spell/bonus-action set (priority (b)).

The dnd-web duel needs to populate a Bonus Actions menu from engine affordances and perform a chosen option by id — without hardcoding which planner each feature routes to. One registry (`src/query/bonus-actions.ts`) is the single source of truth for both halves, so enumeration and dispatch can't drift.

## 1. `bonusActions(state, encounterId, combatantId)`

Returns the bonus-action options a combatant **owns**, each:

- `id` — stable option id (pass back to `useOption`).
- `label` — human-readable.
- `target: 'none' | 'self' | 'creature'` — what the UI must pick before performing it.
- `enabled` — usable right now.
- `reason?` — machine-readable when disabled: a blocking-condition id (`incapacitated` / `stunned` / ...), or one of `not-your-turn` / `bonus-action-used` / `no-uses` / `no-focus` / `heavy-armor` / `already-dashed` / `already-disengaged`.

Options sorted by id (deterministic). Ownership is per feature (class / level / statblock); usability layers blocking conditions, active-turn, bonus-action-spent, resource pool, Focus Point, and feature-specific blocks (Rage in Heavy armor, dash/disengage already taken). The enumeration is a hint; `useOption` → the planner is the authoritative gate.

Covered options (the bonus-action features whose intent is expressible from `(combatantId, targetId)` alone):

| id | feature | target | planner |
|---|---|---|---|
| `second-wind` | Fighter Second Wind | self | `planSecondWind` |
| `rage` | Barbarian Rage | self | `planRage` |
| `cunning-action-dash` / `-disengage` / `-hide` | Rogue L2 / Cunning Action statblock | none | `planCunningAction` |
| `patient-defense` / `patient-defense-focus` | Monk L2 Patient Defense | none | `planPatientDefense` |
| `step-of-the-wind` / `step-of-the-wind-focus` | Monk L2 Step of the Wind | none | `planStepOfTheWind` |
| `bardic-inspiration` | Bard Bardic Inspiration | creature | `planBardicInspiration` |
| `lay-on-hands-cure-poison` | Paladin Lay on Hands (cure poison) | creature | `planLayOnHands` |

## 2. `useOption(state, { combatantId, optionId, targetId? })`

Generic executor: maps the option id (+ optional target) to its planner's intent and returns that planner's `PlanResult`. The UI performs an enumerated bonus action by id without constructing each feature's bespoke intent. Throws on an unknown id or a missing required target; the planner re-validates everything else and dice route through the active RollProvider (slice 704), because `useOption` delegates to the same plan path every other action uses.

Implementation: `bonusActionIntent(optionId, combatantId, targetId)` builds the intent; `engine.plan.useOption` dispatches it through `planIntent` — the plan-only dispatch table extracted from `performIntent` (so `performIntent` and `useOption` share one table, not two).

## Bonus-action spells

Bonus-action **spells** stay in `castableSpells` (slice 713), surfaced by filtering `castingTime === 'bonus-action'` (e.g. Healing Word). They are NOT in `bonusActions`, which covers class/feature bonus actions only. A UI's Bonus Actions menu unions the two sources.

## Files

- [src/query/bonus-actions.ts](../../src/query/bonus-actions.ts) (new): the registry + `bonusActions` enumeration + `bonusActionIntent` dispatch builder.
- [src/engine/plan/cunning-action.ts](../../src/engine/plan/cunning-action.ts): `characterHasCunningAction` exported so the registry predicts ownership with the planner's own predicate.
- [src/engine/conveniences.ts](../../src/engine/conveniences.ts): extracted `planIntent(plan, state, intent)` from `performIntent`; both use it.
- [src/engine/index.ts](../../src/engine/index.ts): `engine.query.bonusActions` + `engine.plan.useOption` + `UseOptionOptions`.
- [src/query/index.ts](../../src/query/index.ts), [src/index.ts](../../src/index.ts): barrel exports (`bonusActions` / `bonusActionIntent` + types `BonusActionOption` / `BonusActionTargetKind` / `BonusActionIntent` / `UseOptionOptions`).
- [tests/unit/query/bonus-actions.test.ts](../../tests/unit/query/bonus-actions.test.ts) (new): 19 tests (enumeration per class + enabled/reason + ordering; dispatch per option + unknown-id / missing-target throws + dice via a SuppliedRollProvider).
- [docs/api-overview.md](../../docs/api-overview.md): documents both.
- [tests/contract/__snapshots__/exports.test.ts.snap](../../tests/contract/__snapshots__/exports.test.ts.snap): new public names (`-u`, intended additions only).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No event schema change; `performIntent` refactor verified by its existing tests.

## Audit (Uncle Bob)

- **UI reads, doesn't wire**: enumeration carries everything a menu needs; `useOption` performs by id — the UI never names a planner.
- **One source of truth**: a single REGISTRY backs both enumeration and dispatch, so an option can't be offered without a dispatch (or vice versa).
- **Reuse, no duplication**: `useOption` delegates to the existing planners via the dispatch table extracted from `performIntent` (no second dispatch); ownership for Cunning Action reuses the planner's own `characterHasCunningAction` predicate.
- **Byte-identity**: `performIntent` now calls the extracted `planIntent` (same table, same order); dice flow unchanged.
- **Determinism**: options sorted by id; reasons are a fixed precedence.
- **Single responsibility**: `owns` (inclusion) vs `disabledReason` (usability) vs `toIntent` (dispatch) are separate per descriptor.

## Open follow-ups (next slice)

- ~~Options needing a param beyond a target keep their dedicated planner (documented deferrals): Flurry of Blows (`weaponInstanceId`), Lay on Hands **heal** (`amount`). A future `useOption` could grow an optional params bag.~~ **Closed by slice 715** (`useOption` grew a `{ targetId, amount, weaponInstanceId }` param bag).
- ~~Non-class bonus actions not yet enumerated: Adrenaline Rush (Orc species), Nimble Escape (Goblin statblock), Frenzy (Berserker subclass). Add when the duel needs them.~~ **Closed by slice 715** for Adrenaline Rush + Nimble Escape. Frenzy was reclassified: on inspection its planner is a Rage modifier (consumes a Rage charge + applies `frenzied`, no `ActionEconomyConsumed`), not a bonus action, so it is intentionally NOT enumerated.
