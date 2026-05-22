# Released versions archive (pre-rename, npm-takedown-affected)

Released versions of the pre-rename `ttrpg-engine-dnd` package (alpha.0 through alpha.5). These versions were unpublished from npm in May 2026 on IP-cleanup grounds; the package has since been renamed to `dnd-srd-engine` (slice 247) and is no longer distributed via npm.

Moved here from [../../CHANGELOG.md](../../CHANGELOG.md) in slice 248 to keep the live changelog under the single-Read ceiling.

---

## 0.1.0-alpha.5 - 2026-05-14

The fifth pre-alpha. Headlined by a 48-probe RAW-compliance audit at [tests/audit/raw-compliance.test.ts](../../tests/audit/raw-compliance.test.ts) and the engine fixes that close every probe (0 failing, 0 skipped), plus a Tier 3 content-stub sweep that took the class-features matrix from 36 wired / 12 stub to **48 wired / 0 stub** at L1–7. The pre-release closes with a Claude-optimization documentation pass + a bug-hunting test sweep (boundary sweeps, multi-class property generator, random spell-cast sequences, content-pack validator fuzzing). Test count grew from 698 to 1009 (311 new tests across 32 new files), all on top of the unchanged architectural invariants. `SCHEMA_VERSION` unchanged: new event shapes (`OpportunityAvailable`, `WeaponLoaded`, `RecklessAttackActivated`, `StunningStrikeAttempted`) and new optional fields (`sourceCharacterId` on conditions, `attackerHasAllyAdjacentToTarget` on `AttackRolled`, `loadedWeaponsFiredThisTurn` + `recklessAttackActive` + `stunningStrikeUsedThisTurn` on combatant turn usage) are all additive; `DerivedCharacter.knownLanguages` and the new `ExpandCritRange` / `GrantHalfProficiencyBonusFloor` / `BoostHealing` / `GrantEvasion` effect primitives are additive.

### Tier 3 content stubs

