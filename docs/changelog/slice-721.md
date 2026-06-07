# Slice 721 — engine: Druid Wild Resurgence (L5)

**Type:** Engine feature (new planner + new event). Additive; L5 SRD-complete cycle. Wires the slice-54 Druid L5 stub.

SRD 5.2.1 Druid L5 Wild Resurgence — two no-action conversions:
- "Once on each of your turns, if you have no uses of Wild Shape left, you can give yourself one use by expending a spell slot (no action required)."
- "In addition, you can expend one use of Wild Shape (no action required) to give yourself a level 1 spell slot, but you can't do so again until you finish a Long Rest."

## What changed

New `engine.plan.wildResurgence(state, { druidId, mode, slotLevel? })` (`planWildResurgence`), with two modes:

- **`slot-to-wild-shape`**: requires Wild Shape `current === 0` (the RAW "no uses left" precondition), expends a standard spell slot (`SpellSlotConsumed`, defaulting to the lowest available level) and restores one Wild Shape use (`ResourceRestored`). The precondition is the primary gate; after the conversion Wild Shape is 1, so it can't repeat until that use is spent — which covers the "once per turn" bound in practice (a strict per-turn flag isn't separately tracked).
- **`wild-shape-to-slot`**: requires a Wild Shape use, the once-per-Long-Rest gate, and an expended level-1 slot to regain; spends 1 Wild Shape use + 1 gate use and regains one level-1 standard slot (`SpellSlotsRegained`).

New event **`SpellSlotsRegained`** `{ characterId, slotLevel, count, source }` — the standard-slot sibling of `PactSlotsRegained`; the reducer decrements `spellSlotsUsed[slotLevel]` by `count`, clamped at 0 (can't bank slots above max). Reusable (e.g. Arcane Recovery later).

The once-per-Long-Rest limit is a `wild-resurgence` gate resource (`max 1`, `recharge: 'longRest'`) granted by the Druid L5 feature and auto-seeded by `seedResourcesFromContent`. Both conversions are "no action required" — no action-economy events.

## Files

- [src/schemas/events/spellcasting.ts](../../src/schemas/events/spellcasting.ts): `SpellSlotsRegainedEvent`.
- [src/engine/reducers/spellcasting.ts](../../src/engine/reducers/spellcasting.ts), [src/engine/apply.ts](../../src/engine/apply.ts), [src/schemas/events/index.ts](../../src/schemas/events/index.ts): reducer + dispatch + barrel.
- [src/engine/plan/wild-resurgence.ts](../../src/engine/plan/wild-resurgence.ts) (new): `planWildResurgence`.
- [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts), [src/engine/conveniences.ts](../../src/engine/conveniences.ts): `engine.plan.wildResurgence` + `planIntent` dispatch.
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Druid L5 `wild-resurgence` gains the gate `GrantResource`.
- [tests/transcript.ts](../../tests/transcript.ts): format the new event (exhaustive switch).
- [tests/unit/engine/slice-721-wild-resurgence.test.ts](../../tests/unit/engine/slice-721-wild-resurgence.test.ts) (new): both conversions, the once-per-LR gate, the headroom/precondition guards, L4 rejection.
- [tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap): `druid L5 wild-resurgence` now wired (`-u`).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. New event added to the `EventSchema` union; `planIntent` dispatch + planner-wiring audit account for `WildResurgence`.

## Audit (Uncle Bob)

- **Reuse**: spend a slot via the same `SpellSlotConsumed` + `computeAvailableSpellSlots` paladins-smite uses; regain a use via the existing `ResourceRestored`; the once-per-LR gate is the standard gate-resource pattern.
- **New event justified**: no standard-slot regain existed (only pact); `SpellSlotsRegained` mirrors `PactSlotsRegained` and is reusable.
- **Determinism**: pure; no RNG.
- **No waste**: headroom guards (Wild Shape at max / no expended L1 slot) prevent spending a resource for a no-op.
- **SRD-faithful**: both arms modeled; the once-per-turn arm is bounded by the "no uses left" precondition (documented).

## Open follow-ups

- The `slot-to-wild-shape` once-per-turn cap relies on the precondition rather than a per-turn flag; if a consumer needs the strict bound, add a `turnUsage` flag cleared on `TurnStarted`.
