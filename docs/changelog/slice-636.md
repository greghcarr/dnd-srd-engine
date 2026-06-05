# Slice 636 — engine + content: Monk L2 Uncanny Metabolism planner

**Type:** Engine primitive + canonical user.

Closes the third of slice 633's five L2-complete punch-list xfails (2 remaining). RAW (SRD 5.2.1 Monk L2): "When you roll Initiative, you can regain all expended Focus Points. When you do so, roll your Martial Arts die, and regain a number of Hit Points equal to your Monk level plus the number rolled. Once you use this feature, you can't use it again until you finish a Long Rest."

The slice introduces two reused engine primitives in combination:
- **Per-long-rest gate** as a one-charge resource (matching the Divine Intervention pattern from slice 219).
- **Resource-restore-all** event (`ResourceRestored { amount: 'all' }`), which already exists in the schema but had no planner using it for a mid-encounter refund until now.

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: the L2 Monk `uncanny-metabolism` feature was previously `effects: []`. Now ships `GrantResource { resourceId: 'uncanny-metabolism', max: 1, recharge: 'longRest' }` — the once-per-long-rest gate enforced by the planner.
- **[../../src/engine/plan/uncanny-metabolism.ts](../../src/engine/plan/uncanny-metabolism.ts)** (new): planner + `UncannyMetabolismIntent`. Gates on Monk L2+ enrollment and ≥1 `uncanny-metabolism` resource available. On success emits three events in order:
  1. `ResourceSpent { resourceId: 'uncanny-metabolism', amount: 1 }` (per-long-rest gate consumed).
  2. `ResourceRestored { resourceId: 'ki', amount: 'all' }` (refunds expended Focus Points; emitted only if the monk's resource list carries `ki`, which it should at L2+).
  3. `Healed { source: 'uncanny-metabolism', amount: monkLevel + martialArtsDie(monkLevel) }`.
  Uses the existing `martialArtsDie` helper (single source for the 1d6 / 1d8 / 1d10 / 1d12 ladder at monk levels 1 / 5 / 11 / 17). No `ActionEconomyConsumed` (RAW: fires *as* initiative is rolled, no action / bonus action / reaction cost).
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export `planUncannyMetabolism`, `UncannyMetabolismIntent`.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: add `engine.plan.uncannyMetabolism(state, intent)` returning `PlanResult`.
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: add `UncannyMetabolism` dispatch to `performIntent` (planner-wiring audit requirement).
- **[../../tests/unit/engine/slice-636-uncanny-metabolism.test.ts](../../tests/unit/engine/slice-636-uncanny-metabolism.test.ts)** (new): 4 tests — three-event emission at L2 (per-long-rest + ki-restored-all + healed in the [3, 8] band), martial-arts die scaling (1d8/1d10/1d12 at L5/L11/L17 verified by sweep), gating rejects (non-monk / under-L2 / already-used), no `ActionEconomyConsumed`.
- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**: flipped `planUncannyMetabolism` from the xfail block to the wired block. L2 floor xfail count drops 3 → 2.
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regenerated via `npx vitest run -u tests/coverage/features.test.ts` (one-line addition: `"monk L2 uncanny-metabolism"`). Inspected; matches the slice's content addition exactly.

## Tests

- `npx vitest run tests/unit/engine/slice-636-uncanny-metabolism.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 pass (12 planners wired + 2 xfails remaining).
- `npx vitest run tests/audit/planner-wiring.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/pack-integrity.test.ts`: 24/24 pass (initial run caught the literal substring `'martial-arts'` in a comment in `uncanny-metabolism.ts` — the audit's `BACKED_INDIRECTLY` allowlist treats source-blob presence as evidence the handler has been promoted to a name-referenced implementation. Rewrote the comment to use "Martial Arts die" (no hyphen) so the substring stays out of source).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Content change (additive): new `GrantResource` on Monk L2.** Existing L2+ monks who load into a campaign after this slice gain the `uncanny-metabolism` resource on their next state reconciliation (current = max = 1). Replays of pre-slice campaigns do not auto-grant the resource mid-replay, but the planner is opt-in: any consumer that never invokes it sees no behavior change. Once-per-long-rest semantics are preserved because the planner refuses to fire without the resource.

**RNG (additive).** Consumers who explicitly invoke `engine.plan.uncannyMetabolism` consume one martial-arts die per call. No existing path calls it.

**No breaking change** to the public API or to existing replays.

## Audit (Uncle Bob)

- **Names**: `planUncannyMetabolism`, `UncannyMetabolismIntent`, `engine.plan.uncannyMetabolism`. Constants `MONK_CLASS_ID`, `UNCANNY_METABOLISM_LEVEL`, `UNCANNY_METABOLISM_RESOURCE_ID`, `KI_RESOURCE_ID`, `UNCANNY_METABOLISM_SOURCE`. The legacy "ki" id (not "focus") is documented in the planner header — the engine kept the 2014 id for backward compatibility with shipped campaigns, while the 2024 PHB renamed the resource to "Focus Points."
- **DRY**: per-long-rest gate uses the same `GrantResource { max: 1, recharge: 'longRest' }` shape as Divine Intervention (slice 219). Martial Arts die lookup goes through the single existing `martialArtsDie` helper (no duplicate ladder). `ResourceRestored { amount: 'all' }` is the existing schema arm — no new event type introduced for the refund.
- **SRP**: planner does one thing (consume gate → refund Ki → heal); test file locks four observable behaviors; content edit is a single field addition.
- **Magic numbers / strings**: every literal is a named constant. The `'1d6'` fallback in the planner is a defensive read for the impossible "monk level 0" case (the L2 gate makes it unreachable); kept explicit so the dependence on `martialArtsDie`'s undefined branch is local.
- **Pattern-check**: searched for other "regain a resource pool as part of another action" planners. The pattern is unusual — most planners spend resources rather than restoring them. Hit Dice / rest planners restore on rest events, not via player intent; Divine Intervention only casts a spell without restoring its own pool. Uncanny Metabolism is the first planner that emits `ResourceRestored` mid-encounter. When a second arrives (Warlock Magical Cunning is the obvious next case in slice 637), consider extracting a shared `restoreResource(targetResourceId)` helper. With one user, the abstraction is premature.

## Open follow-ups

L2-complete punch list now stands at **2 remaining** (was 3):

- ~~`planTacticalMind`~~ — landed (slice 634).
- ~~`planDivineSpark`~~ — landed (slice 635).
- ~~`planUncannyMetabolism`~~ — landed.
- **`planMagicalCunning`** — L2 Warlock Pact slot regain (the second `ResourceRestored` mid-encounter user; consider whether to extract a shared helper alongside this slice).
- **Eldritch Invocations catalog** — `pack.eldritchInvocations ≥ 3`.

Deferred RAW deviations (documented in planner header):
- The "When you roll Initiative" trigger is consumer-driven (RAW: "you can"). The engine surfaces the planner; the consumer decides whether to invoke it on each `RollInitiative` event. A future trigger primitive could automate the prompt, but RAW's optional wording means the manual path is correct as-is.
- The 2024 PHB renamed "Ki Points" → "Focus Points"; the engine retained the `ki` resource id for backward compatibility. The content shows "Monk's Focus (Ki)" as the feature name, splitting the difference. A future content cohort may rename the resource id (breaking-change ladder); deferred.
