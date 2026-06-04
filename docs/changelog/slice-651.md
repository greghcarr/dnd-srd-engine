# Slice 651 — tests: L3 fuzz matrix extension

**Type:** Tests (audit-only). Second of the L3 hardening cycle. Mirror of slice 644.

Extends slice 644's fuzz matrix from `LEVELS = [1, 2]` to `LEVELS = [1, 2, 3]`. The matrix now covers:

- **3 levels** × **4 shapes** (1v1 PC, 2v2 PC, 1v1 monster, 2v2 monster) × **3 rest cadences** (none / short / long) = **36 cells**.
- **20 seeds per cell** = **720 battles per CI run**.
- Wall-clock: ~7.3 seconds (was ~4.2s at L1+L2). Still well within CI budget.

The L3 cells exercise everything the L3 cycle introduced — Steady Aim and Fast Hands BA gates, Deflect Attacks reactions, Paladin Channel Divinity, Sorcerer Sorcery Points scaling, plus subclass features that compose with the new resources (Frenzy on Berserker, Cutting Words on Lore Bard, Preserve Life on Life Cleric, etc.). All 720 battles complete without throwing.

The per-planner tests catch wrong-RAW behavior; this audit catches cross-cutting regressions that only show up under random encounter shapes.

## Files

- **[../../tests/audit/fuzz-matrix.test.ts](../../tests/audit/fuzz-matrix.test.ts)**:
  - `LEVELS = [1, 2]` → `[1, 2, 3]` with an inline comment explaining the L3 extension and what it catches.
  - Enumeration sanity assertion `toBe(24)` → `toBe(36)` (kept as a guard so an axis added without updating the assertion trips loudly).

## Tests

- `npx vitest run tests/audit/fuzz-matrix.test.ts`: 37/37 pass in ~7.3s (was 25/25 in 4.2s; +12 cells, ~+3s).
- Full suite: 512 files / 3583 passing + 173 skipped (was 512 / 3571; +12 cells × ~1 test each = +12 tests, no new file).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit extension.

## Audit (Uncle Bob)

- **Names**: the LEVELS comment names exactly what L3 adds — "subclass selection at L3, new planners — Steady Aim / Fast Hands / Deflect Attacks — plus Paladin Channel Divinity + scaled-to-3 resources." A future reader sees the rationale inline.
- **DRY**: the matrix axis pattern from slice 644 absorbed this extension as a one-line array push — exactly the slice-644 pattern-check goal ("if a future slice introduces a new combat shape ... the SHAPES array takes one row").
- **SRP**: the audit's job is unchanged (every reasonable combat configuration completes without throwing). Just more cells.
- **Magic numbers / strings**: the enumeration sanity assertion was updated from 24 to 36 same-slice, exactly as the slice-644 audit's pattern-check anticipated ("Cell count `24 = 2 * 4 * 3` is asserted by the enumeration sanity test so an axis added without updating the assertion trips loudly").
- **Pattern-check**: the pattern caught itself — initial run failed on the now-stale `toBe(24)`. Updated to 36 same-slice. When L4 lands, this will be a 3-line edit (LEVELS extension, comment update, assertion update).

## Open follow-ups

L3 hardening punch list:

- ~~650~~: L3 resource scaffolding pin. Landed.
- ~~651 (this slice)~~: L3 fuzz matrix extension. Landed.
- **652**: Circle of the Land Spells — 8 land types × ~4 spells each, the last L3 content stub.
- **653+**: subclass spell-list scaffolding pin, L3 multiclass build audit extension.

Once slice 652 closes the Circle of the Land Spells content gap, tag `0.4.0-alpha.0` ("L3 SRD complete"). The 653+ extensions are stretch hardening (not strictly required for the alpha tag).
