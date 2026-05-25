# CHANGELOG archive: slices 444-450 (L1 playability arc, part 1)

Per-slice detail for slices 444-450 of the level-by-level L1 playability arc, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 454 to keep it under the 60 KB single-Read ceiling. Cohort: Divine Smite (444), Pack Tactics on L1 monsters (445), Wolf/Dire Wolf knock-prone (446), Halfling Brave + Elf Fey Ancestry + Keen Senses (447), 6 species darkvision + Dwarven Resilience + Gnomish Cunning (448), Rogue Thieves' Cant + Sprite natural weapons (449), and the noAbilityModifierDamage weapon flag (450).

---

**Engine + content (slice 450): `noAbilityModifierDamage` weapon flag - closes slice-449's documented RAW deviation**

Closes the documented RAW deviation flagged at the end of slice 449 (Sprite Enchanting Bow's flat-damage shape). Adds an opt-in weapon flag that suppresses the attack planner's automatic +ability_mod fold on base damage; canonical user is the Sprite Enchanting Bow. With the flag set, the bow's `damageDice: "0d4+1"` now yields exactly **1 piercing + Charmed on hit** for any wielder regardless of their DEX, matching SRD verbatim.

**Engine** (small, two-touch):
- New `noAbilityModifierDamage?: boolean` field on `WeaponSchema` in [src/schemas/content/item.ts](../../src/schemas/content/item.ts). Optional, defaults to omitted/false so the normal RAW path of adding STR/DEX to weapon damage stays unchanged for every existing weapon.
- In [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts), the primary `resolveAttack` zeros `damageAbilityMod` when the flag is true (the surrounding ability-score floor / increase logic is preserved for future flagged weapons whose effects might still touch the score). The Cleave secondary-attack path that normally strips the ability mod from the resolved damage events also skips the strip under the flag (defensive — Cleave is melee-only, so the canonical user can't hit it, but a future flagged melee weapon would).

**Content:** sprite-enchanting-bow in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json) sets `noAbilityModifierDamage: true`. Description updated to reference both slices (449 wired Charmed, 450 added the flag).

**Test** at [tests/unit/engine/slice-450-flat-damage.test.ts](../../tests/unit/engine/slice-450-flat-damage.test.ts) — 2 cases:
- Sprite Enchanting Bow hit on a target emits a `DamageRolled` whose piercing roll has `rolls: []` (0d4) and `modifier: 1` (the flat +1 from the dice expression; **no DEX +4**). Proves the flag suppresses the ability fold.
- Sprite Needle Sword (same wielder, no flag set) emits a piercing roll with `modifier: -4` (the Sprite's STR mod). Proves the flag is opt-in and doesn't accidentally affect other weapons.

**Pattern-check sweep:** scanned the pack for other natural weapons with the `0dN` flat-damage shape — only sprite-enchanting-bow uses it currently. All other natural weapons (ghoul-claws, couatl-bite, wolf-bite, dire-wolf-bite, wyvern-sting, ettercap-bite, merrow-bite, sprite-needle-sword) use the standard `<count>d<die>` shape with RAW intent to add ability mod, so the flag stays opt-in. No sibling fixes required this slice.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 monsters-A-Z.md Sprite Enchanting Bow ("Hit: 1 Piercing damage"). With the flag, the engine's damage event now matches that flat number exactly.
- *Names*: `noAbilityModifierDamage` is intention-revealing and pairs symmetrically with the existing damage-mod fields (`damageBonus`, `attackBonus`). Matches the slice-122 / slice-325 "0dX+N" flat-damage rider naming style.
- *DRY / SRP*: minimal-surface engine extension (one optional schema field, one branch in `damageAbilityMod` computation, one branch in Cleave's strip). Declined to refactor the whole damage-roll path; the existing helpers compose with one conditional.
- *Mechanical outcomes asserted*: the flagged weapon emits exact-RAW flat damage; the unflagged weapon (same wielder) still folds in the ability mod. Cross-product proves opt-in scope.

**Open follow-ups:**
- No new ones tracked. The slice-449 follow-ups for Sprite (Heart Sight, at-will Invisibility, Charmed duration) remain unchanged. *Closes:* slice-449 "Sprite Enchanting Bow flat damage" follow-up.

**Content (slice 449): Rogue Thieves' Cant + Sprite natural weapons - L1 playability arc**

Two unrelated content fixes batched. Closes the smallest of the L1 audit's class-feature stubs (Thieves' Cant), and wires the Sprite's RAW combat actions so the Sprite (CR 1/4 Fey) finally has a usable attack.

**Wired:**
- **Rogue L1 Thieves' Cant**: 1-line addition — `GrantProficiency target:'language' id:'thieves-cant' level:'proficient'`. Closes a long-standing stub flagged in the L1 audit; no new infrastructure required (languages are free-form strings in the species/feature schemas, not an enum).
- **Sprite Needle Sword** (`sprite-needle-sword`): simple-melee piercing 1d4, no rider. Plain attack item.
- **Sprite Enchanting Bow** (`sprite-enchanting-bow`): simple-ranged piercing `0d4+1` (flat 1), range 40/160, with `applyConditionId: 'charmed'` onHit rider. Charmed application uses the slice-321 unconditional `applyConditionId` shape established by Couatl's Bite (Poisoned). The bow's RAW "Hit: 1" damage doesn't perfectly survive the engine's automatic +ability-mod fold — a Sprite's DEX +4 adds to the base, so the engine emits ~5 damage where RAW says 1. The interesting RAW arm is the Charmed-on-hit, which works correctly. Documented as a RAW deviation pending a future `noAbilityModifierDamage?` weapon flag.

**Test** at [tests/unit/engine/slice-449-thieves-cant-sprite.test.ts](../../tests/unit/engine/slice-449-thieves-cant-sprite.test.ts) — 4 cases: a L1 Rogue has `proficiencyLevel('language', 'thieves-cant') === 'proficient'`; a Human Fighter does not; Sprite Needle Sword fires a melee attack against a target; Sprite Enchanting Bow on a hit applies Charmed to the target (seed-searched for a hit).

**Doc updates:** weapons count 56 → 58 (and items total 519 → 521) in [docs/getting-started.md](../../docs/getting-started.md) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md). Intentional coverage-matrix snapshot update at [tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap) — `thieves-cant` joins the wired class-feature catalog.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 monsters-A-Z.md (Sprite Needle Sword and Enchanting Bow text verbatim). Thieves' Cant per SRD 5.2.1 Rogue L1 ("You know Thieves' Cant, a combination of dialect, jargon, and code that lets you hide messages in seemingly normal conversation").
- *Names*: `sprite-needle-sword` / `sprite-enchanting-bow` follow the established `couatl-bite` / `ghoul-claws` / `wolf-bite` natural-weapon convention. Language id `thieves-cant` matches the RAW spelling.
- *DRY*: 1-line GrantProficiency for the cant uses the existing primitive directly. Sprite weapons match the slice-321 / slice-446 onHit rider patterns without introducing new shapes.
- *Mechanical outcomes asserted*: Thieves' Cant proficiency derives correctly through the effect stack; sprite weapons emit AttackRolled with correct attackKind; Enchanting Bow's hit emits a Charmed ConditionApplied on the target.

**Open follow-ups:**
- ~~**Sprite Enchanting Bow flat damage**: the engine adds the wielder's ability mod to base damage, so RAW "Hit: 1" inflates to ~5 for a Sprite (DEX +4). A `noAbilityModifierDamage?: boolean` weapon flag would close this cleanly. Same shape would help any monster natural weapon whose RAW damage is a flat amount rather than a die + ability mod (Imp's Sting variants, Pseudodragon's Sting, etc.).~~ **Closed by slice 450.**
- **Sprite Heart Sight + Invisibility**: the Heart Sight CHA-save knowledge effect is narrative; the Invisibility self-cast needs the existing UseAction CastSpell variant which currently lives on items, not on monster traits. *Still open.*
- **Sprite duration of the Charmed condition** ("until the start of the sprite's next turn"): consumer-managed per the slice-286 doc; engine emits ConditionApplied without an auto-expiry stamp. *Still open.*

**Content (slice 448): Darkvision + Dwarven Resilience + Gnomish Cunning species traits - L1 playability arc**

Sweeps the obvious follow-up flagged at the close of slice 447: the remaining 7 SRD species in the pack still shipped empty `traits` arrays. This slice wires the clean wins — every species trait that composes with existing primitives (`GrantSense`, `GrantResistance`, `SetAdvantage` with slice-266 wildcard / slice-291 `savePreventsCondition` fact / per-ability save targeting). Higher-ceremony traits (Dragonborn Breath Weapon, Tiefling Fiendish Legacy, Goliath Giant Ancestry, Orc Adrenaline Rush, Halfling Lucky, Elven Lineage, Human Resourceful) stay deferred — each needs new primitives or choice scaffolding outside this slice's scope.

**Wired** (all 6 darkvision species + 2 condition / save advantage trait clusters):
- **Darkvision 60 ft**: Dragonborn, Elf, Gnome, Tiefling (each `GrantSense sense:'darkvision' range:60`).
- **Darkvision 120 ft**: Dwarf, Orc (`range:120`).
- **Dwarven Resilience**: `GrantResistance poison` + `SetAdvantage on:{kind:'save'} mode:'advantage' condition: {eq event.savePreventsCondition 'poisoned'}`. The save advantage shape matches the slice-447 Halfling Brave / Elf Fey Ancestry wire exactly (the predicate value is the only varying field).
- **Gnomish Cunning**: three `SetAdvantage on:{kind:'save', ability:'INT'/'WIS'/'CHA'} mode:'advantage'` entries. Per-ability rather than wildcard since the gnome's advantage applies to *all* INT/WIS/CHA saves, not just condition-targeting ones (different shape from the slice-447 condition-gated form).

**Test** at [tests/unit/engine/species-darkvision-and-saves.test.ts](../../tests/unit/engine/species-darkvision-and-saves.test.ts) — 9 cases:
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
- ~~**Orc Adrenaline Rush**: Dash bonus action + temp HP. Same shape Rogue Cunning Action / Monk Patient Defense need.~~ **Closed by slice 453.**
- **Orc Relentless Endurance**: "drop to 1 HP instead of 0, once per Long Rest." Shares shape with the deferred Barbarian Relentless Rage. *Still open.*
- **Human Resourceful / Skillful / Versatile**: Heroic Inspiration isn't an engine concept; Skillful needs an OfferChoice over all 18 skills; Versatile needs an OfferChoice over origin feats. Each its own small slice. *Still open.*
- **Dwarven Toughness**: +1 HP per character level. Needs a per-level scaling `Formula` on a `AddModifier hpMax`. Small. *Still open.*
- **Dwarf Stonecunning**: bonus-action Tremorsense 60 ft for 10 min, PB uses per Long Rest. Needs ApplyCondition + GrantResource + a Tremorsense-granting condition. *Still open.*
- **Elven Lineage** (Drow / High Elf / Wood Elf): OfferChoice + L1/L3/L5 spell grants (same shape as Tiefling Fiendish Legacy). *Still open.*
- **Pack Tactics-shape sweep on Sprite (Brave)**: Sprite's `Brave` trait per SRD adds a save-advantage shape to monsters; same wire as Halfling Brave but on the Sprite statblock. Defer to a monster-trait sweep slice. *Still open.*

**Content (slice 447): Halfling Brave + Elf Fey Ancestry + Elf Keen Senses - L1 playability arc**

Wires three SRD species traits a L1 player character actually feels in play. Pure content slice — uses existing primitives end-to-end (slice-266 save wildcard + slice-291 `event.savePreventsCondition` fact + existing `OfferChoice` `GrantProficiency`). Before this slice, both starter-pack-shipped species had empty `traits` arrays, so a halfling fighter rolling a save vs Fear and an elf wizard rolling vs Charm Person both rolled flat — RAW gives them advantage.

**Wired** in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json):
- **Halfling Brave** — `SetAdvantage on:{kind:'save'} mode:'advantage' condition: {eq event.savePreventsCondition 'frightened'}`. The save-wildcard target + condition-specific predicate is identical to the slice-291 antitoxin-active wire (canonical user of the same fact infrastructure).
- **Elf Fey Ancestry** — same shape, `value: 'charmed'`.
- **Elf Keen Senses** — `OfferChoice oneOf:1 when:'onAcquire'` over Insight / Perception / Survival, each option granting the chosen skill proficiency. Mirrors the Wizard Scholar L2 entry's shape (slice 55).

