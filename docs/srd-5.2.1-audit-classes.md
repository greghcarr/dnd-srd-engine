# SRD 5.2.1 audit: classes, subclasses, class features

Fifth audit in the SRD 5.2.1 standardization series. Companion to the monster, magic-item, spell, and character-creation audits.

Outcome (slice 153): documentation pass. Identifies real drift and missing features; the fixes are content-authoring work for follow-up slices.

**Slice 172 update**: closed 12 of the 13 level-placement drift entries below. The Barbarian Improved Brutal Strike L13 to L17 entry was incorrect (SRD has Improved Brutal Strike at BOTH L13 and L17 as two separate features, and the pack already places them there). Also closed one rename (Cleric L20 Improved Divine Intervention to Greater Divine Intervention) from the pack-only-features table.

**Slice 173 update**: closed four more entries from the pack-only-features table. Renames: Paladin L11 Radiant Strike to Radiant Strikes (plural, matching SRD), Monk L18 Empty Body to Superior Defense. Drops: Monk L7 Step of the Wind: Heightened Mobility (2014-flavor, no SRD analog; Evasion remains the L7 grant), Warlock L3 Pact Boon (2014-flavor; SRD 5.2.1 handles Pact Boon as an Eldritch Invocation option starting at L1, and Warlock subclass selection at L3 is already modeled via the subclass machinery). Remaining pack-only entries (Cleric L2 Divine Spark as a separate feature, Sorcerer L20 Sorcery Points (20)) are schema / modeling differences, not drift — kept for now.

**Slices 174-176 update**: resource-pool value drift swept clean. Slice 174 closed Cleric Channel Divinity (1/2/3 to 2/3/4), Paladin Channel Divinity (added L11 max=3), Fighter Second Wind (added L4 max=3 + L10 max=4), and Bardic Inspiration uses (hardcoded 3 to `max(1, abilityMod CHA)` formula). Slice 174 also fixed the builder bug that was silently dropping Formula `max` on GrantResource. Slice 175 made Monk Ki + Sorcerer Sorcery Points linear-scaling via the `{kind: "level", classId: X}` formula primitive, dropping nine redundant tier-bump entries. Slice 176 moved Fighter Indomitable from L20 to L17 and corrected Druid Wild Shape uses (2/3/4 at L2/L6/L17 instead of 2/3/4/5/6 at L2/L5/L9/L13/L17). Of the original 13 level-placement drift items, all 12 real entries are now closed (the 13th, Barbarian Improved Brutal Strike, was an audit error: SRD has it at BOTH L13 and L17). Remaining work in this audit is the genuinely-missing L8+ main-class features (~17 entries) and the 41 missing subclass features at L6/L10/L14/L17.

## Status counts

| Layer | Pack | SRD 5.2.1 | Match |
|---|---|---|---|
| Classes (base names) | 12 | 12 | 12 / 12 |
| Subclasses (names) | 12 | 12 (one per class) | 12 / 12 |
| Main-class features (by first appearance) | ~110 | ~95 | ~95 in both; the 12 main-class + 1 subclass level-placement drifts were all closed in slices 174-176 (see the resolved table below) |
| Subclass features | ~31 wired / 58 entries | ~66 | Pack ships 58 subclass feature entries (31 with effects, 27 `effects: []`). Of the ~40 SRD features beyond the L3 baseline, batches 1.1-1.8 wired or partially wired ~8; the remainder are deferred-with-reason or unstarted (~13 outstanding); see "Layer 4" for the current per-feature status. |

The class structure is clean. Drift surface concentrates in (a) per-feature level placements within main classes and (b) the depth of subclass coverage.

## Layer 1: classes (clean)

All 12 pack classes match SRD 5.2.1 names exactly: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard.

## Layer 2: subclasses (clean)

All 12 pack subclasses match the 12 SRD 5.2.1 subclasses (SRD ships exactly one subclass per class): Path of the Berserker, College of Lore, Life Domain, Circle of the Land, Champion, Warrior of the Open Hand, Oath of Devotion, Hunter, Thief, Draconic Sorcery, Fiend Patron, Evoker.

## Layer 3: main-class features

The pack models scaling features as separate level entries (e.g., `Bardic Inspiration (d6)` at L1, `Bardic Inspiration (d8)` at L5, `Bardic Inspiration (d12)` at L15) while SRD lists each feature once at first appearance with scaling described in the body. The audit normalizes pack entries to first-appearance for comparison.

