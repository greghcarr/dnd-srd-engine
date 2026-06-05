# Released versions: 0.2.0-alpha.0

Frozen release narrative for `0.2.0-alpha.0` (2026-06-03), evicted from the live [CHANGELOG.md](../../CHANGELOG.md) in slice 688 (the v0.4.0-alpha.0 release bump pushed the live file over the 60 KB single-Read ceiling, per the slice-437 active-cycle invariant). Sibling to [released-versions-alpha-15.md](released-versions-alpha-15.md) (alpha.15), [released-versions-alpha-14.md](released-versions-alpha-14.md) (alpha.14), [released-versions-alpha-6-13.md](released-versions-alpha-6-13.md) (alpha.6-13), and [released-versions.md](released-versions.md) (alpha.0-5).

---

## 0.2.0-alpha.0 - 2026-06-03

**Release (slice 632): bump to 0.2.0-alpha.0**

Promotes the post-alpha.15 cohort (slices 472-631, ~160 slices) to a tagged release. The minor-pre-1.0 bump (the "escape hatch" per [VERSIONING.md](VERSIONING.md)) marks this cycle's chapter status — full L1 SRD coverage now floor-guarded by audit, plus the documented breaking changes below — without claiming beta-ready API stability. `package.json` bumps `0.1.0-alpha.15` → `0.2.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: no breaking persisted-shape changes in this cycle.

### Highlights

- **L1 SRD floor (slices 530-619).** Every printed L1 species trait, class feature, weapon mastery, and SRD spell mechanic is now wired and floor-guarded by [tests/audit/srd-l1-complete.test.ts](tests/audit/srd-l1-complete.test.ts) (slice 619). The L1 fuzz cycle (slices 620-627) surfaced and closed RAW bugs in concentration RAW dispatch, rider-damage concentration triggers, Vex auto-expiry, Innate Sorcery's class gate, Monk Dexterous Attacks + Martial Arts Die scaling, the Graze hit/miss gate, and the on-hit mastery 0-damage gate. `engine.plan.offerCharacterChoices` now drains L1 OfferChoice entries on fresh characters (slice 618).
- **Fuzz tooling + web replay (slices 583-624).** New combat-fuzz CLI generates seeded markdown transcripts of L1-L5 PCs (and monsters) fighting each other; pool-based loadouts (slice 622) exercise 25+ distinct spells per seed across 7+ masteries. The web demo pivoted to a fuzz-replay viewer (slices 599-616) with LRU-bounded scrub cache, per-step incremental replay, and observer-review-driven readability polish.
- **Doc overhaul (slices 628-631).** CHANGELOG sustainability (pointer-per-slice + detail-per-file: live file 59 KB → 12 KB, growth per slice 4-9 KB → ~150 B); CLAUDE.md split into agent-only file (72 lines) plus [CONTRIBUTING.md](CONTRIBUTING.md) (288 lines), new [docs/architecture.md](docs/architecture.md), new [docs/engine-scope.md](docs/engine-scope.md) (the engine-tracks-vs-consumer-tracks reference); comprehensive feature tutorial at [docs/tutorial.md](docs/tutorial.md) with every typecheck-tagged block compiled against the real public API; numerical accuracy sweep that promoted the spell-wired percentage + EFFECT_KINDS citations to permanent CHECKs (doc-counts audit grew from 10 to 19 cases).
- **Engine vocabulary growth.** `EFFECT_KINDS` grew from 53 entries at alpha.15 to 61 (60 primitives + Custom). Spell mechanical wiring rose from 182/339 (~54%) to 198/339 (~58%). New planners across the cycle include polymorph / wild shape, simulacrum, wish, breath weapon (dragonborn), wholeness-of-body, peerless skill, cutting words, divine intervention, paladin's smite, frenzy, plus the action-economy planners (cunning action, second wind, lay on hands, search, study, influence, utilize, help, ready, dodge, dash, disengage).
- **Content depth.** Pact-boon completion (slices 517-519: Tome, Blade with `planConjurePactWeapon`, Chain with at-will Find Familiar); Warlock invocations content sweep (slices 513-516); monster Multiattack with Pack-Tactics-aware monsters; species coverage (Goliath, Tiefling Fiendish Legacy, Dragonborn Draconic Ancestry, Halfling Luck, Elf Trance, Dwarven Toughness, Dwarf Stonecunning).

