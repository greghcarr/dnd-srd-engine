# Slice 637 — engine + content + event schema: Warlock L2 Magical Cunning

**Type:** Engine primitive + new event type + canonical user.

Closes the fourth of slice 633's five L2-complete punch-list xfails (1 remaining: the Eldritch Invocations catalog). The largest L2 slice in the cycle so far because it adds a new event type (`PactSlotsRegained`) — the first mid-rest pact-slot-refund primitive — alongside the planner.

RAW (SRD 5.2.1 Warlock L2): "You can perform an esoteric rite for 1 minute. At the end of it, you regain expended Pact Magic spell slots but no more than a number equal to half your maximum (round up). Once you use this feature, you can't do so again until you finish a Long Rest."

Designed to be reusable: the same `PactSlotsRegained { count, source }` event will land Warlock L20 Eldritch Master ("regain all expended Pact Magic slots") with no schema change — Eldritch Master just emits the event with `count = pactSlotsUsed`.

## Files

### Schema + reducer (the new event type)

- **[../../src/schemas/events/spellcasting.ts](../../src/schemas/events/spellcasting.ts)**: new `PactSlotsRegainedEventSchema` + type. Required fields: `characterId`, `count: int >= 1`, `source: string` (e.g. `'magical-cunning'`; downstream consumers can label transcripts).
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: five insertion points — schema import (twice), discriminated union, event-type-name array, type re-export.
- **[../../src/engine/reducers/spellcasting.ts](../../src/engine/reducers/spellcasting.ts)**: `applyPactSlotsRegained` decrements `pactSlotsUsed` by `event.count`, clamped at 0. Defensive clamp protects against over-credit (planner bug or hand-authored event with too-large `count`).
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: import + dispatch case for `'PactSlotsRegained'`.
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: new case in the transcript formatter — `` `Pact slots regained: ${count} (${source}).` `` — needed for the exhaustive switch and for any test that runs through a Magical Cunning-bearing scenario.

### Content + planner

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: L2 Warlock `magical-cunning` feature was `effects: []`; now ships `GrantResource { resourceId: 'magical-cunning', max: 1, recharge: 'longRest' }` — the per-long-rest gate.
- **[../../src/engine/plan/magical-cunning.ts](../../src/engine/plan/magical-cunning.ts)** (new): planner + `MagicalCunningIntent`. Gates on Warlock L2+, `magical-cunning` resource > 0, a non-empty pact-slot pool, and ≥1 expended slot. Computes regain via `min(ceil(maxPactSlots / 2), pactSlotsUsed)` using the existing `computeSpellSlots(warlock, content.classes).pactSlots.count` derivation. Emits `ResourceSpent + PactSlotsRegained`. No `ActionEconomyConsumed` (RAW: 1-minute out-of-combat rite).
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export `planMagicalCunning`, `MagicalCunningIntent`.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: add `engine.plan.magicalCunning(state, intent)`.
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: add `MagicalCunning` dispatch (planner-wiring audit requirement).

### Tests + audit flip + snapshot

- **[../../tests/unit/engine/slice-637-magical-cunning.test.ts](../../tests/unit/engine/slice-637-magical-cunning.test.ts)** (new): 5 tests
  - L2 regain ceil(1/2) = 1 with 1 expended.
  - L5 cap: ceil(2/2) = 1 with 2 expended (capped at the half-max).
  - L11 cap: ceil(3/2) = 2 with 1 expended (capped at the expended count, the smaller of the two limits).
  - Reducer integration: commit the event and verify `pactSlotsUsed` decrements + gate consumed.
  - Gating rejects: non-warlock / under-L2 / gate-spent / no-expended-slots.
- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**: flip `planMagicalCunning` from the xfail block to the wired block. L2 floor xfail count drops 2 → 1.
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regenerated via `-u` (one-line addition: `"warlock L2 magical-cunning"`).

## Tests

- `npx vitest run tests/unit/engine/slice-637-magical-cunning.test.ts`: 5/5 pass.
- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 pass (13 wired + 1 xfail remaining: eldritch invocations catalog).
- `npx vitest run tests/audit/{planner-wiring,pack-integrity}.test.ts`: green (28/28).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Schema additive: new `PactSlotsRegained` event.** Old campaigns that never logged this event replay unchanged. New campaigns may log it; the event is part of the canonical event-name array, the discriminated union, and the apply-dispatch — so a fresh consumer that doesn't recognize the type would have failed at load time anyway (zod parse). No persisted-shape change to `CampaignState`.

