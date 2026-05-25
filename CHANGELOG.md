# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content (slice 449): Rogue Thieves' Cant + Sprite natural weapons - L1 playability arc**

Two unrelated content fixes batched. Closes the smallest of the L1 audit's class-feature stubs (Thieves' Cant), and wires the Sprite's RAW combat actions so the Sprite (CR 1/4 Fey) finally has a usable attack.

**Wired:**
- **Rogue L1 Thieves' Cant**: 1-line addition — `GrantProficiency target:'language' id:'thieves-cant' level:'proficient'`. Closes a long-standing stub flagged in the L1 audit; no new infrastructure required (languages are free-form strings in the species/feature schemas, not an enum).
- **Sprite Needle Sword** (`sprite-needle-sword`): simple-melee piercing 1d4, no rider. Plain attack item.
- **Sprite Enchanting Bow** (`sprite-enchanting-bow`): simple-ranged piercing `0d4+1` (flat 1), range 40/160, with `applyConditionId: 'charmed'` onHit rider. Charmed application uses the slice-321 unconditional `applyConditionId` shape established by Couatl's Bite (Poisoned). The bow's RAW "Hit: 1" damage doesn't perfectly survive the engine's automatic +ability-mod fold — a Sprite's DEX +4 adds to the base, so the engine emits ~5 damage where RAW says 1. The interesting RAW arm is the Charmed-on-hit, which works correctly. Documented as a RAW deviation pending a future `noAbilityModifierDamage?` weapon flag.

**Test** at [tests/unit/engine/slice-449-thieves-cant-sprite.test.ts](tests/unit/engine/slice-449-thieves-cant-sprite.test.ts) — 4 cases: a L1 Rogue has `proficiencyLevel('language', 'thieves-cant') === 'proficient'`; a Human Fighter does not; Sprite Needle Sword fires a melee attack against a target; Sprite Enchanting Bow on a hit applies Charmed to the target (seed-searched for a hit).

**Doc updates:** weapons count 56 → 58 (and items total 519 → 521) in [docs/getting-started.md](docs/getting-started.md) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md). Intentional coverage-matrix snapshot update at [tests/coverage/__snapshots__/features.test.ts.snap](tests/coverage/__snapshots__/features.test.ts.snap) — `thieves-cant` joins the wired class-feature catalog.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 monsters-A-Z.md (Sprite Needle Sword and Enchanting Bow text verbatim). Thieves' Cant per SRD 5.2.1 Rogue L1 ("You know Thieves' Cant, a combination of dialect, jargon, and code that lets you hide messages in seemingly normal conversation").
- *Names*: `sprite-needle-sword` / `sprite-enchanting-bow` follow the established `couatl-bite` / `ghoul-claws` / `wolf-bite` natural-weapon convention. Language id `thieves-cant` matches the RAW spelling.
- *DRY*: 1-line GrantProficiency for the cant uses the existing primitive directly. Sprite weapons match the slice-321 / slice-446 onHit rider patterns without introducing new shapes.
- *Mechanical outcomes asserted*: Thieves' Cant proficiency derives correctly through the effect stack; sprite weapons emit AttackRolled with correct attackKind; Enchanting Bow's hit emits a Charmed ConditionApplied on the target.

**Open follow-ups:**
- **Sprite Enchanting Bow flat damage**: the engine adds the wielder's ability mod to base damage, so RAW "Hit: 1" inflates to ~5 for a Sprite (DEX +4). A `noAbilityModifierDamage?: boolean` weapon flag would close this cleanly. Same shape would help any monster natural weapon whose RAW damage is a flat amount rather than a die + ability mod (Imp's Sting variants, Pseudodragon's Sting, etc.). *Still open.*
- **Sprite Heart Sight + Invisibility**: the Heart Sight CHA-save knowledge effect is narrative; the Invisibility self-cast needs the existing UseAction CastSpell variant which currently lives on items, not on monster traits. *Still open.*
- **Sprite duration of the Charmed condition** ("until the start of the sprite's next turn"): consumer-managed per the slice-286 doc; engine emits ConditionApplied without an auto-expiry stamp. *Still open.*

**Content (slice 448): Darkvision + Dwarven Resilience + Gnomish Cunning species traits - L1 playability arc**

