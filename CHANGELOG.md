# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 505): Wizard L1 Ritual Adept — new `GrantRitualAdept` marker + content cleanup**

Closes the Wizard L1 Ritual Adept feature gap. The underlying behavior has been functional since the cast pathway shipped: `intent.asRitual: true` already requires the spell's `ritual` tag, skips slot consumption, and skips action-economy consumption; `characterKnowsSpell` accepts `knownSpells` (the wizard's spellbook) alone, so an unprepared spellbook ritual cast just works. The Wizard L1 feature was carrying a misleading `Custom { handlerId: 'ritual-adept' }` content stub whose handler was never registered.

RAW (Wizard L1 Ritual Adept): "You can cast any spell as a Ritual if that spell has the Ritual tag and the spell is in your spellbook. You needn't have the spell prepared, but you must read from the book to cast a spell in this way."

**Engine** ([src/schemas/effects.ts](src/schemas/effects.ts), [src/effects/builder.ts](src/effects/builder.ts)):
- New `GrantRitualAdept` effect kind (marker — no fields), mirror of `GrantPotentCantrip` / `GrantEvasion`. Added to the discriminated union, the Zod schema, and `EFFECT_KINDS`.
- `EffectAccumulator` gains `markRitualAdept()` + `hasRitualAdept(): boolean`, projected from the new effect kind in the builder switch.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Wizard L1 `ritual-adept` feature: `Custom { handlerId: 'ritual-adept' }` → `GrantRitualAdept`. No behavioral change at runtime; the wire is now observable in the effect stack.

**Doc-count update** (CI-guarded): `EFFECT_KINDS` 55 → 56 (54 → 55 primitives + `Custom`). Updated [docs/authoring-content-packs.md](docs/authoring-content-packs.md) and [docs/concepts.md](docs/concepts.md). The stale Ritual Adept stub note in [docs/gaps-class-features.md](docs/gaps-class-features.md) is struck with a closed-by annotation.

