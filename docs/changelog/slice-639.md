# Slice 639 — tests: L2 floor Section 3 hardening (resource max-value pin)

**Type:** Tests (audit-only). First of five hardening slices that promote the L2 floor from "surface-area complete" to "L2 SRD complete."

The slice-633 Section 3 only checked that each resource-granting L2 feature ships a `GrantResource` effect. That caught silent removal but didn't catch silent drift in the *max value* — a literal `max: 2` getting changed to `max: 3`, or a `Formula` max whose evaluation at L2 quietly drifts from RAW. Both would have shipped green under the old audit.

Slice 639 promotes the check from "exists" to "exists AND evaluates to the RAW value at L2." For each of the five resource-granting L2 features:
- Look up the `GrantResource` effect by `resourceId` (not just by `kind`, which is stricter — catches a class that ships a GrantResource for a different resource).
- Resolve `max`: literal number → use directly; `Formula` → evaluate with a synthesized L2 context (`classLevels = {[classId]: 2}`, `proficiencyBonus = 2`, neutral ability scores).
- Assert the evaluated max equals the RAW L2 value:

| Class | Feature | resourceId | L2 RAW max |
|---|---|---|---|
| Fighter | action-surge | `action-surge` | 1 |
| Cleric | channel-divinity | `channel-divinity` | 2 |
| Druid | wild-shape | `wild-shape` | 2 |
| Monk | monks-focus | `ki` (legacy id; RAW: "Focus Points") | 2 |
| Sorcerer | font-of-magic | `sorcery-points` | 2 |

All five pass with the current pack — content was already correct. The value of the slice is the *floor*: a future content edit that changes a max (or a formula evaluation) trips CI in the same slice that drifts it, instead of waiting for a fuzz harness or a per-class unit test to notice.

## Files

- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**:
  - `RESOURCE_BEARING_L2_FEATURES`: extended each row from `{classId, featureId}` to `{classId, featureId, resourceId, l2Max}` — embeds the RAW expectation alongside the locator.
  - Section 3 test body: rewrote from "GrantResource present" to "GrantResource present for the named resourceId AND its max evaluates to l2Max." Uses `evaluateFormula` (from `src/effects/index.js`) with a synthesized L2 `FormulaContext` for the Monk's-Focus and Font-of-Magic `{kind: 'level', classId}` formulas.
  - New imports: `evaluateFormula`, `Formula` type.
  - Section header comment block: updated to document the new check + the RAW expectations per class.

## Tests

- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 pass (Section 3 size unchanged at 5 tests; assertions strengthened).
- Full suite: unchanged from slice 638 (no test added or removed; one section's assertions strengthened).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit strengthening.

## Audit (Uncle Bob)

- **Names**: `RESOURCE_BEARING_L2_FEATURES` rows extended with `resourceId` + `l2Max` — the row IS the spec for what the audit asserts. The test title now reads `${classId} / ${featureId} ships GrantResource (${resourceId}) with L2 max = ${l2Max}`, so a failing assertion tells you everything: the file, the feature, the resource, the expected number.
- **DRY**: `evaluateFormula` is the canonical engine formula evaluator. The audit constructs the minimal `FormulaContext` (only the fields the pack's resource-max formulas actually read — `classLevels`, `proficiencyBonus`, `abilityScores`, `totalLevel`). A future formula that needed `classColumns` or `source` would fail with a clear "ctx.X is undefined" — adding it is one line.
- **SRP**: Section 3 has one job (pin the L2 resource pool size); the formula-evaluation path lets it cover both literal and dynamic max declarations without two code paths in the test.
- **Magic numbers / strings**: every RAW L2 max value lives in the table row (named `l2Max`), not buried in the assertion. The synthesized FormulaContext's neutral ability scores (all 10) and PB=2 are correct for L2 (PB scales 2→6 over L1-L20).
- **Pattern-check**: same shape applicable to L3+ floors when those land — every Nth-level resource that scales has an RAW expectation. The L1 floor doesn't yet pin max values; consider extending it in a sibling slice if regressions surface.

## Open follow-ups

L2 floor hardening punch list (slice 639 of 5):

- **639 (this slice)**: Resource max-value pin. ✓
- **640**: Recharge cadence audit — pin each L2 resource's `recharge` field to RAW. **Will surface the Wild Shape recharge bug** documented in [gaps-class-features.md](../gaps-class-features.md): content has `recharge: 'shortRest'` but PHB 2024 RAW is `longRest`. The audit will fail until the content is corrected in the same slice; the fix is one JSON edit but may shift golden transcripts.
- **641**: Spell wiring floor enforcement — pin the per-level wired/narrative/deferred split at the current L2 floor (≥36 wired out of 57) so future slices can't drop below it without an explicit doc update in the same commit.
- **642**: Multiclass L2 audit — every L1+L1 class pair builds cleanly and produces both progressions' L1 features in the derived sheet.
- **643**: L2 fuzz floor — seeded encounter sweep (e.g. 50 seeds × all 12 classes at L2) running combat-fuzz without thrown errors. Bounds the cost of unwiring an existing planner or breaking an interaction.

Tag `v0.3.0-alpha.0` ("L2 SRD complete") after slice 643.
