# Slice 668 — content: Levitate (flight/hover via buff + levitating-active)

**Type:** Content edit only. **Eighth slice of the post-L3-RAW completeness push.** Closes 1 deferred L2 spell with pure composition of existing primitives.

The gaps-spells.md entry listed Levitate under "flight / hover condition" deferred. The engine already has the `ModifySpeed { mode: 'fly' }` primitive (used by Fly, Dragon Wings, etc.) and the `buff` mechanic. Slice 668 just authors the condition + spell wiring.

## What's wired

- **Levitate** (L2 sorcerer/wizard) gets `mechanicalEffects: [{ kind: 'buff', conditionId: 'levitating-active' }]`. Cast applies the marker on the named target (a willing creature or unattended object); concentration drop sweeps it.
- New condition `levitating-active` projects `ModifySpeed { mode: 'fly', op: 'set', value: 20 }` so consumers reading the effective speed stack see the 20-ft vertical fly RAW grants.

## Scope decisions

- **20-ft fly, not 0-ft horizontal**: RAW lets the target move 20 ft up/down per turn as a move action by pulling/pushing against fixed surfaces; horizontal movement requires a fixed surface. Modeling this as `fly:20` is the simplest faithful approximation — consumers reading the effective speed get "fly 20 ft", which is the correct vertical bound. The horizontal-requires-fixed-surface arm stays consumer-managed since the engine has no positions / scene geometry.
- **No event needed for "rises 20 ft"**: the engine doesn't model positions, so the physical lift is a consumer-side rendering concern. The condition is the contract that says "target is floating."
- **Concentration cleanup via the conditionsApplied array**: the buff mechanic threads the condition into the ConcentrationStarted event's `conditionsApplied` list (not via `sourceEffectInstanceId` on the condition). This is the standard buff-cleanup contract; clearConcentrationEffect handles it correctly.

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: levitate gains the buff mechanic; new `levitating-active` condition.
- **[../../tests/unit/engine/slice-668-levitate.test.ts](../../tests/unit/engine/slice-668-levitate.test.ts)** (new): 4 tests
  - Cast applies levitating-active on the target.
  - Condition is tracked in the EffectInstance's `conditionsApplied` array.
  - Concentration drop sweeps the condition.
  - Condition definition projects `ModifySpeed fly 20`.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L2 wired 40 → 41, deferred 2 → 1. levitate added to cast-time wired list.
- **[../../README.md](../../README.md)**, **[../../docs/status.md](../../docs/status.md)** (3 places), **[../../docs/getting-started.md](../../docs/getting-started.md)**, **[../../docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md)**: aggregate spell wiring 204 → 205, deferred 67 → 66; conditions 147 → 148 (132 → 133 rider).
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regen — one new entry (levitating-active).

## Tests

- `npx vitest run tests/unit/engine/slice-668-levitate.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/gaps-spells-counts.test.ts tests/audit/doc-counts.test.ts`: 52/52 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Content-only addition**. Same shape as slice 667.

## Audit (Uncle Bob)

- **Names**: `levitating-active` follows the `<spell>-active` marker pattern.
- **DRY**: zero engine code; the `ModifySpeed fly` primitive used by Fly + Dragon Wings is reused.
- **SRP**: pure content edit.
- **Magic numbers**: 20 is RAW-fixed; inlined.
- **Pattern-check**: Levitate was the unique remaining L2 spell with a "flight/hover" RAW shape. Fly (L3) is already wired. Any future "hover" spells can reuse the same pattern.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 668 of ~16):

- ~~660-667~~: L3 RAW behavior + 3 spell-wiring primitives. Landed.
- ~~668 (this slice)~~: Flight/hover condition (levitate). Landed.
- **669**: On-action rider (dragons-breath).
- **670-672**: Composite-condition primitives.
- **673-676**: Audit + polish.
