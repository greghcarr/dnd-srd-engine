# Slice 663 — engine: always-enforce ability substitutions

**Type:** Engine behavior tightening (RAW-gap closure). **Third slice of the post-L3-RAW completeness push.** Closes the slice-660 "always-enforce mode for ability substitutions" deferral.

Pre-663 the engine permissively accepted ANY `(ability, skill)` combo on an `AbilityCheckIntent` — a Wizard could request a `STR` check on `perception` and the engine rolled it. The `useAbilitySubstitution: true` opt-in flag (slice 659) was the only path that enforced the RAW-default ability or required a granted substitution. RAW says each skill has exactly one default ability (athletics=STR, perception=WIS, etc.) and only a granted substitution (Primal Knowledge, etc.) can change that. This slice lifts the opt-in: the gate is always-on.

## What's wired

- `planAbilityCheck` now ALWAYS validates the `(ability, skill)` pair when a skill is supplied. The flow:
  1. If no skill on the intent → raw ability check, no gate (any ability accepted, as before).
  2. Else if `intent.ability === SKILL_ABILITY[intent.skill]` (the RAW default per [src/schemas/primitives.ts](../../src/schemas/primitives.ts)) → accepted (the common path; no substitution needed).
  3. Else walk the bearer's effective effect stack for `GrantAbilitySubstitution` (slice 662) and accept iff some grant matches the requested `(ability, skill)` AND (when the grant carries an `activeWhileConditionId`) the bearer has that condition active.
  4. Else throw `"<name> cannot use ability='X' for skill='Y' (RAW default is 'Z'): no ability substitution matching this combination [granted: ...]"`.
- `useAbilitySubstitution: boolean` is retained as a no-op for back-compat with existing call sites. The substitution check now fires automatically when needed; the flag has no behavioral effect today. Documented in the intent's field comment as "may be removed in a future major version."

## Scope decisions

- **No-op the opt-in flag, don't remove it**: removing `useAbilitySubstitution` would break the slice-659/662 call signatures. Keeping it as a no-op preserves source compatibility for consumers and leaves the field-removal for a future breaking-change slice when the broader API surface is reviewed.
- **Raw ability checks (no skill) stay permissive**: a raw STR contest, a raw CON save (via the save path), etc. — these don't have a skill, so the RAW-default constraint doesn't apply. The gate only fires when `intent.skill !== undefined`.
- **Generic error message**: previously the slice-659 errors named "Primal Knowledge" by feature. Slice 662 lifted that to a generic message. Slice 663 keeps the same shape, with the prefix expanded to "cannot use ability=X for skill=Y (RAW default is Z): no ability substitution matching this combination [granted: ...]". The `[granted: ...]` suffix lists the bearer's substitutions so the consumer can see what WAS available.
- **No content edits needed**: this is a behavior tightening — no new effect, no schema change, no content row updated. Primal Knowledge's `GrantAbilitySubstitution` from slice 662 already covers the only existing substitution case in the pack.

## Files

- **[../../src/engine/plan/checks.ts](../../src/engine/plan/checks.ts)**: gate logic in `planAbilityCheck` now runs on every skill check (was opt-in via `useAbilitySubstitution`). Imports `SKILL_ABILITY` from primitives. Field comment updated to document the no-op status of the flag.
- **[../../tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts](../../tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts)**: two test inputs adjusted to use combos that are NOT RAW defaults (so the substitution gate actually fires). Back-compat permissive test converted to assert the new always-enforce throw + a sibling test added for the RAW-default passes-without-substitution path.
- **[../../tests/unit/engine/slice-662-grant-ability-substitution.test.ts](../../tests/unit/engine/slice-662-grant-ability-substitution.test.ts)**: one test input adjusted from `(INT, history)` (a RAW-default match) to `(INT, athletics)` (a non-default combo that genuinely exercises the gate).
- **[../../tests/unit/engine/slice-663-always-enforce-ability-substitution.test.ts](../../tests/unit/engine/slice-663-always-enforce-ability-substitution.test.ts)** (new): 6 tests pinning the always-enforce contract:
  - RAW-default combos succeed (8 ability/skill pairs across all 6 abilities).
  - Non-default combos throw WITHOUT explicit `useAbilitySubstitution: true`.
  - `useAbilitySubstitution` flag is verifiably a no-op (set or unset, same behavior).
  - Raw ability checks (no skill) accept any ability.
  - Primal Knowledge accepts substitution implicitly (no opt-in needed).
  - Primal Knowledge substitution rejected when condition is not active.

## Tests

- `npx vitest run tests/unit/engine/slice-663-always-enforce-ability-substitution.test.ts`: 6/6 pass.
- `npx vitest run tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts tests/unit/engine/slice-662-grant-ability-substitution.test.ts`: 15/15 pass (8 + 7).
- Full suite: 520 files / 3766 passing + 173 skipped (was 519 / 3753 post-662; +1 file / +13 tests). No regressions across the wider engine surface — every existing `engine.plan.abilityCheck(...)` call site already used RAW-default ability/skill combos.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Behavior tightening**, not additive. Public-API surface unchanged (no new fields, no removed fields, no event-shape changes). Consumers who:

- Pass RAW-default `(ability, skill)` combos: zero impact.
- Pass non-default combos expecting permissive acceptance: now throw. The fix is either to (a) pass the RAW-default ability for the skill, (b) add a `GrantAbilitySubstitution` to the bearer's content (a feat, condition, item, class feature), or (c) call the raw-ability path (no `skill` on the intent) if they really want a non-skill check.

The starter pack's only granted substitution today is Primal Knowledge (Barbarian L3 + raging). The Barbarian's RAW-eligible substitutions all work implicitly; nothing else in the pack uses an ability-substitution.

## Audit (Uncle Bob)

- **Names**: gate condition `intent.skill !== undefined && intent.ability !== SKILL_ABILITY[intent.skill]` reads as "a skill is named AND the requested ability is not the RAW default for that skill" — directly stating the entry condition.
- **DRY**: reuses slice-662's `GrantAbilitySubstitution` walk; reuses `SKILL_ABILITY` from primitives. No new hardcoded mapping.
- **SRP**: the gate sits in one place in `planAbilityCheck`. No second copy lurking in computeAbilityCheck or elsewhere.
- **Magic numbers / strings**: none added; the error message uses the field values inline.
- **Pattern-check**: searched for parallel "planSave" gates — saves don't carry a skill, so the same gate doesn't apply. Searched for other planner sites that take `(ability, skill)` together: only `planAbilityCheck` does. No spillover.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 663 of ~16):

- ~~660~~: Circle of the Land long-rest swap. Landed.
- ~~661~~: Land-swap supersession. Landed.
- ~~662~~: Generic `GrantAbilitySubstitution` primitive. Landed.
- ~~663 (this slice)~~: Always-enforce ability substitutions. Landed.
- **664**: Deflect Attacks damage-pipeline auto-integration.
- **665-672**: Spell-wiring primitives.
- **673-676**: Audit + polish.

**Deferred**:
- **Remove `useAbilitySubstitution` field entirely**: the flag is a no-op as of this slice. Removing it would be a public-API breaking change; deferred until the next major-version review of the AbilityCheckIntent surface.
