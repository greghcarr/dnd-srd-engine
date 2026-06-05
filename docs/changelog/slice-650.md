# Slice 650 — tests: L3 floor Section 5 — resource scaffolding pin

**Type:** Tests (audit-only). First of the L3 hardening cycle (mirror of L2's slices 639-644).

Mirrors slice 639/640's L2 resource pin pattern but for the four resources that scale to / come online at L3:

| Class | Feature | Grant lives at | Resource | L3 max | Recharge |
|---|---|---|---|---|---|
| Barbarian | `rage-uses-3` | L3 | `rage` | 3 (literal) | `longRest` |
| Paladin | `channel-divinity-paladin` | L3 | `channel-divinity` | 2 (literal) | `shortRest` |
| Sorcerer | `font-of-magic` | L2 | `sorcery-points` | 3 (formula) | `longRest` |
| Monk | `monks-focus` | L2 | `ki` | 3 (formula) | `shortRest` |

The Sorcerer + Monk formulas evaluate via `evaluateFormula` with a synthesized L3 `FormulaContext` (`classLevels = {classId: 3}`, PB=2). Same shape as the L2 floor's Section 3 (slice 639); just at a different level.

All 4 pin correctly with the current content. The audit prevents future drift in either the literal max values OR the formula evaluation at L3.

## Files

- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**:
  - New import: `evaluateFormula` + `Formula` type.
  - New Section 5 with 4 tests, one per resource scaffolding check. Table-driven; adding a 5th resource at L3 is one row.

## Tests

- `npx vitest run tests/audit/srd-l3-complete.test.ts`: 34/34 pass (was 30; +4 new Section 5 tests).
- Full suite: 512 files / 3571 passing + 173 skipped (was 512 / 3567; +4 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: each row in `L3_RESOURCE_CHECKS` carries the full spec (class, grant level, feature, resource, expected max, expected recharge). Test title format `${classId} / ${featureId} (L${grantLevel}): GrantResource ${resourceId} max evaluates to ${l3Max} at L3, recharge = ${recharge}` makes the failing context immediately scannable.
- **DRY**: leans on the existing `evaluateFormula` engine helper (same as slice 639's L2 floor). The synthesized FormulaContext only carries the fields the pack's resource-max formulas actually read; future formulas that need more (e.g. `source`) would fail with a clear "ctx.X undefined" — one-line additions.
- **SRP**: Section 5 has one job (pin the L3 resource pool size + recharge). Doesn't try to verify resource-derivation-into-character-sheet behavior; that's behavioral testing's domain.
- **Magic numbers / strings**: every value in the table row is named (`l3Max`, `recharge`, `resourceId`). Synthesized PB=2 is correct for L3 (PB scales 2→6 over L1-L20; L3 is still in the PB=2 tier).
- **Pattern-check**: same shape as the L1 floor would benefit from when it gets a future hardening cycle. The pattern generalizes — when an L4+ floor lands, the new resources at that level get a similar Section 5.

## Open follow-ups

L3 hardening punch list (slice 650 of N):

- ~~650 (this slice)~~: L3 resource scaffolding pin. Landed.
- **651**: L3 fuzz matrix extension — add L3 cells to `fuzz-matrix.test.ts` (`LEVELS = [1, 2, 3]`). Mirror of slice 644.
- **652**: Circle of the Land Spells — 8 land types × ~4 spells each, the last L3 content stub.
- **653+**: subclass spell-list scaffolding pin (Life Domain Spells, Devotion Spells, Fiend Spells, Draconic Spells), L3 multiclass build audit extension.

When the L3 punch list closes, tag `0.4.0-alpha.0` ("L3 SRD complete").
