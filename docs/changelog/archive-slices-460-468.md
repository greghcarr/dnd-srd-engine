# CHANGELOG archive: slices 460-468 (L1 playability arc, part 3 - background mechanics)

Per-slice detail for slices 460-468, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 470 to keep it under the 60 KB single-Read ceiling. Cohort: the L1 background-mechanics phase of the level-by-level playability arc, picking up where [archive-slices-451-459.md](archive-slices-451-459.md) leaves off. Highlights:
- Slice 460: the previous CHANGELOG archive (451-459).
- Slice 461: Human Skillful trait.
- Slice 462: Ghoul Bite natural weapon.
- Slice 463: Cleric Channel Divinity (Turn Undead) - L2 caster playability.
- Slice 464: monster Multiattack content declaration (canonical user: Ghoul).
- Slice 465: Goliath species, closing the last empty playable species at L1.
- Slice 466: backgrounds auto-project their Origin Feat + Sage RAW correction.
- Slice 467: Savage Attacker (Origin Feat) - the Soldier background lights up end-to-end.
- Slice 468: Alert (Origin Feat) - the Criminal background lights up end-to-end.

The L1 background arc closes in slice 469 (Magic Initiate x 2, Sage + Acolyte), which stays in the live CHANGELOG as the most-recent slice.

---

**Engine + content (slice 468): Alert (Origin Feat) - the Criminal background lights up end-to-end**

Second Origin Feat shipped on the Soldier-pattern from slice 467. RAW (SRD 5.2.1 Alert) has two arms; both are wired in this slice.

**Initiative Proficiency arm** (RAW: "When you roll Initiative, you can add your Proficiency Bonus to the roll"): the existing `planRollInitiative` ([src/engine/plan/encounter.ts](../../src/engine/plan/encounter.ts)) now folds the effect-stack `modifierSum('initiative')` into `InitiativeRoll.modifier`, alongside the DEX modifier that was already there. The `alert` feat ships `effects: [{ kind: 'AddModifier', target: 'initiative', value: { kind: 'profBonus' } }]`. Auto-projects through the slice-466 background pipeline: every Criminal gets `+ PB` to initiative automatically.

**Initiative Swap arm** (RAW: "Immediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition"): new planner + event + reducer.

- New planner [planSwapInitiative](../../src/engine/plan/encounter.ts) ships as `engine.plan.swapInitiative({ encounterId, swapperId, allyId })`. Validates: encounter status is 'planning' (RAW "immediately after you roll Initiative" — before combat starts), both combatants are in the encounter, neither has the Incapacitated condition, swapper has `alert` on their effective feat list, and swapperId !== allyId. The "willing ally" predicate is consumer-modeled (the engine has no party / allegiance graph); the planner trusts the consumer's designation.
- New event `InitiativeSwapped` ([src/schemas/events/encounter.ts](../../src/schemas/events/encounter.ts)) carries the swap pair plus both pre-swap initiative totals (for transcript / replay clarity). Wired into `EventSchema`, `EVENT_TYPES`, the typed exports, `apply.ts` switch, and the transcript formatter.
- New reducer [applyInitiativeSwapped](../../src/engine/reducers/encounter.ts) exchanges the two combatants' `initiative` values and recomputes `initiativeOrder` across all combatants (the same descending sort `applyInitiativeRolled` runs) so a subsequent swap or EncounterStarted reads a consistent order.

**Planner-wiring**: `swapInitiative` joins `rollInitiative` in the encounter-lifecycle allowlist on [tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts) — both are sequenced explicitly by the consumer at initiative time, not invoked through the `performIntent` dispatch (same shape as `createEncounter`, `startEncounter`, `beginFirstTurn`).

**Tests** at [tests/unit/engine/slice-468-alert.test.ts](../../tests/unit/engine/slice-468-alert.test.ts) — 9 cases: Criminal initiative folds +2 (DEX) + +2 (PB) = +4 modifier; Soldier (no alert) gets only +2; happy-path swap exchanges initiative values + new event carries pre-swap totals; reject swap by featless attacker; reject when swapper or ally is Incapacitated (two cases); reject self-swap; reject swap after EncounterStarted; reject reorders combatants array by post-swap initiatives across a three-combatant encounter.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Alert exactly. Initiative Proficiency = `AddModifier target:'initiative' value: profBonus`. Initiative Swap = planning-status gate + Incapacitated check on both sides + Alert-feat gate, mirroring the RAW preconditions one-for-one.
- *Names*: `planSwapInitiative` / `SwapInitiativeIntent` / `InitiativeSwapped` mirror `planRollInitiative` / `RollInitiativeIntent` / `InitiativeRolled`. `ALERT_FEAT_ID = 'alert'` extracted as a named constant.
- *DRY*: the modifier-consumption pattern matches the existing attack / save / check planners (call `effects.modifierSum(target, facts)`, fold into the roll). Initiative Swap is the third caller of `getEffectiveFeatIds` (Savage Attacker, the upcoming Magic Initiate pair, and now Alert) — that's the right slice-466 entry point for any feat-gated planner.
- *SRP*: planner validates and emits; reducer applies the state change; transcript renders it. Three concerns, three sites.
- *Magic numbers*: only the constants `ALERT_FEAT_ID` and `INCAPACITATED_CONDITION_ID`, both descriptive.
- *at-threading*: `at` propagates through to the new event.
- *Mechanical outcomes asserted*: PB folded into roll modifier for Alert holder; not folded for non-holder; swap mutates initiative + order; six different rejection paths.

