# CHANGELOG archive — slices 301-312 (post-alpha.8 cohort)

Per-slice detail for the post-alpha.8 unreleased cohort (slices 301-312), moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 313 when the live file approached the 60 KB single-Read ceiling (mirroring the slice 252 / 270 / 277 / 288 / 303 archive cadence). The live CHANGELOG keeps a cohort summary + a pointer here.

Cohort themes: buff-shape spell sweep (301-302), pack-integrity audit promotion + dead-orphan cleanup (303-304), magic-item buff sweep (305-312, ~22 items), the `IncreaseAbilityScore` primitive (308), and the `itemKind` categorization fixes + permanent guards (309-310).

---

**Content: magic-item buff sweep cont., 5 more wearables/weapons (slice 312)**

Pure-content sweep, no engine changes. Five attunement-gated items, passive arms wired via existing primitives; pinned by [tests/unit/engine/slice-312-magic-item-wires.test.ts](../../tests/unit/engine/slice-312-magic-item-wires.test.ts):

- **Robe of Eyes** → `GrantSense truesight 120` + `GrantSense darkvision 120` (Special Senses) + `SetAdvantage skill:perception` (All-Around Vision). RAW deviation: the "rely on sight" scope on the Perception advantage isn't modeled; the Light/Daylight blind-drawback is deferred (situational, scene-lighting-gated). Truesight already composes with the slice-127/271/273 invisible/illusion-piercing facts, so the see-invisible/ethereal flavor is covered.
- **Frost Brand** → `GrantResistance fire` (the on-hit +1d6 cold rider is deferred — on-hit weapon mechanic).
- **Quarterstaff of the Acrobat** → `SetAdvantage skill:acrobatics` (Acrobatic Assist; the +2 weapon bonus + form toggle + deflection reaction deferred).
- **Robe of Stars** and **Luck Blade** → `AddModifier { kind: save } +1` (all-saves, via the slice-299 save-wildcard). Their charged/weapon/travel arms are deferred.

Boundary found and respected: magic-**armor** AC items (Dwarven Plate, Elven Chain, Glamoured Studded Leather, Demon Armor, Dragon Scale Mail) are typed `magic` and don't carry base armor AC, so wiring their "+N AC" as `AddModifier ac` would add the bonus on top of whatever *other* armor the character wears rather than being the armor — a mis-model. They stay deferred until magic armor is modeled as armor (base AC + magic bonus). This is distinct from the slice-311 Scarab/Staff AC bonuses, which are wondrous-item/staff bonuses that correctly stack on worn armor.

Audit (content sweep): Names — no new identifiers; reused GrantSense / GrantResistance / SetAdvantage / AddModifier. DRY — Robe of Stars + Luck Blade share the slice-299 save-wildcard arm; Quarterstaff/Robe-of-Eyes advantage reuses the SetAdvantage skill shape. SRP — one primitive per arm. Magic numbers — the 120-ft sense ranges, +1 save, fire type all RAW-cited. Mechanical outcomes asserted — Robe of Eyes truesight+darkvision senses + Perception advantage; Frost Brand fire resistance (not cold); Quarterstaff acrobatics advantage (not stealth); Robe of Stars + Luck Blade +1 to **every** ability's save (loops all six). Tests — 5 new. Coverage snapshot gained the 5 items; full suite green (1908 passed), tsc clean. Docs: gaps Items wired 81 → 86 + the magic-armor-AC deferral note.

**Content: magic-item buff sweep cont., 6 staves/rods/medallion (slice 311)**

Pure-content sweep, no engine changes. Six attunement-gated items, passive arms wired via existing primitives; pinned by [tests/unit/engine/slice-311-magic-item-wires.test.ts](../../tests/unit/engine/slice-311-magic-item-wires.test.ts):

