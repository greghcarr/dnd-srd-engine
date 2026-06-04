# Slice 633 — tests: CI-guarded "L2 SRD complete" floor audit

**Type:** Tests (audit-only, no engine or content change).

Companion to slice 619's `srd-l1-complete.test.ts`. Defines the exit criteria for a future "L2 SRD complete" release (0.3.0-alpha.0) by pinning the surface area that constitutes a full L2 experience, with the five engine gaps that remain marked as `it.fails` xfails. Each xfail flipping to "test unexpectedly passed" becomes the prompt for the slice that wires the corresponding planner / content; when all five flip, L2 is complete.

This is the first slice of the L2 push. It deliberately ships no engine work — only the measurable definition of done — so subsequent L2 slices land against a fixed target.

## Files

- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)** (new): 32 tests across four sections.
  - **Section 1** (12 tests): per-class L2 feature ids present in the pack. Locks the canonical id list (e.g. `barbarian` → `reckless-attack` + `danger-sense`; `cleric` → `channel-divinity` + `divine-spark` + `turn-undead`) so a content rewrite can't silently rename or drop an L2 feature. Passes today because the L2 scaffolding has shipped since the early class-features cohort.
  - **Section 2** (13 tests, 9 wired + 4 xfail): planner presence for each L2 feature that needs one. Wired today: `planRecklessAttack`, `planTurnUndead`, `planWildShape`, `planWildCompanion`, `planActionSurge`, `planStepOfTheWind`, `planPaladinsSmite`, `planCunningAction`, `planMetamagic`. Xfailing: `planTacticalMind`, `planDivineSpark`, `planUncannyMetabolism`, `planMagicalCunning`. Each xfail carries a one-line reason naming the engine primitive that has to land first.
  - **Section 3** (5 tests): L2 resource scaffolding. Each resource-granting L2 feature (Action Surge, Channel Divinity, Wild Shape uses, Monk's Focus / Ki, Sorcery Points) ships with a `GrantResource` effect on its L2 row. Passes today; prevents regressions while the L2 wiring fills out.
  - **Section 4** (2 tests, 1 wired + 1 xfail): OfferChoice cascade. Wired: a fresh L2 Wizard emits the `wizard-scholar` ChoiceRequired with the six SRD academic-skill options via `engine.plan.offerCharacterChoices`. Xfailing: `pack.eldritchInvocations` ships at least 3 invocation entries (the L2 Warlock needs them to satisfy the Magical Cunning / Eldritch Invocations 3-known pick).

## Tests

- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 pass (27 plain pass + 5 xfail-as-pass).
- The 5 xfail entries (4 planner gaps + 1 content gap) collectively form the L2-complete gate. When each flips to "test unexpectedly passed", convert `it.fails` → `it()` in the same slice that wires the underlying capability.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 502 files / 3406 passing + 173 skipped (was 502 / 3374 pre-slice; +32 from this audit).
- No engine, content, or doc-prose changes outside the new audit file. No effect on existing tests.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: section names (`'Section 1: per-class L2 features (canonical ids present)'` etc.) match the intent precisely. The `xfail:` prefix on the four failing-planner test names mirrors the pytest convention and makes the gate state immediately visible in test output.
- **DRY**: each section drives its tests from one data table (`REQUIRED_L2_FEATURES`, `PLANNERS`, `RESOURCE_BEARING_L2_FEATURES`). Adding a new L2 feature is one table row, not a new test. Same shape as the L1 floor.
- **SRP**: the file's one job is to define L2-complete; it deliberately defers wiring depth (damage dice, save DCs, per-rest reset semantics) to per-feature unit tests, and defers spell wiring to the existing `gaps-spells-counts` audit. The audit fails when a surface drops; it doesn't redo the mechanics tests.
- **Magic numbers / strings**: each canonical id is a content-stable promise (matching the L1 floor's convention of literal id arrays); the SRD content lists are the single source. No arbitrary numbers introduced.
- **Pattern-check**: searched for sibling "floor audit" candidates that should follow the same shape — only L1 exists today (`srd-l1-complete.test.ts`), the L2 floor lands here, and L3+ floors are reserved for future slices in the level-by-level push. No other patterns to update.

## Open follow-ups

The five xfail entries form the L2-complete punch list:

- **`planTacticalMind`** — L2 Fighter feature: spend a Second Wind use to add 1d10 to a failed ability check.
- **`planDivineSpark`** — L2 Cleric Channel Divinity option (BA cast, heal or necrotic/radiant). Needs a per-CD-option dispatch surface.
- **`planUncannyMetabolism`** — L2 Monk feature: on-initiative HP regain (martial-arts-die + monk level) plus all Ki. Needs an on-initiative trigger hook plus a heal-by-formula primitive.
- **`planMagicalCunning`** — L2 Warlock feature: 1/long-rest action regains all expended Pact Magic slots after 1-minute meditation. Needs a "regain slots of a specific casting type" primitive.
- **Eldritch Invocations catalog** — `pack.eldritchInvocations ≥ 3` so the L2 Warlock can make their three picks. Per slice 54 / 513-516 the L1 cohort wired Pact Magic and pact boons; the invocation catalog itself remains content-side TODO.

When all five flip green, tag `0.3.0-alpha.0` ("L2 SRD complete").
