# Slice 900 — Planners validate the consumer combat enums (`input-validation-silent-trust`)

**Type:** Engine (planner input validation). Closes the L7 audit Area-3 (Seam) divergence `input-validation-silent-trust` for the part the engine can validate without owning positions.

## The gap

The planners throw on most illegal *single-target* input (a visible failure), but the consumer-supplied combat **enums** were trusted blindly. `AttackIntent.advantage` / `.cover` / `.lightLevel` and `CastSpellIntent.coverByTargetId` are combined with the engine's own derivations, so a value that slipped past the type system — a JS consumer's typo, or a deserialized-from-JSON intent — silently degraded: `advantage: 'adv'` reads as *neither* advantage nor disadvantage, so the engine rolls straight. A silent wrong result, exactly the failure mode the audit row flags.

## The fix

A shared `assertEnumInput(value, allowed, label)` in `attack.ts` throws on an out-of-set value (and no-ops on `undefined`, preserving the opt-in semantics). Wired at the top of the two consumer entry points:

- **`planAttackRoll`** validates `advantage` (`ATTACK_ADVANTAGE_KINDS`), `cover` (`COVER_KINDS`), and `lightLevel` (`LIGHT_LEVELS`) before any work — so a malformed enum fails before a d20 is committed.
- **`planCastSpell`** validates each `coverByTargetId` value against `COVER_KINDS` (the spell's `advantage` is *derived*, not a consumer input, so it needs no check).

Well-formed and omitted values are byte-for-byte unchanged.

## Scope (why this closes the row)

The row also names two position-dependent "trusts." Those stay consumer-owned **by design** — the engine can't validate either without owning positions (which it deliberately doesn't, per engine-scope.md):

- **AoE membership** from explicit `targetIds`: the opt-in `aim` (slice 787) is the engine-*validated* membership path; explicit ids are trusted because, without an aim point, the engine has no area to check them against.
- **positionless range**: its own row `positionless-range-los-trusts-consumer` — the consumer must populate positions to enable range gating.

So this slice validates every consumer enum the engine *can* check, and the residual "trust" is the documented consumer-fact seam. (The *semantic* handling of a value — e.g. whether a directly-targeted spell should reject a `'total'`-cover target — is a cover-rule concern, not input validation, and stays as it was; cf. the `legalSpellTargets` note in slice 899.)

## Pattern-check

All three of the AttackIntent's named-style combat enums are validated (not just the two the row surfaced — `lightLevel` is included), and the cast path's only consumer cover enum (`coverByTargetId`) too, via the one shared helper. `casterChoice.damageType` is left to its existing spell-specific validation (an invalid type fails when matched against the spell's allowed set).

## Tests

New `tests/unit/engine/slice-900-input-validation.test.ts` (6 tests): a valid attack with well-formed enums doesn't throw; malformed `advantage` / `cover` / `lightLevel` each throw a named error; a malformed per-target cover value on a cast throws; a well-formed one doesn't trip the validation.

## Counts

No count change — no new condition / effect / spell / feat / event type / mechanic kind. The validated enums and the `assertEnumInput` helper are pure planner-boundary checks.

## Audit

- Struck `input-validation-silent-trust`; Rollup: **Area 3** `10 → 9` open / `4 → 5` closed (`0/4/6 → 0/3/6`); **Total** `19 → 18` open / `98 → 99` closed / `0/7/12 → 0/6/12`. The Recommended-order note now records `los-equals-loe` as the single remaining engine-actionable row.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (670 files, 4963 passed / 165 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
