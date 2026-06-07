# Slice 716 — engine: spell-targeting refinements (multi-target maxTargets; cone scope)

**Type:** Engine read-layer (`engine.query.castableSpells` / `legalSpellTargets`). Additive, pure, read-only; no event schema change; no new public export. Closes the slice-713 spell-targeting follow-ups.

## 1. Real `maxTargets` for multi-target spells

`castableSpells(...).target` and `legalSpellTargets(...)` previously hardcoded `maxTargets: 1`. Now it is derived from the spell's own mechanics, matching the cast-spell gate exactly — no new content field:

- **Beam-scaling cantrips** (`attack` + `cantripBeamScaling`, e.g. Eldritch Blast): `1 + cantripExtraDice(characterLevel)` → 1/2/3/4 beams at character L1/5/11/17 (reuses the same `cantripExtraDice` the planner caps on).
- **Dart spells** (`auto-hit`, e.g. Magic Missile): `dartsAtBaseSlot + extraDartsPerSlotLevel × (slot − base)` → 3 at slot 1, 4 at slot 2, 5 at slot 3.
- **Everything else**: 1.

`castableSpells` reports the base (the spell's own level; cantrips scale by character level); `legalSpellTargets` recomputes per chosen `slotLevel` (so Magic Missile's `maxTargets` grows with the slot). `maxTargets` is the UPPER bound a UI may select — RAW lets darts/beams pile on one creature, so the candidate list is unchanged; only the count the UI may pick from it changes.

`legalSpellTargets` now uses its `slotLevel` argument (it was accepted-but-unused in slice 713).

Note: a multi-ray spell the pack authors as a single `attack` mechanic (Scorching Ray today) still reports `maxTargets: 1` until its content models the extra rays — a separate content concern.

## 2. Exact AOE cone aiming → resolved as consumer scope

The slice-713 note flagged self-origin cone aiming as approximate and asked whether to compute exact cone cells. Per [engine-scope.md](../engine-scope.md) ("Spell area target selection"), computing **which creatures a cone/sphere/line covers** from positions is the consumer's spatial query — the cast-spell planner takes `targetIds` from the app, and the engine does not own area geometry. So this is **not** an engine gap: `legalSpellTargets` returns candidate origin/aim cells (in range + line of effect) for the consumer to preview the shape around; enumerating a specific cone direction's cells lives in the consumer (dnd-web), where positions live. The `aoePlacementPoints` doc comment now states this explicitly.

## Files

- [src/query/affordances.ts](../../src/query/affordances.ts): new `spellMaxTargets` helper; `spellTarget` / `spellMetadata` take a `maxTargets`; `castableSpells` passes the caster's level; `legalSpellTargets` recomputes slot-aware `maxTargets` and uses `slotLevel`; `aoePlacementPoints` scope comment.
- [tests/unit/query/spell-affordances.test.ts](../../tests/unit/query/spell-affordances.test.ts): +4 tests (Magic Missile 3 / Eldritch Blast L5→2 / single-target stays 1 / slot-scaled darts 1→3, 3→5); existing 12 unchanged.
- [docs/api-overview.md](../../docs/api-overview.md): notes the beam/dart derivation + the cone consumer-scope boundary.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No public export change (contract snapshot untouched); `maxTargets` was already on the `target` descriptor + `legalSpellTargets` result.

## Audit (Uncle Bob)

- **Reuse over duplication**: `maxTargets` reuses `cantripExtraDice` (the planner's beam cap) and the `auto-hit` dart fields — the same source of truth the cast-spell planner gates on, so the affordance can't disagree with the planner.
- **Verify against source / scope**: cone geometry checked against engine-scope.md before deciding NOT to build it (the locked contract assigns area cell selection to the consumer).
- **Determinism**: pure derivation from content + level; candidate ordering unchanged.
- **No content invented**: derived from existing authored fields; no new schema, no drift.