**Open follow-ups:**
- **Wire Magic Initiate (Cleric / Wizard)** (Sage / Acolyte background origin feats): grants 2 cantrips + 1 L1 spell + 1 free cast per long rest. Sibling of Tiefling Fiendish Legacy spell grants. With this slice, only Magic Initiate × 2 stands between the L1 character-builder layer and "every background ships end-to-end-functional out of the box." *Still open.*
- **Soldier + Criminal in golden transcripts**: a one-line addition to an existing initiative scenario would now produce a visibly-different + 2 modifier line for a Criminal vs. equivalent Soldier, plus the new "swaps initiative" transcript line if exercised. *Still open.*

**Engine (slice 467): Savage Attacker (Origin Feat) - the Soldier background lights up end-to-end**

Slice 466 made every Soldier background auto-project the `savage-attacker` feat through the effect stack; the feat itself shipped `effects: []`. This slice wires the mechanic.

RAW (SRD 5.2.1 Savage Attacker): "You've trained to deal particularly damaging strikes. Once per turn when you hit a target with a weapon, you can roll the weapon's damage dice twice and use either roll against the target."

**New attack-intent fact** `useSavageAttacker?: boolean` on [AttackIntent](../../src/engine/plan/attack.ts) (and [ResolveAttackInput](../../src/engine/plan/attack.ts) for the lower-level reuse from cleave / opportunity / multiattack paths). Opt-in per attack — the consumer signals "spend the per-turn use on this swing." Mirrors the slice-274 / 276 / 279 / 445 / 451 consumer-coordinated fact pattern.

**Validation up front** in `resolveAttack`: rejects (a) attackers without `savage-attacker` on the slice-466 effective feat list, and (b) in-encounter attackers whose `turnUsage.savageAttackerUsedThisTurn` flag is set. The error fires before any d20 commits, so a malformed intent doesn't show up as a misleading "you missed."

**Reroll site** at the damage-roll loop: rolls two full sets of weapon dice (handling crits and Martial Arts scaling), keeps the higher-sum set, surfaces the discarded set on the new `SavageAttackerUsed` event. The reroll scopes to the **weapon's damage dice only** per RAW — modifiers, item-buff extra dice, on-hit riders, and Sneak Attack damage are not rerolled. Great Weapon Fighting's reroll-to-3 still applies to whichever set is kept (it runs against `damageRolls` after the Savage Attacker pick).

**New event** `SavageAttackerUsed` ([src/schemas/events/action-economy.ts](../../src/schemas/events/action-economy.ts)) emitted between `DamageRolled` and `DamageApplied`. Carries `discardedRolls` (the rejected dice) for transcript visibility + an optional encounter/combatant pair (omitted out-of-encounter). Wired into `EventSchema`, `EVENT_TYPES`, the typed `EventEnvelope`, `apply.ts` switch, and the transcript formatter.