Sweeps the obvious follow-up flagged at the close of slice 447: the remaining 7 SRD species in the pack still shipped empty `traits` arrays. This slice wires the clean wins — every species trait that composes with existing primitives (`GrantSense`, `GrantResistance`, `SetAdvantage` with slice-266 wildcard / slice-291 `savePreventsCondition` fact / per-ability save targeting). Higher-ceremony traits (Dragonborn Breath Weapon, Tiefling Fiendish Legacy, Goliath Giant Ancestry, Orc Adrenaline Rush, Halfling Lucky, Elven Lineage, Human Resourceful) stay deferred — each needs new primitives or choice scaffolding outside this slice's scope.

**Wired** (all 6 darkvision species + 2 condition / save advantage trait clusters):
- **Darkvision 60 ft**: Dragonborn, Elf, Gnome, Tiefling (each `GrantSense sense:'darkvision' range:60`).
- **Darkvision 120 ft**: Dwarf, Orc (`range:120`).
- **Dwarven Resilience**: `GrantResistance poison` + `SetAdvantage on:{kind:'save'} mode:'advantage' condition: {eq event.savePreventsCondition 'poisoned'}`. The save advantage shape matches the slice-447 Halfling Brave / Elf Fey Ancestry wire exactly (the predicate value is the only varying field).
- **Gnomish Cunning**: three `SetAdvantage on:{kind:'save', ability:'INT'/'WIS'/'CHA'} mode:'advantage'` entries. Per-ability rather than wildcard since the gnome's advantage applies to *all* INT/WIS/CHA saves, not just condition-targeting ones (different shape from the slice-447 condition-gated form).

**Test** at [tests/unit/engine/species-darkvision-and-saves.test.ts](tests/unit/engine/species-darkvision-and-saves.test.ts) — 9 cases:
- Darkvision range correct for each of the 6 species; absent for Human and Halfling (negative control).
- Dwarf vs Contagion (CON save with Poisoned-on-fail) rolls with advantage; Human vs Contagion rolls flat.
- Gnome vs Hold Person (WIS), Fear (WIS), and Bane (CHA) all roll with advantage; Human vs Hold Person rolls flat.

The 9 cases prove: GrantSense projects correctly through the effect stack, save-wildcard-with-savePreventsCondition predicate fires on the matching condition, per-ability SetAdvantage fires on the matching ability regardless of conditionOnFail.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 character-origins.md (Dragonborn L158, Dwarf L170-172, Elf L188, Gnome L243-245, Orc L321, Tiefling L333). All darkvision ranges verbatim; Dwarven Resilience two-arm structure verbatim; Gnomish Cunning verbatim "INT/WIS/CHA saving throws."
- *Names*: trait shapes identical to existing wires (Eyes of the Eagle / Halfling Brave). No new identifiers introduced.
- *DRY*: declined to author per-species "Darkvision" condition wrappers; effect entries inline match the existing magic-item GrantSense pattern (Goggles of Night, Robe of Eyes, etc.).
- *Mechanical outcomes asserted*: Darkvision projects through the effect stack to `senseRange`; advantage fires on the gated save; per-ability gnomish advantage hits all three covered abilities.

**Open follow-ups:**
- **Dragonborn Breath Weapon + Damage Resistance**: needs Draconic Ancestry choice scaffolding + a per-Attack-action replacement planner + per-character-level dice scaling (L1=1d10, L5=2d10, etc.). Multi-slice. *Still open.*
- **Dragonborn Draconic Flight (L5)**: bonus-action 10-min flight with Fly Speed = walk speed. Composes with the existing `flying-active`-shaped condition + `matchWalkSpeed` ModifySpeed. *Still open.*
- **Tiefling Fiendish Legacy (Abyssal / Chthonic / Infernal)**: OfferChoice + per-lineage spell list + per-level spell grants (L1 cantrip + L3/L5 leveled spells, each once per Long Rest). Same shape as Warlock Mystic Arcanum. *Still open.*
- **Goliath Giant Ancestry**: OfferChoice over 6 sub-feature packages (Cloud's Jaunt, Fire's Burn, Frost's Chill, Hill's Tumble, Stone's Endurance, Storm's Thunder), each its own primitive (teleport, damage rider, prone rider, reaction-reduce-damage, reaction-deal-damage). Multi-slice. *Still open.*
- **Goliath Large Form (L5)**: size-change transformation. Defer alongside other tier-feature transformations. *Still open.*
- **Goliath Powerful Build**: "Advantage on ability check to end the Grappled condition" needs a `eventEndsConditionViaCheck`-style fact (the engine has `event.savePreventsCondition` but not its check sibling). Small extension. *Still open.*
- **Orc Adrenaline Rush**: Dash bonus action + temp HP. Same shape Rogue Cunning Action / Monk Patient Defense need. *Still open.*
- **Orc Relentless Endurance**: "drop to 1 HP instead of 0, once per Long Rest." Shares shape with the deferred Barbarian Relentless Rage. *Still open.*
- **Human Resourceful / Skillful / Versatile**: Heroic Inspiration isn't an engine concept; Skillful needs an OfferChoice over all 18 skills; Versatile needs an OfferChoice over origin feats. Each its own small slice. *Still open.*
- **Dwarven Toughness**: +1 HP per character level. Needs a per-level scaling `Formula` on a `AddModifier hpMax`. Small. *Still open.*
- **Dwarf Stonecunning**: bonus-action Tremorsense 60 ft for 10 min, PB uses per Long Rest. Needs ApplyCondition + GrantResource + a Tremorsense-granting condition. *Still open.*
- **Elven Lineage** (Drow / High Elf / Wood Elf): OfferChoice + L1/L3/L5 spell grants (same shape as Tiefling Fiendish Legacy). *Still open.*
- **Pack Tactics-shape sweep on Sprite (Brave)**: Sprite's `Brave` trait per SRD adds a save-advantage shape to monsters; same wire as Halfling Brave but on the Sprite statblock. Defer to a monster-trait sweep slice. *Still open.*

