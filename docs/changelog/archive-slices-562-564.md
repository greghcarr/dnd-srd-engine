# Archive: slices 562-564

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 569, to keep the live file under the 60 KB single-Read ceiling). These are the residual-cycle slices that closed Eldritch Blast multi-beam scaling (562), Vicious Mockery disadvantage rider (563), and the per-caster L1 spellcasting math test suite (564).

---

---

**Tests (slice 564): per-caster L1 spellcasting math test suite**

Pure test-rigor slice closing the biggest L1 spellcasting verification gap. Pre-slice the spell DC + slot derivation tests covered only Wizard / Paladin / Warlock at L1; five L1 caster classes (Bard, Cleric, Druid, Ranger, Sorcerer) had no direct math assertion, so a regression in `FULL_CASTER_SLOTS`, the half-caster rounding rule, or the per-class spellcasting-ability declaration could land without firing a test.

RAW source: [references/srd-markdown/classes.md](../../references/srd-markdown/classes.md) per-class progression tables (PB column = +2 at L1; spell slots row at L1).

**Tests** ([tests/unit/derive/slice-564-per-caster-l1-spellcasting.test.ts](../../tests/unit/derive/slice-564-per-caster-l1-spellcasting.test.ts), 32 cases — 4 per class × 8 caster classes): table-driven `CASTERS` array covers Bard / Cleric / Druid / Sorcerer / Wizard / Paladin / Ranger / Warlock. For each:
1. Pack declaration: `spellcasting.ability` + `spellcasting.type` match the RAW spec (CHA-full / WIS-full / WIS-full / CHA-full / INT-full / CHA-half / WIS-half / CHA-pact).
2. `computeSpellSlots` at L1 with the keying ability at 16: returns the RAW slot table (`[2,0,0,0,0,0,0,0,0]` for full + half casters; `[0,0,0,0,0,0,0,0,0]` standard plus `{level:1, count:1}` pact for Warlock).
3. `computeSpellSaveDC`: 8 base + 2 prof + 3 ability mod = **13** for every caster.
4. `computeSpellAttackBonus`: 2 prof + 3 ability mod = **+5** for every caster.

The 2024 PHB half-caster change (L1 grants 2 first-level slots; 2014 granted nothing until L2) is now pinned for both Paladin and Ranger.

**Audit:**
- **Names:** `CasterSpec` and the `CASTERS` table read as RAW reference rather than test fixtures; ability constants (`ABILITY_AT_16`, `PROF_BONUS_L1`, `MOD_AT_16`, `DC_BASE`) extracted so the math is self-documenting.
- **DRY:** one `buildL1Caster(classId, ability)` helper + a table-driven loop covers all 32 cases; adding a new caster (or correcting a RAW table value) is a single `CASTERS` row.
- **SRP:** new test file only — no engine or content edits.
- **Magic numbers:** all extracted to named constants (`ABILITY_AT_16 = 16`, `DC_BASE = 8`, `EXPECTED_DC = DC_BASE + PROF_BONUS_L1 + MOD_AT_16`).
- **at-threading:** N/A (no events emitted).
- **Mechanical outcomes asserted:** per-class spellcasting ability declaration, per-class slot table (full / half / pact), DC formula, attack-bonus formula.

**Pattern-check:** the existing per-class one-off tests (Wizard in [tests/unit/derive/spell-dc.test.ts](../../tests/unit/derive/spell-dc.test.ts); Wizard + Paladin + Warlock in [tests/unit/derive/spell-slots.test.ts](../../tests/unit/derive/spell-slots.test.ts)) stay as targeted regression catches (with their L5 / L20 / multiclass scenarios). This slice ADDS the per-class L1 sweep alongside them rather than replacing — the legacy tests stay green and the new file covers the breadth.

---

**Engine + content (slice 563): Vicious Mockery disadvantage-on-next-attack rider — second of three residual L1 drift closures**

Closes the Vicious Mockery rider drift surfaced by the post-cycle deep review. Pre-slice a failed save against Vicious Mockery dealt 1d6 psychic damage but the RAW disadvantage rider was absent; an L1 Bard had a strict damage cantrip, not the debuff cantrip RAW prescribes.

RAW (SRD 5.2.1 Vicious Mockery): "Wisdom Saving Throw: 1d6 Psychic damage. The target has Disadvantage on the next attack roll it makes before the end of its next turn."

**Schema** ([src/schemas/content/spell.ts](../../src/schemas/content/spell.ts)): new optional `applyConditionSourceFromTarget: boolean` on the spell `save` mechanic. When true, the `ConditionApplied` event emitted for `conditionOnFail` uses the *target* (the failed-save creature) as the `sourceCharacterId`, not the caster. This is load-bearing for autoExpiry's "next turn" semantic — autoExpiry keys off the bearer's turn, not the caster's.

**Engine** ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- When `applyConditionSourceFromTarget === true`, the emitted `ConditionApplied` event sets `sourceCharacterId = targetId`.
- autoExpiry stamping: if the condition has `autoExpiry` and an active encounter is in progress, the event also carries `expiresOnRound` (current round + `afterRounds`) + `expiryTrigger`. The existing round-tick autoExpiry sweep already handles the cleanup; this just wires the per-event metadata.

