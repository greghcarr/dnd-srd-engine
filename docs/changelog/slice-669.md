# Slice 669 — engine + content: Dragon's Breath (on-action rider via dedicated planner)

**Type:** Engine planner + content. **Ninth slice of the post-L3-RAW completeness push. Fifth spell-wiring primitive.** Closes the final L2 deferred spell — **L2 is now fully wired or narrative (0 deferred)**.

The gaps-spells.md entry listed Dragon's Breath under "on-action rider" deferred. The shape:
- Cast a buff on a touched ally (concentration, 1 min).
- The ally can, on their action, exhale a 15-ft cone of energy in a chosen damage type (acid/cold/fire/lightning/poison).
- Targets in the cone DEX-save vs the caster's spell save DC; failed save takes 3d6 damage of the type, half on success. +1d6 per slot above L2.

This slice ships the planner that handles the exhalation, the buff with caster-choice variants, and the 5 marker conditions.

## What's wired

### New planner

- `planExhaleDragonsBreath({ characterId, damageType, targetIds })` in [src/engine/plan/exhale-dragons-breath.ts](../../src/engine/plan/exhale-dragons-breath.ts).
  - Enforces that the calling character carries `dragons-breath-<damageType>-active`.
  - Reads the caster (from the marker's `sourceCharacterId`), looks up the caster's concentration EffectInstance to get the slot level for scaling (3d6 + 1d6 per slot above L2).
  - Computes spell save DC from the caster's class.
  - For each target: rolls DEX save vs DC, computes damage (full on fail, half on success), runs through mitigation + fatal-damage-intercept + concentration-on-damage.
  - Exposed as `engine.plan.exhaleDragonsBreath`. Wired into the `performIntent` dispatch (`ExhaleDragonsBreath` intent type) and the planner-wiring audit's dispatch list.

### Content

- **Dragon's Breath** (L2 sorcerer/wizard): `mechanicalEffects: [{ kind: 'buff', casterChoosesVariant: { variants: [acid, cold, fire, lightning, poison] } }]`. Caster picks the damage type at cast; the corresponding marker condition is applied to the touched ally.
- 5 new marker conditions: `dragons-breath-acid-active`, `-cold-active`, `-fire-active`, `-lightning-active`, `-poison-active`. Each has `effects: []` (no projected stats — purely the exhale-action gate). Auto-cleared on the caster's concentration drop via the EffectInstance's `conditionsApplied` array.

## Scope decisions

- **5 condition variants, not 1 with a stored damage type**: the engine doesn't have a "condition carries arbitrary content metadata" hook; variants are the standard pattern (e.g., Calm Emotions, Bestow Curse). 5 conditions is a small price for matching the existing primitive.
- **Damage type passed via intent + verified against carried marker**: the consumer knows which variant condition is active (they see it in `appliedConditions`); the planner accepts the damage type they pass and verifies. This avoids storing the type in mutable state where it could drift.
- **Slot level from caster's concentration EffectInstance**: keeps the planner stateless — no need to thread the slot level through condition metadata. The EffectInstance is already the source of truth for the cast.
- **Save DC from the caster's spell save DC**: RAW says "your spell save DC" referring to the caster (Sorcerer/Wizard who cast the spell), not the buffed creature. The planner derives DC via `computeSpellSaveDC` using the caster's first class as the casting class — adequate for the canonical user (Sorcerer/Wizard, both of whom have a class spell list and a fixed casting ability for the spell). Multi-class edge cases could use a more specific lookup; deferred until a consumer reports an issue.
- **Range / "willing creature" / "touch" enforcement is consumer-managed**: the engine has no positions; the consumer ensures targets are within the cone and the original touch range was valid at cast time. The cone-AOE Audit (which creatures are inside) is also consumer-driven (the consumer passes the right `targetIds`).

## Files

- **[../../src/engine/plan/exhale-dragons-breath.ts](../../src/engine/plan/exhale-dragons-breath.ts)** (new): the planner.
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: export.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: import + type + engine.plan method.
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: `ExhaleDragonsBreath` dispatch entry in `performIntent`.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: dragons-breath gets the buff mechanic with 5 caster-choice variants; 5 new conditions.
- **[../../tests/unit/engine/slice-669-dragons-breath.test.ts](../../tests/unit/engine/slice-669-dragons-breath.test.ts)** (new): 4 tests
  - Cast with `fire` variant applies the marker on the ally.
  - planExhaleDragonsBreath emits SaveRolled + DamageApplied (fire type) on each target.
  - Wrong damage type throws (`/dragons-breath-cold-active/`).
  - Concentration drop sweeps the marker.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L2 wired 41 → 42, deferred 1 → 0. **L2 IS NOW FULLY WIRED OR NARRATIVE.**
- **[../../README.md](../../README.md)**, **[../../docs/status.md](../../docs/status.md)** (3 places), **[../../docs/getting-started.md](../../docs/getting-started.md)**, **[../../docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md)**: aggregate spell wiring 205 → 206, deferred 66 → 65, ~60% → ~61%; conditions 148 → 153 (133 → 138 rider).

## Tests

- `npx vitest run tests/unit/engine/slice-669-dragons-breath.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/gaps-spells-counts.test.ts tests/audit/doc-counts.test.ts tests/audit/planner-wiring.test.ts`: all green.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**New planner + content addition**. No schema change to existing surfaces. `engine.plan.exhaleDragonsBreath` is a new public-API method.

## Audit (Uncle Bob)

- **Names**: `planExhaleDragonsBreath` mirrors `planFrenzy` / `planCuttingWords` (per-feature standalone planners). 5 variant condition ids follow the `<spell>-<variant>-active` pattern.
- **DRY**: damage/save/mitigation/concentration helpers reused from the existing toolkit (rollSaveAgainstDC, mitigateDamage, interceptFatalDamage, planConcentrationOnDamage). The marker verification uses the standard `appliedConditions.some` lookup pattern.
- **SRP**: schema + content declares the buff; planner enforces the action; concentration cleanup handles the marker. Each layer owns one job.
- **Magic numbers / strings**: BASE_DICE=3, DIE_FACES=6, DICE_PER_SLOT_ABOVE_BASE=1, BASE_SPELL_LEVEL=2 are named constants in the planner.
- **Pattern-check**: searched for other buff-then-action-grant spells: Spiritual Weapon has a similar "use action to attack" shape but is already wired via a different path. No other on-action-rider spell remains undefferred.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 669 of ~16):

- ~~660-668~~: L3 RAW behavior + 4 spell-wiring primitives. Landed.
- ~~669 (this slice)~~: On-action rider (dragons-breath). Landed.
- **L2 spell wiring is now 100% wired-or-narrative (0 deferred).**
- **670**: Composite area for slow (L3).
- **671**: Composite-buff for beacon-of-hope (L3).
- **672**: Cross-plane per-turn toggle (blink, L3).
- **673-676**: Audit + polish.

**Deferred RAW arms (consumer-managed)**:
- Multi-class casting ability lookup for the spell save DC (the planner uses the caster's first class today).
- 15-ft cone target selection (engine has no positions).
- "Willing creature" + "Touch" range enforcement.