**Content (slice 447): Halfling Brave + Elf Fey Ancestry + Elf Keen Senses - L1 playability arc**

Wires three SRD species traits a L1 player character actually feels in play. Pure content slice — uses existing primitives end-to-end (slice-266 save wildcard + slice-291 `event.savePreventsCondition` fact + existing `OfferChoice` `GrantProficiency`). Before this slice, both starter-pack-shipped species had empty `traits` arrays, so a halfling fighter rolling a save vs Fear and an elf wizard rolling vs Charm Person both rolled flat — RAW gives them advantage.

**Wired** in [src/content/packs/starter-pack.json](src/content/packs/starter-pack.json):
- **Halfling Brave** — `SetAdvantage on:{kind:'save'} mode:'advantage' condition: {eq event.savePreventsCondition 'frightened'}`. The save-wildcard target + condition-specific predicate is identical to the slice-291 antitoxin-active wire (canonical user of the same fact infrastructure).
- **Elf Fey Ancestry** — same shape, `value: 'charmed'`.
- **Elf Keen Senses** — `OfferChoice oneOf:1 when:'onAcquire'` over Insight / Perception / Survival, each option granting the chosen skill proficiency. Mirrors the Wizard Scholar L2 entry's shape (slice 55).

**Test** at [tests/unit/engine/species-saves.test.ts](tests/unit/engine/species-saves.test.ts) — 6 cases: Halfling vs Fear (advantage); Human vs Fear (no advantage, control); Elf vs Charm Person (advantage); Human vs Charm Person (no advantage); Halfling vs Charm Person (no advantage — gate is Frightened-specific); Elf vs Fear (no advantage — gate is Charmed-specific). The cross-pair tests prove the predicate gating is correctly condition-scoped.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 character-origins.md L229 (Elf Fey Ancestry), L231 (Elf Keen Senses), L287 (Halfling Brave). Exact verbatim wording for the save advantage; the Keen Senses choice is modeled as an OfferChoice with the three named skills.
- *Names*: trait shapes match the existing `antitoxin-active` wire exactly (only the value differs). Choice id `elf-keen-senses` follows the established `wizard-scholar` / `fighting-style-fighter` convention.
- *DRY*: declined to introduce a `Halfling Lucky` / `Elf Trance` row that would need new primitives; this slice ships only the arms that compose cleanly with existing infrastructure.
- *Mechanical outcomes asserted*: per-species + per-targeting-condition gate; 6 cases prove both the positive direction and the cross-condition negative.