### Real level-placement drift (13 entries): all closed (slices 174-176), historical record

**Resolved.** All entries below were corrected in slices 174-176; the pack now grants each feature at the SRD level. The "Pre-fix pack level" column records the placement before the fix and is retained as a historical record (verified against the current pack: e.g. Cleric Channel Divinity is now L2, Bard Expertise L2, Fighter Tactical Mind L2, Rogue Reliable Talent L7, and the one subclass entry, Evoker Sculpt Spells, is now L6, which matches SRD 5.2.1, so it was never a true drift). Do not treat this table as an open work queue.

| Class | Feature | Pre-fix pack level | SRD level (now matched) |
|---|---|---|---|
| Barbarian | Improved Brutal Strike | L13 | L17 |
| Bard | Expertise | L3 | L2 |
| Bard | Superior Inspiration | L20 | L18 |
| Cleric | Channel Divinity | L1 | L2 |
| Cleric | Improved Blessed Strikes | L17 | L14 |
| Fighter | Tactical Mind | L5 | L2 |
| Fighter | Tactical Shift | L9 | L5 |
| Fighter | Tactical Master | L11 | L9 |
| Ranger | Nature's Veil | L9 | L14 |
| Rogue | Reliable Talent | L11 | L7 |
| Rogue | Improved Cunning Strike | L14 | L11 |
| Rogue | Devious Strikes | L18 | L14 |
| Wizard (Evoker subclass) | Sculpt Spells | L3 | L6 |

These were content bugs where the engine granted a feature at the wrong character level compared to RAW. Each was fixed by moving the feature in `levelTable` to the SRD level (slices 174-176); the table is kept only as a historical record of what was corrected.

### Pack-only main-class features (5 entries, PHB 2014-flavored)

These pack features don't appear in SRD 5.2.1's class sections. They're 2014 PHB feature names that the 2024 PHB / SRD 5.2.1 restructured or replaced.

| Class | Feature | Pack level | Status |
|---|---|---|---|
| Cleric | Channel Divinity: Divine Spark | L2 | SRD covers Divine Spark as a Channel Divinity sub-option, not as a standalone feature; modeling difference |
| Cleric | Improved Divine Intervention | L20 | SRD has "Greater Divine Intervention" at L20; pack uses 2014 name |
| Monk | Step of the Wind: Heightened Mobility | L7 | 2014-flavored; SRD has different L7 progression |
| Monk | Empty Body | L18 | 2014 capstone; SRD has "Superior Defense" at L18 |
| Sorcerer | Sorcery Points (20) | L20 | Capstone scaling note; SRD models sorcery points via the class table |
| Warlock | Pact Boon | L3 | 2014 feature; SRD 5.2.1 has Pact Magic at L1 and different L3 grants |
| Paladin | Radiant Strike | L11 | SRD has "Radiant Strikes" (plural) at L11; name variant |

A future slice could rename / restructure these to match SRD 5.2.1.

### SRD main-class features handled differently in pack schema (recurring patterns)

The audit found that every class has these SRD-listed "features" missing from the pack's `levelTable`:

- **Spellcasting** at L1: SRD lists "Spellcasting" as a class feature for every full caster. Pack models spellcasting via per-class `spellcastingAbility` + `spellSlotTable` fields rather than a feature entry. Not a content gap; schema difference.
- **`<Class>` Subclass** at L3: SRD lists subclass selection as a class feature. Pack models subclasses as separate entries (`pack.subclasses[]`) joined to characters via `classes[].subclassId`. Schema difference.
- **Ability Score Improvement** at L4: SRD lists ASI as a class feature. Pack handles ASI via the level-up planner. Schema difference.
- **Epic Boon** at L19: SRD lists Epic Boon selection as a class feature. Pack handles it via `featsTaken` (the chosen Epic Boon is a feat). Schema difference.
- **Weapon Mastery** at L1 (Barbarian, Fighter, Paladin): SRD lists this. Pack handles Weapon Mastery as a per-weapon property granted by class proficiency rules, not as a class-feature entry.

These don't appear in the "missing from pack" lists below.

### SRD-listed main features genuinely missing from pack

Filtering out the recurring patterns above, the genuinely-missing main-class features are concentrated in 2024 PHB updates the pack hasn't caught up with yet:

- **Bard**: ~~Words of Creation (L20)~~ (slice 216: always-prepared Power Word Heal via GrantSpell; the second-target arm stays consumer-driven via the spell planner's existing targetIds array)
- **Cleric**: ~~Divine Order (L1)~~ (slice 214: 2-option OfferChoice; Protector grants martial weapon + heavy armor proficiency, Thaumaturge grants Guidance cantrip + WIS-mod bonus on Arcana/Religion checks. RAW lets the cantrip be any cleric cantrip; the pack hardcodes Guidance to avoid a nested OfferChoice for now), ~~Greater Divine Intervention (L20)~~ (slice 221: Wish branch wired via new `GrantDivineInterventionWish` marker primitive; planDivineIntervention now special-cases `spellId === 'wish'` and bypasses the Cleric-list and L5-or-lower gates when the bearer carries the marker. The 2d4-LR cooldown when Wish is chosen still defers pending a `ResourceCooldownExtended` primitive that the rest reducer can honor.)
- **Druid**: ~~Primal Order (L1)~~ (slice 215: 2-option OfferChoice mirroring Cleric Divine Order; Magician grants Druidcraft + WIS-mod bonus on Arcana/Nature, Warden grants martial weapon + medium armor proficiency. Magician cantrip hardcoded to Druidcraft pending nested-OfferChoice verification)
- **Monk**: ~~**Heightened Focus (L10)**~~ (slices 333-335: closed by wiring all three Monk's Focus bonus-action planners — `planFlurryOfBlows` (333; 2 Unarmed Strikes, 3 at L10+), `planPatientDefense` (334; Disengage as a Bonus Action, or 1 Focus for Disengage + Dodge, +temp HP = two Martial Arts dice at L10+), `planStepOfTheWind` (335; Dash as a Bonus Action, or 1 Focus for Disengage + Dash). The L10 jump-doubling + Step-of-the-Wind ally-move are consumer-managed — no jump/position model). ~~Self-Restoration (L10)~~ (slice 202: wired via `planSelfRestoration` + `GrantSelfRestoration` marker; food / water Exhaustion arm consumer-side), ~~Disciplined Survivor (L14)~~ (slice 203: 4 GrantProficiency entries on saves; same slice fixed a save-proficiency effect-stack bug that had silently inerted Slippery Mind too), ~~Superior Defense (L18)~~ (slice 209: dedicated planSuperiorDefense + superior-defense-active condition with 12 GrantResistance entries covering every non-Force damage type)
- **Paladin**: ~~Paladin's Smite (L2)~~ (slice 210: dedicated planPaladinsSmite — bonus-action slot-spend, emits radiant DamageApplied chained to a triggering hit; +1d8 Undead/Fiend), ~~Aura Expansion (L18)~~ (slice 211: new `ExpandAuraRange` primitive replaces the prior dedup-by-id re-declarations; consumers compute effective aura range as `GrantAura.rangeFeet + auraRangeBonus()`)
- **Ranger**: ~~Expertise (L9)~~ (slice 208: pure content; OfferChoice over the 8 ranger skills, mirrors Rogue Expertise), ~~Precise Hunter (L17)~~ (slices 222 + 231: slice 222 wired Hunter's Mark's damage rider with `hunters-mark-active` condition carrying sourceCharacterId; slice 231 added the `GrantAdvantageVsBearersOfMyCondition` primitive + threaded it through planAttack's advantage resolution. RAW exact: an L17 ranger has Advantage on attack rolls against creatures bearing `hunters-mark-active` whose source is the ranger. The Hunter's Mark Perception/Survival advantage arm of the L1 spell is still deferred — different primitive shape since skill checks don't have a target counterparty.)
- **Rogue**: ~~Uncanny Dodge (L5)~~ (slice 200: wired as a dedicated reaction planner + `GrantUncannyDodge` marker, compensating-Healed pattern), ~~Elusive (L18)~~ (slice 199: wired via the new `CancelAdvantageOnAttackers` primitive, predicate-gated on `bearerHasIncapacitated`)
- **Sorcerer**: ~~Sorcery Incarnate (L7)~~ (slice 201: alternative-cost arm wired via `planInnateSorcery` + `GrantInnateSorcerySpendAlternative` marker; doubled-metamagic arm deferred pending once-per-spell metamagic enforcement)
- **Warlock**: ~~Contact Patron (L9)~~ (slice 216: oncePerLongRest GrantSpell of contact-other-plane; the auto-succeed-on-save arm stays consumer-driven since the engine doesn't force-pass saves keyed on specific feature sources)

About 17 main-class features at slice 196; slices 199-231 closed 17 of them: Rogue L5 + L18 (slices 200, 199), Sorcerer L7 alt-cost arm (slice 201), Monk L6 + L10 + L14 + L18 (slices 207, 202, 203, 209), Ranger L9 + L17 (slices 208, 231), Paladin L2 + L18 (slices 210, 211), Cleric L1 + L10 + L20 (slices 214, 220, 221), Druid L1 (slice 215), Bard L20 + Warlock L9 (slice 216). The last deferred one — Monk L10 Heightened Focus — **closed across slices 333-335** (the three Monk's Focus bonus-action planners: Flurry of Blows, Patient Defense, Step of the Wind), so **all main-class features are now mechanically closed**. Two sub-arms of otherwise-wired features remain deferred: the doubled-metamagic arm of Sorcery Incarnate (needs once-per-spell metamagic enforcement) and the 2d4-LR cooldown arm of Greater Divine Intervention (needs a `ResourceCooldownExtended` primitive).

## Layer 4: subclass features

This is the largest gap. SRD 5.2.1 ships 4-5 features per subclass at L3 / L6 / L10 / L14 / L17 (or similar progression). Pack subclasses mostly ship only the L3 features.

### Missing subclass features (13 outstanding of 40 across 12 subclasses; 2 fully wired + 6 partially wired across batches 1.1-1.8, 19 deferred-with-reason; 1 false-positive removed from the original 41 count — Sacred Weapon was already wired in the pack as a Custom handler)

| Subclass | Missing features |
|---|---|
| Path of the Berserker | L6 Mindless Rage (deferred-stub, subclass batch 1.2: no rage-active condition or predicate path; rage is a resource counter, not a stateful effect), L10 Retaliation (deferred-stub, subclass batch 1.2: TriggerAction vocabulary has no "make an attack" action; no per-attacker range predicate), L14 Intimidating Presence (slice 350: `planIntimidatingPresence` rolls a WIS save at DC 8 + STR + PB per chosen target and applies Frightened on a failure; slice 389 added the end-of-turn repeat save via the per-instance fixed-DC recurring save (slice 388), ticked through `tickRecurringSave`; the 1-minute duration and once-per-LR/rage-restore use stay deferred) |
| College of Lore | L6 Magical Discoveries (deferred-stub: learn two spells from the Cleric / Druid / Wizard lists — needs an OfferChoice over a cross-class spell pool), ~~L14 Peerless Skill~~ (wired, slice 358: `planPeerlessSkill`, the self-targeted mirror of Cutting Words — rolls the Bardic Inspiration die on the bard's own failed ability check or attack roll, reports `turnedSuccess`, and emits `ResourceSpent` only when the boost meets the threshold (RAW "on a failure, the Bardic Inspiration isn't expended"); reuses `bardicInspirationDieFor` + the BI resource id from the Cutting Words planner. Paired with a `Custom { handlerId }` marker) |
| Life Domain | ~~L3 Life Domain Spells~~ (slice 212: GrantSpell engine consumer landed; slice 218: L3 corrected to SRD Aid / Bless / Cure Wounds / Lesser Restoration plus higher-tier rows wired at L5 Mass Healing Word + Revivify, L7 Aura of Life + Death Ward, L9 Greater Restoration + Mass Cure Wounds), ~~L3 Preserve Life~~ (wired, slice 352: `planPreserveLife`, a Channel-Divinity heal-pool planner restoring 5x cleric level HP divided among bloodied targets, each capped at half its HP max; spends the `channel-divinity` resource and emits Healed per allocation. Paired with a `Custom { handlerId }` marker, preserving the every-Custom-handlerId-pairs-with-a-planner invariant), L6 Blessed Healer (deferred-stub, subclass batch 1.8: HealedEvent payload has no casterId, and buildEventFacts doesn't add targetIsSelf for Healed events — only AttackRolled and DamageApplied get bearer/event-relative facts), ~~L17 Supreme Healing~~ (full wire, slice 205: `GrantMaxHealingDice` marker swaps every healing-dice roll to its max in cast-spell's heal-mechanic path; flat modifiers compose unchanged on top) |
| Circle of the Land | ~~L3 Land's Aid~~ (wired, slice 354: `planLandsAid`, a Wild-Shape-fueled planner that creates a 10-ft Sphere within 60 ft, rolling 2d6 Necrotic once and applying it full on a failed CON save (vs the druid's spell save DC) or half on a success to each chosen creature, then healing one chosen creature 2d6; both scale to 3d6 at druid L10 and 4d6 at L14. Spends the `wild-shape` resource and reuses the shared `rollSaveAgainstDC` + damage-mitigation + fatal-damage-intercept pipeline; paired with a `Custom { handlerId }` marker), L3 Circle of the Land Spells (deferred-stub, subclass batch 1.7: per-land spell list grant needs 4 OfferChoice options × 4 level rows of always-prepared spells; also blocked on OfferChoice when=onLongRest having no engine-side rest re-offer mechanism), L6 Natural Recovery (partial wire, subclass batch 1.7: GrantResource max=1 recharge=longRest tracks the once-per-LR cap; the no-slot cast and short-rest slot-recovery mechanics defer), L10 Nature's Ward (near wire, subclass batch 1.7: GrantConditionImmunity for Poisoned wired cleanly; the damage-resistance half ships as OfferChoice with 4 land options — RAW divergence: the choice happens at L10 standalone rather than inheriting from the L3 Circle of the Land Spells land choice, which is schema-only), L14 Nature's Sanctuary (deferred-stub, subclass batch 1.7: cube AOE + half cover + ally-shared resistance + Wild Shape consumption — multiple missing primitives) |
| Champion | ~~L7 Additional Fighting Style~~ (wired, subclass batch 1.1), L10 Heroic Warrior (deferred, no HeroicInspiration tracker / grant primitive), ~~L15 Superior Critical~~ (wired, subclass batch 1.1), L18 Survivor (deferred: needs death-save advantage primitive, "natural N counts as 20" primitive, bloodied predicate, and a conditional recurring heal) |
| Warrior of the Open Hand | ~~L6 Wholeness of Body~~ (wired, slice 357: `planWholenessOfBody`, a Bonus-Action self-heal planner that rolls the Martial Arts die + WIS modifier (min 1) and emits a self `Healed`, spending the `wholeness-of-body` resource (`GrantResource` max = max(1, WIS mod), recharge longRest, the per-LR uses cap); paired with a `Custom { handlerId }` marker. The Bonus Action is consumed only when the monk is the active combatant, so out-of-combat self-healing works), L11 Fleet Step (deferred-stub: needs a "chain Step of the Wind after any other Bonus Action" trigger with no Bonus-Action-cost), L17 Quivering Palm (deferred-stub: a multi-day delayed Stunning-Strike-on-command needs a persistent attuned-target marker + a save-or-reduce-to-0-HP trigger) |
| Oath of Devotion | ~~L3 Sacred Weapon~~ (audit-script false positive: already wired in pack as a Custom handler at L3, just under a different feature id), ~~L7 Aura of Devotion~~ (wired, slice 360: self-immunity to Charmed via GrantConditionImmunity plus the ally-side half — a `GrantAura { auraId: 'aura-of-devotion', rangeFeet: 10, allyConditionId: 'aura-of-devotion-active' }` on the feature and the new `aura-of-devotion-active` condition granting Charmed immunity, mirroring the paladin's Aura of Courage exactly. Pure content on the existing GrantAura primitive), L15 Smite of Protection (deferred-stub, subclass batch 1.5: needs a Divine-Smite-usage trigger event and a Half Cover primitive — cover is positional and not modeled), L20 Holy Nimbus (deferred-stub, subclass batch 1.5: bonus-action toggle with 10-min duration + once-per-LR + spend-5th-level-slot-to-restore + aura damage on enemy turn-start — multiple missing primitives) |
| Hunter | L7 Defensive Tactics (Escape the Horde arm wired in slice 206 via the new AttackRolled.isOpportunityAttack flag + predicate-gated `ImposeDisadvantageOnAttackers`; Multiattack Defense arm still deferred-stub pending the per-attacker turn-bound condition + slice-103 attacker-side condition-applied flow), L11 Superior Hunter's Prey (deferred-stub, subclass batch 1.3: no Hunter's-Mark-source predicate to gate OnEvent, and TriggerAction has no "emit damage to a chosen second target" action), L15 Superior Hunter's Defense (deferred-stub, subclass batch 1.3: TriggerAction can't parameterize a follow-up GrantResistance by the triggering event's damage type) |
| Thief | L9 Supreme Sneak, L13 Use Magic Device, L17 Thief's Reflexes |
| Draconic Sorcery | ~~L3 Draconic Spells~~ (slice 213: 4 always-prepared GrantSpell entries — Alter Self / Chromatic Orb / Command / Dragon's Breath; slice 218: higher tiers wired at L5 Fear + Fly, L7 Arcane Eye + Charm Monster; L9 Legend Lore + Summon Dragon deferred, summon-dragon not in pack), ~~L6 Elemental Affinity~~ (full wire, slice 204: subclass batch 1.4 shipped the GrantResistance arm; slice 204 added the cast-spell `modifierSum('damage', {event.damageType})` fold and updated each OfferChoice option with an `AddModifier` for the CHA-mod rider), ~~L14 Dragon Wings~~ (wired, slice 351: `planDragonWings` applies a `dragon-wings-active` condition granting Fly Speed 60, read by `getEffectiveFlySpeed`; consumes the Bonus Action only when the sorcerer is the active combatant; the 1-hour duration / dismissal / once-per-LR-or-3-SP restore are consumer-managed), L18 Dragon Companion (deferred-stub, subclass batch 1.4: summon-dragon spell isn't in the pack catalog so GrantSpell can't reference it, and the no-material / optional-concentration-removal riders have no primitive) |
| Fiend Patron | ~~L3 Fiend Spells~~ (slice 213: 4 always-prepared GrantSpell entries — Burning Hands / Command / Scorching Ray / Suggestion; slice 218: higher tiers wired at L5 Fireball + Stinking Cloud, L7 Fire Shield + Wall of Fire, L9 Geas + Insect Plague), L6 Dark One's Own Luck (partial wire, subclass batch 1.6: GrantResource with max=max(1, CHA-mod), diceSize=10, recharge=longRest tracks the per-LR counter; the "spend to add d10 to a check/save you just rolled" spend mechanic has no planner, same shape as Fighter Second Wind), L10 Fiendish Resilience (near wire, subclass batch 1.6: OfferChoice with 12 GrantResistance options covering every damage type except Force; RAW divergence — the choice is one-time at acquire because OfferChoice when=onLongRest is schema-defined but has no rest-time re-offer mechanism in the engine), L14 Hurl Through Hell (deferred-stub, subclass batch 1.6: TriggerAction can't express save-then-conditional-damage-then-condition, and spend-Pact-slot-to-restore has no recovery shape) |
| Evoker | ~~L3 Potent Cantrip~~ (wired, slice 383: the new `GrantPotentCantrip` marker on the caster's effect stack; cast-spell deals half a damaging cantrip's damage on a missed attack roll or a successful save (both arms), instead of none), ~~L10 Empowered Evocation~~ (wired, slice 359: a passive `AddModifier { target: 'damage', value: INT-mod }` gated on the new `event.spellSchool == 'evocation'` fact, folded once into the shared damage roll in cast-spell so an AoE save spell gets the bonus a single time across all targets, honoring RAW "one damage roll of that spell"; no `Custom` marker since it is a pure passive modifier), L14 Overchannel (deferred-stub: a per-cast max-damage toggle for levels 1-5 with escalating self-necrotic-damage on repeated use, needs a force-max-damage cast flag + a use counter) |

Note: a few of these names match pack features tagged differently (e.g., Sacred Weapon is wired in the engine but lives under the Oath of Devotion subclass entry, not as a separate `levelGrants[3]` feature). The audit script flags by structural presence; some entries may be mechanically present but indexed differently.

## Distribution policy

The 12 classes and 12 subclasses are SRD 5.2.1-derived and ship under CC-BY-4.0 with attribution. The 5 PHB 2014-flavored main features that don't appear in SRD 5.2.1 (Empty Body, Pact Boon, etc.) are kept in the pack for the same reason backgrounds + feats keep their PHB extras (slice 152): the pack ships content-authoring material that downstream consumers can prune to SRD-only as needed.

The 41 missing SRD-listed subclass features are content-authoring follow-ups. Wiring them is per-feature engine + content work; the level-placement table above is the queue.

## Re-running the audit

```bash
node /tmp/class-audit.mjs
cat /tmp/class-audit.json
```

(Script at `/tmp/class-audit.mjs`; not checked in.)