**Content additive: new GrantResource on Warlock L2.** Existing L2+ warlocks gain the `magical-cunning` resource on next state reconciliation (current = max = 1). Replays of pre-slice campaigns do not auto-grant mid-replay, but the planner is opt-in.

**No RNG consumption.** The planner is pure arithmetic; no dice rolled.

**No breaking change** to existing replays or to the public API surface.

## Audit (Uncle Bob)

- **Names**: `planMagicalCunning`, `MagicalCunningIntent`, `engine.plan.magicalCunning`, `PactSlotsRegained` (the new event type). Constants: `WARLOCK_CLASS_ID`, `MAGICAL_CUNNING_LEVEL`, `MAGICAL_CUNNING_GATE_RESOURCE_ID`, `MAGICAL_CUNNING_SOURCE`. The `'magical-cunning'` source string is the same in the gate resource id, the GrantResource, the planner's emitted `PactSlotsRegained.source`, and the content feature id — by intent, so transcripts read coherently.
- **DRY**: the per-long-rest gate uses the same `GrantResource { max: 1, recharge: 'longRest' }` shape established by Divine Intervention (slice 219) and Uncanny Metabolism (slice 636 — three users of the pattern now). The new `PactSlotsRegained` event is the pact-slot analog of the existing `ResourceRestored` arm for the `resources` array; pact slots can't be unified into the resources array without a schema-shaping slice, so the parallel event is the right scope today. When (and if) a similar regain-spell-slot primitive is needed for the standard-spellcasting path (e.g. Wizard Arcane Recovery), consider lifting both to a shared `SlotsRegained { source: 'pact' | 'standard', count, level? }` shape — deferred until there's a second user.
- **SRP**: the planner does one thing (gate consume → compute regain → emit). The reducer does one thing (decrement, clamped). The schema-import surface is wide because the codebase doesn't auto-derive these — every event needs its five touchpoints — but each touchpoint is one line.
- **Magic numbers / strings**: every literal is a named constant. The `Math.ceil(maxPactSlots / 2)` expression encodes the RAW rule directly; no intermediate constant adds clarity.
- **Pattern-check**: searched for sibling features that regain spell slots mid-rest. The two candidates I found: Wizard L1 Arcane Recovery (regular slots, half-level worth of slot levels, after short rest) and Warlock L20 Eldritch Master ("regain all expended Pact Magic slots", 1/long-rest). Arcane Recovery uses a different shape (multiple slot levels, slot-level budget rather than slot count) — not reusable here. Eldritch Master uses *exactly* this shape with `count = pactSlotsUsed`; when its slice lands, it will emit the same event with no schema change. Also re-ran the slice-636 `'martial-arts'` substring lesson: no new literal-id traps in the planner source.

## Open follow-ups

L2-complete punch list now stands at **1 remaining** (was 2):

- ~~`planTacticalMind`~~ — landed (slice 634).
- ~~`planDivineSpark`~~ — landed (slice 635).
- ~~`planUncannyMetabolism`~~ — landed (slice 636).
- ~~`planMagicalCunning`~~ — landed.
- **Eldritch Invocations catalog** — `pack.eldritchInvocations ≥ 3`. This is the last L2 gate, and it's content-only (no engine work). Sweep authors at least 3 invocations and the L2 floor goes fully green; tag `0.3.0-alpha.0` immediately after.

Deferred RAW deviations (documented in planner header):
- The "1-minute esoteric rite" duration is consumer-narration; the engine treats Magical Cunning as a synchronous out-of-combat planner.
- The planner refuses when no slots are expended (UX trap protection: spending the once-per-long-rest gate on zero return). RAW arguably permits the rite anyway; consumers wanting RAW-strict behavior can call the planner inside a try/catch and surface the "no expended slots" message.

Deferred reuse-extraction opportunity:
- When Wizard Arcane Recovery and Warlock Eldritch Master land their planners, revisit whether `PactSlotsRegained` should be lifted to a shared `SlotsRegained { source, count, slotLevel? }` event. Today the abstraction would be premature with one user.
