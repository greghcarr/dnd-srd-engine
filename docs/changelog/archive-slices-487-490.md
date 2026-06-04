# CHANGELOG archive: slices 487-490 (post-alpha.15 cohort C: non-spellcaster cast path + iconic-monster traits)

Per-slice detail for slices 487-490, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 494 to keep it under the 60 KB single-Read ceiling. Cohort: the engine-side complement to the iconic-monster trait sweep — Magic Initiate non-spellcasters can now cast their granted spells via the planner, Cockatrice + Hippogriff + Stirge ship their signature mechanics. Picks up where [archive-slices-482-486.md](archive-slices-482-486.md) leaves off. Highlights:
- Slice 487: non-spellcaster Magic Initiate cast path (`castingAbility` override on ComputeSpellDCInput + `resolveCastingAbility` GrantSpell fallback) + the prior CHANGELOG archive split.
- Slice 488: Cockatrice Petrifying Bite + RecurringSave `fixedDC` + `escalateToCondition` arm.
- Slice 489: Hippogriff Flyby + `MovementMode` on MoveIntent.
- Slice 490: Stirge Blood Drain (attach + per-turn drain + detach planners) + the prior CHANGELOG archive split.

Slices 491-494 (Boar Gore + `chargedAtTarget` fact, Web Walker + `restrained-by-web`, Death Dog disease + RecurringSave `'longRest'` trigger, True Strike + `weaponAttack` mechanic + `abilityOverride`) stay in the live CHANGELOG as the most-recent cohort.

---

**Engine + content (slice 490): Stirge Blood Drain (attach + drain + detach)**

Closes the Stirge Blood Drain slot on the slice-477 "iconic beast/monstrosity traits" deferred list. The most-iconic CR 1/8 monster in the 2024 SRD now ships its full Proboscis mechanic end-to-end, modulo one documented RAW deviation (consumer-managed "spend 5 ft of movement to detach" arm).

RAW (SRD 5.2.1 Stirge, CR 1/8): "Proboscis. Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage, and the stirge attaches to the target. While attached, the stirge can't make Proboscis attacks, and the target takes 5 (2d4) Necrotic damage at the start of each of the stirge's turns. The stirge can detach itself by spending 5 feet of its movement. The target or a creature within 5 feet of it can detach the stirge as an action."

**Engine** ([src/engine/plan/stirge-drain.ts](../../src/engine/plan/stirge-drain.ts), [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)):
- New `planStirgeDrain` planner: consumer calls at the stirge's turn-start; emits a single `DamageApplied` event with 2d4 necrotic on the stirge's attached target. Mirrors the lands-aid / falling damage emission shape (no intermediate `DamageRolled`; the damage roll is inlined since there's no attack or save resolution in front of it). Routes through `mitigateDamage` + `interceptFatalDamage` + `planConcentrationBreakOnDrop` the same way the existing damage emitters do. Throws if the stirge has no attached target.
- New `planDetachStirge` planner: action-cost detach. Consumer specifies `actorId` (the target itself or an adjacent ally) + `stirgeId`. Emits `ConditionRemoved` for `stirge-attached` on the target; consumes the actor's action when invoked by the active combatant in an active encounter (mirrors `planSacredWeapon`'s bonus-action consumption shape).
- New `findStirgeAttachedTarget(state, stirgeId)` helper exported from the planner file: walks `state.characters` for any character carrying `stirge-attached` with `sourceCharacterId === stirgeId`. Used by both planners + the attack-resolver gate.
- `resolveAttack` gate ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)): when the chosen weapon is `stirge-proboscis` AND the attacker has any character carrying `stirge-attached` sourced by them, throw `"<stirge> cannot make Proboscis attacks while attached to a target"`. Mirrors the existing slice-380 `ADDLED_CONDITION_ID` gate pattern.
- Planner-wiring audit ([tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts)): `stirgeDrain` + `detachStirge` added to `EXCLUDED_FROM_DISPATCH` (drain is a per-turn tick; detach is an action invoked by the target or an adjacent ally — neither is the standard "performIntent on the active combatant's turn" shape).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `stirge-attached` marker condition (effects: []): carries `sourceCharacterId` = the attaching stirge. Effects are intentionally empty — the condition is read by the attack resolver + the two new planners; it has no projection through the effect stack.
- New `stirge-proboscis` natural weapon (1d6 piercing) with slice-321 unconditional onHit `applyConditionId: 'stirge-attached'`. The +3 damage / +5 attack come from wielder DEX 16 + PB 2. The slice-484 stamping bakes `sourceCharacterId` = the attacker on the applied condition.
- Stirge statblock unchanged (no Custom marker trait needed; the wiring lives on the weapon + condition + planners).

**Doc-count update**: weapons 73 -> 74, items 536 -> 537, conditions 127 -> 128 (15 RAW + 112 -> 113 rider; effect-bearing 111 stays — `stirge-attached` is a marker).

