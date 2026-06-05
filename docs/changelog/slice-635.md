# Slice 635 — engine: Cleric L2 Channel Divinity Divine Spark planner

**Type:** Engine primitive + canonical user.

Closes the second of slice 633's five L2-complete punch-list xfails (3 remaining). RAW (SRD 5.2.1 Cleric L2): "As a Magic action, you point your Holy Symbol at another creature you can see within 30 feet of yourself and focus divine energy at it. Roll 1d8 and add your Wisdom modifier. You either restore Hit Points to the creature equal to that total or force the creature to make a Constitution saving throw. On a failed save, the creature takes Necrotic or Radiant damage (your choice) equal to that total. On a successful save, the creature takes half as much damage (round down). You roll an additional d8 when you reach Cleric levels 7 (2d8), 13 (3d8), and 18 (4d8)."

`planDivineSpark` is the sibling of `planTurnUndead` (the other L2 Channel Divinity option) and the structural sibling of `planLandsAid` (Druid L3, heal-or-damage save-for-half).

## Files

- **[../../src/engine/plan/divine-spark.ts](../../src/engine/plan/divine-spark.ts)** (new): planner, `DivineSparkIntent`, `divineSparkDiceCount` helper. Heal mode emits one `Healed { source: 'divine-spark' }`; damage mode rolls CON save against the cleric's spell save DC and applies full damage on fail / half on success via the standard `mitigateDamage` + `interceptFatalDamage` + `planConcentrationOnDamage` pipeline. Damage type is the caster's choice between `necrotic` and `radiant` (RAW). WIS modifier is pulled from the existing `computeSpellSaveDC` breakdown so the calculation stays DRY with the DC computation. Dice scale 1d8 / 2d8 / 3d8 / 4d8 at cleric levels 2 / 7 / 13 / 18.
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export `planDivineSpark`, `divineSparkDiceCount`, `DivineSparkIntent`.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: import + add `engine.plan.divineSpark(state, intent)` returning `PlanResult` (events-only shape, matching `turnUndead`).
- **[../../src/engine/conveniences.ts](../../src/engine/conveniences.ts)**: add `DivineSpark` dispatch to `performIntent` (required by the planner-wiring audit).
- **[../../tests/unit/engine/slice-635-divine-spark.test.ts](../../tests/unit/engine/slice-635-divine-spark.test.ts)** (new): 5 tests — heal mode emits a single `Healed` in the expected range (1d8 + WIS 3 = [4, 11]) and spends one CD use; damage mode emits CON `SaveRolled` + `DamageApplied` with the right damage type; damage applied is exactly full or half (no third value); dice progression (1/2/3/4 at L2/7/13/18); gating rejects (non-cleric / under-L2 / no CD / damage-mode-missing-damageType).
- **[../../tests/audit/srd-l2-complete.test.ts](../../tests/audit/srd-l2-complete.test.ts)**: flipped `planDivineSpark` from the xfail block to the wired block. L2 floor xfail count drops 4 → 3.

## Tests

- `npx vitest run tests/unit/engine/slice-635-divine-spark.test.ts`: 5/5 pass.
- `npx vitest run tests/audit/srd-l2-complete.test.ts`: 32/32 pass (11 planners wired + 3 xfails remaining).
- `npx vitest run tests/audit/planner-wiring.test.ts`: 4/4 pass (slice 634 lesson applied — added the conveniences.ts dispatch entry alongside the engine.plan method).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive only.** Consumers who explicitly invoke `engine.plan.divineSpark` now consume `divineSparkDiceCount(clericLevel)` d8s per damage call (one d8 at L2) plus one d20 CON save (damage mode only). No existing path calls it. A campaign with no Divine Spark invocations replays byte-for-byte against pre-slice transcripts.

**No breaking change.** The L2 Cleric content row already shipped `divine-spark` with `effects: []`; mechanical wiring now lives in the planner, matching the convention for the other Channel Divinity option (Turn Undead) and for the lay-on-hands / lands-aid / paladins-smite family.

## Audit (Uncle Bob)

- **Names**: `planDivineSpark`, `DivineSparkIntent`, `divineSparkDiceCount`, `engine.plan.divineSpark` — match the `planTurnUndead` / `planLandsAid` family. Constants `CLERIC_CLASS_ID`, `CHANNEL_DIVINITY_LEVEL`, `CHANNEL_DIVINITY_RESOURCE`, `DIVINE_SPARK_DIE`, `DIVINE_SPARK_BASE_DICE`, `DIVINE_SPARK_SCALE_LEVEL_*`, `WIS_MOD_BREAKDOWN_SOURCE`, `DIVINE_SPARK_SOURCE`, `DIVINE_SPARK_DAMAGE_TYPES`. No bare literals in the planner.
- **DRY**: structural sibling of `planLandsAid` (heal-or-damage save-for-half) but the per-feature RAW deviations make the duplication intentional. Divine Spark: single-target, WIS-added-to-pooled-roll, 1d8 base, level scaling at 7/13/18. Land's Aid: multi-target, no ability-mod added, 2d6 base, scaling at 10/14. A "generic save-for-half planner" would obscure both. Revisit at the third sibling. WIS modifier is read out of the existing `computeSpellSaveDC` breakdown rather than recomputed.
- **SRP**: planner does one thing (one Magic-action use of Divine Spark, heal or damage); test file locks five observable behaviors; conveniences.ts dispatch is the single insertion point a player-action intent needs.
- **Magic numbers / strings**: every literal is a named constant. Dice progression encoded in `divineSparkDiceCount` (a pure function on `clericLevel`).
- **Pattern-check**: searched for other "Channel Divinity option" planners. `planTurnUndead` is the canonical sibling and follows the same shape (resource gate, spell-save DC, action-economy consume) — matched. The Custom-handler placeholder previously shipped at the L2 content row had no handler registered; this slice supersedes that path without leaving a stub (the L2 row's `effects: []` is fine, mirroring how Turn Undead is engine-side-only). ALSO ran `planner-wiring` mentally before the test caught it: added the conveniences.ts dispatch entry up front this time.

## Open follow-ups

L2-complete punch list now stands at **3 remaining** (was 4):

- ~~`planTacticalMind`~~ — landed (slice 634).
- ~~`planDivineSpark`~~ — landed.
- **`planUncannyMetabolism`** — L2 Monk on-initiative HP + Ki regain.
- **`planMagicalCunning`** — L2 Warlock Pact slot regain.
- **Eldritch Invocations catalog** — `pack.eldritchInvocations ≥ 3`.

Documented RAW deviations (deferred):
- 30-ft range and target visibility are consumer-supplied (engine has no positions); the planner does not validate.
- "Another creature" wording (RAW excludes self-targeted heal): the planner accepts any character id; consumers can enforce the same-actor exclusion at intent-construction time. Pattern matches `planLayOnHands`'s permissive shape.
