# SRD rule-coverage ledger

A living, per-rule inventory of the SRD 5.2.1 mechanics this engine claims to model, each with an explicit **verification status**. Its job is to answer one question honestly: *for any given rule, do we actually know the engine enforces it correctly, or do we only know the code agrees with the author who wrote both the code and its test?*

This ledger is the artifact the [trustworthiness roadmap](trustworthiness-roadmap.md) summarizes. The roadmap is the narrative ("how far along are we"); this is the spreadsheet ("which rule, verified how").

Last calibrated: 2026-05-22, post-slice-419.

## The circularity trap (read this first)

A green test suite proves the code matches **the author's reading of the SRD**, not the SRD itself. The same author (Claude, across hundreds of slices) read the rules, wrote the engine, and wrote the tests. Three failure modes hide in that gap, and none of them shows up as a failing test:

1. **Misread rule** — code and test encode the same wrong reading. The test passes. The bug is invisible.
2. **Missing rule** — a rule never implemented is never tested; absence is silent.
3. **Implemented-but-unpinned** — code exists, but no assertion holds it to the SRD.

The only things that defeat circularity are (a) tests whose expected values come from the SRD *text* rather than the author's memory, and (b) a reader independent of the author. This ledger's **Verify** column makes the difference visible per rule, so we can see exactly which rules rest on circular evidence and target them.

## Legend

**Impl** (is it modeled?): ✅ implemented · ◐ partial · ❌ absent · `—` N/A (DM-discretion / out of scope).

