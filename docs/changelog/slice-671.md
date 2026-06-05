# Slice 671 — content: Beacon of Hope (composite-buff condition)

**Type:** Content edit only. **Eleventh slice of the post-L3-RAW completeness push.** Closes 1 deferred L3 spell.

Beacon of Hope (L3 cleric): advantage on WIS saves + Death saves + each healing spell restores maximum possible HP. Slice 671 wires WIS-save advantage and the max-heal arm via existing primitives; the Death-save advantage arm stays consumer-managed (the auto-rolled death saves in `planDeathSaveAtTurnStart` don't currently consult the effect stack).

## What's wired

- **Beacon of Hope** (L3 cleric): `mechanicalEffects: [{ kind: 'buff', conditionId: 'beacon-of-hope-active' }]`. Applies the condition to each named target.
- New condition `beacon-of-hope-active` projects:
  - `SetAdvantage { on: { kind: 'save', ability: 'WIS' }, mode: 'advantage' }`
  - `GrantMaxHealingDice` (existing primitive — each healing spell affecting the bearer rolls max)
- Auto-cleared on concentration drop.

## Scope decisions

- **2 of 3 RAW arms wired, 1 deferred**: WIS-save advantage + max-heal are the load-bearing ones. Death-save advantage requires threading the effect stack through `planDeathSaveAtTurnStart`, which is a separate slice's worth of work. The condition is the contract.
- **30-ft target selection consumer-driven**: engine has no positions.

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: beacon-of-hope gets the buff mechanic; new `beacon-of-hope-active` condition.
- **[../../tests/unit/engine/slice-671-beacon-of-hope.test.ts](../../tests/unit/engine/slice-671-beacon-of-hope.test.ts)** (new): 3 tests
  - Cast applies on all targets.
  - Condition definition: SetAdvantage WIS + GrantMaxHealingDice.
  - Concentration drop sweeps from all targets.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L3 wired 30 → 31, deferred 2 → 1.
- **Doc-counts citations**: aggregate spell wiring 207 → 208, deferred 64 → 63; conditions 154 → 155 (139 → 140 rider).
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regen — beacon-of-hope-active added.

## Tests

- `npx vitest run tests/unit/engine/slice-671-beacon-of-hope.test.ts`: 3/3 pass.
- `npx vitest run tests/audit/doc-counts.test.ts`: 19/19 pass.

## Verification

- `npx tsc --noEmit`: clean.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 671 of ~16):

- ~~660-670~~: L3 RAW behavior + 6 spell-wiring primitives + L2 fully wired. Landed.
- ~~671 (this slice)~~: Composite-buff for beacon-of-hope. Landed.
- **672**: Cross-plane per-turn toggle (blink, last L3 deferred spell).
- **673-676**: Audit + polish.

**Deferred (consumer-managed)**:
- Death-save advantage — needs threading through planDeathSaveAtTurnStart.
- 30-ft target selection (engine has no positions).
