# Slice 656 — tests: L1+L2 multiclass build audit

**Type:** Tests (audit-only). Fourth slice of the L3 RAW-completeness push. Sibling of slice 642's L1+L1 audit.

Covers the other shape of total-character-level-3 multiclass builds: one class at L1 + a different class at L2.

**Ordered pairs matter here** (unlike L1+L1): a Fighter1 + Wizard2 character is mechanically distinct from a Fighter2 + Wizard1 character (different hit-die distribution, different feature access). The audit iterates ordered pairs: first class at L1, second class at L2, distinct classes. 12 × 11 = **132 pairs**.

All 132 build, commit, and derive cleanly. Wall-clock: ~345ms.

## What this catches

- A class enrollment whose effect-stack contribution breaks when stacked with another class's contributions.
- A schema regression that rejects a particular L1+L2 enrollment ordering.
- A derive-pipeline panic on a multiclass character (e.g. spell-slot computation for half-caster + full-caster combos at exactly this level mix).

## What this audit deliberately does NOT cover (deferred)

- **Triple-class L1+L1+L1** (C(12, 3) = 220 combinations). Rare in practice; a future hardening slice.
- **Specific feature presence per pair**: covered implicitly by the L1 + L2 floors for each single-class build; multiclass just combines them.
- **Multiclass spellcasting slot math**: covered by `computeSpellSlots` tests.
- **L3+L1, L3+L2, etc. total-level-4+ multiclass**: out of L3-completeness scope.

## Files

- **[../../tests/audit/multiclass-l1l2-pairs.test.ts](../../tests/audit/multiclass-l1l2-pairs.test.ts)** (new): 133 tests (1 enumeration sanity + 132 ordered pairs).

## Tests

- `npx vitest run tests/audit/multiclass-l1l2-pairs.test.ts`: 133/133 pass in ~345ms.
- Full suite: 514 files / 3726 passing + 173 skipped (was 513 / 3593; +1 file, +133 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: file path (`multiclass-l1l2-pairs`) and describe block name the audit's job precisely. Per-pair test title `L1 ${l1} + L2 ${l2}` puts both class+level in the test name so failures point at the exact reproduction.
- **DRY**: pairs are generated mechanically from the shared `CLASSES` array (same as slice 642). The build + commit + derive pattern is identical to slice 642's; the only delta is the per-enrollment level.
- **SRP**: the audit's one job is "every L1+L2 ordered pair builds + derives." Cross-cutting derive bugs that show up only in specific combinations get a clear test name.
- **Magic numbers / strings**: `CLASSES` is shared with slice 642. The enumeration sanity asserts `132 = 12 × 11` so an axis added without updating the count trips loudly.
- **Pattern-check**: when an L3+L1 / L3+L2 (total-L4) multiclass audit lands, it'll have a similar shape. Consider extracting `buildAndDerive(pairs)` as a helper at that point.

## Open follow-ups

L3 RAW-completeness punch list (slice 656 of 8):

- ~~653~~: L3 OfferChoice emission tests. Landed.
- ~~654~~: Subclass-selection cascade. Landed.
- ~~655~~: Subclass spell-list scaffolding pin. Landed.
- ~~656 (this slice)~~: L3 multiclass build audit (L1+L2 pairs). Landed.
- **657**: `partialShortFullLong` recharge primitive (closes Channel Divinity + Wild Shape RAW deviations).
- **658**: Deflect Attacks counter arm.
- **659**: Primal Knowledge ability-substitution.
- **660**: Circle of the Land long-rest swap.
