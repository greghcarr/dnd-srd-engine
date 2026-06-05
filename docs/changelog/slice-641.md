# Slice 641 — tests: per-level spell wiring floor enforcement

**Type:** Tests (audit-only). Third of five L2 hardening slices.

The existing `gaps-spells-counts.test.ts` audit caught drift between `docs/gaps-spells.md` and the pack (W + R + X = inPack, cross-level sum = pack total) but didn't protect against *intentional* coverage regression — a slice could drop L2's wired count from 36 to 30, update the doc, and ship green.

Slice 641 adds a **floor** per level: each level's wired count must be at or above a snapshot value. Lowering requires updating the floor in the same slice, forcing a conscious "we're dropping coverage" decision. Raising is silently allowed (the floor is a minimum, not an exact match).

## Pinned floors (slice-641 reference point)

| Level | Wired floor | Currently wired | Headroom |
|---|---|---|---|
| L0 | 17 | 17 | 0 |
| L1 | 45 | 45 | 0 |
| L2 | **36** | 36 | 0 |
| L3 | 27 | 27 | 0 |
| L4 | 18 | 18 | 0 |
| L5 | 13 | 13 | 0 |
| L6 | 17 | 17 | 0 |
| L7 | 8 | 8 | 0 |
| L8 | 9 | 9 | 0 |
| L9 | 8 | 8 | 0 |

Every level is at zero headroom — i.e. the floor IS the current count. That's deliberate: a future spell-wiring sweep will raise both the count and the floor in lockstep so the high-water mark always reflects the strongest available coverage.

## Files

- **[../../tests/audit/gaps-spells-counts.test.ts](../../tests/audit/gaps-spells-counts.test.ts)**:
  - Header doc-block: appended a paragraph documenting the floor's purpose (catch regression) and its "raising allowed, lowering blocks" semantics.
  - New `MIN_WIRED_PER_LEVEL` ReadonlyMap with one entry per spell level.
  - New per-level `it()`: `L${level}: wired count is at or above the slice-641 floor`. Test count grows 23 → 33.

## Tests

- `npx vitest run tests/audit/gaps-spells-counts.test.ts`: 33/33 pass (was 23/23; +10 floor checks).
- Full suite: 506 files / 3434 passing + 173 skipped (was 506 / 3424; +10 tests, no file added).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit strengthening.

## Audit (Uncle Bob)

- **Names**: `MIN_WIRED_PER_LEVEL` reads as a constraint (a minimum), not a snapshot — consistent with the audit's enforcement semantics. Test title `wired count is at or above the slice-641 floor` makes the failure mode explicit; the failure message names the floor and the directive to either fix the regression or bump the floor.
- **DRY**: floor table sits next to `SPELL_LEVELS`, in the same file as the parser that produces the wired counts. One source of truth per concept; the per-level loop reuses the existing header-iteration scaffolding.
- **SRP**: the audit's job grew from "doc matches pack" to "doc matches pack AND doc isn't quietly regressing." Closely related concerns, single source of state (the parsed headers).
- **Magic numbers / strings**: every floor lives in the table; the per-level `it()` looks it up by level number.
- **Pattern-check**: looked for sibling "ratchet" audits in the repo (i.e. "this count can only go up"). None found — this is the first one. Same pattern would apply to: EFFECT_KINDS count (only grows, never shrinks), wired-feature count from the coverage matrix, pack size by category. None of those have regressed historically, but if a future slice ever ratchets a "minimum coverage" claim, the floor pattern is here as a template.

## Open follow-ups

L2 floor hardening punch list (slice 641 of 5):

- ~~639~~: Resource max-value pin. Landed.
- ~~640~~: Recharge cadence pin. Landed.
- ~~641 (this slice)~~: Spell wiring floor enforcement. Landed.
- **642**: Multiclass L2 audit (every L1 + L1 class pair builds cleanly and produces both progressions' L1 features in the derived sheet).
- **643**: L2 fuzz floor (seeded encounter sweep across all 12 classes at L2 with no thrown errors).

**Coverage uplift opportunity**: 21 L2 spells are not mechanically wired (15 narrative-only + 6 deferred). Each one is a small content slice. A future cohort could raise the L2 floor from 36 to 50+; tracked outside this slice's scope, since the floor's job is to prevent regression, not to force uplift.
