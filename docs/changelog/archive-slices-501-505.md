# Archive: slices 501-505

This file holds the per-slice changelog detail for slices 501-505, archived from the live CHANGELOG.md in slice 511 to keep that file under the 60 KB single-Read ceiling. Cohort: the L1-spell-tail close (Shillelagh + weapon-buff mechanic, Ensnaring Strike + save largeCreatureAdvantage + recurring extraDicePerSlotLevel) plus the L1 character-creation gap closures (Weapon Mastery enforcement, Rogue Thieves' Cant stale-stub sweep, Wizard Ritual Adept marker promotion). Picks up where [archive-slices-496-500.md](archive-slices-496-500.md) leaves off.

The global per-cohort archive index lives at [README.md](README.md).

---

**Engine + content (slice 505): Wizard L1 Ritual Adept — new `GrantRitualAdept` marker + content cleanup**

Closes the Wizard L1 Ritual Adept feature gap. The underlying behavior has been functional since the cast pathway shipped: `intent.asRitual: true` already requires the spell's `ritual` tag, skips slot consumption, and skips action-economy consumption; `characterKnowsSpell` accepts `knownSpells` (the wizard's spellbook) alone, so an unprepared spellbook ritual cast just works. The Wizard L1 feature was carrying a misleading `Custom { handlerId: 'ritual-adept' }` content stub whose handler was never registered.

RAW (Wizard L1 Ritual Adept): "You can cast any spell as a Ritual if that spell has the Ritual tag and the spell is in your spellbook. You needn't have the spell prepared, but you must read from the book to cast a spell in this way."

**Engine** ([src/schemas/effects.ts](../../src/schemas/effects.ts), [src/effects/builder.ts](../../src/effects/builder.ts)):
- New `GrantRitualAdept` effect kind (marker — no fields), mirror of `GrantPotentCantrip` / `GrantEvasion`. Added to the discriminated union, the Zod schema, and `EFFECT_KINDS`.
- `EffectAccumulator` gains `markRitualAdept()` + `hasRitualAdept(): boolean`, projected from the new effect kind in the builder switch.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Wizard L1 `ritual-adept` feature: `Custom { handlerId: 'ritual-adept' }` → `GrantRitualAdept`. No behavioral change at runtime; the wire is now observable in the effect stack.

**Doc-count update** (CI-guarded): `EFFECT_KINDS` 55 → 56 (54 → 55 primitives + `Custom`). Updated [docs/authoring-content-packs.md](../../docs/authoring-content-packs.md) and [docs/concepts.md](../../docs/concepts.md). The stale Ritual Adept stub note in [docs/gaps-class-features.md](../../docs/gaps-class-features.md) is struck with a closed-by annotation.

