# Slice 631 — numerical accuracy sweep + audit extension

**Type:** Tests + Docs.

Closes the last of the four doc-overhaul goals: every numerical claim in the front-door docs is either CI-guarded against its source or rewritten qualitatively. The existing "CI-guarded or not stated" norm was followed for content counts (the doc-counts audit, gaps-spells-counts audit, coverage-ledger audit), but unguarded mechanical-wiring percentages had drifted: README.md cited "Spell mechanical wiring ~54% (182/339 wired)" while gaps-spells.md (the canonical per-level source) summed to 198/339 = 58%. status.md cited 196/339 in one place and 182 in another. This slice promotes the percentage to a permanent guard and rewrites the two genuinely unmeasurable claims qualitatively.

## Changes

### Audit extension

- **Extended [../../tests/audit/doc-counts.test.ts](../../tests/audit/doc-counts.test.ts)** with a spell-wired derivation: parses the `## Level N (P in pack): W wired, R narrative, X deferred` headers from [../gaps-spells.md](../gaps-spells.md) (the canonical per-level catalog, itself audit-pinned to the pack via [gaps-spells-counts.test.ts](../../tests/audit/gaps-spells-counts.test.ts)), sums wired / narrative / deferred / total across all 10 spell levels, and rounds `wired / total * 100` to a percentage. Adds five CHECKs that pin the front-door citations to those derived values:
  - `README.md` "Spell mechanical wiring ~N% (W/T wired, n narrative, d schema-only)".
  - `docs/status.md` headline aggregate "~N% of spells (W/T wired, with n narrative + d schema-only)".
  - `docs/status.md` "Spells (mechanically wired)" row "W/T wired ... n narrative-only and d schema-only".
  - `docs/status.md` Spells content-gaps row "Wired count W ... n ship narrative-only and d schema-only".
  - `docs/getting-started.md` "339 spells (the complete SRD 5.2.1 catalog; W mechanically wired, n narrative-only, d schema-only)".

### Doc updates (numerical correctness)

- **[../../README.md](../../README.md)** "Spell mechanical wiring": `~54% (182/339 wired, 70 narrative, 87 schema-only)` → `~58% (198/339 wired, 68 narrative, 73 schema-only)`. Magic items and consumables rewritten as `roughly a third (~91/258)` and `roughly two thirds (~45/69)` (the wired-magic-item count isn't independently audit-derivable; the "~" honestly admits the imprecision).
- **[../status.md](../status.md)** headline aggregate row: `~58% of spells (196/339 wired, with 70 narrative + 73 schema-only)` → `~58% of spells (198/339 wired, with 68 narrative + 73 schema-only)`. Magic-item and subclass shares rewritten as "roughly a third".
- **[../status.md](../status.md)** Spells (mechanically wired) row: `196/339 wired ... 70 narrative-only and 73 schema-only` → `198/339 wired ... 68 narrative-only and 73 schema-only`.
- **[../status.md](../status.md)** Spells content-gaps row: `Wired count 182 ... 70 ship narrative-only and 87 schema-only` → `Wired count 198 ... 68 ship narrative-only and 73 schema-only`.

### Qualitative rewrites (the genuinely unmeasurable claims)

Two claims had no derivable denominator. Per "CI-guarded or not stated," rewrote them qualitatively:

- **"~75% of the planned `EFFECT_KINDS` shipped"** ([../../README.md](../../README.md), [../status.md](../status.md)): "planned" is unmeasurable — the queue of "still to come" primitives lives in [../starter-pack-gaps.md](../starter-pack-gaps.md) but the total set of planned primitives is itself volatile as new content needs surface. Rewrote to "the majority of the planned primitives are shipped" with the same pointer to the backlog.
- **"~95% of printed mechanics by surface area"** ([../../README.md](../../README.md), [../roadmap.md](../roadmap.md)): there's no derivable denominator for "printed mechanics" (the 2024 PHB + DMG + MM don't enumerate a flat mechanic list to count against). Rewrote to "the engine targets the bulk of printed mechanics; the long tail that remains is documented as DM-discretion territory."

The "Engine architecture: 100%" / "Consumer read layer: 100%" / "Conditions: 100%" / "Variant rules: 50%" rows stay as is — those are factual lockdown / completeness statuses, not estimates against an unmeasurable denominator. The "~94% SRD" feats / "~99.7%" spells / "~99%" magic items pack-presence / "~69%" monsters-vs-MM percentages stay as is — they're computed against known SRD/MM totals and the "~" is honest about cohort-vs-pack rounding.

## Verification

- `npx vitest run tests/audit/doc-counts.test.ts` — 15 cases passing (was 10; +5 spell-wired CHECKs).
- `npx vitest run tests/audit/doc-size.test.ts tests/audit/doc-links.test.ts tests/audit/doc-examples.test.ts tests/audit/gaps-spells-counts.test.ts` — green.
- `npx vitest run` — 501 files / 3370 tests passing (+5 over slice 630, all in doc-counts).
- `npx tsc --noEmit` — clean.
- Manual grep for remaining unguarded `\b~?\d+%` claims in front-door docs: every surviving percentage is either (a) a hard-coded threshold (80% coverage gate), (b) a precise lockdown status (100% architecture), (c) the rounded-against-known-denominator pack-presence numbers, or (d) the new audit-guarded spell-wired percentage.

## Audit

- **Names**: the new `spellWiredPct` / `spellsWired` / `spellsNarrative` / `spellsDeferred` / `spellsTotal` keys on the `GT` ground-truth object match the existing camelCase + plural convention.
- **DRY**: the wired/narrative/deferred sums are computed once from `gaps-spells.md` and referenced by five CHECKs. The previous audit had no equivalent percentage source; this is a single new derivation, not a duplication.
- **SRP**: each CHECK is one citation in one doc. The five CHECKs share the same derived ground truth but assert against five distinct regex shapes (different prose in each doc).
- **Pattern-check**: the broader sweep covered every front-door doc (README, status, roadmap, architecture, engine-scope, tutorial, getting-started, concepts, api-overview). The surviving non-percentage numerical claims are either guarded by an existing audit (counts via doc-counts and gaps-spells-counts; ledger probe / boundary counts via coverage-ledger), volatile-but-already-honest with a leading `~`, or hard-coded thresholds. No remaining unguarded precise claims.
- **Magic numbers**: none introduced. The `Math.round(wired / total * 100)` formula uses no constants.

## Open follow-ups

None — this closes the four-slice doc overhaul (628 / 629 / 630 / 631). Future material count changes will trip the existing audit; future percentage drift in the spell-wired claim will trip the new CHECKs in the same slice. Magic-item wiring percentages stay qualitative until a future slice promotes the wired count to a script-derivable source.