**Verify** (how do we know it's SRD-correct?), in descending order of trust:

- 🟢 **Ground-truth** — the expected value is derived from the SRD itself, so a misreading cannot pass: parsed from the SRD markdown ([srd-drift](../tests/audit/srd-drift.test.ts)), transcribed *exhaustively* from a printed SRD table ([boundaries](../tests/boundaries/)), or a transcribed SRD worked example. **Non-circular.**
- 🟡 **Probe-tested** — a behavioral test pins the rule, but the expected outcome was asserted by the engine's author ([raw-compliance probes](../tests/audit/raw-compliance.test.ts), reducer/derivation unit tests, golden transcripts). Catches *regressions*; does **not** catch an original misreading. **Upgrade target** → move to 🟢 or get independent review.
- 🔴 **Unverified** — implemented but no dedicated test, or not implemented at all.

**The honest summary:** 🟢 is real confidence, 🟡 is regression-safety on top of an unaudited reading, 🔴 is a known blind spot. Maximizing 🟢 and shrinking 🟡/🔴 is the whole game.

## Anchors (CI-guarded)

These counts are pinned by [tests/audit/coverage-ledger.test.ts](../tests/audit/coverage-ledger.test.ts) so this ledger cannot overstate coverage as the suite grows or shrinks:

- Behavioral RAW-compliance probes (`raw-compliance.test.ts`): **48**
- Exhaustive ground-truth table groups (`tests/boundaries/`): **7**

If you add or remove a probe / boundary table, update the number here in the same commit; the guard will tell you the new value.

## Scoreboard (qualitative, hand-maintained)

Where the engine's confidence actually is, by area:

- **Strongest (mostly 🟢):** the printed-table math (ability mod, proficiency bonus, spell-slot tables, carrying capacity, exhaustion) and content-data fidelity (spell / monster / item / class-table fields). These are non-circular because srd-drift and the boundary tables derive expectations from the SRD.
- **Ground-truth-upgraded so far (🟢):** worn-armor + shield AC (slice 421), weapon data + plain-melee damage (422), spell save DC / attack (423), per-class saving-throw proficiencies (424), background-granted skill proficiencies (425), and species base walk speed (426) — each parses the SRD and recomputes rather than trusting the author. The arc paid for itself twice: slice 422 flushed out two missing firearms, and slice 426 surfaced (slice 427 fixed) that a created character didn't apply its species' walk speed (Goliath reported 30, not 35).
- **Still regression-safe but unaudited (🟡):** the remaining sheet math — class-choice skills, passive scores, the finesse/ranged attack ability choice, the ModifySpeed math, effect-granted save proficiencies, tool proficiencies — and the combat-legality rules the 48 probes cover. Implemented and pinned, but the expected values are author-asserted; these are the next ground-truth-upgrade or independent-review targets. The slice-421/422/423 conformance tests are the template: parse the SRD value, recompute, assert the engine agrees.
- **Blind spots (🔴 / ◐):** rules with no dedicated probe, prose-only condition effects, and the long content tail. Enumerated below where known; the scary ones are the rules not yet listed at all.

---

## 1. Core math & tables

The strongest area: every row is transcribed exhaustively from a printed SRD table, so it is non-circular.

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Ability score → modifier | ✅ | 🟢 | boundaries: ability-mod table | full 1–30 range + floor/ceiling rejection |
| Proficiency bonus by level | ✅ | 🟢 | boundaries: PB-by-level table | L1–20 |
| Full-caster spell-slot table | ✅ | 🟢 | boundaries: full-caster (wizard) | every level row |
| Half-caster spell-slot table | ✅ | 🟢 | boundaries: half-caster (paladin) | |
| Pact-magic table | ✅ | 🟢 | boundaries: warlock pact slots | count × level |
| Multiclass spell-slot math | ✅ | 🟢 | boundaries + property tests | combined-level table |
| Carrying capacity (STR × 15) | ✅ | 🟢 | boundaries: carrying capacity | |
| Exhaustion d20 penalty (−2/level) | ✅ | 🟢 | boundaries: exhaustion | 2024 exhaustion math; death at 6 |

## 2. Content-data fidelity (drift-audited)

Pack content compared field-by-field against the SRD markdown. Non-circular for every *script-detectable* field; prose-only values (e.g. a feature's body-text numbers) are not parseable and stay 🟡/🔴.

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Spell school / level / components / classes / casting time / range / duration / concentration / ritual | ✅ | 🟢 | srd-drift: spells | every pack spell |
| Monster AC / HP / CR / ability scores / speed / immunities / resistances | ✅ | 🟢 | srd-drift: monsters | every pack monster |
| Magic-item rarity / attunement | ✅ | 🟢 | srd-drift: magic items | |
| Class progression tables (PB + feature presence/placement per level) | ✅ | 🟢 | srd-drift: classes (slice 377) | table columns only; per-feature body-prose numbers (e.g. Roving +10 ft) stay manual → 🟡 |
| Per-feature numeric values in body prose | ◐ | 🔴 | — | not table-parseable; needs transcribed-example or review |
| Weapon damage dice / type / versatile / properties / mastery | ✅ | 🟢 | [srd-weapon-conformance](../tests/audit/srd-weapon-conformance.test.ts) (slice 422) | parsed from the `equipment.md` weapon table (not covered by srd-drift); surfaced + closed 2 missing firearms (Musket, Pistol) + a misnamed Light Crossbow |
| Species base walk speed | ✅ | 🟢 | [srd-species-speed-conformance](../tests/audit/srd-species-speed-conformance.test.ts) (slice 426) | parsed from `character-origins.md` (srd-drift covers monster speeds, not species); catches the one non-30 value (Goliath 35) |

## 3. Derivations (the character-sheet math)

Implemented and unit-tested, but expected values are author-asserted. **These are the highest-value 🟡→🟢 upgrade targets**: the SRD states the formulas and gives worked examples, so each could be pinned to a transcribed SRD example instead of an author-chosen number. The read-layer view models (slices 411–419) already expose every value below as a black-box observation, which is the natural surface for ground-truth assertions.

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Armor Class — worn armor + shield (base + DEX cap, heavy no-DEX) | ✅ | 🟢 | [srd-ac-conformance](../tests/audit/srd-ac-conformance.test.ts) (slice 421) | base AC + Dex-cap parsed from the SRD `equipment.md` armor table; all 12 armors × a DEX range + shield. **Upgraded 🟡→🟢, the model for this column.** |
| Armor Class — natural armor (statblock) | ✅ | 🟡 | unit: derive/ac | monster `armorClass`; not yet ground-truth-checked |
| Saving throws — per-class proficiency (mod + prof) | ✅ | 🟢 | [srd-saving-throw-conformance](../tests/audit/srd-saving-throw-conformance.test.ts) (slice 424) | each of the 12 classes' two save proficiencies parsed from classes.md; uniform ability mods pin that the engine is proficient in exactly the SRD-named pair. Effect-granted save prof (Slippery Mind etc.) still 🟡 |
| Ability checks + skills — background-granted skill proficiency | ✅ | 🟢 | [srd-background-skill-conformance](../tests/audit/srd-background-skill-conformance.test.ts) (slice 425) | each SRD background's skills parsed from character-origins.md; uniform mods pin proficiency in exactly the SRD-named skills (re-verifies the slice-412 fix). Class-choice skills (pick-N) stay 🟡 |
| Passive scores (10 + check) | ✅ | 🟡 | unit + query/character-sheet | |
| Attack bonus (ability + prof + magic) | ✅ | 🟡 | unit: derive/attack | finesse / ranged ability choice |
| Weapon damage line | ✅ | 🟢 | [srd-weapon-conformance](../tests/audit/srd-weapon-conformance.test.ts) (slice 422) | plain-melee: SRD die + STR mod + proficiency verified against the parsed table; finesse/ranged ability choice still 🟡 (slice-414 unit tests) |
| Spell save DC / attack bonus (8 + PB + ability) | ✅ | 🟢 | [srd-spell-dc-conformance](../tests/audit/srd-spell-dc-conformance.test.ts) (slice 423) | DC base + each of the 8 casters' spellcasting ability parsed from the SRD; distinct INT/WIS/CHA mods pin that the engine uses the SRD-named ability per class |
| Effective movement speeds (the ModifySpeed math) | ✅ | 🟡 | unit: derive/speed (slice 416) | walk + fly/swim/climb/burrow; species base walk speed is 🟢 (slice 426, above) |
| Species walk speed reaches a created character | ✅ | 🟢 | [srd-species-speed-conformance](../tests/audit/srd-species-speed-conformance.test.ts) (slice 427) | **gap (surfaced 426) fixed slice 427:** `character.speedFeet` is now an optional override; when unset, the walk speed derives from the species' / statblock's walk speed. A Goliath built via `createPC` now reports 35. Explicit `speedFeet` (transformations, summons) still wins. |
| Initiative (DEX + modifiers) | ✅ | 🟡 | query/character-sheet | |

## 4. Action economy & turn legality

Mostly probe-tested behavioral rules (🟡). Each is a regression net over an author-asserted reading.

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| One action / bonus action / reaction per turn | ✅ | 🟡 | raw-compliance | reaction cap probed |
| Action-blocking conditions (Incapacitated, Stunned, Paralyzed, Petrified, Unconscious, 0-HP) reject actions | ✅ | 🟡 | raw-compliance | per-condition probes |
| Movement cost / difficult terrain (double) | ✅ | 🟡 | raw-compliance + unit | Bresenham per-cell |
| Stand from prone costs half speed | ✅ | 🟡 | raw-compliance | |
| Move into occupied space rejected | ✅ | 🟡 | raw-compliance | incl. Misty Step occupancy |
| Encumbrance gates movement | ◐ | 🔴 | — | `computeEncumbrance` exists; planner doesn't gate (Tier 2 open) |

## 5. Conditions (mechanical effects)

15 RAW conditions. Action-blocking arms are probe-tested (§4); the roll/movement arms are mixed.

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Blinded / Poisoned / Frightened / Prone / Restrained / Invisible affect the d20 (adv/disadv) | ✅ | 🟡 | raw-compliance (slice 97) | attacker-side `advantageFor` consulted |
| Frightened: can't willingly move closer to source | ✅ | 🟡 | raw-compliance | source-tracking |
| Charmed: can't attack the charmer | ✅ | 🟡 | raw-compliance | |
| Grappled / Restrained: speed 0 | ✅ | 🟢 | unit: effective-speed (set:0) | speed-0 is exhaustively asserted |
| Per-condition prose effects beyond the above | ◐ | 🔴 | — | frontier; not fully enumerated |

## 6. Combat math

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Advantage / disadvantage (don't stack; cancel) | ✅ | 🟡 | unit: effects | |
| Critical hit (double dice) | ✅ | 🟡 | unit + golden | |
| Resistance / vulnerability / immunity | ✅ | 🟡 | unit: damage-mitigation | |
| Massive-damage instant death threshold | ✅ | 🟡 | raw-compliance | uses hp.max + maxBonus |
| Concentration: one at a time; breaks on 0 HP; CON save on damage | ✅ | 🟡 | raw-compliance + unit | |
| Death saves (3 fail / 3 success; nat 1 = 2 fails; nat 20 = revive) | ◐ | 🟡 | unit: reducers | edge cases (nat-1/nat-20) flagged in roadmap as under-probed |
| Cover (+2 / +5 AC) | ◐ | 🔴 | — | schema supports `coverACBonus`; no position-based detection (Tier 2 open) |

## 7. Spellcasting

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Slot consumption + by-level accounting | ✅ | 🟡 | unit + property | |
| Upcasting | ✅ | 🟡 | unit | |
| Prepared vs known spell access | ✅ | 🟡 | unit: effective-spell-list | |
| Per-Metamagic-option spell modification | ❌ | 🔴 | — | SP cost spent; spell-shape change consumer-driven (Tier 2/3 open) |

## 8. Rest & recovery

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Short rest: hit-dice spend | ✅ | 🟡 | unit: reducers/rest | |
| Long rest: HP + slot + hit-die recovery | ✅ | 🟡 | unit: reducers/rest | |
| Long rest clears concentration | ✅ | 🟡 | unit | |

## 9. Character creation & progression

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Background skill proficiencies reach checks | ✅ | 🟢 | [srd-background-skill-conformance](../tests/audit/srd-background-skill-conformance.test.ts) (slice 425) | was a real bug (slice 412); now SRD-verified for all 4 SRD backgrounds. Tool proficiencies still 🟡 |
| ASI vs feat choice; subclass selection | ✅ | 🟡 | unit + property | PendingChoice protocol |
| Multiclass prerequisites | ✅ | 🟡 | property: multiclass | |
| `OfferChoice` at fresh L1 (vs level-up) | ◐ | 🔴 | — | only fires on advancement (Tier 2/3 open) |

## 10. Variant rules (out of scope by design)

| Rule | Impl | Verify | Evidence | Notes |
|---|---|---|---|---|
| Sanity | — | — | — | flag toggles; rule inert by design |
| Mass combat | — | — | — | flag toggles; rule inert by design |

---

## How to use this ledger

- **Before trusting an area for play**, find its rows and read the Verify column. 🟢 means audited against the SRD; 🟡 means "no regression, but the original reading was never independently checked"; 🔴 means don't trust it.
- **To raise confidence**, pick 🟡 rows and either (a) upgrade to 🟢 by transcribing the SRD's own worked example / table into a ground-truth test, or (b) route them through an independent reviewer (a fresh agent reading SRD-then-code, or `/ultrareview`).
- **To close blind spots**, the 🔴 / ◐ rows are the punch list; many double as Tier 2 categories in the [trustworthiness roadmap](trustworthiness-roadmap.md).

## How to add a row

When a slice ships or wires a rule, add (or update) its row in the right section with an honest Verify mark. A new behavioral probe is 🟡 unless its expected value is transcribed from the SRD (then 🟢). Update the CI-guarded anchor counts above if you added a probe or boundary table. This ledger is explicitly **incomplete** — it is seeded from what has evidence today; the unlisted rules are themselves the most important blind spot, and growing this list is part of the work.
