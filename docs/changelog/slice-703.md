# Slice 703 — content: the Ability Score Improvement feat (L4 core)

**Type:** Content (one feat) + tests. First wiring slice of the L4 cycle (opened by slice 702's floor audit).

RAW (SRD 5.2.1, "Ability Score Improvement", General Feat, Prerequisite: Level 4+, Repeatable): "Increase one ability score of your choice by 2, or increase two ability scores of your choice by 1. This feat can't increase an ability score above 20."

Per the L4 design decision (RAW feat-based model), ASI **is** a feat; the L4 class rows will grant it (slice 704) alongside the other feats a character qualifies for. This slice adds the feat itself.

## Shape

A two-tier `OfferChoice` (the slice-308 `IncreaseAbilityScore` primitive at the leaves, the slice-517 nested-OfferChoice cascade carrying it):

- Top "allocate" `OfferChoice` (`oneOf: 1`, `when: 'onAcquire'`): `plus-2-one` | `plus-1-two`.
- `plus-2-one` nests `asi-plus2-ability` (`oneOf: 1`) — 6 ability options, each `IncreaseAbilityScore amount: 2, max: 20`.
- `plus-1-two` nests `asi-plus1-abilities` (`oneOf: 2`) — 6 ability options, each `IncreaseAbilityScore amount: 1, max: 20`.

The increase projects through the resolved-choice effect-stack path (`source: 'choice'`, [src/derive/effect-stack.ts](../../src/derive/effect-stack.ts) line ~405), so a resolved ASI raises the derived ability score, modifier, saves, and checks — verified.

## SRD feat catalog now complete

Ability Score Improvement was the **one missing SRD 5.2.1 feat** (the prior "~94%" was 16/17). With it, the starter pack ships **all 17 SRD 5.2.1 feats** (19 SRD-derived pack rows, counting Magic Initiate's 3 variants). Total pack feats 34 → 35.

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: `ability-score-improvement` feat added (adjacent to Grappler, the other General feat).
- **[../../tests/unit/engine/slice-703-asi-feat.test.ts](../../tests/unit/engine/slice-703-asi-feat.test.ts)** (new): 7 tests — structure (RAW shape), cascade (real content drives `planResolveChoice`'s nested-OfferChoice cascade for both forks), projection (a resolved +2 STR pick raises `effectiveAbilityScoreIncrease` and the STR save).
- **[../../tests/audit/srd-l4-complete.test.ts](../../tests/audit/srd-l4-complete.test.ts)**: Section 3 xfail flipped to a passing `it` (the ASI feat now exists).
- **Docs**: getting-started.md feats total 34→35 (audit-enforced); status.md + starter-pack-gaps.md feat counts 18→19 SRD-derived, general 1→2, SRD feat coverage ~94%→100%.
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: `general:ability-score-improvement` joins the wired-feats catalog (`-u`, diff inspected — one line).

## Tests

- `slice-703-asi-feat`: 7/7. `srd-l4-complete`: 20/20 (now 6 plain + 14 xfail). Full suite green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.
- `npx vitest run -u tests/coverage/features.test.ts`: one-line snapshot addition, inspected.

## RNG impact / Breaking change

None. Pure content addition; no event-shape or RNG-stream change.

## Audit (Uncle Bob)

- **Names**: choice ids are intention-revealing (`asi-plus2-ability` / `asi-plus1-abilities`); fork option ids (`plus-2-one` / `plus-1-two`) read as the RAW allocation forks.
- **DRY**: the test reads the real authored content (no re-spelled option lists) so a content edit can't silently desync the test.
- **SRP**: this slice adds only the feat; the L4 class rows that grant it and the full level-up→resolve→derive cascade are slices 704/705.
- **No new primitive**: reuses `IncreaseAbilityScore` (slice 308) + the nested-OfferChoice cascade (slices 511/517). No engine code changed.
- **Pattern-check**: searched for other places ASI/IncreaseAbilityScore should appear — the only consumers of the +N-ability shape are the Ioun Stones / Belt of Dwarvenkind (items, unaffected) and now this feat. The L4 class rows (704) are the remaining site that must reference this feat; tracked as the next slice, not left implicit.

## Open follow-ups

- **704**: L4 feat-or-ASI OfferChoice rows across all 12 classes (GrantFeat menu = ASI + qualifying feats), flipping the floor audit's Section 1 (12 xfails) + Section 4.
- **705**: full level-up→resolve→derive behavioral test.
- A latent general-OfferChoice gap surfaced while modeling `plus-1-two`: `planResolveChoice` validates `selectedOptionIds.length === oneOf` and membership but not **uniqueness**, so a `oneOf: 2` resolution could in principle pass the same ability twice (double-dipping +1). Pre-existing (affects Skilled too), not introduced here; candidate for a small `planResolveChoice` uniqueness guard in the L4 hardening phase.
