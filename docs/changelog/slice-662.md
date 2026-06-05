# Slice 662 — engine + content: generic `GrantAbilitySubstitution` Effect primitive

**Type:** Engine primitive + content refactor. **Second slice of the post-L3-RAW completeness push.** Closes the slice-660 "Generic GrantAbilitySubstitution Effect" deferral (and the original slice-659 follow-up).

Slice 659 wired the Primal Knowledge ability-substitution arm with a hardcoded gate in [src/engine/plan/checks.ts](../../src/engine/plan/checks.ts): the 5 substitutable skills, the source ability ('STR'), the gating condition id ('raging'), the class id ('barbarian'), and the minimum class level (3) were all named constants in the planner. This slice replaces that with a content-driven primitive so future ability-substitution features (Stoneskin's "STR vs grappling escape", hypothetical species traits, etc.) are pure content additions instead of planner edits.

## What's wired

- New `GrantAbilitySubstitution` Effect: `{ kind: 'GrantAbilitySubstitution'; ability: AbilityScore; skills: Skill[]; activeWhileConditionId?: string }`.
  - Mandatory `ability` + `skills` (the substitution shape).
  - Optional `activeWhileConditionId` — when set, the substitution only applies while the bearer has the named condition active. RAW user: Primal Knowledge requires `raging`.
  - When omitted, the substitution is unconditional.
- `planAbilityCheck` reads `GrantAbilitySubstitution` effects from the bearer's effective effect stack when `intent.useAbilitySubstitution === true`. Accepts iff some granted substitution matches the requested `(ability, skill)` AND (when `activeWhileConditionId` is set) the bearer has that condition active. Otherwise throws a generic "no ability substitution matching" error citing what WAS granted.
- Hardcoded constants in [src/engine/plan/checks.ts](../../src/engine/plan/checks.ts) (`PRIMAL_KNOWLEDGE_SKILLS`, `PRIMAL_KNOWLEDGE_CLASS_ID`, `PRIMAL_KNOWLEDGE_MIN_LEVEL`, `PRIMAL_KNOWLEDGE_ABILITY`, `RAGING_CONDITION_ID`) deleted. The planner no longer knows about Primal Knowledge by name.
- Content: Primal Knowledge feature (Barbarian L3) now ships a `GrantAbilitySubstitution` alongside the existing OfferChoice. The substitution `(ability: 'STR', skills: [acrobatics, intimidation, perception, stealth, survival], activeWhileConditionId: 'raging')` flows through the same generic primitive as any future user.

## Scope decisions

- **`activeWhileConditionId: string` instead of `Predicate`**: a generic predicate gate would be more powerful (e.g., "while raging AND not Incapacitated"), but the only RAW user today (Primal Knowledge) has a single-condition gate. Promoting to `Predicate` when a second use case arises is a one-field schema change. Keeping the schema small now beats premature generalization.
- **Marker-style at the builder layer**: `applyEffectToBuilder` returns immediately for `GrantAbilitySubstitution` (case exists for exhaustiveness). The planner reads grants directly via `collectEffectsFromCharacter` because it needs the per-grant `(ability, skills, activeWhileConditionId)` triple — not a boolean accumulator state.
- **Error message change is intentional**: slice 659's tests asserted specific error patterns (`/Rage is not active/`, `/Primal Knowledge/`). Those were tied to the hardcoded planner. The new generic error is `"no ability substitution matching ability='X' skill='Y' [granted: ...]"`. Slice 659's tests were updated to assert the new pattern; the BEHAVIOR (which combos accept / reject) is unchanged.
- **No effect-stack derive helper added**: the planner walks the effect stack directly. Adding a `getEffectiveAbilitySubstitutions()` derive helper would be premature; the planner is the only reader.

## Files

- **[../../src/schemas/effects.ts](../../src/schemas/effects.ts)**: added `GrantAbilitySubstitution` to the discriminated-union type, Zod schema (with `AbilityScoreSchema` + `SkillSchema` fields), and `ALL_EFFECT_KINDS` enumeration.
- **[../../src/effects/builder.ts](../../src/effects/builder.ts)**: added a no-op `case 'GrantAbilitySubstitution': return;` for exhaustiveness.
- **[../../src/engine/plan/checks.ts](../../src/engine/plan/checks.ts)**: deleted the 5 hardcoded constants + the multi-branch gate; replaced with effect-stack walk + generic match. Header comment updated.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: Primal Knowledge feature gains a `GrantAbilitySubstitution` effect.
- **[../../tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts](../../tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts)**: error-pattern asserts updated to match the new generic shape. Header comment updated to reference slice 662's refactor.
- **[../../tests/unit/engine/slice-662-grant-ability-substitution.test.ts](../../tests/unit/engine/slice-662-grant-ability-substitution.test.ts)** (new): 7 tests covering the primitive's reusability via synthetic test conditions:
  - Unconditional grant (no `activeWhileConditionId`).
  - Gated grant when condition IS active.
  - Gated grant when condition is NOT active (rejects).
  - Multi-skill grant accepts every listed skill.
  - Multi-skill grant rejects skills not in its list.
  - Multiple grants on one bearer compose (any matching grant accepts).
  - Real Primal Knowledge content flows through the same primitive (smoke-test parity with slice 659).
- **[../../docs/concepts.md](../../docs/concepts.md)**, **[../../README.md](../../README.md)**, **[../../docs/status.md](../../docs/status.md)**, **[../../docs/authoring-content-packs.md](../../docs/authoring-content-packs.md)**: primitive count bumped 60 → 61 (62 EFFECT_KINDS entries total). Audit at [tests/audit/doc-counts.test.ts](../../tests/audit/doc-counts.test.ts) enforces.

## Tests

- `npx vitest run tests/unit/engine/slice-662-grant-ability-substitution.test.ts`: 7/7 pass.
- `npx vitest run tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts`: 7/7 pass (updated patterns).
- Full suite: 519 files / 3753 passing (was 518 / 3752 after slice 661; the +1 file / +1 test is this slice's tests minus the doc-counts failures that this slice closes).
- `npx vitest run tests/audit/doc-counts.test.ts`: 19/19 pass (post primitive-count bump).
- `npx vitest run tests/coverage/features.test.ts`: green; no snapshot changes (the matrix doesn't enumerate per-effect entries).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive only at the schema level.** No new event types; no reducer changes; no public-API surface change beyond the new effect kind.

**Behavior preservation**: every (ability, skill, condition) combo that the slice-659 hardcoded gate accepted is still accepted; every combo it rejected is still rejected. Only the error message text changed — slice-659's tests were updated to match.

**Content-side**: any consumer pack that ships an ability-substitution feature now has a declarative primitive instead of needing engine edits. The starter pack's Primal Knowledge entry gains the new effect inline.

## Audit (Uncle Bob)

- **Names**: `GrantAbilitySubstitution` mirrors the existing `Grant*` family (`GrantHalflingLuck`, `GrantEvasion`, `GrantPotentCantrip`). `activeWhileConditionId` reads as "the condition id whose active presence gates this grant" — verbose enough to be unambiguous about "active vs presence-as-marker."
- **DRY**: 5 hardcoded constants + 4 branched throw cases consolidated into 1 effect-stack walk + 1 generic throw. Future users add a content row; no planner change.
- **SRP**: the schema declares the shape; the builder acknowledges it (no-op); the planner reads and matches; the content authors the per-feature substitution. Each layer's job is single-step. The Primal Knowledge feature no longer has a planner-side companion to keep in sync.
- **Magic numbers / strings**: the 5 named constants in slice 659 were the magic strings. This slice removes them. The new test file uses Zod-validated enum literals throughout.
- **Pattern-check**: searched for other "hardcoded class / level / condition gate in a planner" patterns that could lift to this primitive: none found at the moment (Innate Sorcery and similar features have different shapes). The `GrantAbilitySubstitution` primitive is the right level of generality for this RAW shape and stays out of unrelated planner gates.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 662 of ~16):

- ~~660~~: Circle of the Land long-rest swap. Landed.
- ~~661~~: Land-swap supersession. Landed.
- ~~662 (this slice)~~: Generic `GrantAbilitySubstitution` primitive. Landed.
- **663**: Always-enforce ability substitutions (lift the opt-in `useAbilitySubstitution: true` gate so the engine refuses any (ability, skill) combo without a granted substitution unless the substitution matches RAW for the skill's normal ability).
- **664**: Deflect Attacks damage-pipeline auto-integration.
- **665-672**: Spell-wiring primitives (zone, on-hit-cast, recurring, flight, on-action, slow, beacon, blink).
- **673-676**: Audit + polish (triple-class multiclass, L3 fuzz, recharge auto-populate, multiclass fuzz).

**No new deferrals from this slice.** The generic primitive is content-complete with one canonical user (Primal Knowledge); the next consumer-driven substitution will be a content addition only.
