# CHANGELOG archive index

Per-slice detail and per-cohort archives, split out of the live [CHANGELOG.md](../../CHANGELOG.md) to keep every file within the single-Read ceiling. The live CHANGELOG carries only compact 3-line pointers per Unreleased slice (post-slice-628 convention) plus a "Older releases" pointer block; everything below is the per-slice detail or historical record.

When the **Unreleased** section itself approaches the ceiling before a release is cut, its oldest pointers are evicted to a per-cohort `archive-slices-NNN-MMM.md` here and the live file keeps a one-line reference (the slice-812 release-eviction pattern, applied to un-tagged pointers). Evicted Unreleased-pointer cohorts: [archive-slices-778-802.md](archive-slices-778-802.md) (slices 778-802, evicted in slice 827), [archive-slices-803-808.md](archive-slices-803-808.md) (slices 803-808, evicted in slice 846), [archive-slices-809-813.md](archive-slices-809-813.md) (slices 809-813, evicted in slice 850), [archive-slices-814-818.md](archive-slices-814-818.md) (slices 814-818, evicted in slice 853), [archive-slices-819-824.md](archive-slices-819-824.md) (slices 819-824, evicted in slice 858), [archive-slices-825-830.md](archive-slices-825-830.md) (slices 825-830, evicted in slice 865), [archive-slices-831-836.md](archive-slices-831-836.md) (slices 831-836, evicted in slice 870), [archive-slices-837-842.md](archive-slices-837-842.md) (slices 837-842, evicted in slice 874), [archive-slices-843-848.md](archive-slices-843-848.md) (slices 843-848, evicted in slice 881), [archive-slices-849-854.md](archive-slices-849-854.md) (slices 849-854, evicted in slice 889), [archive-slices-855-860.md](archive-slices-855-860.md) (slices 855-860, evicted in slice 896), and [archive-slices-861-866.md](archive-slices-861-866.md) (slices 861-866, evicted in slice 903).

## Per-slice files (slice 622 onward)

Slice 628 adopted the pointer-per-slice + detail-per-file convention. Each slice's full Files / Tests / Audit / Open-follow-ups blocks live in its own file here. The live CHANGELOG carries only a 3-line pointer; growth is ~150 bytes per slice instead of 4-9 KB, so the live file no longer hits the 60 KB ceiling on a 5-6 slice cadence.

- [slice-628.md](slice-628.md) — CHANGELOG sustainability (per-slice file convention).
- [slice-627.md](slice-627.md) — Innate Sorcery advantage gates on Sorcerer-list spells.
- [slice-626.md](slice-626.md) — three follow-up closures (on-hit mastery damage gate, s23 Graze test, Halfling Lucky transcript display).
- [slice-625.md](slice-625.md) — Martial Arts Die scales monk weapons too.
- [slice-624.md](slice-624.md) — Graze weapon mastery fires on MISS only.
- [slice-623.md](slice-623.md) — three RAW bugs from the slice-622 fuzz review (Vex autoExpiry, Innate Sorcery advantage, Monk Dexterous Attacks).
- [slice-622.md](slice-622.md) — pool-based fuzz loadouts.

Future slices append to this list.

## Per-cohort archives (slices 48-621, pre-slice-628 era)

Frozen historical record of per-slice detail from the pre-slice-628 era, grouped by cohort. Each fits in a single Read tool call.

*Slice detail for slices 48-621 lives in the per-cohort archive files below (single-Read fitness). Each fits in a single Read tool call:*