**Test** at [tests/unit/engine/species-saves.test.ts](../../tests/unit/engine/species-saves.test.ts) — 6 cases: Halfling vs Fear (advantage); Human vs Fear (no advantage, control); Elf vs Charm Person (advantage); Human vs Charm Person (no advantage); Halfling vs Charm Person (no advantage — gate is Frightened-specific); Elf vs Fear (no advantage — gate is Charmed-specific). The cross-pair tests prove the predicate gating is correctly condition-scoped.

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

**Engine extension** (1-line addition to [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) `riderFacts` map): `target.creatureSize` predicate fact, populated via the existing slice-386 `creatureSize` derive (the same source-of-truth used by Cunning Strike Trip and weapon-mastery Push). Joins the existing `target.creatureType` (slice 318) and `target.speciesId` (slice 319) facts as the third dimension content can gate onHit riders on.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json), 2 new items): `wolf-bite` and `dire-wolf-bite` natural weapons with size-gated `applyConditionId: 'prone'` onHit riders. Wolf's gate matches `target.creatureSize ∈ {Tiny, Small, Medium}`; Dire Wolf's gate widens to include Large. Both use the slice-321 unconditional `applyConditionId` rider shape (no save) per RAW.

**Test** at [tests/unit/engine/wolf-bite-prone.test.ts](../../tests/unit/engine/wolf-bite-prone.test.ts) — 5 cases exercising both weapons against Small / Medium / Large / Huge targets with seed-search for hits. Confirms: Wolf prones Small + Medium but not Large; Dire Wolf prones Large but not Huge.

