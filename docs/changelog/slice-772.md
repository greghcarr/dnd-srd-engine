# Slice 772 — more class-feature actions (Dragonborn Breath + Preserve Life)

**Type:** Engine query surface (additive). Extends `actionOptions` with the remaining deferred action-cost feature actions.

## Why

Slice 769 wired Action Surge / Divine Spark / Turn Undead and the slice-764 doc listed Preserve Life + Breath Weapon as the remaining `actionOptions` class-feature deferrals. Both are modelled as Action-cost features (Breath Weapon is a documented Action deviation from "replace one of your attacks"), so they fit the registry now that it carries `owns` + resource + varied params.

## How

[src/query/action-options.ts](../../src/query/action-options.ts) — two registry entries (`target: 'none'`, AoE/multi-target via consumer-supplied ids), plus `ActionParams` / `UseActionOptionOptions` gaining `damageType`, `areaShape`, and `allocations`:

- **Dragonborn Breath** (`planDragonbornBreath`, the PC species breath — not the monster `planBreathWeapon`): `owns = speciesId === 'dragonborn'`, `resourceId: 'dragonborn-breath-weapon'`, `requires: ['targetIds', 'damageType', 'areaShape']` (the consumer supplies the affected ids, the Draconic-Ancestry damage type, and the chosen `'cone' | 'line'` shape).
- **Preserve Life** (`planPreserveLife`, Life Domain Cleric L3 Channel Divinity): `owns` = a `cleric` enrollment with `subclassId === 'life-domain'`, `resourceId: 'channel-divinity'`, `requires: ['allocations']` (the heal-pool distribution among Bloodied allies).

Both are already in the `planIntent` dispatch, so `useActionOption` routes them unchanged.

## Tests

[tests/unit/query/action-options.test.ts](../../tests/unit/query/action-options.test.ts) — slice 772 block:
- Dragonborn Breath: offered to a Dragonborn (`useActionOption` with `targetIds`/`damageType`/`areaShape` accepted); `no-uses` when the breath is spent; not offered to a non-Dragonborn; `actionIntent` requires all three params.
- Preserve Life: offered to a Life Domain Cleric (`useActionOption` heals a Bloodied ally); not offered to a non-Life-Domain cleric; `no-uses` when Channel Divinity is spent; `actionIntent` requires `allocations`.

Full `npx vitest run` green.

## Status

The `actionOptions` class-feature actions are complete (Action Surge / Divine Spark / Turn Undead / Dragonborn Breath / Preserve Life). Remaining deferred: the **bonus-action** class features (Sacred Weapon, Intimidating Presence) — a `bonusActions` registry addition — and the post-hit Paladin's Smite *feature* affordance. `Multiattack` / `Cleave` are attack-economy follow-ups, not standalone menu actions.