**Documented RAW deviation (deferred)**: the cast pathway does NOT yet gate `intent.asRitual` strictly on a ritual-casting class feature — any character with the spell in `knownSpells`/`preparedSpells` can ritually cast today. Tightening that (so non-wizards can't ritually cast wizard-only ritual spells without their own ritual-casting feature) is a separate RAW-enforcement slice with broader blast radius; the `hasRitualAdept()` accessor exists so that slice has a marker to consult.

**Tests** at [tests/unit/engine/slice-505-ritual-adept.test.ts](tests/unit/engine/slice-505-ritual-adept.test.ts) - 4 cases: the Wizard L1 feature ships `GrantRitualAdept` (not the stale Custom); a Wizard's effect stack projects `hasRitualAdept === true`, a Fighter's does not; a Wizard ritually casts an unprepared spellbook ritual without consuming a slot; the ritual-tag gate still rejects non-ritual spells cast `asRitual`.

**Audit:**
- *RAW match*: the ritual-tag + spellbook-known requirement is enforced; slot + action are bypassed. The not-yet-gated "must have a ritual-casting feature" requirement is the documented deferral.
- *Names*: `GrantRitualAdept` parallels `GrantPotentCantrip` / `GrantEvasion`. The accessor pair (`markRitualAdept` / `hasRitualAdept`) matches the file's marker convention.
- *DRY*: no new cast-path code — the underlying behavior was already covered; this slice only makes the wire observable. Mirrors the marker-effect template wholesale.
- *SRP*: the new effect kind / accessor does one thing — record presence.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: schema replacement, projection true/false per class, ritual-cast slot bypass, non-ritual rejection.

**Pattern-check**: the "stale Custom-handler marker for a feature that's actually engine-supported" pattern surfaced two cases at L1 — `martial-arts` (Monk; routed in-engine via `applyMartialArtsDieScaling` in the attack planner — confirmed working, stays as a presence marker since Custom-as-flag is fine for in-attack-planner mechanics) and `ritual-adept` (Wizard; fixed in this slice with a real marker effect). A future sweep could promote `martial-arts` to a real marker too, but it's not a correctness issue today.

**Docs + test (slice 504): close Rogue Thieves' Cant (stale "stub" — already wired) + sweep adjacent L1 feature gap notes**

Resolves the Rogue Thieves' Cant L1-feature gap recorded in [docs/gaps-class-features.md](docs/gaps-class-features.md). The note claimed the feature was a stub "until the language ships," but the feature has shipped the `GrantProficiency target: 'language', id: 'thieves-cant'` wire since slice 60 — and the languages derivation ([src/derive/languages.ts](src/derive/languages.ts)) aggregates language ids from species + background + the GrantProficiency stream without validating against a registry (mirroring the Druidic flow), so the feature has been *behaviorally* wired the whole time. Adds a Rogue case to [tests/unit/derive/languages.test.ts](tests/unit/derive/languages.test.ts) that asserts a human criminal rogue's `computeKnownLanguages` returns `['common', 'thieves-cant']`, locking the projection.

**Pattern-check (Rogue → adjacent L1 feature stubs):**
- **Cleric Divine Order (L1)** — same shape of stale note. Audit found the L1 features array DOES ship `divine-order` with a fully wired `OfferChoice` (Protector: martial-weapon + heavy-armor proficiency; Thaumaturge: guidance cantrip + max(1, WIS-mod) bonus on Arcana / Religion checks). Doc note struck with an open follow-up: lock both sub-features with PendingChoice-resolving tests (deferred — the `OfferChoice when: 'onAcquire'` resolution path needs the test-fixture template that an OfferChoice-resolving slice would establish).
- **Wizard Ritual Adept (L1)** — genuine stub. The feature ships `Custom { handlerId: 'ritual-adept' }` but no handler is registered in [src/handlers/](src/handlers/), so the Custom effect resolves to a no-op. The cast-as-ritual-without-slot path is real engine work, not a doc-staleness fix.
- **Warlock Eldritch Invocations (L1)** — genuine stub. The feature ships `effects: []`; needs the invocation content catalog (a multi-slice effort).

**Tests** at [tests/unit/derive/languages.test.ts](tests/unit/derive/languages.test.ts): 1 new case (7 total in the file).

**Audit (short — pure doc + test slice):**
- *RAW match*: Rogue's L1 Thieves' Cant grants the Thieves' Cant language and one other of the player's choice. The engine projects Thieves' Cant; the "one other language of your choice" is content-author's discretion (not modeled — same as the Druidic-only Druid case the existing tests pin).
- *Names*: test name mirrors the existing "Druid L1 knows Druidic via the wired Druidic feature" case.
- *DRY*: no new code — reuses `createPC` + `computeKnownLanguages` as the existing language tests do.
- *Mechanical outcomes asserted*: a Rogue's known-language set includes `thieves-cant`.

**Engine + content (slice 503): Ensnaring Strike + save `largeCreatureAdvantage` + recurring `extraDicePerSlotLevel`**

Wires Ensnaring Strike, the last L1 spell with a real mechanical gap (floating-disk remains as a niche carry-capacity deferral). L1 is now functionally complete for damage / control casting on the spell side. Two small additive fields compose to cover the spell, no new mechanic kind needed.

RAW (SRD 5.2.1 Ensnaring Strike, L1 Ranger Conjuration, Bonus Action, Concentration up to 1 min): "As you hit the target, grasping vines appear on it, and it makes a Strength saving throw. A Large or larger creature has Advantage on this save. On a failed save, the target has the Restrained condition until the spell ends... While Restrained, the target takes 1d6 Piercing damage at the start of each of its turns... The damage increases by 1d6 for each spell slot level above 1."

**Engine** ([src/schemas/content/spell.ts](src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts), [src/engine/plan/concentration.ts](src/engine/plan/concentration.ts), [src/derive/creature-size.ts](src/derive/creature-size.ts)):
- New optional `largeCreatureAdvantage` on the `save` mechanic. Targets of size Large or larger gain Advantage on the save, OR'd into the existing effect-stack advantage. Reuses the new `isLargeOrLarger` size helper (mirror of `isLargeOrSmaller` from slice 386).
- New optional `extraDicePerSlotLevel` on the `recurring` mechanic. Per-tick upcast scaling: `planTickRecurring` reads the bound EffectInstance's `slotLevel` and adds `(slotLevel - spell.level) * extraDicePerSlotLevel` dice of `amountDice`'s die size to every tick.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- ensnaring-strike: `mechanicalEffects: [{ save STR -> Restrained, largeCreatureAdvantage true }, { recurring damage 1d6 piercing, extraDicePerSlotLevel 1 }]`. Concentration up to 1 min (existing duration). Uses the base `restrained` condition.

**Documented RAW deviations (consumer-managed):**
- The "Bonus Action, immediately after hitting a creature with a weapon" cast-trigger timing: the engine doesn't track recent hits; the consumer invokes castSpell after observing AttackRolled.hit.
- The Athletics-action escape (target or ally takes an action to make a STR (Athletics) check against the spell save DC): consumer-driven via `engine.plan.abilityCheck` + a ConditionRemoved on success.
- "On a successful save, the vines shrivel away, and the spell ends": not modeled; concentration stays up on a successful save (no save-success-ends-spell arm on the save mechanic).

**Doc-count update**: spell totals 195 -> 196 wired (152 -> 153 cast-time), 75 -> 74 deferred (L1: 43 -> 44 wired, 2 -> 1 deferred — only floating-disk remains). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-503-ensnaring-strike.test.ts](tests/unit/engine/slice-503-ensnaring-strike.test.ts) - 6 cases: the spell ships the two-mechanic shape; a Medium target that fails the STR save gets Restrained, with the ConcentrationStarted event listing the condition for concentration-drop cleanup; a Large target gets Advantage on the save (two d20s, used: 'advantage'); after Restrained applies, `tickRecurring` deals 1d6 piercing (range 1..6); upcasting at slot 2 deals 2d6 (range 2..12); the cast + tick chain replays equivalently. spell-coverage flipped from `skip` -> `save`.

