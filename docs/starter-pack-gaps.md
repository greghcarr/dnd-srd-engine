# Starter pack coverage and gaps

This doc is the **priority queue** for contributor work and a top-level summary of what currently ships in [src/content/packs/starter-pack.json](../src/content/packs/starter-pack.json) versus what's deferred. Detailed per-category catalogs live in sibling `gaps-*.md` files; this doc keeps the Future engine slices table inline plus a pointer to the Deferred primitives backlog (extracted to [gaps-deferred-primitives.md](gaps-deferred-primitives.md) for the single-Read ceiling) so a contributor reading it cold has the actionable list within one or two hops.

## How to pick a slice (for new contributors)

1. **Read [CLAUDE.md](../CLAUDE.md) first** if you haven't — slice cadence, branch flow, pre-commit Uncle Bob audit, SRD canon, doc size discipline. Those rules apply to every slice.
2. **Skim the "Coverage at a glance" table below** for the lay of the land.
3. **Jump to "Future engine slices"** further down for the catalog of focused primitives, each with the cohort of spells / features / items it unblocks. Rows ranked roughly by payoff.
4. **Also check the Deferred primitives backlog** in [gaps-deferred-primitives.md](gaps-deferred-primitives.md) for small, accreted RAW deviations that each have a one-primitive fix. Lower-payoff per slice but excellent for getting familiar with the codebase.
5. **Pick a row, follow [docs/slice-template.md](slice-template.md)**, commit to `dev`, surface the work.

If you're not sure which row is approachable, the smallest-scope rows in the [Deferred primitives backlog](gaps-deferred-primitives.md) (single-feature unblockers) are good first slices. Large structural primitives (new event types, new TriggerAction variants) are larger commits and best done after one or two warm-up slices.

If you need per-category detail beyond the slim "Coverage at a glance" table below (which row of spells is still schema-only, which class features wait on which primitive, which magic items need `UseItem` variants, what RAW monster mechanics still ship as `traits: []`), drill into the per-category catalog files listed under "Per-category catalogs" below.

## Relationship to other docs