- **Druidic language wired.** Druid L1 Druidic now emits `GrantProficiency { target: 'language', id: 'druidic' }` instead of an empty `effects: []`. New `computeKnownLanguages` derivation combines species + background `languages[]` with any `GrantProficiency target: 'language'` effects from the active effect stack, returning a sorted deduplicated list. Surfaced on `DerivedCharacter.knownLanguages` and exported from the public barrel.
- **Improved Critical wired (Champion L3).** Champion Fighter L3 Improved Critical now emits a new `ExpandCritRange { threshold: 19 }` effect primitive. The accumulator tracks the lowest threshold (default 20; multiple sources stack down), and `resolveAttack` uses it for crit detection. RAW behavior preserved: a nat 20 still auto-hits, and a crit only counts on a hit (a 19 that misses AC is just a miss).
- **Slow Fall wired (Monk L4).** A new `useSlowFall?: boolean` flag on `FallingIntent` opts the actor into spending their reaction. `planFalling` reduces the raw falling damage by `5 × monk level` before mitigation; in an active encounter it also emits `ActionEconomyConsumed { kind: 'reaction' }`. Rejects when the actor isn't a Monk L4+ or has already used their reaction this round.
- **Martial Arts die scaling wired (Monk L1/5/11/17).** Monk L1 Martial Arts now scales the unarmed strike damage die (1d6 at L1, 1d8 at L5, 1d10 at L11, 1d12 at L17). A new `unarmed-strike` simple-melee weapon ships in the starter pack (1d4 bludgeoning, `light`); when a Monk wields it, both `resolveAttack` and `planOffHandAttack` substitute the Martial Arts die when larger than the weapon's natural die. Dexterous Attacks ability swap and the bonus-action unarmed-strike mechanic remain consumer-driven.
- **Jack of All Trades wired (Bard L2).** New `GrantHalfProficiencyBonusFloor` effect primitive. `computeAbilityCheck` now tracks whether any explicit proficiency contribution applied; if not, adds `floor(profBonus / 2)` (source: `jack-of-all-trades`). Does not stack on proficient / expertise checks. Applies to ability checks, not saves.
- **Sacred Weapon wired (Oath of Devotion L3).** New `engine.plan.sacredWeapon({ paladinId })` planner spends one Channel Divinity charge, emits `ResourceSpent` + `ConditionApplied` (`sacred-weapon-active`, +3 attack bonus) + `ActionEconomyConsumed { kind: 'bonusAction' }` (only on the paladin's own turn). The `+3` is a static placeholder representing a typical Paladin CHA mod — `AddModifier` doesn't yet evaluate Formula values. Paladin L3 also now grants the `channel-divinity` resource (2 uses, short-rest recharge).
- **Disciple of Life wired (Life Cleric L3).** New `BoostHealing { flat, perSpellLevel }` primitive. `planHealMechanic` builds the caster's effect stack and adds `flat + perSpellLevel * slotLevel` HP to each target when the spell is level 1+ (cantrips excluded). Wired as `{ flat: 2, perSpellLevel: 1 }`.
- **Reckless Attack wired (Barbarian L2).** New `engine.plan.recklessAttack({ combatantId })` planner enforces "once per turn before first attack" and emits a `RecklessAttackActivated` event whose reducer flips `turnUsage.recklessAttackActive`. `resolveAttack` reads the flag two ways: the attacker's melee STR attacks gain advantage, and any attack against the reckless combatant grants advantage. Flag clears on the actor's next `TurnStarted`.
- **Stunning Strike wired (Monk L5).** New `engine.plan.stunningStrike({ monkId, targetId })` spends 1 ki, rolls a target CON save vs DC `8 + WIS + prof`, and applies the `stunned` condition on failure. Once-per-turn enforced via a new `turnUsage.stunningStrikeUsedThisTurn` flag (cleared at `TurnStarted`). New `StunningStrikeAttempted` event records activation; the save itself is a regular `SaveRolled`.
- **Frenzy wired (Path of the Berserker L3).** Minimal wire: `engine.plan.frenzy({ combatantId })` consumes one Rage charge and applies the new `frenzied` content condition (+2 damage placeholder). The full Rage mechanic (damage resistance, bonus-action attack grant, end-of-rage exhaustion) is consumer-driven until Rage gets its own planner slice.
- **Evasion wired (Rogue L7, Monk L7).** New `GrantEvasion` primitive. `planCastSpell`'s save-mechanic path reads the target's effect stack: when Evasion is present + the save is DEX + the spell halves on success, the formula flips to (success → 0 damage, fail → half). Rogue L7 gains a new `evasion-rogue` content entry alongside Sneak Attack scaling.
- **Cutting Words wired (College of Lore L3).** New `engine.plan.cuttingWords({ bardId, originalRollTotal, threshold })` rolls the bard's Bardic Inspiration die (d6/d8/d10/d12 by tier), spends one BI charge, and returns `{ events, dieRoll, preventedHit }`. Same consumer-adjudicated shape as `planShield`. Enforces reaction-once-per-round in active encounters.
- **Metamagic wired (Sorcerer L2).** New `engine.plan.metamagic({ sorcererId, option })` validates sorcery-points balance and spends the right cost per option (1 for most, 2 for Quickened, 3 for Heightened, per RAW 2024). The actual mechanical effect on the spell being cast is consumer-driven for now — this slice wires the sorcery-point economy so the resource is no longer inert.
- **Fighting Style choice wired.** Fighter L1, Paladin L2, and Ranger L2 now ship an `OfferChoice` effect with their respective Fighting Style options. Starter-pack feats `fighting-style-archery` / `defense` / `dueling` gain real `AddModifier` effects (unconditional approximations, since the predicate DSL can't yet express "while wielding a ranged weapon" or "while wearing armor"). Great Weapon Fighting / Protection / Two-Weapon Fighting remain effects-empty placeholders.
- **Feral Instinct wired (Barbarian L7).** Emits `SetAdvantage { on: 'initiative', mode: 'advantage' }`. `planRollInitiative` now consults the actor's effect stack and rolls 2 d20s for advantage / 1 for disadvantage / 1 otherwise.
- **Deft Explorer wired (Ranger L2).** Emits an `OfferChoice` for skill expertise (5 options: Perception, Stealth, Survival, Nature, Animal Handling). `planLevelUp` emits the matching `ChoiceRequired`; resolving it grants expertise via `GrantProficiency target:'skill' level:'expertise'`.
- **Wild Companion wired (Druid L2).** New `engine.plan.wildCompanion({ druidId })` planner expends one Wild Shape charge in lieu of transformation. The familiar itself isn't a first-class entity yet; this slice wires the resource-spend side.

Class-features matrix: 36 wired / 12 stub → **48 wired / 0 stub** at L1–7. Subclass matrix flips on Improved Critical, Sacred Weapon, Disciple of Life, Cutting Words, Frenzy.

### Fixed (RAW closures)

- **Action-blocking conditions reject actions.** Incapacitated / Stunned / Paralyzed / Petrified / Unconscious actors, and any combatant at HP 0, can no longer attack / cast / dash / dodge / move. Threaded through every planner via a new `assertActorCanAct` helper.
- **Move-into-occupied-space rejection.** `planMove` scans the active encounter and rejects a destination that matches another combatant's position. Previously two combatants could share a square.
- **Opportunity attacks.** `planMove` now emits one `OpportunityAvailable` per eligible reactor (in-reach, has reaction, not the mover). `planOpportunityAttack` consumes the reaction; cap enforced via `reactionUsedThisRound`. The web demo surfaces an OA queue with Take / Pass per offer, auto-pruned when preconditions lapse.
- **Prone stand-up costs half speed.** `planMove` debits half the actor's speed (rounded down) when standing from prone.
- **Ranged-in-melee disadvantage.** Ranged attacks while a hostile combatant is adjacent to the attacker now resolve with disadvantage.
- **Concentration auto-clears at HP 0.** A downed concentrator's effect is cleared in the same commit as the damage; the redundant invariant in `applyConcentrationBroken` was removed and the helper `clearConcentrationEffect` tolerates a dangling pointer.
- **Spell casts consume the action.** `planCastSpell` now emits `ActionEconomyConsumed` based on the spell's parsed `castingTime` (action / bonus action / reaction / long-cast).
- **Frightened / Charmed track their source.** New `sourceCharacterId` on `AppliedCondition` and `ConditionApplied`. Frightened rejects moves *closer* to the source; Charmed rejects attacks *against* the source.
- **Heavy-weapon Small disadvantage.** A Small attacker with a Heavy weapon attacks with disadvantage.
- **Sneak Attack: ally-adjacent qualifier.** `AttackRolled` carries `attackerHasAllyAdjacentToTarget`; the starter-pack Sneak Attack predicate triggers on advantage OR (used !== disadvantage AND ally-adjacent).
- **Loading property on ranged weapons.** A loaded weapon (light crossbow, heavy crossbow, hand crossbow, longbow) can fire once per turn; `WeaponLoaded` records the consumption and resets at turn start.
- **Difficult terrain doubles movement cost.** `planMove` walks the path via Bresenham cells, summing per-cell `movementCostAt`. Diagonal-through-difficult costs the right amount.
- **`planEquip` rejects illegal equip combinations.** Two-handed weapon in mainHand while a shield is equipped (and vice versa) is now rejected before the `ItemEquipped` event fires.

### Added

- **Rules Lab in the web demo.** 19 showcase probes grouped by category; one-click "Run audit" runs them against a fresh engine + scenario and reports pass / fail per row. Source: [web/audit/probes.ts](../../web/audit/probes.ts), [web/modes/rules-lab.ts](../../web/modes/rules-lab.ts).
- **Scenario gallery in the web demo.** Frightened Halfling (source-tracked movement restriction), Misty Step Occupied (occupancy-check rejection), Concentrating Wizard at 1 HP (concentration auto-clear on drop), in addition to the original Goblin Skirmish. URL hash includes `#scenario=<id>&seed=<n>`. Source: [web/scenarios/](../../web/scenarios). CI replay test at [tests/integration/web-scenarios.test.ts](../../tests/integration/web-scenarios.test.ts) covers headline actions per scenario.
- **Map panel in the web demo.** A small grid view between Combat Sandbox and Event Inspector showing each combatant token at their position with initials and color; auto-fits the actor bounds. Source: [web/modes/grid-view.ts](../../web/modes/grid-view.ts).
- **Trustworthiness roadmap at [docs/trustworthiness-roadmap.md](../../docs/trustworthiness-roadmap.md)** framing the four-tier path from alpha to "trustworthy for unsupervised tabletop play": Tier 1 close audit, Tier 2 extend audit, Tier 3 content stubs, Tier 4 real SRD pack.

### Changed

- **README cleanup** (1cd20dc): collapsed 70+ lines of in-line "✓ Closed in 2026-05-14 sweep" retrospective in the Engine gaps section into a one-line summary referencing the audit file. Test counts refreshed to 763 / 118.

### Documentation

- **CLAUDE.md source map.** New section that lists where each kind of file lives (events, reducers, planners, derivations, content packs, handlers, test categories). Predicts the answer to "where do new things go" without an `ls`.
- **CLAUDE.md planner shape.** New subsection codifying the skeleton extracted from [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) (large, RNG + triggers) and [src/engine/plan/sacred-weapon.ts](../../src/engine/plan/sacred-weapon.ts) (small, no RNG) so new planners pattern-match.
- **[docs/slice-template.md](../../docs/slice-template.md).** Breaks the slice workflow into three shape-specific checklists: new planner, new content, new derivation. Each carries a file checklist + order of operations + gotchas.

### Tests

The bug-hunting sweep added 165 tests across 4 files. The headline finding: zero engine bugs surfaced — every invariant the new tests check holds across random samples and exhaustive table walks. The tests are now permanent safety nets.

- **Boundary sweep over canonical PHB 2024 tables** ([tests/boundaries/tabulated-math.test.ts](../../tests/boundaries/tabulated-math.test.ts)). 153 exhaustive assertions: ability modifier for every score 1-30, proficiency bonus for every level 1-20, full-caster + half-caster + pact spell-slot tables, carrying capacity for every STR 1-30, exhaustion d20 penalty for every level 0-6, plus out-of-range rejection paths. Targets off-by-one bugs that random property-test sampling hits only in expectation.
- **Multi-class character property generator** ([tests/property/generators.ts](../../tests/property/generators.ts), [tests/property/multiclass.test.ts](../../tests/property/multiclass.test.ts)). New `multiclassCharacterArb` produces 2-3-class characters meeting 2024 PHB multiclass prerequisites; 10 invariants run at 1000 iterations each cover total-level bounds, distinct classes, proficiency-bonus from total level, slot-count non-negativity + max-vs-available, fighter-leakage protection, pact-warlock isolation, warlock-non-caster mix, and the wizard+paladin ceil-half rule.
- **Random spell-cast sequence invariants** ([tests/property/spell-cast-sequence.test.ts](../../tests/property/spell-cast-sequence.test.ts)). Single property running 1000 random sequences (5-20 casts each) against a fixed wizard + cleric + two dummies, drawing from a curated pool of 16 fully-wired starter-pack spells. Asserts slot accounting (`SpellSlotConsumed` events match final `spellSlotsUsed`), concentration field consistency, and replay equivalence at sequence end.
- **Content-pack validator path-reporting fuzz** ([tests/property/content-pack-validator.test.ts](../../tests/property/content-pack-validator.test.ts)). 200 random mutations against the starter-pack JSON (replace-with-wrong-type / replace-with-array / delete-key); asserts that when Zod rejects, the reported issue path overlaps the mutated location so content-pack authors can navigate to the problem.

## 0.1.0-alpha.4

The fourth pre-alpha. Closes two engine bugs that the new browser demo surfaced (Dodge → Attack guard and weapon range enforcement), broadens the public type surface with 15 event-type re-exports, and ships a deployable web demo as a second adoption surface alongside the CLI examples.

Test count grew from 691 to 698 (7 new tests: 2 engine regressions for the new guards, 3 web-demo replay-equivalence assertions, 2 melee-range tests). All Layer 5/6/7/8/9 invariants still hold. `SCHEMA_VERSION` unchanged (no event or state shape changes).

The web demo lives under `/web/` and is not shipped in the npm tarball (excluded by the `files` whitelist); it's a separate adoption surface deployed via GitHub Pages from a CI workflow. See [web/README.md](../../web/README.md) and [docs/web-demo-plan.md](../../docs/web-demo-plan.md).

### Fixed

- **`engine.plan.attack` now rejects when the action has already been spent on Dodge / Dash / Disengage / Cast Spell.** Previously the attack planner only checked the per-attack swing budget (`attacksMadeThisTurn < maxAttacksPerAction`); it did not check `turnUsage.actionUsed`. As a result a combatant could Dodge (consuming their action) and then Attack on the same turn. The fix adds an "action already used by a non-attack ability" guard, detected via `actionUsed && attacksMadeThisTurn === 0` so Extra Attack's second swing (which legitimately runs with `actionUsed: true, attacksMadeThisTurn: 1`) continues to work. Regression test in [tests/unit/engine/plan-attack.test.ts](../../tests/unit/engine/plan-attack.test.ts).
- **`engine.plan.attack` now enforces weapon range against combatant positions.** Previously the attack planner ignored positions entirely, so a longsword could swing at a target 30 ft away as if they were adjacent. The fix consults the active encounter's combatant positions and the weapon's `attackKind` / `properties` / `rangeNormal` / `rangeLong`: melee weapons require Chebyshev distance ≤ 5 ft (10 ft with the `reach` property), ranged weapons require ≤ long range. RAW disadvantage in the (normal, long] band is deferred to a follow-up; this fix only rejects the physically impossible. Unpositioned combatants are exempt (preserves existing un-positioned fixtures). Regression tests in [tests/unit/engine/plan-attack.test.ts](../../tests/unit/engine/plan-attack.test.ts).

### Added

- Type re-exports for the encounter / inventory / combat event types that were previously only available as schemas: `EncounterCreatedEvent`, `EncounterStartedEvent`, `EncounterEndedEvent`, `InitiativeRolledEvent`, `TurnStartedEvent`, `TurnEndedEvent`, `RoundEndedEvent`, `CombatantMovedEvent`, `ItemAcquiredEvent`, `ItemEquippedEvent`, `ItemUnequippedEvent`, `AttackRolledEvent`, `DamageRolledEvent`, `SaveRolledEvent`, `AbilityCheckRolledEvent`. Source: [src/types/index.ts](../../src/types/index.ts). Schema exports were already in place; this just closes the type-only gap so consumers can `satisfies XEvent` without reaching into deep paths.
- Web demo at [web/](../../web), deployed to GitHub Pages via [.github/workflows/deploy-demo.yml](../../.github/workflows/deploy-demo.yml). Combat Sandbox (turn-aware action toolbar: Attack / Move / Dash / Dodge / End Turn, with downed-combatant fallback to just End Turn), Event Inspector (virtualized list with category color-coding, auto-scrolls to tail when followed), Export/Import event log with on-page replay verification, generic PendingChoice resolver (shipped dead in v1 by design — the v1 planner set doesn't emit `ChoiceRequired`, but the resolver is in place for future modes), and a `#seed=N` URL hash override for deterministic-reproduction sharing. CI integration test at [tests/integration/web-scenarios.test.ts](../../tests/integration/web-scenarios.test.ts) asserts replay equivalence against every shipped demo scenario.

## 0.1.0-alpha.3

The third pre-alpha. Closes the engine-gap punch-list down to two ⚪ items (sanity and mass-combat variant rules, each its own slice), ships all three remaining layers of the testing standard (Layer 7 property tests with `fast-check`, Layer 8 feature-coverage matrix, Layer 9 public-API contract test), authors the first subclass content (12 of ~50, one per class at L3), wires five more class features at L1-5 (Barbarian Unarmored Defense + Danger Sense, Sorcerer Sorcerous Restoration, Paladin Lay on Hands, Wizard Arcane Recovery), wires the Bard's L3 Expertise + L5 Font of Inspiration, and lands a new `planDodge` plus an `ImposeDisadvantageOnAttackers` effect primitive so the Dodge action actually defends.

Test count grew from 563 to 691 (128 new tests across 22 new files); all replay-equivalence, RNG-capture, and contract invariants still hold. Build now emits a separate `dist/starter-pack.{js,cjs,d.ts}` chunk so browser consumers can code-split the starter content off the main bundle (`import('dnd-srd-engine/starter-pack')`).

### Added

- **`hp-pool-knockout` spell mechanic** — new `SpellMechanic` kind for Sleep-style spells. Rolls a dice pool (`poolDice`, optional `extraPoolDicePerSlotLevel`), walks targets in ascending current-HP order, and applies the configured condition until the pool runs out. Targets already carrying the condition are skipped. Sleep is now fully wired (5d8 base, +2d8 per slot above 1st, applies `unconscious`).
- **`engine.plan.shield`** — reactive +5 AC planner. Takes the triggering attack's d20 total and the original AC; emits `ActionEconomyConsumed(reaction)`, `SpellSlotConsumed`, `ConditionApplied('shielded')`, and a new `ShieldCast` event with `preventedHit: boolean`. The new `shielded` condition grants +5 AC via `AddModifier`. Magic Missile damage immunity is not yet modeled (would need per-spell immunity primitive).
- **`engine.plan.mistyStep`** — dedicated bonus-action teleport planner. Validates spell knowledge, slot, bonus-action availability, and 30-ft Chebyshev range; emits `SpellCastDeclared`, `SpellSlotConsumed(2+)`, `ActionEconomyConsumed(bonusAction)`, and `CombatantMoved(feetTraveled: 0)`.
- **`engine.plan.expireSpellDurations`** — emits `ConcentrationBroken(reason='durationEnded')` events for every active effect whose listed duration has elapsed by the current in-game clock. New `parseSpellDurationMinutes` parses common 2024 duration phrasings. `EffectInstance` gains `durationMinutes` / `startedAtMinutes`; `ConcentrationStarted` carries `durationMinutes` which the reducer pairs with the in-game clock.
- **`DerivedCharacter.hpMaxBonus` / `effectiveHpMax`** — character-view derivation now surfaces the sum of `AddModifier{target:'hpMax'}` effects. Aid adds a new `aid-buffed` condition that grants +5 hpMax. Reducer-side massive-damage threshold still compares against the stored `hp.max` (full enforcement is a larger refactor).
- **`engine.plan.consumeGuidance`** — rolls the Guidance d4 for the target, removes the `guided` condition, and ends the caster's concentration (`reason='used'`). Pairs with a new `GuidanceUsed` event and a new `'guided'` condition (no static effects; the d4 is rolled at consume time so the player can choose when to apply it).
- **`engine.plan.cleave`** — companion to a successful melee hit with a Cleave-mastery weapon. Rolls a follow-up attack against a second target, strips the attacker's positive ability modifier from damage per RAW, and marks `mastery:cleave` as fired this turn (re-invocation in the same turn throws).
- **Nick mastery in `engine.plan.offHandAttack`** — when the off-hand weapon has Nick, the planner emits `TriggerFired('mastery:nick')` instead of `ActionEconomyConsumed('bonusAction')` once per turn.
- **Flex mastery in `engine.plan.attack`** — versatile weapons with Flex mastery wielded two-handed (off-hand empty) roll the larger `versatileDice` at attack time.
- **`engine.plan.tickAura`** + `aura-damage` `SpellMechanic` — concentration auras like Spirit Guardians register at cast time (only `ConcentrationStarted` fires) and the consumer calls `tickAura({ casterId, targetIds })` per turn for the affected creatures. Each tick rolls a save and applies damage independently per target.
- **`engine.plan.polymorph`** — full RAW validation: caster knowledge, 4th+ slot, target's level caps the form CR, optional WIS save for unwilling targets (the slot is still spent on a successful save), breaks the caster's prior concentration before starting the new one. Returns `{ events, resisted }`.
- **`engine.plan.wildShape`** — druid bonus-action transform. Validates druid level ≥ 2, available `wild-shape` resource pool, form CR cap by level (1/4 / 1/2 / 1 at L2 / L4 / L8), and flying-speed gating until L8. Emits `ActionEconomyConsumed('bonusAction')` (when in an encounter), `ResourceSpent('wild-shape', 1)`, and `PolymorphApplied(kind='wild-shape')`.
- **Events / enums**: `ShieldCastEvent`, `GuidanceUsedEvent`, new `ConcentrationBrokenReason` values `'unconscious'` and `'used'`, new `SpellMechanic` kinds `aura-damage` and `hp-pool-knockout`, new `EffectInstance` fields `slotLevel` / `durationMinutes` / `startedAtMinutes`, new `ConcentrationStartedEvent.slotLevel` (so planners that need the upcast level at tick time can read it off the instance).
- **`engine.plan.forcedMarch`** — RAW 2024 ch.4 forced-march CON-save loop. For each hour past 8, every traveler makes a Constitution save at climbing DC (10 + 1 per hour past 8); failures gain a level of exhaustion. Travelers already at exhaustion max are skipped.
- **`engine.plan.simulacrum`** — RAW 2024 7th-level illusion. Validates caster knowledge, slot, materials (1500 gp ruby dust via `materialsConsumed` flag), and the "one Simulacrum per source creature" constraint. Returns `{ events, simulacrumId }` so consumers can wire UI to the new creature pre-commit.
- **`engine.plan.wish`** — RAW 2024 9th-level conjuration. Eight predefined effects bypass the stress cascade; anything else rolls a d100 and applies exhaustion on a result of 33 or lower. Returns `{ events, stressApplied }`.
- **`hp.maxBonus`** field on Character + `Character.appliedConditions[].hpMaxBonusDelta` stamping. The damage reducer's massive-damage threshold now compares against `hp.max + hp.maxBonus`, so an Aid-buffed character (effective max 17 instead of 12) doesn't die instantly to a 12-damage hit when at -4 HP. The buff planner sets the delta on `ConditionAppliedEvent.hpMaxBonusDelta`; the reducer copies it into the applied-condition entry and bumps `hp.maxBonus`. Removal (ConditionRemoved, ConcentrationBroken, LongRestStarted concentration-clearing) reads the stored delta and reverses it.
- **Property tests with `fast-check`** (Layer 7 of the testing standard in [CLAUDE.md](../../CLAUDE.md)). 16 properties across three files (`tests/property/derivations.test.ts`, `tests/property/reducers.test.ts`, `tests/property/plan.test.ts`), each run at 1000 iterations by default (override with `FAST_CHECK_NUM_RUNS=10000` for local fuzz). Properties: derivations never throw / AC ≥ 1 / `effectiveHpMax === hp.max + hp.maxBonus` for any character; reducer output is `CampaignStateSchema`-valid after any random event sequence; replay equivalence under fuzzing; `hp.current ≤ effective max` and `exhaustion ∈ [0, 6]` always; same seed → byte-equivalent dice payloads. Shared generators in `tests/property/generators.ts`. Followed by a richer stateful combat-sequence test (6 more properties, 60-turn random fights between fragile fighters).
- **12 subclasses (one per class, L3 entry)** — Path of the Berserker (Barbarian), College of Lore (Bard), Life Domain (Cleric), Circle of the Land (Druid), Champion (Fighter), Warrior of the Open Hand (Monk), Oath of Devotion (Paladin), Hunter (Ranger), Thief (Rogue), Draconic Sorcery (Sorcerer), Fiend Patron (Warlock), Evoker (Wizard). Each ships with its L3 feature entries; the ones that map cleanly to existing effect primitives are wired (College of Lore's bonus skill proficiencies, Champion's Remarkable Athlete walking-speed bump, Thief's Second-Story Work climb speed, Draconic Sorcerer's Resilience AC override, Life Domain's heavy-armor proficiency). The features blocked by engine work not yet done (Improved Critical's crit-on-19, Disciple of Life's heal-rider, Sacred Weapon, Frenzy, Sculpt Spells, Open Hand Technique, Cutting Words, Hunter's Prey, Dark One's Blessing, etc.) ship as `effects: []` stubs and are flagged in the feature-coverage matrix. PCs can now select a subclass at L3 and the engine reads it correctly through `effect-stack.ts`; six new tests in `tests/unit/content/subclasses.test.ts` smoke each subclass and exercise two of the wired features (Draconic AC = 13 + DEX-mod, College of Lore's proficiency count).
- **Class features L1-5 fill-in** — five more class features wired against existing primitives:
  - **Barbarian Unarmored Defense (L1)**: `OverrideACFormula` with DEX + CON. A no-armor Barbarian now derives AC 10 + DEX-mod + CON-mod automatically.
  - **Barbarian Danger Sense (L2)**: `SetAdvantage` on DEX saves.
  - **Sorcerer Sorcerous Restoration (L5)**: `RecoverResource` of `sorcery-points` on short rest (4 points back per RAW).
  - **Paladin Lay on Hands (L1, new entry)**: `GrantResource` of `lay-on-hands` with formula `level × 5` (renewable on long rest).
  - **Wizard Arcane Recovery (L1, new entry)**: `GrantResource` of `arcane-recovery-points` with formula `ceil(wizard-level × 0.5)` (recovered on long rest; consumer spends the budget on slot recovery).
  Five smoke tests in `tests/unit/content/class-features-l1-5.test.ts` build PCs at the relevant levels and assert derivations land. Class-features-matrix split: 29 → 34 wired, 17 → 14 stub, 46 → 48 total at the content layer.
- **Two more Bard class features wired** — Expertise (L3) grants `expertise` proficiency on Insight + Persuasion (fixed picks; OfferChoice-driven selection waits on a richer choice-resolution path). Font of Inspiration (L5) adds a `RecoverResource('bardic-inspiration', 'all', on short rest)` so the Bard's inspiration pool refreshes on short rest at L5+ per RAW 2024. Class-features-matrix split: 34 → 36 wired, 14 → 12 stub. Two smoke tests added: one verifies the effect-stack reports `expertise` on the chosen skills and not on others; one is a derivation completion check for the L5 Bard. Ranger Fighting Style (L2) attempted but reverted to stub — Archery's "+2 to ranged attacks" needs a conditional predicate the derivation evaluator doesn't yet populate facts for.
- **`engine.plan.dodge`** — RAW 2024 Dodge action. Emits `ActionEconomyConsumed('action')` + `ConditionApplied('dodged')`. The new `dodged` condition carries two effects: a new `ImposeDisadvantageOnAttackers` primitive (mirror of `GrantAdvantageToAttackers`) and `SetAdvantage` on DEX saves. The attack planner now consults both the target's `grantsAdvantageToAttackers()` and `imposesDisadvantageOnAttackers()` and applies the 2024 advantage/disadvantage cancellation matrix: if a target both grants advantage and imposes disadvantage (e.g. Restrained + Dodged), the two cancel and the attack rolls with neither — matching RAW. Four smoke tests in `tests/unit/engine/plan-dodge.test.ts` cover the happy path, the disadvantage stack check, the not-active-combatant rejection, and the already-used-action rejection.
- **Subpath export for the starter pack** — `import { loadStarterPack } from 'dnd-srd-engine/starter-pack'` is now a real subpath. The Vite library config builds two entries (`src/index.ts` + `src/starter-pack.ts`) so the starter content JSON lands in its own chunk (~127 KB / 16 KB gzipped) separate from the main engine bundle (~208 KB / 47 KB gzipped). Browser consumers (the planned web demo, app dev servers) can `await import('dnd-srd-engine/starter-pack')` only when they need the content, keeping the initial JS payload smaller.
- **Feature-coverage matrix** (Layer 8 of the testing standard in [CLAUDE.md](../../CLAUDE.md)). New `tests/coverage/features.test.ts` enumerates every notable 5.5e feature in the starter pack — 46 class features across 12 classes, all 9 weapon masteries, all 22 conditions, 30 feats by category (origin / general / fighting-style / epic-boon), every magic item with effects / charges — and snapshots each entry's wire status. `wired` means effects[] is populated and the engine derivations read them; `stub` means content has an entry but no effects yet (typically because expressing the feature needs engine work not yet done — Stunning Strike trigger, Reckless Attack timing, etc.). Current split: 29 wired class features / 17 stub. Asserts hard floors too (all six 2024 Fighting Styles ship; PHB's 15 canonical conditions all present; Rogue Sneak Attack scales at every odd level; every PHB-2024 mastery has at least one weapon in the pack). Doubles as the data-vs-code audit the standard names.
- **Public API contract test** (Layer 9). `tests/contract/exports.test.ts` snapshots the alphabetized list of runtime exports plus a parsed list of every source-level export from the barrel (catches type-only export changes the runtime view misses). `tests/contract/types.test.ts` uses Vitest's built-in `expectTypeOf` to lock the load-bearing signatures: `createEngine`, `Engine.apply` / `applyAll` / `replay`, `Engine.commit` / `undo` / `redo`, every `Engine.plan.*` return type (PlanResult vs ShieldOutcome / PolymorphOutcome / SimulacrumOutcome / WishOutcome / ConsumeGuidanceOutcome / SpendHeroPointOutcome), plan-intent `type` discriminants, branded-ID nominal typing, the `Event` discriminated union's known members, and `serializeCampaign`/`loadCampaign`'s `Campaign ↔ string` round-trip. Writing the test surfaced a real consistency gap and fixed it: the recent additions (`CleaveIntent`, `ShieldIntent` / `ShieldOutcome`, `PolymorphIntent` / `PolymorphOutcome`, `WildShapeIntent`, `SimulacrumIntent` / `SimulacrumOutcome`, `WishIntent` / `WishOutcome`, `ConsumeGuidanceIntent` / `ConsumeGuidanceOutcome`, `MistyStepIntent`, `ExpireSpellDurationsIntent`, `TickAuraIntent`, `ForcedMarchIntent`, `GrantInitialHeroPointsIntent`, `SpendHeroPointIntent` / `SpendHeroPointOutcome`, `CastSpellIntent`, `CheckConcentrationIntent`, `MoveIntent`, `DashIntent`, `DisengageIntent`) were reachable via `engine.plan.*` but their named types weren't re-exported from `src/index.ts`. Now they are.
- **`grittyRest` flag wired**: rest events carry `expectedDurationMinutes` (60/480 standard, 480/10080 gritty). The planner reads `state.settings.grittyRest` and stamps the right value.
- **`heroPoints` flag wired**: `Character.heroPoints` field, `HeroPointGranted` / `HeroPointSpent` events, `engine.plan.grantInitialHeroPoints` (5 + level − 1 per PC), `engine.plan.spendHeroPoint` (rolls a d6 the consumer adds to the augmented roll, decrements the pool).

### Fixed

- **Concentration ends on drop to 0 HP** (RAW 2024 PHB ch.7). All five damage-emitting planners (attack, falling, weapon-mastery, off-hand attack, cast-spell) now emit `ConcentrationBroken(reason='unconscious')` when damage drops a concentrating target to 0 HP. Magic Missile tracks per-target simulated HP so only the dart that actually drops the target emits the break.
- **Death save auto-roll at start of turn** (RAW 2024 PHB ch.1). `planAdvanceTurn` and `planBeginFirstTurn` emit `DeathSaveRolled` for any combatant whose turn starts while they're at 0 HP and not stable / not already at 3 failures. The reducer invariant for `DeathSaveRolled` was relaxed from `=== 0` to `<= 0` (the engine tracks overflow internally; rules-side anything ≤ 0 is "at 0 HP").

### Documentation

- **README "Known gaps"** updated as each gap closed — engine count 16 → 5, spell-coverage row updated, partial-status bullets reworded, Slice 41 roadmap entry rewritten.
- **docs/authoring-content-packs.md** SpellMechanic table now lists eight kinds (adds `hp-pool-knockout` and `aura-damage`).
- **docs/api-overview.md** planner lists updated with `mistyStep`, `shield`, `expireSpellDurations`, `consumeGuidance`, `cleave`, `tickAura`, `polymorph`, `wildShape`.

## 0.1.0-alpha.2 (2026-05-13)

Alpha refinement. A multi-round D&D-correctness audit surfaced a long list of bugs across the engine, the starter pack content, and the showcase; this release closes them. The README's status and roadmap sections are also rewritten to mark partial slices honestly instead of claiming uniform completeness.

### Added

- **Spell mechanic kinds**: `auto-hit` (Magic Missile-style spells with N darts, no save / no attack roll), `buff` (Bless / Mage Armor / Faerie Fire-style condition application with no save), `remove-condition` (Lesser Restoration-style targeted condition stripping).
- **Effect kind `GrantAdvantageToAttackers`** — when present on a character's effect stack, attacks against them have advantage. Used by Faerie Fire's condition and the Restrained status; the attack planner now consults the *target's* effect stack rather than only the attacker's.
- **`engine.plan.resurrect`** — new planner with proper validation: caster must know or prepare the spell, must have a slot of sufficient level, target must be at 0 HP. Supports `via: 'spell-slot' | 'scroll' | 'special'` so scroll consumption and special revivals can skip caster validation. Replaces consumer-side hand-emitted `CharacterResurrected` events.
- **`SaveRolled` / `AbilityCheckRolled` breakdown** — both events gain an optional `breakdown: Array<{source, value}>` field. The transcript formatter shows the breakdown when the flat bonus has two or more contributing sources, so a +0 save reads as "+2 CON-mod, -2 exhaustion" rather than an apparently missing modifier.
- **`Character.armorClass`** — optional natural-armor AC override. When set, `computeAC` uses it directly (effect modifiers still stack); used by creature statblocks and polymorph forms. Polymorph reducers copy `form.ac` into this field and the snapshot preserves the prior value for revert.
- **Heal mechanic `flatAmount`** — fixed-value heal supplement for spells like Aid (+5 per target).
- **`tests/unit/rules-truth.test.ts`** — ~58 short PHB 2024 assertions covering ability modifiers, proficiency bonus, single-class spell slots, AC under several armor scenarios, attack and save derivations, spell save DC and attack bonus, Sneak Attack dice at every odd Rogue level, and Blessed-condition propagation. Writing this surfaced the half/third caster slot bug.
- **`tests/unit/engine/spell-coverage.test.ts`** — per-shipped-spell smoke test. Each spell either has an explicit event-kind expectation or a `skip` with reason. Catches Magic-Missile-class bugs where a spell ships with no mechanical effect at all.
- **`Character.armorClass` + `CharacterResurrectedEvent.via`** event-shape fields propagated through schemas and reducers.

### Fixed

- **Fireball-class AoE damage rolled once** (PHB 2024 "Areas of Effect"). Previously `planSaveMechanic` rolled damage inside the per-target loop, so each target got an independent roll; now the dice roll once for the whole effect and each target's save determines full vs half.
- **Half / third-caster spell slots use round-up (RAW 2024)**. The previous engine used `floor(level/2)` (the 2014 multiclass rule); 2024 changed it to round-up and gave half-casters slots starting at level 1. Paladin 5 now correctly returns 4 first + 2 second slots (was 3 / 0). Eldritch Knight 4 returns 3 first-level slots (was 2).
- **Sneak Attack scales per Rogue level**. Starter pack previously shipped only the L1 entry (1d6); the class table now declares the feature at every odd level (1d6 -> 10d6 at L19), and the effect-stack dedupes class features by id so only the highest-level instance fires.
- **Creature natural-armor AC** honored via `Character.armorClass`. Ogre 11, Young Red Dragon 18, Goblin Scout 15, etc. Previously every creature defaulted to 10 + DEX.
- **Polymorph AC applies** in combat. Previously a polymorphed character kept their original AC; the form's AC is now copied onto the character.
- **Counterspell consumes the original caster's slot** (RAW 2024: the slot is still spent on a successful counter). `CounterspellIntent.originalSpellLevel` is now required.
- **Long rest ends concentration**. Sleep -> unconscious -> concentration breaks per RAW. The reducer also lifts conditions the broken effect had applied on other targets.
- **Many inert starter-pack spells now wired**: Magic Missile (5 darts at 3rd level), Bless (+2 to attack and all six saves via the new `blessed` condition), Bane (-2 via `baned`), Mage Armor (AC override via `mage-armored`), Faerie Fire (DEX save -> `faerie-fired` -> attackers get advantage), Aid (+5 HP flat heal per target), Web (DEX save -> `restrained`), Lesser Restoration (removes one of: blinded / deafened / paralyzed / poisoned), Polymorph (now in the content pack so slot consumption reads).
- **Dragon weapon dice**. The showcase dragon used a longsword stand-in for both bite and claws (1d8 slashing). Added `dragon-bite` (2d10 piercing) and `dragon-claw` (2d6 slashing) creature-statblock items.
- **Ogre weapon dice**. The "greatclub" in the showcase was secretly a greatsword (2d6 slashing). Added a proper PC `greatclub` (1d8 bludgeoning) and a creature `ogre-greatclub` (2d8 bludgeoning).
- **Restrained condition** gains `GrantAdvantageToAttackers` (the RAW status was missing the "attackers have advantage" leg).
- **Transcript formatter improvements**: damage events show source attribution; sized markdown headings with blank-line paragraph breaks so the rendered preview shows one action per line; creatures and NPCs no longer render as "fighter 1"; spell slots use ordinal labels; polymorph displays the caster.

### Documentation

- **README Status section** rewritten with a three-bucket split (fully wired / partially wired / known engine gaps), an honest 563-tests / 90-files count, and explicit notes on what alpha consumers can rely on versus author.
- **README Roadmap** uses a new ✓/◐/blank legend; every ◐ entry names what's missing. Phase C is "7 fully wired + 3 partial", Phase D is "6 + 1", Phase E is "2 + 7" with class L2+ features, subclasses, the full spell catalog, the DMG / MM catalogs, and variant-rule enforcement all flagged as content-layer gaps.
- **docs/getting-started.md** content-pack description updated to match the recalibrated story; points at the README Status section.

### Internal

- Stale `dnd-engine` references cleaned out of DEVELOPMENT.md, README.md, CLAUDE.md, and the bug-report issue template (the historical CHANGELOG note remains).

## 0.1.0-alpha.1 (2026-05-12)

Patch release. Documentation and attribution only; no API changes.

### Added

- `NOTICE` file with full CC BY 4.0 attribution for SRD 5.2-derived starter-pack content. Shipped in the npm tarball alongside `LICENSE`.
- `docs/content-attribution.md`: item-by-item audit of the starter content pack against SRD 5.2, flagging confidently-covered material, likely-covered items worth verifying for commercial use, and not-confirmed items (Bastions, Epic Boons).
- `ContentPack` schema extended with optional `license`, `attribution`, and `derivedFrom` metadata fields. The starter pack carries `license: "CC-BY-4.0"` and a full attribution string.
- npm package now also ships under name `dnd-srd-engine` (renamed from `dnd-engine` because the original name was an unpublished squat on npm). GitHub repo renamed to match.

### Changed

- `LICENSE` restructured to explain dual licensing: engine code MIT, starter content pack CC BY 4.0.
- README "Intellectual property" section rewritten to point at the new attribution surface; Documentation table gains a row for IP / attribution.

## 0.1.0-alpha.0 (2026-05-12)

First alpha. All six phases of the roadmap are complete except the optional `ttrpg-engine-core` extraction. Forty-six slices shipped across engine mechanics, state schemas, combat fill-in, adoption surface, and 2024 content.

### Engine architecture (Phase A, Slices 1-16)

- Event-sourced state machine. `apply(state, event) -> state` is pure; `replay(events)` reconstructs state byte-for-byte.
- Plan/commit split: all RNG is consumed inside `engine.plan.*` planners; resolution events carry baked rolls. `apply()` never touches RNG. Tested via `ThrowOnCallRNG` on every golden scenario.
- Branded IDs (`CharacterId`, `EncounterId`, etc.) backed by ULIDs. Normalized state. Immer internally, immutable externally.
- Twenty-five effect primitives plus a `CustomEffect` code-handler hook.
- `PendingChoice` protocol for deferred player decisions.
- Combat resolution chain (`AttackDeclared` -> `AttackRolled` -> `DamageRolled` -> `DamageApplied`), full encounter lifecycle, level-up flow with HP rolls, ability checks and saves, spellcasting with cantrip scaling and ritual casting and area shapes, concentration enforcement, OnEvent triggers (Sneak Attack), action economy (Action Surge, Extra Attack, Bonus Action), reactions (opportunity attacks, off-hand strikes, flat damage reduction), movement and positioning, damage mitigation order of operations, inventory equip/attune with 3-slot cap, creature as combatant with multiattack, environmental hazards (falling, cover), all 15 2024 conditions.

### State schemas (Phase B, Slices 17-20)

- Parties + shared inventory + currency + treasure ledger.
- Sessions + journal entries (player / DM / character visibility) + in-game clock formatted as `Day NN HH:MM`.
- Locations + maps (normal / difficult / impassable / water cells) + doors (open / closed / locked) + Bresenham line-of-sight and line-of-effect.
- Quests + objectives + rewards + milestone XP.

### Combat fill-in (Phase C, Slices 21-30)

- Grapple, shove, hide (2024 unarmed save-DC model).
- Counterspell, Dispel Magic, Identify.
- Weapon Mastery effects: Sap, Vex, Slow, Topple, Push, Graze.
- Mounts and vehicles (land / water / air, with HP, AC, capacity, occupants).
- Travel + forage + navigation + forced-march exhaustion.
- NPCs as first-class with attitude (hostile / unfriendly / indifferent / friendly / helpful) and morale.
- Downtime + crafting + training + tool proficiency tracking.
- Magic item charges + recharge cadence + sentient items.
- Resurrection variants: Revivify, Raise Dead, Reincarnate, Resurrection, True Resurrection.
- Wild Shape, Polymorph, Simulacrum, Wish.

### Adoption surface (Phase D, Slices 31-37)

- Starter content pack bundled with the package. `loadStarterPack()` returns a fully-populated `ContentPack`.
- `examples/` directory with three runnable apps: character-sheet printer, encounter + replay demo, save/load round-trip. CI executes them to catch public-API regressions.
- Getting-started doc and API reference under `docs/`.
- Public API conveniences: `engine.do(campaign, intent)`, `serializeCampaign(c)` / `loadCampaign(json)`, `createPC({...})`.
- Per-engine derivation memoization keyed on `CampaignState.version`. Repeated `engine.derive.*` calls return the same object reference until the next commit.
- npm publish prep. Package ships ESM + CJS + `.d.ts`. `prepublishOnly` runs the full CI gate. `publishConfig: public`.
- Content pack validator with path-pointed Zod failures and Levenshtein "Did you mean X?" suggestions on cross-reference errors.

### 2024 content (Phase E, Slices 38-46)

- All 12 PHB classes in the starter pack with 1-20 level tables and signature features at landmark levels.
- ~31 spells across cantrip + level 1-3 tiers covering the common archetypes.
- 7 species, 8 backgrounds, 22 feats (origin + general + all six fighting styles), 25+ items including armor variety, 5 tools, 7 adventuring-gear items.
- 9 magic items across all rarity tiers (common Bag of Holding through legendary Deck of Many Things) including a charged Wand of Magic Missiles.
- 6 monster statblocks (Goblin, Orc, Wolf, Skeleton, Ogre, Young Red Dragon).
- 2024 Bastion stronghold system: facilities, hirelings, turn orders, damage and level-up.
- 9 epic boons under the `epic-boon` feat category.
- Variant rule toggles on `CampaignState.settings`: gritty rest, hero points, sanity, mass combat, custom houserules.

### Testing

- 475 tests across 87 files. Replay-equivalence and RNG-capture invariants asserted on every golden scenario. 80% line coverage gate on `src/engine/`, `src/derive/`, `src/effects/`.
- Showcase scenario "The Stoneheart Saga" exercises 46 distinct mechanical surfaces in one coherent campaign narrative.

### Not yet done

- Phase F: optional `ttrpg-engine-core` extraction for multi-system support.
- Subclass mechanics for individual classes (the level tables ship; specific subclass features are consumer territory).
- The full ~370 spell catalog (representative sample ships; bulk content is for consumers to fill out from the 2024 SRD).
- Specific scenario content (specific NPCs, adventures, named magic items beyond the starter set).
