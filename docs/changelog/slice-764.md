# Slice 764 — general action affordances (G2): registry-driven `actionOptions`

**Type:** Engine query surface (additive). Closes completeness gap G2: `availableActions` was hardcoded to the five core combat intents, so the general SRD 2024 actions were drivable (all in the `performIntent` dispatch) but undiscoverable.

## Why

A consumer building an Action menu from `engine.query.*` could only see move / attack / dash / disengage / dodge. The general 2024 actions (Search, Study, Influence, Utilize, Hide, Grapple, Shove, Help, Ready) — which every creature can take — had planners and dispatch entries but no enumeration. This adds the registry-driven sibling of `availableActions`, mirroring `bonusActions`/`availableReactions`.

## How

New module [src/query/action-options.ts](../../src/query/action-options.ts) + a `useActionOption` executor:

- `engine.query.actionOptions(state, encounterId, combatantId)` → `ActionOption[]` (`{ id, label, target, enabled, reason? }`). The nine general actions, enabled on the actor's turn, disabled with a machine-readable reason (a blocking condition / `not-your-turn` / `action-used`). All cost the action (uniform gating), so the registry needs no per-action reason logic.
- `actionIntent(optionId, combatantId, params)` (barrel export) maps an id (+ `ActionParams`: `targetId` / `mode` / `trigger` / `skill` / `dc` / …) to its planner intent, throwing on an unknown id or a missing required param (Grapple → `targetId`; Shove / Help → `targetId` + `mode`; Ready → `trigger`).
- `engine.plan.useActionOption(state, { combatantId, optionId, ...params })` → `PlanResult` — the sibling of `useOption`: builds the intent via `actionIntent` and routes it through the shared `planIntent` table (so dice flow through the active RollProvider and the planner re-validates). No `performIntent`/typed-intent friction for the consumer.

An Action menu unions `availableActions` (the 5 core), `actionOptions` (these general actions), and `castableSpells` filtered to action-time casts.

## Scope

The universal general actions. **Deferred** (documented): class-feature actions — Action Surge (its inverted "grants an extra action" economy doesn't fit the uniform `action-used` gate), Turn Undead / Divine Spark / Preserve Life / Breath Weapon (resource + multi-target / AoE). Creature-target candidate enumeration for Grapple / Shove / Help reuses the consumer's `legalTargets` (reach-based); a dedicated action-target query is a possible follow-up.

## Files

- [src/query/action-options.ts](../../src/query/action-options.ts) — the registry, `actionOptions`, `actionIntent`.
- [src/engine/index.ts](../../src/engine/index.ts) — `engine.query.actionOptions` + `engine.plan.useActionOption` (+ `UseActionOptionOptions`).
- [src/query/index.ts](../../src/query/index.ts) + [src/index.ts](../../src/index.ts) — re-exports + types.
- [tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts) — `useActionOption` allowlisted (a dispatcher, like `useOption`).

## Tests

- [tests/unit/query/action-options.test.ts](../../tests/unit/query/action-options.test.ts) — enumeration (all nine enabled on-turn, with target kinds; `not-your-turn` / `action-used` / blocking-condition disables); `useActionOption` routes Search + Grapple through their planners (accepted); `actionIntent` throws on an unknown id and each missing required param.
- Public-API exports contract snapshot updated (7 new symbols).

Full `npx vitest run` green.

## Status

Completes the affordance-completeness builds (G1 reactions in 763, G2 general actions here) and the affordance-correctness sweep (758-761) + G3 (762). The general-action layer is framework-ready for the deferred class-feature actions.
