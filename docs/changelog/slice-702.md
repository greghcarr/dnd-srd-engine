# Slice 702 — tests: CI-guarded "L4 SRD complete" floor audit

**Type:** Tests (audit-only, no engine or content change). Opens the L4 cycle.

Companion to slice 619 (L1), slice 633 (L2), slice 645 (L3). Defines the exit criteria for a future "L4 SRD complete" release (0.7.0-alpha.0) by pinning the L4 surface area as a 20-test audit: 5 invariants green today, 15 xfails marking the L4 punch list.

L4's new SRD 5.2.1 surface (verified against `references/srd-markdown/classes.md`) is small in headcount but structurally significant. It is dominated by one thing: **every class gains Ability Score Improvement at L4** ("You gain the Ability Score Improvement feat or another feat of your choice for which you qualify"). The only class-specific L4 feature is **Monk Slow Fall**; **Fighter Second Wind rises to 3 uses**. No new spell level (full casters reached 2nd-level slots at L3 and reach 3rd at L5; half-casters reached 1st at L2 and reach 2nd at L5), and no subclass features (those land L3/L6/L10/L14).

## Sections

| Section | Tests | What it pins |
|---|---|---|
| 1: ASI present in every class L4 row | 12 (xfail) | RAW grants Ability Score Improvement at L4 for all 12 classes; every `levelTable['4']` ships an empty feature row today, so the feat-or-ASI OfferChoice is absent. Detected by shape (an OfferChoice / GrantFeat / `ability-score`-ish id), not a hard-coded id, so the eventual id choice isn't guessed in the punch list. |
| 2: class-specific L4 features | 2 | Monk Slow Fall present; Fighter `second-wind-3` present with GrantResource max 3. Passing today. |
| 3: the ASI feat exists | 1 (xfail) | RAW frames the L4 grant as a feat: the "Ability Score Improvement" feat (+2 one ability / +1 two, max 20), modeled via the slice-308 `IncreaseAbilityScore` primitive. No such feat ships yet. |
| 4: behavioral level-up cascade | 1 (xfail) | Leveling a Fighter 3→4 should emit an ASI/feat `ChoiceRequired`. Fighter chosen because its L4 row carries no subclass-selection complication and currently emits no OfferChoice; `planLevelUp` already walks new-level OfferChoice effects, so the row landing is the only gap. |
| 5: L4 resource scaffolding | 3 | Fighter Second Wind max 3 (shortRest), Sorcerer Sorcery Points → 4, Monk Focus Points (ki) → 4 — the level formulas evaluate at an L4 `FormulaContext`. Passing today. |
| 6: planner presence | 1 (xfail) | Slow Fall → `planSlowFall` (reduction = 5 × monk level, mirror of slice-648 `planDeflectAttacks`). Not built; the cycle decides to wire the reduction calculator or reclassify Slow Fall as consumer-managed. |

## L4 punch list (xfails)

**Content (the dominant deliverable):**
- The "Ability Score Improvement" feat (Section 3) — an OfferChoice (+2 one / +1 two) whose options carry `IncreaseAbilityScore` effects, capped at 20.
- The L4 feat-or-ASI OfferChoice row across all 12 classes (Section 1) — each option a GrantFeat reference (the ASI feat plus the feats the character qualifies for). Rides the existing slice-511/517 GrantFeat + nested-OfferChoice cascade.

**Behavioral:**
- Leveling 3→4 emits the ASI/feat ChoiceRequired (Section 4), and resolving it (pick ASI feat → +2 ability) moves the derived ability score (`IncreaseAbilityScore` already flows through the `source:'choice'` effect-stack path — verified before writing this audit).

**Planner:**
- `planSlowFall` (Section 6), or a documented reclassification of Slow Fall as consumer-managed (no falling-damage model).

When all 15 xfails flip, the L4 floor goes fully green and `0.7.0-alpha.0` ("L4 SRD complete") is unblocked.

## What this audit deliberately does NOT cover

Mirror of the L2/L3 cycle stagger — hardening comes as follow-up slices once the punch list closes:

- L4 fuzz matrix extension ([1,2,3] → [1,2,3,4]; mirrors slice 651).
- Full behavioral ASI resolution depth beyond the single Section-4 cascade pin (per-option ability-picker correctness, the max-20 cap, "+1 two distinct abilities") — deferred to the ASI-content wiring slice's own unit tests.

## Files

- **[../../tests/audit/srd-l4-complete.test.ts](../../tests/audit/srd-l4-complete.test.ts)** (new): 20-test audit, 6 sections.

## Tests

- `npx vitest run tests/audit/srd-l4-complete.test.ts`: 20/20 pass (5 plain + 15 xfail-as-pass).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: each section's intent is in its describe label; per-class Section 1 titles name the class so a regression names the exact owner. xfail titles carry the reason inline (`unmodeled today`, `not built`).
- **DRY**: each section drives from one data table or one `ALL_CLASS_IDS` loop. The resource-pin loop is the same shape as slice 650's L3 pin; the planner-presence loop mirrors slice 645's L3 Section 3.
- **SRP**: the file's one job is to define L4-complete. It defers wiring depth + RAW-correctness to per-feature unit tests, spell wiring to the existing per-level floor (L4 adds none), and fuzz to a future L4 matrix extension.
- **Magic numbers / strings**: canonical ids/resource maxes are content-stable promises (matching the L1-L3 floor convention). The 20-test count is the sum of the six sections, not a magic number.
- **Pattern-check**: the `hasAsiOfferChoice` detector matches by structural shape rather than a guessed id, so the audit can't false-fail when the wiring slice picks a different feature id. Searched the prior floors for the "xfail whole content section" pattern — L3's Section 3 used per-row `it.fails`; this reuses it for Section 1's 12 cells.

## Open follow-ups

L4-complete punch list:

- **703**: the "Ability Score Improvement" feat (content — OfferChoice + IncreaseAbilityScore, max 20).
- **704**: the L4 feat-or-ASI OfferChoice row across all 12 classes (content; flips Section 1's 12 xfails + Section 4's cascade).
- **705**: behavioral ASI-resolution test (level 3→4 → resolve → derived ability moves; flips Section 4 to a passing `it`).
- **706**: Monk Slow Fall decision — `planSlowFall` reduction calculator or documented consumer-managed reclassification (flips Section 6).
- **707+**: L4 hardening — fuzz matrix extension ([1,2,3] → [1,2,3,4]).

When the punch list closes, tag `0.7.0-alpha.0` ("L4 SRD complete").