**Engine** ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts), `buildConsumeOnAttackRemovals`): the consume-on-attack filter previously matched applied conditions only when `sourceCharacterId` was undefined or equal to the *defender* (the original Sap / Vex pattern: attacker debuffs target, target's next attack consumes). Vicious Mockery is the inverse: the *attacker* (the mocked creature) bears a condition sourced from itself. The filter now also matches `sourceCharacterId === attacker.id` (self-sourced), so a self-borne consume-on-attack condition fires on the bearer's next attack. RAW: "next attack roll it makes" — the bearer's attack.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `viciously-mocked` condition: `consumeOnAttack: true`; `autoExpiry: { afterRounds: 1, trigger: "turnEnd" }`; effects `[{ kind: "SetAdvantage", on: "attack", mode: "disadvantage" }]`.
- Vicious Mockery save mechanic gains `conditionOnFail: "viciously-mocked"` + `applyConditionSourceFromTarget: true`.

**Tests** ([tests/unit/engine/slice-563-vicious-mockery-rider.test.ts](../../tests/unit/engine/slice-563-vicious-mockery-rider.test.ts), 5 cases): pack declarations for condition + spell wiring; failed save emits ConditionApplied with sourceCharacterId = target (not caster); the mocked target's next attack rolls with disadvantage; the condition is consumed after the first attack (RAW "next attack roll").

**Audit:**
- **Names:** `applyConditionSourceFromTarget` is verbose but unambiguous — it documents exactly the inversion it performs vs. the default caster-as-source.
- **DRY:** the `buildConsumeOnAttackRemovals` filter now covers all three source-shapes (undefined / defender / attacker-self) in one helper. The existing Sap / Vex paths are unaffected (their `sourceCharacterId` is the attacker who applied the debuff, which equals the defender in the attack-event frame).
- **SRP:** schema is one optional field; cast-spell change is the conditional source + the autoExpiry stamping block; attack.ts change is one filter clause.
- **Magic numbers:** none.
- **at-threading:** the autoExpiry stamping uses the existing `state.encounters[activeEncounterId].round` read; the planner's single `nowIso()` resolution is unchanged.
- **Mechanical outcomes asserted:** ConditionApplied source = target (not caster); attack-disadvantage fires post-cast; condition consumed after one attack; autoExpiry expiry stamping (implicit via the SetAdvantage taking effect through the existing applied-conditions read path).

**Pattern-check:** the consume-on-attack filter's "sources" was the load-bearing pattern. Before: undefined / defender-sourced (Sap, Vex applied by attacker on defender). After: undefined / defender-sourced / attacker-self-sourced (viciously-mocked, where the *bearer* IS the future attacker). No other RAW condition today matches the new "attacker-self-sourced consume" shape, so the change widens the gate without changing existing match behavior. Future self-debuffs with consume-on-attack timing (a hypothetical "Stunning Smite consumes the smiter's next attack") would land in the same code path.

---

**Engine + content (slice 562): Eldritch Blast multi-beam scaling — first of three residual L1 drift closures**

Closes the highest-impact L1 spell drift surfaced by the post-cycle deep review. Pre-slice Eldritch Blast fired one beam regardless of caster level (`cantripScalingDice` was absent so no extra dice per beam, and no concept of beam count existed); RAW fires 1/2/3/4 beams at L1/L5/L11/L17. A L5+ Warlock was losing half (or more) of their cantrip's damage potential.

RAW (SRD 5.2.1 Eldritch Blast): "...The spell creates more than one beam when you reach higher levels: two beams at level 5, three beams at level 11, and four beams at level 17. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam."

**Schema** ([src/schemas/content/spell.ts](../../src/schemas/content/spell.ts)): new optional `cantripBeamScaling: boolean` field on the spell `attack` mechanic. When true, the scaling axis is the beam count (1 at L1, +1 at each of L5/L11/L17), not extra dice per beam. The existing `cantripScalingDice` is mutually exclusive (the cast-spell planner skips dice scaling when beam scaling is set).

**Engine** ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts), `planAttackMechanic`):
- Pre-iteration beam-count gate: `maxBeams = 1 + cantripExtraDice(totalLevel)` (reuses the existing scaling-threshold helper). Throws if `intent.targetIds.length` exceeds `maxBeams`, throws if zero target ids supplied.
- Inside the per-target loop: `cantripSteps` set to 0 when `cantripBeamScaling === true` so each beam rolls only the base `damageDice`. The "scaling" IS the beam count.
- Repeated target ids are allowed (RAW: "same or different creatures"). Each beam still rolls an independent attack via the existing per-target iteration.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Eldritch Blast `mechanicalEffects` gains `cantripBeamScaling: true`. No other spell uses this mode today.

**Tests** ([tests/unit/engine/slice-562-eldritch-blast-beams.test.ts](../../tests/unit/engine/slice-562-eldritch-blast-beams.test.ts), 10 cases): pack declaration verified; L1 → 1 beam (1 attack); L1 with 2 targets → rejected; L5 → 2 beams against different targets; L5 with 2 beams at the same target (RAW "same or different"); L5 with 3 targets → rejected; L11 → 3 beams; L17 → 4 beams; zero targets → rejected; per-beam damage stays 1d10 (no cantripScaling extra dice).

**Audit:**
- **Names:** `cantripBeamScaling` mirrors the existing `cantripScalingDice` naming axis.
- **DRY:** reuses `cantripExtraDice` helper for the beam-count threshold table.
- **SRP:** schema change is one optional field; engine change is one pre-iteration gate + one conditional in dice accumulation.
- **Magic numbers:** thresholds (5, 11, 17) live in the existing `CANTRIP_SCALING_THRESHOLDS`; beam-count formula is `1 + cantripExtraDice(level)`.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** beam count by level (1/2/3/4 at L1/L5/L11/L17); reject paths for under-count and over-count; same-target allowed; per-beam damage matches base die.

**Pattern-check:** Eldritch Blast is the canonical beam-scaling user in SRD 5.2.1; no other cantrip uses this mode. Future cantrips with similar shapes (e.g., a homebrew Scorching Ray analog) reuse the same field.


---