**Documented RAW deviation (consumer-managed)**: the "spend 5 ft of movement to detach" arm. Same shape as Disengage's fixed-cost movement substitution; the engine doesn't yet model fractional movement-action costs. The action-cost detach arm IS wired.

**Tests** at [tests/unit/engine/slice-490-stirge-blood-drain.test.ts](../../tests/unit/engine/slice-490-stirge-blood-drain.test.ts) - 8 cases:
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

**Engine** ([src/engine/plan/movement.ts](../../src/engine/plan/movement.ts)):
- New optional `movementMode?: 'walk' | 'fly' | 'climb' | 'swim'` field on `MoveIntent`. Default 'walk' preserves pre-489 behavior; the field is currently load-bearing only for Flyby OA suppression. Other modes (`'climb'`, `'swim'`) are accepted for future-proofing but don't yet drive distinct behavior.
- New `FLYBY_STATBLOCKS = {'hippogriff'}` allowlist + `moverHasFlyby(character)` helper. Mirrors the slice-475 `CUNNING_ACTION_STATBLOCKS` shape. In the OA-emission loop, skip the per-reactor `OpportunityAvailable` emission when the mover has Flyby AND `intent.movementMode === 'fly'`. The disengage / Withdraw / reach-checking logic is untouched; this is a single additive gate.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Hippogriff statblock gains `traits: [{ kind: 'Custom', handlerId: 'flyby' }]`. The handlerId string is mentioned in `src/engine/plan/movement.ts` (in the `FLYBY_STATBLOCKS` comment + the slice-489 doc), so the pack-integrity audit accepts the marker as backed.

**Tests** at [tests/unit/engine/slice-489-hippogriff-flyby.test.ts](../../tests/unit/engine/slice-489-hippogriff-flyby.test.ts) - 5 cases:
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

Closes the Cockatrice slot on the slice-477 "iconic beast/monstrosity traits" deferred list (archived to [docs/changelog/archive-slices-472-481.md](../../docs/changelog/archive-slices-472-481.md) with this slice).

RAW (SRD 5.2.1 Cockatrice, CR 1/2): "Petrifying Bite. Melee Attack Roll: +3, reach 5 ft. Hit: 3 (1d4 + 1) Piercing damage. If the target is a creature, it is subjected to the following effect. Constitution Saving Throw: DC 11. First Failure: The target has the Restrained condition. The target repeats the save at the end of its next turn if it is still Restrained, ending the effect on itself on a success. Second Failure: The target has the Petrified condition, instead of the Restrained condition, for 24 hours."

Two coordinated extensions to the recurring-save machinery, plus one canonical content user.

**Engine** ([src/schemas/content/condition.ts](../../src/schemas/content/condition.ts), [src/engine/plan/recurring-save.ts](../../src/engine/plan/recurring-save.ts)):
- New `RecurringSaveSchema.fixedDC?: number`. When set, the recurring-save planner uses that DC and skips caster + spellcasting-class resolution. Lets monster-driven recurring saves (Cockatrice CON DC 11) repeat against a printed DC instead of a caster's spell DC. Existing condition definitions without `fixedDC` keep the spell-DC fallback.
- New `RecurringSaveSchema.onFail = 'escalateToCondition'` + companion `escalateToConditionId: string`. On a failed save, the planner emits `ConditionRemoved(currentCondition)` + `ConditionApplied(escalateTarget)` so the bearer transitions from the lighter condition to the harsher one. `sourceCharacterId` carries through from the original applied condition so the escalated condition still names the bite source. The reducer enforces immunity (statblock + effect-stack) — emission is unconditional. A refine() on the schema requires `escalateToConditionId` when `onFail === 'escalateToCondition'`.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `cockatrice-restrained-active` condition: carries Restrained's four effects directly (ModifySpeed walk 0, SetAdvantage attack disadvantage, SetAdvantage DEX-save disadvantage, GrantAdvantageToAttackers) + `recurringSave: { ability: 'CON', fixedDC: 11, trigger: 'turnEnd', onSuccess: 'removeCondition', onFail: 'escalateToCondition', escalateToConditionId: 'petrified' }`. Engine doesn't have a "condition extends condition" mechanism, so the Restrained effects are duplicated; rejecting the condition (success) removes them, escalating (fail) replaces them with Petrified.
- New `cockatrice-bite` natural weapon (1d4 piercing) with slice-319 onHit save rider: CON DC 11 → conditionOnFail `cockatrice-restrained-active`. Same shape as the Ghoul's Claw paralyzing-claw save rider.

**Doc-count update**: weapons 72 -> 73, items 535 -> 536, conditions 126 -> 127 (15 RAW + 111 -> 112 rider; effect-bearing 110 -> 111).

**Documented RAW deviation (consumer-managed)**: the 24-hour Petrified duration. The engine doesn't track hours; consumers managing extended downtime apply expiration themselves.

