# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content (slice 537): Human Resourceful — narrative marker trait**

Wires Human's Resourceful trait per RAW as a declarative Custom-handler marker. **Heroic Inspiration is not modeled in the engine at all today** (no field on Character, no events, no planner, no reroll mechanic). The full Heroic Inspiration primitive — grant on Long Rest + consume to reroll any d20 — is a substantial multi-slice primitive deferred to a future dedicated slice.

RAW (SRD 5.2.1 Human): "_Resourceful._ You gain Heroic Inspiration whenever you finish a Long Rest."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Human traits gain `{kind: 'Custom', handlerId: 'human-resourceful'}`. Audit allowlist documents why no engine handler is needed (engine has no Heroic Inspiration resource model yet). A consumer that DOES model Heroic Inspiration can detect this marker and grant an Inspiration token on Long Rest.

**Tests** ([tests/unit/engine/slice-537-human-resourceful.test.ts](tests/unit/engine/slice-537-human-resourceful.test.ts), 2 cases): human-resourceful Custom marker ships; pre-existing Human traits unchanged (Skillful + Versatile OfferChoices intact).

**Audit (content-sweep abbreviated):** zero new mechanism; reuses Custom-marker narrative-trait pattern.

**L1 SRD audit progress (10 of ~14 gaps closed):**
- ✓ slices 530-536 + Human Resourceful (this slice)
- ⏳ Halfling Luck (reroll-on-1 primitive), Dwarf Stonecunning (per-day BA tremorsense primitive), Dragonborn Breath Weapon (character-side primitive), **Heroic Inspiration primitive** (Resourceful's full implementation).

**Pattern-check:** 7 Custom-marker traits in the pack (martial-arts, nimble-escape × 2 monsters, halfling-nimbleness, halfling-naturally-stealthy, elf-trance, human-resourceful). The pattern remains the canonical "declaratively present but consumer-managed" shape. The Custom-marker class now segments cleanly into three sub-flavors: (a) "engine models the rule but keys off something other than the handlerId" (martial-arts, slow-fall), (b) "narrative rule the engine genuinely doesn't model" (halfling-nimbleness, halfling-naturally-stealthy, elf-trance), and (c) "engine could model this but hasn't yet" (human-resourceful awaiting the Heroic Inspiration primitive). Pattern is stable.

**Docs hygiene (slice 537 also)**: archived slices 525-529 detail to [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md) to keep the live CHANGELOG under the 60 KB single-Read ceiling (59.2 KB before the cut; ~44.5 KB after).

---

**Content (slice 536): Elf Trance — narrative marker trait**

Wires the Elf Trance trait per RAW. All three arms are narrative/consumer-managed (no-sleep state, magic-can't-put-to-sleep gate, 4-hour Long Rest). Ships as a Custom-handler marker (mirror of slice 535's Halfling markers + the long-established nimble-escape pattern). Added to pack-integrity's BACKED_INDIRECTLY allowlist.

RAW (SRD 5.2.1 Elf): "_Trance._ You don't need to sleep, and magic can't put you to sleep. You can finish a Long Rest in 4 hours if you spend those hours in a trancelike meditation, during which you retain consciousness."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Elf traits gain `{kind: 'Custom', handlerId: 'elf-trance'}`. Audit allowlist entry documents why no engine handler is needed (engine doesn't model sleep state, magical-sleep gates, or rest-wall-clock duration).

**Tests** ([tests/unit/engine/slice-536-elf-trance.test.ts](tests/unit/engine/slice-536-elf-trance.test.ts), 2 cases): elf-trance Custom marker ships; pre-existing Elf traits unchanged (no regression on Darkvision / Fey Ancestry / Keen Senses / Elven Lineage).

**Audit (content-sweep abbreviated):** zero new mechanism; reuses Custom-marker narrative-trait pattern.

**L1 SRD audit progress (9 of ~14 gaps closed):**
- ✓ slices 530-535 + Elf Trance (this slice)
- ⏳ Halfling Luck (reroll-on-1 primitive), Dwarf Stonecunning (per-day BA tremorsense primitive), Dragonborn Breath Weapon (character-side primitive), Human Resourceful (Heroic Inspiration on Long Rest), Goliath Powerful Build / Giant Ancestry (need to re-audit Goliath specifically).

**Pattern-check:** 6 Custom-marker traits in the pack now (martial-arts, nimble-escape × 2 monsters, halfling-nimbleness, halfling-naturally-stealthy, elf-trance). The pattern is fully canonical for "RAW trait the engine cannot model + consumer should know about." Position-aware consumers, VTTs, character-sheet UIs all benefit from the declarative presence.

---

**Content (slice 535): Halfling Nimbleness + Naturally Stealthy — narrative marker traits**

Wires the two narrative Halfling L1 traits per RAW. Both affect positional/Hide-action gates the engine doesn't model. Ships as declarative `{kind: 'Custom', handlerId}` markers so consumers can detect the trait presence and enforce the narrative rule. Mirror of the existing `nimble-escape` Custom-marker pattern on Goblin Warrior + Goblin Boss.

RAW (SRD 5.2.1 Halfling):
- "_Halfling Nimbleness._ You can move through the space of any creature that is a size larger than you, but you can't stop in the same space."
- "_Naturally Stealthy._ You can take the Hide action even when you are obscured only by a creature that is at least one size larger than you."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Halfling traits gain `{kind: 'Custom', handlerId: 'halfling-nimbleness'}` + `{kind: 'Custom', handlerId: 'halfling-naturally-stealthy'}`. No engine code; no handler implementation required (consumers read the marker to enforce the narrative rule when modeling positions / Hide gates).

**Documented:** Halfling Luck (reroll a 1 on any d20 test) stays deferred — needs a new reroll-on-1 primitive. Separate slice. The pre-existing Halfling trait Brave (SetAdvantage on saves preventing Frightened) is unchanged.

**Tests** ([tests/unit/engine/slice-535-halfling-narrative-traits.test.ts](tests/unit/engine/slice-535-halfling-narrative-traits.test.ts), 3 cases): both Custom markers ship; Brave regression check.

**Audit (content-sweep abbreviated):** zero new mechanism; reuses the slice-nimble-escape Custom-marker pattern. No new identifiers in engine code (only two new declarative content strings).

**L1 SRD audit progress (8 of ~14 gaps closed):**
- ✓ slices 530-534 + Halfling Nimbleness + Stealthy (this slice)
- ⏳ Halfling Luck (reroll primitive), Dwarf Stonecunning, Dragonborn Breath Weapon, Human Resourceful, Elf Trance.

**Pattern-check:** the Custom-marker pattern for narrative-only declared traits is now used 5 times in the pack (nimble-escape on Goblins, martial-arts on Monk, plus the two new Halfling markers, and the slice-456 zombie-undead-fortitude predecessor). It's the canonical "declaratively present but consumer-managed" shape for traits the engine can't or shouldn't model. Halfling Nimbleness + Naturally Stealthy specifically: consumers like an encounter UI can scan for these markers to surface the narrative rule on the character sheet without the engine doing anything at the rules layer.

---

**Content (slice 534): Dwarven Toughness — +1 HP per character level via AddModifier level-formula**

Wires Dwarf's Dwarven Toughness trait per RAW. Pure-content; the Formula DSL's `{ kind: 'level' }` node + the existing `AddModifier { target: 'hpMax' }` infrastructure compose to give +1 HP per total character level automatically (L1 = +1, L2 = +2, ..., L20 = +20). The derived `effectiveHpMax = hp.max + hpMaxBonus` shape already in place from the Aid spell (slice-Aid convention) carries this without any new derive code.

RAW (SRD 5.2.1 Dwarf): "_Dwarven Toughness._ Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Dwarf traits gain `{ kind: 'AddModifier', target: 'hpMax', value: { kind: 'level' } }`.

**Documented (not a deviation):** the bonus is projected via `effectiveHpMax = hp.max + hpMaxBonus` on the derived character view. The stored `character.hp.max` is NOT mutated; reducer-side rules (massive damage threshold, heal clamping) still use stored `hp.max`. Standard Aid-spell convention.

**Tests** ([tests/unit/engine/slice-534-dwarven-toughness.test.ts](tests/unit/engine/slice-534-dwarven-toughness.test.ts), 8 cases): trait shape (AddModifier hpMax level-formula); at L1/L2/L3/L5/L10/L20 the `hpMaxBonus` equals the character level and `effectiveHpMax = hp.max + level`; non-dwarf control gets 0 bonus.

**Audit (content-sweep abbreviated):** zero new mechanism; reuses AddModifier + Formula DSL level node + the Aid-style effectiveHpMax convention. No new identifiers.

**L1 SRD audit progress (7 of ~14 gaps closed):**
- ✓ slices 530-533 (Tiefling, Dragonborn ancestry, Elf, Gnome, Human Versatile)
- ✓ Dwarven Toughness (this slice)
- ⏳ Halfling (Nimbleness + Luck + Stealthy), Dwarf Stonecunning, Dragonborn Breath Weapon, Human Resourceful, Elf Trance.

**Pattern-check:** the Formula DSL's `level` node is rarely used for species traits (most species effects are flat values). This slice demonstrates the pattern works cleanly for "scales with character level" effects. Other future content with the same shape (potential examples: a future "Tough" feat granting +2 HP/level; per-level subclass bonuses) can mirror this directly.

---

**Content (slice 533): Human Versatile — origin-feat OfferChoice**

Wires Human's Versatile trait per RAW. Mirror of slice 530-532 pattern (OfferChoice + per-option-effects). Each option is a `GrantFeat` over one of the 6 origin feats; the slice-511 expandGrantFeatEffects pathway projects the chosen feat's effects into the bearer's effect stack automatically.

RAW (SRD 5.2.1 Human): "_Versatile._ You gain an Origin feat of your choice (see 'Feats'). Skilled is recommended."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Human traits gain `OfferChoice` `human-versatile` with 6 options — Savage Attacker, Alert, Magic Initiate (Cleric/Wizard/Druid), Skilled — each carrying `GrantFeat { featId }`.

**Documented RAW deferral:** Human's third trait, **Resourceful** ("You gain Heroic Inspiration whenever you finish a Long Rest"), stays deferred — it needs a Heroic-Inspiration-on-Long-Rest hook. Separate slice.

**Tests** ([tests/unit/engine/slice-533-human-versatile.test.ts](tests/unit/engine/slice-533-human-versatile.test.ts), 3 cases): OfferChoice exposes all 6 origin feats; all options wired with `GrantFeat { featId }` (canonical shape); end-to-end the Alert pick projects `+initiative` modifier into the effect stack via expandGrantFeatEffects.

**Audit (content-sweep abbreviated):** zero new mechanism; reuses OfferChoice + GrantFeat. No new identifiers.

**L1 SRD audit progress (6 of ~14 gaps closed):**
- ✓ Tiefling: Fiendish Legacy + Otherworldly Presence (slice 530)
- ✓ Dragonborn: Draconic Ancestry + Damage Resistance (slice 531)
- ✓ Elf: Elven Lineage (slice 532)
- ✓ Gnome: Gnomish Lineage (slice 532)
- ✓ Human: Versatile (this slice)
- ⏳ Human Resourceful, Halfling (Nimbleness + Luck + Stealthy), Dwarf (Toughness + Stonecunning), Dragonborn Breath Weapon, Elf Trance.

**Pattern-check:** Versatile is the 6th L1-species OfferChoice trait (Human Skillful, Goliath Giant Ancestry, Tiefling Fiendish Legacy, Dragonborn Draconic Ancestry, Elf Elven Lineage + Keen Senses, Gnome Gnomish Lineage, Human Versatile). The OfferChoice-with-GrantFeat shape (this slice) is a small variant of the broader OfferChoice pattern that proves the slice-511 GrantFeat indirection composes cleanly with species-side choices, not just class-feature choices.

---

**Content (slice 532): Elf + Gnome Lineage choices — closes 2 more L1 RAW gaps**

Wires the Elf and Gnome species lineage choices per RAW. Sibling pattern to slices 530-531: each lineage option grants its L1 effects (cantrips + persistent modifiers) via an `OfferChoice` on the species traits array. Pure content; reuses existing primitives.

**Elven Lineages** (L1 benefit):
| Lineage | Effect |
|---|---|
| Drow | Darkvision range 60 → 120 + Dancing Lights cantrip |
| High Elf | Prestidigitation cantrip |
| Wood Elf | Speed 30 → 35 ft + Druidcraft cantrip |

**Gnomish Lineages** (L1 benefit):
| Lineage | Effect |
|---|---|
| Forest Gnome | Minor Illusion + Speak with Animals cantrips |
| Rock Gnome | Mending + Prestidigitation cantrips |

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Elf traits gain `OfferChoice` `elf-elven-lineage` with 3 options (Drow / High Elf / Wood Elf).
- Gnome traits gain `OfferChoice` `gnome-gnomish-lineage` with 2 options (Forest / Rock).
- Drow's Darkvision 120 correctly overrides the base Darkvision 60 via `grantSense`'s max-range composition rule.

**Documented RAW deviations:**
- **Forest Gnome Speak with Animals**: wired as `at-will` instead of "PB uses per long rest." The spell is pure-narrative (consumer-managed talk-to-animals); the per-day envelope is cosmetic at the engine level. Tightens when per-day-uses primitive ships.
- **High Elf cantrip-swap on Long Rest**: not modeled (narrative).
- **Rock Gnome Tiny Clockwork Device**: narrative (consumer manages the device entity).
- **L3 + L5 Elven Lineage spells** (Faerie Fire / Darkness for Drow; Detect Magic / Misty Step for High Elf; Longstrider / Pass without Trace for Wood Elf): L3+ scope.

**Tests** ([tests/unit/engine/slice-532-elf-gnome-lineages.test.ts](tests/unit/engine/slice-532-elf-gnome-lineages.test.ts), 7 cases): both species ship correct OfferChoice traits with all options; Drow's 120-ft darkvision overrides base; Wood Elf's 35-ft walk speed via getEffectiveSpeed; High Elf cantrip; Forest Gnome dual-cantrip; Rock Gnome dual-cantrip.

**Audit (content-sweep abbreviated):** zero new mechanism; reuses OfferChoice + GrantSense + ModifySpeed + GrantSpell at-will. No new identifiers.

**L1 SRD audit progress** (closes 5 of ~14 gaps now):
- ✓ Tiefling: Fiendish Legacy + Otherworldly Presence (slice 530)
- ✓ Dragonborn: Draconic Ancestry + Damage Resistance (slice 531)
- ✓ Elf: Elven Lineage choice (this slice)
- ✓ Gnome: Gnomish Lineage choice (this slice)
- ⏳ Dragonborn: Breath Weapon (slice 533 candidate; needs new primitive)
- ⏳ Halfling: Nimbleness + Luck + Naturally Stealthy
- ⏳ Dwarf: Dwarven Toughness + Stonecunning
- ⏳ Elf: Trance (narrative)
- ⏳ Human: Resourceful + Versatile

**Pattern-check:** the OfferChoice-with-per-option-effects shape is now used 5 times for L1 species (Human Skillful, Goliath Giant Ancestry, Tiefling Fiendish Legacy, Dragonborn Draconic Ancestry, Elf Elven Lineage + Keen Senses, Gnome Gnomish Lineage). It's the canonical L1-species-choice shape; sibling gaps fit it cleanly. Remaining L1 species work splits into "OfferChoice content" (Human Versatile — origin feat choice) and "new primitive" (Halfling Luck reroll, Dwarf Toughness +1 HP/level, Stonecunning per-day bonus action).

---

**Content (slice 531): Dragonborn Draconic Ancestry + Damage Resistance — closes L1 RAW gap (resistance arm)**

Wires the Dragonborn's Draconic Ancestry choice + the resistance arm per RAW. Mirror of slice 530's Tiefling Fiendish Legacy pattern. The active arm (Breath Weapon: PB uses per long rest, 1d10 area save scaling by level) stays deferred to slice 532 — it needs a character-side breath-weapon planner since the slice-140 BreathWeaponSpec primitive is monster-only.

RAW (SRD 5.2.1 Dragonborn): "_Draconic Ancestry._ Choose the kind of dragon from the Draconic Ancestors table. Your choice affects your Breath Weapon and Damage Resistance traits ... _Damage Resistance._ You have Resistance to the damage type determined by your Draconic Ancestry trait."

Draconic Ancestors → damage type:
| Acid | Lightning | Fire | Cold | Poison |
|---|---|---|---|---|
| Black, Copper | Blue, Bronze | Brass, Gold, Red | Silver, White | Green |

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Dragonborn traits gain: `OfferChoice` `dragonborn-draconic-ancestry` with 10 options (one per dragon), each granting `GrantResistance` for the canonical damage type.

**Documented RAW deferrals:**
- **Breath Weapon** (PB uses per long rest; 1d10 at L1, +1d10 at L5/11/17; DC 8 + CON + PB; 15-ft Cone or 30-ft Line shape): deferred to slice 532. Needs a character-side breath-weapon planner + per-long-rest PB-uses tracker + level-scaling damage. The slice-140 BreathWeaponSpec primitive handles monsters with a static spec on the statblock; PCs need the ancestry-driven damage type + level-scaled damage dice resolved at cast time.
- **Draconic Flight** (L5 character feature): out of L1 scope.

**Tests** ([tests/unit/engine/slice-531-dragonborn-draconic-ancestry.test.ts](tests/unit/engine/slice-531-dragonborn-draconic-ancestry.test.ts), 12 cases): trait shape (Darkvision + OfferChoice); OfferChoice exposes all 10 ancestries; each ancestry projects the correct damage-type resistance via the effect stack (table-driven `it.each` × 10 ancestries).

**Audit (content-sweep abbreviated):** zero new mechanism; reuses OfferChoice + GrantResistance. No new identifiers.

**L1 SRD audit progress** (closes 3 of ~14 gaps now):
- ✓ Tiefling: Fiendish Legacy + Otherworldly Presence (slice 530)
- ✓ Dragonborn: Draconic Ancestry + Damage Resistance (this slice)
- ⏳ Dragonborn: Breath Weapon (slice 532 candidate)
- Halfling: Nimbleness + Luck + Naturally Stealthy
- Dwarf: Dwarven Toughness + Stonecunning
- Elf: Elven Lineage choice + Trance
- Gnome: Gnomish Lineage choice
- Human: Resourceful + Versatile

**Pattern-check:** the species-OfferChoice-for-ancestry shape is now used 3 times (Human Skillful, Tiefling Fiendish Legacy, Dragonborn Draconic Ancestry) plus Goliath Giant Ancestry from prior work. Elf + Gnome Lineage choices are the next natural siblings — same shape (OfferChoice with per-option-effects). Sibling lineage gaps are one-line content tasks.

---

**Content (slice 530): Tiefling Fiendish Legacy + Otherworldly Presence — closes L1 RAW gap**

Wires the two missing Tiefling L1 traits surfaced by a fresh L1 SRD audit against [references/srd-markdown/character-origins.md](references/srd-markdown/character-origins.md). Before this slice the Tiefling species had only Darkvision wired; RAW (SRD 5.2.1) requires Darkvision + Fiendish Legacy + Otherworldly Presence at L1.

RAW (SRD 5.2.1 Tiefling): "_Fiendish Legacy._ Choose a legacy from the Fiendish Legacies table. You gain the level 1 benefit of the chosen legacy. ... _Otherworldly Presence._ You know the _Thaumaturgy_ cantrip."

L1 Fiendish Legacies (resistance + cantrip each):
| Legacy | L1 benefit |
|---|---|
| Abyssal | Poison resistance + Poison Spray cantrip |
| Chthonic | Necrotic resistance + Chill Touch cantrip |
| Infernal | Fire resistance + Fire Bolt cantrip |

Pure content slice. Reuses existing primitives: `OfferChoice` (legacy pick), `GrantResistance`, `GrantSpell at-will` (slice 527's pathway). Zero engine work.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Tiefling traits gain: `OfferChoice` `tiefling-fiendish-legacy` with 3 options (Abyssal / Chthonic / Infernal), each granting `GrantResistance` + `GrantSpell` cantrip at-will CHA + `GrantSpell thaumaturgy at-will CHA` (Otherworldly Presence).

**Documented RAW deviations:**
- Spellcasting ability hardcoded to **CHA**. RAW lets the player choose INT / WIS / CHA at legacy-pick time (one ability for both Fiendish Legacy and Otherworldly Presence). Default CHA covers the typical sorcerer/warlock tiefling; consumer can override per-cast via the existing ability-override pathway. Future slice could add a meta-choice.
- L3 + L5 Fiendish Legacy spells (Ray of Sickness / False Life / Hellish Rebuke at L3; Hold Person / Ray of Enfeeblement / Darkness at L5) stay deferred. They're L3+ scope and the pack-level species model is flat (no per-level progression for non-class traits today).

**Tests** ([tests/unit/engine/slice-530-tiefling-fiendish-legacy.test.ts](tests/unit/engine/slice-530-tiefling-fiendish-legacy.test.ts), 6 cases): trait shape (Darkvision + OfferChoice + GrantSpell Thaumaturgy); OfferChoice exposes all 3 legacies; each legacy projects its resistance + cantrip via effect stack (table-driven `it.each`); Otherworldly Presence Thaumaturgy is granted at-will regardless of legacy pick.

**Audit (content-sweep abbreviated):** zero new mechanism; reuses OfferChoice + GrantSpell + GrantResistance primitives. No new identifiers.

**L1 SRD audit findings** (this slice closes 2 of ~14 gaps surfaced):
- ✓ Tiefling: Fiendish Legacy + Otherworldly Presence (this slice).
- Dragonborn: Draconic Ancestry choice + Breath Weapon (PB uses/long rest) + Damage Resistance. Slice 531 candidate; Breath Weapon can reuse the slice-140 `BreathWeaponSpec` primitive (originally built for monster dragons).
- Halfling: Nimbleness + Luck (reroll-on-1) + Naturally Stealthy. Luck needs a new reroll primitive.
- Dwarf: Dwarven Toughness (+1 HP per level) + Stonecunning (PB-uses Tremorsense Bonus Action).
- Elf: Elven Lineage choice (Drow / High / Wood) + Trance (narrative).
- Gnome: Gnomish Lineage choice (Forest / Rock — each grants spells).
- Human: Resourceful (Heroic Inspiration on Long Rest) + Versatile (origin feat choice).

**Pattern-check:** the OfferChoice + per-option-effects shape is the canonical L1-species-lineage pattern now (Human Skillful + Goliath Giant Ancestry + Elf Keen Senses + Tiefling Fiendish Legacy). At 4+ uses the shape is well-established; sibling lineage gaps (Elf, Gnome, Dragonborn ancestry) follow the same shape and ship as one-line OfferChoice traits each.

---



Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep: Imp Sting; Quasit Rend completes Chain combat surface; at-will Invisibility for Imp/Quasit/Sprite via pre-existing composition; docs correction; at-will spellcasting sweep across 8 monsters + 5 Magic Resistance fixes) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md) (slice 537, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 520-524 (L1-completion-followed-by-monster-sweep arc: Spare the Dying + `stabilize` mechanic; Expeditious Retreat + `planExpeditiousRetreatDash`; Venomous Snake statblock closing slice 519's follow-up; Pseudodragon Bite + Multiattack; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md) (slice 529, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 517-519 (L1-RAW-strict Pact boon completion arc: ChoiceResolved cascade primitive + Pact of the Tome canonical user; Pact of the Blade + `GrantPactBlade` marker + `planConjurePactWeapon`; Pact of the Chain + `GrantPactChain` marker + at-will Find Familiar free-cast) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind + `event.isConcentrationCheck` save fact; Repelling Blast + `PushTarget` TriggerAction + `event.source` damage fact + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 506-512 (Cleric Divine Order test; Floating Disk reclassification; Skilled origin feat; stale-note sweep; Warlock invocation foundation — choice mechanism + Agonizing Blast + `event.spellId` + `GrantFeat` indirection + per-cantrip variants) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 501-505 (Shillelagh + `weapon-buff` mechanic; Ensnaring Strike + `largeCreatureAdvantage` + `extraDicePerSlotLevel`; Weapon Mastery enforcement; Rogue Thieves' Cant stale-stub sweep; Wizard Ritual Adept marker promotion) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511, to keep this file under the 60 KB single-Read ceiling).

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