This is separate from [content-attribution.md](content-attribution.md), which is a licensing audit (what's clearly SRD-derived vs needs verification). The two docs are kept in parallel: attribution tracks "may we ship this?", this doc tracks "is it actually in here, and how completely?".

Sibling per-category catalogs (extracted in slice 249 to keep this doc under the single-Read ceiling — see [CLAUDE.md](../CLAUDE.md) "Doc size discipline"):

- [gaps-spells.md](gaps-spells.md) — per-spell wired vs schema-only catalog (L0 through L9).
- [gaps-class-features.md](gaps-class-features.md) — per-class stub-features inventory.
- [gaps-deferred-primitives.md](gaps-deferred-primitives.md) — the per-row deferred-primitives backlog (small primitives / predicate facts / planner shapes that each unblock a specific feature or RAW arm).
- [gaps-items-batches-1.1-1.10.md](gaps-items-batches-1.1-1.10.md) + [gaps-items-batches-1.11-1.20.md](gaps-items-batches-1.11-1.20.md) — per-item RAW-shape-deferred mechanical wiring.
- Monsters split across cohorts: [gaps-monsters-batches-5.9-5.11.md](gaps-monsters-batches-5.9-5.11.md) (most recent SRD closure), [gaps-monsters-batches-5.6-5.8.md](gaps-monsters-batches-5.6-5.8.md), [gaps-monsters-batches-5.1-5.5.md](gaps-monsters-batches-5.1-5.5.md), [gaps-monsters-batches-4.8-4.14.md](gaps-monsters-batches-4.8-4.14.md), [gaps-monsters-batches-4.1-4.7.md](gaps-monsters-batches-4.1-4.7.md), [gaps-monsters-batches-1.md](gaps-monsters-batches-1.md) (MM seed + earliest batches), [gaps-monsters-deferred-mechanics.md](gaps-monsters-deferred-mechanics.md) (per-RAW-trait gap catalog).

## Coverage at a glance

| Category | In pack | Rough PHB total | Notes |
|---|---|---|---|
| Classes | 12 / 12 | 12 | All scaffolded with 1-20 level tables. Most L2+ rows ship empty; see [gaps-class-features.md](gaps-class-features.md). |
| Subclasses | 12 / ~50 | ~50 | One canonical L3 subclass per class. ~13 outstanding higher-tier features documented inline below. |
| Species | 9 / ~10 | ~10 | SRD 5.2.1 complete; Aasimar is PHB-only (non-SRD). |
| Backgrounds | 19 / 16 | 16 | Full PHB 2024 list shipped (plus three legacy entries for round-trip compat). |
| Feats | 35 total | ~50+ | 12 origin / 7 general / 6 fighting style / 10 epic boon. SRD 5.2.1 complete. |
| Spells | 351 (339 SRD + 12 non-SRD) | ~340 (SRD 5.2.1) | 194 wired (154 cast-time `mechanicalEffects`, 13 `aura-damage`/`movement-damage` zone-tick, 27 dedicated planners), 70 intentionally narrative, 87 deferred pending an unbuilt primitive. Per-level catalog + the deferred-primitive priority queue live in [gaps-spells.md](gaps-spells.md); the canonical per-spell status is [tests/unit/engine/spell-coverage.test.ts](../tests/unit/engine/spell-coverage.test.ts). |
| Items | 515 total | hundreds (DMG) | 52 weapons + 22 armor + 69 consumables + 37 tools + 77 gear + 258 magic items. Slices 315-316 did the magic-equipment modeling: single-base magic armor/shields (9, slice 315) re-modeled `magic`→`armor` (AC derive grants base AC + acBonus; effects project when worn + attuned), and single-base magic weapons (7, slice 316: Sun Blade, Dwarven Thrower, Dagger of Venom, Scimitar of Speed, Mace of Smiting, Thunderous Greatclub, Quarterstaff of the Acrobat) re-modeled `magic`→`weapon` (attack planner applies `attackBonus`/`damageBonus`/`onHit` riders; effects project; counts as magical). Multi-base magic equipment (Frost Brand, Flame Tongue, "Weapon/Armor +1/+2/+3", Dwarven Plate, Mithral, Adamantine, etc.) is supported via the slice-317 **enchantment overlay**: it stays `itemKind: magic` (the enchantment, carrying `attackBonus`/`damageBonus`/`onHit`/`acBonus`/`weaponDamageType`/`effects`), and a base weapon/armor instance references it through `ItemInstance.enchantmentDefinitionId`; the attack planner, AC derive, effect projection, and magicality detector overlay it onto the base. The base is consumer-chosen at instance creation (so these aren't single pre-wired pack items). Canonical users: Frost Brand (onHit +1d6 cold + fire resistance) and the generic +N weapon/armor enchantments. Slice 318 added a target-gated `condition` predicate to `onHit` riders (evaluated against `target.creatureType` at hit time): Sun Blade (+1d8 radiant vs Undead) and Mace of Disruption (+2d6 radiant vs Fiend/Undead) are the canonical users. Slice 319 added an on-hit-`save` arm to the rider (ability + fixed DC + conditionOnFail, fires after the damage chain when the gate passes): the canonical user is the **Ghoul's Claw** (`ghoul-claws` natural weapon, CON DC 10 or Paralyzed, gated `not(Undead or elf)` via the new `target.speciesId` fact). Slice 321 added the unconditional on-hit-condition arm (`applyConditionId`, no save — the common 2024 poison-bite shape): canonical user **Couatl's Bite** (`couatl-bite`, applies Poisoned on every hit). This completes the on-hit-rider family (extra damage / save-or-condition / unconditional-condition). Slice 322 swept three more poison natural weapons (Wyvern's Sting, Ettercap's Bite, Merrow's Bite), two carrying a single rider with both extra poison damage and Poisoned. Slice 323 added the instant-destroy primitive (`CreatureDestroyed` event, bypassing death saves) plus the save-rider's `hpThreshold` / `destroyOnFail` / `conditionOnSuccess` arms: **Mace of Disruption**'s full RAW destroy-or-Frighten (post-damage HP ≤ 25 → DC 15 WIS or be destroyed, Frightened on success) is now wired. Slice 324 added the crit-gate (`requiresCritical` on the rider, fires only on a critical hit; flat crit damage uses the `0d6+N` shape): canonical user **Sword of Life Stealing** (crit → +15 necrotic vs non-Construct/Undead, a multi-base enchantment). Slice 325 added the unconditional (no-save) `destroy: { hpThreshold? }` rider arm (the sibling of slice-323's save-gated destroy) and used it to fully wire **Mace of Smiting** (crit +7, or +14 vs a Construct, plus the Construct <=25-HP auto-destroy). Still deferred: ranged-gated riders (Dwarven Thrower's +1d8/+2d8 Force on a thrown hit / vs Giants) plus charged/reaction arms; Mace of Smiting's "+3 vs a Construct" base attack/damage bonus (a predicate-gated base-enhancement primitive, distinct from the onHit riders); Vorpal's crit decapitation (needs a head / too-big / Legendary-Resistance immunity fact before it can reuse `CreatureDestroyed`); the Sword of Life Stealing attacker-side temp-HP-on-crit arm; and Dagger of Venom's coat-gated poison save (its gate is the consumable coat-the-blade action, not an HP threshold). Slices 305-312 wired a magic-item buff sweep: slice 305 (Ring of Feather Falling, Gloves of Thievery + 3 potions converted `magic`→`consumable`), slice 306 (Ioun Stone of Awareness, Robe of the Archmagi fully, Belt of Dwarvenkind's Resilience arm), slice 307 (Spellguard Shield's Magic Resistance arm, Armor of Invulnerability's B/P/S resistance arm), slice 308 (new `IncreaseAbilityScore` primitive + the six ability Ioun Stones and Belt of Dwarvenkind's Toughness arm), slices 309-310 (categorization fixes: 4 SRD-Potion items + the 10 generic Spell Scroll templates reclassified `magic`→`consumable`, each guarded by a new audit check), slice 311 (passive arms of 6 staves/rods/medallion: Staff of Fire/Frost resistance, Rod of Alertness advantage, Scarab of Protection +1 AC + magic resistance, Staff of the Magi / Staff of Power spell-attack + AC + save bonuses), slice 312 (passive arms of 5 more: Robe of Eyes truesight/darkvision 120 + Perception advantage, Frost Brand fire resistance, Quarterstaff of the Acrobat acrobatics advantage, Robe of Stars / Luck Blade +1 all-saves). Per-item RAW shape catalog in [gaps-items-batches-1.1-1.10.md](gaps-items-batches-1.1-1.10.md) + [gaps-items-batches-1.11-1.20.md](gaps-items-batches-1.11-1.20.md). |
| Monsters | 253 / ~370 | ~370 (MM) | All 14 MM creature types in pack; SRD 5.2.1 monster catalog complete (235/235). Per-batch authoring history + per-RAW-trait deferred mechanics in the `gaps-monsters-*` sibling files. |
| Conditions | 121 (15 RAW + 106 rider) | 15 (RAW) | All 15 RAW conditions plus 106 mechanic-rider conditions used by the engine; 105 carry mechanical effects. Slices 301-302 added 4 buff conditions; slice 304 removed 6 dead 2014-era orphans; slice 305 added potion-of-invulnerability-active; slice 339 added the 2 Power Word Stun variants; slice 343 added enthralled-active; slice 351 added dragon-wings-active; slice 360 added aura-of-devotion-active. **Empty-effect conditions audit (slice 361):** 12 non-RAW conditions ship with `effects: []`. Four are markers a planner / engine reads, not condition-effect bugs: `guided` (Guidance, consumed by `planConsumeGuidance` which rolls the d4), `mirror-image-active` (read in the attack planner + `appliedConditionLevel` image count), plus the engine-hardcoded base conditions. The rest split into **tracked bugs / gaps** (see "Empty-effect condition gaps" below) and **consumer-managed / narrative** placeholders. |

## Spells

Per-spell wired-vs-schema-only catalog at L0 through L9 moved to **[gaps-spells.md](gaps-spells.md)** in slice 249.

## Class features

Per-class stub-features inventory moved to **[gaps-class-features.md](gaps-class-features.md)** in slice 249.

## Subclasses

One canonical L3 subclass ships per class. ~13 outstanding higher-tier subclass features (L6-L20) are still on the menu; the SRD 5.2.1 progression points and per-batch wiring history moved to **[gaps-class-features.md](gaps-class-features.md)** in slice 249.

## Items

Per-item RAW-shape catalog moved to **[gaps-items-batches-1.1-1.10.md](gaps-items-batches-1.1-1.10.md)** + **[gaps-items-batches-1.11-1.20.md](gaps-items-batches-1.11-1.20.md)** in slice 249.

## Monsters

Per-batch authoring history (5.x, 4.x, 1.x cohorts) and per-RAW-trait deferred-mechanics catalog moved to the **`gaps-monsters-*.md`** sibling files in slice 249. See "Per-category catalogs" under "Relationship to other docs" above for the file list.

## Species

Seven species: Human, Elf, Dwarf, Halfling, Tiefling, Dragonborn, Gnome. PHB 2024 adds Aasimar, Goliath, and the 2024-edition Orc as a playable species. None are in the pack.

## Backgrounds

The full PHB 2024 list (16) is shipped: Acolyte, Artisan, Charlatan, Criminal, Entertainer, Farmer, Folk Hero, Guard, Guide, Hermit, Merchant, Noble, Outlander, Sage, Sailor, Scribe, Soldier, Wayfarer. Plus three legacy entries kept for round-trip compatibility.

## Feats

- **Origin (12):** Savage Attacker, Alert, Magic Initiate (Cleric / Wizard / Druid variants), Tough, Skilled, Crafter, Lucky, Healer, Musician, Tavern Brawler.
- **Fighting Style (6):** Archery, Defense, Dueling, Great Weapon Fighting, Protection, Two-Weapon Fighting.
- **General (6):** Great Weapon Master, Sharpshooter, Polearm Master, War Caster, Resilient (Constitution variant), Unarmored Defense (Barbarian).
- **Epic Boon (9):** Combat Prowess, Dimensional Travel, Energy Resistance, Fortitude, Irresistible Offense, Skill, Spell Recall, the Night Spirit, Truesight.

PHB 2024 ships ~30 general feats and ~25 origin feats; this pack carries the most common. The other ~20+ general feats (Ability Score Improvement, Athlete, Charger, Crusher, Defensive Duelist, Fey Touched, Heavily Armored, Inspiring Leader, Keen Mind, Magic Initiate as a general feat, Mage Slayer, Mounted Combatant, Observant, Piercer, Poisoner, Sentinel, Shadow Touched, Shield Master, Skill Expert, Skulker, Slasher, Speedy, Tavern Brawler upgrade tier, Telekinetic, Telepathic, Weapon Master) and the remaining origin feats are deferred.

## Conditions

All 15 RAW conditions ship (Blinded, Charmed, Deafened, Exhaustion, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious). 106 mechanic-rider conditions also ship to back rider effects (e.g. `sapped`, `vexed-by`, `slowed-10ft` for weapon masteries; `blessed`, `mage-armored`, `concentrating`; multi-effect buff conditions `foresight-active`, `mind-blanked-active`, `invulnerable-active`; type-conditional wards `protection-from-evil-and-good-active`, `magic-circle-active`, `holy-aura-active`; the slice-106 utility buffs `blade-warded-active`, `longstrider-active`, `darkvision-active`). 105 of the 121 carry mechanical `effects`; the 16 with `effects: []` are the engine-hardcoded base conditions plus the markers / placeholders enumerated next.

### Empty-effect condition gaps (slice 361 audit)

Twelve non-RAW conditions ship with `effects: []`. Each is applied by exactly one **wired** spell, so the empty array is either intentional (a marker the engine reads elsewhere) or a real gap (the spell applies a do-nothing condition). Classified:

**Engine-read markers (not bugs):**
- `guided` (Guidance): consumed by `planConsumeGuidance`, which rolls the d4 and adds it to one ability check, then lifts the condition. The mechanic lives in the planner, not the condition.
- `mirror-image-active` (Mirror Image): read in the attack planner; `appliedConditionLevel` carries the image count. (The "while not Incapacitated" gate is a separate tracked fact gap.)

**Tracked bugs / RAW gaps (the spell is wired but the condition does nothing):**
- `resisted` (Resistance cantrip): **non-functional + RAW drift.** No engine code consumes this condition (unlike `guided`), so the cantrip currently has zero effect. Worse, the SRD 5.2.1 Resistance is "when the creature takes damage of a chosen type, reduce it by 1d4, once per turn" (a damage-reduction rider), not the 2014-era "+1d4 to a save" the stub implies. Fix needs a once-per-turn, damage-type-gated damage-reduction mechanic plus the damage-type choice. **Open.**
- ~~`hideous-laughter-active` (Hideous Laughter)~~ **Closed by slice 366.** Added the variant id to `ACTION_BLOCKING_CONDITIONS` (the Incapacitated half), mirroring `held-paralyzed-active` / `power-word-stunned-active`; the end-of-turn recurring WIS save was already wired. Incapacitated and Prone are engine-coded base conditions, so the variant correctly stays effect-less (recategorized in the `EFFECT_LESS_OK` allowlist from a known-open bug to an action-blocking variant). Documented RAW deviation: the Prone attacker-side rule (melee Advantage / ranged Disadvantage) is keyed off the literal `prone` id and is not reproduced by the variant id, the same limitation `held-paralyzed-active` carries for Paralyzed's attacker-side bonuses; the extra repeat save on taking damage is still deferred.
- `cursed-ability-active` (Bestow Curse, "ability-disadvantage" arm): empty, but RAW = Disadvantage on ability checks **and saves** made with one chosen ability. The condition can't be parameterized by the caster-chosen ability statically (its sibling `cursed-attacks-active` works only because "Disadvantage on attacks vs the source" needs no ability parameter). Needs per-ability parameterization on the applied condition. **Open.**
- `cursed-inert-active` (Bestow Curse, "inactive-turn" arm): empty, but RAW = at the start of each of the target's turns, a 50% chance it can't take actions or bonus actions. Needs a per-turn random-incapacitation mechanic. **Open.**

**Consumer-managed / narrative (no clean engine model; empty is acceptable, documented):**
- `commanded-approach-active` / `commanded-drop-active` / `commanded-flee-active` (Command): movement / forced-action compulsions directing the target's next turn (move toward / drop a held item / move away). Positions and forced actions aren't modeled; the same spell's `grovel`→`prone` and `halt`→`incapacitated` arms DO carry real effects.
- `confused-active` (Confusion): the random-action-each-turn table (roll a d10) isn't modeled.
- `emotionally-indifferent-active` (Calm Emotions, "indifferent" arm): an attitude / roleplay change with no combat mechanic; its sibling `emotion-suppressed-active` (suppress Charmed / Frightened) is wired.
- `water-breathing-active` (Water Breathing): purely environmental (breathe underwater), no combat mechanic.

**Promoted to a permanent audit (slice 363):** [tests/audit/pack-integrity.test.ts](../tests/audit/pack-integrity.test.ts) now asserts "every condition applied by a wired spell either carries effects or is on a documented `EFFECT_LESS_OK` allowlist." The remaining open bugs (now three after slice 366 closed Hideous Laughter: `resisted`, `cursed-ability-active`, `cursed-inert-active`) are allowlisted with their reason; when one is fixed, the allowlist-accuracy check forces it off the list. The same slice added a content-cross-reference guard (every `spellId` / `parentClassId` / `enchantmentDefinitionId` / condition-id reference must resolve to a defined entity), so a renamed or deleted id can no longer leave a silent dangling reference.


## Future engine slices (what unblocks the deferred spells)

Each entry below is one engine primitive: a focused engine slice that, once landed, retro-wires a cohort of spells currently shipping schema-only. Ranked roughly by spell-count payoff. When a slice lands, mark it `✓ shipped (slice N)` and walk the affected spells from schema-only to wired in the per-level breakdowns above.

| Primitive | Spells unblocked | Notes |
|---|---|---|
| **Alter Self** (spell wiring) | 1 (alter-self) | Slice 287 refrained the original "Transformation handler" row: RAW for both alter-self and gaseous-form is buff-condition shaped, not statblock-swap shaped, so no wildShape/polymorph-style planner is needed. Gaseous Form shipped slice 287 via the existing slice-73 buff mechanic. Alter Self stays deferred — all three of its arms need primitives the engine doesn't have: Aquatic Adaptation needs the non-walk speed derive + a "matchWalkSpeed" `ModifySpeed` op (same blocker as Cloak of Arachnida climb speed); Natural Weapons needs unarmed-strike attack replacement (1d6 of caster-chosen type + use spellcasting mod instead of STR + counts as magical); Change Appearance is pure narrative (no engine work). Re-purpose this row as the per-arm tracker once the prerequisite primitives land. |

Slice 270 archived the ~30 shipped engine-slice primitives from this table to [gaps-engine-slices-shipped.md](gaps-engine-slices-shipped.md). The live table above carries only the unshipped rows; reach for the archive when you need the historical view of what each shipped primitive landed.

## Deferred primitives backlog (small, accreted over recent slices)

The per-row backlog moved to [gaps-deferred-primitives.md](gaps-deferred-primitives.md) (slice 336) to keep this doc under the single-Read ceiling. That file is the actionable list of small primitives / predicate facts / planner shapes that each unblock a specific feature or RAW arm — bundle nearby entries when shipping the unblocking primitive, and walk the affected rows (delete or re-bucket) when a slice ships one.

## Consumer-coordinated fact slots (engine half landed, consumer half pending)

The engine has accreted a small set of optional input fields that consumers populate from scene state for certain RAW gates to fire. Each is a deliberate split: the engine ships the predicate plumbing + the wire on the affected condition / item; the consumer (dndbnb's encounter manager, a web demo, a future VTT) supplies the per-intent value. Where the value is undefined, two semantic flavors apply (see "Why two semantic flavors" below).

| Fact slot | Type | Entry points | Default-undefined semantic | What's gated | Added |
|---|---|---|---|---|---|
| `bearerCanSeeFearSource` | `boolean` | `AttackIntent` ([src/engine/plan/attack.ts](../src/engine/plan/attack.ts) `planAttack`), `ResolveAttackInput` ([src/engine/plan/attack.ts](../src/engine/plan/attack.ts) `resolveAttack`), `ComputeAbilityCheckInput` ([src/derive/ability-check.ts](../src/derive/ability-check.ts) `computeAbilityCheck`) | default-apply (`undefined` matches `true` for the predicate `not eq value:false`) | Frightened condition's attack-disadvantage + check-wildcard-disadvantage arms ([Frightened RAW: "Disadvantage on ability checks and attack rolls while the source of fear is within line of sight"](../src/content/packs/starter-pack.json)). Consumer supplies `false` only when the bearer cannot see any source of fear; everything else keeps the strict-RAW default. | slice 276 |
| `targetCanSeeAttacker` | `boolean` | `AttackIntent` (planAttack), `ResolveAttackInput` (resolveAttack) | default-apply (`undefined` matches `true`) | Dodge condition's `ImposeDisadvantageOnAttackers` (attack-disadvantage arm only; the DEX-save advantage arm is unaffected per RAW). Per-attacker (not per-bearer): the same dodging creature might see attacker A but not attacker B. Consumer supplies `false` only when the target cannot see this specific attacker. | slice 278 |
| `lightLevel` | `'bright' \| 'dim' \| 'darkness'` | `ComputeAbilityCheckInput` (computeAbilityCheck) | opt-in (predicates that require a specific value evaluate false when undefined; bearer must explicitly receive the value to gain the gated benefit) | Cloak of the Bat Stealth advantage (gates on `bearer.lightLevel ∈ {dim, darkness}`). Same opt-in shape as slices 263 (`sense?`) and 274 (`athleticsSubAction?`): a specific narrative context is required, and the absence of scene state produces no benefit. | slice 279 |

**Consumer call sites.** The values are computed from scene state at intent-construction time:
- `bearerCanSeeFearSource` -> scan the bearer's known fear sources (any creature within range carrying a fear-source role) for line of sight to the bearer. Multi-source aggregation is OR; per-source granularity (which specific source is visible) stays deferred.
- `targetCanSeeAttacker` -> direct LoS check from the dodging target to the resolved attacker.
- `lightLevel` -> ambient light value at the bearer's current tile. The 3-value enum matches the 2024 PHB / DMG light-tier vocabulary; any future "magical darkness" / "twilight" tiers would extend the enum.

**Until a consumer wires the population**, the gated RAW behaviors observe these defaults:
- Frightened applies disadvantage to attacks + checks in all cases (default-apply matches the prior-to-slice-276 behavior; not a regression).
- Dodge's attack-disadvantage applies against every attacker (default-apply matches the prior-to-slice-278 behavior; not a regression).
- Cloak of the Bat's Stealth advantage never fires (opt-in; the prior-to-slice-279 broader-than-RAW behavior is replaced by strict RAW once a consumer wires `lightLevel`).

**Why two semantic flavors.** Default-apply is the right fit when the RAW arm describes a *penalty* the bearer suffers under a typical condition ("Frightened applies disadvantage unless ...") — the predicate's `not eq value:false` shape leaves prior behavior intact and lets consumers opt out per intent. Opt-in is the right fit when the RAW arm describes a *benefit* gated on a specific narrative context ("Stealth advantage while in dim light or darkness") — the bearer must explicitly receive the value to gain the benefit, matching the slice-263 `sense?` / slice-274 `athleticsSubAction?` pattern. When adding new consumer-coordinated facts, mirror the semantic that matches RAW intent.

**Appending to this table.** When a future slice adds a new engine-half slot, append a row at the close of the introducing slice (alongside the CHANGELOG entry + the deferred-primitives-backlog closure if applicable). Keep the entry-point list grounded in actual file paths so future agents can grep their way from a row to the affected sites.

## How this list is maintained

At the close of each content slice, update the relevant section here and bump the "Coverage at a glance" counts. If the slice introduces a new mechanic kind (e.g. a future reaction-spell primitive), retro-update the affected schema-only spells to either `wired` or move them to a different deferred bucket. When an engine slice from the "Future engine slices" table ships, mark it as done and walk the affected spells in this doc to their new status.

**Also add to the "Deferred primitives backlog" above** any new deferral noted in a slice commit body: if a slice ships with documented approximations or RAW deviations, those go in the backlog so the next session has a concrete priority queue instead of having to grep CHANGELOG history.
