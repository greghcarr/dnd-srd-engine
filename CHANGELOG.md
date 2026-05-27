# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

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

**Engine (slice 486): once-per-long-rest free-cast resource tracking**

Closes the slice-469 open follow-up. Adds engine-enforced tracking of which `oncePerLongRest`-granted spells have used their free cast since the last long rest, so Magic Initiate's L1 spell, Warlock Contact Patron, and any future `oncePerLongRest` GrantSpell stop being consumer-managed.

RAW (SRD 5.2.1 Magic Initiate): "You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have."

**Engine surface (additive, no breaking changes):**
- New `useFreeCast?: boolean` flag on `CastSpellIntent` ([src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)). When `true`, validates: (a) the spell has a `GrantSpell` entry with `preparation: 'oncePerLongRest'` in the bearer's effect stack; (b) the spell is not in `character.usedFreeCastSpellIds`. Throws an intent-revealing error on either failure. Implies `noSlotCost: true` and emits a `FreeCastUsed` event after `SpellCastDeclared`.
- New `usedFreeCastSpellIds: string[]` field on the runtime `Character` schema ([src/schemas/runtime/character.ts](src/schemas/runtime/character.ts)). Defaults to `[]`; pre-slice-486 saves load clean.
- New `FreeCastUsedEvent` ([src/schemas/events/spellcasting.ts](src/schemas/events/spellcasting.ts)) with reducer `applyFreeCastUsed` appending the spellId (deduped by id).
- `applyLongRestEnded` ([src/engine/reducers/rest.ts](src/engine/reducers/rest.ts)) clears `usedFreeCastSpellIds` alongside the existing `spellSlotsUsed = {}` / `pactSlotsUsed = 0` resets.
- Transcript formatting case for `FreeCastUsed` ([tests/transcript.ts](tests/transcript.ts)).

**Tests** at [tests/unit/engine/slice-486-free-cast.test.ts](tests/unit/engine/slice-486-free-cast.test.ts) - 5 cases:
1. A Magic Initiate (Cleric) cast with `useFreeCast: true` emits `FreeCastUsed`, no `SpellSlotConsumed` or `PactSlotConsumed`.
2. After the cast, `character.usedFreeCastSpellIds` includes the spellId.
3. A second `useFreeCast: true` cast of the same spell before a long rest throws.
4. `useFreeCast: true` on a spell lacking an `oncePerLongRest` grant throws.
5. `LongRestEnded` clears the list and the next free cast succeeds.

**Audit:**
- *RAW match*: the free-cast / slot-cast / long-rest-reset semantics match the 2024 Magic Initiate text. Whether the player chooses to cast via the free cast or a regular slot is preserved (the existing slot path is untouched; `useFreeCast` is the new opt-in).
- *Names*: `useFreeCast` mirrors `noSlotCost` / `ignorePreparation` (existing per-cast modifier flags). `usedFreeCastSpellIds` mirrors `spellSlotsUsed` / `pactSlotsUsed` (per-character per-rest tracking).
- *DRY*: the long-rest reset reuses the same `applyLongRestEnded` loop that already resets slots, exhaustion, hit-dice, item time budgets. The event + reducer follow the existing `SpellSlotConsumed` pattern.
- *SRP*: each new piece does one thing (validate / emit / reduce / reset). The existing `findCastingClass` + slot-consumption logic is unchanged.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: 5 cases pin validation gates, event emission, state mutation, and long-rest reset.
- *Tests*: every new code path has a case that would fail without the change (the validate gate, the FreeCastUsed emission, the reducer, the long-rest clear).

**Documented separate gap (not closed here)**: `planCastSpell` still requires the bearer to have a spellcasting class (the `findCastingClass` gate). A Magic Initiate Fighter / Rogue / Barbarian can carry the `oncePerLongRest` grant but cannot reach the planner today. The test character is a Cleric to scope this slice tightly; the broader non-spellcaster-Magic-Initiate path needs its own slice (the planner would need to route DC computation through the `GrantSpell.spellcastingAbility` instead of the class's spellcasting ability when there's no spellcasting class).

