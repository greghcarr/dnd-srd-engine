# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Tests (slice 564): per-caster L1 spellcasting math test suite**

Pure test-rigor slice closing the biggest L1 spellcasting verification gap. Pre-slice the spell DC + slot derivation tests covered only Wizard / Paladin / Warlock at L1; five L1 caster classes (Bard, Cleric, Druid, Ranger, Sorcerer) had no direct math assertion, so a regression in `FULL_CASTER_SLOTS`, the half-caster rounding rule, or the per-class spellcasting-ability declaration could land without firing a test.

RAW source: [references/srd-markdown/classes.md](references/srd-markdown/classes.md) per-class progression tables (PB column = +2 at L1; spell slots row at L1).

**Tests** ([tests/unit/derive/slice-564-per-caster-l1-spellcasting.test.ts](tests/unit/derive/slice-564-per-caster-l1-spellcasting.test.ts), 32 cases — 4 per class × 8 caster classes): table-driven `CASTERS` array covers Bard / Cleric / Druid / Sorcerer / Wizard / Paladin / Ranger / Warlock. For each:
1. Pack declaration: `spellcasting.ability` + `spellcasting.type` match the RAW spec (CHA-full / WIS-full / WIS-full / CHA-full / INT-full / CHA-half / WIS-half / CHA-pact).
2. `computeSpellSlots` at L1 with the keying ability at 16: returns the RAW slot table (`[2,0,0,0,0,0,0,0,0]` for full + half casters; `[0,0,0,0,0,0,0,0,0]` standard plus `{level:1, count:1}` pact for Warlock).
3. `computeSpellSaveDC`: 8 base + 2 prof + 3 ability mod = **13** for every caster.
4. `computeSpellAttackBonus`: 2 prof + 3 ability mod = **+5** for every caster.

The 2024 PHB half-caster change (L1 grants 2 first-level slots; 2014 granted nothing until L2) is now pinned for both Paladin and Ranger.

**Audit:**
- **Names:** `CasterSpec` and the `CASTERS` table read as RAW reference rather than test fixtures; ability constants (`ABILITY_AT_16`, `PROF_BONUS_L1`, `MOD_AT_16`, `DC_BASE`) extracted so the math is self-documenting.
- **DRY:** one `buildL1Caster(classId, ability)` helper + a table-driven loop covers all 32 cases; adding a new caster (or correcting a RAW table value) is a single `CASTERS` row.
- **SRP:** new test file only — no engine or content edits.
- **Magic numbers:** all extracted to named constants (`ABILITY_AT_16 = 16`, `DC_BASE = 8`, `EXPECTED_DC = DC_BASE + PROF_BONUS_L1 + MOD_AT_16`).
- **at-threading:** N/A (no events emitted).
- **Mechanical outcomes asserted:** per-class spellcasting ability declaration, per-class slot table (full / half / pact), DC formula, attack-bonus formula.

**Pattern-check:** the existing per-class one-off tests (Wizard in [tests/unit/derive/spell-dc.test.ts](tests/unit/derive/spell-dc.test.ts); Wizard + Paladin + Warlock in [tests/unit/derive/spell-slots.test.ts](tests/unit/derive/spell-slots.test.ts)) stay as targeted regression catches (with their L5 / L20 / multiclass scenarios). This slice ADDS the per-class L1 sweep alongside them rather than replacing — the legacy tests stay green and the new file covers the breadth.

---

**Engine + content (slice 563): Vicious Mockery disadvantage-on-next-attack rider — second of three residual L1 drift closures**

Closes the Vicious Mockery rider drift surfaced by the post-cycle deep review. Pre-slice a failed save against Vicious Mockery dealt 1d6 psychic damage but the RAW disadvantage rider was absent; an L1 Bard had a strict damage cantrip, not the debuff cantrip RAW prescribes.

RAW (SRD 5.2.1 Vicious Mockery): "Wisdom Saving Throw: 1d6 Psychic damage. The target has Disadvantage on the next attack roll it makes before the end of its next turn."

