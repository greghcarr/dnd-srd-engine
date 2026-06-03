# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

Per-slice detail lives in [docs/changelog/slice-NNN.md](docs/changelog/) — the live file below carries only a compact pointer per slice (one headline + one-sentence summary) so the file stays bounded regardless of project age. Convention adopted in slice 628.

## Unreleased

**Docs (slice 629): CLAUDE.md split + engine-scope reference + tone polish**
Split the 464-line CLAUDE.md by audience: agent safety + pointers stay in CLAUDE.md (72 lines); universal contributor norms expand CONTRIBUTING.md (288 lines); architecture internals move to docs/architecture.md (new); engine-tracks-vs-consumer-tracks reference lands at docs/engine-scope.md (new).
Detail: [slice-629.md](docs/changelog/slice-629.md).

**Docs (slice 628): CHANGELOG sustainability — pointer-per-slice + detail-per-file**
Live CHANGELOG no longer holds verbose per-slice entries; full detail lives at `docs/changelog/slice-NNN.md`. Live file shrank from ~59 KB to ~10 KB; growth per slice now ~150 bytes instead of 4-9 KB.
Detail: [slice-628.md](docs/changelog/slice-628.md).

**Engine + tests (slice 627): Innate Sorcery advantage gates on Sorcerer-list spells**
Multiclass sorcerer/wizard casting a wizard-only spell (e.g. Acid Arrow) no longer gets the advantage; predicate gates on `event.spellCastingClassId === 'sorcerer'`.
Detail: [slice-627.md](docs/changelog/slice-627.md).

**Engine + tests + transcript (slice 626): three follow-up closures**
On-hit masteries skip the rider on a 0-damage hit; s23 Graze test actually tests Graze; transcript shows all d20 rolls when Halfling Lucky reroll grew the array.
Detail: [slice-626.md](docs/changelog/slice-626.md).

**Engine + tests (slice 625): Martial Arts Die scales monk weapons too**
Sibling fix to slice 623: `applyMartialArtsDieScaling` now keys off the same `martialArtsApplies` helper. Monk sickle / dagger / scimitar now roll the L1 1d6 instead of the weapon's native die.
Detail: [slice-625.md](docs/changelog/slice-625.md).

**Engine + tests (slice 624): Graze weapon mastery fires on MISS only**
`WeaponMasteryIntent` gained `attackHit?: boolean`; planner invariants enforce Graze=miss, Sap/Vex/Slow/Topple/Push/Cleave=hit. Fuzz dispatch gates accordingly.
Detail: [slice-624.md](docs/changelog/slice-624.md).

**Engine + tests (slice 623): three RAW bugs the slice-622 fuzz review surfaced**
Vex autoExpiry now keys on bearer's turn-end (new `expirySourceFromBearer` flag); Innate Sorcery advantage on spell attacks wired; Monk Martial Arts "Dexterous Attacks" (STR→DEX) extended to monk weapons.
Detail: [slice-623.md](docs/changelog/slice-623.md).

**Tooling + tests (slice 622): pool-based fuzz loadouts**
Per-class loadouts replaced with pools (weapon / armor / cantrip / L1-spell). Each seed exercises a different swath: 12→25 distinct spells, 3→7+ masteries, 15→42 items, 10→25 monsters.
Detail: [slice-622.md](docs/changelog/slice-622.md).

---

Per-slice detail for slices 620-621 (L1 fuzz concentration RAW work) is archived at [docs/changelog/archive-slices-620-621.md](docs/changelog/archive-slices-620-621.md).

Per-slice detail for slices 615-619 (web tooling polish, determinism docs, OfferCharacterChoices L1 cascade, SRD floor audit) is archived at [docs/changelog/archive-slices-615-619.md](docs/changelog/archive-slices-615-619.md).

Per-slice detail for slices 611-614 (`resolveAttackRoll` helper; per-component concentration saves; content-driven `ResourceSpent` wording; audit-rigor pass) is archived at [docs/changelog/archive-slices-611-614.md](docs/changelog/archive-slices-611-614.md).

Per-slice detail for slices 604-610 (observer-review polish: HP display clamp, RE + Shield wording, Beast-name regression, scrub cache) is archived at [docs/changelog/archive-slices-604-610.md](docs/changelog/archive-slices-604-610.md).

Per-slice detail for slices 599-603 (web demo becomes fuzz-replay viewer; engine fixes — auto-trigger CON save on damage, spell-attack target-advantage, Produce Flame BA+Action) is archived at [docs/changelog/archive-slices-599-603.md](docs/changelog/archive-slices-599-603.md).

Per-slice detail for slices 593-598 (combat-fuzz expansion: level-up to L2-5; rest cycles; 2v2; PC-vs-monster; 10 monster variety; species + class L1 BAs) is archived at [docs/changelog/archive-slices-593-598.md](docs/changelog/archive-slices-593-598.md).

