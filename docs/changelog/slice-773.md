# Slice 773 — bonus-action class features: Sacred Weapon + Intimidating Presence

**Type:** Engine query surface (additive). Extends `bonusActions` with the two deferred class-feature bonus actions.

## Why

After the class-feature *actions* (slices 769/772), the remaining class-feature affordances were bonus actions: Sacred Weapon (Oath of Devotion Paladin) and Intimidating Presence (Path of the Berserker Barbarian). Both are bonus-action planners already in the dispatch; they just needed registry entries.

## How

[src/query/bonus-actions.ts](../../src/query/bonus-actions.ts):
- `BonusActionParams` (+ `useOption`'s `UseOptionOptions`) gains `targetIds` for a multi-target option.
- **Sacred Weapon** (`target: 'self'`): `owns = hasSubclass(paladin, 'oath-of-devotion')`, `resourceId: 'channel-divinity'`, `extraReason` disables `already-active` while `sacred-weapon-active` is present (mirrors `planSacredWeapon`'s re-activation guard). RAW-gated on the Oath — the affordance is correctly **stricter** than `planSacredWeapon`, which only checks paladin + Channel Divinity (a known planner leniency; tightening the planner is a separate follow-up).
- **Intimidating Presence** (`target: 'none'`, `requires: ['targetIds']`): `owns = hasSubclass(barbarian, 'path-of-the-berserker', 14)` — a WIS-save-or-Frightened over the chosen creatures the consumer supplies.

Both already in the `planIntent` dispatch, so `useOption` routes them unchanged.

## Tests

[tests/unit/query/bonus-actions.test.ts](../../tests/unit/query/bonus-actions.test.ts) — slice 773 block:
- Sacred Weapon: offered to a Devotion paladin (`useOption` activates `sacred-weapon-active`); `already-active` while active; `no-uses` when Channel Divinity is spent; not offered to a non-Devotion paladin.
- Intimidating Presence: offered to a Berserker L14 (`useOption` frightens the targets); not offered below L14 or to a non-Berserker; `useOption` throws without `targetIds`.

Full `npx vitest run` green.

## Status

**All deferred class-feature affordances are now wired** — actions (Action Surge / Divine Spark / Turn Undead / Dragonborn Breath / Preserve Life) and bonus actions (Sacred Weapon / Intimidating Presence). The only remaining deferred affordance is the post-hit Paladin's Smite *feature* (a rider needing a "post-hit options" shape — distinct from the discoverable `divine-smite` spell).
