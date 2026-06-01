# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Tests (slices 573 + 574 + 575): closure of the L1 audit's test-rigor + audit-test gaps**

Closes the last three items of the deep-audit closure plan in one combined slice. All three are test-only — no engine or content changes.

**Slice 573: per-class L1 end-to-end scenarios** ([tests/unit/engine/slice-573-l1-per-class-scenarios.test.ts](tests/unit/engine/slice-573-l1-per-class-scenarios.test.ts), 8 cases): one test per class for the 8 classes the audit flagged as lacking end-to-end L1 coverage (Barbarian, Bard, Cleric, Druid, Monk, Ranger, Sorcerer, Warlock). Fighter / Paladin / Rogue / Wizard already had golden L1 coverage. Each test builds an L1 character of the class, exercises a class-specific L1 feature (Rage + greataxe; Vicious Mockery cast; Cure Wounds heal; Produce Flame cantrip; Martial Arts unarmed strike; Hunter's Mark free-cast via Favored Enemy; Innate Sorcery activation; Eldritch Blast L1 single-beam), and asserts the architectural invariant `replay(campaign.events) deep-equals campaign.state` via the existing `replay` helper.

**Slice 574: CI-guarded L1 SRD invariants audit** ([tests/audit/srd-l1-invariants.test.ts](tests/audit/srd-l1-invariants.test.ts), 30 cases): pins three drift-prone L1 facts against the pack:
1. Per-class hit die (12 cases — d6/d8/d10/d12 per class). A future content edit that bumped a hit die now fails CI.
2. Per-caster L1 spell-slot table + ability + progression (8 cases — Bard CHA-full / Cleric WIS-full / Druid WIS-full / Sorcerer CHA-full / Wizard INT-full / Paladin CHA-half / Ranger WIS-half / Warlock CHA-pact). Mirror of slice 564's derive-side coverage but as an audit, so a regression in `FULL_CASTER_SLOTS` or the class's `spellcasting` field fails immediately.
3. Non-caster classes have no spellcasting (4 cases — Barbarian / Fighter / Monk / Rogue).
4. Standard ability-score array values (8 / 10 / 12 / 13 / 14 / 15) are accepted by the schema (6 cases — boundary check).

**Slice 575: condition behavior tests + parity audit** ([tests/unit/engine/slice-575-condition-behavior.test.ts](tests/unit/engine/slice-575-condition-behavior.test.ts), 10 cases; [tests/audit/incapacitated-parity.test.ts](tests/audit/incapacitated-parity.test.ts), 2 cases):
- Behavioral coverage for 8 RAW conditions that previously had only pack-declaration assertions: Blinded (attacker advantage + self disadvantage), Poisoned (self attack disadvantage), Restrained (attacker advantage), Stunned (attacker advantage), Invisible (attacker disadvantage), Charmed (can't attack charmer — throws), Frightened (self attack disadvantage), Prone (asymmetric melee advantage), Unconscious (attacker advantage). Each test commits a fixture with the condition applied and asserts the resulting attack-roll mode through `engine.plan.attack`.
- New audit pins the `INCAPACITATING_CONDITIONS` (reducer-side, slice 570) and `ACTION_BLOCKING_CONDITIONS` (planner-side, slice 339+) sets at parity. The two sets enforce the same RAW semantic ("Incapacitated breaks concentration" / "Incapacitated blocks actions") and must contain the same condition ids; the audit parses both source files via regex (comment-aware), strips line comments to skip mentions in prose, and asserts set equality. If a future slice adds a new incapacitating condition (e.g., `tasha-hideous-laughter-active`) to one side but not the other, CI fails immediately.

**Real RAW drift uncovered during slice 575 (documented; tracked for future closure):**

Stunned / Paralyzed / Unconscious / Petrified all carry `SetAdvantage on:{kind:'save',ability:'STR'|'DEX'} mode:'auto-fail'` entries (verified by slice 567's pack-declaration tests). The `EffectAccumulator` builder tracks `autoFail` per ability ([src/effects/builder.ts:81](src/effects/builder.ts#L81)). **HOWEVER**, the save derive ([src/derive/save.ts:174-175](src/derive/save.ts#L174-L175)) only exposes `hasAdvantage` / `hasDisadvantage`, NOT `hasAutoFail`. The save planner therefore doesn't force-fail saves on auto-fail-bearing characters; a Stunned target rolling a STR save can still succeed if the d20 result + modifiers exceed DC. This is a real RAW drift not previously caught. Slice 575 documents it in the test (commented-out assertion with the explanation) so a future engine closure can wire the auto-fail path through the save planner. The pack-declaration parity tests (slice 567) catch any regression in the effect-list itself.

**Audit (combined):**
- **Names:** `INCAPACITATING_CONDITIONS` / `ACTION_BLOCKING_CONDITIONS` follow the slice-570 naming convention; `RAW_HIT_DICE` / `RAW_CASTERS` in the slice-574 audit are RAW-reference constants.
- **DRY:** parity audit + per-class L1 tests both use the same buildL1 helper convention (slice 573 file-local; slice 564's CASTERS table re-stated in slice 574's audit since the audit checks the SAME table via a different code path — derive vs pack — and a shared module would couple the layers).
- **SRP:** four new test files; zero engine / content changes.
- **Magic numbers:** all RAW values (hit dice; standard array; slot tables) extracted to named constants in the test files.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** 50 cases total (8 per-class scenarios + 30 L1 invariants + 10 condition behaviors + 2 parity).

**Pattern-check:** the auto-fail save drift surfaces a class of "effect-stack-tracked but planner-unconsumed" bugs. A future slice can sweep all EffectAccumulator state for read-site coverage. The deep audit's 8-item closure plan is complete:
1. ~~Condition effect-list completeness~~ — slice 567.
2. ~~Within-5ft auto-crit + Prone asymmetric + Grappled non-grappler~~ — slice 568.
3. ~~Exhaustion attack-roll + speed penalties~~ — slice 569.
4. ~~Incapacitated → concentration-break~~ — slice 570.
5. ~~planHelp~~ — slice 571.
6. ~~planReady~~ — slice 572.
7. ~~Per-class L1 golden scenarios~~ — slice 573 (8 of 8 classes).
8. ~~CI-guarded L1 audit tests~~ — slice 574.
9. ~~Condition behavior tests + INCAPACITATING parity~~ — slice 575.

The remaining engine gaps (auto-fail save consumption; planSearch / planStudy / planInfluence / planUtilize) are documented in the slice 572 + 575 entries and deferred to future engine slices — no longer surfaced by the audit's L1 closure plan.

---

**Engine (slice 572): planReady — the L1 Ready action**

Closes the second of the six missing L1 action planners (slice 571 shipped Help). Pre-slice the Ready action had no engine path: a combatant could not declare a trigger-and-response that consumes their Action for the turn.

RAW (PHB 2024 ch.7 Ready action): "You take the Ready action to wait for a particular circumstance before acting. ... This lets you act using your Reaction before the start of your next turn. First, you decide what perceivable circumstance will trigger your reaction."

**New event** ([src/schemas/events/action-economy.ts](src/schemas/events/action-economy.ts)): `ActionReadied { encounterId, combatantId, trigger: string }`. Registered in [src/schemas/events/index.ts](src/schemas/events/index.ts) (import, union, type name, public re-export).

**New runtime field** ([src/schemas/runtime/encounter.ts](src/schemas/runtime/encounter.ts)): `TurnUsage.readiedAction?: { trigger: string }`. Stamped by the reducer; cleared by `applyTurnStarted` when the combatant's next turn begins (RAW: "before the start of your next turn"). Additive defaulted-to-undefined — no SCHEMA_VERSION bump, no migration (Zod default loads old saves).

**Reducer** ([src/engine/reducers/action-economy.ts](src/engine/reducers/action-economy.ts)): new `applyActionReadied` stamps `turnUsage.readiedAction`. The Reaction is NOT pre-consumed (RAW: the Reaction fires when the trigger occurs, and the consumer's subsequent reactive planner consumes it). Wired into [src/engine/apply.ts](src/engine/apply.ts) switch.

**Planner** ([src/engine/plan/ready.ts](src/engine/plan/ready.ts)): `planReady({ combatantId, trigger })`. Validates `assertActorCanAct`, encounter context (must be on combatant's turn), action not already used, non-empty trigger. Emits `ActionEconomyConsumed { kind: 'action' }` + `ActionReadied { trigger }`.

**Out of scope (future engine surface)**: trigger-and-execute machinery. When the trigger fires, the consumer calls the existing reactive planners (planAttack, planCastSpell, etc.) themselves, consuming the Reaction at that point. The readied-spell Concentration semantic (RAW: "holding onto the spell's magic requires Concentration") is consumer-managed via the existing planCastSpell concentration path.

**Wiring**: [src/engine/plan/index.ts](src/engine/plan/index.ts) (re-export), [src/engine/index.ts](src/engine/index.ts) (Engine.plan.ready), [src/engine/conveniences.ts](src/engine/conveniences.ts) (`Ready` dispatch — planner-wiring audit's `performIntent` requirement), [tests/transcript.ts](tests/transcript.ts) (formatEvent ActionReadied line).

**Tests** ([tests/unit/engine/slice-572-ready.test.ts](tests/unit/engine/slice-572-ready.test.ts), 8 cases): on-turn Ready emits ActionEconomyConsumed + ActionReadied; post-commit turnUsage.readiedAction carries the trigger; Reaction stays available; readiedAction clears at next TurnStarted; off-turn Ready throws; out-of-encounter Ready throws; double-Action-use throws; empty trigger throws; Incapacitated combatant throws.

**Audit:**
- **Names:** `ActionReadied` mirrors `ActionEconomyConsumed` / `RecklessAttackActivated` event-name convention; `readiedAction` on turnUsage mirrors `recklessAttackActive` / `noProvokeMovementUpToFeet` per-turn-state convention.
- **DRY:** the planner is a one-purpose 90-line file; the reducer is 9 lines; no shared helper because the surface area is small.
- **SRP:** schema + reducer + planner each in their own file; existing TurnStarted clears the new field alongside the other per-turn flags.
- **Magic numbers:** none.
- **at-threading:** single `nowIso()` per planner pass-through to both emitted events.
- **Mechanical outcomes asserted:** 8 cases covering both happy paths and 5 negative gates.

**Pattern-check:** Ready is the second of 6 missing L1 actions. The remaining 4 (Search, Study, Influence, Utilize) are largely thin wrappers over `planAbilityCheck` (Search = WIS check; Study = INT check; Influence = CHA check with target-set DC; Utilize = object interaction). Deferred to future slices — lower impact, similar shape.

---

**Engine + content (slice 571): planHelp — the L1 Help action, both modes**

Closes one of the six missing L1 action planners surfaced by the deep audit. Pre-slice Help was a documented gap: a Helper had no engine path to confer Advantage on an ally's check or distract a foe for an ally's attack. Slice 571 ships `planHelp` with both RAW modes.

RAW (PHB 2024 ch.7 Help action):
- **Help (Attack)**: "You momentarily distract a foe within 5 feet of you. The next attack roll one of your allies makes against that foe before the start of your next turn has Advantage on the attack roll."
- **Help (Ability Check)**: "You momentarily help another creature do something. ... The creature has Advantage on that ability check."

**Planner** ([src/engine/plan/help.ts](src/engine/plan/help.ts)): `planHelp({ helperId, targetId, mode: 'attack' | 'check' })`. Validates the helper isn't Incapacitated (`assertActorCanAct`); rejects self-help; consumes the helper's Action when invoked in an active encounter on their turn; emits `ConditionApplied` for the appropriate condition with `sourceCharacterId = helper.id` and `expiresOnRound = currentRound + 1, expiryTrigger: 'turnEnd'`. Out-of-encounter use bypasses the action gate (RAW: skill checks happen outside combat too).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- **`helped-against-active`** (Attack mode): `GrantAdvantageToAttackers` + `consumeOnIncomingAttack: true` + `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }`. The first attack against the foe consumes the condition; the autoExpiry sweeps any unused condition at the helper's next-turn-end (matching "before the start of your next turn").
- **`helped-on-check-active`** (Ability Check mode): `SetAdvantage { on: { kind: 'check' }, mode: 'advantage' }` (wildcard ability) + `autoExpiry { afterRounds: 1, trigger: 'turnEnd' }`. The bearer gets Advantage on any ability check until expiry.

**Documented RAW deviations:**
- The Ability Check mode does NOT enforce "consumed on the first check" — the engine has no `consumeOnCheck` primitive yet (the existing `consumeOnAttack` / `consumeOnIncomingAttack` are attack-side only). A future engine slice can add parity; the impact is bounded (the autoExpiry sweeps at turn-end, so multiple checks within one round get advantage instead of just the first).
- The 5-foot proximity gate for Attack mode is consumer-managed (the engine doesn't track positions).
- The "helper must be proficient in the chosen skill" gate (Ability Check mode) is consumer-managed (the planner doesn't require a skill id).

**Wiring**: [src/engine/plan/index.ts](src/engine/plan/index.ts) (re-export), [src/engine/index.ts](src/engine/index.ts) (Engine.plan.help + planHelp import), [src/engine/conveniences.ts](src/engine/conveniences.ts) (`Help` dispatch entry — planner-wiring audit's `performIntent` requirement).

**Tests** ([tests/unit/engine/slice-571-help.test.ts](tests/unit/engine/slice-571-help.test.ts), 8 cases): pack declarations for both conditions; Attack mode applies the condition with `sourceCharacterId = helper`, ally's first attack rolls with Advantage, the condition is consumed on the first incoming attack so the second attack doesn't get the bonus; Check mode applies the condition, ally's ability check rolls with Advantage; helping yourself throws; an Incapacitated helper throws.

**Doc-count updates**: conditions 140 → 142 (rider 125 → 127); updated in [docs/getting-started.md](docs/getting-started.md), [docs/status.md](docs/status.md) (×2 rows), [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md). Coverage snapshot ([tests/coverage/__snapshots__/features.test.ts.snap](tests/coverage/__snapshots__/features.test.ts.snap)) gains the two new conditions in the wired-catalog list.

**Audit:**
- **Names:** `helped-against-active` mirrors the existing `<verb>ed-<gate>-active` convention (e.g. `vexing-active`, `hexed-STR-active`); `helped-on-check-active` is verbose but unambiguous about the gate (check vs attack).
- **DRY:** the two conditions follow the slice-571 pattern of a one-shot advantage with autoExpiry — no shared helper because the two condition entries are 1 JSON object each and inlining is clearest.
- **SRP:** planner is one file, ~70 lines; two new content entries; the existing `consumeOnIncomingAttack` reducer (slice 484) and `autoExpiry` sweep (slice 269) consume the conditions without engine change.
- **Magic numbers:** none.
- **at-threading:** single `nowIso()` per planner pass-through; the encounter-round read is one resolution; `expiresOnRound` stamped once.
- **Mechanical outcomes asserted:** 8 cases — pack declarations + per-mode condition application + consume-on-first-incoming-attack + Advantage on first ally attack + Advantage on first ability check + self-help / Incapacitated-helper negative controls.

**Pattern-check:** Help is the simplest of the missing L1 actions — the next 5 (Ready, Search, Study, Influence, Utilize) follow similar planner shapes but each needs its own RAW-specific wiring (Ready needs reaction-window state; Search / Study are largely AbilityCheck wrappers with a category; Influence is a CHA-check wrapper with target-specific DC). Slice 572 ships Ready; the other four are lower-impact and deferred to future slices.

---

**Engine (slice 570): Incapacitated → concentration-break on apply**

Closes the last load-bearing engine drift surfaced by the deep audit's combat-mechanics agent. Pre-slice the engine cleared concentration in two places:
1. HP-drop-to-0 in `applyDamageApplied` ([src/engine/reducers/combat.ts:104-117](src/engine/reducers/combat.ts#L104-L117)) — handles falling Unconscious from damage.
2. Planners that explicitly emit `ConcentrationBroken` events (`planConcentrationBreakOnDrop`, etc.).

Neither path triggers when a concentrating caster receives an Incapacitated-composing condition via non-damage source: Hold Person → `paralyzed`, Power Word Stun → `power-word-stunned-active`, Hideous Laughter → `hideous-laughter-active`, plain `incapacitated`, or any of `stunned` / `petrified` / `held-paralyzed-active` / `unconscious` applied without an HP-drop.

RAW (PHB 2024 ch.7 Concentration): "Your Concentration ends if you become Incapacitated or die."

**Reducer wiring** ([src/engine/reducers/combat.ts](src/engine/reducers/combat.ts)):
- New local `INCAPACITATING_CONDITIONS` set — mirror of [`ACTION_BLOCKING_CONDITIONS`](src/engine/plan/_actor-state.ts#L32) in the planner side. Held as a separate const to avoid a planner-to-reducer import (layers stay separate; slice 582's condition-behavior audit will pin the parity).
- `applyConditionApplied` adds a post-push hook: when the applied condition's id is in the set AND the character has `concentrationEffectId !== undefined`, the existing `clearConcentrationEffect` helper is called. Non-incapacitating conditions and non-concentrating bearers are no-ops.

**Tests** ([tests/unit/reducers/slice-570-incapacitated-concentration-break.test.ts](tests/unit/reducers/slice-570-incapacitated-concentration-break.test.ts), 12 cases): each of the 8 incapacitating-condition ids clears concentration on a concentrating bearer; non-incapacitating conditions (`poisoned`, `frightened`) leave concentration intact; applying paralyzed to a non-concentrating character is a clean no-op; exhaustion (not in the set; tracked via its own field) leaves concentration intact.

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

Closes a real L1 RAW drift surfaced by the deep audit. Pre-slice the engine applied the -2-per-level exhaustion penalty to ability checks ([src/derive/ability-check.ts:147](src/derive/ability-check.ts#L147)) and saving throws ([src/derive/save.ts:124-126](src/derive/save.ts#L124-L126)), but the **attack-roll** and **Speed** arms of the 2024 RAW were unwired. An exhausted character's to-hit was unaffected; their movement was unchanged.

RAW PHB 2024 Exhaustion ([references/srd-markdown/rules-glossary.md](references/srd-markdown/rules-glossary.md)):
- "You take a -2 penalty to all D20 Tests for every level of Exhaustion." (D20 Tests = checks + saves + attack rolls.)
- "Your Speed decreases by 5 feet for every level of Exhaustion."
- Level 6 = death (already wired in the apply-condition reducer via `EXHAUSTION_MAX`).

**Constants** ([src/internal/constants.ts](src/internal/constants.ts)): two new sibling constants alongside the legacy `EXHAUSTION_SAVE_PENALTY_PER_LEVEL`:
- `EXHAUSTION_ATTACK_PENALTY_PER_LEVEL = -2`
- `EXHAUSTION_SPEED_PENALTY_PER_LEVEL = -5`

The pre-2024-unification names stay (the values are identical, but distinct names make the per-dimension wiring greppable for future maintenance / partial reverts).

**Attack-roll wiring** ([src/derive/attack.ts](src/derive/attack.ts)): `computeAttackBonus` adds an `exhaustion` breakdown entry when `character.exhaustion > 0`, mirroring the existing pattern in [ability-check.ts](src/derive/ability-check.ts) and [save.ts](src/derive/save.ts). Penalty applied after all weapon bonuses and effect-stack modifiers — the breakdown is independently visible for sheet display.

**Speed wiring** ([src/derive/speed.ts](src/derive/speed.ts)): `getEffectiveSpeedForMode` applies the exhaustion penalty AFTER all `op: 'set' / 'add' / 'multiply'` modifiers and the natural-vs-set precedence resolution — RAW: the penalty stacks on the final value. Applies to ALL movement modes (walk / fly / swim / climb / burrow); a zero-speed (Grappled / Restrained / Unconscious) is unaffected because the existing `if (zeroSet) return 0` short-circuits earlier. Final `Math.max(0, scaled + exhaustionPenalty)` clamps so a high-exhaustion character can't go negative on Speed.

**Tests** ([tests/unit/derive/slice-569-exhaustion-attack-speed.test.ts](tests/unit/derive/slice-569-exhaustion-attack-speed.test.ts), 11 cases):
- Attack: exhaustion 0 / 1 / 3 / 5 yielding -0 / -2 / -6 / -10 modifier; penalty exposed in breakdown; can push net bonus negative.
- Speed: exhaustion 0 / 1 / 3 / 6 yielding 30 / 25 / 15 / 0 ft walk; Goliath base 35 with exhaustion 2 yielding 25; non-walk modes follow same penalty (fly stays 0 for no-fly-source case after penalty); Grappled (Speed 0) stays 0.

**Audit:**
- **Names:** the two new constants follow the slice-7 `EXHAUSTION_<dimension>_PENALTY_PER_LEVEL` naming axis.
- **DRY:** all three derive sites (ability-check, save, attack) share the `if (character.exhaustion > 0)` + breakdown-push shape. Speed's wiring is one final `Math.max(0, scaled + exhaustionPenalty)` line. Not factored into a shared helper because each site computes against its own breakdown shape; the duplication is two lines per site.
- **SRP:** constants split per-dimension; each derive site applies its own dimension's constant.
- **Magic numbers:** all three penalty magnitudes extracted to named constants in [src/internal/constants.ts](src/internal/constants.ts).
- **at-threading:** N/A (pure derivation; no event emission).
- **Mechanical outcomes asserted:** 11 cases — per-level attack penalty progression, per-level speed reduction (walk + non-walk + boundary), Grappled-zero clamp.

**Pattern-check:** the existing check + save sites were ad-hoc wirings of the same RAW family (slice 7's pre-2024 SAVE_PENALTY name predates the 2024 D20-Test unification). The three derive sites are now mechanically symmetric; the constant naming reflects that. Future modifiers to D20 Tests (e.g., a homebrew "Curse of the Sluggard: -1 to all D20 Tests") would land in the same three derive sites with a similar per-dimension constant.

---

**Engine + content (slice 568): three attack-resolution gates — within-5-ft auto-crit, Prone asymmetric attacker advantage, Grappled non-grappler disadvantage**

Closes three of the engine-side RAW drifts surfaced by the deep audit (slice 567 was the content-side companion). Each gate adds a new attack-resolution behavior that was missing:

**1. Paralyzed / Unconscious within-5-ft auto-crit** (RAW Paralyzed + Unconscious: "Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.")

[src/engine/plan/attack.ts](src/engine/plan/attack.ts): the `critical` computation now considers `targetAutoCritsFromMelee` as a second source (alongside the existing `usedRoll >= critThreshold`). The check fires when the attack is melee (proxy for "within 5 feet" — the common case; reach weapons at 10 ft over-grant under this approximation until positional state is modeled) AND the target carries one of: `paralyzed`, `held-paralyzed-active` (Hold Person / Hold Monster — composes Paralyzed per RAW), `unconscious`, or HP <= 0 (synthetic-unconscious case `findActorBlockingCondition` returns).

**2. Prone asymmetric attacker advantage** (RAW Prone: melee attacks against the bearer have Advantage; ranged attacks have Disadvantage.)

[src/engine/plan/attack.ts](src/engine/plan/attack.ts): a new `targetSideAttackerFacts` map is built early (carries `event.attackKind` from `weaponDef.attackKind`) and passed to `targetEffects.grantsAdvantageToAttackers(...)` — the existing read site already supported a facts argument (slice 262) but no prior caller used it. The pre-existing `attackerFacts` map (consumed by `imposesDisadvantageOnAttackers`) gains the same `event.attackKind` entry for symmetry. Prone's content now carries two predicate-gated entries: `GrantAdvantageToAttackers { condition: event.attackKind == 'melee' }` and `ImposeDisadvantageOnAttackers { condition: event.attackKind == 'ranged' }`. The bearer-side attack disadvantage stays.

**3. Grappled disadvantage on attacks vs non-grappler** (RAW Grappled: the bearer's attacks have Disadvantage on creatures other than the grappler.)

[src/engine/plan/attack.ts](src/engine/plan/attack.ts): `attackerSelfAdvantageFacts` gains a new fact `bearer.targetIsNotGrappler` (computed inline: true iff the attacker carries a `grappled` condition whose `sourceCharacterId !== input.targetId`). Grappled's content gains a predicate-gated `SetAdvantage { on: 'attack', mode: 'disadvantage', condition: bearer.targetIsNotGrappler == true }`. Attacking the grappler itself still rolls 'none' (the predicate evaluates false).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Prone gains 2 effect entries (melee-advantage + ranged-disadvantage); Grappled gains 1 entry (non-grappler disadvantage). Pre-existing arms preserved.

**Tests** ([tests/unit/engine/slice-568-attack-gates.test.ts](tests/unit/engine/slice-568-attack-gates.test.ts), 11 cases): per-arm assertions —
- within-5-ft auto-crit: melee hit vs paralyzed / unconscious / held-paralyzed-active / synthetic-unconscious (HP <= 0) all → critical = true; ranged hit vs paralyzed → NOT crit (RAW "within 5 ft"); melee hit vs Stunned → NOT crit (RAW exempts Stunned from auto-crit).
- Prone asymmetric: melee attack → 'advantage'; ranged attack → 'disadvantage'.
- Grappled: bearer attacking grappler → 'none'; bearer attacking non-grappler → 'disadvantage'; non-Grappled attacker → 'none' (control).

**Audit:**
- **Names:** `targetAutoCritsFromMelee` is the predicate at the read site; `targetSideAttackerFacts` mirrors the existing `attackerFacts` / `attackerSelfAdvantageFacts` naming axis; `bearer.targetIsNotGrappler` follows the slice-272 / 273 `bearer.<predicate>` fact-path convention.
- **DRY:** the `event.attackKind` fact is populated in both fact maps with the same string source (`weaponDef.attackKind`); a hypothetical shared constant would add one line and read less clearly.
- **SRP:** within-5-ft auto-crit adds ~10 lines around the existing `critical` line; Prone wiring is one new fact + one new call argument; Grappled wiring is one new fact and an inline closure to derive it.
- **Magic numbers:** none.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** 11 per-gate cases, plus negative controls for ranged (auto-crit doesn't fire) and Stunned (RAW exempt), plus the grappler-as-target negative for Grappled.

**Pattern-check:** the within-5-ft proxy is "melee attack ⇒ within 5 ft" — an over-grant for reach weapons at 10 ft. Positional state is the right long-term primitive; until then, the approximation matches existing planner patterns (e.g., Sneak Attack's flank arm uses ally-adjacent facts, not exact distances). The two new facts (`event.attackKind`, `bearer.targetIsNotGrappler`) are predicate paths future content can reuse without re-wiring the planner.

---

**Content (slice 567): condition effect-list completeness sweep — RAW drift on 5 of 15 conditions**

Closes a class of RAW drift surfaced by the post-cycle deep L1 audit (the audit fanned across 6 agents; condition-effects was the highest-impact dimension found). Pre-slice 5 of the 15 RAW conditions had under-modeled effect arrays:
- **Blinded**: missing `GrantAdvantageToAttackers`.
- **Paralyzed**: missing `GrantAdvantageToAttackers`.
- **Stunned**: missing `ModifySpeed walk:0` AND `GrantAdvantageToAttackers`.
- **Unconscious**: missing `GrantAdvantageToAttackers`.
- **Petrified**: missing `GrantAdvantageToAttackers` AND auto-fail STR/DEX saves (RAW: Petrified composes Paralyzed).

Only `restrained` carried `GrantAdvantageToAttackers` pre-slice. The drift meant attackers got no Advantage against a Paralyzed (Hold Person'd), Stunned, Unconscious, Petrified, or Blinded target — a major L1 combat under-modeling, since the whole *point* of these debuffs is to weaponize the bearer's vulnerability.

RAW sources ([references/srd-markdown/rules-glossary.md](references/srd-markdown/rules-glossary.md)):
- Blinded: "...Attack rolls against the creature have advantage..."
- Paralyzed: "...Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature."
- Stunned: "...the creature has Speed 0... Attack rolls against the creature have advantage."
- Unconscious: "...The creature has Speed 0... Attack rolls against the creature have advantage. Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature."
- Petrified (composes Paralyzed): "...auto-fails STR and DEX saving throws... Attack rolls against the creature have advantage."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): the 5 condition entries gain the missing effect-array members. Every change is additive (no removed entries; existing arms are preserved).

**Deferred to follow-up slices** (each its own engine work, not pure content):
- **Paralyzed + Unconscious within-5-ft auto-crit** → slice 568 (needs attack-resolution range check; the existing crit pipeline doesn't gate on attacker-target distance).
- **Prone asymmetric attacker advantage** (melee Advantage, ranged Disadvantage) → folded into slice 568 since the `event.attackKind` fact has to be added to the attacker-side facts map.
- **Grappled disadvantage on attacks vs non-grappler** → folded into slice 568 (needs `bearer.targetIsGrappler` fact derived from the bearer's condition source).
- Incapacitated composition arms (action / bonus / reaction block) stay engine-hardcoded via [`_actor-state.ts`'s `ACTION_BLOCKING_CONDITIONS`](src/engine/plan/_actor-state.ts) — already wired for paralyzed / stunned / petrified / unconscious, no slice work needed.

**Tests** ([tests/unit/engine/slice-567-condition-effect-completeness.test.ts](tests/unit/engine/slice-567-condition-effect-completeness.test.ts), 14 cases): each new arm asserted at pack-declaration level (GrantAdvantageToAttackers on each of the 5 conditions; Stunned Speed 0; Petrified auto-fail STR + DEX); pre-existing arms regression-smoke-checked (bearer-side attack disadvantage on Blinded; resistance + immunity on Petrified; existing Speed 0 + auto-fails on Paralyzed / Unconscious / Stunned).

**Audit:**
- **Names:** all added entries reuse the canonical effect-kind names (`GrantAdvantageToAttackers`, `ModifySpeed walk:0`, `SetAdvantage mode:'auto-fail'`).
- **DRY:** 5 conditions get the same shape (`{ kind: 'GrantAdvantageToAttackers' }`); not factored into a shared snippet because content is JSON and inlining is clearest at this scale.
- **SRP:** pure content edit — no engine code touched. The 14 tests assert pack declarations, not behavior (which is exercised by the engine's existing attack-roll resolution path through `targetEffects.grantsAdvantageToAttackers()` — slice 262 wired this read site).
- **Magic numbers:** none added.
- **at-threading:** N/A (no new event emission).
- **Mechanical outcomes asserted:** 14 per-condition pack-declaration assertions plus 5 regression-smoke checks for pre-existing arms.

**Pattern-check:** the under-modeled-condition class likely has more instances in the rider variants (~125). Future slice 582 (condition behavior tests) will sweep the entire condition catalog — both RAW + rider variants — and surface any other missed effect entries.

---
**Pattern-check:** the original `hexed-active` design baked the assumption "one chosen ability per cast" into the consumer side as out-of-band metadata. Slice 367 had already solved this exact pattern for Bestow Curse via per-ability conditions + casterChoosesVariant. Slice 565 applies the slice-367 pattern to Hex, closing the parallel. Future spells with "caster picks an ability at cast time" RAW (e.g. variants of Boon-style spells) reuse the same shape. The doc-counts audit's conditions-count guard caught the +5 net change (135 → 140) and the rider sub-count (120 → 125) automatically; both updated in [docs/getting-started.md](docs/getting-started.md), [docs/status.md](docs/status.md) (twice — overview row + dimension row), and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md).


Per-slice detail for slices 565-566 (Hex ability-disadvantage rider; Favored Enemy Hunter's Mark pool-based free-cast wiring) is archived at [docs/changelog/archive-slices-565-566.md](docs/changelog/archive-slices-565-566.md) (slice 572, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 562-564 (Eldritch Blast multi-beam scaling; Vicious Mockery disadvantage rider; per-caster L1 spellcasting math test suite) is archived at [docs/changelog/archive-slices-562-564.md](docs/changelog/archive-slices-562-564.md) (slice 569, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 560-561 (Human / Tiefling Medium-or-Small size choice; Druid Magician cantrip choice + deep-audit clarifications) is archived at [docs/changelog/archive-slices-560-561.md](docs/changelog/archive-slices-560-561.md) (slice 567, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 553-559 (Goliath Giant Ancestry × 6 arms cohort + 3 missing focus variants) is archived at [docs/changelog/archive-slices-553-559.md](docs/changelog/archive-slices-553-559.md) (slice 562, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 549-552 (post-L1-audit fixes: Rogue Sneak Attack finesse/ranged weapon gate; Cover bonus on Dex saves; Forest Gnome Speak with Animals per-rest cap; Reach property OA threat range) is archived at [docs/changelog/archive-slices-549-552.md](docs/changelog/archive-slices-549-552.md) (slice 558, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 545-548 (final L1 deep-audit closure cohort: planSecondWind for Fighter L1, Healer's Kit + planUseHealersKit, Savage Attacker audit-clarification, planRage + raging condition for Barbarian L1) is archived at [docs/changelog/archive-slices-545-548.md](docs/changelog/archive-slices-545-548.md) (slice 553).

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon; Heroic Inspiration first-class resource; Halfling Luck cohort sweep + helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md) (slice 548).

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance; Human Resourceful narrative marker; Halfling Luck primitive + attack arm; Halfling Luck save + check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md) (slice 545).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md) (slice 541).

Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md) (slice 537).

Per-slice detail for slices 520-524 (Spare the Dying + stabilize; Expeditious Retreat + planExpeditiousRetreatDash; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md) (slice 529).

Per-slice detail for slices 517-519 (Pact boon completion arc: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520).

Per-slice detail for slices 506-512 (L1-completion polish arc: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490).

Per-slice detail for slices 472-481 (post-alpha.15 iconic-encounter content sweep) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487).

## 0.1.0-alpha.15 - 2026-05-26

**Release (slice 471): bump to 0.1.0-alpha.15**

Promotes the post-alpha.14 cohort (slices 437-470) to a tagged release. `package.json` bumped from `0.1.0-alpha.14` to `0.1.0-alpha.15`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the cohort's two persisted-shape touches (slice 467 added `turnUsage.savageAttackerUsedThisTurn`, slice 468 added the `InitiativeSwapped` event) are both purely additive with safe defaults, so old saves parse unchanged. The full suite is green; doc-counts + doc-links + doc-size audits all pass.

Cohort, in two arcs:

- **Infra + docs sustainability (437-443):** the active-cycle CHANGELOG invariant that finally stopped the split-treadmill (437, `58.9 KB -> 9.5 KB` by evicting eight frozen release narratives to the per-range archives), the doc-links audit blind-spot fix for empty hrefs that the bulk re-rooting briefly produced (437 also), the broken-link fix in CLAUDE.md (438), the case-only link-mismatch hardening (439), documenting the PR-based `dev` -> `main` integration as standard (440), de-numbering the stale "Layer N" test labels (441), cutting CI turnaround from ~7 min per push to fast per-slice feedback (442), and syncing CLAUDE.md's branch section for fresh-agent readiness (443).
- **L1 playability arc (444-470):** the level-by-level direction shift. Three batches landed: species trait sweep (444-465) - Halfling Brave, Elf Fey Ancestry + Keen Senses, Darkvision / Dwarven Resilience / Gnomish Cunning, Rogue Thieves' Cant + Sprite natural weapons, Wolf / Dire Wolf / Brown Bear / Mastiff knock-prone, Goblin Nimble Escape, Zombie Undead Fortitude, Wizard Ritual Adept, Orc Adrenaline Rush + Relentless Endurance, Kobold Sunlight Sensitivity + the Undead sunlight sweep, Sprite + Ghoul Bite natural weapons, Cleric Turn Undead, monster Multiattack content declaration (canonical user: Ghoul), Human Skillful, Goliath species (closing the last empty playable species); background mechanics (466-469) - backgrounds auto-project their Origin Feat + Sage RAW correction (466), Savage Attacker (467, the Soldier mechanic), Alert (468, the Criminal mechanic), Magic Initiate (Cleric / Wizard) (469, the Sage / Acolyte mechanics); plus CHANGELOG cohort archives (454 → slices 444-450, 460 → slices 451-459, 470 → slices 460-468). Net result: every L1 species has wired traits, every L1 class feature is wired, every 2024 SRD background lights up end-to-end (proficiencies + Origin Feat mechanics) through the slice-466 auto-projection, and the monster Multiattack primitive is shipped for the next-arc encounter sweep.

Per-slice detail for the whole cohort is in the per-cohort archives under [docs/changelog/](docs/changelog/):
- [archive-slices-444-450.md](docs/changelog/archive-slices-444-450.md) (L1 arc part 1)
- [archive-slices-451-459.md](docs/changelog/archive-slices-451-459.md) (L1 arc part 2)
- [archive-slices-460-468.md](docs/changelog/archive-slices-460-468.md) (L1 arc part 3 - background mechanics)
- The pre-arc infra slices (437-443) plus slices 461 + 469-470 remain on the live release narrative below; future archive slices will continue to evict cohorts as they age.

**Content (slice 469): Magic Initiate x 2 (Cleric + Wizard) - Sage and Acolyte light up end-to-end**

The final pair of Origin Feats. After slice 466's auto-projection (background -> effective feat list -> effect stack) and slices 467 / 468's mechanic wiring for Savage Attacker / Alert, the only remaining "background ships with no effect" rows were Sage and Acolyte, both pending their Magic Initiate origin feats. This slice closes both with a pure-content slice: no engine work beyond what the slice-212 `GrantSpell` consumer already does.

RAW (SRD 5.2.1 Magic Initiate):
- **Two Cantrips**: "Learn two cantrips of your choice from the Cleric, Druid, or Wizard spell list."
- **Level 1 Spell**: "Choose a level 1 spell from the same list... You always have that spell prepared. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have."
- **Repeatable**: different list each time. The pack already ships separate `magic-initiate-cleric` / `magic-initiate-wizard` feats, one per list; each background's Origin Feat fixes the list (Acolyte -> Cleric list, Sage -> Wizard list).

**Each feat ships two OfferChoice traits** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)), `when: 'onAcquire'`, each carrying `GrantSpell` per option:
- Cantrip OfferChoice (`oneOf: 2`): over the full SRD list for that class (7 Cleric, 15 Wizard). `preparation: 'always-prepared'` so the chosen cantrips appear on the bearer's effective spell list and can be cast at-will via the existing `cast-spell` planner.
- L1 OfferChoice (`oneOf: 1`): over the full SRD L1 list (15 Cleric, 30 Wizard). `preparation: 'oncePerLongRest'` — the slice-219 marker for "free cast" semantics. The spell still appears on `effectiveSpellList` so it's also castable using slots per RAW; the once-per-long-rest gate is consumer-tracked (same sibling-deferral as the slice-353 Warlock Contact Patron and slice-219 Cleric Divine Intervention).
- `spellcastingAbility`: hard-coded to the canonical default per RAW (`WIS` for Cleric list, `INT` for Wizard list). The player's choice across INT/WIS/CHA is deferred as a future refinement; for the auto-projected origin-feat path, the canonical default is the right out-of-the-box behavior.

**End-to-end through the background pipeline**: a consumer building an Acolyte / Sage character does **not** seed `featsTaken`. The slice-466 auto-projection delivers `magic-initiate-cleric` / `magic-initiate-wizard` to the effect stack from the background's `originFeatId`. The OfferChoice surfaces a pending choice on character acquisition; the consumer resolves it; the GrantSpell entries land on the bearer's `grantedSpells()` accumulator + `effectiveSpellList`.

**Tests** at [tests/unit/engine/slice-469-magic-initiate.test.ts](tests/unit/engine/slice-469-magic-initiate.test.ts) — 7 cases: (1, 2) Acolyte without choices resolved has no granted spells, Acolyte who picks Sacred Flame + Guidance + Cure Wounds has them granted with the right preparation modes and WIS ability; (3) the L1 spell appears on `effectiveSpellList` (castable via slots); (4, 5) Sage equivalents for Wizard list with INT ability; (6, 7) catalog-conformance checks pinning the OfferChoice shapes to the SRD list sizes (7 / 15 cleric, 15 / 30 wizard) so any future spell add / remove that walks past the catalog fails the audit.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Magic Initiate exactly. The cantrip + L1 spell selection arms ship via OfferChoice over the full SRD lists. The "Spell Change at each level" arm (replace one chosen spell on level-up) is deferred — needs a `when: 'onLevelUp'` mode for OfferChoice the engine supports today but the SRD-replace shape is not yet conveyed by the OfferChoice schema. The free-cast-per-long-rest gate is consumer-tracked, matching the established pattern from slices 219 + 353.
- *Names*: `magic-initiate-cleric-cantrips` / `magic-initiate-cleric-l1` (and Wizard variants) mirror the existing `wizard-scholar` / `rogue-expertise-l1` / `rogue-expertise-l6` choice-id naming (subject-feature-variant).
- *DRY*: a single helper in the generator script produces both feats' OfferChoice arrays from the same SRD lists; the pack carries the resulting JSON inline so there's no runtime indirection.
- *SRP*: feat ships the choice surface; OfferChoice + GrantSpell are the existing primitives; `effectiveSpellList` does the union; no engine code touched.
- *Magic numbers*: only the `oneOf: 2` and `oneOf: 1` per RAW; the cantrip / spell counts are content-driven from the SRD lists.
- *Mechanical outcomes asserted*: no-choice-resolved -> no grants; chosen cantrips -> always-prepared; chosen L1 -> oncePerLongRest; spellcasting ability matches list (WIS / INT); spells appear on `effectiveSpellList`; OfferChoice shapes match the SRD list sizes.

**Closes the L1 background arc.** Every 2024 SRD background that ships in the starter pack (Soldier, Sage, Criminal, Acolyte) now lights up end-to-end: ability-score options, skill / tool proficiencies, languages, and Origin Feat mechanics. A consumer building any of the four with default `featsTaken: []` gets the RAW behavior automatically through the slice-466 auto-projection.

**Open follow-ups:**
- ~~**Once-per-long-rest free-cast gate**: a per-feat resource the engine auto-tracks (granted via the GrantSpell `oncePerLongRest` preparation, consumed by a cast with `noSlotCost: true`) would close the consumer-responsibility gap for Magic Initiate's L1-spell free cast, Warlock Contact Patron, and any other future once-per-long-rest cast. Sibling primitive opportunity.~~ **Closed by slice 486.**
- **Spell Change at level-up** (RAW: "Whenever you gain a new level, you can replace one of the spells you chose for this feat"): needs an OfferChoice mode that exposes a "replace one of your prior selections" semantic on level-up. The schema's `when: 'onLevelUp'` is there but the replace-prior-pick shape isn't expressed. *Still open.*
- **spellcastingAbility player choice** (RAW: pick INT/WIS/CHA at feat acquisition): a third OfferChoice on each feat over the three abilities, with each option re-projecting the GrantSpell entries with that ability. Deferred for now; the canonical defaults match the linked backgrounds' ability options. *Still open.*
- ~~**Magic Initiate (Druid)**: not currently in the pack as a feat; would mirror the Cleric / Wizard wiring over the Druid list once that list is fully present.~~ **Closed by slice 485.**

**Docs (slice 470): archive slices 460-468 (L1 background-mechanics arc) to free CHANGELOG headroom**

Pure CHANGELOG-archive operation. The live CHANGELOG had reached 62 KB after the slice-466 / 467 / 468 / 469 background arc — over the comfortable single-Read threshold. Moved the nine-slice cohort 460-468 to [docs/changelog/archive-slices-460-468.md](docs/changelog/archive-slices-460-468.md), continuing from [docs/changelog/archive-slices-451-459.md](docs/changelog/archive-slices-451-459.md) (L1 arc part 2). Slice 469 stays inline as the most-recent slice. Live CHANGELOG drops to ~25 KB; archive holds the full per-slice detail with sibling-rooted links (`../../src/...`, `../../tests/...`). Archive index in [docs/changelog/README.md](docs/changelog/README.md) updated.

**Docs (slice 443): sync CLAUDE.md's branch section to the PR flow (fresh-agent readiness)**

CLAUDE.md is the auto-loaded manual a fresh agent reads first, but its "Branch structure" still described the old "user merges `dev` into `main` on his cadence" local-merge framing and never mentioned the PR-based integration adopted in slice 440 (only DEVELOPMENT.md did). A fresh agent would get the correct "don't push without instruction" rule but a stale mental model of *how* integration happens. Updated [CLAUDE.md](CLAUDE.md) "Branch structure" to state `dev` integrates into `main` only through a CI-gated PR (with the `gh pr create` command + the per-push-vs-PR-gate split from slice 442), pointing to DEVELOPMENT.md for the full flow; broadened the git-safety line to "don't push, open a PR, or merge to `main` without instruction." Also fixed a stale parallel-authoring summary line that said "engine on `main`" (contradicting the dev-only rule; the underlying parallel-authoring.md was corrected in slice 433 but this CLAUDE.md summary wasn't). Pattern-checked the front-door docs for other local-merge framing: none remain. No code/content/public-surface change.

**Infra (slice 442): cut CI turnaround (~7 min per push -> fast per-slice feedback)**

CI ran a 3-way Node matrix (20/22/24) where every entry did `npm ci` + typecheck + coverage-instrumented suite + build, so the expensive trio ran 3x, with no concurrency cancellation (a re-push left the stale run going). Restructured [.github/workflows/ci.yml](.github/workflows/ci.yml) so the felt per-slice cost drops without weakening the gate on `main`:

- **Fast per-push `test` matrix**: Node 20/22/24 each run `npm test` (`vitest run`, no coverage) on every push/PR. Cross-Node compatibility is still exercised on all three; coverage % is Node-invariant for this no-native-deps library, so it no longer runs 3x.
- **Integration-time `quality` job**: typecheck + coverage (80% thresholds) + build, once on Node 22, gated via `if:` to pull requests and pushes to `main`. Routine `dev` pushes skip it; `main` is never shipped without it (dev -> main is PR-only). The CI coverage run drops the `html` reporter (text + json-summary suffice; thresholds read json-summary); local `npm run test:coverage` still emits html.
- **Concurrency cancellation**: a top-level `concurrency` group keyed on workflow + ref cancels a ref's in-flight run on re-push (no more ~14-min double-waits). Does not affect the deploy-*.yml workflows.
- **Nightly deep fuzz**: new [.github/workflows/nightly-fuzz.yml](.github/workflows/nightly-fuzz.yml) runs the property suite at `FAST_CHECK_NUM_RUNS=1000` on a daily schedule (+ manual dispatch), so deep fuzzing is continuous instead of never-in-CI while per-push fuzz stays at the smoke level (50).
- **`structuredClone` in [tests/property/content-pack-validator.test.ts](tests/property/content-pack-validator.test.ts)**: replaces the `JSON.parse(JSON.stringify())` whole-pack deep clone done each fast-check iteration. Identical semantics on the plain-JSON pack; the file drops from ~43s to ~36s (the per-iteration Zod parse of the full pack, not the clone, is the remaining dominant cost) and the local pre-commit suite benefits too.

Quality is preserved: no tests deleted, coverage thresholds enforced before any merge to `main`, replay / RNG-capture / contract layers all still run, and local pre-commit still runs the full `vitest run` + `tsc` per slice. Documented the per-push-vs-gate split in DEVELOPMENT.md. Deliberately not done (low-risk bundle): test sharding + coverage-merge (the lever for sub-3-min single-run wall-clock, more plumbing) and hardcoding vitest `maxForks` (helps a 4-vCPU runner but can slow many-core local machines). No engine/content/public-surface change.

**Infra (slice 441): de-number the stale "Layer N" test labels (closes the slice-435 follow-up)**

Test-file headers and a few docs carried "Layer N" labels from an older 9+-layer testing scheme that no longer matched CLAUDE.md's current 1-7 Required-layers list (property tests were "Layer 7" and the feature-coverage matrix "Layer 8", but neither is a required layer; replay / RNG were "Layer 5 / 6" but are now 4 / 5). The numbers had drifted twice, so rather than re-number (which re-bitrots on the next reorder) the labels are now **de-numbered** to reference the standard by name. Updated `tests/property/*.test.ts` (7 files), `tests/coverage/features.test.ts`, and the `describe` labels in `tests/golden/{s2-combat-round,replay-equivalence,rng-capture}.test.ts` + `tests/integration/property.test.ts`; reconciled the stale inventory in [docs/status.md](docs/status.md) (was citing "Layers 5-11") and [docs/web-demo-plan.md](docs/web-demo-plan.md) ("Layer 9 contract test"); softened the one CLAUDE.md cross-reference. Left untouched by design: the SRD audit's own internally-consistent "Layer 1-4" scheme ([docs/srd-5.2.1-audit-classes.md](docs/srd-5.2.1-audit-classes.md), a different domain) and the frozen CHANGELOG archives (historical record). Verified the de-numbered `describe` labels carry no snapshot keys (only `tests/coverage/features.test.ts` uses snapshots, and only its comment changed) and the affected tests pass. No code/content/public-surface change.

**Docs (slice 440): document the PR-based dev -> main integration as standard**

Adopted a pull-request integration flow for `dev` -> `main` (replacing the local `git merge` that shipped a broken doc link straight to a red `main` in the slice-438 episode). Updated DEVELOPMENT.md: the "Branches" / "Working flow" now states that `main` is integrated only through a CI-gated PR (`gh pr create --base main --head dev`, merge when green), the branch-from rules note `dev` is the sole branch that integrates into `main` (via PR), and the "Cutting a release" step 7 ships through the PR before tagging on the merged `main`. The git-safety rule is unchanged: the PR process changes *how* `dev` integrates into `main`, not the rule that a human authorizes the push / PR / merge. Doc-only.

**Infra (slice 439): doc-links audit now catches case-only link mismatches**

The third and last of the "passes on a dev Mac, fails on Linux CI / GitHub" link classes (after empty hrefs in slice 437 and repo-escaping links in slice 438). macOS resolves `[x](docs/Status.md)` against the real `docs/status.md` (case-insensitive filesystem), so a wrong-case link passed the audit locally but would 404 on case-sensitive Linux CI and on GitHub. [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) now resolves each within-repo link by walking its path segments and requiring an exact-case match at each level (replacing the case-insensitive `existsSync`); on a mismatch it reports the correct casing (e.g. "case mismatch: should be docs/status.md"). Also dropped a stale unused `statSync` import. Verified it catches both wrong-case directory and wrong-case file segments and still passes clean. No code/content change.

**Fix (slice 438): CI doc-links failure - repo-escaping link in CLAUDE.md**

The doc-links audit failed in CI (but not locally): the project CLAUDE.md linked the global house-style file as `[~/.claude/CLAUDE.md](../../../.claude/CLAUDE.md)`, a path that resolves *above* the repo root. It passed on the dev machine (whose home dir has `~/.claude/CLAUDE.md` at exactly that relative position) but 404s in CI and on GitHub, neither of which can escape the repo. Two fixes: (1) the global config isn't a repo file, so it's now referenced as plain `~/.claude/CLAUDE.md` code text rather than a dead link; (2) hardened [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) to flag any link resolving above the repo root as broken, deterministically, so a non-portable link can no longer pass locally and fail in CI. Verified the audit catches an injected repo-escaping link and still passes clean. No code/content change.

**Docs (slice 437): make the CHANGELOG sustainable - live file holds only the active cycle**

The live CHANGELOG kept hovering at 57-59 KB despite repeated "splits" because the splits only moved per-slice *detail* to cohort archives while eight frozen release narratives (alpha.6-13, ~84% of the bytes) plus a 33-entry archive index stayed inline forever; each split reclaimed detail but added a pointer, so the floor never dropped. Restructured to an active-cycle-only invariant: the live CHANGELOG now holds only `## Unreleased` + the latest tagged release + a compact "Older releases" pointer (58.9 KB -> 9.5 KB). Evicted the alpha.6-13 release narratives to [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md) and moved the global per-cohort archive index to [docs/changelog/README.md](docs/changelog/README.md), both link-re-rooted and under the ceiling. Codified the rule in CLAUDE.md "Doc size discipline" (on every release, evict the previously-latest release narrative + its cohort pointers; released narratives split by version range as they grow) and added the eviction step to the DEVELOPMENT.md "Cutting a release" checklist. The bulk re-rooting surfaced (and the slice fixed) a blind spot in [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts): its link regex required a non-empty href, so an empty `[text]()` link (which renders dead on GitHub, and which the re-rooting briefly produced) slipped through; hardened it to flag empty hrefs. Test-only audit change otherwise; doc-links + doc-size green.


## Older releases

Tagged release `0.1.0-alpha.14` lives in [docs/changelog/released-versions-alpha-14.md](docs/changelog/released-versions-alpha-14.md); `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