**Once-per-turn enforcement**: the new reducer `applySavageAttackerUsed` sets `turnUsage.savageAttackerUsedThisTurn = true` when the event carries combatant info. `TurnUsage` schema gains the field (default false) and the encounter reducers (TurnStarted reset + planning-time defaults) clear it alongside `stunningStrikeUsedThisTurn`. Out-of-encounter calls omit the encounter+combatant ids and skip the state mutation — no turn structure to gate against — so consumers running combat tests outside an active encounter can use Savage Attacker freely (mirror of Stunning Strike's slice-design choice).

**Hit-only consumption**: RAW says "Once per turn **when you hit**." The reroll lives in the damage-roll path which executes only on a hit, so a missed swing with `useSavageAttacker=true` does not emit `SavageAttackerUsed`, does not set the turn flag, and leaves the per-turn use available for the next swing. The validation rejects only **already-used** attempts; an opt-in that misses is fine and free.

**Tests** at [tests/unit/engine/slice-467-savage-attacker.test.ts](../../tests/unit/engine/slice-467-savage-attacker.test.ts) — 4 cases: (1) seed-search for a hit, then assert `SavageAttackerUsed` emitted with non-empty `discardedRolls` and out-of-encounter fields omitted; (2) seed-search for a miss against a very-high-AC target, assert no `SavageAttackerUsed` (per-turn use preserved); (3) a Sage-background character (different origin feat) is rejected up front; (4) the kept set's sum is >= the discarded set's sum (the engine always picks the better roll).

**Audit (engine slice):**
- *RAW match*: SRD 5.2.1 Savage Attacker exactly. "Once per turn when you hit a target with a weapon" — once-per-turn gate via `turnUsage`, hit-gated by living in the damage-roll path, weapon-gated by being in the weapon attack planner (spell attacks don't go through this code).
- *Names*: `SavageAttackerUsed` mirrors `StunningStrikeAttempted` (the closest sibling: both are once-per-turn marker events emitted by the attack pipeline). The field `useSavageAttacker?` mirrors the existing consumer-coordinated boolean facts (`attackerHasAllyAdjacentToTarget?`, `lightLevel?`, etc.).
- *DRY*: per-turn gating reuses the existing `turnUsage` shape + TurnStarted reset; the reducer mirrors `applyStunningStrikeAttempted` exactly. The hit-gated event-emission pattern (event lives in `causedByEventId: damageRolled.id`) mirrors the existing on-hit rider events.
- *SRP*: planner validates and rolls; the new event records the use; the reducer updates state. Three concerns, three sites.
- *Magic numbers*: `SAVAGE_ATTACKER_FEAT_ID = 'savage-attacker'` extracted as a named constant near `CUNNING_STRIKE_LEVEL`.
- *at-threading*: single `at` from the existing planner site propagates to the new event.
- *Mechanical outcomes asserted*: reroll fires on hit; does not fire on miss; rejected for featless attacker; higher-sum set is always kept.

**Open follow-ups:**
- **Soldier background integration test** in the golden / transcript suites: a Soldier character making an attack with `useSavageAttacker: true` should be runnable as a one-line addition to an existing golden scenario, demonstrating the slice-466 + 467 chain end-to-end with a transcript line. *Still open.*
- **Wire Alert** (Criminal background origin feat): RAW "+PB to initiative; swap initiative results with a willing creature." The +PB arm fits the existing `ModifyInitiative` family; the swap is a new mechanic. *Still open.*
- **Wire Magic Initiate (Cleric / Wizard)** (Sage / Acolyte background origin feats): grants 2 cantrips + 1 L1 spell + 1 free cast / long rest. Sibling of Tiefling Fiendish Legacy spell grants. *Still open.*

**Engine + content (slice 466): backgrounds auto-project their Origin Feat + Sage RAW correction**

Pre-slice, every 2024 background ([Soldier](../../src/content/packs/starter-pack.json), Sage, Criminal, Acolyte) shipped with the correct skill / tool / language / origin-feat fields, but the engine only projected the **first three** through the effect stack. The Origin Feat (Soldier → Savage Attacker, Sage → Magic Initiate (Wizard), etc.) was descriptive metadata: a consumer who built a Soldier and forgot to also list `'savage-attacker'` in `featsTaken` got a feat-less Soldier. This slice closes that gap and adds a public helper so consumers can introspect the effective feat set.

**New behavior**: `collectFeatEffects` ([src/derive/effect-stack.ts](../../src/derive/effect-stack.ts)) walks `featsTaken ∪ background.originFeatId`, deduped. A consumer who explicitly lists the origin feat doesn't get it twice. A consumer who omits it still gets it.

**New public export** `getEffectiveFeatIds(character, content)` ([src/derive/effect-stack.ts](../../src/derive/effect-stack.ts)) returns the union as an array, in featsTaken-order with the origin feat appended if absent. Useful for character-sheet UIs surfacing "your active feats" without needing to recompute the union by hand.

**No test churn from auto-projection**: the four SRD origin feats (savage-attacker, alert, magic-initiate-cleric, magic-initiate-wizard) all still ship `effects: []` today, so projecting them is a no-op for the rendered effect stack across the 2400+ existing tests. The plumbing lights up the moment those feats are individually wired in future slices — every existing Soldier / Sage / Criminal / Acolyte character starts receiving the right RAW behavior automatically.

**Sage RAW correction**: Sage's `abilityScoreIncreases.options` was `INT / WIS / CHA` in the pack; SRD 5.2.1 ("**Ability Scores:** Constitution, Intelligence, Wisdom") says `CON / INT / WIS`. Fixed. The slice-466 audit extension would have caught this from the SRD ground truth at any prior point — it's now wired in CI so the deviation can't recur.

**Audit extension** at [tests/audit/srd-background-skill-conformance.test.ts](../../tests/audit/srd-background-skill-conformance.test.ts): the existing slice-425 audit parsed "**Skill Proficiencies:** X and Y" from `character-origins.md` and asserted pack conformance. Slice 466 extends it to also parse "**Ability Scores:** X, Y, Z" and "**Feat:** Name (Qualifier)" lines and assert the pack matches. The "(see "Feats")" cross-reference at the end of SRD feat lines is filtered out (the parser only treats parentheticals like "(Cleric)" or "(Wizard)" as feat-name qualifiers). Each of the four SRD backgrounds now contributes three asserted axes: skills (existing), ability options (new), origin feat (new). Fires on any future RAW drift from any of the three.

**Tests** at [tests/unit/engine/slice-466-background-origin-feat.test.ts](../../tests/unit/engine/slice-466-background-origin-feat.test.ts) — 7 cases: Soldier with empty `featsTaken` yields `['savage-attacker']`; consumer-explicit listing doesn't double-project; a non-origin feat coexists with the origin (union, not replace); all four SRD backgrounds carry their RAW Origin Feat through the helper; integration test with an inline pack whose origin feat carries a sentinel `GrantProficiency`, proving the auto-projection actually reaches the effect stack; Sage's ability-score options match SRD.

**Test cleanup** in [tests/unit/engine/slice-465-goliath-species.test.ts](../../tests/unit/engine/slice-465-goliath-species.test.ts): the slice-465 test predicates used overly-loose `unknown` types on the type-guard return signatures, which `tsc --noEmit` flags. Replaced the type predicates with direct `kind`-based narrowing (`grant && grant.kind === 'GrantResource'`). No behavior change.

**Contract snapshot updated** intentionally for the new public export `getEffectiveFeatIds`.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 ability-score options for all four backgrounds verified via the new audit lines. Sage corrected. Each Origin Feat name also verified.
- *Names*: `getEffectiveFeatIds` mirrors `getEffectiveSpeed` / `getEffectiveSpeeds` (the existing derive-layer "effective" helpers).
- *DRY*: union shape is computed once via the new helper; `collectFeatEffects` (and any future consumer) calls it. No duplication of the set-union logic.
- *SRP*: helper computes the set; collectFeatEffects walks the set into effects; the audit verifies the source data matches RAW.
- *Magic numbers*: none. All ids are content-driven.
- *at-threading*: not applicable (no events emitted).
- *Mechanical outcomes asserted*: helper returns correct union for the empty / already-listed / mixed cases; all four backgrounds pin to their RAW Origin Feat; integration shows the auto-projection reaches the stack; Sage matches RAW post-fix.

**Open follow-ups:**
- **Wire Savage Attacker** (RAW: "When you roll damage for a Weapon attack, you can roll the weapon's damage dice twice and use either roll. You can use this feature a number of times equal to your Proficiency Bonus..."): needs a damage-reroll planner + a per-attack consumer fact. The auto-projection plumbing will deliver it to every Soldier the moment the feat is wired. *Still open.*
- **Wire Alert** (RAW: "+ PB to initiative; you swap initiative results with a willing creature when both you and they have rolled"): needs an initiative-bonus arm (likely already supported by ModifyInitiative) plus the swap arm (new mechanic). *Still open.*
- **Wire Magic Initiate (Cleric / Wizard)**: needs the choose-a-cantrip-plus-a-L1-spell + once-per-long-rest free-cast mechanic. Sibling of Tiefling Fiendish Legacy spell grants. *Still open.*
- **Background equipment packages** (RAW: each background offers "Choose A or B" equipment): not modeled today — equipment is consumer-chosen at character build. A `BackgroundEquipmentOption` schema field could enumerate the packages for discoverability without auto-applying. *Still open.*

**Engine + content (slice 465): Goliath species - L1 playability arc closes the last empty species**

Pre-slice, Goliath was the only playable L1 species shipping with `traits: []`. RAW (SRD 5.2.1 Goliath): Medium, 35 ft speed, Humanoid + four traits — Giant Ancestry (6-option choice), Large Form (level-5+), Powerful Build (grapple-escape Advantage + carrying-capacity-as-Large), creature-type. This slice lands the engine-modelable arms for L1 + ships the rest as discoverable deferred markers, on the same content-shape conventions as the slices 444-461 species arc.

**New consumer-coordinated fact** `endingCondition?: string` on `ComputeAbilityCheckInput` ([src/derive/ability-check.ts](../../src/derive/ability-check.ts)) + `AbilityCheckIntent` ([src/engine/plan/checks.ts](../../src/engine/plan/checks.ts)). Mirrors the slice-291 save-side `savePreventsCondition`: the consumer reports the condition this check is attempting to end, and gated effects (Powerful Build, future "advantage on check to end X") fire only when it matches. Generic checks leave it undefined; gated SetAdvantage entries evaluate false. Threaded into the predicate-fact map as `event.endingCondition`.

**Powerful Build grapple-escape arm** (the engine-modelable half): `SetAdvantage on: { kind: 'check' }, mode: 'advantage', condition: event.endingCondition == 'grappled'`. RAW: "Advantage on any ability check you make to end the Grappled condition" — note "any ability check," so the gate is **condition-keyed not skill-keyed** (slice-274's `athleticsSubAction` would miss the Acrobatics-escape arm; the new `endingCondition` fact covers Athletics OR Acrobatics OR any).

**Giant Ancestry frame**: `GrantResource giant-ancestry`, `max: { kind: 'profBonus' }`, `recharge: 'longRest'` at trait-top + `OfferChoice oneOf:1 when:'onAcquire'` over the 6 RAW options (Cloud's Jaunt / Fire's Burn / Frost's Chill / Hill's Tumble / Stone's Endurance / Storm's Thunder). Each option ships with `effects: []` (the Blessed Strikes / Potent Spellcasting pattern, not Custom markers — slice-303 pack-integrity audit rules out Custom markers without backing implementations). The choice path is discoverable + selectable; the individual ancestry mechanics each become their own future slice (six follow-ups: see below).

**Tests** at [tests/unit/engine/slice-465-goliath-species.test.ts](../../tests/unit/engine/slice-465-goliath-species.test.ts) — 9 cases: basics (size/speed/type/languages); Powerful Build advantage applies via planner when `endingCondition='grappled'`; absent or different condition → no advantage; works at the derive layer; condition-keyed gate (Acrobatics-escape also gets Advantage); species declares the giant-ancestry GrantResource with `max: { kind: 'profBonus' }` + `recharge: 'longRest'`; species declares OfferChoice over the 6 RAW ancestries; choice resolves end-to-end via ChoiceRequired + ChoiceResolved.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Goliath exactly for the engine-modelable arms. Documented deferrals: Powerful Build's carrying-capacity-as-Large arm (needs an encumbrance "count as one size larger" primitive that doesn't exist), Large Form (level-5+ transformation, deferred mechanically), and each of the 6 Giant Ancestry mechanics (Cloud's Jaunt: bonus-action teleport; Fire's Burn / Frost's Chill: per-attack on-hit damage riders at the character level, not weapon level; Hill's Tumble: on-hit Prone vs Large-or-smaller; Stone's Endurance: reaction damage reduction; Storm's Thunder: reaction thunder retaliation).
- *Names*: `endingCondition` mirrors `savePreventsCondition` (the save-side analog). The "ending X condition" phrasing matches the RAW.
- *DRY*: same predicate-fact pattern as slice 291 — third caller (saves + ability checks + nothing else for now). Below the abstraction threshold; the two derive functions read identical-shape facts but at different events.
- *SRP*: derive function reads the fact; planner threads it; content gates on it.
- *Magic numbers*: none introduced. `'grappled'` is a known condition id.
- *at-threading*: not applicable (no new events emitted).
- *Mechanical outcomes asserted*: presence on the loaded pack; Advantage applies on grapple-escape checks (planner + derive); does NOT apply on generic checks or other-condition checks; Acrobatics-escape also gets Advantage (condition-keyed gate); choice path resolves.

**Open follow-ups:**
- **Powerful Build carrying-capacity arm** (RAW: "count as one size larger when determining your carrying capacity"): needs a new effect kind (`CountAsLargerForEncumbrance` or `MultiplyCarryingCapacity`) + an encumbrance derive that reads it. *Still open.*
- **Large Form** (level-5+ transformation: "change your size to Large as a Bonus Action ... Advantage on Strength checks, Speed +10 for 10 minutes, 1/long rest"): needs a size-transformation primitive (sibling of Wild Shape's statblock-swap but lighter-weight) + bonus-action toggle planner. *Still open.*
- **Cloud's Jaunt** (Cloud Giant: bonus-action 30-ft teleport, PB / long rest): new `planCloudsJaunt` planner consuming the giant-ancestry resource. *Still open.*
- **Fire's Burn / Frost's Chill** (per-attack on-hit damage riders): need character-level "next attack gains +XdY damage" pattern. Sibling of Hex / Hunter's Mark per-hit rider, but consumer-coordinated since it's opt-in per attack (not always-on). *Still open.*
- **Hill's Tumble** (Prone on hit vs Large-or-smaller): same shape as slice-446 Dire Wolf knock-prone, but character-level instead of weapon-level. The natural pair is "Wolf knock-prone for monsters / Hill's Tumble for PCs," same predicate. *Still open.*
- **Stone's Endurance** (reaction: roll 1d12 + CON, reduce damage taken by that total): new primitive — reaction damage reduction. The existing fatal-damage-intercept family (slices 111 / 456 / 458) handles death-prevention; this is a different shape (general damage mitigation, not just at 0 HP). *Still open.*
- **Storm's Thunder** (reaction: when damaged by a creature within 60 ft, deal 1d8 thunder to it): reaction retaliation. Sibling of Fire Shield's onHit rider but consumer-triggered + range-gated. *Still open.*

**Engine + content (slice 464): monster Multiattack content declaration - the deferred-since-slice-462 primitive lands**

The `planMultiattack` planner has been in the engine since slice 13 (Ogre with two Greatclub swings, the s13-creature golden) and works fine — the gap was always content-side: statblocks couldn't *declare* their Multiattack pattern, so consumers had to read RAW by hand and hand-author the runtime `multiattack` field. This slice closes that gap and ships the Ghoul's "two Bites" as the canonical user.

**New content field** `MonsterStatblockSchema.multiattack` ([src/schemas/content/monster.ts:64](../../src/schemas/content/monster.ts#L64)) of shape `{ name, attacks: [{ weaponId, count }] }`. `weaponId` references the item DEFINITION id (e.g. `"ghoul-bite"`) — content cannot know which instance ids a consumer will mint. The runtime `MultiattackPattern` on `Character` continues to use `weaponInstanceId` (unchanged since slice 13).

**New derive helper** `runtimeMultiattackFromStatblock(declared, weaponIdToInstance)` ([src/derive/multiattack.ts](../../src/derive/multiattack.ts)) bridges the two: consumers mint one item instance per referenced weaponId, pass a `Record<weaponId, instanceId>` map, and get back the runtime pattern ready to drop into `Character.multiattack`. Throws with a precise error naming the missing weapon when the map is incomplete. Exported from [src/index.ts](../../src/index.ts) + [src/derive/index.ts](../../src/derive/index.ts) + as `MonsterMultiattackSchema` from [src/schemas/content/index.ts](../../src/schemas/content/index.ts).

**Canonical user (Ghoul)**: RAW (SRD 5.2.1 Ghoul): "Multiattack. The ghoul makes two Bite attacks." Wired as `"multiattack": { "name": "Ghoul Multiattack", "attacks": [{ "weaponId": "ghoul-bite", "count": 2 }] }` on the Ghoul statblock. Closes the deferred follow-up from slice 462 ("Ghoul Multiattack stays deferred until the monster-Multiattack primitive ships").

**Test** at [tests/unit/engine/slice-464-monster-multiattack.test.ts](../../tests/unit/engine/slice-464-monster-multiattack.test.ts) — 4 cases: Ghoul statblock declares the expected pattern; helper maps weaponId → instanceId correctly; helper throws on missing instance; end-to-end (load pack → mint ghoul-bite → build runtime pattern via helper → set on Character → `engine.plan.multiattack` → exactly 2 `AttackRolled` events).

**Contract snapshot updated** intentionally for two new public exports: `runtimeMultiattackFromStatblock` + `MonsterMultiattackSchema`.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Ghoul Multiattack exactly. The "two Bite attacks" pattern is data; the planner already threads state between swings (slice 392) so a prone-on-first-bite would apply to the second swing's resolution.
- *Names*: `MonsterMultiattack` mirrors `MultiattackPattern` (the runtime type, slice 13). `weaponId` vs `weaponInstanceId` distinguishes content (definition) from runtime (instance), matching the rest of the codebase's definition/instance vocabulary.
- *DRY*: helper is 15 lines, single caller-shape, but lives on the derive seam because it's a pure transformation from content → runtime — same seam as `computeAC`, `computeSpellSaveDC`, etc. Consumers who want bespoke shapes (mixed weapons across instances, custom names) still build the runtime pattern by hand.
- *SRP*: the content schema declares; the helper transforms; the planner consumes. Three concerns, three files.
- *Magic numbers*: none introduced. Count is content-driven.
- *at-threading*: not applicable (no events emitted by the helper).
- *Mechanical outcomes asserted*: presence on the loaded pack; helper output shape; helper error message; end-to-end attack count.

**Open follow-ups:**
- **Brown Bear Multiattack** (one Bite + two Claws): blocked on the Brown Bear Bite natural weapon not yet existing in the pack (only Brown Bear Claw was wired in slice 454). One-line content add for the Bite + multiattack declaration. *Still open.*
- **Bulette / Bandit / Centaur / etc. Multiattacks**: the same content-declaration pattern applies wholesale to every CR ≥ 1 monster with a Multiattack action. Each is a small content slice now that the schema field exists. *Still open.*
- **Dragon-style "X Rend attacks OR Spellcasting" Multiattacks** (SRD 5.2.1, e.g. Adult Black Dragon): the RAW has "It can replace one attack with a use of Spellcasting." The schema's per-entry `weaponId + count` doesn't model "swap one attack for a cast." A future extension (`alternates: [{ replaces: weaponId, with: spellId }]` per swing) could capture it. *Still open.*

**Engine + content (slice 463): Cleric Channel Divinity - Turn Undead (L2 caster playability)**

The iconic Cleric action. RAW (SRD 5.2.1 Cleric L2): "As a Magic action, you present your Holy Symbol and censure Undead creatures. Each Undead of your choice within 30 feet of you must make a Wisdom saving throw. If the creature fails its save, it has the Frightened and Incapacitated conditions for 1 minute. ... This effect ends early on the creature if it takes any damage, if you have the Incapacitated condition, or if you die."

Scope note: Channel Divinity arrives at Cleric L2 (not L1), but Turn Undead is the foundational Cleric mechanic for low-level play — and a clean retro-fit against Zombie's slice-456 Undead Fortitude / the slice-452 Sunlight Sweep undead.

**New planner** [src/engine/plan/turn-undead.ts](../../src/engine/plan/turn-undead.ts) modeled on `planIntimidatingPresence`: validates Cleric L2+ + Channel Divinity resource ≥ 1 + (if in encounter as active combatant) action available. Computes spell save DC via the existing `computeSpellSaveDC` derive (8 + WIS + PB for clerics). Emits `ActionEconomyConsumed(action)` (when in encounter) + `ResourceSpent(channel-divinity, 1)`, then per-target: `SaveRolled(WIS vs DC)` and on failure two `ConditionApplied` events (`frightened` + `incapacitated`, both with `endsOnDamage: true` so the slice-391 chokepoint scrubs both arms on any damage). Non-Undead targets are silently skipped (RAW limits the censure to Undead; mixed lists shouldn't fail the whole action). Wired across the 4 standard sites; slice-364 planner-wiring audit verified green.

**Content:** Cleric L2 gains a new `turn-undead` feature row with `Custom { handlerId: 'turn-undead' }` marker, sibling to the existing `channel-divinity` (GrantResource) + `divine-spark` (still stub) features.

**Test** at [tests/unit/engine/slice-463-turn-undead.test.ts](../../tests/unit/engine/slice-463-turn-undead.test.ts) — 5 cases: L2 Cleric vs Zombie rolls WIS save at DC 13 (8 + WIS 16 +3 + PB 2), on failure applies Frightened + Incapacitated both with `endsOnDamage: true`; L1 cleric rejected; depleted Channel Divinity rejected; non-Undead target silently skipped (no SaveRolled for them, resource still consumed); non-Cleric rejected.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Cleric L2 Channel Divinity / Turn Undead text exactly for the engine-modelable arms. Both Frightened + Incapacitated arms applied; `endsOnDamage` flag covers the "ends early on damage" RAW arm. The "Cleric incapacitated / dying ends the effect" and 30-ft range stay consumer-managed (source-state-dependent / positional).
- *Names*: `planTurnUndead` / `TurnUndeadIntent` mirror existing planner conventions. Resource id `channel-divinity` matches the existing L2 GrantResource grant.
- *DRY*: per-target shape mirrors `planIntimidatingPresence` exactly (both are "AoE save → frightened-on-fail" planners). Declined to extract a shared `applySaveAoEFrightener` helper — second caller of the same shape, still below the abstraction threshold.
- *SRP*: a single planner handles the full Turn Undead chain (validate → spend → save-per-target → apply-conditions). Sear Undead (L5 radiant-damage add-on) stays its own future slice; it'd extend this planner with a per-failed-save damage roll.
- *at-threading*: single `nowIso()` resolution shared across all emitted events.
- *Mechanical outcomes asserted*: DC computed from cleric's WIS + PB; save rolled per target; conditions applied with endsOnDamage; non-Undead silently skipped; resource gating; class-level gating.

**Open follow-ups:**
- **Cleric L5 Sear Undead** (`sear-undead` still ships `effects: []`): adds NdN d8 radiant damage (N = WIS mod, min 1d8) per Undead that fails the save. Extends this planner. *Still open.*
- **Cleric L2 Divine Spark** (`divine-spark` still ships `effects: []`): the other Channel Divinity option — heal-or-deal-damage-as-Bonus-Action. Separate Channel Divinity option planner. *Still open.*
- **Channel Divinity option dispatch**: the engine doesn't yet model "Channel Divinity → choose-an-option-at-activation-time" first-class; consumers route to the specific planner (`turnUndead`, future `divineSpark`). A future `planChannelDivinity({ option: ... })` dispatcher could unify them. *Still open.*

**Content (slice 462): Ghoul Bite natural weapon - L1 playability arc**

The Ghoul's Claw (paralysis-on-CON-fail) was already wired in slice 319, but the Ghoul also has a Bite attack in 2024 RAW that wasn't in the pack. RAW (SRD 5.2.1 Ghoul): "Bite. Hit: 5 (1d6 + 2) Piercing damage plus 3 (1d6) Necrotic damage." New `ghoul-bite` natural-weapon item: primary 1d6 piercing + slice-316 unconditional onHit extra-damage rider for the 1d6 necrotic arm (same shape as wyvern-sting's poison rider). The +2 damage / +4 attack come from the wielder's STR + PB, not the weapon.

The Ghoul's signature paralysis mechanic (Claw -> CON DC 10 save -> Paralyzed, gated `not(Undead or elf)`) already works via the slice-319 `ghoul-claws` item, so the Ghoul monster's most distinctive RAW behavior is wired end-to-end. **Multiattack** (two Bites per Attack action) stays deferred until the monster-Multiattack primitive ships; consumers can still simulate it by making two ghoul-bite attacks in the same turn.

**Test** at [tests/unit/engine/slice-462-ghoul-bite.test.ts](../../tests/unit/engine/slice-462-ghoul-bite.test.ts) — 1 case (seed-searched for a hit): on a hit, the DamageRolled event carries both a piercing primary roll and a necrotic rider roll.

**Doc updates:** weapons 60 -> 61 in [docs/getting-started.md](../../docs/getting-started.md) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md).

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Ghoul Bite text exactly. Same onHit-rider pattern as the slice-322 poison-natural-weapons sweep.
- *DRY*: identical shape to wyvern-sting; no new primitive.

**Open follow-ups:**
- **Monster Multiattack primitive**: same deferred shape that blocks dozens of other monster statblocks (Brown Bear, Wolf, Bandit Captain, etc.). When it lands, the Ghoul gets its 2-Bite Multiattack and most CR ≤ 1 monsters with Multiattack become fully RAW. *Still open.*

**Content (slice 461): Human Skillful species trait - L1 playability arc**

Wires the simplest of the Human species's three traits. RAW (SRD 5.2.1 Human): "Skillful. You gain proficiency in one skill of your choice." Modeled as `OfferChoice oneOf:1 when:'onAcquire'` over the 18 skills (each option grants the matching `GrantProficiency target:'skill' level:'proficient'`), mirroring slice-447's Elf Keen Senses pattern. Pure content slice; no engine work.

**Test** at [tests/unit/engine/slice-461-human-skillful.test.ts](../../tests/unit/engine/slice-461-human-skillful.test.ts) — 3 cases: a Human who picks Perception gets it on the effect stack; another who picks Stealth gets Stealth (not Perception); a Human without a resolved choice has neither.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Human Skillful exactly. All 18 skills offered.
- *Names*: `choiceId: 'human-skillful'` matches the trait name. Option ids match the canonical skill ids (Wizard Scholar / Rogue Expertise / Elf Keen Senses conventions).
- *DRY*: 18-option OfferChoice is verbose but mirrors slice-55 Wizard Scholar + slice-60 Rogue Expertise patterns. Declined to introduce a content-side "AllSkillsChoice" template — only 2 callers now (Skillful + Skilled feat), still inline-readable.

**Open follow-ups:**
- **Human Resourceful**: "You gain Heroic Inspiration whenever you finish a Long Rest." Engine doesn't carry Heroic Inspiration as a tracked resource; closing this needs a new resource shape + a reroll mechanic that consumes it. *Still open.*
- **Human Versatile**: "You gain an Origin feat of your choice." Needs a "grant feat from choice" resolution path — feats are typically chosen at character creation and recorded in `featsTaken`, not granted via OfferChoice option effects. A `Custom { handlerId: 'versatile-origin-feat' }` marker would close the discoverability gap but defer the structural work. *Still open.*

**Docs (slice 460): archive slices 451-459 (L1 playability arc, part 2) to free CHANGELOG headroom**

Pure CHANGELOG-archive operation. The live CHANGELOG had reached ~53 KB / 60 KB ceiling after slices 451-459. Moved that nine-slice cohort to a new sibling archive file at [docs/changelog/archive-slices-451-459.md](../../docs/changelog/archive-slices-451-459.md), continuing from [docs/changelog/archive-slices-444-450.md](../../docs/changelog/archive-slices-444-450.md) (L1 arc part 1). Live CHANGELOG drops from ~53 KB to ~19 KB; archive holds the full per-slice detail with sibling-rooted links (`../../src/...`, `archive-slices-444-450.md`). Index in [docs/changelog/README.md](../../docs/changelog/README.md) updated. The split-treadmill stays at bay: the active CHANGELOG holds the alpha.14 cycle + the 1-slice docs entry (443) + this archive note; future slices accumulate against a near-empty live file.

