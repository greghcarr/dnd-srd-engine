# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 490): Stirge Blood Drain (attach + drain + detach)**

Closes the Stirge Blood Drain slot on the slice-477 "iconic beast/monstrosity traits" deferred list. The most-iconic CR 1/8 monster in the 2024 SRD now ships its full Proboscis mechanic end-to-end, modulo one documented RAW deviation (consumer-managed "spend 5 ft of movement to detach" arm).

RAW (SRD 5.2.1 Stirge, CR 1/8): "Proboscis. Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage, and the stirge attaches to the target. While attached, the stirge can't make Proboscis attacks, and the target takes 5 (2d4) Necrotic damage at the start of each of the stirge's turns. The stirge can detach itself by spending 5 feet of its movement. The target or a creature within 5 feet of it can detach the stirge as an action."

**Engine** ([src/engine/plan/stirge-drain.ts](src/engine/plan/stirge-drain.ts), [src/engine/plan/attack.ts](src/engine/plan/attack.ts)):
- New `planStirgeDrain` planner: consumer calls at the stirge's turn-start; emits a single `DamageApplied` event with 2d4 necrotic on the stirge's attached target. Mirrors the lands-aid / falling damage emission shape (no intermediate `DamageRolled`; the damage roll is inlined since there's no attack or save resolution in front of it). Routes through `mitigateDamage` + `interceptFatalDamage` + `planConcentrationBreakOnDrop` the same way the existing damage emitters do. Throws if the stirge has no attached target.
- New `planDetachStirge` planner: action-cost detach. Consumer specifies `actorId` (the target itself or an adjacent ally) + `stirgeId`. Emits `ConditionRemoved` for `stirge-attached` on the target; consumes the actor's action when invoked by the active combatant in an active encounter (mirrors `planSacredWeapon`'s bonus-action consumption shape).
- New `findStirgeAttachedTarget(state, stirgeId)` helper exported from the planner file: walks `state.characters` for any character carrying `stirge-attached` with `sourceCharacterId === stirgeId`. Used by both planners + the attack-resolver gate.
- `resolveAttack` gate ([src/engine/plan/attack.ts](src/engine/plan/attack.ts)): when the chosen weapon is `stirge-proboscis` AND the attacker has any character carrying `stirge-attached` sourced by them, throw `"<stirge> cannot make Proboscis attacks while attached to a target"`. Mirrors the existing slice-380 `ADDLED_CONDITION_ID` gate pattern.
- Planner-wiring audit ([tests/audit/planner-wiring.test.ts](tests/audit/planner-wiring.test.ts)): `stirgeDrain` + `detachStirge` added to `EXCLUDED_FROM_DISPATCH` (drain is a per-turn tick; detach is an action invoked by the target or an adjacent ally — neither is the standard "performIntent on the active combatant's turn" shape).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `stirge-attached` marker condition (effects: []): carries `sourceCharacterId` = the attaching stirge. Effects are intentionally empty — the condition is read by the attack resolver + the two new planners; it has no projection through the effect stack.
- New `stirge-proboscis` natural weapon (1d6 piercing) with slice-321 unconditional onHit `applyConditionId: 'stirge-attached'`. The +3 damage / +5 attack come from wielder DEX 16 + PB 2. The slice-484 stamping bakes `sourceCharacterId` = the attacker on the applied condition.
- Stirge statblock unchanged (no Custom marker trait needed; the wiring lives on the weapon + condition + planners).

**Doc-count update**: weapons 73 -> 74, items 536 -> 537, conditions 127 -> 128 (15 RAW + 112 -> 113 rider; effect-bearing 111 stays — `stirge-attached` is a marker).

**Documented RAW deviation (consumer-managed)**: the "spend 5 ft of movement to detach" arm. Same shape as Disengage's fixed-cost movement substitution; the engine doesn't yet model fractional movement-action costs. The action-cost detach arm IS wired.

