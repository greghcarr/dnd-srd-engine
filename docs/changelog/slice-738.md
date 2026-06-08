# Slice 738 — engine: Rogue Reliable Talent (L7)

**Type:** Engine feature (new marker effect + ability-check planner floor). Additive. Wires the Rogue L7 stub. Opens the L7 SRD-complete cycle.

SRD 5.2.1 Rogue L7 Reliable Talent: "Whenever you make an ability check that uses one of your skill or tool proficiencies, you can treat a d20 roll of 9 or lower as a 10."

## What changed

- New marker effect **`GrantReliableTalent`** (the marker pattern), surfaced as `effectStack.hasReliableTalent()`.
- `computeAbilityCheck` (the check derivation) now returns `hasReliableTalent` (from the effect stack) and `usesProficiency` (= a real skill proficiency contributed — proficient/expertise, NOT the half-proficiency floor, which RAW doesn't count as a proficiency you "have").
- `planAbilityCheck` floors the chosen d20 to 10 when `hasReliableTalent && usesProficiency && d20 < 10`. Applied after the Halfling Luck reroll, so the (possibly rerolled) chosen die is the one floored. The `d20: rolls` array still records the actual die face; the floor surfaces in `total` and a `reliable-talent` breakdown marker.
- Pack: the Rogue L7 `reliable-talent` feature gains `{ kind: 'GrantReliableTalent' }`.

## Scope notes

- "Skill **or tool** proficiencies": the engine's ability-check path models skill proficiency (`intent.skill`); there's no separate tool-check path, so the gate is skill-proficiency. Expertise counts (it's a proficiency); half-proficiency (Jack of All Trades) correctly does not (`proficiencyApplied` is only set by a real skill-proficiency contribution).
- RAW "you can treat" is auto-applied (the floor only ever helps), consistent with how the engine resolves always-beneficial options.

## Files

- [src/schemas/effects.ts](../../src/schemas/effects.ts): `GrantReliableTalent` (union + zod + `EFFECT_KINDS`).
- [src/effects/builder.ts](../../src/effects/builder.ts): `markReliableTalent()` / `hasReliableTalent()` + apply case.
- [src/derive/ability-check.ts](../../src/derive/ability-check.ts): `hasReliableTalent` + `usesProficiency` on `AbilityCheckResult`.
- [src/engine/plan/checks.ts](../../src/engine/plan/checks.ts): the d20-floor in `planAbilityCheck` (`RELIABLE_TALENT_FLOOR = 10`).
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Rogue L7 `reliable-talent` → `GrantReliableTalent`.
- [tests/unit/engine/slice-738-reliable-talent.test.ts](../../tests/unit/engine/slice-738-reliable-talent.test.ts) (new): an L7 rogue floors a low proficient (Athletics) check to 10; a non-proficient raw check isn't floored; a high roll is unchanged; a L6 rogue has no Reliable Talent.
- [README.md](../../README.md), [docs/concepts.md](../concepts.md), [docs/authoring-content-packs.md](../authoring-content-packs.md), [docs/status.md](../status.md): EFFECT_KINDS 67→68 (primitives 66→67).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. doc-counts updated; features coverage snapshot adds `rogue L7 reliable-talent`.

## Audit (Uncle Bob)

- **Reuse**: rides the existing `computeAbilityCheck` derivation + the planAbilityCheck d20 pipeline (alongside the Halfling Luck reroll); the marker mirrors the other check-side markers.
- **SRD-faithful**: floor of 10 on proficient checks only; expertise counts, half-prof doesn't; the actual die is preserved in the event.
- **Effect-driven**: no hardcoded class/level check in the planner — the feature carries the marker, gated by the derivation's `usesProficiency`.