Per-slice detail for slices 588-592 (combat-fuzz hardening: species resource grants; weapon mastery + RAW proficiency fixes for Rogue/Monk/Wizard; buff/utility spell policy; Shield reaction post-hit) is archived at [docs/changelog/archive-slices-588-592.md](docs/changelog/archive-slices-588-592.md).

Per-slice detail for slices 583-587 (spell-coverage aura-damage harness; Rules Lab removal; combat-fuzz CLI introduction; spell-attack trigger dispatch fix; transcript advantage fix) is archived at [docs/changelog/archive-slices-583-587.md](docs/changelog/archive-slices-583-587.md).

Per-slice detail for slices 580-582 (Option-C closure: Deafened auto-fail hearing checks; Frightened movement-gate audit; minimal encumbrance — Petrified ×10 + Goliath Powerful Build) is archived at [docs/changelog/archive-slices-580-582.md](docs/changelog/archive-slices-580-582.md).

Per-slice detail for slices 576-579 (auto-fail save consumption; `consumeOnCheck` + `consumeOnSave` + planBardicInspiration + Help-on-check; planLayOnHands; Search/Study/Influence/Utilize) is archived at [docs/changelog/archive-slices-576-579.md](docs/changelog/archive-slices-576-579.md).

Per-slice detail for slices 573-575 (per-class L1 end-to-end scenarios; CI-guarded L1 invariants audit; condition behavior tests + INCAPACITATING parity audit) is archived at [docs/changelog/archive-slices-573-575.md](docs/changelog/archive-slices-573-575.md).

Per-slice detail for slices 571-572 (planHelp — both modes; planReady) is archived at [docs/changelog/archive-slices-571-572.md](docs/changelog/archive-slices-571-572.md).

Per-slice detail for slices 569-570 (Exhaustion attack-roll + Speed penalties; Incapacitated → concentration-break on apply) is archived at [docs/changelog/archive-slices-569-570.md](docs/changelog/archive-slices-569-570.md).

Per-slice detail for slices 567-568 (condition effect-list completeness sweep + three attack-resolution gates: within-5-ft auto-crit, Prone asymmetric attacker advantage, Grappled non-grappler disadvantage) is archived at [docs/changelog/archive-slices-567-568.md](docs/changelog/archive-slices-567-568.md).

Per-slice detail for slices 565-566 (Hex ability-disadvantage rider; Favored Enemy Hunter's Mark pool-based free-cast) is archived at [docs/changelog/archive-slices-565-566.md](docs/changelog/archive-slices-565-566.md).

Per-slice detail for slices 562-564 (Eldritch Blast multi-beam scaling; Vicious Mockery disadvantage rider; per-caster L1 spellcasting math test suite) is archived at [docs/changelog/archive-slices-562-564.md](docs/changelog/archive-slices-562-564.md).

Per-slice detail for slices 560-561 (Human / Tiefling Medium-or-Small size choice; Druid Magician cantrip choice + audit clarifications) is archived at [docs/changelog/archive-slices-560-561.md](docs/changelog/archive-slices-560-561.md).

Per-slice detail for slices 553-559 (Goliath Giant Ancestry × 6 arms cohort + 3 missing focus variants) is archived at [docs/changelog/archive-slices-553-559.md](docs/changelog/archive-slices-553-559.md).

Per-slice detail for slices 549-552 (post-L1-audit fixes: Rogue Sneak Attack finesse/ranged weapon gate; Cover bonus on Dex saves; Forest Gnome Speak with Animals per-rest cap; Reach property OA threat range) is archived at [docs/changelog/archive-slices-549-552.md](docs/changelog/archive-slices-549-552.md).

Per-slice detail for slices 545-548 (final L1 deep-audit closure: planSecondWind; Healer's Kit + planUseHealersKit; Savage Attacker audit-clarification; planRage + raging condition) is archived at [docs/changelog/archive-slices-545-548.md](docs/changelog/archive-slices-545-548.md).

Per-slice detail for slices 541-544 (L1 SRD primitive completion: Dragonborn Breath Weapon; Heroic Inspiration first-class resource; Halfling Luck cohort sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md).

Per-slice detail for slices 536-540 (L1 species coverage tail: Elf Trance; Human Resourceful narrative marker; Halfling Luck primitive + attack/save/check arms; Dwarf Stonecunning) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md).

Per-slice detail for slices 530-535 (L1 species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md).

Per-slice detail for slices 525-529 (at-will monster spellcasting; Pact of the Chain familiar combat-surface; cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md).

Per-slice detail for slices 520-524 (Spare the Dying + stabilize; Expeditious Retreat; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md).

Per-slice detail for slices 517-519 (Pact boon completion: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md).

Per-slice detail for slices 506-512 (L1-completion polish: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md).

Per-slice detail for slices 472-481 (post-alpha.15 iconic-encounter content sweep) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md).

## Older releases

Tagged release `0.1.0-alpha.15` lives in [docs/changelog/released-versions-alpha-15.md](docs/changelog/released-versions-alpha-15.md); `0.1.0-alpha.14` lives in [docs/changelog/released-versions-alpha-14.md](docs/changelog/released-versions-alpha-14.md); `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