**Documented RAW deviation (deferred)**: the cast pathway does NOT yet gate `intent.asRitual` strictly on a ritual-casting class feature — any character with the spell in `knownSpells`/`preparedSpells` can ritually cast today. Tightening that (so non-wizards can't ritually cast wizard-only ritual spells without their own ritual-casting feature) is a separate RAW-enforcement slice with broader blast radius; the `hasRitualAdept()` accessor exists so that slice has a marker to consult.

**Tests** at [tests/unit/engine/slice-505-ritual-adept.test.ts](../../tests/unit/engine/slice-505-ritual-adept.test.ts) - 4 cases: the Wizard L1 feature ships `GrantRitualAdept` (not the stale Custom); a Wizard's effect stack projects `hasRitualAdept === true`, a Fighter's does not; a Wizard ritually casts an unprepared spellbook ritual without consuming a slot; the ritual-tag gate still rejects non-ritual spells cast `asRitual`.

**Audit:**
- *RAW match*: the ritual-tag + spellbook-known requirement is enforced; slot + action are bypassed. The not-yet-gated "must have a ritual-casting feature" requirement is the documented deferral.
- *Names*: `GrantRitualAdept` parallels `GrantPotentCantrip` / `GrantEvasion`. The accessor pair (`markRitualAdept` / `hasRitualAdept`) matches the file's marker convention.
- *DRY*: no new cast-path code — the underlying behavior was already covered; this slice only makes the wire observable. Mirrors the marker-effect template wholesale.
- *SRP*: the new effect kind / accessor does one thing — record presence.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: schema replacement, projection true/false per class, ritual-cast slot bypass, non-ritual rejection.

**Pattern-check**: the "stale Custom-handler marker for a feature that's actually engine-supported" pattern surfaced two cases at L1 — `martial-arts` (Monk; routed in-engine via `applyMartialArtsDieScaling` in the attack planner — confirmed working, stays as a presence marker since Custom-as-flag is fine for in-attack-planner mechanics) and `ritual-adept` (Wizard; fixed in this slice with a real marker effect). A future sweep could promote `martial-arts` to a real marker too, but it's not a correctness issue today.

**Docs + test (slice 504): close Rogue Thieves' Cant (stale "stub" — already wired) + sweep adjacent L1 feature gap notes**

Resolves the Rogue Thieves' Cant L1-feature gap recorded in [docs/gaps-class-features.md](../../docs/gaps-class-features.md). The note claimed the feature was a stub "until the language ships," but the feature has shipped the `GrantProficiency target: 'language', id: 'thieves-cant'` wire since slice 60 — and the languages derivation ([src/derive/languages.ts](../../src/derive/languages.ts)) aggregates language ids from species + background + the GrantProficiency stream without validating against a registry (mirroring the Druidic flow), so the feature has been *behaviorally* wired the whole time. Adds a Rogue case to [tests/unit/derive/languages.test.ts](../../tests/unit/derive/languages.test.ts) that asserts a human criminal rogue's `computeKnownLanguages` returns `['common', 'thieves-cant']`, locking the projection.

**Pattern-check (Rogue → adjacent L1 feature stubs):**
- **Cleric Divine Order (L1)** — same shape of stale note. Audit found the L1 features array DOES ship `divine-order` with a fully wired `OfferChoice` (Protector: martial-weapon + heavy-armor proficiency; Thaumaturge: guidance cantrip + max(1, WIS-mod) bonus on Arcana / Religion checks). Doc note struck with an open follow-up: lock both sub-features with PendingChoice-resolving tests (deferred — the `OfferChoice when: 'onAcquire'` resolution path needs the test-fixture template that an OfferChoice-resolving slice would establish).
- **Wizard Ritual Adept (L1)** — genuine stub. The feature ships `Custom { handlerId: 'ritual-adept' }` but no handler is registered in [src/handlers/](../../src/handlers/), so the Custom effect resolves to a no-op. The cast-as-ritual-without-slot path is real engine work, not a doc-staleness fix.
- **Warlock Eldritch Invocations (L1)** — genuine stub. The feature ships `effects: []`; needs the invocation content catalog (a multi-slice effort).

**Tests** at [tests/unit/derive/languages.test.ts](../../tests/unit/derive/languages.test.ts): 1 new case (7 total in the file).

**Audit (short — pure doc + test slice):**
- *RAW match*: Rogue's L1 Thieves' Cant grants the Thieves' Cant language and one other of the player's choice. The engine projects Thieves' Cant; the "one other language of your choice" is content-author's discretion (not modeled — same as the Druidic-only Druid case the existing tests pin).
- *Names*: test name mirrors the existing "Druid L1 knows Druidic via the wired Druidic feature" case.
- *DRY*: no new code — reuses `createPC` + `computeKnownLanguages` as the existing language tests do.
- *Mechanical outcomes asserted*: a Rogue's known-language set includes `thieves-cant`.

**Engine + content (slice 503): Ensnaring Strike + save `largeCreatureAdvantage` + recurring `extraDicePerSlotLevel`**

Wires Ensnaring Strike, the last L1 spell with a real mechanical gap (floating-disk remains as a niche carry-capacity deferral). L1 is now functionally complete for damage / control casting on the spell side. Two small additive fields compose to cover the spell, no new mechanic kind needed.

RAW (SRD 5.2.1 Ensnaring Strike, L1 Ranger Conjuration, Bonus Action, Concentration up to 1 min): "As you hit the target, grasping vines appear on it, and it makes a Strength saving throw. A Large or larger creature has Advantage on this save. On a failed save, the target has the Restrained condition until the spell ends... While Restrained, the target takes 1d6 Piercing damage at the start of each of its turns... The damage increases by 1d6 for each spell slot level above 1."

**Engine** ([src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts), [src/engine/plan/concentration.ts](../../src/engine/plan/concentration.ts), [src/derive/creature-size.ts](../../src/derive/creature-size.ts)):
- New optional `largeCreatureAdvantage` on the `save` mechanic. Targets of size Large or larger gain Advantage on the save, OR'd into the existing effect-stack advantage. Reuses the new `isLargeOrLarger` size helper (mirror of `isLargeOrSmaller` from slice 386).
- New optional `extraDicePerSlotLevel` on the `recurring` mechanic. Per-tick upcast scaling: `planTickRecurring` reads the bound EffectInstance's `slotLevel` and adds `(slotLevel - spell.level) * extraDicePerSlotLevel` dice of `amountDice`'s die size to every tick.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- ensnaring-strike: `mechanicalEffects: [{ save STR -> Restrained, largeCreatureAdvantage true }, { recurring damage 1d6 piercing, extraDicePerSlotLevel 1 }]`. Concentration up to 1 min (existing duration). Uses the base `restrained` condition.

**Documented RAW deviations (consumer-managed):**
- The "Bonus Action, immediately after hitting a creature with a weapon" cast-trigger timing: the engine doesn't track recent hits; the consumer invokes castSpell after observing AttackRolled.hit.
- The Athletics-action escape (target or ally takes an action to make a STR (Athletics) check against the spell save DC): consumer-driven via `engine.plan.abilityCheck` + a ConditionRemoved on success.
- "On a successful save, the vines shrivel away, and the spell ends": not modeled; concentration stays up on a successful save (no save-success-ends-spell arm on the save mechanic).

**Doc-count update**: spell totals 195 -> 196 wired (152 -> 153 cast-time), 75 -> 74 deferred (L1: 43 -> 44 wired, 2 -> 1 deferred — only floating-disk remains). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-503-ensnaring-strike.test.ts](../../tests/unit/engine/slice-503-ensnaring-strike.test.ts) - 6 cases: the spell ships the two-mechanic shape; a Medium target that fails the STR save gets Restrained, with the ConcentrationStarted event listing the condition for concentration-drop cleanup; a Large target gets Advantage on the save (two d20s, used: 'advantage'); after Restrained applies, `tickRecurring` deals 1d6 piercing (range 1..6); upcasting at slot 2 deals 2d6 (range 2..12); the cast + tick chain replays equivalently. spell-coverage flipped from `skip` -> `save`.

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
- [src/schemas/runtime/character.ts](../../src/schemas/runtime/character.ts): new persisted `weaponMasteries: string[]` (chosen weapon definition ids), defaulted `[]`. Additive defaulted field, so no `SCHEMA_VERSION` bump / migration (precedent: slice 486's `usedFreeCastSpellIds`).
- [src/effects/builder.ts](../../src/effects/builder.ts): `GrantWeaponMastery` now projects into the effect stack — `weaponMasterySlots()` (max slot count across grants) + `grantedWeaponMasteryProperties()` (union of the granted property pool). Previously a no-op switch arm.
- [src/derive/weapon-mastery.ts](../../src/derive/weapon-mastery.ts) (new): `canUseWeaponMastery(character, weapon, content)` — true iff the weapon's kind is in `character.weaponMasteries` and the character is proficient; `Flex` is exempt (engine versatile-toggle extension, not a learned RAW mastery). Reuses the now-exported `isWeaponProficient` from [src/derive/attack.ts](../../src/derive/attack.ts).
- [src/engine/plan/choose-weapon-masteries.ts](../../src/engine/plan/choose-weapon-masteries.ts) (new) + `WeaponMasteriesChosen` event/reducer: `planChooseWeaponMasteries` validates a selection (within the slot budget, each weapon a proficient, mastery-bearing weapon whose property is in the granted pool) and emits the selection; the reducer replaces `character.weaponMasteries`.
- Gated all four mastery read sites (pattern-check): `planWeaponMastery` and `planCleave` throw if the weapon isn't mastered; `planOffHandAttack`'s Nick branch degrades gracefully (no throw; the off-hand attack still costs a Bonus Action); the Flex read in `resolveAttack` is intentionally left ungated.

**Documented RAW deviations:** per-level slot growth (Fighter L4/L10/L16) unwired; "re-choose only on a Long Rest" timing is consumer-managed (re-invoke the planner); multiclass mastery-count stacking not modeled (budget = the largest single grant). Flex is exempt by design.

**Tests** at [tests/unit/engine/slice-502-weapon-mastery-enforcement.test.ts](../../tests/unit/engine/slice-502-weapon-mastery-enforcement.test.ts) - 17 cases: budget by class (Fighter 3 / Rogue 2 / Wizard 0); the gate (chosen+proficient true, not-chosen false, chosen-but-not-proficient false, Flex exempt); planner validation (within budget stores it, over-budget / non-proficient / no-mastery / no-feature throw; replay-equivalence); and the gate firing in `planWeaponMastery` (Topple) + `planCleave`. Seeded `weaponMasteries` on the five affected martial fixtures (slice-381, slice-386 Push, plan-mastery-cleave-nick-flex Nick/Cleave, s23 golden, showcase golden) so their existing mastery behavior and transcripts are unchanged; added an optional `weaponMasteries` to the shared `buildFighter` fixture.

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
- [src/schemas/runtime/item-instance.ts](../../src/schemas/runtime/item-instance.ts): `ItemTemporaryBuff` gains `abilityOverride` / `damageDieOverride` / `damageTypeOverride`; `sourceEffectInstanceId` made optional (non-concentration buffs omit it).
- [src/schemas/events/inventory.ts](../../src/schemas/events/inventory.ts) + [src/engine/reducers/inventory.ts](../../src/engine/reducers/inventory.ts): `ItemBuffApplied` carries the three overrides; the reducer conditionally spreads them.
- [src/derive/attack.ts](../../src/derive/attack.ts): `computeAttackBonus` reads `temporaryBuff.abilityOverride` (precedence: per-attack input override > buff override > weapon default).
- [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) `resolveAttack`: the damage path folds `temporaryBuff.abilityOverride` into the damage ability, `damageDieOverride` into the base damage expression (over the versatile/printed die), and `damageTypeOverride` into the effective damage type (over an enchantment's / weapon's type).
- [src/schemas/content/spell.ts](../../src/schemas/content/spell.ts) + [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts): new `weapon-buff` SpellMechanic (`useSpellcastingAbility` / `damageDieOverride` / `damageTypeChoice`) + `planWeaponBuffMechanic`, which resolves the caster's spellcasting ability and stamps one `ItemBuffApplied` (no concentration link) onto `intent.weaponInstanceId`.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- shillelagh: `mechanicalEffects: [{ weapon-buff, useSpellcastingAbility: true, damageDieOverride: '1d8', damageTypeChoice: { allowed: ['force'] } }]`.

**Deferred / RAW deviations (documented)**: Shillelagh's damage-type choice is per-hit ("can be Force or the weapon's normal type"); the engine collapses it to a single cast-time choice via `intent.casterChoice`. Force is universally at-least-as-good as bludgeoning, so the collapse rarely changes outcomes. The 1-minute duration and the "ends if you let go of the weapon" / "ends if recast" clauses are consumer-managed (the buff is non-concentration; the consumer removes it via `ItemBuffRemoved`). The Club / Quarterstaff weapon restriction is a targeting constraint left to the consumer (the mechanic is weapon-agnostic; it validates only that the target is a weapon).

**Doc-count update**: spell totals 194 -> 195 wired (new `weapon-buff` row, 1), 76 -> 75 deferred (L0 16 wired / 0 deferred). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-501-shillelagh.test.ts](../../tests/unit/engine/slice-501-shillelagh.test.ts) - 7 cases: the mechanic shape; the cast stamps an `ItemBuffApplied` with WIS override + d8 die + chosen Force type and no concentration link; an imbued club attacks with the WIS mod (+6 vs the +1 a STR club would roll); damage on hit rolls a d8 with the WIS mod and Force type; without a damage-type choice the type stays bludgeoning (die still d8); a cast without `weaponInstanceId` throws; a cast targeting a non-weapon throws. spell-coverage keeps shillelagh `skip` with an updated reason (the generic harness sets up no held weapon; the dedicated test does).

