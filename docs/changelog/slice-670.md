# Slice 670 — content: Slow (composite area condition via save + composite-effects condition)

**Type:** Content edit only. **Tenth slice of the post-L3-RAW completeness push.** Closes 1 deferred L3 spell.

Slow (L3) is RAW a composite-debuff: failed WIS save → walking speed halved, AC -2, DEX saves -2, no reactions, one-action-OR-bonus restriction, max-one-attack, spellcasting 50% gate. Slice 670 wires the load-bearing arms via the existing `save` mechanic + composite condition; the remaining RAW arms stay consumer-managed (consumers read the condition presence and enforce the behavioral constraints they choose to track).

## What's wired

- **Slow** (L3 bard/sorcerer/wizard): `mechanicalEffects: [{ kind: 'save', ability: 'WIS', conditionOnFail: 'slowed-by-spell-active' }]`. Targets in the 40-ft cube AOE roll WIS save vs the caster's spell save DC; failures get the condition.
- New condition `slowed-by-spell-active` projects:
  - `ModifySpeed { mode: 'walk', op: 'multiply', value: 0.5 }` (walking speed halved)
  - `AddModifier { target: 'ac', value: -2 }` (AC penalty)
  - `AddModifier { target: { kind: 'save', ability: 'DEX' }, value: -2 }` (DEX saves penalty)
- Auto-cleared on the caster's concentration drop via the existing slice-110 sweep.

## Scope decisions

- **3 of 7 RAW arms wired, 4 deferred as consumer-managed**: speed-half + AC -2 + DEX-saves -2 are the load-bearing combat arms. The other arms (no reactions, one-action-or-bonus, max-one-attack, spellcasting 50%) require either new engine primitives (reaction-cancel, action-economy restriction, per-cast-gate randomness) or are intent-side ergonomics. The condition is the contract — the consumer reads `appliedConditions.some(c.conditionId === 'slowed-by-spell-active')` and enforces what their UI / scene model can support.
- **Save-ends arm consumer-driven**: RAW lets the target save at the end of each of its turns to drop the condition. Today, the consumer commits a `SaveRolled` and, on success, manually removes the condition. No `recurring` save-end mechanic exists.
- **40-ft cube target selection consumer-driven**: the engine has no positions; the consumer passes the right `targetIds`. Up to 6 creatures per RAW; engine doesn't enforce the cap (consumer can pass any number).

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: slow gets the save mechanic; new `slowed-by-spell-active` condition.
- **[../../tests/unit/engine/slice-670-slow.test.ts](../../tests/unit/engine/slice-670-slow.test.ts)** (new): 3 tests
  - On failed WIS save, target gains the condition.
  - Condition definition: walk *0.5 + AC -2 + DEX-save -2.
  - Concentration drop sweeps the condition.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L3 wired 29 → 30, deferred 3 → 2.
- **[../../README.md](../../README.md)**, **[../../docs/status.md](../../docs/status.md)** (3 places), **[../../docs/getting-started.md](../../docs/getting-started.md)**, **[../../docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md)**: aggregate spell wiring 206 → 207, deferred 65 → 64; conditions 153 → 154 (138 → 139 rider).
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regen — slowed-by-spell-active added.

## Tests

- `npx vitest run tests/unit/engine/slice-670-slow.test.ts`: 3/3 pass.
- `npx vitest run tests/audit/doc-counts.test.ts`: 19/19 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Content-only addition**. No engine code; no schema change.

## Audit (Uncle Bob)

- **Names**: `slowed-by-spell-active` distinguishes from `slowed-10ft` (the weapon-mastery Slow rider). The `<spell>-by-source` naming pattern keeps the two from colliding.
- **DRY**: zero engine code; existing primitives (save mechanic, composite condition effects) deliver everything wired.
- **SRP**: pure content edit.
- **Magic numbers**: 0.5 / -2 / -2 are RAW-fixed inline.
- **Pattern-check**: searched for other composite-debuff condition spells: bestow-curse + hex are already wired with their composite condition arrays. Slow was the unique remaining instance.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 670 of ~16):

- ~~660-669~~: L3 RAW behavior + 5 spell-wiring primitives + L2 fully wired. Landed.
- ~~670 (this slice)~~: Composite area for slow. Landed.
- **671**: Composite-buff for beacon-of-hope.
- **672**: Cross-plane per-turn toggle (blink).
- **673-676**: Audit + polish.

**Deferred RAW arms (consumer-managed reads of the condition)**:
- No-reactions enforcement
- One-action-or-bonus restriction
- Max-one-attack per turn
- Spellcasting 50% V/S/M failure gate
- End-of-turn save-ends to drop the condition (consumer commits SaveRolled + manually removes on success)
- 40-ft cube target selection (engine has no positions)
- 6-creature cap (engine doesn't enforce)