- *[archive-slices-506-512.md](archive-slices-506-512.md) (post-alpha.15 cohort G: the L1-completion polish arc — Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation (choice mechanism, Agonizing Blast canonical user, `event.spellId` damage fact, `GrantFeat` indirection primitive, per-cantrip Agonizing Blast generalization))*
- *[archive-slices-501-505.md](archive-slices-501-505.md) (post-alpha.15 cohort F: the L1-spell-tail close — Shillelagh + `weapon-buff` mechanic, Ensnaring Strike + `largeCreatureAdvantage` + `extraDicePerSlotLevel` — plus the L1 character-creation gap closures — Weapon Mastery enforcement, Rogue Thieves' Cant stale-stub sweep, Wizard Ritual Adept marker promotion)*
- *[archive-slices-496-500.md](archive-slices-496-500.md) (post-alpha.15 cohort E: zone-cohort sweep — Silence / Move Earth / Reverse Gravity / Earthquake; Ice Knife + `targetScope`; Sorcerous Burst + `explodeOnMaxDie`; Goodberry + `create-item` + inventory grant; Animal Friendship + `targetCreatureType` + `conditionEndsOnDamage`)*
- *[archive-slices-491-495.md](archive-slices-491-495.md) (post-alpha.15 cohort D: Boar Gore + chargedAtTarget, Web Walker + restrained-by-web, Death Dog disease + longRest recurring-save trigger, True Strike + weaponAttack, the positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness)*
- *[archive-slices-487-490.md](archive-slices-487-490.md) (post-alpha.15 cohort C: non-spellcaster Magic Initiate cast path, Cockatrice Petrification + escalateToCondition, Hippogriff Flyby + MovementMode, Stirge Blood Drain)*
- *[archive-slices-482-486.md](archive-slices-482-486.md) (post-alpha.15 cohort B: Animated Armor + Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + consumeOnIncomingAttack, Magic Initiate Druid, once-per-long-rest free-cast tracker)*
- *[archive-slices-472-481.md](archive-slices-472-481.md) (post-alpha.15 iconic-encounter content sweep: Scout / Cultist / Spy / Pack Tactics / Giant Spider+Centipede / Hippogriff / Brown Bear / Black Bear / Pirate Multiattacks and weapons)*
- *[archive-slices-460-468.md](archive-slices-460-468.md) (L1 playability arc part 3 - background mechanics: Human Skillful (461), Ghoul Bite (462), Cleric Turn Undead (463), monster Multiattack content declaration (464), Goliath species (465), backgrounds auto-project their Origin Feat + Sage RAW correction (466), Savage Attacker (467), Alert (468))*
- *[archive-slices-451-459.md](archive-slices-451-459.md) (L1 playability arc part 2: Kobold Sunlight Sensitivity + Undead sunlight sweep, Orc Adrenaline Rush + the slice-459 PB-uses correction, Brown Bear / Mastiff knock-prone, Goblin Nimble Escape, Zombie Undead Fortitude, Wizard Ritual Adept, Orc Relentless Endurance)*
- *[archive-slices-444-450.md](archive-slices-444-450.md) (L1 playability arc part 1: Divine Smite, Pack Tactics on L1 monsters, Wolf/Dire Wolf knock-prone, species traits sweeps 1 + 2, Rogue Thieves' Cant + Sprite natural weapons, the noAbilityModifierDamage weapon flag)*
- *[archive-slices-405-407.md](archive-slices-405-407.md) (plugin API part 1: the design proposal, the custom-action seam that made the inert handler registry live, and the Elemental Weapon retrofit)*
- *[archive-slices-400-403.md](archive-slices-400-403.md) (content-pack separation cohort: the multi-pack id-collision policy + pack validator, then the full SRD/non-SRD split, backgrounds + feats, the 12 spells + conditions, and removing non-SRD content to the gitignored content-packs/ folder)*
- *[archive-slices-392-397.md](archive-slices-392-397.md) (post-alpha.12 cohort part 4: the Flurry/Multiattack state-threading fix, a CHANGELOG archive split, the Rogue Withdraw half-Speed conversion that closed the last documented deviation, and the release-time doc-accuracy work (test/file-count reconcile, the auto-fix count gate, the judgment-figure review report))*
- *[archive-slices-386-391.md](archive-slices-386-391.md) (post-alpha.12 cohort part 3: full-RAW conversions of documented deviations - the size gate, Sap/Vex one-shot, the per-instance fixed-DC recurring save + Intimidating Presence repeat save, Absorb Elements slot scaling, and per-instance "ends on damage" for Sleep + Knock Out)*
- *[archive-slices-381-385.md](archive-slices-381-385.md) (post-alpha.12 cohort part 2: the inert-weapon-masteries fix + emitted-but-undefined audit, a CHANGELOG archive split, Evoker Potent Cantrip, and the Rogue Cunning Strike family (Cunning Strike + Improved + Devious Strikes))*
- *[archive-slices-376-380.md](archive-slices-376-380.md) (post-alpha.12 cohort part 1: the matchWalkSpeed "equal to your Speed" sweep, the srd-drift class-progression-table extension, and the three slice-377 feature-presence closures (Weapon Mastery on Barbarian/Fighter/Paladin + the Flex resolution, Monk Heightened Focus, Monk Open Hand Technique))*
- *[archive-slices-366-373.md](archive-slices-366-373.md) (post-alpha.11 cohort part 6: two bug-class arcs - the empty-effect-condition fixes (Hideous Laughter, Bestow Curse ability + inactive arms, Resistance cantrip) and the phantom-field-strip fixes (zero-damage save spells, melee-attack mistagging, cantrip non-scaling, item descriptions + the phantom-field audit))*
- *[archive-slices-361-365.md](archive-slices-361-365.md) (post-alpha.11 cohort part 5: project-wide doc reconciliation + the CI guards - count-drift, content cross-reference + effect-less-condition, planner-wiring, Custom-handlerId backing)*
- *[archive-slices-354-360.md](archive-slices-354-360.md) (post-alpha.11 cohort part 4: the subclass-feature wires Land's Aid / Wholeness of Body / Peerless Skill / Empowered Evocation / Aura of Devotion ally-half, plus archive splits 355-356)*
- *[archive-slices-352-353.md](archive-slices-352-353.md) (post-alpha.11 cohort part 3: Life Domain Preserve Life + a CHANGELOG archive split)*
- *[archive-slices-350-351.md](archive-slices-350-351.md) (post-alpha.11 cohort part 2: the L14 Tier-B subclass features Intimidating Presence + Dragon Wings)*
- *[archive-slices-345-349.md](archive-slices-345-349.md) (post-alpha.11 cohort part 1: subclass-doc reconciliation, the Tier-A subclass spell-grant wires (Devotion Spells, Draconic Resilience HP, Evocation Savant), and the first Tier-B subclass features (Hunter Colossus Slayer, Fiend Dark One's Blessing))*
- *[archive-slices-337-343.md](archive-slices-337-343.md) (0.1.0-alpha.11 cohort: spell-gaps catalog reconciliation + count audit, the hp-threshold spell mechanic with Power Word Kill + Power Word Stun, the multi-damage save extension with Flame Strike, the planDimensionDoor teleport planner, and Enthrall)*
- *[archive-slices-329-336.md](archive-slices-329-336.md) (post-alpha.10 cohort part 1: SRD-compliance docs accuracy sweep, the AddBonusDie primitive making Bless/Bane fully RAW, the Monk's Focus bonus-action trio that closed the last deferred main-class feature, and the deferred-primitives-backlog doc split)*
- *[archive-slices-315-322.md](archive-slices-315-322.md) (post-alpha.9 cohort: magic-equipment modeling stages 1-3 + the on-hit weapon-rider trigger family - target-gate, save, unconditional condition, plus the poison natural-weapon sweep)*
- *[archive-slices-301-312.md](archive-slices-301-312.md) (post-alpha.8 cohort: buff-shape spell sweep, pack-integrity audit + orphan cleanup, magic-item buff sweep ~22 items, IncreaseAbilityScore primitive, itemKind categorization fixes + guards)*
- *[archive-slices-282-299.md](archive-slices-282-299.md) (alpha.8 release block: consumable + UseAction surface, non-walk speed, variant unrolls, AddModifier wildcard)*
- *[archive-slices-269-280.md](archive-slices-269-280.md) (alpha.7 release block: bug-fix cohort + consumer-coordinated pattern + docs hygiene)*
- *[archive-slices-261-268.md](archive-slices-261-268.md) (pattern-check chain: norm codified, RAW-deviation sweeps, filter-shape refinement)*
- *[archive-slices-252-260.md](archive-slices-252-260.md) (post-alpha.6 polish + audit-gap-fix trio + closure-annotation convention)*
- *[archive-slices-241-250.md](archive-slices-241-250.md) (alpha.6 release block, slices 241-250)*
- *[archive-slices-235-240.md](archive-slices-235-240.md)*
- *[archive-slices-217-234.md](archive-slices-217-234.md)*
- *[archive-slices-201-216.md](archive-slices-201-216.md)*
- *[archive-slices-196-200.md](archive-slices-196-200.md) (also covers monster batches 5.x + subclass batches 1.x)*
- *[archive-slices-186-195.md](archive-slices-186-195.md)*
- *[archive-slices-177-185.md](archive-slices-177-185.md)*
- *[archive-monsters-batch-4.md](archive-monsters-batch-4.md) (monsters batch 4.x)*
- *[archive-items-batch-4.md](archive-items-batch-4.md) (items batch 4.x)*
- *[archive-slices-172-176.md](archive-slices-172-176.md)*
- *[archive-content-batches-1.md](archive-content-batches-1.md) (monsters batch 1.x + items batch 1.x)*
- *[archive-rollup-narrative-A.md](archive-rollup-narrative-A.md) (slices 48-171 rollup, first half)*
- *[archive-rollup-narrative-B.md](archive-rollup-narrative-B.md) (slices 48-150 rollup, second half + tail of Unreleased)*

*Released versions archives, split by version range as they grow (per the slice-437 active-cycle invariant):*

- *[released-versions-alpha-14.md](released-versions-alpha-14.md) - tagged release `0.1.0-alpha.14` (2026-05-22), evicted in slice 471 (the alpha.15 release).*
- *[released-versions-alpha-6-13.md](released-versions-alpha-6-13.md) - tagged releases `0.1.0-alpha.6` through `0.1.0-alpha.13`.*
- *[released-versions.md](released-versions.md) - tagged releases `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, unpublished from npm in May 2026 on IP-cleanup grounds).*