**Tests** at [tests/unit/engine/slice-490-stirge-blood-drain.test.ts](tests/unit/engine/slice-490-stirge-blood-drain.test.ts) - 8 cases:
1. `stirge-proboscis` weapon shape.
2. `stirge-attached` condition shape (marker, no effects).
3. End-to-end Proboscis hit: target carries `stirge-attached` with the correct `sourceCharacterId`.
4. While attached, the stirge cannot make Proboscis attacks (gate throws).
5. `planStirgeDrain` emits `DamageApplied` with 2-8 necrotic on the target.
6. `planStirgeDrain` without an attached target throws.
7. `planDetachStirge` removes the condition AND the stirge can attack again post-detach.
8. Stirge statblock `traits: []` (the wiring isn't via a Custom marker).

**Audit:**
- *RAW match*: hit damage + attach + while-attached attack-block + per-turn drain + action-cost detach all match SRD exactly. The "5 ft of movement to detach" arm is documented as consumer-managed.
- *Names*: `STIRGE_ATTACHED_CONDITION_ID` / `STIRGE_PROBOSCIS_WEAPON_ID` constants in attack.ts; `findStirgeAttachedTarget` is intention-revealing; `planStirgeDrain` / `planDetachStirge` follow the verb-object naming used by sibling planners.
- *DRY*: damage emission mirrors lands-aid / falling; action-consumption mirrors sacred-weapon's bonus-action pattern; attack-block mirrors the addled gate. No new abstractions.
- *SRP*: each new piece does one thing. The drain planner emits damage; the detach planner removes the condition; the attack gate rejects a single weapon-id case.
- *Magic numbers*: `STIRGE_DRAIN_DIE = 4` + `STIRGE_DRAIN_DICE = 2` are named constants citing the SRD entry's `2d4` directly.
- *Mechanical outcomes asserted*: 8 cases pin (a) the wire shapes, (b) the attach path, (c) the attack-block, (d) the drain damage range + source, (e) the no-target error, (f) the detach round-trip.
- *Tests*: every new code path has a case that would fail without the change (the condition, the weapon, the gate, the drain planner, the detach planner).

**Pattern-check**: the "source-keyed marker condition + dedicated tick planner + action-cost reverser" trio is the canonical shape for any future "attaches to / grapples to / mounts onto" mechanic. The 2024 MM has several similar shapes (Roper Tendril attach + drag, Mimic Adhesive grapple, Cloaker Tail attach) that aren't yet in the pack but will reuse this pattern. The slice intentionally doesn't introduce a generic "Attached" base condition because the per-source mechanics differ (Stirge drains HP; Roper drags + restrains; Mimic adheres without drain) — each future user will mirror the slice-490 pattern with its own source-keyed condition + planner. No regression risk: the only existing `stirge-*` content references are in this slice's own additions.

**Engine + content (slice 489): Hippogriff Flyby + movement-modality on MoveIntent**

Closes the Hippogriff Flyby slot on the slice-478 deferred follow-up. First user of a new movement-modality marker on `MoveIntent`; future "movement-mode-keyed" mechanics (e.g. swim-only, climb-only, fly-only) reuse the same field.

RAW (SRD 5.2.1 Hippogriff, CR 1): "Flyby. The hippogriff doesn't provoke an Opportunity Attack when it flies out of an enemy's reach."

**Engine** ([src/engine/plan/movement.ts](src/engine/plan/movement.ts)):
- New optional `movementMode?: 'walk' | 'fly' | 'climb' | 'swim'` field on `MoveIntent`. Default 'walk' preserves pre-489 behavior; the field is currently load-bearing only for Flyby OA suppression. Other modes (`'climb'`, `'swim'`) are accepted for future-proofing but don't yet drive distinct behavior.
- New `FLYBY_STATBLOCKS = {'hippogriff'}` allowlist + `moverHasFlyby(character)` helper. Mirrors the slice-475 `CUNNING_ACTION_STATBLOCKS` shape. In the OA-emission loop, skip the per-reactor `OpportunityAvailable` emission when the mover has Flyby AND `intent.movementMode === 'fly'`. The disengage / Withdraw / reach-checking logic is untouched; this is a single additive gate.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Hippogriff statblock gains `traits: [{ kind: 'Custom', handlerId: 'flyby' }]`. The handlerId string is mentioned in `src/engine/plan/movement.ts` (in the `FLYBY_STATBLOCKS` comment + the slice-489 doc), so the pack-integrity audit accepts the marker as backed.

**Tests** at [tests/unit/engine/slice-489-hippogriff-flyby.test.ts](tests/unit/engine/slice-489-hippogriff-flyby.test.ts) - 5 cases:
1. Hippogriff statblock declares the Custom marker trait.
2. Hippogriff flying out of the hero's reach: no `OpportunityAvailable` emitted.
3. Hippogriff walking (explicit `movementMode: 'walk'`) out of reach: `OpportunityAvailable` emitted.
4. Hippogriff with default (no `movementMode`) move: `OpportunityAvailable` emitted (default is walk).
5. Pack-side structural check: only the Hippogriff in the pack carries the Flyby marker (no other monsters with fly speeds are flagged).

**Audit:**
- *RAW match*: Flyby applies only to flying movement (not walking), and only to the Hippogriff (not generic fly-speed creatures). Both pin tests reflect that. The "out of an enemy's reach" arm is unchanged from the existing OA-emission logic — Flyby just suppresses the eventual emit.
- *Names*: `FLYBY_STATBLOCKS` mirrors `CUNNING_ACTION_STATBLOCKS` (slice 475). `MovementMode` type + the `'flyby'` handlerId are intention-revealing.
- *DRY*: the allowlist + marker-trait pattern is identical to slice 475 / slice-486's once-per-long-rest plumbing.
- *SRP*: one new field on `MoveIntent`; one new gate in the OA-emission loop; one new marker on one statblock.
- *Magic numbers*: none added (the 5-foot MELEE_REACH constant in the loop is unchanged).
- *Mechanical outcomes asserted*: 5 cases pin the suppression gate, the negative cases (walking + no mode + non-Hippogriff), and the structural marker.
- *Tests*: would fail without the engine change (the OA-emit would always fire) AND without the content change (the FLYBY_STATBLOCKS allowlist would have no live user).

**Pattern-check**: the `MovementMode` enum is forward-compatible with future movement-mode-gated mechanics: Climb Speed creatures that bypass certain difficult-terrain costs (a future "spider-climb"-style trait), Water Breathing creatures that don't drown only during 'swim' moves, etc. The `OpportunityAvailable` emission is the only existing gate keyed on movement; adding more would follow the same shape (check mover trait + movementMode, skip the emit). The Hippogriff is currently the only Flyby-trait user in the 2024 SRD pack — the wider 2024 MM has Couatl Flyby and Pegasus Flyby (not yet in the pack); they'll add their `statblockId` to `FLYBY_STATBLOCKS` when authored.

**Engine + content (slice 488): Cockatrice Petrifying Bite + recurring-save `fixedDC` + `escalateToCondition` arm**

Closes the Cockatrice slot on the slice-477 "iconic beast/monstrosity traits" deferred list (archived to [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) with this slice).

RAW (SRD 5.2.1 Cockatrice, CR 1/2): "Petrifying Bite. Melee Attack Roll: +3, reach 5 ft. Hit: 3 (1d4 + 1) Piercing damage. If the target is a creature, it is subjected to the following effect. Constitution Saving Throw: DC 11. First Failure: The target has the Restrained condition. The target repeats the save at the end of its next turn if it is still Restrained, ending the effect on itself on a success. Second Failure: The target has the Petrified condition, instead of the Restrained condition, for 24 hours."

Two coordinated extensions to the recurring-save machinery, plus one canonical content user.

**Engine** ([src/schemas/content/condition.ts](src/schemas/content/condition.ts), [src/engine/plan/recurring-save.ts](src/engine/plan/recurring-save.ts)):
- New `RecurringSaveSchema.fixedDC?: number`. When set, the recurring-save planner uses that DC and skips caster + spellcasting-class resolution. Lets monster-driven recurring saves (Cockatrice CON DC 11) repeat against a printed DC instead of a caster's spell DC. Existing condition definitions without `fixedDC` keep the spell-DC fallback.
- New `RecurringSaveSchema.onFail = 'escalateToCondition'` + companion `escalateToConditionId: string`. On a failed save, the planner emits `ConditionRemoved(currentCondition)` + `ConditionApplied(escalateTarget)` so the bearer transitions from the lighter condition to the harsher one. `sourceCharacterId` carries through from the original applied condition so the escalated condition still names the bite source. The reducer enforces immunity (statblock + effect-stack) — emission is unconditional. A refine() on the schema requires `escalateToConditionId` when `onFail === 'escalateToCondition'`.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `cockatrice-restrained-active` condition: carries Restrained's four effects directly (ModifySpeed walk 0, SetAdvantage attack disadvantage, SetAdvantage DEX-save disadvantage, GrantAdvantageToAttackers) + `recurringSave: { ability: 'CON', fixedDC: 11, trigger: 'turnEnd', onSuccess: 'removeCondition', onFail: 'escalateToCondition', escalateToConditionId: 'petrified' }`. Engine doesn't have a "condition extends condition" mechanism, so the Restrained effects are duplicated; rejecting the condition (success) removes them, escalating (fail) replaces them with Petrified.
- New `cockatrice-bite` natural weapon (1d4 piercing) with slice-319 onHit save rider: CON DC 11 → conditionOnFail `cockatrice-restrained-active`. Same shape as the Ghoul's Claw paralyzing-claw save rider.

**Doc-count update**: weapons 72 -> 73, items 535 -> 536, conditions 126 -> 127 (15 RAW + 111 -> 112 rider; effect-bearing 110 -> 111).

**Documented RAW deviation (consumer-managed)**: the 24-hour Petrified duration. The engine doesn't track hours; consumers managing extended downtime apply expiration themselves.

**Tests** at [tests/unit/engine/slice-488-cockatrice-petrification.test.ts](tests/unit/engine/slice-488-cockatrice-petrification.test.ts) - 5 cases:
1. `cockatrice-bite` weapon shape (1d4 piercing + the onHit save rider).
2. `cockatrice-restrained-active` condition shape (the four Restrained effects + the new recurringSave fields).
3. End-to-end bite: find a seed where the attack hits + target fails the save; verify `SaveRolled (CON, DC 11, success: false)` + `ConditionApplied('cockatrice-restrained-active')`.
4. `engine.plan.tickRecurringSave` on the active condition: find a fail-save seed; verify `ConditionRemoved('cockatrice-restrained-active')` + `ConditionApplied('petrified')` with `sourceCharacterId` carried through.
5. Same tick with a CON-20 hero + a pass-save seed: verify `ConditionRemoved` only, no `ConditionApplied('petrified')`.

**Audit:**
- *RAW match*: bite DC + onHit shape match the SRD entry; first-failure Restrained + second-failure Petrified arms both wired. The "ending the effect on itself on a success" clause maps to `onSuccess: 'removeCondition'`. The 24-hour duration is documented as consumer-managed.
- *Names*: `fixedDC` mirrors the existing per-instance `recurringSaveDC` shape (slice 388) and the onHit-save rider's `dc` field. `escalateToCondition` + `escalateToConditionId` follow the existing `onFail` enum + companion-string idiom (mirroring `applyConditionId` + the `condition` predicate).
- *DRY*: the new escalation arm reuses the existing `ConditionApplied` event + `sourceCharacterId` plumbing the reducer already canonicalizes. The Restrained effects are duplicated on the condition (intentional, as the engine has no "extends" mechanism for conditions); the duplication is the load-bearing reason the condition can independently track its own recurring-save metadata.
- *SRP*: the planner's fixedDC branch + escalation branch are distinct from the existing consumeAction / dodge / removeCondition arms; each handles one save-outcome case.
- *Magic numbers*: the CON DC 11 + the 1d4 damage cite the SRD entry directly in the weapon's description string.
- *Mechanical outcomes asserted*: 5 cases pin (a) weapon shape, (b) condition shape, (c) the apply-on-hit path, (d) the escalation arm, (e) the cure arm.
- *Tests*: would fail before the schema field + the planner extension + the content additions (each is load-bearing).

**Pattern-check**: swept the bestiary for other "two-failure-stage save" mechanics that could reuse the new `escalateToCondition` arm. The 2024 MM has several similar shapes (Medusa Petrifying Gaze, Catoblepas Stench-of-Death, Basilisk Petrifying Gaze, mummy-rot Bestow Curse arm) — all currently deferred from the pack but will reuse this mechanism when authored. The `fixedDC` extension also unlocks monster-source recurring saves more broadly: any future condition whose recurring-save DC is printed on the source monster (rather than derived from a caster's spell DC) can populate `fixedDC` and skip the caster-resolution path. No regression risk: existing recurring-save users (Hold Person / Hold Monster / Hideous Laughter / Confusion / Bestow Curse inactive-turn) don't set `fixedDC` and continue to use the spell-DC path.

**Engine + docs (slice 487): non-spellcaster Magic Initiate cast path + CHANGELOG archive split**

Closes the engineering gap documented at slice 486 ("planCastSpell still requires a spellcasting class — a Magic Initiate Fighter / Rogue / Barbarian carries the oncePerLongRest grant but cannot reach the planner today"). Plus a routine CHANGELOG archive split (slices 472-481 evicted to a new cohort archive to keep the live file under the 60 KB single-Read ceiling).

RAW: any character can take Magic Initiate as their Origin Feat; non-spellcasters (Fighter / Rogue / Barbarian) carry the granted cantrips + L1 spell + WIS/INT/CHA spellcasting ability via the feat, with no class-level spellcasting.

**Engine** ([src/derive/spell-dc.ts](src/derive/spell-dc.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- New optional `castingAbility?: 'INT' | 'WIS' | 'CHA'` on `ComputeSpellDCInput`. When set, the DC / attack-bonus computation uses that ability instead of the bearer's class-spellcasting ability. Existing callers without an override (spellcasters with a class) keep the class-derived path.
- `findCastingClass` now returns `string | undefined` instead of throwing. The previous throw at this point blocked non-spellcasters before any GrantSpell fallback could run; the throw moves to a richer site below.
- New `resolveCastingAbility` helper in cast-spell.ts: class first, GrantSpell fallback. Returns `undefined` only when the bearer has neither path; the caller throws an intent-revealing error (`"<name> cannot cast <spell>: no spellcasting class and no GrantSpell entry for this spell"`).
- The three mechanic planners (`planAttackMechanic`, `planSaveMechanic`, `planTrapMechanic`) now take `castingClassId: string | undefined` + a required `castingAbility: AbilityScore`, and pass both to the DC / attack derives. The class id is passed through unchanged for spellcasters; the ability override is the new lever that lets non-spellcasters compute DC from the GrantSpell entry.

The slot-availability gate is unchanged: a non-spellcaster trying to cast a leveled spell without `useFreeCast` (and not via ritual) reaches `computeAvailableSpellSlots`, which returns 0 slots and produces the existing "No spell slots of level X available" error. Cantrips skip the gate (level === 0); `useFreeCast` skips the gate (slice 486). So the only new casts unlocked here are: non-spellcaster cantrips via GrantSpell + non-spellcaster `useFreeCast` for oncePerLongRest grants.

**Tests** at [tests/unit/engine/slice-487-non-spellcaster-magic-initiate.test.ts](tests/unit/engine/slice-487-non-spellcaster-magic-initiate.test.ts) - 4 cases:
1. Fighter (Acolyte background) with Magic Initiate (Cleric) Sacred Flame cantrip casts without error.
2. Same Fighter's Sacred Flame DC = 13 (WIS 16 -> +3 mod, PB +2, base 8) - confirms the GrantSpell `spellcastingAbility: 'WIS'` drives the DC computation rather than the Fighter class (which has no spellcasting ability).
3. Same Fighter free-casts Cure Wounds via `useFreeCast: true` (emits `FreeCastUsed`, no `SpellSlotConsumed`) - confirms slice 486's flag composes with slice 487's non-spellcaster path.
4. A Fighter with no Magic Initiate (Soldier background, `preparedSpells: ['sacred-flame']` to bypass the slice-220 preparation gate) reaches the new `resolveCastingAbility` gate and throws the intent-revealing error.

**Docs (archive split)**: live [CHANGELOG.md](CHANGELOG.md) was 63 KB after slice 486; archived slices 472-481 (the post-alpha.15 iconic-encounter content sweep) to [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) per the standard playbook, leaving a one-paragraph pointer in the live file. Live drops to ~40 KB, comfortably under the 60 KB ceiling. [docs/changelog/README.md](docs/changelog/README.md) index updated. Slices 482-487 stay inline as the most-recent cohort.

**Audit:**
- *Names*: `castingAbility` mirrors the existing `classId` naming on ComputeSpellDCInput. `resolveCastingAbility` follows the verb-object idiom used by `resolveAttackDamageType` / `resolveVariantConditionId` already in the file. The renamed `findCastingClass` semantics (return optional) is documented inline.
- *DRY*: the GrantSpell fallback reuses the existing `buildEffectStack().grantedSpells()` path that slice 486's free-cast validation already uses. No new effect-stack walker.
- *SRP*: each new piece does one thing (resolve / override / throw). The existing class-derived path is preserved unchanged for spellcasters.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: 4 cases pin (a) the cantrip path, (b) the GrantSpell-derived DC, (c) the free-cast composition with slice 486, (d) the new error gate.

**Pattern-check**: the `castingAbility` override is additive on `ComputeSpellDCInput`; other callers (`src/query/character-sheet.ts`, `src/engine/index.ts`, `src/engine/plan/recurring-save.ts`, `src/engine/plan/lands-aid.ts`, `src/engine/plan/reactive-spells.ts`) keep passing only `classId` and behave unchanged. The `chooseSlotSource` helper still uses class-based slot inference; since a non-spellcaster has no slots, leveled casts without `useFreeCast` correctly throw at the slot-availability gate. Multi-class characters with both a spellcasting class AND a Magic Initiate grant still prefer the class's ability (existing behavior preserved by the "class first" ordering in `resolveCastingAbility`).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + `consumeOnIncomingAttack`, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490, to keep this file under the 60 KB single-Read ceiling).
**Tests** at [tests/unit/engine/slice-482-armor-deathdog-multiattack.test.ts](tests/unit/engine/slice-482-armor-deathdog-multiattack.test.ts) - 6 cases via `it.each` (weapon shape + statblock pattern + 2-AttackRolled chain, x 2 monsters).

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
