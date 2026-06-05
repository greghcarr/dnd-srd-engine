# Slice 659 — engine: Primal Knowledge ability-substitution gate

**Type:** Engine planner extension. Seventh slice of the L3 RAW-completeness push.

RAW (SRD 5.2.1 Barbarian L3 Primal Knowledge, second arm): "while your Rage is active, you can channel primal power when you attempt certain tasks; whenever you make an ability check using one of the following skills, you can make it as a Strength check even if it normally uses a different ability: Acrobatics, Intimidation, Perception, Stealth, or Survival."

Slice 649 wired the first arm (OfferChoice for the extra L3 skill prof). This slice wires the second arm: a planner-side gate on `planAbilityCheck` that enforces the RAW substitution rules when the consumer opts in.

## What's enforced

When `AbilityCheckIntent.useAbilitySubstitution === true`, the planner validates:
1. Character has Barbarian enrollment at level ≥3.
2. Character has the `raging` condition active.
3. `ability === 'STR'`.
4. `skill` is one of `acrobatics`, `intimidation`, `perception`, `stealth`, `survival`.

Any gate failure throws a descriptive error. When the flag is unset or `false`, the planner's existing permissive ability-acceptance is preserved (back-compat).

## Scope decisions

- **Opt-in flag vs always-enforce**: chose opt-in via `useAbilitySubstitution` to preserve back-compat. The engine has historically accepted any (ability, skill) pair; existing tests rely on this. A future stricter mode could flip the default, but that's a separate breaking change.
- **Planner gate vs Effect**: implemented as a hardcoded planner gate keyed on `'raging'` condition + Barbarian L3+. Future ability-substitution features (e.g. Druidic Sigil, Inquisitive Rogue's Insight-as-Action) could justify a generic `GrantAbilitySubstitution` effect; with one user, the abstraction is premature.
- **No content edit**: the gate is engine-enforced; no new content effect needed on Primal Knowledge's row.

## Files

- **[../../src/engine/plan/checks.ts](../../src/engine/plan/checks.ts)**:
  - New constants: `PRIMAL_KNOWLEDGE_SKILLS`, `PRIMAL_KNOWLEDGE_CLASS_ID`, `PRIMAL_KNOWLEDGE_MIN_LEVEL`, `PRIMAL_KNOWLEDGE_ABILITY`, `RAGING_CONDITION_ID`.
  - `AbilityCheckIntent`: new optional `useAbilitySubstitution: boolean`.
  - `planAbilityCheck`: 4-gate validation block at the top when the flag is set; throws on any failure.
- **[../../tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts](../../tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts)** (new): 7 tests
  - Accepts STR substitution for all 5 eligible skills when raging Barbarian L3+.
  - Rejects: skill not in eligible set (e.g. Athletics, which is already STR-default).
  - Rejects: ability is not STR.
  - Rejects: Barbarian under L3.
  - Rejects: non-Barbarian (e.g. raging Wizard).
  - Rejects: Barbarian L3+ but not raging.
  - Back-compat: `useAbilitySubstitution=false` (default) preserves permissive behavior — no gate fires.

## Tests

- `npx vitest run tests/unit/engine/slice-659-primal-knowledge-substitution.test.ts`: 7/7 pass.
- Full suite: green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive only.** New optional field on `AbilityCheckIntent`; default unset → no gate, behavior identical to pre-659. Slice 633's L1 floor + per-class ability-check tests continue to pass unchanged.

**Opt-in semantics**: only consumers that explicitly set `useAbilitySubstitution: true` get the RAW-enforced gate.

## Audit (Uncle Bob)

- **Names**: `useAbilitySubstitution`, `PRIMAL_KNOWLEDGE_SKILLS`, `PRIMAL_KNOWLEDGE_*` constants say exactly what they are. Error messages name the missing prerequisite (`Rage is not active`, `requires Barbarian level 3`, etc.).
- **DRY**: the 5-skill set lives in one place (`PRIMAL_KNOWLEDGE_SKILLS`). The class+level prerequisite + condition check follows the same shape as planRecklessAttack's gates (slice 461) and planSteadyAim's gates (slice 646).
- **SRP**: the gate is one early-throw block at the top of `planAbilityCheck`; doesn't bleed into the existing check-derivation path. When the flag is unset, the gate is a single boolean check + skip.
- **Magic numbers / strings**: every literal named.
- **Pattern-check**: searched for sibling "use ability X for skill Y" features. None in current content. When a second arrives, consider extracting a generic `GrantAbilitySubstitution` Effect with `{skills, ability, requiresConditionId}` shape. For now, the hardcoded gate is the right scope.

## Open follow-ups

L3 RAW-completeness punch list (slice 659 of 8):

- ~~653~~: L3 OfferChoice emission tests. Landed.
- ~~654~~: Subclass-selection cascade. Landed.
- ~~655~~: Subclass spell-list scaffolding pin. Landed.
- ~~656~~: L3 multiclass build audit. Landed.
- ~~657~~: `partialShortFullLong` recharge primitive. Landed.
- ~~658~~: Deflect Attacks counter arm. Landed.
- ~~659 (this slice)~~: Primal Knowledge ability-substitution gate. Landed.
- **660**: Circle of the Land long-rest swap (last RAW arm in the L3 cycle).

**Deferred**:
- Generic `GrantAbilitySubstitution` effect kind for future ability-substitution features.
- Always-enforce mode (no opt-in flag) — would require updating existing tests that pass mismatched (ability, skill) pairs for non-substitution reasons.
