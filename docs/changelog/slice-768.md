# Slice 768 — bonus-action registry: Cloud's Jaunt + Conjure Pact Weapon

**Type:** Engine query surface (additive). Wires the remaining bonus-action deferrals.

## Why

Slice 762 deferred four bonus-action planners. One resolves on inspection: **Paladin's Smite** is already discoverable — `divine-smite` is a Bonus Action *spell* in `castableSpells` (filter `castingTime === 'bonus-action'`); `planPaladinsSmite` is the separate post-hit *feature* (a rider keyed on the triggering attack), not a standalone menu pick. **Metamagic** stays excluded (a spell-cast modifier, like Frenzy). The other two now fit the registry once their params are added:

- **Cloud's Jaunt** — a Goliath teleport; `owns` is the resolved Cloud's Jaunt Giant Ancestry; the param is a destination cell.
- **Conjure Pact Weapon** — a Warlock Pact-of-the-Blade conjuration; `owns` is the invocation; the param is which weapon to conjure.

## How

[src/query/bonus-actions.ts](../../src/query/bonus-actions.ts):
- `BonusActionParams` gains `to?: Position` (teleport destination) and `weaponDefinitionId?: string` (conjuration choice); `engine.plan.useOption`'s `UseOptionOptions` threads both.
- The descriptor gains `requires?: ReadonlyArray<keyof BonusActionParams>` — `bonusActionIntent` throws if a listed param is missing (generalising the existing per-param checks).
- **Cloud's Jaunt** (`target: 'none'`, `requires: ['to']`): `owns = findGoliathAncestryChoice(c, state) === 'clouds-jaunt'` (planner-faithful — the resolved ancestry, not just species), `resourceId: 'giant-ancestry'` (depletion → `no-uses`). `toIntent` → `{ CloudsJaunt, goliathId, to }`.
- **Conjure Pact Weapon** (`target: 'none'`, `requires: ['weaponDefinitionId']`): `owns = buildEffectStack(...).hasPactBlade()` (the gate `planConjurePactWeapon` enforces). `toIntent` → `{ ConjurePactWeapon, characterId, weaponDefinitionId }`.

Both planners are already in the `planIntent` dispatch, so `useOption` routes them with no wiring change.

## Tests

[tests/unit/query/bonus-actions.test.ts](../../tests/unit/query/bonus-actions.test.ts) — slice 768 block:
- Cloud's Jaunt: offered to a Goliath who resolved the ancestry (`useOption` with `to` emits `CombatantMoved`); NOT offered without the resolved ancestry; `useOption` throws without a destination.
- Conjure Pact Weapon: offered to a Pact-of-the-Blade warlock (`useOption` with `weaponDefinitionId` conjures); NOT offered without the invocation; throws without `weaponDefinitionId`.

Full `npx vitest run` green.

## Status

The bonus-action registry is complete for the deferred set: Cloud's Jaunt + Conjure Pact Weapon wired here, Paladin's Smite discoverable as the `divine-smite` bonus-action spell (post-hit feature is a rider), Metamagic excluded. The last deferred work is the class-feature *actions* (Action Surge / Turn Undead / Divine Spark).