**Open follow-ups:**
- **Halfling Lucky** — natural-1 d20 reroll. Needs a per-roll "reroll if natural 1, must take the new result" primitive the engine doesn't carry. Defer (the rest of the halfling toolkit is positional / narrative anyway).
- **Halfling Nimbleness + Naturally Stealthy** — movement-through-larger-creature, Hide-gated-on-cover. Both consumer territory (engine doesn't model positions for those). Defer.
- **Elf Trance** — narrative (no sleep, 4-hour Long Rest). No mechanical event. Defer.
- **Other CR ≤ 1 species traits (Dwarf Resilience, Gnome Cunning, Tiefling resistance, etc.):** the seven remaining SRD species also ship empty `traits`. A sweep slice would extend this pattern. Tracked as a content cohort, not a single primitive blocker.

**Engine + content (slice 446): Wolf + Dire Wolf knock-prone-on-bite (size-gated) - L1 playability arc**

Closes the rest of the Wolf and Dire Wolf RAW combat profile after slice 445's Pack Tactics. Wolves and dire wolves now apply Prone on a successful Bite hit, gated by target size per RAW (Wolf: Medium or smaller; Dire Wolf: Large or smaller). Knock-prone is the second-most defining wolf mechanic after Pack Tactics; together they make L1 wolf-pack encounters play correctly.

**Engine extension** (1-line addition to [src/engine/plan/attack.ts](src/engine/plan/attack.ts) `riderFacts` map): `target.creatureSize` predicate fact, populated via the existing slice-386 `creatureSize` derive (the same source-of-truth used by Cunning Strike Trip and weapon-mastery Push). Joins the existing `target.creatureType` (slice 318) and `target.speciesId` (slice 319) facts as the third dimension content can gate onHit riders on.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json), 2 new items): `wolf-bite` and `dire-wolf-bite` natural weapons with size-gated `applyConditionId: 'prone'` onHit riders. Wolf's gate matches `target.creatureSize ∈ {Tiny, Small, Medium}`; Dire Wolf's gate widens to include Large. Both use the slice-321 unconditional `applyConditionId` rider shape (no save) per RAW.

**Test** at [tests/unit/engine/wolf-bite-prone.test.ts](tests/unit/engine/wolf-bite-prone.test.ts) — 5 cases exercising both weapons against Small / Medium / Large / Huge targets with seed-search for hits. Confirms: Wolf prones Small + Medium but not Large; Dire Wolf prones Large but not Huge.