**Audit:**
- *RAW match*: STR save -> Restrained, Large+ advantage, recurring 1d6 piercing per turn with +1d6/slot upcast. Cast-trigger / Athletics-escape / save-success-ends-spell are documented deviations.
- *Names*: `largeCreatureAdvantage` mirrors slice 500's `targetCreatureType` (per-target gate field on save); `extraDicePerSlotLevel` mirrors the same-named save / attack / autohit upcast field. `isLargeOrLarger` parallels `isLargeOrSmaller`.
- *DRY*: composes existing `save` + `recurring` mechanics rather than adding a new kind; reuses the existing condition-concentration linkage path; reuses creature-size + d20 advantage flow.
- *SRP*: each field threads one value through one resolution point — size -> save advantage; slot delta -> extra tick dice.
- *Magic numbers*: none (1d6 / +1d6 are content).
- *at-threading*: planSaveMechanic and planTickRecurring each resolve `at` once and pass it through.
- *Mechanical outcomes asserted*: shape, restrained-on-fail concentration linkage, Large advantage, base tick range, upcast tick range, replay-equivalence.

**Pattern-check**: both new fields are opt-in (existing save / recurring spells set neither and resolve exactly as before). `largeCreatureAdvantage` generalizes to any size-gated save-advantage clause (a future Crown of Madness caster-side cap, etc.). `extraDicePerSlotLevel` on recurring closes the parallel to attack / save / autohit upcast scaling (the recurring mechanic's only previously-missing axis). The save mechanic's advantage path now reads from BOTH the effect stack and the new size flag — verified by the existing "Large or smaller" sweep that audits the same family from the other direction (slice 264 / 267).

**Engine (slice 502): Weapon Mastery enforcement (full RAW — chosen weapon kinds)**

Closes the long-standing over-grant where any character got any weapon's Mastery property for free (a Wizard's quarterstaff dealt Topple; a Fighter benefited on every weapon, not just the kinds they chose). `GrantWeaponMastery` was previously inert.

