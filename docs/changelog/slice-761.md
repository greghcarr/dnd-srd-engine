# Slice 761 — bonusActions gates on the encounter being active

**Type:** Bug fix (query affordance). Affordance-correctness sweep.

## Why

`bonusActions` computed `isActiveTurn` as `combatants[activeIndex]?.combatantId === combatantId` with no check on the encounter's status. A `'planning'` (created-but-not-started) encounter has `activeIndex` defaulting to 0 and no `state.activeEncounterId`, so combatant 0 was reported as on its turn — and the encounter-only options (Cunning Action, Patient Defense, Step of the Wind, Adrenaline Rush, Nimble Escape, Flurry of Blows) came back **enabled**. Their planners read `state.activeEncounterId` and throw "can only be used in an active encounter," so the query enabled options the planner rejects.

## How

[src/query/bonus-actions.ts](../../src/query/bonus-actions.ts) — `isActiveTurn` now requires `encounter.status === 'active'` (mirroring `encounter-view`'s `active` gate). In a non-active encounter every option falls through to `not-your-turn`, matching the planner.

## Tests

[tests/unit/query/bonus-actions.test.ts](../../tests/unit/query/bonus-actions.test.ts) — a Rogue in a created-but-not-started encounter: `cunning-action-dash` is `{ enabled: false, reason: 'not-your-turn' }`, and a planner cross-check confirms `useOption('cunning-action-dash')` throws.

Full `npx vitest run` green.

## Status

Closes the affordance-correctness sweep's query/planner-fidelity findings (siblings: 758, 759, 760). Remaining sweep design-questions (the `allow` field not filtering by team; `encounter-view` HP omitting `maxBonus`) were noted but are not query/planner contradictions; left as-is / future enhancement.