**Schema** ([src/schemas/content/spell.ts](src/schemas/content/spell.ts)): new optional `applyConditionSourceFromTarget: boolean` on the spell `save` mechanic. When true, the `ConditionApplied` event emitted for `conditionOnFail` uses the *target* (the failed-save creature) as the `sourceCharacterId`, not the caster. This is load-bearing for autoExpiry's "next turn" semantic — autoExpiry keys off the bearer's turn, not the caster's.

**Engine** ([src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- When `applyConditionSourceFromTarget === true`, the emitted `ConditionApplied` event sets `sourceCharacterId = targetId`.
- autoExpiry stamping: if the condition has `autoExpiry` and an active encounter is in progress, the event also carries `expiresOnRound` (current round + `afterRounds`) + `expiryTrigger`. The existing round-tick autoExpiry sweep already handles the cleanup; this just wires the per-event metadata.

**Engine** ([src/engine/plan/attack.ts](src/engine/plan/attack.ts), `buildConsumeOnAttackRemovals`): the consume-on-attack filter previously matched applied conditions only when `sourceCharacterId` was undefined or equal to the *defender* (the original Sap / Vex pattern: attacker debuffs target, target's next attack consumes). Vicious Mockery is the inverse: the *attacker* (the mocked creature) bears a condition sourced from itself. The filter now also matches `sourceCharacterId === attacker.id` (self-sourced), so a self-borne consume-on-attack condition fires on the bearer's next attack. RAW: "next attack roll it makes" — the bearer's attack.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `viciously-mocked` condition: `consumeOnAttack: true`; `autoExpiry: { afterRounds: 1, trigger: "turnEnd" }`; effects `[{ kind: "SetAdvantage", on: "attack", mode: "disadvantage" }]`.
- Vicious Mockery save mechanic gains `conditionOnFail: "viciously-mocked"` + `applyConditionSourceFromTarget: true`.

**Tests** ([tests/unit/engine/slice-563-vicious-mockery-rider.test.ts](tests/unit/engine/slice-563-vicious-mockery-rider.test.ts), 5 cases): pack declarations for condition + spell wiring; failed save emits ConditionApplied with sourceCharacterId = target (not caster); the mocked target's next attack rolls with disadvantage; the condition is consumed after the first attack (RAW "next attack roll").

**Audit:**
- **Names:** `applyConditionSourceFromTarget` is verbose but unambiguous — it documents exactly the inversion it performs vs. the default caster-as-source.
- **DRY:** the `buildConsumeOnAttackRemovals` filter now covers all three source-shapes (undefined / defender / attacker-self) in one helper. The existing Sap / Vex paths are unaffected (their `sourceCharacterId` is the attacker who applied the debuff, which equals the defender in the attack-event frame).
- **SRP:** schema is one optional field; cast-spell change is the conditional source + the autoExpiry stamping block; attack.ts change is one filter clause.
- **Magic numbers:** none.
- **at-threading:** the autoExpiry stamping uses the existing `state.encounters[activeEncounterId].round` read; the planner's single `nowIso()` resolution is unchanged.
- **Mechanical outcomes asserted:** ConditionApplied source = target (not caster); attack-disadvantage fires post-cast; condition consumed after one attack; autoExpiry expiry stamping (implicit via the SetAdvantage taking effect through the existing applied-conditions read path).

**Pattern-check:** the consume-on-attack filter's "sources" was the load-bearing pattern. Before: undefined / defender-sourced (Sap, Vex applied by attacker on defender). After: undefined / defender-sourced / attacker-self-sourced (viciously-mocked, where the *bearer* IS the future attacker). No other RAW condition today matches the new "attacker-self-sourced consume" shape, so the change widens the gate without changing existing match behavior. Future self-debuffs with consume-on-attack timing (a hypothetical "Stunning Smite consumes the smiter's next attack") would land in the same code path.

---

**Engine + content (slice 562): Eldritch Blast multi-beam scaling — first of three residual L1 drift closures**

Closes the highest-impact L1 spell drift surfaced by the post-cycle deep review. Pre-slice Eldritch Blast fired one beam regardless of caster level (`cantripScalingDice` was absent so no extra dice per beam, and no concept of beam count existed); RAW fires 1/2/3/4 beams at L1/L5/L11/L17. A L5+ Warlock was losing half (or more) of their cantrip's damage potential.

RAW (SRD 5.2.1 Eldritch Blast): "...The spell creates more than one beam when you reach higher levels: two beams at level 5, three beams at level 11, and four beams at level 17. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam."

**Schema** ([src/schemas/content/spell.ts](src/schemas/content/spell.ts)): new optional `cantripBeamScaling: boolean` field on the spell `attack` mechanic. When true, the scaling axis is the beam count (1 at L1, +1 at each of L5/L11/L17), not extra dice per beam. The existing `cantripScalingDice` is mutually exclusive (the cast-spell planner skips dice scaling when beam scaling is set).

**Engine** ([src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts), `planAttackMechanic`):
- Pre-iteration beam-count gate: `maxBeams = 1 + cantripExtraDice(totalLevel)` (reuses the existing scaling-threshold helper). Throws if `intent.targetIds.length` exceeds `maxBeams`, throws if zero target ids supplied.
- Inside the per-target loop: `cantripSteps` set to 0 when `cantripBeamScaling === true` so each beam rolls only the base `damageDice`. The "scaling" IS the beam count.
- Repeated target ids are allowed (RAW: "same or different creatures"). Each beam still rolls an independent attack via the existing per-target iteration.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Eldritch Blast `mechanicalEffects` gains `cantripBeamScaling: true`. No other spell uses this mode today.

**Tests** ([tests/unit/engine/slice-562-eldritch-blast-beams.test.ts](tests/unit/engine/slice-562-eldritch-blast-beams.test.ts), 10 cases): pack declaration verified; L1 → 1 beam (1 attack); L1 with 2 targets → rejected; L5 → 2 beams against different targets; L5 with 2 beams at the same target (RAW "same or different"); L5 with 3 targets → rejected; L11 → 3 beams; L17 → 4 beams; zero targets → rejected; per-beam damage stays 1d10 (no cantripScaling extra dice).

**Audit:**
- **Names:** `cantripBeamScaling` mirrors the existing `cantripScalingDice` naming axis.
- **DRY:** reuses `cantripExtraDice` helper for the beam-count threshold table.
- **SRP:** schema change is one optional field; engine change is one pre-iteration gate + one conditional in dice accumulation.
- **Magic numbers:** thresholds (5, 11, 17) live in the existing `CANTRIP_SCALING_THRESHOLDS`; beam-count formula is `1 + cantripExtraDice(level)`.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** beam count by level (1/2/3/4 at L1/L5/L11/L17); reject paths for under-count and over-count; same-target allowed; per-beam damage matches base die.

**Pattern-check:** Eldritch Blast is the canonical beam-scaling user in SRD 5.2.1; no other cantrip uses this mode. Future cantrips with similar shapes (e.g., a homebrew Scorching Ray analog) reuse the same field.

---

**Content (slice 561): Final L1 closure — Druid Magician cantrip choice + deep-audit clarifications**

Final slice of the deep-audit closure cycle. Three small concerns from the final L1 SRD compliance pass close together:

**1. Druid Magician cantrip choice (closed)**
RAW (SRD 5.2.1 Druid L1, Primal Order — Magician): "You know one extra cantrip from the Druid spell list." The pack hardcoded `druidcraft` as that extra cantrip — denying player agency. Slice ships a nested OfferChoice inside the Magician option's effects array: `druid-magician-cantrip` over all 11 Druid cantrips (Druidcraft, Guidance, Mending, Message, Poison Spray, Produce Flame, Resistance, Shillelagh, Spare the Dying, Starry Wisp, Elementalism). Each option's effects grant the chosen cantrip with `preparation: "always-prepared"` + `spellcastingAbility: "WIS"`. The Warden option (sibling) is untouched.

**2. Heavy weapon Small-creature disadvantage + Loading property cap (audit-clarification)**
The deep audit's combat-surface agent flagged BOTH as "unwired." Verification proved BOTH were already wired in [src/engine/plan/attack.ts](src/engine/plan/attack.ts):
- `heavyForSmall` (~line 710): existing block; slice 560 routed it through `creatureSize` derive for consistency.
- `weaponIsLoading` (~line 1514) + per-turn cap via `turnUsage.loadedWeaponsFiredThisTurn`: existing block.

This was an audit misread (similar to the slice-547 Savage Attacker correction). The test in this slice asserts the load-bearing variables / blocks remain in attack.ts so a future audit doesn't re-flag them. No engine change required.

**3. Tiefling Fiendish Legacy spellcasting ability choice (deferred + documented)**
RAW (SRD 5.2.1 Tiefling, Fiendish Legacy): "Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast with this trait (choose the ability when you select the legacy)." The pack hardcodes `spellcastingAbility: 'CHA'` on the legacy's GrantSpell effects (Otherworldly Presence's Thaumaturgy + each legacy variant's L3/L5 spells). Making this player-choosable requires either (a) a new effect kind that sets the spellcasting ability for a category of spells, or (b) restructuring the slice-530 Fiendish Legacy choice so the ability selection cascades into each grant's `spellcastingAbility` field. Both options are non-trivial structural changes that aren't pure content fixes; tracked as a future slice in the gaps doc.

The drift's gameplay impact at L1: low. Most L1 Tieflings playing CHA-keyed classes (Warlock, Sorcerer, Bard, Paladin) prefer CHA anyway; the deviation matters mainly for INT-keyed (Wizard) or WIS-keyed (Cleric, Druid) Tieflings who would optimize differently. Consumer can override `spellcastingAbility` per-cast via cast-spell intent until the structural slice ships.

**Tests** ([tests/unit/engine/slice-561-final-l1-closures.test.ts](tests/unit/engine/slice-561-final-l1-closures.test.ts), 5 cases): Magician option contains nested OfferChoice; all 11 Druid cantrips offered (positive examples + cure-wounds negative control); Warden option untouched (martial weapon + medium armor); `heavyForSmall` block present in attack.ts with `creatureSize` lookup; `weaponIsLoading` block + per-turn cap present.

**Audit:**
- **Names:** `druid-magician-cantrip` mirrors existing `magic-initiate-druid-cantrips` convention.
- **DRY:** the 11 cantrip options mirror the Magic Initiate Druid pattern (slice 485 / 469); could share a helper but inlining the array reads clearly and is local to one species feature.
- **SRP:** content-only edit for #1; doc-only for #2 + #3.
- **Magic numbers:** none.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** nested OfferChoice shape + cantrip pool + Warden control + load-bearing variable presence (smoke checks).

**Pattern-check:** the slice-547 audit-clarification convention (note in CHANGELOG that the agent misread, no engine change) gets a second use here. The deep-audit reports are useful but not always reliable — verification before fix is required (this slice + slice 547 are both "audit agent was wrong" corrections).

**L1 SRD compliance — DEEP-AUDIT CLOSURE COMPLETE.** Slices 549-561 close every load-bearing gap surfaced by the final L1 audit:
- ~~Sneak Attack finesse/ranged gate~~ — closed slice 549.
- ~~Cover bonus on Dex saves~~ — closed slice 550.
- ~~Forest Gnome Speak with Animals at-will over-grant~~ — closed slice 551.
- ~~Reach property OA threat range~~ — closed slice 552.
- ~~3 missing focus variants~~ — closed slice 553.
- ~~Goliath Giant Ancestry × 6 unwired options~~ — closed slices 554-559.
- ~~Human / Tiefling Medium-or-Small size choice~~ — closed slice 560.
- ~~Druid Magician cantrip choice~~ — closed by this slice.
- Heavy/Small + Loading — never were unwired (audit misread; documented here).
- Tiefling Fiendish Legacy ability choice — deferred (structural; tracked).

L1 SRD is now substantively RAW-compliant for every species + class + background combination surfaced by the deep audit.

---

**Engine + content (slice 560): Human / Tiefling Medium-or-Small size choice**

Closes the size-choice gap surfaced by the final L1 SRD compliance pass. RAW: both Human and Tiefling species offer a size choice at character creation ("Medium or Small"). Pre-slice both species were hardcoded to Medium; Small humans / tieflings were unreachable. The closure ships an `sizeOverride` field on Character, an OfferChoice on each species, and threads the override through `creatureSize` so downstream gates (slice-552 Heavy weapon Small-creature disadvantage) honor it automatically.

RAW (SRD 5.2.1 Human): "Size: Medium or Small (your choice)."
RAW (SRD 5.2.1 Tiefling): "Size: Medium or Small (your choice)."

**Engine:**
- [src/schemas/runtime/character.ts](src/schemas/runtime/character.ts): new optional `sizeOverride: Size` field on the Character schema. Additive + defaulted to undefined; old saves load unchanged.
- [src/derive/creature-size.ts](src/derive/creature-size.ts): `creatureSize` now reads `character.sizeOverride` FIRST, before falling back to statblock → species → Medium. The override takes precedence over even monster statblocks (a Polymorphed Hill Giant who picked Small as a Human stays Small).
- [src/engine/plan/attack.ts](src/engine/plan/attack.ts) (heavy-for-Small disadvantage gate): swapped the direct `species.size` read for `creatureSize(attacker, content)` so the override propagates. A Small Human Fighter with a Greatsword now correctly rolls with disadvantage.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Human species declares OfferChoice `human-size` with two options: `medium` / `small`.
- Tiefling species declares OfferChoice `tiefling-size` with the same two options.

**Consumer projection (documented):** the engine doesn't auto-apply the OfferChoice option to `sizeOverride` — no `SetSize` effect kind exists. The consumer (UI / character builder) reads the resolved choice and sets `character.sizeOverride` before committing the character. This is the same consumer-managed pattern as starting ability score increases (background ASI choices); the engine declares the choice + the projection mechanism, the consumer wires the resolved value.

**Tests** ([tests/unit/engine/slice-560-human-tiefling-size.test.ts](tests/unit/engine/slice-560-human-tiefling-size.test.ts), 10 cases): pack declarations for both species; Human + Tiefling default to Medium without override; sizeOverride = Small / Medium project correctly; sizeOverride takes precedence over statblockId; Small Human + Small Tiefling with Greatsword roll with disadvantage; Medium Human with Greatsword does NOT (control).

**Audit:**
- **Names:** `sizeOverride` is intention-revealing — clearly distinguishes player choice from species / monster base size.
- **DRY:** the heavy-for-Small check now goes through the canonical `creatureSize` derive (was: bypass + direct `species.size`). One read site, one source of truth.
- **SRP:** schema field is one line; derive update is two lines; attack.ts update is two lines.
- **Magic numbers:** none.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** schema parse with the override; derive returns correct size in all 5 precedence cases; downstream attack disadvantage gate fires when override = Small.

**Pattern-check:** the OfferChoice has empty `effects: []` for both options — RAW size is a flat property, not an effect-stack contribution. Future species with similar size-flexibility (none in SRD currently) reuse this pattern. The consumer-projection convention is shared with background ASI choices (slice 466) and equipment-pack picks (deferred narrative).

---

---

Per-slice detail for slices 553-559 (Goliath Giant Ancestry × 6 arms cohort + 3 missing focus variants) is archived at [docs/changelog/archive-slices-553-559.md](docs/changelog/archive-slices-553-559.md) (slice 562, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 549-552 (post-L1-audit fixes: Rogue Sneak Attack finesse/ranged weapon gate; Cover bonus on Dex saves; Forest Gnome Speak with Animals per-rest cap; Reach property OA threat range) is archived at [docs/changelog/archive-slices-549-552.md](docs/changelog/archive-slices-549-552.md) (slice 558, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 545-548 (final L1 deep-audit closure cohort: planSecondWind for Fighter L1, Healer's Kit + planUseHealersKit, Savage Attacker audit-clarification, planRage + raging condition for Barbarian L1) is archived at [docs/changelog/archive-slices-545-548.md](docs/changelog/archive-slices-545-548.md) (slice 553).

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon; Heroic Inspiration first-class resource; Halfling Luck cohort sweep + helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md) (slice 548).

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance; Human Resourceful narrative marker; Halfling Luck primitive + attack arm; Halfling Luck save + check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md) (slice 545).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md) (slice 541).

Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md) (slice 537).

Per-slice detail for slices 520-524 (Spare the Dying + stabilize; Expeditious Retreat + planExpeditiousRetreatDash; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md) (slice 529).

Per-slice detail for slices 517-519 (Pact boon completion arc: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520).

Per-slice detail for slices 506-512 (L1-completion polish arc: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490).

Per-slice detail for slices 472-481 (post-alpha.15 iconic-encounter content sweep) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487).

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
