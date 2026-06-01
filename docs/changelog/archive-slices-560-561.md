# Archive: slices 560-561

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 567, to keep the live file under the 60 KB single-Read ceiling). These are the residual-cycle pre-closure slices that closed Human/Tiefling size choice (560) and Druid Magician cantrip choice + deep-audit clarifications (561).

---

---

**Content (slice 561): Final L1 closure — Druid Magician cantrip choice + deep-audit clarifications**

Final slice of the deep-audit closure cycle. Three small concerns from the final L1 SRD compliance pass close together:

**1. Druid Magician cantrip choice (closed)**
RAW (SRD 5.2.1 Druid L1, Primal Order — Magician): "You know one extra cantrip from the Druid spell list." The pack hardcoded `druidcraft` as that extra cantrip — denying player agency. Slice ships a nested OfferChoice inside the Magician option's effects array: `druid-magician-cantrip` over all 11 Druid cantrips (Druidcraft, Guidance, Mending, Message, Poison Spray, Produce Flame, Resistance, Shillelagh, Spare the Dying, Starry Wisp, Elementalism). Each option's effects grant the chosen cantrip with `preparation: "always-prepared"` + `spellcastingAbility: "WIS"`. The Warden option (sibling) is untouched.

**2. Heavy weapon Small-creature disadvantage + Loading property cap (audit-clarification)**
The deep audit's combat-surface agent flagged BOTH as "unwired." Verification proved BOTH were already wired in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts):
- `heavyForSmall` (~line 710): existing block; slice 560 routed it through `creatureSize` derive for consistency.
- `weaponIsLoading` (~line 1514) + per-turn cap via `turnUsage.loadedWeaponsFiredThisTurn`: existing block.

This was an audit misread (similar to the slice-547 Savage Attacker correction). The test in this slice asserts the load-bearing variables / blocks remain in attack.ts so a future audit doesn't re-flag them. No engine change required.

**3. Tiefling Fiendish Legacy spellcasting ability choice (deferred + documented)**
RAW (SRD 5.2.1 Tiefling, Fiendish Legacy): "Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast with this trait (choose the ability when you select the legacy)." The pack hardcodes `spellcastingAbility: 'CHA'` on the legacy's GrantSpell effects (Otherworldly Presence's Thaumaturgy + each legacy variant's L3/L5 spells). Making this player-choosable requires either (a) a new effect kind that sets the spellcasting ability for a category of spells, or (b) restructuring the slice-530 Fiendish Legacy choice so the ability selection cascades into each grant's `spellcastingAbility` field. Both options are non-trivial structural changes that aren't pure content fixes; tracked as a future slice in the gaps doc.

The drift's gameplay impact at L1: low. Most L1 Tieflings playing CHA-keyed classes (Warlock, Sorcerer, Bard, Paladin) prefer CHA anyway; the deviation matters mainly for INT-keyed (Wizard) or WIS-keyed (Cleric, Druid) Tieflings who would optimize differently. Consumer can override `spellcastingAbility` per-cast via cast-spell intent until the structural slice ships.

**Tests** ([tests/unit/engine/slice-561-final-l1-closures.test.ts](../../tests/unit/engine/slice-561-final-l1-closures.test.ts), 5 cases): Magician option contains nested OfferChoice; all 11 Druid cantrips offered (positive examples + cure-wounds negative control); Warden option untouched (martial weapon + medium armor); `heavyForSmall` block present in attack.ts with `creatureSize` lookup; `weaponIsLoading` block + per-turn cap present.

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
- [src/schemas/runtime/character.ts](../../src/schemas/runtime/character.ts): new optional `sizeOverride: Size` field on the Character schema. Additive + defaulted to undefined; old saves load unchanged.
- [src/derive/creature-size.ts](../../src/derive/creature-size.ts): `creatureSize` now reads `character.sizeOverride` FIRST, before falling back to statblock → species → Medium. The override takes precedence over even monster statblocks (a Polymorphed Hill Giant who picked Small as a Human stays Small).
- [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) (heavy-for-Small disadvantage gate): swapped the direct `species.size` read for `creatureSize(attacker, content)` so the override propagates. A Small Human Fighter with a Greatsword now correctly rolls with disadvantage.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Human species declares OfferChoice `human-size` with two options: `medium` / `small`.
- Tiefling species declares OfferChoice `tiefling-size` with the same two options.

**Consumer projection (documented):** the engine doesn't auto-apply the OfferChoice option to `sizeOverride` — no `SetSize` effect kind exists. The consumer (UI / character builder) reads the resolved choice and sets `character.sizeOverride` before committing the character. This is the same consumer-managed pattern as starting ability score increases (background ASI choices); the engine declares the choice + the projection mechanism, the consumer wires the resolved value.

**Tests** ([tests/unit/engine/slice-560-human-tiefling-size.test.ts](../../tests/unit/engine/slice-560-human-tiefling-size.test.ts), 10 cases): pack declarations for both species; Human + Tiefling default to Medium without override; sizeOverride = Small / Medium project correctly; sizeOverride takes precedence over statblockId; Small Human + Small Tiefling with Greatsword roll with disadvantage; Medium Human with Greatsword does NOT (control).

**Audit:**
- **Names:** `sizeOverride` is intention-revealing — clearly distinguishes player choice from species / monster base size.
- **DRY:** the heavy-for-Small check now goes through the canonical `creatureSize` derive (was: bypass + direct `species.size`). One read site, one source of truth.
- **SRP:** schema field is one line; derive update is two lines; attack.ts update is two lines.
- **Magic numbers:** none.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** schema parse with the override; derive returns correct size in all 5 precedence cases; downstream attack disadvantage gate fires when override = Small.

**Pattern-check:** the OfferChoice has empty `effects: []` for both options — RAW size is a flat property, not an effect-stack contribution. Future species with similar size-flexibility (none in SRD currently) reuse this pattern. The consumer-projection convention is shared with background ASI choices (slice 466) and equipment-pack picks (deferred narrative).

---
