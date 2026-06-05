# Slice 642 — tests: multiclass L1+L1 build audit

**Type:** Tests (audit-only). Fourth of five L2 hardening slices.

The slice-633 L2 floor covers single-class L2 builds (one entry per class). It does **not** cover the other shape of "total character level 2" — a multiclass L1+L1 character. Any of 66 unordered class pairs could silently break the build, the schema parse, the commit, or the derive path without any existing audit noticing.

Slice 642 adds 67 tests (1 enumeration sanity + 66 per-pair) that build an L1+L1 character with high stats (all 14s, clearing every RAW multiclass prerequisite at 13+), commit the `CharacterCreated` event, and confirm `engine.derive.character` returns a defined sheet without throwing.

All 67 pass with the current engine — the multiclass path is healthy. The floor's job is to prevent silent regression.

## What this audit checks vs. what it doesn't

| Checks | Doesn't check |
|---|---|
| 66 distinct class pairs build via `CharacterSchema.parse` | Specific feature presence per pair (combinatoric; the single-class L1 floor + derive layer handle this implicitly) |
| Each pair commits a `CharacterCreated` event cleanly | Multiclass spellcasting slot math (covered by `computeSpellSlots` tests) |
| `engine.derive.character` returns a defined sheet without throwing | RAW-correct HP per RAW (caller supplies hpMax; the engine doesn't compute it) |

A regression that breaks even one pair lights up immediately, naming the offending class combo in the test title (`${a} + ${b}: builds, commits, derives without throwing`).

## Files

- **[../../tests/audit/multiclass-l1-pairs.test.ts](../../tests/audit/multiclass-l1-pairs.test.ts)** (new): generates the 66 unordered pairs from the 12 SRD classes, runs the build → commit → derive pipeline per pair. Each test is independent (fresh engine + campaign per assertion) so a single-pair regression doesn't poison the rest of the suite.

## Tests

- `npx vitest run tests/audit/multiclass-l1-pairs.test.ts`: 67/67 pass.
- Full suite: 507 files / 3501 passing + 173 skipped (was 506 / 3434; +1 file, +67 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: file path (`multiclass-l1-pairs`) and test description (`multiclass L1+L1 builds cleanly for every class pair`) state exactly what the audit guarantees. Per-pair title format puts both class ids in the test name so failures point at the exact combination.
- **DRY**: pairs are generated mechanically from a single `CLASSES` array. Adding a 13th class (e.g. Artificer in a future content cohort) automatically extends the audit from 66 to 78 pairs with no manual edits.
- **SRP**: the audit's one job is "every pair builds + derives." Per-class feature semantics live elsewhere (the L1 floor + per-class unit tests).
- **Magic numbers / strings**: every value is named — `CLASSES`, `PAIRS`, the stat array is the minimum-clearing-RAW-prereqs value (14, which exceeds the 13 the strictest multiclass prerequisite requires).
- **Pattern-check**: the same combinatoric shape applies to multiclass at higher total levels (L1+L2 = L3 total, L2+L2 = L4 total, etc.). When an L3 or L4 floor lands, the multiclass extension could either (a) iterate pairs at the new total level too, or (b) leave the audit at L1+L1 and trust that single-class L3 + the L1 multiclass floor jointly cover the surface. Decision deferred until the L3 floor authoring slice.

## Open follow-ups

L2 floor hardening punch list (slice 642 of 5):

- ~~639~~: Resource max-value pin. Landed.
- ~~640~~: Recharge cadence pin. Landed.
- ~~641~~: Spell wiring floor enforcement. Landed.
- ~~642 (this slice)~~: Multiclass L1+L1 build audit. Landed.
- **643**: L2 fuzz floor — seeded encounter sweep across all 12 classes at L2 with no thrown errors. Last hardening slice; after it the floor is genuinely defensible and `v0.3.0-alpha.0` can ship.

Deferred (out of L2-complete scope):
- **Multiclass L1+L2 / L2+L1 / L2+L2 audits**: when the L3 / L4 floors land, decide whether to extend this audit upward or trust the single-class N + L1+L1 multiclass to jointly cover the surface.
- **Feature-presence assertion per pair**: today the audit only checks "doesn't throw." A stronger version would inspect `derived.features` for each pair and assert both classes' L1 features are visible. Adds complexity without obvious payoff; defer until a regression motivates it.