**Tests** at [tests/unit/engine/slice-488-cockatrice-petrification.test.ts](../../tests/unit/engine/slice-488-cockatrice-petrification.test.ts) - 5 cases:
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

**Engine** ([src/derive/spell-dc.ts](../../src/derive/spell-dc.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- New optional `castingAbility?: 'INT' | 'WIS' | 'CHA'` on `ComputeSpellDCInput`. When set, the DC / attack-bonus computation uses that ability instead of the bearer's class-spellcasting ability. Existing callers without an override (spellcasters with a class) keep the class-derived path.
- `findCastingClass` now returns `string | undefined` instead of throwing. The previous throw at this point blocked non-spellcasters before any GrantSpell fallback could run; the throw moves to a richer site below.
- New `resolveCastingAbility` helper in cast-spell.ts: class first, GrantSpell fallback. Returns `undefined` only when the bearer has neither path; the caller throws an intent-revealing error (`"<name> cannot cast <spell>: no spellcasting class and no GrantSpell entry for this spell"`).
- The three mechanic planners (`planAttackMechanic`, `planSaveMechanic`, `planTrapMechanic`) now take `castingClassId: string | undefined` + a required `castingAbility: AbilityScore`, and pass both to the DC / attack derives. The class id is passed through unchanged for spellcasters; the ability override is the new lever that lets non-spellcasters compute DC from the GrantSpell entry.

The slot-availability gate is unchanged: a non-spellcaster trying to cast a leveled spell without `useFreeCast` (and not via ritual) reaches `computeAvailableSpellSlots`, which returns 0 slots and produces the existing "No spell slots of level X available" error. Cantrips skip the gate (level === 0); `useFreeCast` skips the gate (slice 486). So the only new casts unlocked here are: non-spellcaster cantrips via GrantSpell + non-spellcaster `useFreeCast` for oncePerLongRest grants.

**Tests** at [tests/unit/engine/slice-487-non-spellcaster-magic-initiate.test.ts](../../tests/unit/engine/slice-487-non-spellcaster-magic-initiate.test.ts) - 4 cases:
1. Fighter (Acolyte background) with Magic Initiate (Cleric) Sacred Flame cantrip casts without error.
2. Same Fighter's Sacred Flame DC = 13 (WIS 16 -> +3 mod, PB +2, base 8) - confirms the GrantSpell `spellcastingAbility: 'WIS'` drives the DC computation rather than the Fighter class (which has no spellcasting ability).
3. Same Fighter free-casts Cure Wounds via `useFreeCast: true` (emits `FreeCastUsed`, no `SpellSlotConsumed`) - confirms slice 486's flag composes with slice 487's non-spellcaster path.
4. A Fighter with no Magic Initiate (Soldier background, `preparedSpells: ['sacred-flame']` to bypass the slice-220 preparation gate) reaches the new `resolveCastingAbility` gate and throws the intent-revealing error.

**Docs (archive split)**: live [CHANGELOG.md](../../CHANGELOG.md) was 63 KB after slice 486; archived slices 472-481 (the post-alpha.15 iconic-encounter content sweep) to [docs/changelog/archive-slices-472-481.md](../../docs/changelog/archive-slices-472-481.md) per the standard playbook, leaving a one-paragraph pointer in the live file. Live drops to ~40 KB, comfortably under the 60 KB ceiling. [docs/changelog/README.md](../../docs/changelog/README.md) index updated. Slices 482-487 stay inline as the most-recent cohort.

**Audit:**
- *Names*: `castingAbility` mirrors the existing `classId` naming on ComputeSpellDCInput. `resolveCastingAbility` follows the verb-object idiom used by `resolveAttackDamageType` / `resolveVariantConditionId` already in the file. The renamed `findCastingClass` semantics (return optional) is documented inline.
- *DRY*: the GrantSpell fallback reuses the existing `buildEffectStack().grantedSpells()` path that slice 486's free-cast validation already uses. No new effect-stack walker.
- *SRP*: each new piece does one thing (resolve / override / throw). The existing class-derived path is preserved unchanged for spellcasters.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: 4 cases pin (a) the cantrip path, (b) the GrantSpell-derived DC, (c) the free-cast composition with slice 486, (d) the new error gate.

**Pattern-check**: the `castingAbility` override is additive on `ComputeSpellDCInput`; other callers (`src/query/character-sheet.ts`, `src/engine/index.ts`, `src/engine/plan/recurring-save.ts`, `src/engine/plan/lands-aid.ts`, `src/engine/plan/reactive-spells.ts`) keep passing only `classId` and behave unchanged. The `chooseSlotSource` helper still uses class-based slot inference; since a non-spellcaster has no slots, leveled casts without `useFreeCast` correctly throw at the slot-availability gate. Multi-class characters with both a spellcasting class AND a Magic Initiate grant still prefer the class's ability (existing behavior preserved by the "class first" ordering in `resolveCastingAbility`).
