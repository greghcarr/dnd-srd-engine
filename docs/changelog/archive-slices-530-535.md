# Archive: slices 530-535

This file holds the per-slice changelog detail for slices 530-535, archived from the live CHANGELOG.md in slice 541 to keep that file under the 60 KB single-Read ceiling. Cohort: the L1 SRD species coverage sweep — Tiefling Fiendish Legacy + Otherworldly Presence (530), Dragonborn Draconic Ancestry + Damage Resistance (531), Elf + Gnome Lineage choices (532), Human Versatile (533), Dwarven Toughness (534), Halfling Nimbleness + Naturally Stealthy narrative markers (535). This block closes 6 of the ~14 L1 species gaps surfaced by a fresh SRD audit.

Picks up where [archive-slices-525-529.md](archive-slices-525-529.md) leaves off.

The global per-cohort archive index lives at [README.md](README.md).

---

**Content (slice 535): Halfling Nimbleness + Naturally Stealthy — narrative marker traits**

Wires the two narrative Halfling L1 traits per RAW. Both affect positional/Hide-action gates the engine doesn't model. Ships as declarative `{kind: 'Custom', handlerId}` markers so consumers can detect the trait presence and enforce the narrative rule. Mirror of the existing `nimble-escape` Custom-marker pattern on Goblin Warrior + Goblin Boss.

RAW (SRD 5.2.1 Halfling):
- "_Halfling Nimbleness._ You can move through the space of any creature that is a size larger than you, but you can't stop in the same space."
- "_Naturally Stealthy._ You can take the Hide action even when you are obscured only by a creature that is at least one size larger than you."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Halfling traits gain `{kind: 'Custom', handlerId: 'halfling-nimbleness'}` + `{kind: 'Custom', handlerId: 'halfling-naturally-stealthy'}`. No engine code; no handler implementation required (consumers read the marker to enforce the narrative rule when modeling positions / Hide gates).

**Documented:** Halfling Luck (reroll a 1 on any d20 test) stays deferred — needs a new reroll-on-1 primitive. Separate slice. The pre-existing Halfling trait Brave (SetAdvantage on saves preventing Frightened) is unchanged.

**Tests** ([tests/unit/engine/slice-535-halfling-narrative-traits.test.ts](../../tests/unit/engine/slice-535-halfling-narrative-traits.test.ts), 3 cases): both Custom markers ship; Brave regression check.

**Audit (content-sweep abbreviated):** zero new mechanism; reuses the slice-nimble-escape Custom-marker pattern. No new identifiers in engine code (only two new declarative content strings).

**L1 SRD audit progress (8 of ~14 gaps closed):**
- ✓ slices 530-534 + Halfling Nimbleness + Stealthy (this slice)
- ⏳ Halfling Luck (reroll primitive), Dwarf Stonecunning, Dragonborn Breath Weapon, Human Resourceful, Elf Trance.

**Pattern-check:** the Custom-marker pattern for narrative-only declared traits is now used 5 times in the pack (nimble-escape on Goblins, martial-arts on Monk, plus the two new Halfling markers, and the slice-456 zombie-undead-fortitude predecessor). It's the canonical "declaratively present but consumer-managed" shape for traits the engine can't or shouldn't model. Halfling Nimbleness + Naturally Stealthy specifically: consumers like an encounter UI can scan for these markers to surface the narrative rule on the character sheet without the engine doing anything at the rules layer.

---

**Content (slice 534): Dwarven Toughness — +1 HP per character level via AddModifier level-formula**

Wires Dwarf's Dwarven Toughness trait per RAW. Pure-content; the Formula DSL's `{ kind: 'level' }` node + the existing `AddModifier { target: 'hpMax' }` infrastructure compose to give +1 HP per total character level automatically (L1 = +1, L2 = +2, ..., L20 = +20). The derived `effectiveHpMax = hp.max + hpMaxBonus` shape already in place from the Aid spell (slice-Aid convention) carries this without any new derive code.

RAW (SRD 5.2.1 Dwarf): "_Dwarven Toughness._ Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Dwarf traits gain `{ kind: 'AddModifier', target: 'hpMax', value: { kind: 'level' } }`.

**Documented (not a deviation):** the bonus is projected via `effectiveHpMax = hp.max + hpMaxBonus` on the derived character view. The stored `character.hp.max` is NOT mutated; reducer-side rules (massive damage threshold, heal clamping) still use stored `hp.max`. Standard Aid-spell convention.

**Tests** ([tests/unit/engine/slice-534-dwarven-toughness.test.ts](../../tests/unit/engine/slice-534-dwarven-toughness.test.ts), 8 cases): trait shape (AddModifier hpMax level-formula); at L1/L2/L3/L5/L10/L20 the `hpMaxBonus` equals the character level and `effectiveHpMax = hp.max + level`; non-dwarf control gets 0 bonus.

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

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Human traits gain `OfferChoice` `human-versatile` with 6 options — Savage Attacker, Alert, Magic Initiate (Cleric/Wizard/Druid), Skilled — each carrying `GrantFeat { featId }`.

**Documented RAW deferral:** Human's third trait, **Resourceful** ("You gain Heroic Inspiration whenever you finish a Long Rest"), stays deferred — it needs a Heroic-Inspiration-on-Long-Rest hook. Separate slice.

