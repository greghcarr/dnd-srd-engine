# Slice 757 — pattern-fix: healing spells can target a dying ally (`legalSpellTargets`)

**Type:** Bug fix (query affordance). The pattern-check sibling of [slice-756.md](slice-756.md): the same "heal target enumeration excludes the dying" bug, in the spell-target affordance.

## Why

While adding `bonusActionTargets` (slice 756) I had to make Lay on Hands' heal target the dying (a 0-HP ally is the primary heal target). Pattern-checking the other target-affordance surface surfaced the same bug in `legalSpellTargets`: it routes every creature-target spell through `creatureCandidatesInRange`, which filtered out every defeated (`hp.current <= 0`) combatant unconditionally. So a **downed ally was excluded from a healing spell's legal targets** — and reviving a creature at 0 HP (Healing Word / Cure Wounds / Mass Healing Word) is exactly their primary combat use. No test pinned it.

## How

`creatureCandidatesInRange` ([src/query/affordances.ts](../../src/query/affordances.ts)) gains an `includeDefeated: boolean` parameter: defeated creatures stay excluded by default (offensive / buff spells), but are kept in when set. `legalSpellTargets` passes `includeDefeated = resolves === 'heal'` (the existing `spellResolves` signal — `heal` covers `heal` + `temp-hp` mechanics). Offensive (`attack` / `save`) and `buff` spells are unchanged (still exclude the dying), so this only widens the heal case.

The query is the UI hint; the cast-spell planner stays the authority on what a specific heal can actually do (e.g. it won't revive the truly dead — the affordance's `hp <= 0` test doesn't distinguish dying from dead, but the planner does).

## Files

- [src/query/affordances.ts](../../src/query/affordances.ts) — `creatureCandidatesInRange` gains `includeDefeated`; `legalSpellTargets` passes `resolves === 'heal'`.

## Tests

- [tests/unit/query/spell-affordances.test.ts](../../tests/unit/query/spell-affordances.test.ts) — Healing Word's legal targets include a creature brought to exactly 0 HP (dying); an offensive spell (Fire Bolt) still excludes it. (The existing Cure Wounds "includes the caster" test stays green.)

Full `npx vitest run` green.

## Status

Closes the heal-targets-the-dying bug across both target-affordance surfaces (bonus-action options in slice 756, spells here). `legalTargets` (the offensive attack-target query) correctly keeps excluding the defeated — checked, not a heal surface.