**Pattern-check**: swept the codebase for other `oncePerLongRest`-shaped resources that could opt into the new mechanism. Divine Intervention (Cleric L10) is the only other current user of "free cast on a oncePerLongRest cadence" but is already wired through a dedicated `firedThisLongRest` trigger-counter mechanism (different shape — uses the trigger-counter family rather than per-spell tracking, since it's a one-shot per long rest rather than a specific spell grant). No other current pack content uses the GrantSpell `oncePerLongRest` preparation beyond Magic Initiate (3 variants) and Warlock Contact Patron, all of which now benefit from the new tracker.

**Content (slice 485): Magic Initiate (Druid) - third variant wired**

Closes the slice-469 open follow-up. Pure content: the `magic-initiate-druid` feat had been in the pack as an `effects: []` stub; this slice fills in the same OfferChoice + GrantSpell pattern slice 469 established for the Cleric and Wizard variants, scoped to the Druid spell list available in the starter pack.

RAW (SRD 5.2.1 Magic Initiate, Druid list): two Druid cantrips of the player's choice (always-prepared) + one Druid level-1 spell (oncePerLongRest free cast plus castable via owned slots).

Pack additions ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- `magic-initiate-druid-cantrips`: oneOf:2 OfferChoice across all 11 Druid cantrips currently in the pack (guidance, druidcraft, mending, message, poison-spray, produce-flame, resistance, shillelagh, spare-the-dying, starry-wisp, elementalism). Each option's effects: `GrantSpell preparation:'always-prepared' spellcastingAbility:'WIS'`.
- `magic-initiate-druid-l1`: oneOf:1 OfferChoice across all 18 Druid L1 spells in the pack (detect-magic, cure-wounds, healing-word, thunderwave, faerie-fire, charm-person, animal-friendship, create-or-destroy-water, detect-poison-and-disease, entangle, fog-cloud, goodberry, jump, longstrider, protection-from-evil-and-good, purify-food-and-drink, speak-with-animals, ice-knife). Each option's effects: `GrantSpell preparation:'oncePerLongRest' spellcastingAbility:'WIS'`.

The `spellcastingAbility` is hard-coded to WIS (the canonical Druid default per RAW); the player choice across INT/WIS/CHA stays deferred (same follow-up the Cleric / Wizard variants carry).

**Tests** at [tests/unit/engine/slice-485-magic-initiate-druid.test.ts](tests/unit/engine/slice-485-magic-initiate-druid.test.ts) - 4 cases: feat ships two OfferChoice effects with correct oneOf counts; every cantrip option grants a real druid cantrip with `always-prepared` + WIS; every L1 option grants a real druid L1 spell with `oncePerLongRest` + WIS; a PC who picks Druidcraft + Guidance + Goodberry has all three granted to the effect stack.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Magic Initiate. The Druid spell list matches the pack's wider Druid catalog. The `always-prepared` / `oncePerLongRest` preparation split matches the Cleric / Wizard variants exactly (and the RAW free-cast semantics).
- *Names*: choiceIds follow the `magic-initiate-{class}-{cantrips|l1}` convention.
- *DRY*: identical shape to the Cleric and Wizard variants from slice 469.
- *Mechanical outcomes asserted*: every option's GrantSpell shape is verified against the real spell catalog; the integration test pins one canonical choice path end-to-end.

**Pattern-check**: the three "Magic Initiate" variants now form a complete cohort (Cleric / Wizard / Druid). No background origin feat references Druid Magic Initiate yet (Acolyte -> Cleric, Sage -> Wizard, Criminal / Soldier -> other origin feats), so the feat is reachable only via repeatable-feat selection at level-up. That's RAW: the player can repeat Magic Initiate for a different list. The once-per-long-rest free-cast resource tracking (slice 469 open follow-up) is still consumer-managed across all three variants.

**Engine + content (slice 484): Worg Bite + `consumeOnIncomingAttack` + onHit autoExpiry stamping**

Closes the slice-477 deferred Worg row. Three coordinated additions: a new condition-schema field, an attack-resolver helper + call site, and an extension to the onHit `applyConditionId` rider so the condition's declarative `autoExpiry` actually fires.

RAW (SRD 5.2.1 Worg, CR 1/2): "Bite. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage, and the next attack roll made against the target before the start of the worg's next turn has Advantage."

**Engine** ([src/schemas/content/condition.ts](src/schemas/content/condition.ts), [src/engine/plan/attack.ts](src/engine/plan/attack.ts)):
- New optional `consumeOnIncomingAttack: boolean` field on `ConditionSchema`, the target-side mirror of the slice-387 `consumeOnAttack`. When the bearer is the TARGET of an attack, the resolver removes any condition flagged `consumeOnIncomingAttack` so a rider (typically `GrantAdvantageToAttackers`) applies to exactly one incoming attack.
- New `buildConsumeOnIncomingAttackRemovals(target, content, at)` helper alongside the existing `buildConsumeOnAttackRemovals`. No source-keyed filter (RAW "next attack" doesn't constrain the attacker); can be added later if a future shape needs it.
- Call site folded into the same `applyAll` that processes the attacker-side consumption (line ~881), and the resulting events appended to both return branches (miss / hit).
- `applyRiderCondition` now reads the rider condition's `autoExpiry` and stamps `expiresOnRound` + `expiryTrigger` on the emitted `ConditionApplied` when inside an active encounter. Mirrors the [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts) treatment of spell buffs. Outside an encounter, the consumer manages expiry (existing slice-286 behavior preserved). Conditions without `autoExpiry` are unaffected.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New condition `worg-bite-targeted`: `effects: [GrantAdvantageToAttackers]`, `consumeOnIncomingAttack: true`, `autoExpiry: { afterRounds: 1, trigger: 'turnStart' }`.
- New natural weapon `worg-bite`: 1d8 piercing + `onHit: [{ applyConditionId: 'worg-bite-targeted' }]`. The +3 damage / +5 attack come from wielder STR 16 + PB 2.

**Doc-count update**: weapons 71 -> 72, items 534 -> 535, conditions 125 -> 126 (15 RAW + 110 -> 111 rider; effect-bearing 109 -> 110).

**Tests** at [tests/unit/engine/slice-484-worg-bite.test.ts](tests/unit/engine/slice-484-worg-bite.test.ts) - 5 cases: weapon shape; condition shape (effects + consumeOnIncomingAttack + autoExpiry); onHit applies the buff to the target; an attack against a buffed target rolls with Advantage AND the buff is consumed; a second attack rolls without Advantage (proves consumption).

**Audit:**
- *RAW match*: Bite damage + RAW phrasing pinned by `worg-bite` description; the `next attack roll made against the target` + `before the start of the worg's next turn` envelope is the union of `consumeOnIncomingAttack` (the "next attack" arm) + `autoExpiry afterRounds:1 turnStart` (the envelope when no attack happens). Both arms are exercised by separate tests.
- *Names*: `consumeOnIncomingAttack` mirrors the existing `consumeOnAttack` family naming exactly. `worg-bite-targeted` follows the `*-active` / `*-targeted` convention for transient applied conditions.
- *DRY*: the helper mirrors `buildConsumeOnAttackRemovals` line-for-line. The autoExpiry stamping pattern in `applyRiderCondition` mirrors the cast-spell.ts site. No new abstraction.
- *SRP*: each new piece does one thing. Helper = list removals. Resolver call site = thread them. Stamping = stamp expiry. New schema field = declare consumption-direction. New condition = declare buff shape. New weapon = declare delivery.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: 5 cases pin (a) the wire shapes, (b) the apply-on-hit path, (c) the consume-on-incoming-attack arm, (d) the post-consumption no-advantage second attack.
- *Tests*: would fail before the engine + content change (the schema field, the helper, the call site, the autoExpiry stamping, and both content entries are each load-bearing).

**Pattern-check**: the autoExpiry stamping extension may help close the slice-286 family of consumer-managed "until start of X's next turn" durations on other onHit applyConditionId riders (Couatl's Bite, Giant Centipede's Bite, Sprite's Enchanting Bow, Wyvern's Sting, Ettercap's Bite, Merrow's Bite — all currently consumer-managed because they share generic conditions like `poisoned` / `charmed` that can't carry autoExpiry without over-applying to other sources). Closing those needs per-source unique conditions (e.g. `couatl-poisoned`, `wyvern-poisoned`) that each carry their own autoExpiry; deferred as a separate authoring sweep. The Worg case is the first that owns a unique condition AND has a "next attack" arm, so it's the natural canonical user.

**Pattern-check (audit hardening)**: while writing this slice, the `worg-bite-targeted` condition failed [tests/audit/pack-integrity.test.ts](tests/audit/pack-integrity.test.ts)'s "every condition with effects is reachable" check because the audit's reference-walker enumerated only `conditionId` / `allyConditionId` / `conditionOnFail` / `bearerConditionId`, missing the `applyConditionId` and `conditionOnSuccess` keys on `onHit` riders + the `eligibleConditionIds` arrays on spell `remove-condition` mechanics. That was a pre-existing under-walking of reference shapes (mirror of the slice-301 false-positive lesson the audit's own comments warn about). Extended the walker to enumerate `applyConditionId` + `conditionOnSuccess` + `eligibleConditionIds` so the audit catches the full structural-reference surface, not just the legacy subset. Existing wired conditions stay reachable through unchanged paths; this only adds reference paths the audit previously missed.

**Engine + content (slice 483): Boar Bloodied Fury + `bearer.bloodied` predicate fact**

Smallest engine slice from the slice-477 deferred list (the Boar's Bloodied Fury trait was tracked there as needing a new predicate fact). Adds the fact and the canonical content user.

RAW (SRD 5.2.1 Boar): "Bloodied Fury. While Bloodied, the boar has Advantage on attack rolls." 2024 Bloodied semantics: HP at or below half the creature's HP maximum.

**Engine** ([src/engine/plan/attack.ts](src/engine/plan/attack.ts)): adds `['bearer.bloodied', attacker.hp.current <= Math.floor(attacker.hp.max / 2)]` to the `attackerSelfAdvantageFacts` map. Unlike `bearer.lightLevel` (slice 451) and `bearer.canSeeFearSource` (slice 276) - scene facts the engine can't observe and that route through consumer input - bloodied is **derived engine-side** from character HP that the engine already owns. No consumer wiring is needed. The fact name follows the existing `bearer.*` naming convention so future "while bloodied" features (CR-1+ bestiary has several) gate on one canonical fact name.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Boar statblock gains one trait: `SetAdvantage on:'attack' mode:'advantage' condition: eq path:'bearer.bloodied' value:true`. Same shape as the existing `bearer.lightLevel`-gated SetAdvantage entries on the Kobold Warrior / Drow / Duergar / Goblin Boss family (slice 451/452 sunlight sensitivity).

**Tests** at [tests/unit/engine/slice-483-boar-bloodied-fury.test.ts](tests/unit/engine/slice-483-boar-bloodied-fury.test.ts) - 6 cases: trait shape on the statblock; boundary semantics at full HP, just above half, exactly half on odd max (floor), 1 HP, exactly half on even max.

**Audit:**
- *RAW match*: the Bloodied threshold matches the 2024 PHB glossary entry (`HP <= floor(max / 2)`); the boundary tests pin both the equal-to-half case (advantage fires) and the just-above case (no advantage).
- *Names*: `bearer.bloodied` mirrors the existing `bearer.lightLevel` / `bearer.canSeeFearSource` / `bearer.canSeeAttacker` / `bearer.hasIncapacitated` / `bearer.speedZero` family.
- *DRY*: re-used the half-HP idiom (`Math.floor(target.hp.max / 2)`) already established in [src/engine/plan/preserve-life.ts](src/engine/plan/preserve-life.ts).
- *SRP*: one fact added at one site; the SetAdvantage primitive already supports `bearer.*`-gated predicates.
- *Magic numbers*: the `2` divisor cites the 2024 Bloodied definition inline.
- *Mechanical outcomes asserted*: six boundary cases pin the predicate logic; trait shape pins the content wire.
- *Tests*: would have failed before the engine change (the fact wouldn't be in the facts map) and before the content change (Boar had `traits: []`).

**Pattern-check**: swept the bestiary + magic items for other RAW "while bloodied" mechanics that could now wire on the new fact. Boar is the only current pack user; the 2024 MM has several CR-2+ creatures with "Bloodied" triggers (e.g. Cyclops Wounded Fury, Tarrasque Frenzy, various dragons' Bloodied Breath recharge) that aren't in the starter pack yet but will all reuse this fact when authored. No regression risk: the fact is added to the attacker-side facts only, so existing predicates not referencing `bearer.bloodied` are unaffected.

**Content (slice 482): Animated Armor + Death Dog Multiattacks**

Seventh and eighth users of the slice-464 `MonsterMultiattack` content field. Both CR 1; both "two of same weapon" shapes.

RAW (SRD 5.2.1):
- **Animated Armor (CR 1)**: "Multiattack. The armor makes two Slam attacks. Slam: 1d6 bludgeoning."
- **Death Dog (CR 1)**: "Multiattack. The death dog makes two Bite attacks. Bite: 1d4 piercing + CON DC 12 disease arm (Poisoned + HP-max decay on repeated fails)."

Pure-content slice. Two new natural weapons (`animated-armor-slam`, `death-dog-bite`) + multiattack declarations on both statblocks.

**Deferred**: Death Dog's disease arm (CON save -> Poisoned + HP-max-decay on subsequent fails). Needs (a) repeating long-rest saves and (b) HP-max-decay accumulator. The base bite ships; the disease rider stays open.

**Doc-count update**: weapons 69 -> 71, items 532 -> 534.

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