**Tests** ([tests/unit/engine/slice-533-human-versatile.test.ts](../../tests/unit/engine/slice-533-human-versatile.test.ts), 3 cases): OfferChoice exposes all 6 origin feats; all options wired with `GrantFeat { featId }` (canonical shape); end-to-end the Alert pick projects `+initiative` modifier into the effect stack via expandGrantFeatEffects.

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

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Elf traits gain `OfferChoice` `elf-elven-lineage` with 3 options (Drow / High Elf / Wood Elf).
- Gnome traits gain `OfferChoice` `gnome-gnomish-lineage` with 2 options (Forest / Rock).
- Drow's Darkvision 120 correctly overrides the base Darkvision 60 via `grantSense`'s max-range composition rule.

**Documented RAW deviations:**
- **Forest Gnome Speak with Animals**: wired as `at-will` instead of "PB uses per long rest." The spell is pure-narrative (consumer-managed talk-to-animals); the per-day envelope is cosmetic at the engine level. Tightens when per-day-uses primitive ships.
- **High Elf cantrip-swap on Long Rest**: not modeled (narrative).
- **Rock Gnome Tiny Clockwork Device**: narrative (consumer manages the device entity).
- **L3 + L5 Elven Lineage spells** (Faerie Fire / Darkness for Drow; Detect Magic / Misty Step for High Elf; Longstrider / Pass without Trace for Wood Elf): L3+ scope.

**Tests** ([tests/unit/engine/slice-532-elf-gnome-lineages.test.ts](../../tests/unit/engine/slice-532-elf-gnome-lineages.test.ts), 7 cases): both species ship correct OfferChoice traits with all options; Drow's 120-ft darkvision overrides base; Wood Elf's 35-ft walk speed via getEffectiveSpeed; High Elf cantrip; Forest Gnome dual-cantrip; Rock Gnome dual-cantrip.

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

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Dragonborn traits gain: `OfferChoice` `dragonborn-draconic-ancestry` with 10 options (one per dragon), each granting `GrantResistance` for the canonical damage type.

**Documented RAW deferrals:**
- **Breath Weapon** (PB uses per long rest; 1d10 at L1, +1d10 at L5/11/17; DC 8 + CON + PB; 15-ft Cone or 30-ft Line shape): deferred to slice 532. Needs a character-side breath-weapon planner + per-long-rest PB-uses tracker + level-scaling damage. The slice-140 BreathWeaponSpec primitive handles monsters with a static spec on the statblock; PCs need the ancestry-driven damage type + level-scaled damage dice resolved at cast time.
- **Draconic Flight** (L5 character feature): out of L1 scope.

**Tests** ([tests/unit/engine/slice-531-dragonborn-draconic-ancestry.test.ts](../../tests/unit/engine/slice-531-dragonborn-draconic-ancestry.test.ts), 12 cases): trait shape (Darkvision + OfferChoice); OfferChoice exposes all 10 ancestries; each ancestry projects the correct damage-type resistance via the effect stack (table-driven `it.each` × 10 ancestries).

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

Wires the two missing Tiefling L1 traits surfaced by a fresh L1 SRD audit against [references/srd-markdown/character-origins.md](../../references/srd-markdown/character-origins.md). Before this slice the Tiefling species had only Darkvision wired; RAW (SRD 5.2.1) requires Darkvision + Fiendish Legacy + Otherworldly Presence at L1.

RAW (SRD 5.2.1 Tiefling): "_Fiendish Legacy._ Choose a legacy from the Fiendish Legacies table. You gain the level 1 benefit of the chosen legacy. ... _Otherworldly Presence._ You know the _Thaumaturgy_ cantrip."

L1 Fiendish Legacies (resistance + cantrip each):
| Legacy | L1 benefit |
|---|---|
| Abyssal | Poison resistance + Poison Spray cantrip |
| Chthonic | Necrotic resistance + Chill Touch cantrip |
| Infernal | Fire resistance + Fire Bolt cantrip |

Pure content slice. Reuses existing primitives: `OfferChoice` (legacy pick), `GrantResistance`, `GrantSpell at-will` (slice 527's pathway). Zero engine work.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Tiefling traits gain: `OfferChoice` `tiefling-fiendish-legacy` with 3 options (Abyssal / Chthonic / Infernal), each granting `GrantResistance` + `GrantSpell` cantrip at-will CHA + `GrantSpell thaumaturgy at-will CHA` (Otherworldly Presence).

**Documented RAW deviations:**
- Spellcasting ability hardcoded to **CHA**. RAW lets the player choose INT / WIS / CHA at legacy-pick time (one ability for both Fiendish Legacy and Otherworldly Presence). Default CHA covers the typical sorcerer/warlock tiefling; consumer can override per-cast via the existing ability-override pathway. Future slice could add a meta-choice.
- L3 + L5 Fiendish Legacy spells (Ray of Sickness / False Life / Hellish Rebuke at L3; Hold Person / Ray of Enfeeblement / Darkness at L5) stay deferred. They're L3+ scope and the pack-level species model is flat (no per-level progression for non-class traits today).

**Tests** ([tests/unit/engine/slice-530-tiefling-fiendish-legacy.test.ts](../../tests/unit/engine/slice-530-tiefling-fiendish-legacy.test.ts), 6 cases): trait shape (Darkvision + OfferChoice + GrantSpell Thaumaturgy); OfferChoice exposes all 3 legacies; each legacy projects its resistance + cantrip via effect stack (table-driven `it.each`); Otherworldly Presence Thaumaturgy is granted at-will regardless of legacy pick.

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
