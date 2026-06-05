# Slice 638 — tests: correct L2 floor's invocation-catalog audit query

**Type:** Tests (audit-only, no engine, content, or behavior change).

Closes the fifth and final entry on slice 633's L2-complete punch-list. The "Eldritch Invocations catalog" xfail turned out to be an audit-authoring bug, not a content gap: the audit queried `pack.eldritchInvocations` (a nonexistent top-level key), but invocations have been authored as `feats` with `category: 'invocation'` since slice 511. The pack already ships **16 invocations** under the real key; the catalog was complete the day the slice-633 floor went in, the audit just didn't see it.

This corrects the query so it inspects the actual catalog location and flips `it.fails` → `it`. With this slice, the L2 floor is **32/32 green** and `0.3.0-alpha.0` ("L2 SRD complete") is unblocked.

## Files

- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**:
  - Section 4 invocation-catalog test: rewrote from `pack.eldritchInvocations` to `(PACK.feats ?? []).filter(f => f.category === 'invocation')`. Flipped `it.fails` → `it`. Pinned the threshold at ≥3 (matches the L2 Warlock's "known" count); the actual catalog ships 16, so the floor has comfortable headroom.
  - File-header comment block: updated the Section 2 + closing paragraphs to reflect the post-slice-637 reality (all five xfails flipped across slices 634-638). Removed the "When each `it.fails` flips" instruction since none remain.

## Tests

- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 plain `it` pass. Zero xfails remaining.
- Full suite: 506 files / 3424 passing + 173 skipped (unchanged from slice 637's count — no test added or removed; one test changed shape from xfail to plain).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit-query correction.

## Audit (Uncle Bob)

- **Names**: assertion message updated to name the right pack key (`feats[category='invocation']`). The audit's intent is unchanged; only the query target changed.
- **DRY**: the audit now consults the same single source as every other invocation-aware code path (`pack.feats` filtered by category). The phantom `pack.eldritchInvocations` key, which the audit was the only consumer of, can be retired from anyone's mental model.
- **SRP**: the audit's one job (gate the L2 completion claim on a shippable catalog) is now actually doing that job.
- **Magic numbers / strings**: the ≥3 threshold is the L2 Warlock's "Eldritch Invocations (3 known)" count, named-in-pack via the L2 content feature id `eldritch-invocations-3`. The mapping is mechanical (3 picks ↔ ≥3 entries in the catalog).
- **Pattern-check**: are there other slice-633-style xfails that query against a nonexistent key? Reviewed Section 1 (per-class feature id presence; all reads go through `levelTable['2'].features`, the existing pack shape) and Section 4 OfferChoice cascade test (reads through `engine.plan.offerCharacterChoices`, exercised end-to-end). No other audit drift candidates.

## Open follow-ups

L2-complete punch list now stands at **0 remaining**:

- ~~`planTacticalMind`~~ — landed (slice 634).
- ~~`planDivineSpark`~~ — landed (slice 635).
- ~~`planUncannyMetabolism`~~ — landed (slice 636).
- ~~`planMagicalCunning`~~ — landed (slice 637).
- ~~Eldritch Invocations catalog~~ — verified already-shipped via this slice's audit correction.

**Next step (consumer-gated):** tag `v0.3.0-alpha.0` ("L2 SRD complete") on the merged-to-main commit. The release flow is documented in [VERSIONING.md](../../VERSIONING.md) and the slice-632 release notes; per [CLAUDE.md](../../CLAUDE.md) the push / PR / merge / tag steps are explicit-user-instruction-only and don't ship as part of this slice.

A future content cohort can expand the invocation catalog beyond the current 16 (the 2024 SRD lists more), but that's an enrichment, not a gate.
