# Slice 769 — action affordances: class-feature actions (Action Surge / Divine Spark / Turn Undead)

**Type:** Engine query surface (additive). The last deferred affordance work — wires the class-feature actions into `actionOptions`.

## Why

Slice 764's `actionOptions` covered the universal general actions with uniform gating (everyone owns them, all cost the action, no resources). The class-feature actions were deferred because they break that uniformity: Action Surge *grants* an extra action (so it isn't gated on `action-used`), and the Cleric Channel Divinity actions cost a resource + take varied targets. This grows `actionOptions` to the `bonusActions` shape (per-descriptor `owns` + resource + `costsAction`) and wires them.

## How

[src/query/action-options.ts](../../src/query/action-options.ts):
- `ActionDescriptor` gains `owns?` (default = every creature), `resourceId?` (disables `no-uses` when spent), and `costsAction?` (default true). `actionOptions` now computes a **per-descriptor** reason: blocker → `not-your-turn` → (if `costsAction !== false`) `action-used` → (if `resourceId` depleted) `no-uses`.
- `ActionParams` gains `targetIds?` (an AoE list); `UseActionOptionOptions` threads it.
- **Action Surge** (Fighter, `action-surge` resource, `costsAction: false`): stays enabled after the action is used — it grants another (matching `planActionSurge`).
- **Divine Spark** (Cleric, `channel-divinity`, `target: 'creature'`, `requires: ['targetId', 'mode']`): heal/damage a creature.
- **Turn Undead** (Cleric, `channel-divinity`, `requires: ['targetIds']`): the consumer supplies the undead in range.

All three are already in the `planIntent` dispatch, so `useActionOption` routes them with no wiring change.

## Tests

[tests/unit/query/action-options.test.ts](../../tests/unit/query/action-options.test.ts) — slice 769 block:
- Action Surge: offered to a Fighter and **stays enabled after the action is used** (general actions go `action-used`), `useActionOption` accepted; `no-uses` when spent; not offered to a non-Fighter.
- Divine Spark: offered to a Cleric (`useActionOption` heals a target); Turn Undead: offered, `actionIntent` requires `targetIds`, `useActionOption` accepted; both `no-uses` when Channel Divinity is spent.

Full `npx vitest run` green.

## Status

**The deferred affordance program is complete.** Reactions (765-767): all 9 wired. Bonus actions (768): Cloud's Jaunt + Conjure Pact Weapon (Smite is the `divine-smite` spell; Metamagic excluded). Actions (769): Action Surge + Divine Spark + Turn Undead. Every addition is planner-faithful — its `owns`/`correlate` matches what the planner accepts, verified by dispatching the built/correlated intent.
