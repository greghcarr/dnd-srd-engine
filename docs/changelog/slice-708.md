# Slice 708 — tests: correct the L4 floor audit's Slow Fall planner reference

**Type:** Test/audit correction. No engine or content change. Closes the last L4 floor-audit xfail by pointing it at the real planner.

## What this fixes

Slice 702's "L4 SRD complete" floor audit (Section 6) xfailed on a `planSlowFall` planner it assumed would need building, with a comment claiming "the engine has no falling-damage model." **Both assumptions were wrong:** Monk L4 Slow Fall has been wired all along via [`planFalling`](../../src/engine/plan/falling.ts)'s `useSlowFall` arm — `planFalling` models falling damage (1d6 per 10 ft, capped at 20d6) AND, when `useSlowFall` is set, reduces it by 5 × monk level (requires Monk L4+, consumes the Reaction, rejects double-use). It has a dedicated test ([plan-falling-slow-fall.test.ts](../../tests/unit/engine/plan-falling-slow-fall.test.ts)).

An initial attempt this slice added a separate `planSlowFall` reduction calculator — a redundant, inferior duplicate (no fall-damage model). Two CI audits caught it immediately:

- **pack-integrity** ("the indirectly-backed allowlist stays accurate"): the new `src/engine/plan/slow-fall.ts` made the string `slow-fall` appear in source, so the `BACKED_INDIRECTLY['slow-fall']` allowlist entry (documenting that planFalling backs it) became "now referenced by name" → flagged stale.
- **planner-wiring** ("every engine.plan method is dispatch-routed or allowlisted"): the new `engine.plan.slowFall` was neither dispatch-routed nor in `EXCLUDED_FROM_DISPATCH`.

Rather than paper over the duplicate, the redundant `planSlowFall` was removed and the floor audit corrected to reference the real `planFalling`. The `BACKED_INDIRECTLY['slow-fall']` entry (correctly documenting planFalling's useSlowFall arm) stays untouched.

## Files

- **[tests/audit/srd-l4-complete.test.ts](../../tests/audit/srd-l4-complete.test.ts)**: Section 6's `PlannerExpectation` now checks `planFalling` (the planner backing Slow Fall) and passes; header + Section 6 comments corrected.

## L4 floor audit: fully green

The L4 floor audit is now **20/20 with zero xfails** — every L4 punch-list item is closed: the universal ASI choice across all 12 classes (slice 707), Monk Slow Fall (planFalling, pre-existing), Fighter Second Wind 3, and the Sorcery Points / Focus Points → 4 resource scaling. L4 SRD-completeness for content + planners is done; the remaining cycle work is the fuzz-matrix extension + the release tag.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green; the previously-failing pack-integrity + planner-wiring audits pass (no redundant planner).
- No engine, content, or event schema change.

## Audit (Uncle Bob)

- **DRY / no duplication**: the correct outcome is *one* Slow Fall implementation (planFalling), not two; the redundant planner was removed rather than retained.
- **Honesty**: the floor audit now names the planner that actually backs the feature, so a future regression in `planFalling` would surface against the Slow Fall row.
- **Pattern-check**: the failure was a stale-assumption in a slice-702 xfail; the two guard audits (pack-integrity, planner-wiring) are exactly the safety net that caught the duplicate before it shipped — left intact.

## Open follow-ups

- L4 hardening: extend the fuzz matrix from `[1,2,3]` to `[1,2,3,4]` (slice 651 pattern), then tag `0.7.0-alpha.0` ("L4 SRD complete").
- Per-character feat-eligibility filter for the L4 ASI menu (Grappler's ability prerequisite) — carried from slice 707.