- **Staff of Fire** → `GrantResistance fire`; **Staff of Frost** → `GrantResistance cold` (RAW: "Resistance to Fire/Cold damage while you hold this staff").
- **Rod of Alertness** → `SetAdvantage` on initiative + skill:perception (RAW Alertness arm, same shape as Sentinel Shield / Ioun Stone of Awareness).
- **Scarab of Protection** → `AddModifier ac +1` (Defense) + `GrantMagicResistance` (Spell Resistance: "Advantage on saving throws against spells").
- **Staff of the Magi** → `AddModifier spellAttack +2` + `GrantMagicResistance` (the Spell Absorption arm's passive "Advantage on saving throws against spells").
- **Staff of Power** → `AddModifier ac +2` + `AddModifier { kind: save } +2` (all-saves, via the slice-299 save-wildcard) + `AddModifier spellAttack +2` (RAW: "+2 bonus to Armor Class, saving throws, and spell attack rolls").

Deferred per item (charged spell-lists, reaction absorption, positional auras, weapon +N, Retributive Strike). Held-state is consumer-managed; attunement is the projection proxy (the engine doesn't model which hand holds a staff — same approximation as Spellguard Shield in slice 307).

Audit (content sweep): Names — no new identifiers; reused GrantResistance / SetAdvantage / AddModifier / GrantMagicResistance. DRY — Rod of Alertness reuses the Ioun-Stone-of-Awareness advantage pair; Scarab/Staff magic-resistance reuses the slice-131 marker; Staff of Power's all-saves bonus reuses the slice-299 save-wildcard rather than six per-ability entries. SRP — one primitive per arm. Magic numbers — the +1/+2 bonuses and fire/cold types are RAW-cited above. Mechanical outcomes asserted — fire/cold resistance (and not the other); Rod advantage on initiative+perception; Scarab +1 AC delta + magic-resistance advantage; Staff of the Magi +2 spell-attack delta + magic resistance; Staff of Power +2 AC, +2 spell attack, and +2 to **every** ability's save (loops all six). Tests — 6 new. Coverage snapshot gained the 6 items; full suite green (1903 passed), tsc clean. Docs: gaps Items wired 75 → 81.

**Content + audit: reclassify 10 generic Spell Scroll templates + scroll guard (slice 310)**

Pattern-check continuation of slice 309. After the Potion categorization fix, a full SRD-type vs pack-`itemKind` cross-reference (every pack item against SRD typing) confirmed the rest are consistent — magic armor/weapons typed `magic` is the deliberate mundane-vs-magic split — with one remaining family: **Spell Scrolls**. The specific `spell-scroll-of-X` entries were already `consumable`, but the ten generic by-level templates (`spell-scroll-cantrip`, `spell-scroll-1st-level` … `spell-scroll-9th-level`) were still `itemKind: "magic"`. RAW Spell Scroll is type "Scroll" (consumed on use), so all ten are now `itemKind: "consumable"`.

They keep empty `onConsume`: a by-level template isn't a scroll of a *named* spell, so there's no concrete `CastSpell` to dispatch (the slice-237 `onConsume` `CastSpell` variant is wired on the named `spell-scroll-of-X` entries). The reclassification removes the inconsistency where `spell-scroll-of-fireball` was `consumable` but `spell-scroll-3rd-level` was `magic`.

Guard: [tests/audit/pack-integrity.test.ts](../../tests/audit/pack-integrity.test.ts) gains an id-based check — every `spell-scroll-*` item must be `itemKind: "consumable"`. This is id-based rather than SRD-name-matched (like the slice-309 Potion guard) because the generic templates ("Spell Scroll, Nth Level") don't match the SRD "Spell Scroll" header, so a name-matched check can't see them. Negative proof: planting one reverted template makes the check fail; restoring it goes green.

Audit (content + audit): Names — added `itemKind` to the pack-integrity `Entry` interface. DRY — reused the existing pack-integrity harness (pack-only, no SRD dependency, the right home for an id-based rule). SRP — the new it() checks one invariant. Magic numbers — none. Mechanical outcomes asserted — all ten templates satisfy the guard; a planted regression is caught (verified). Tests — 1 new audit check (pack-integrity 8 → 9). Full suite green (1897 passed), tsc clean, coverage snapshot unchanged (the ten were unwired before and after). Docs: gaps Items breakdown (magic 285 → 275, consumables 59 → 69; wired count unchanged at 75).

**Content + audit: reclassify 4 mislabeled Potions + categorization guard (slice 309)**

Pattern-check follow-up to slice 305. Slice 305 corrected three potions miscategorized as `itemKind: "magic"` (which carries only passive `effects` / `onUse` and can't express consumption) while wiring them, but the sweep was under-swept. A rigorous cross-reference of every `magic`-kind pack item against SRD item typing found four more SRD-"Potion"-typed items still mislabeled: **Oil of Etherealness**, **Philter of Love**, **Potion of Clairvoyance**, **Potion of Longevity**. All four are now `itemKind: "consumable"`.

Their mechanics stay deferred (empty `onConsume`), so this is a categorization correctness fix, not a wiring change: Etherealness is a cross-plane primitive the engine doesn't model; Philter's "Charmed by the next creature you see within 10 minutes" needs a deferred-onset trigger keyed to a later perception event; Clairvoyance has a dedicated `planClairvoyance` (the `onConsume` `CastSpell` variant delegates to `planCastSpell`, not dedicated planners); Longevity's age change is narrative. The reclassification makes them *wireable* (a `magic` item can never carry `onConsume`) and corrects the coverage breakdown.

Guard (promote-repeatable-sweep-to-audit norm): [tests/audit/srd-drift.test.ts](../../tests/audit/srd-drift.test.ts) gains a check — every SRD-"Potion"-typed item must ship as `itemKind: "consumable"`. The SRD item parser now captures the item-type word(s) before the first comma of the spec line. Scoped to "Potion" only: the three Dusts (Disappearance / Dryness / Sneezing and Choking) are RAW "Wondrous Item" (single-use but not Potion-typed), so `magic` stays defensible for them and they are not flagged. Negative proof: planting one reverted item makes the new check fail; restoring it goes green.

Audit (content + audit): Names — no new identifiers beyond the SrdItem `type` field. DRY — reused the existing srd-drift SRD-parsing + name-match + `SRD_AVAILABLE` skip infrastructure rather than a new harness. SRP — the new it() checks one invariant. Magic numbers — none. Mechanical outcomes asserted — the four reclassified items now satisfy the guard; a planted regression is caught (verified). Tests — 1 new audit check (srd-drift 16 → 17). Full suite green (1896 passed), tsc clean, coverage snapshot unchanged (the four were unwired before and after). Docs: gaps Items breakdown (magic 289 → 285, consumables 55 → 59; wired count unchanged at 75).

**Engine + content: IncreaseAbilityScore primitive + 7 canonical users (slice 308)**

New effect primitive `IncreaseAbilityScore { ability, amount, max }` — an additive ability-score increase capped at `max`, distinct from the existing `OverrideAbilityScore` (which *sets* / floors a score and would mask a wearer's own higher value). RAW shape: "Your [ability] increases by N, to a maximum of M." This was the highest-leverage row in the deferred-primitives backlog; it unblocks the six ability Ioun Stones and Belt of Dwarvenkind's Toughness arm in one slice.

Engine:
- `EFFECT_KINDS` gains `IncreaseAbilityScore` (now 51 kinds = 50 primitives + `Custom`); schema added to `EffectSchema`.
- `EffectAccumulator` gains `addAbilityScoreIncrease` / `effectiveAbilityScoreIncrease(ability)`. Multiple sources on one ability sum their amounts and cap at the lowest `max` (realistic case is a single stone; summing handles a rare stack).
- `effectiveAbilityScore(base, floor?, increase?)` gains an optional third arg. Composition is **floor-then-increase**, and the increase **only raises** (`max(score, min(score + amount, max))`) so it can never clamp a higher floor (e.g. Belt of Storm Giant Strength's STR 29) down to its own cap, and so Amulet of Health's CON-19 floor plus an Ioun Stone +2 composes to 20. All eight `effectiveAbilityScore` call sites (spell DC, spell attack, attack mod, AC, save, ability check, the attack planner's damage + cleave paths) thread the increase, mirroring the slice-229 floor exactly — the new primitive participates in every derivation that already honored the floor.

Content (canonical users):
- Six ability Ioun Stones — Strength/Agility/Fortitude/Intellect/Insight/Leadership → `IncreaseAbilityScore` on STR/DEX/CON/INT/WIS/CHA, +2 to max 20 (RAW: "Your [ability] increases by 2, to a maximum of 20, while this … orbits your head").
- Belt of Dwarvenkind — Toughness arm (`CON +2 to max 20`) now wired alongside the slice-306 Resilience arm. The dwarf-conditional Darkvision and Persuasion-vs-dwarves arms remain deferred.

Deferred (tracked, separate shape): the four Manual/Tome items permanently raise a score *and its max* on a one-time read — that needs a one-time-permanent application path, not a passive worn projection.

Uncle Bob audit: **Names** — `IncreaseAbilityScore` parallels `OverrideAbilityScore`; `effectiveAbilityScoreIncrease` parallels `effectiveAbilityScoreFloor`. **DRY** — reused the slice-229 floor plumbing shape (map of entries, combine method, single free-function consumer) rather than a parallel system; the eight call sites each gained one mirror line. **SRP** — the primitive does one thing; composition logic lives solely in `effectiveAbilityScore`. **Magic numbers** — none in the engine; the +2/max-20 values are RAW-cited per item. **at-threading** — n/a (no events emitted; this is a derivation-only primitive). **Mechanical outcomes asserted** — increase adds + caps at max; never lowers a score above max; floor-then-increase composes to 20; Ioun Stone of Fortitude raises a CON save by exactly 1 (14→16), Ioun Stone of Intellect raises an INT check by 1, a CON-20 wearer sees no change, an unattuned stone does not project; Belt Toughness raises CON +2 while Resilience persists. **Tests** — 9 new (4 free-function composition cases pinning the never-lower / cap / floor-compose rules a future refactor could silently break; 5 integration cases through real derives). Coverage snapshot gained the six Ioun Stones; full suite green (1895 passed), tsc clean. Docs: api-overview kinds count 46 → 51 + new highlight, status primitive count 50 → 51, gaps backlog row struck closed + Items wired 69 → 75.

**Content: magic-item buff sweep cont., 2 defensive wearables (slice 307)**

Pure-content sweep, no engine changes. Two attunement-gated defensive wearables, passive arms wired via existing primitives; pinned by [tests/unit/engine/slice-307-magic-item-wires.test.ts](../../tests/unit/engine/slice-307-magic-item-wires.test.ts):

- **Spellguard Shield** → `GrantMagicResistance` (RAW: "Advantage on saving throws against spells and other magical effects"), the slice-131 marker consumed by computeSavingThrow when `sourceIsMagical` is true. Deferred: "spell attack rolls have Disadvantage against you" — the attack planner's `event.attackKind` fact is only melee/ranged (spell attacks set `ranged`), so there is no isSpellAttack fact to gate `ImposeDisadvantageOnAttackers` on without also penalizing mundane ranged attacks.
- **Armor of Invulnerability** → `GrantResistance` to bludgeoning + piercing + slashing (RAW: "Resistance to Bludgeoning, Piercing, and Slashing damage while you wear this armor"). Deferred: the Metal Shell action (Magic action → 10-minute B/P/S immunity, 1/dawn) needs a charged `onUse` granting a timed immunity condition.

This closes the cheap fully-clean magic-item vein for now: the obvious single-primitive wearables (Ring/Cloak of Protection, Amulet of Health, Belt/Gauntlets of Giant Strength, Sentinel Shield, Brooch of Shielding, Bracers of Defense, Eyes of the Eagle, and the slices 305-307 additions) are wired. Most remaining unwired magic items need a new primitive (additive ability score; crit immunity for Adamantine Armor; armor stealth-penalty cancel for Mithral Armor; death-save manipulation for Periapt of Wound Closure; the isSpellAttack fact above) or have charged / stateful arms.

Audit (content sweep): Names — no new identifiers; reused GrantMagicResistance + GrantResistance. DRY — Spellguard's arm is identical to Robe of the Archmagi's Magic Resistance (slice 306); Armor of Invulnerability's B/P/S triple mirrors Gaseous Form's resistance arm. SRP — one primitive per arm. Magic numbers — none new; the three damage types are RAW-cited. Mechanical outcomes asserted — Spellguard advantage on saves only when sourceIsMagical; Armor resistance to B/P/S but not fire/necrotic. Tests — 4 new. Coverage snapshot gained the 2 items; full suite green (1886 passed), tsc clean. Docs: gaps Items count 67 → 69.

**Content: magic-item buff sweep cont., 3 attunement-gated wearables (slice 306)**

Pure-content sweep, no engine changes. Three DMG wearables wired through existing primitives, pinned by [tests/unit/engine/slice-306-magic-item-wires.test.ts](../../tests/unit/engine/slice-306-magic-item-wires.test.ts):

- **Ioun Stone, Awareness** → `SetAdvantage { on: 'initiative' }` + `SetAdvantage { on: { kind: skill, skill: perception } }` (RAW: "Advantage on Initiative rolls and Wisdom (Perception) checks"). Consumed at encounter.ts (initiative) and the ability-check derive (perception).
- **Robe of the Archmagi** — fully wired (3/3 arms): `OverrideACFormula { base: 15, abilityModifiers: [DEX] }` (RAW: "If you aren't wearing armor, your base AC is 15 + your Dex modifier" — OverrideACFormula already only applies when unarmored); `GrantMagicResistance` (slice-131 marker, RAW Magic Resistance arm); `AddModifier spellSaveDC +2` + `AddModifier spellAttack +2` (War Mage arm).
- **Belt of Dwarvenkind** — Resilience arm: `GrantResistance { damageType: poison }` + `SetAdvantage { on: { kind: save }, condition: eq event.savePreventsCondition='poisoned' }` (the slice-298 Necklace of Adaptation predicate). Deferred arms tracked: Toughness (CON +2 to max 20) needs a new additive-ability-score primitive; the dwarf-conditional Darkvision and Persuasion-vs-dwarves arms need unconditional-projection gating / target scoping. RAW gates Resilience on "if you aren't a dwarf", but dwarves already carry both benefits, so unconditional projection is a no-op for them.

Deferred-primitives backlog gained a high-leverage row: an `IncreaseAbilityScore { ability, amount, max }` primitive (distinct from `OverrideAbilityScore`, which *sets* and would mask a higher base) would unblock the six ability Ioun Stones, the four Manual/Tome items, and Belt of Dwarvenkind's Toughness arm in one slice (~11 items).

Audit (content sweep): Names — reused existing primitive vocabulary; no new identifiers. DRY — Belt's poisoned-save arm reuses the slice-298 predicate shape verbatim; Robe's Magic Resistance reuses the slice-131 marker rather than re-deriving an `isSpellSave` predicate. SRP — each effect is one primitive doing one thing. Magic numbers — AC 15, +2 DC/attack, the poison/perception/initiative targets all RAW-cited above. Mechanical outcomes asserted — Ioun Stone advantage on initiative+perception (and no bleed to stealth); Robe AC 17 unarmored vs 12 without, magic-resistance advantage only when sourceIsMagical, +2 DC and +2 attack deltas; Belt poison resistance + poisoned-save advantage (and no advantage vs frightened). Tests — 9 new. Coverage snapshot gained the 3 items; full suite green (1882 passed), tsc clean. Docs: gaps Items count 64 → 67, new backlog row.

**Content: magic-item buff sweep, 5 wires via existing primitives (slice 305)**

Pure-content sweep, no engine changes. Five DMG magic items wired through primitives the engine already supports, each pinned by a test in [tests/unit/engine/slice-305-magic-item-wires.test.ts](../../tests/unit/engine/slice-305-magic-item-wires.test.ts):

- **Ring of Feather Falling** → `effects: [{ GrantFallingProtection }]`. The slice-129 falling planner already short-circuits to no events when this effect is present; the attuned ring projects it via slice-132 magic-item projection (RAW: "you descend 60 feet per round and take no damage from falling").
- **Gloves of Thievery** → `effects: [{ AddModifier, target: { kind: skill, skill: sleight-of-hand }, value: 5 }]`. Projects from inventory (no attunement) and surfaces in the ability-check modifier sum (RAW: "+5 bonus to Dexterity (Sleight of Hand) checks").
- **Potion of Invulnerability** → `onConsume: [{ ApplyCondition, conditionId: potion-of-invulnerability-active }]` + a new condition carrying `GrantResistance { damageType: 'all' }` (RAW: "Resistance to all damage" for 1 minute).
- **Potion of Gaseous Form** → `onConsume: [{ ApplyCondition, conditionId: gaseous-form-active }]`, reusing the slice-287 condition (RAW: "the effect of the Gaseous Form spell for 1 hour").
- **Elixir of Health** → `onConsume: [{ RemoveConditions, conditionIds: [blinded, deafened, paralyzed, poisoned] }]` via the slice-283 ConsumeAction variant (RAW: those four conditions end).

The three potions/elixir were miscategorized as `itemKind: 'magic'` with empty `effects` (the pack's other potions are already `consumable`); slice 305 corrected them to `itemKind: 'consumable'` so they carry `onConsume`. RAW deviations carried as consumer-managed (mirror of slice 236's ApplyCondition doc): the 1-minute / 1-hour potion durations and Gaseous Form's bonus-action dismissal are not auto-expired; Elixir's "cured of all magical contagions" arm is narrative (no disease model).

Process note (why this is a content sweep, not the planned next buff-spell wire): a full audit of the remaining buff-shape `skip` spells in spell-coverage.test.ts found the cheap pure-content spell wires are exhausted — every remaining one needs a missing primitive (see-invisibility wants a `see-invisible` sense; glibness/nondetection want anti-divination + check-floor primitives; beacon-of-hope needs a death-save advantage RollTarget plus recipient-side max-healing). Magic items still hold wireable-today content, so the sweep pivoted there to keep pushing coverage cheaply.

Audit (content sweep): Names — reused existing effect-primitive vocabulary and the `*-active` condition naming convention. DRY — no new abstraction; each wire is a direct primitive application. SRP — the one new condition does one thing (resistance to all). Magic numbers — the +5 (Gloves) and the four cleared conditions (Elixir) are RAW-cited above. Mechanical outcomes asserted — falling planner returns no events with the ring (and damage without it / unattuned); Gloves add exactly +5 to the sleight-of-hand modifier sum and 0 to other skills; consuming each potion applies/removes the expected conditions and Invulnerability yields resistance to fire/bludgeoning/necrotic. Tests — 9 new, pinning each wire plus an unattuned-ring control, a non-skill-bleed check, and a no-op Elixir clear that still consumes the item. Coverage snapshot gained `potion-of-invulnerability-active` + the 2 magic items; full suite green (1873 passed), tsc clean. Docs: gaps Items + Conditions rows refreshed.

**Content cleanup: remove 6 dead 2014-era orphan conditions (slice 304)**

Closes the slice-301 deferred row, now guided by the slice-303 pack-integrity audit. Removed all six conditions that carried effects but had no SRD 5.2.1 spell carrier (all 2014 PHB leftovers): `wrathful-smite-active`, `thunderous-smite-active`, `branding-smite-active` (named-smite spells, replaced by 2024's Divine Smite feature), `holy-weapon-active` (Holy Weapon), `invulnerable-active` (Invulnerability), `earthbound-active` (Earthbind). None are in the spells catalog; the conditions were stranded when the IP cleanup / SRD 5.2.1 migration dropped the carrier spells.

Test fixture preserved: `effective-non-walk-speed.test.ts`'s "zero-set wins" case leaned on `earthbound-active` (fly set 0) to prove a `ModifySpeed set 0` overrides a non-walk speed source. That coverage stays — the fly-set-0 fixture moved into a test-local pack (`test-fly-grounded-fixture`) so it exercises the engine path without shipping a dead condition to consumers.

Audit allowlist emptied: `KNOWN_DEAD_ORPHANS` in [tests/audit/pack-integrity.test.ts](../../tests/audit/pack-integrity.test.ts) is now `new Set([])`. The orphan-condition audit enforces zero orphans going forward (a new unwired condition fails the test; the fix is to wire it, not allowlist it).

Audit: content removal + 1 test-fixture refactor + 1 audit allowlist edit. tsc clean; 1864 tests across 271 files (unchanged count). Conditions coverage snapshot dropped exactly the 6 removed ids (verified diff). Doc updates: gaps-row struck through closed; Conditions count 117 → 115; the slice-78 shipped-primitives doc note updated to record the Earthbind retirement.

**Tests+infra: pack-integrity audits + pattern-check norm update (slice 303)**

Promotes two ad-hoc pattern-check sweeps (slices 298 + 301) to a permanent audit harness, and documents the promotion path + the false-positive lesson in CLAUDE.md. Same path as srd-drift (slice 195) and doc-size (slice 285): when a sweep is script-checkable, it belongs in `tests/audit/` so CI catches regressions at commit time.

New audit [tests/audit/pack-integrity.test.ts](../../tests/audit/pack-integrity.test.ts) (8 tests):
- **No duplicate ids within a category** — per-category, since `shield` legitimately exists as both an armor item and a spell (ids are looked up per category). Would have caught the slice-298 Stone of Good Luck duplicate if both copies had shared an id; they didn't, hence the second check.
- **No wired/empty mix in a name group** — the actual Stone of Good Luck signature: two entries sharing a normalized name (parentheticals stripped), one wired + one empty stub. Intentional variant families (Armor/Ring/Potion of Resistance, Greatclub/Ogre Greatclub, absorb-elements-charged-*) are internally consistent (all wired or all empty), so they pass; an accidental stub-vs-real duplicate is the only mix.
- **Conditions with effects are reachable** — walks content refs (`conditionId` / `allyConditionId` / `conditionOnFail` / `bearerConditionId`) AND the engine source under `src/`, plus two documented allowlists: `KNOWN_DEAD_ORPHANS` (the 6 dead 2014-era conditions, tracked for cleanup) and `DYNAMICALLY_APPLIED` (the 5 `absorb-elements-charged-*` conditions applied via runtime string interpolation that no static scan can see). A `stale allowlist` test flags any KNOWN_DEAD entry that becomes reachable or is removed, so the list can't rot.

Negative-proof verified: planting a wired/empty duplicate + a new orphan condition makes 2 of the 8 tests fail; removing the plant restores green.

CLAUDE.md "Pattern-check on bugs" gains two norms:
- **Promote repeatable sweeps to permanent audits** (with the srd-drift / doc-size / pack-integrity precedents).
- **Under-walking references is the false-positive trap** — the mirror of the existing "filter shape determines what a sweep can find" false-negative norm. The slice-301 orphan sweep produced ~13 false positives because its first pass missed planner-emitted (string-literal in `src/engine/plan/`) and interpolation-applied conditions. The rule: before trusting a "found N unreferenced things" sweep, ask which reference forms you're NOT looking at (interpolation, indirection, code-vs-data, cross-category).

Bundled archive: shipping this slice's CHANGELOG entry pushed the live file past the 60 KB ceiling (the very audit promoted last cohort). Per the slice-300 release note's plan, the alpha.8 per-slice detail (slices 282-299) moved to [docs/changelog/archive-slices-282-299.md](archive-slices-282-299.md); the alpha.8 summary block + headline themes stay inline. Archive pointer block + the alpha.8 release-block pointer updated.

Audit: tests + docs only, no engine or content change. tsc clean; 1864 tests across 271 files (was 1856 / 270; +8 in the new audit). doc-size audit green (CHANGELOG back to ~20 KB; new archive 43 KB; CLAUDE.md 36 KB).

**Content: buff-shape spell sweep cluster 2 (slice 302)**

Continues the alpha.9 sweep. Two more wires using existing primitives.

- **Heroes' Feast (L6)** -> `heroes-feasted-active`: `GrantResistance(poison)` + `GrantConditionImmunity(frightened)` + `GrantConditionImmunity(poisoned)`. 2d10 HP-max-increase arm deferred (needs per-cast random rolled value baked at cast time, distinct from Aid's flat `flatAmount`). 1-hour delay is consumer-managed.
- **Wind Walk (L6)** -> `wind-walking-active`: `ModifySpeed(fly, set, 300)` + `GrantConditionImmunity(prone)` + 3x `GrantResistance(B/P/S)`. Fly lights up via slice-288's `getEffectiveFlySpeed`. Action restriction + revert-takes-1-minute-Stunned arms are consumer-managed (mirror of slice-287 gaseous-form-active).

Pattern-check: searched for sibling "+Nd10 HP max" arms. Heroes' Feast is the only random-HP-max-bonus today; no second canonical user yet to justify a new primitive.

Audit: pure content. tsc clean; 1856 tests / 270 files (+10 in [tests/unit/engine/slice-302-buff-spells.test.ts](../../tests/unit/engine/slice-302-buff-spells.test.ts) + 2 new conditions in snapshot). Spell-coverage: both flip skip -> buff.

**Content: buff-shape spell sweep (slice 301)**

First slice of the alpha.9 buff-shape spell sweep. Two clean wires using existing primitives + pattern-check audit that surfaced a deferred orphan-conditions backlog row.

Content wired:
- **True Seeing (L6)** — new `true-seeing-active` condition with `GrantSense truesight 120`. Auto-folds into slice-271's `attacker.bypassesSightIllusion` (Blur, Mirror Image) and slice-273's `canLocateInvisible` (Invisible condition) facts, since both check `hasSense('truesight')`. Truesight gain is immediately observable on incoming-attack + visibility-bypass paths. 1-hour duration consumer-managed.
- **Warding Bond (L2)** — new `warding-bond-active` condition with 3 of the 4 RAW arms: `AddModifier ac 1`, `AddModifier save wildcard 1` (slice-299 primitive), `GrantResistance damageType:'all'`. 60-ft proximity gate consumer-managed. Damage-sharing arm deferred (needs a shared-damage-link primitive); tracked as new backlog row.

Pattern-check sweep — orphan `*-active` conditions audit. Three categories surfaced:
- **Planner-emitted (false positives, NOT orphans)**: sacred-weapon-active, innate-sorcery-active, superior-defense-active, frenzied, dodged, shielded, baned, faerie-fired, absorb-elements-charged-*, healing-blocked-active. Engine-applied via dedicated planners or reducer-tagged conditions; initial walk-conditionId-refs script didn't follow src/engine/plan/ refs.
- **Already wired** (false positives): death-ward-active, freedom-of-movement-active, mind-blanked-active. My initial filter mis-classified them.
- **Dead 2014-era orphans (real)**: wrathful-smite-active, thunderous-smite-active, branding-smite-active, holy-weapon-active, invulnerable-active, earthbound-active. None of their source spells in SRD 5.2.1. Tracked as new deferred row for a focused future cleanup; not removed in slice 301 to keep scope tight.

Spell-coverage table: `true-seeing` and `warding-bond` flip from `skip` to `buff` in [tests/unit/engine/spell-coverage.test.ts](../../tests/unit/engine/spell-coverage.test.ts).

Audit: pure content. tsc clean; 1844 tests across 269 files (was 1833 / 268; +11 in new [tests/unit/engine/slice-301-buff-spells.test.ts](../../tests/unit/engine/slice-301-buff-spells.test.ts)). Conditions coverage snapshot adds true-seeing-active + warding-bond-active.

Doc updates: 2 new deferred-primitives-backlog rows (Warding Bond damage-sharing arm; dead 2014 orphan conditions cleanup).
