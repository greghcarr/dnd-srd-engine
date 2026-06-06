# Slice 707 — content: the L4 Ability Score Improvement choice across all 12 classes

**Type:** Content (12 class L4 rows) + tests. Resumes the L4 cycle (after the interactive-play detour). No engine code change; no event schema change.

RAW (SRD 5.2.1 classes.md): every class gains **Ability Score Improvement** at L4 — "the Ability Score Improvement feat or another feat of your choice for which you qualify." This was the dominant L4 deliverable and the bulk of the floor-audit punch list (Section 1's 12 xfails + Section 4's level-up cascade).

## What landed

Each class's `levelTable['4']` now carries an `ability-score-improvement-4` feature whose `OfferChoice` (`oneOf: 1`, `when: 'onAcquire'`) offers the player a feat via `GrantFeat`:

- **Ability Score Improvement** (the slice-703 feat; +2 one / +1 two abilities, max 20)
- **Grappler** (the other SRD General feat)

No new engine primitive: this rides the existing level-up + cascade machinery. `planLevelUp` already walks a new level's `OfferChoice` effects and emits a `ChoiceRequired`; `planResolveChoice` already expands a chosen `GrantFeat` into the feat's effects and cascades its nested `OfferChoice`s (slices 511/517); and `IncreaseAbilityScore` already projects through the `source:'choice'` effect-stack path. So leveling 3→4 → pick ASI → +2/+1 allocate → ability picker → the derived ability score moves, all through code that already existed.

Fighter (`second-wind-3`) and Monk (`slow-fall`) keep their existing L4 features; the ASI feature is appended alongside.

## Eligibility (documented approximation)

The menu lists both SRD General feats unconditionally; it does **not** yet filter by per-character prerequisites (e.g. Grappler's "Strength or Dexterity 13+"), so a low-STR/DEX caster is still offered Grappler. This is the sanctioned-approximate behavior for this cycle; Grappler ships `effects:[]` (its grappling benefits are unmodeled), so the imperfection is cosmetic. A lightweight feat-eligibility filter (useful too as a DDB-style feat-picker query) is the tracked follow-up. Fighting-Style feats (taken via the Fighting Style feature's own choice) and Origin feats (background-only at creation in 2024) are intentionally not in the ASI menu.

## Floor audit

[tests/audit/srd-l4-complete.test.ts](../../tests/audit/srd-l4-complete.test.ts): Section 1 (12 per-class xfails) and Section 4 (the 3→4 cascade xfail) flipped to passing `it`. The only remaining L4 xfail is Section 6 (`planSlowFall`).

## Files

- **[src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: `ability-score-improvement-4` added to all 12 classes' L4 rows.
- **[tests/unit/engine/slice-707-l4-asi-choice.test.ts](../../tests/unit/engine/slice-707-l4-asi-choice.test.ts)** (new): 2 tests — the 3→4 level-up emits the feat ChoiceRequired (ASI + Grappler); the full cascade (pick ASI → +2 → STR) raises `effectiveAbilityScoreIncrease` and the derived STR save by 1.
- **[tests/audit/srd-l4-complete.test.ts](../../tests/audit/srd-l4-complete.test.ts)**: Section 1 + Section 4 flipped.
- **[tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: +12 wired class features (`-u`, diff = the 12 ASI rows only).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.
- No existing event schema changed.

## Audit (Uncle Bob)

- **No new primitive**: pure content riding the level-up/cascade/derive machinery already in place; zero engine code touched.
- **Names**: feature id `ability-score-improvement-4` + name "Ability Score Improvement" match the SRD heading and the slice-703 feat; the OfferChoice/GrantFeat shape mirrors the existing Magic Initiate / invocation feat-grants.
- **DRY**: the same authored OfferChoice across all 12 classes (the L4 ASI is identical per RAW); the behavioral test reads the real pack content.
- **Pattern-check**: the shared feature id is intentional (the ASI feature is the same concept in every class; cf. "Extra Attack" which only namespaces by authoring choice); no audit enforces global feature-id uniqueness, and the coverage snapshot keys class features by `class + level + id` so they remain distinct rows.

## Open follow-ups

- L4 punch list remaining: Monk Slow Fall (`planSlowFall` reduction or documented consumer-managed) → Section 6 xfail.
- Per-character feat-eligibility filter for the ASI menu (Grappler's ability prerequisite) — a reusable feat-picker query.
- ASI at L8/12/16 (and Fighter L6, Rogue L10) reuses this exact row; lands when those tiers are reached.
- Then L4 hardening (fuzz matrix [1,2,3]→[1,2,3,4]) + tag `0.7.0-alpha.0` ("L4 SRD complete").
