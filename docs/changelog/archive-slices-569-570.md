# Archive: slices 569-570

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 578, to keep the live file under the 60 KB single-Read ceiling). These slices closed two L1 RAW drifts surfaced by the deep audit: Exhaustion attack-roll + Speed penalties (PHB 2024 unified d20-Tests semantic; slice 569) + Incapacitated → concentration-break on condition apply (slice 570).

**Engine (slice 570): Incapacitated → concentration-break on apply**

Closes the last load-bearing engine drift surfaced by the deep audit's combat-mechanics agent. Pre-slice the engine cleared concentration in two places:
1. HP-drop-to-0 in `applyDamageApplied` ([src/engine/reducers/combat.ts:104-117](../../src/engine/reducers/combat.ts#L104-L117)) — handles falling Unconscious from damage.
2. Planners that explicitly emit `ConcentrationBroken` events (`planConcentrationBreakOnDrop`, etc.).

Neither path triggers when a concentrating caster receives an Incapacitated-composing condition via non-damage source: Hold Person → `paralyzed`, Power Word Stun → `power-word-stunned-active`, Hideous Laughter → `hideous-laughter-active`, plain `incapacitated`, or any of `stunned` / `petrified` / `held-paralyzed-active` / `unconscious` applied without an HP-drop.

RAW (PHB 2024 ch.7 Concentration): "Your Concentration ends if you become Incapacitated or die."

**Reducer wiring** ([src/engine/reducers/combat.ts](../../src/engine/reducers/combat.ts)):
- New local `INCAPACITATING_CONDITIONS` set — mirror of [`ACTION_BLOCKING_CONDITIONS`](../../src/engine/plan/_actor-state.ts#L32) in the planner side. Held as a separate const to avoid a planner-to-reducer import (layers stay separate; slice 582's condition-behavior audit will pin the parity).
- `applyConditionApplied` adds a post-push hook: when the applied condition's id is in the set AND the character has `concentrationEffectId !== undefined`, the existing `clearConcentrationEffect` helper is called. Non-incapacitating conditions and non-concentrating bearers are no-ops.

**Tests** ([tests/unit/reducers/slice-570-incapacitated-concentration-break.test.ts](../../tests/unit/reducers/slice-570-incapacitated-concentration-break.test.ts), 12 cases): each of the 8 incapacitating-condition ids clears concentration on a concentrating bearer; non-incapacitating conditions (`poisoned`, `frightened`) leave concentration intact; applying paralyzed to a non-concentrating character is a clean no-op; exhaustion (not in the set; tracked via its own field) leaves concentration intact.

**Audit:**
- **Names:** `INCAPACITATING_CONDITIONS` parallels the planner-side `ACTION_BLOCKING_CONDITIONS` axis; the comment block explicitly notes the parity requirement.
- **DRY:** the same set lives in two places (reducer + planner). Resolving the duplication requires either (a) hoisting to a shared module (`src/internal/`) or (b) re-exporting from one side. Both add a cross-layer dependency more invasive than a 2-line `if` check; deferred to slice 582 where the broader condition-behavior audit will rationalize the constants.
- **SRP:** one new const + one new `if` block in the existing apply-condition reducer. No new event kind, no new reducer file.
- **Magic numbers:** none.
- **at-threading:** N/A (reducer is RNG-free; the `clearConcentrationEffect` helper is pure state mutation).
- **Mechanical outcomes asserted:** 8 incapacitating-condition coverage (per-id), 2 non-incapacitating control, 2 boundary (no-concentration + exhaustion).

**Pattern-check:** the audit agent's "concentration breaks only on HP drop" finding was the canonical use of this slice. The future slice 582 will sweep `INCAPACITATING_CONDITIONS` vs `ACTION_BLOCKING_CONDITIONS` for parity (currently identical; any drift becomes a CI failure under that audit).

---

**Engine (slice 569): Exhaustion attack-roll + Speed penalties — PHB 2024 unified d20-Tests semantic**

Closes a real L1 RAW drift surfaced by the deep audit. Pre-slice the engine applied the -2-per-level exhaustion penalty to ability checks ([src/derive/ability-check.ts:147](../../src/derive/ability-check.ts#L147)) and saving throws ([src/derive/save.ts:124-126](../../src/derive/save.ts#L124-L126)), but the **attack-roll** and **Speed** arms of the 2024 RAW were unwired. An exhausted character's to-hit was unaffected; their movement was unchanged.

RAW PHB 2024 Exhaustion ([references/srd-markdown/rules-glossary.md](../../references/srd-markdown/rules-glossary.md)):
- "You take a -2 penalty to all D20 Tests for every level of Exhaustion." (D20 Tests = checks + saves + attack rolls.)
- "Your Speed decreases by 5 feet for every level of Exhaustion."
- Level 6 = death (already wired in the apply-condition reducer via `EXHAUSTION_MAX`).

**Constants** ([src/internal/constants.ts](../../src/internal/constants.ts)): two new sibling constants alongside the legacy `EXHAUSTION_SAVE_PENALTY_PER_LEVEL`:
- `EXHAUSTION_ATTACK_PENALTY_PER_LEVEL = -2`
- `EXHAUSTION_SPEED_PENALTY_PER_LEVEL = -5`

The pre-2024-unification names stay (the values are identical, but distinct names make the per-dimension wiring greppable for future maintenance / partial reverts).

**Attack-roll wiring** ([src/derive/attack.ts](../../src/derive/attack.ts)): `computeAttackBonus` adds an `exhaustion` breakdown entry when `character.exhaustion > 0`, mirroring the existing pattern in [ability-check.ts](../../src/derive/ability-check.ts) and [save.ts](../../src/derive/save.ts). Penalty applied after all weapon bonuses and effect-stack modifiers — the breakdown is independently visible for sheet display.

**Speed wiring** ([src/derive/speed.ts](../../src/derive/speed.ts)): `getEffectiveSpeedForMode` applies the exhaustion penalty AFTER all `op: 'set' / 'add' / 'multiply'` modifiers and the natural-vs-set precedence resolution — RAW: the penalty stacks on the final value. Applies to ALL movement modes (walk / fly / swim / climb / burrow); a zero-speed (Grappled / Restrained / Unconscious) is unaffected because the existing `if (zeroSet) return 0` short-circuits earlier. Final `Math.max(0, scaled + exhaustionPenalty)` clamps so a high-exhaustion character can't go negative on Speed.

**Tests** ([tests/unit/derive/slice-569-exhaustion-attack-speed.test.ts](../../tests/unit/derive/slice-569-exhaustion-attack-speed.test.ts), 11 cases):
- Attack: exhaustion 0 / 1 / 3 / 5 yielding -0 / -2 / -6 / -10 modifier; penalty exposed in breakdown; can push net bonus negative.
- Speed: exhaustion 0 / 1 / 3 / 6 yielding 30 / 25 / 15 / 0 ft walk; Goliath base 35 with exhaustion 2 yielding 25; non-walk modes follow same penalty (fly stays 0 for no-fly-source case after penalty); Grappled (Speed 0) stays 0.

**Audit:**
- **Names:** the two new constants follow the slice-7 `EXHAUSTION_<dimension>_PENALTY_PER_LEVEL` naming axis.
- **DRY:** all three derive sites (ability-check, save, attack) share the `if (character.exhaustion > 0)` + breakdown-push shape. Speed's wiring is one final `Math.max(0, scaled + exhaustionPenalty)` line. Not factored into a shared helper because each site computes against its own breakdown shape; the duplication is two lines per site.
- **SRP:** constants split per-dimension; each derive site applies its own dimension's constant.
- **Magic numbers:** all three penalty magnitudes extracted to named constants in [src/internal/constants.ts](../../src/internal/constants.ts).
- **at-threading:** N/A (pure derivation; no event emission).
- **Mechanical outcomes asserted:** 11 cases — per-level attack penalty progression, per-level speed reduction (walk + non-walk + boundary), Grappled-zero clamp.

**Pattern-check:** the existing check + save sites were ad-hoc wirings of the same RAW family (slice 7's pre-2024 SAVE_PENALTY name predates the 2024 D20-Test unification). The three derive sites are now mechanically symmetric; the constant naming reflects that. Future modifiers to D20 Tests (e.g., a homebrew "Curse of the Sluggard: -1 to all D20 Tests") would land in the same three derive sites with a similar per-dimension constant.

---
