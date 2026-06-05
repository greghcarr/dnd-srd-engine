# Slice 672 — engine + content: Blink (cross-plane per-turn ethereal toggle)

**Type:** Engine planner + content. **Twelfth slice of the post-L3-RAW completeness push. Final L3 spell-wiring slice.** Closes the last deferred L3 spell — **L3 is now 100% wired-or-narrative (0 deferred).**

Blink (L3 sorcerer/wizard): for 1 minute, at the end of each of the bearer's turns, roll d20; on 11+ vanish to the Ethereal Plane until the start of the bearer's next turn.

## What's wired

- **Blink** (L3) gets `mechanicalEffects: [{ kind: 'buff', conditionId: 'blink-active' }]`. Cast applies the marker on the caster (self-target).
- New planner `planBlinkTurnEnd({ characterId })`: verifies blink-active is on the character, rolls d20; on 11+ applies `blink-ethereal-active` (unless already ethereal — then no-op). Defensive sub-threshold re-emerge if the bearer was somehow still ethereal at this point.
- 2 new conditions: `blink-active` (marker the spell is in effect), `blink-ethereal-active` (marker the bearer is currently on the Ethereal Plane).
- Wired into performIntent dispatch (`BlinkTurnEnd` type), exposed as `engine.plan.blinkTurnEnd`.

## Scope decisions

- **Plane / position semantics consumer-managed**: engine has no positions or plane model. The conditions are markers; the consumer interprets "ethereal" semantics (attacks auto-miss, can pass through objects, can't interact across planes, 10-ft re-emergence) in their scene model.
- **Duration cleanup consumer-managed**: blink is 1-minute, non-concentration. The buff mechanic doesn't auto-create a duration-tracked EffectInstance for non-concentration spells without a zone. Consumer commits `ConditionRemoved` for blink-active after 10 rounds. (A future engine slice could extend `SpellEffectStarted` from slice 665 to non-zone non-concentration buffs for auto-expiry — out of scope.)
- **Turn-start re-emergence is consumer's responsibility**: the consumer commits `ConditionRemoved` for blink-ethereal-active at the START of the bearer's next turn. The planner defensively removes it on a sub-threshold roll if it's still there, but the canonical flow is consumer-driven.

## Files

- **[../../src/engine/plan/blink-turn-end.ts](../../src/engine/plan/blink-turn-end.ts)** (new): the planner.
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: export.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: import + type + engine.plan method.
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: `BlinkTurnEnd` performIntent dispatch entry.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: blink gets the buff mechanic; 2 new conditions.
- **[../../tests/unit/engine/slice-672-blink.test.ts](../../tests/unit/engine/slice-672-blink.test.ts)** (new): 4 tests
  - Cast applies blink-active (no concentration claim).
  - planBlinkTurnEnd produces both ethereal (11+) and non-ethereal (≤10) outcomes across seeds.
  - Throws when blink-active is absent.
  - Second call while already ethereal: no-op.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L3 wired 31 → 32, deferred 1 → 0. **L3 IS NOW 100% WIRED-OR-NARRATIVE.**
- **Doc-counts**: aggregate 208 → 209, deferred 63 → 62, ~61% → ~62%; conditions 155 → 157 (140 → 142 rider).

## Tests

- `npx vitest run tests/unit/engine/slice-672-blink.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/planner-wiring.test.ts tests/audit/doc-counts.test.ts`: green.

## Verification

- `npx tsc --noEmit`: clean.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 672 of ~16):

- ~~660-671~~: L3 RAW behavior + 7 spell-wiring primitives + L2 fully wired. Landed.
- ~~672 (this slice)~~: Cross-plane per-turn toggle (blink). Landed.
- **L1 spells: 100% wired-or-narrative (since slice 619+ baseline).**
- **L2 spells: 100% wired-or-narrative (slice 669).**
- **L3 spells: 100% wired-or-narrative (this slice).**
- **L3 RAW completeness is achieved at the spell-wiring layer.**
- **673**: L3 triple-class multiclass audit.
- **674**: L3 fuzz floor.
- **675**: Auto-populate `recharge` on `ResourceState` from grants.
- **676**: Multiclass fuzz support.

**Deferred (post-cycle / consumer-driven)**:
- Auto-duration cleanup for non-concentration buff-only spells (a future engine slice can extend `SpellEffectStarted` from slice 665 to cover these).
