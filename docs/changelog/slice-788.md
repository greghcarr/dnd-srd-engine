# Slice 788 — monster `actions`: the queryable natural-weapon link

**Type:** Engine schema field + content (populate) + canonical-consumer rewire + a query + a pack-integrity guard. The **enabler** of the [L7 audit](../l7-completion-audit.md) monster-actions pair — **closes `no-actions-field`** (Area 7). The `multiattack-unpopulated` content sweep follows (slices 789+).

## The gap

A `MonsterStatblock` had no way to express *what a single-attack monster attacks with*. Multiattackers carried a `multiattack` field (weapon-definition-keyed), but a Wolf's bite was unlinked — so every consumer **hardcoded `wolf → wolf-bite`** and diverged. The engine's own canonical consumer, combat-fuzz, did exactly this: a private `MONSTER_OPTIONS` map pairing each monster id with a weapon id.

## The fix

- **New `MonsterStatblock.actions: [{ name, weaponId }]`** (`src/schemas/content/monster.ts`) — the monster's attack options, each linking a weapon **definition** id in the pack (a natural weapon like `wolf-bite`, or a mundane weapon like `scimitar`). `multiattack` still groups these into a per-turn pattern; `actions` is the queryable menu (primary first).
- **`monsterAttackActions(content, statblockId)`** (`src/query/content-query.ts`, exported + on the public barrel) — resolves each action's `weaponId` to its weapon definition, so a consumer queries the Wolf's Bite (`{ name, weaponId, weapon }`) instead of hardcoding it. Degrades to `[]` for an unknown or not-yet-authored statblock.
- **Pack-integrity guard** (`tests/audit/pack-integrity.test.ts`) — every `actions[].weaponId` *and* every `multiattack.attacks[].weaponId` must name a weapon definition in the pack, so the link can't dangle silently.
- **combat-fuzz rewired off the hardcoded map** — `MONSTER_OPTIONS` is now `{ id, primary, secondary }` (just the ability priorities the build pool needs); `buildMonster` sources the attack weapon from `statblock.actions[0].weaponId`. The private monster→weapon map is gone. Each populated `actions[0].weaponId` equals the harness's prior hardcoded id, so every fuzz matrix / integration / golden transcript stays **byte-identical** (verified on the full gate).
- **Populated `actions`** on the 25 statblocks combat-fuzz exercises (the canonical-consumer set). The remaining ~229 statblocks default to `actions: []` and are filled by the multiattack sweep.

## Scope / deferred

- Full `actions` population across all in-scope statblocks ships with the `multiattack-unpopulated` sweep (slices 789+), which authors `actions` + `multiattack` together per monster, SRD-verified by CR band.
- `actions` lists *weapon attacks*; breath weapons (`breathWeapon`) and other special actions remain their own fields.

## Tests

- **New** `tests/unit/query/slice-788-monster-actions.test.ts` (6): `monsterAttackActions` resolves a beast's natural weapon to its definition; lists a multi-weapon monster's options in order (Scout: Shortsword + Longbow); returns `[]` for an unknown statblock and for one with no authored actions (Tarrasque, pre-sweep); the schema defaults `actions` to `[]`; the 25 combat-fuzz monsters all carry a primary action.
- `tests/audit/pack-integrity.test.ts` (+2): the action / multiattack weaponId resolution guards.
- `tests/contract/exports.test.ts.snap`: +`monsterAttackActions`, `ResolvedMonsterAction`.

## Verification

`npx tsc --noEmit` clean; full `npm test` green (596 files, 4699 passed) — including every combat-fuzz tier, confirming the consumer rewire is byte-identical.
