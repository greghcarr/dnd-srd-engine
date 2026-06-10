# Slice 787 — cast-spell `aim` enforcement: the engine owns AoE membership

**Type:** Engine planner change (opt-in `CastSpellIntent.aim`) on top of the slice-786 rasterizer. **Closes** the [L7 audit](../l7-completion-audit.md) structural blocker `aoe-shape-coverage` (Area 3).

## The gap (the other half)

Slice 786 shipped the canonical rasterizer (`coveredCells` + `creaturesInSpellArea`), but `cast-spell` still applied saves/damage to exactly the `targetIds` it was handed — a consumer could *call* the rasterizer, but nothing made the engine the authority. The chosen scope was full enforcement: the engine should derive membership itself.

## The fix

A new opt-in **`CastSpellIntent.aim?: { x, y }`** (a point in feet). When it's set on an area spell (one with an authored `targeting` shape/size), `planCastSpell` runs `creaturesInSpellArea` from that aim and uses the covered, line-of-effect-having creatures as the target set — **ignoring `targetIds`**. The whole switch is a single rebinding at the planner entry:

```ts
const areaEnforced = rawIntent.aim !== undefined && spell.targeting !== undefined;
const intent = areaEnforced
  ? { ...rawIntent, targetIds: creaturesInSpellArea(state, content, { encounterId, casterId, spellId, aim }) }
  : rawIntent;
```

Everything downstream reads `intent`, so every save/damage/condition arm and the `SpellCastDeclared.targetIds` record automatically use the derived set. Without `aim`, the cast is byte-for-byte unchanged — existing callers and golden transcripts are unaffected (the new path is purely additive).

**Range gate.** The per-target range gate is skipped for the `areaEnforced` path. This is a fix, not a hole: RAW, an area spell's range is to its **point of origin**, not to each creature, so a foe on the far edge of a Fireball can be past the caster's 150 ft and still caught — which the old per-target gate would have wrongly rejected. The non-aim path keeps the per-target gate exactly as before.

**Layering.** The rasterizer's state-aware core moved from `query/aoe.ts` to **`src/engine/plan/_spell-area.ts`** (engine layer) so a planner can call it without an engine→query import inversion (no other planner imports the query layer). `query/aoe.ts` is now a thin re-export, so the public `creaturesInSpellArea` / `engine.query.creaturesInSpellArea` surface is unchanged.

## Scope / deferred

- **Aim placement-range.** The aim's own legality (is the chosen origin within the spell's range?) isn't validated here — that's the separate `positionless-range-los-trusts-consumer` seam (the consumer picks a legal aim, as it already does for positions). Membership + line of effect ARE enforced.
- The derived target order is deterministic (sorted by id), so per-target save RNG draws replay identically.

## Tests

- **New** `tests/unit/engine/slice-787-cast-spell-aim-enforcement.test.ts` (4): an aimed Fireball damages every covered creature — **including a far-edge foe 160 ft from the caster, past the 150-ft range** (the headline correctness win) — and spares one just outside; a creature inside the blast but behind an impassable wall (Total Cover) is unharmed; a Self cone (Burning Hands) enforces the aimed direction; and **without** an aim the cast still honors the supplied `targetIds` verbatim (backward compatible).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (574 files, 4454 passed). No public-surface or golden-transcript change (aim is additive; the rasterizer relocation kept the same exported names).