**Audit:**
- *RAW match*: spellcasting-ability attack+damage, d8 die, optional Force type. The per-hit -> cast-time type choice, duration, let-go/recast end, and weapon restriction are documented deviations / consumer-side.
- *Names*: `abilityOverride` / `damageDieOverride` / `damageTypeOverride` mirror the slice-494 `abilityOverride` and the existing buff-field naming; `weapon-buff` parallels the slice-494 `weaponAttack` mechanic.
- *DRY*: reuses `temporaryBuff` + the attack resolver's existing override-precedence chains rather than a parallel buff path; `planWeaponBuffMechanic` mirrors `planWeaponAttackMechanic`'s weapon-instance validation.
- *SRP*: each override field threads one value through one resolution point; the planner does one thing (stamp the buff).
- *Magic numbers*: none (the `1d8` die is content, not code).
- *at-threading*: the planner takes `at` from the cast and passes it to the single emitted event.
- *Mechanical outcomes asserted*: buff-stamp shape, attack-bonus delta (override landed), damage die + mod + type, no-choice type fallback, two throw paths.

**Pattern-check**: the override-precedence chains (`input ?? buff ?? default`) were added at all three attack read points (attack-bonus derive, damage ability, damage die, damage type) so no read point silently ignores a buff override. The three new buff fields are opt-in; the existing `temporaryBuff` users (Magic Weapon, Elemental Weapon) set none of them and resolve exactly as before. `sourceEffectInstanceId` going optional is backward-compatible: the concentration-cleanup walk skips buffs without it, which is correct for the non-concentration Shillelagh.