**Doc updates:** `54 weapons -> 56` in [docs/getting-started.md](../../docs/getting-started.md) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) (caught by the doc-counts audit).

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

**Consumer-override path** (new this slice): added `attackerHasAllyAdjacentToTarget?: boolean` to `AttackIntent` and `ResolveAttackInput` ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)). When set, it overrides the engine's position derivation, so position-less consumers (a CLI without grid positions, an older campaign model) can still signal the RAW condition. Opt-in semantic (predicate is `eq value:true`): undefined produces no Pack Tactics advantage, matching the slice-279 `lightLevel` pattern for "benefit gated on specific narrative context."

**Content:** four monsters wired in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json) with `traits: [{ kind: 'SetAdvantage', on: 'attack', mode: 'advantage', condition: { kind: 'eq', path: 'event.attackerHasAllyAdjacentToTarget', value: true } }]`. Uses the inline-trait shape established by Imp's `GrantMagicResistance` and Troll Limb's `Regeneration` (slice 232).

**Test:** [tests/unit/engine/pack-tactics.test.ts](../../tests/unit/engine/pack-tactics.test.ts) exercises three cases: explicit `true` -> advantage (`used: 'advantage'`, 2× d20), explicit `false` -> no advantage, undefined-without-encounter -> no advantage. The existing slice-7 Sneak Attack golden test continues to pass unchanged (the unified fact path didn't change post-roll behavior).

**Catalog updates:** appended a new row to the consumer-coordinated fact slots catalog in [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) noting both the engine-derived path (position-aware, pre-existing) and the consumer-override path (this slice).

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

Divine Smite shipped as content-only: the on-hit trigger primitive (the slice-61 `OnEvent`/`consumeOnTrigger` shape used by Searing Smite) already supports the unconditional-`AddDamage` path that Divine Smite needs. New `divine-smite-active` condition in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json) carries two riders sharing one buff: a base rider (2d8 radiant on a melee hit by the bearer) and a Fiend/Undead-gated rider (+1d8 radiant, filtered via `event.targetCreatureType ∈ {Fiend, Undead}`). Both filter on `event.attackKind == 'melee'` per RAW ("Melee weapon or an Unarmed Strike"; unarmed strikes classify as melee in the engine). Both ride `consumeOnTrigger: true`; the dispatcher's snapshot-then-iterate design (slice 114) fires both before the first consume removes the condition from the snapshot. Wired the `divine-smite` spell via `mechanicalEffects: [{ kind: 'buff', conditionId: 'divine-smite-active' }]`.

Golden test at [tests/golden/divine-smite.test.ts](../../tests/golden/divine-smite.test.ts) exercises both arms: a paladin attacking a Humanoid fires only the base rider; attacking a Skeleton (Undead, via `statblockId`) fires both base and celestial riders. Both variants confirm the bearing condition is consumed after the hit.

Updated [tests/unit/engine/spell-coverage.test.ts](../../tests/unit/engine/spell-coverage.test.ts) (divine-smite: skip -> wired buff). Updated [docs/gaps-spells.md](../../docs/gaps-spells.md) L1 header (38 -> 39 wired, 6 -> 5 deferred), the totals line (182 -> 183 wired, 87 -> 86 deferred), and the priority-queue narrative (smite-rider cluster goes from 3 -> 2 remaining, with notes on what shining-smite and ensnaring-strike each additionally need). Updated condition-count citations in [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md), [docs/status.md](../../docs/status.md), and [docs/getting-started.md](../../docs/getting-started.md) (124 -> 125 total, 109 -> 110 rider) — the doc-counts audit caught all three.

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