RAW (2024 Weapon Mastery, Fighter/Barbarian/Paladin/Ranger/Rogue): you choose a number of specific weapon kinds (Fighter 3, the others 2) and may use the mastery property of a weapon only if it is one of those chosen kinds AND you have proficiency with it. Re-choosable on a Long Rest.

**Engine:**
- [src/schemas/runtime/character.ts](src/schemas/runtime/character.ts): new persisted `weaponMasteries: string[]` (chosen weapon definition ids), defaulted `[]`. Additive defaulted field, so no `SCHEMA_VERSION` bump / migration (precedent: slice 486's `usedFreeCastSpellIds`).
- [src/effects/builder.ts](src/effects/builder.ts): `GrantWeaponMastery` now projects into the effect stack — `weaponMasterySlots()` (max slot count across grants) + `grantedWeaponMasteryProperties()` (union of the granted property pool). Previously a no-op switch arm.
- [src/derive/weapon-mastery.ts](src/derive/weapon-mastery.ts) (new): `canUseWeaponMastery(character, weapon, content)` — true iff the weapon's kind is in `character.weaponMasteries` and the character is proficient; `Flex` is exempt (engine versatile-toggle extension, not a learned RAW mastery). Reuses the now-exported `isWeaponProficient` from [src/derive/attack.ts](src/derive/attack.ts).
- [src/engine/plan/choose-weapon-masteries.ts](src/engine/plan/choose-weapon-masteries.ts) (new) + `WeaponMasteriesChosen` event/reducer: `planChooseWeaponMasteries` validates a selection (within the slot budget, each weapon a proficient, mastery-bearing weapon whose property is in the granted pool) and emits the selection; the reducer replaces `character.weaponMasteries`.
- Gated all four mastery read sites (pattern-check): `planWeaponMastery` and `planCleave` throw if the weapon isn't mastered; `planOffHandAttack`'s Nick branch degrades gracefully (no throw; the off-hand attack still costs a Bonus Action); the Flex read in `resolveAttack` is intentionally left ungated.

**Documented RAW deviations:** per-level slot growth (Fighter L4/L10/L16) unwired; "re-choose only on a Long Rest" timing is consumer-managed (re-invoke the planner); multiclass mastery-count stacking not modeled (budget = the largest single grant). Flex is exempt by design.

**Tests** at [tests/unit/engine/slice-502-weapon-mastery-enforcement.test.ts](tests/unit/engine/slice-502-weapon-mastery-enforcement.test.ts) - 17 cases: budget by class (Fighter 3 / Rogue 2 / Wizard 0); the gate (chosen+proficient true, not-chosen false, chosen-but-not-proficient false, Flex exempt); planner validation (within budget stores it, over-budget / non-proficient / no-mastery / no-feature throw; replay-equivalence); and the gate firing in `planWeaponMastery` (Topple) + `planCleave`. Seeded `weaponMasteries` on the five affected martial fixtures (slice-381, slice-386 Push, plan-mastery-cleave-nick-flex Nick/Cleave, s23 golden, showcase golden) so their existing mastery behavior and transcripts are unchanged; added an optional `weaponMasteries` to the shared `buildFighter` fixture.

**Audit:**
- *RAW match*: chosen-kind + proficiency gate; non-martial classes now get no mastery. Per-level growth / long-rest timing / multiclass stacking are documented deviations.
- *Names*: `weaponMasteries` (chosen kinds) mirrors `knownSpells` / `featsTaken`; `canUseWeaponMastery` / `planChooseWeaponMasteries` are intention-revealing; `WeaponMasteriesChosen` parallels the existing `WeaponMasteryActivated`.
- *DRY*: one `canUseWeaponMastery` helper gates all four read sites; the planner reuses `isWeaponProficient` + `buildEffectStack`.
- *SRP*: the helper answers one question (may this character use this weapon's mastery); the planner validates + emits; the reducer stores.
- *Magic numbers*: none (slot counts are content on `GrantWeaponMastery`).
- *at-threading*: the planner resolves `at` once and stamps the single event.
- *Mechanical outcomes asserted*: budget per class, the four gate branches, planner validation throws, replay-equivalence, gate firing through the two planners.

**Pattern-check**: gated every mastery read site, not just the surfaced one — `planWeaponMastery` (Sap/Vex/Slow/Topple/Push/Graze), `planCleave` (Cleave), `planOffHandAttack` (Nick), with Flex intentionally exempt and documented. The five pre-existing tests that exercised mastery on martial characters were all found (via the slice's blast-radius sweep) and seeded so no behavior silently changed.

**Engine + content (slice 501): Shillelagh + `weapon-buff` spell mechanic + item-buff weapon-transformation overrides**

Wires Shillelagh, the L0 Druid weapon-imbue cantrip, closing the last deferred Level 0 spell (L0 is now 16 wired / 0 deferred). Generalizes the existing `temporaryBuff` (Magic Weapon / Elemental Weapon) with three transformation overrides the attack path reads back.

RAW (SRD 5.2.1 Shillelagh, Transmutation cantrip, Druid): "A Club or Quarterstaff you are holding is imbued with nature's power. For the duration, you can use your spellcasting ability instead of Strength for the attack and damage rolls of melee attacks using that weapon, and the weapon's damage die becomes a d8. If the attack deals damage, it can be Force damage or the weapon's normal damage type (your choice)." 1 minute, NOT concentration.

**Engine**:
- [src/schemas/runtime/item-instance.ts](src/schemas/runtime/item-instance.ts): `ItemTemporaryBuff` gains `abilityOverride` / `damageDieOverride` / `damageTypeOverride`; `sourceEffectInstanceId` made optional (non-concentration buffs omit it).
- [src/schemas/events/inventory.ts](src/schemas/events/inventory.ts) + [src/engine/reducers/inventory.ts](src/engine/reducers/inventory.ts): `ItemBuffApplied` carries the three overrides; the reducer conditionally spreads them.
- [src/derive/attack.ts](src/derive/attack.ts): `computeAttackBonus` reads `temporaryBuff.abilityOverride` (precedence: per-attack input override > buff override > weapon default).
- [src/engine/plan/attack.ts](src/engine/plan/attack.ts) `resolveAttack`: the damage path folds `temporaryBuff.abilityOverride` into the damage ability, `damageDieOverride` into the base damage expression (over the versatile/printed die), and `damageTypeOverride` into the effective damage type (over an enchantment's / weapon's type).
- [src/schemas/content/spell.ts](src/schemas/content/spell.ts) + [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts): new `weapon-buff` SpellMechanic (`useSpellcastingAbility` / `damageDieOverride` / `damageTypeChoice`) + `planWeaponBuffMechanic`, which resolves the caster's spellcasting ability and stamps one `ItemBuffApplied` (no concentration link) onto `intent.weaponInstanceId`.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- shillelagh: `mechanicalEffects: [{ weapon-buff, useSpellcastingAbility: true, damageDieOverride: '1d8', damageTypeChoice: { allowed: ['force'] } }]`.

**Deferred / RAW deviations (documented)**: Shillelagh's damage-type choice is per-hit ("can be Force or the weapon's normal type"); the engine collapses it to a single cast-time choice via `intent.casterChoice`. Force is universally at-least-as-good as bludgeoning, so the collapse rarely changes outcomes. The 1-minute duration and the "ends if you let go of the weapon" / "ends if recast" clauses are consumer-managed (the buff is non-concentration; the consumer removes it via `ItemBuffRemoved`). The Club / Quarterstaff weapon restriction is a targeting constraint left to the consumer (the mechanic is weapon-agnostic; it validates only that the target is a weapon).

**Doc-count update**: spell totals 194 -> 195 wired (new `weapon-buff` row, 1), 76 -> 75 deferred (L0 16 wired / 0 deferred). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-501-shillelagh.test.ts](tests/unit/engine/slice-501-shillelagh.test.ts) - 7 cases: the mechanic shape; the cast stamps an `ItemBuffApplied` with WIS override + d8 die + chosen Force type and no concentration link; an imbued club attacks with the WIS mod (+6 vs the +1 a STR club would roll); damage on hit rolls a d8 with the WIS mod and Force type; without a damage-type choice the type stays bludgeoning (die still d8); a cast without `weaponInstanceId` throws; a cast targeting a non-weapon throws. spell-coverage keeps shillelagh `skip` with an updated reason (the generic harness sets up no held weapon; the dedicated test does).

**Audit:**
- *RAW match*: spellcasting-ability attack+damage, d8 die, optional Force type. The per-hit -> cast-time type choice, duration, let-go/recast end, and weapon restriction are documented deviations / consumer-side.
- *Names*: `abilityOverride` / `damageDieOverride` / `damageTypeOverride` mirror the slice-494 `abilityOverride` and the existing buff-field naming; `weapon-buff` parallels the slice-494 `weaponAttack` mechanic.
- *DRY*: reuses `temporaryBuff` + the attack resolver's existing override-precedence chains rather than a parallel buff path; `planWeaponBuffMechanic` mirrors `planWeaponAttackMechanic`'s weapon-instance validation.
- *SRP*: each override field threads one value through one resolution point; the planner does one thing (stamp the buff).
- *Magic numbers*: none (the `1d8` die is content, not code).
- *at-threading*: the planner takes `at` from the cast and passes it to the single emitted event.
- *Mechanical outcomes asserted*: buff-stamp shape, attack-bonus delta (override landed), damage die + mod + type, no-choice type fallback, two throw paths.

**Pattern-check**: the override-precedence chains (`input ?? buff ?? default`) were added at all three attack read points (attack-bonus derive, damage ability, damage die, damage type) so no read point silently ignores a buff override. The three new buff fields are opt-in; the existing `temporaryBuff` users (Magic Weapon, Elemental Weapon) set none of them and resolve exactly as before. `sourceEffectInstanceId` going optional is backward-compatible: the concentration-cleanup walk skips buffs without it, which is correct for the non-concentration Shillelagh.

Per-slice detail for slices 496-500 (zone-cohort sweep: Silence / Move Earth / Reverse Gravity / Earthquake; Ice Knife + `targetScope`; Sorcerous Burst + `explodeOnMaxDie`; Goodberry + `create-item` + inventory grant; Animal Friendship + `targetCreatureType` + `conditionEndsOnDamage`) is archived at [docs/changelog/archive-slices-496-500.md](docs/changelog/archive-slices-496-500.md) (slice 503, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 491-495 (Boar Gore + `event.attackerChargedThisTarget`; Web Walker + `restrained-by-web`; Death Dog disease + RecurringSave `'longRest'`; True Strike + `weaponAttack`; the positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness) is archived at [docs/changelog/archive-slices-491-495.md](docs/changelog/archive-slices-491-495.md) (slice 499, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 487-490 (non-spellcaster Magic Initiate cast path; Cockatrice Petrifying Bite + `escalateToCondition`; Hippogriff Flyby + `MovementMode`; Stirge Blood Drain) is archived at [docs/changelog/archive-slices-487-490.md](docs/changelog/archive-slices-487-490.md) (slice 494, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + `consumeOnIncomingAttack`, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490, to keep this file under the 60 KB single-Read ceiling).
Per-slice detail for slices 472-481 (the post-alpha.15 iconic-encounter content sweep: Scout / Cultist / Spy / Pack Tactics / Giant Spider+Centipede / Hippogriff / Brown Bear / Black Bear / Pirate Multiattacks and weapons) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487, to keep this file under the 60 KB single-Read ceiling).

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
