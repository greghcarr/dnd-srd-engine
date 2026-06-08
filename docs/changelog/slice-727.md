# Slice 727 — content: Fighter L6 Ability Score Improvement

**Type:** Content. No engine change. First slice of the L6 SRD-complete cycle.

SRD 5.2.1 gives the Fighter an Ability Score Improvement at levels 4, 6, 8, 12, 14, and 16 (more than the every-class 4/8/12/16). The slice-707 L4 cascade was never copied to L6, so a Fighter leveling 5→6 gained nothing.

## What changed

The Fighter's `levelTable['6']` (previously empty) gains `ability-score-improvement-6` — the same OfferChoice as L4 (the ASI feat, +2 one / +1 two ability scores max 20, or another general feat via `GrantFeat`), with its `id` / `choiceId` retargeted to `-6`. Rides the existing level-up + cascade + derive machinery; no new primitive.

## Files

- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Fighter L6 `ability-score-improvement-6`.
- [tests/unit/engine/slice-727-fighter-l6-asi.test.ts](../../tests/unit/engine/slice-727-fighter-l6-asi.test.ts) (new): the L6 row carries the ASI OfferChoice; a Fighter leveling 5→6 emits an ASI/feat `ChoiceRequired`.
- [tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap): `fighter L6 ability-score-improvement-6` now wired (`-u`).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. Content-only — reuses the L4 ASI machinery.

## Audit (Uncle Bob)

- **Reuse**: identical OfferChoice shape as L4; no new code, the level-up cascade already walks new-level OfferChoice effects.
- **SRD-faithful**: Fighter-specific extra ASI at L6.
- **Scope note**: the Fighter's further extra ASIs (8/14) are out of this cycle's L6 scope; L12/L16 already exist or will land with their tiers.