**Doc updates:** `54 weapons -> 56` in [docs/getting-started.md](docs/getting-started.md) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) (caught by the doc-counts audit).

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 animals.md (Wolf Bite "If the target is a Medium or smaller creature, it has the Prone condition" and Dire Wolf Bite "If the target is a Large or smaller creature, it has the Prone condition"). Sizes are explicit; the predicate uses `any` over the enumerated `Size` enum values rather than a synthetic "or smaller" helper, matching how `Predicate` is shaped (each comparison is a single `eq`).
- *Names*: `target.creatureSize` matches the existing `target.creatureType` / `target.speciesId` namespace. Item ids `wolf-bite` / `dire-wolf-bite` follow the established natural-weapon naming (`couatl-bite`, `ghoul-claws`).
- *DRY*: imports the existing `creatureSize` derive rather than re-implementing the lookup. Predicate construction is verbose (4-term `any`) but inlining is the established pattern (Ghoul's Claw uses a similar `not(any(...))`); a future "creatureSizeAtMost" helper predicate could compress the shape if a third user appears.
- *Mechanical outcomes asserted*: per-size gate fires the expected ConditionApplied (or doesn't), per-weapon. Hit prerequisite enforced (no prone application on a miss).

**Open follow-ups:**
- **More on-hit-prone-by-size users:** the Allosaurus's Claws (Large or smaller, Prone + bonus Bite arm) is a related shape that adds the "moved 30+ feet straight toward target" gate — needs a movement-derived fact the engine doesn't carry yet. Defer. *Still open.*
- **A `target.creatureSizeAtMost` shorthand predicate** would let "Medium or smaller" express as `lte` against a Size ordering rather than a 3-term `any`. Two canonical users now (Wolf + Dire Wolf); add the shorthand when a third user lands. *Still open.*

**Engine + content (slice 445): Pack Tactics on L1 monsters (Wolf, Dire Wolf, Giant Rat, Kobold Warrior) - L1 playability arc**

Wires the single highest-impact CR ≤ 1 monster trait. Every L1 wolf-pack or kobold-warren encounter now gets RAW Pack Tactics: advantage on attack rolls when an ally of the attacker is within 5 ft of the target and that ally isn't Incapacitated. Previously the four canonical Pack Tactics users at CR ≤ 1 (wolf, dire-wolf, giant-rat, kobold-warrior) all shipped with no traits, so L1 encounter difficulty was systematically under-tuned.

**Mid-implementation discovery (no engine extension needed):** the `attackerHasAllyAdjacentToTarget` fact already existed end-to-end on `AttackRolledEvent` (slice 175 derives it from grid positions for Rogue Sneak Attack's flank arm; the trigger dispatcher already exposes it as `event.attackerHasAllyAdjacentToTarget`). The slice unifies it: moved the position-derivation up in `resolveAttack` so the value flows into both (a) the pre-roll `attackerSelfAdvantageFacts` map (so Pack Tactics' `SetAdvantage` gate fires during the d20 roll) AND (b) the existing `AttackRolledEvent.attackerHasAllyAdjacentToTarget` field (so Sneak Attack's post-roll OnEvent still works exactly as before). Content uses one canonical fact name: `event.attackerHasAllyAdjacentToTarget`.

**Consumer-override path** (new this slice): added `attackerHasAllyAdjacentToTarget?: boolean` to `AttackIntent` and `ResolveAttackInput` ([src/engine/plan/attack.ts](src/engine/plan/attack.ts)). When set, it overrides the engine's position derivation, so position-less consumers (a CLI without grid positions, an older campaign model) can still signal the RAW condition. Opt-in semantic (predicate is `eq value:true`): undefined produces no Pack Tactics advantage, matching the slice-279 `lightLevel` pattern for "benefit gated on specific narrative context."

**Content:** four monsters wired in [src/content/packs/starter-pack.json](src/content/packs/starter-pack.json) with `traits: [{ kind: 'SetAdvantage', on: 'attack', mode: 'advantage', condition: { kind: 'eq', path: 'event.attackerHasAllyAdjacentToTarget', value: true } }]`. Uses the inline-trait shape established by Imp's `GrantMagicResistance` and Troll Limb's `Regeneration` (slice 232).

**Test:** [tests/unit/engine/pack-tactics.test.ts](tests/unit/engine/pack-tactics.test.ts) exercises three cases: explicit `true` -> advantage (`used: 'advantage'`, 2× d20), explicit `false` -> no advantage, undefined-without-encounter -> no advantage. The existing slice-7 Sneak Attack golden test continues to pass unchanged (the unified fact path didn't change post-roll behavior).

**Catalog updates:** appended a new row to the consumer-coordinated fact slots catalog in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) noting both the engine-derived path (position-aware, pre-existing) and the consumer-override path (this slice).

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 animals.md L1287 ("The wolf has Advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature and the ally doesn't have the Incapacitated condition") + identical text for Dire Wolf (line 1287), Giant Rat (line 3033), Kobold Warrior (monsters-A-Z.md `### Kobold Warrior`). The position-derivation excludes incapacitated allies (`findActorBlockingCondition`); the consumer-supplied override leaves the Incapacitated check to the consumer's spatial model.
- *Names*: `attackerHasAllyAdjacentToTarget` matches the pre-existing schema field exactly. Fact-name `event.attackerHasAllyAdjacentToTarget` aligns with the established `event.*` dispatcher namespace consumed by Sneak Attack. No new noun introduced.
- *DRY*: The position derivation moved from the late `AttackRolledEvent`-build site to a single shared computation feeding both the pre-roll facts and the event. Eliminated what would have been an "engine derives twice" path.
- *SRP / sticking to existing primitives*: declined to add a new TriggerAction or a new "ally" entity model; instead reused the existing `SetAdvantage` + boolean predicate + position derivation. The slice description had projected a new engine fact slot; turned out unnecessary.
- *Mechanical outcomes asserted*: with the consumer signaling `true`, the d20 rolls twice and `used === 'advantage'`; with `false` or undefined-out-of-encounter, the d20 rolls once and `used === 'none'`.

**Open follow-ups:**
- **More CR ≤ 1 traits unblocked by this same canonical pattern (engine work already done for some):** Keen Senses (wolf Perception advantage; just needs the existing skill-discriminated `SetAdvantage`), Brave (sprites; saves vs Frightened), Sunlight Sensitivity (kobold; needs an environmental fact). Content sweeps. *Still open.*
- **Nimble Escape (goblin) and Aggressive (orc/gnoll):** monster-bonus-action surface for Disengage/Hide/move. A monster-action primitive separate from class features. *Still open.*
- **Undead Fortitude (zombie):** save-on-lethal-damage rewrite. Same shape as Barbarian Relentless Rage (deferred). *Still open.*
- **Threading through Opportunity Attacks and Cleave secondary attacks:** the slice-276/278 consumer-coordinated facts (LoS, Dodge) were never threaded through `planOpportunityAttack` or the Cleave secondary `resolveAttack`. Pack Tactics matches that precedent (not threaded). Pre-existing limitation. *Still open.*

**Content (slice 444): wire Divine Smite (L1 Paladin) - first slice of the level-by-level playability arc**

Direction shift: engine completion now organized by character-level playability (L1 complete, then L2, etc.) rather than primitive-cohort payoff. First sweep of the L1-playability audit surfaced three class-feature stubs (Wizard Ritual Adept, Rogue Thieves' Cant, Warlock Eldritch Invocations) and the deferred L1 spells (with Divine Smite the single highest-payoff for a L1 paladin since their entire combat identity hangs on the smite). This slice closes Divine Smite; the other L1 gaps cohort in follow-up slices.

Divine Smite shipped as content-only: the on-hit trigger primitive (the slice-61 `OnEvent`/`consumeOnTrigger` shape used by Searing Smite) already supports the unconditional-`AddDamage` path that Divine Smite needs. New `divine-smite-active` condition in [src/content/packs/starter-pack.json](src/content/packs/starter-pack.json) carries two riders sharing one buff: a base rider (2d8 radiant on a melee hit by the bearer) and a Fiend/Undead-gated rider (+1d8 radiant, filtered via `event.targetCreatureType ∈ {Fiend, Undead}`). Both filter on `event.attackKind == 'melee'` per RAW ("Melee weapon or an Unarmed Strike"; unarmed strikes classify as melee in the engine). Both ride `consumeOnTrigger: true`; the dispatcher's snapshot-then-iterate design (slice 114) fires both before the first consume removes the condition from the snapshot. Wired the `divine-smite` spell via `mechanicalEffects: [{ kind: 'buff', conditionId: 'divine-smite-active' }]`.

Golden test at [tests/golden/divine-smite.test.ts](tests/golden/divine-smite.test.ts) exercises both arms: a paladin attacking a Humanoid fires only the base rider; attacking a Skeleton (Undead, via `statblockId`) fires both base and celestial riders. Both variants confirm the bearing condition is consumed after the hit.

Updated [tests/unit/engine/spell-coverage.test.ts](tests/unit/engine/spell-coverage.test.ts) (divine-smite: skip -> wired buff). Updated [docs/gaps-spells.md](docs/gaps-spells.md) L1 header (38 -> 39 wired, 6 -> 5 deferred), the totals line (182 -> 183 wired, 87 -> 86 deferred), and the priority-queue narrative (smite-rider cluster goes from 3 -> 2 remaining, with notes on what shining-smite and ensnaring-strike each additionally need). Updated condition-count citations in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md), [docs/status.md](docs/status.md), and [docs/getting-started.md](docs/getting-started.md) (124 -> 125 total, 109 -> 110 rider) — the doc-counts audit caught all three.

Pure content slice (JSON + test + doc updates only); no engine, no schema, no public-surface change. The slice-444 wires match RAW exactly for L1 paladins (Paladin L1-L2 only have L1 slots, so the deferred upcast scaling doesn't bite at character L1-L2).

**Audit (content slice):**
- *RAW match*: 2d8 radiant base, +1d8 vs Fiend/Undead, gated on `event.attackKind == 'melee'`. Matches SRD 5.2.1 spells.md line 1873-1884 exactly for L1 slot use. Upcast `+1d8/slot above L1` deferred (documented below).
- *Names*: `divine-smite-active` matches the sibling `searing-smite-active` / `divine-favor-active` pattern. Rider ids `divine-smite-base-rider` / `divine-smite-celestial-rider` are intention-revealing.
- *DRY / SRP*: the two-rider approach reuses the existing slice-61 OnEvent primitive without code change. The alternative (a `condition?: Predicate` field on `AddDamage`) would be an engine extension justified only when a second canonical user appears; declined per "no abstractions for hypothetical future users."
- *Mechanical outcomes asserted*: base rider fires on any melee hit; celestial rider gates correctly on Undead and is suppressed on non-Fiend/non-Undead; condition consumed after first hit; subsequent attacks don't re-trigger.

**Open follow-ups:**
- **Pattern-check sweep finding (sibling missing melee gate):** `searing-smite-active` has its own RAW-melee-only restriction ("Melee weapon or Unarmed Strike") but its OnEvent rider filter is just `attackerIsSelf + hit` (no `event.attackKind == 'melee'`). Pre-existing from slice 61. The fix is a 2-line filter add; left out of slice 444 to keep this content-only and avoid touching the s61 golden test. *Still open.*
- **5 orphan absorb-elements conditions:** the pack ships `absorb-elements-charged-acid/cold/fire/lightning/thunder-active` conditions, but the `absorb-elements` spell that applies them was moved to `phb-2024-extras` in slice 402. The `planAbsorbElements` planner (which references them) may also be a residual orphan in the starter pack's engine surface. Needs a sweep to decide: remove the conditions + the planner, or restore the spell to starter. *Still open.*
- **Divine Smite upcast scaling:** `+1d8 per slot above L1` (RAW). The `buff` mechanic doesn't currently carry slot-level-aware variant selection. Cleanest unblock is either a `variantBySlotLevel: { 1: 'id1', 2: 'id2', ... }` field on the buff mechanic or per-slot variant unroll. Doesn't bite a L1 or L2 paladin (their only slot level is 1); first hits at character L3+ paladin. *Still open.*
- **Shining Smite (L2) and Ensnaring Strike (L1):** each blocked on a distinct further primitive. Shining Smite needs a concurrent concentration-aura that runs alongside the on-hit rider (the target is always illuminated, not just damaged). Ensnaring Strike needs a save-via-OnEvent TriggerAction that fires a STR save on hit and conditionally applies Restrained + recurring per-turn piercing damage. Each is a natural next slice in the smite-rider family. *Still open.*

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

## 0.1.0-alpha.14 - 2026-05-22

**Release (slice 436): bump to 0.1.0-alpha.14**

Promotes the post-alpha.13 cohort (slices 400-435) to a tagged release. `package.json` bumped from `0.1.0-alpha.13` to `0.1.0-alpha.14`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the cohort's only persisted-shape touch is `Character.speedFeet` becoming optional (slice 427, was `.default(30)`), and old saves carry the field so they parse unchanged. The full suite is green at 346 files / 2325 passing; `npm run ci` clean (typecheck + coverage + build).

The headline new surface is the **consumer read/query view-model layer**, the first public API beyond the engine core: new exports `querySpells` / `queryMonsters` / `queryItems`, `buildCharacterSheet`, `buildEncounterView`, plus the standalone derivations `computeWeaponDamage` / `computeUnarmedStrike` / `getEffectiveSpeed` / `getEffectiveSpeeds`. Cohort, in five arcs:

- **SRD / non-SRD content separation + multi-pack policy (400-403):** the multi-pack id-collision policy + report-all validator (400), then the full split of non-SRD content out of the drift-audited starter pack (401 backgrounds + feats, 402 the 12 non-SRD spells + their conditions to `phb-2024-extras`, 403 stop shipping non-SRD content from a gitignored `content-packs/` folder).
- **Plugin / custom-action seam + effect retrofits (405-410):** the plugin API design proposal (405) and the `Custom`-action plan seam (406); the Elemental Weapon (407) and Absorb Elements (408) retrofits onto the new primitives (with a deliberate Thunder-Step stop); the `ContentBundle` single-file user-content shape (409); and a class-audit status reconciliation (410).
- **Consumer read/query view-model layer (411-419):** the read layer for the three D&D-Beyond screens. Content browse (`querySpells` / `queryMonsters` / `queryItems`), the full character sheet (`buildCharacterSheet`: skills, passives, initiative, speeds, attacks including the unarmed strike, spellcasting, inventory), and the encounter / combat-tracker view model (`buildEncounterView`). The build surfaced + fixed a real bug: structured background skill/tool proficiencies never reached the effect stack (412).
- **SRD ground-truth conformance arc (420-427):** the rule-coverage ledger + trustworthiness-roadmap recalibration (420), then six conformance tests that parse the SRD markdown clone, recompute the rule, and assert the engine matches (AC 421, weapon table 422, spell save DC / attack 423, saving throws 424, background skills 425, species speeds 426) - non-circular verification that caught two real bugs: the pack was missing the martial firearms Musket + Pistol (422) and `createPC` dropped a species' walk speed so a Goliath read 30 not 35 (427 fix, via making `speedFeet` optional + a species-fallback derivation).
- **Docs accuracy system (428-435):** the em-dash sweep of the front-door docs (428), the broken-internal-link fix (431) + the new [doc-links audit](docs/changelog/archive-slices-432-433.md) (432), the "doc accuracy: CI-guarded or not stated" norm, a front-door staleness/coverage refresh (433), the doc code-example typecheck audit (434), and the contract-test policy resolution (435). The standing rule now: a precise, drift-prone doc claim is either CI-guarded against its source or not stated as a precise figure.

Per-slice detail for the whole cohort is in the per-cohort archives under [docs/changelog/](docs/changelog/) (slices 400-435).

**Slices 434-435**: per-slice detail archived to [docs/changelog/archive-slices-434-435.md](docs/changelog/archive-slices-434-435.md) (moved in the alpha.14 release to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the doc code-example typecheck guard (434, the last doc-drift class the link + count guards couldn't reach) and the contract-test policy resolution (435).

**Slices 432-433**: per-slice detail archived to [docs/changelog/archive-slices-432-433.md](docs/changelog/archive-slices-432-433.md) (moved in slice 434 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the docs review's prevention half (432, the doc-links audit + the "CI-guarded or not stated" norm) and its cleanup half (433, the front-door accuracy + staleness refresh).

**Slices 428-431**: per-slice detail archived to [docs/changelog/archive-slices-428-431.md](docs/changelog/archive-slices-428-431.md) (moved in slice 433 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the em-dash sweep of the ledger + CHANGELOG (428), the slices-426-427 archive (429), the trustworthiness-roadmap "as content grows" note (430), and the broken-internal-link fix (431).

**Slices 426-427**: per-slice detail archived to [docs/changelog/archive-slices-426-427.md](docs/changelog/archive-slices-426-427.md) (moved in slice 428 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the ground-truth species-speed conformance test that surfaced a creation gap (426) and the fix for that gap (427).

**Slices 424-425**: per-slice detail archived to [docs/changelog/archive-slices-424-425.md](docs/changelog/archive-slices-424-425.md) (moved in slice 426 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: per-class saving-throw proficiency conformance (424) and background skill-proficiency conformance (425).

**Slices 422-423**: per-slice detail archived to [docs/changelog/archive-slices-422-423.md](docs/changelog/archive-slices-422-423.md) (moved in slice 424 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the weapon-table conformance that surfaced + closed two missing firearms (422) and the spell save DC / attack conformance (423).

**Slices 420-421**: per-slice detail archived to [docs/changelog/archive-slices-420-421.md](docs/changelog/archive-slices-420-421.md) (moved in slice 422 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the SRD rule-coverage ledger + trustworthiness-roadmap recalibration (420) and the first ground-truth derivation upgrade, AC conformance (421).

**Slices 418-419**: per-slice detail archived to [docs/changelog/archive-slices-418-419.md](docs/changelog/archive-slices-418-419.md) (moved in slice 420 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet unarmed strike entry that completed the sheet (418) and the encounter / combat-state view model (419).

**Slices 416-417**: per-slice detail archived to [docs/changelog/archive-slices-416-417.md](docs/changelog/archive-slices-416-417.md) (moved in slice 418 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet view model's effective speeds + the speed-derivation layering fix (416) and the inventory / equipment summary (417).

**Slices 414-415**: per-slice detail archived to [docs/changelog/archive-slices-414-415.md](docs/changelog/archive-slices-414-415.md) (moved in slice 416 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the character-sheet view model's attacks list (414) and spellcasting block (415).

**Slices 411-413**: per-slice detail archived to [docs/changelog/archive-slices-411-413.md](docs/changelog/archive-slices-411-413.md) (moved in slice 414 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the start of the consumer-facing read layer plus the bug it surfaced. Content browse (411), the background skill/tool proficiency-ingestion fix (412), and the character-sheet view model (413).

**Slices 408-410**: per-slice detail archived to [docs/changelog/archive-slices-408-410.md](docs/changelog/archive-slices-408-410.md) (moved in slice 411 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the Absorb Elements retrofit + the deliberate Thunder-Step stop (408), the `ContentBundle` single-file user-content shape (409), and the class-audit status-doc reconciliation (410).

**Slices 405-407**: per-slice detail archived to [docs/changelog/archive-slices-405-407.md](docs/changelog/archive-slices-405-407.md) (moved in slice 408 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the plugin API design proposal (405), the custom-action seam (406), and the Elemental Weapon retrofit (407).

**Slices 400-403**: per-slice detail archived to [docs/changelog/archive-slices-400-403.md](docs/changelog/archive-slices-400-403.md) (moved in slice 404 to keep the live CHANGELOG under the 60 KB single-Read ceiling). Cohort: the multi-pack id-collision policy + validator (400), and the full SRD/non-SRD content-pack separation (401 backgrounds + feats, 402 the 12 non-SRD spells + their conditions, 403 stop shipping non-SRD content into a gitignored content-packs/ folder).

## Older releases

Tagged releases `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