### Breaking changes

#### Slice 603: `engine.plan.castSpell` on Produce Flame (and equivalent BA-cast + persistent + attack-mechanic spells) now requires Action available

**Pre-slice:** `engine.plan.castSpell({ spellId: 'produce-flame', targetIds: [...] })` succeeded if the caster had a Bonus Action available. The cast consumed only the BA but rolled the hurl-attack inline, so a consumer could "cast PF" while their Action was already used elsewhere.

**Post-slice:** the same call now throws if the caster's Action is already used when targets are supplied, with message: `"<Caster> cannot hurl <spell>: action already used this turn (RAW: a BA cast + Magic action hurl requires both unspent)"`. The cast consumes BOTH a Bonus Action AND an Action when targets are supplied (matching RAW: BA cast produces the flame, Magic action hurls). Cast-without-hurl (no targetIds) keeps the BA-only behavior.

**Why:** RAW correction. SRD 5.2.1 Produce Flame: "Casting Time: Bonus Action ... Until the spell ends, you can take a Magic action to hurl fire at a creature." The hurl IS a separate action. Pre-slice the engine collapsed cast + hurl into one BA, giving casters a free spell attack alongside their full Action.

**Migration:** consumers calling `castSpell` for Produce Flame inside a turn where Action is consumed should either:
- Cast without targets (BA only, no attack rolled) — gets the flame for light/utility.
- Wait until next turn to hurl — call `castSpell` separately when Action is free. (The engine doesn't yet model the persistent-flame state across turns; the proper-RAW split planner is tracked as an open follow-up in [slice 603's archive entry](docs/changelog/archive-slices-599-603.md).)

**Detection:** an existing campaign with a logged Produce Flame cast on a turn where Action was already used would still REPLAY correctly (replay-equivalence holds for committed events; the rejection happens at plan time only). The break only surfaces when new intents are planned.

### RNG-stream changes (per-seed reproducibility shifts)

Per [docs/determinism.md](docs/determinism.md), per-seed RNG reproducibility is version-sensitive. The following slices in this cycle changed RNG consumption patterns:

- Slice 601: CON save on every damage to a concentrating creature.
- Slice 602: 2 d20 rolls on spell attacks vs advantage-granting targets.
- Slice 611: Halfling Luck reroll + Bless bonus dice on spell attacks.
- Slice 612: per-component CON saves (one per damage source instead of one totaled).
- Slice 614: 2 d20 rolls on off-hand attacks vs advantage-granting targets.

A transcript from `combat-fuzz --seed N` generated on `0.1.0-alpha.15` will NOT byte-match the same command on `0.2.0-alpha.0` if any of these paths fired. Consumers depending on cross-version per-seed reproducibility should snapshot the resulting `CampaignState` alongside the seed.

### Cycle inventory

Per-slice detail for slices 472-621 lives in per-cohort `docs/changelog/archive-slices-NNN-MMM.md` files (the pre-slice-628 convention) plus the inline pointers below for slices 622-631 (the post-slice-628 per-slice-file convention). The pointer list below indexes both.

**Tests + docs (slice 631): numerical accuracy sweep + audit extension**
Extended doc-counts.test.ts to derive the spell wired/narrative/deferred/total split + rounded percentage from gaps-spells.md and pin five front-door-doc citations against the derived values. Updated stale percentages (README "~54%" → "~58%"; status.md "196/339" / "182" → "198/339"). Rewrote the two genuinely unmeasurable percentages ("~75% of planned EFFECT_KINDS", "~95% of printed mechanics") qualitatively per "CI-guarded or not stated."
Detail: [slice-631.md](docs/changelog/slice-631.md).

**Docs (slice 630): comprehensive feature tutorial**
New docs/tutorial.md walks every major capability end-to-end in one running example (install → engine → character → L1 choices → equip → derive → encounter → attack → spell → reaction → masteries → rests → level-up → event stream → save/load/replay → undo → custom content → custom handlers → determinism → engine scope). Every typecheck-tagged block compiles against the real public API via the doc-examples audit.
Detail: [slice-630.md](docs/changelog/slice-630.md).

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
