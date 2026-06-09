# Slice 762 — bonus-action registry: Innate Sorcery + Off-Hand Attack

**Type:** Completeness (affordance layer). Adds the two cleanly-fitting bonus-action features the completeness sweep found missing from the `bonusActions` registry.

## Why

The completeness sweep flagged six bonus-action planners absent from the `bonusActions` registry (drivable but undiscoverable). Two fit the registry's shape cleanly; the rest need structural extensions (see Deferred). This adds the two clean ones so a consumer's Bonus Actions menu surfaces them.

## How

[src/query/bonus-actions.ts](../../src/query/bonus-actions.ts):
- **Innate Sorcery** (Sorcerer, self): `owns: hasClass(sorcerer)`, spends the `innate-sorcery` resource, disabled `already-active` while `innate-sorcery-active` is present (mirrors `planInnateSorcery`'s re-activation guard, the same shape as Rage).
- **Off-Hand Attack** (two-weapon, creature target): available when the character wields a `light` weapon — the property `planOffHandAttack` gates on. This is equip-state, not a class feature, so the descriptor's `owns` signature was widened from `(character)` to `(character, state, content)` (most descriptors ignore the extra args; only Off-Hand Attack reads equipped gear). `requiresWeapon`, reach-5 ft `targeting`.
- Wiring: `InnateSorcery` added to the `planIntent` dispatch ([conveniences.ts](../../src/engine/conveniences.ts)) — `useOption` routes through it — and removed from the planner-wiring audit's `EXCLUDED_FROM_DISPATCH` allowlist. `OffHandAttack` was already dispatched.

## Deferred (documented, not added)

- **Paladin's Smite** — needs `slotLevel` + a triggering-attack-event id; it's a post-hit rider, spell-shaped in 2024, not a standalone menu pick.
- **Conjure Pact Weapon** — needs a weapon-*definition* choice (which weapon to conjure), not a target/instance; a conjuration with its own picker.
- **Clouds Jaunt** — needs a destination `Position` (a teleport); driven by a position picker like movement, not the target picker.
- **Metamagic** — a spell-cast modifier, not a standalone bonus action (excluded like Frenzy).

Adding the first three would require extending `BonusActionParams` (slot / weapon-definition / destination) + dispatch; tracked as a future affordance slice.

## Tests

[tests/unit/query/bonus-actions.test.ts](../../tests/unit/query/bonus-actions.test.ts) — Innate Sorcery enabled + `useOption` activates it (emits `innate-sorcery-active`); disabled `already-active` while active; Off-Hand Attack appears only with a light weapon (dagger) and `useOption` strikes (`AttackRolled`), absent with a longsword. planner-wiring audit stays green (the dispatch move).

Full `npx vitest run` green.

## Status

Closes the cleanly-fitting part of completeness gap G3. The reaction-affordance query (G1) and the registry-driven action surface (G2) are the larger remaining gaps.
