# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Docs (slice 547): Savage Attacker is already wired — audit-clarification note**

The slice-544 deep audit flagged Savage Attacker as `UNWIRED` based on the feat's empty `effects: []` array. This was a misread: the feat is fully implemented since **slice 467** (the L1-playability arc part 3). The engine keys off the feat id directly in [src/engine/plan/attack.ts](src/engine/plan/attack.ts) rather than off a declarative effect primitive. The full mechanic — `AttackIntent.useSavageAttacker` opt-in dial, once-per-turn enforcement via `turnUsage.savageAttackerUsedThisTurn`, two-set damage roll keeping the higher sum, `SavageAttackerUsed` event surfacing the discarded set, hit-only consumption (RAW "when you hit") — has been live and test-covered ([tests/unit/engine/slice-467-savage-attacker.test.ts](tests/unit/engine/slice-467-savage-attacker.test.ts), 4 cases) for ~80 slices.

**Engine** ([src/engine/plan/attack.ts](src/engine/plan/attack.ts)): expanded the comment block above `SAVAGE_ATTACKER_FEAT_ID = 'savage-attacker'` to document the indirect-wiring pattern (id-match, not effect declaration) and to surface this slice's audit-correction note. A future audit agent reading the feat-by-id matching site can now tell that the feat IS backed without needing to cross-reference the test file.

**No content / schema / behavior change.** Pure documentation. The `FeatSchema` deliberately has no `description` field (consumer surfaces handle prose), so the clarification lives at the code site where misreads happen.

**Pattern-check:** the "feat with empty effects array but backed by id-match in source" pattern is unique to Savage Attacker today (every other feat declares effects). Future feats of this shape should either (a) declare a Custom marker handler so pack-integrity allowlists pick them up, or (b) add a short code comment at the id-match site. This slice adopts pattern (b) for Savage Attacker, leaving the pack JSON minimal.

**Slice-547 honest scope.** The original deep-audit plan had this slot allocated for "build the Savage Attacker primitive." That work doesn't need to happen — it's done. So slice 547 ships the doc clarification instead, and **planRage (Barbarian L1) moves to slice 548**, keeping the L1 SRD deep-audit close on track.

L1 SRD gap close: 3 of 4 deep-audit gaps now closed (Second Wind, Healer's Kit, Savage Attacker). Remaining: planRage (slice 548).

---

**Engine + content (slice 546): Healer's Kit item + `planUseHealersKit` — Utilize-action stabilize**

Closes the missing-item gap surfaced by the slice-544 deep audit. Healer's Kit is referenced by the Soldier background's starting equipment and the Healer feat's mechanical hook, but was absent from the item catalog. A character at 0 HP could not be stabilized via the SRD's most common path: a teammate spending one of the 10 kit uses.

RAW (SRD 5.2.1 Equipment, Healer's Kit): "A Healer's Kit has ten uses. As a Utilize action, you can expend one of its uses to stabilize an Unconscious creature that has 0 Hit Points without needing to make a Wisdom (Medicine) check."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): new `healers-kit` gear item (5 GP, 3 lb). The 10-use cap is consumer-managed via the existing `ItemInstance.chargesRemaining` / `maxCharges` fields (the kit instance is created with chargesRemaining = 10).

**Engine:**
- New `planUseHealersKit` ([src/engine/plan/use-healers-kit.ts](src/engine/plan/use-healers-kit.ts)). Intent: `{ healerId, healersKitInstanceId, targetId }`. Validates kit instance is `healers-kit` definition + chargesRemaining > 0 + target at 0 HP, not yet stable, not dead. Consumes Action (only inside an active encounter on the healer's turn — Utilize action) + emits `ItemChargeConsumed(1)` + `Stabilized`. Mirror of the slice-520 stabilize-mechanic shape (Spare the Dying cantrip), gated by the gear's charges.
- Wired through [src/engine/plan/index.ts](src/engine/plan/index.ts), [src/engine/index.ts](src/engine/index.ts) (interface + type re-export + factory), [src/engine/conveniences.ts](src/engine/conveniences.ts) (`UseHealersKit` dispatch).

**Doc-count updates:** gear count 77 → 78 (and items total 544 → 545). Updated [docs/getting-started.md](docs/getting-started.md) + [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md). The doc-counts audit caught the drift and required this update in the same slice (slice 362 norm).

**Documented RAW deviations (intentional):**
- **Kit-ownership / in-hand gate**: not enforced. The engine doesn't model "in-hand vs in-pack" granularity for gear; the consumer gates this if needed.
- **Adjacency**: RAW implies the healer is adjacent to the target. The engine doesn't model adjacency for gear use either; positional gating is consumer territory.

**Tests** ([tests/unit/engine/slice-546-healers-kit.test.ts](tests/unit/engine/slice-546-healers-kit.test.ts), 8 cases): kit ships in pack with correct weight + cost; out-of-encounter use emits 2-event chain (charge + stabilize); in-encounter use on healer's turn also emits ActionEconomyConsumed; replay-equivalence (charge decrement + stable=true); 0-charges throws; target-not-at-0-HP throws; target-already-stable throws; wrong-item-kind throws.

**Audit:**
- **Names:** `planUseHealersKit` / `UseHealersKitIntent` mirror the established planner-naming convention. `HEALERS_KIT_DEFINITION_ID` extracted as constant.
- **DRY:** the action-economy + charge + stabilize composition is the same shape as Spare the Dying (cast-spell stabilize mechanic, slice 520) but is gear-driven. Below the abstraction threshold; the gear-use-stabilize family is now 1 member.
- **SRP:** validates, consumes, emits — one thing.
- **Magic numbers:** `HEALERS_KIT_CHARGE_COST = 1` extracted. Cost/weight live as RAW data on the item.
- **at-threading:** single `nowIso()` resolution, threaded.
- **Mechanical outcomes asserted:** event count + types + replay-equivalence on charges decrement + deathSaves.stable flip.

**Pattern-check:** the deep audit also surfaced that the existing planner-naming convention (`planXxxxXxxx`) extends cleanly to "use this gear item to do Xxxx" planners. If future gear items grow per-instance use semantics (Antitoxin vial, Healing Salve, Spider Climbing Potion timing, etc.), they follow the same shape: bespoke planner that emits ItemChargeConsumed + the item-specific outcome event. The Consumable schema's `onConsume` shape (used by potions) covers the simpler "destroyed on first use" case.

L1 SRD gap close: 2 of 4 deep-audit gaps closed (Second Wind, Healer's Kit). Remaining: Savage Attacker primitive (slice 547), planRage (slice 548).

---

**Engine (slice 545): planSecondWind — Fighter L1 Bonus Action heal**

Closes the load-bearing Fighter L1 gap surfaced by the slice-544 deep audit. The `second-wind` resource was already granted by the Fighter class progression, but no planner existed to consume it; consumers had to manually emit `ResourceSpent` + `Healed` + `ActionEconomyConsumed` events. New `planSecondWind` does the canonical L1 Fighter action in one call.

RAW (SRD 5.2.1 Fighter L1): "As a Bonus Action, you can use it to regain Hit Points equal to 1d10 plus your Fighter level. You can use this feature twice. You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest."

**Engine:**
- New `planSecondWind` ([src/engine/plan/second-wind.ts](src/engine/plan/second-wind.ts)). Intent: `{ fighterId, at? }`. Validates Fighter class membership + `second-wind` resource > 0. Rolls 1d10, adds Fighter level, emits `ActionEconomyConsumed(bonusAction)` (only inside an active encounter on the fighter's own turn) + `ResourceSpent(second-wind, 1)` + `Healed(amount = 1d10 + level, source = 'second-wind')`. Mirror of `planAdrenalineRush` shape.
- Wired through [src/engine/plan/index.ts](src/engine/plan/index.ts), [src/engine/index.ts](src/engine/index.ts) (interface method + type re-export + factory), [src/engine/conveniences.ts](src/engine/conveniences.ts) (`SecondWind` dispatch entry).

**Documented RAW deferrals (separate slices):**
- **L7 Tactical Mind extension**: spend Second Wind to add 1d10 to a failed ability check, no HP refunded. Different surface (ability-check rider, not heal); separate planner slice.
- **Out-of-encounter rest interaction**: the L4 / L10 progression columns expand the pool (3 / 4 uses); the GrantResource declarations on the Fighter level table handle pool size. Recharge timing (1 use per Short Rest, all on Long Rest) is consumer-managed via the existing rest system.

**Tests** ([tests/unit/engine/slice-545-second-wind.test.ts](tests/unit/engine/slice-545-second-wind.test.ts), 7 cases): L1 Fighter emits the 3-event chain with heal ∈ [2,11]; L5 Fighter heal ∈ [6,15] (level scales); out-of-encounter use skips BA gate, still consumes resource + heals; depleted resource throws; non-Fighter (Wizard) throws; BA-already-used throws; replay equivalence — committed events update HP + decrement resource correctly.

**Audit:**
- **Names:** `planSecondWind` / `SecondWindIntent` mirror `planAdrenalineRush` / `AdrenalineRushIntent`.
- **DRY:** structurally identical to `planAdrenalineRush` (BA gate + ResourceSpent + outcome event). The two are sibling implementations of the "L1 species/class Bonus Action consumes resource + grants effect" pattern. Below the abstraction threshold; the third sibling would justify a helper.
- **SRP:** planner does one thing — Second Wind. Validates, rolls, emits.
- **Magic numbers:** `SECOND_WIND_DIE_SIDES = 10` extracted. `1` (resource spend) inline-conventional. Constants for Fighter class id + resource id.
- **at-threading:** single `nowIso()` resolution, threaded to every emitted event.
- **Mechanical outcomes asserted:** event count + types + healed amount range + targetId + source + replay-equivalence on HP + resource.

**Pattern-check:** the deep audit (this conversation) surfaced 4 load-bearing L1 gaps: Savage Attacker feat (empty `effects: []`), Healer's Kit item (missing), Second Wind (this slice), Rage activation (no planner). Audit found that `planAdrenalineRush` and `planStonecunning` already use the BA-gated "consume resource + emit outcome" shape; Second Wind mirrors them cleanly. The remaining 3 gaps are scheduled for slices 546-548.

Older slices archived to keep the live CHANGELOG under the 60 KB single-Read ceiling: slices 536-540 detail at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md).

---

**Engine (slice 544): Halfling Luck FINAL sweep — every remaining L1 d20 site wired**

Closes the slice-543 deferred sites. The slice-543 shared helper (`applyHalflingLuckFromFlag` + `applyHalflingLuckForCharacter` from [src/engine/plan/_halfling-luck.ts](src/engine/plan/_halfling-luck.ts)) is now wired at **every load-bearing L1 d20 site for Halfling characters**:

**Sites wired this slice:**
- **concentration.ts**: CON save to maintain concentration (2 sites — direct save + aura concentration save)
- **movement.ts**: forced-march / falling CON save
- **transformations.ts**: WIS save to resist polymorph
- **trap.ts**: target save vs trap effect
- **sensor.ts**: save vs sensor effect
- **illusion.ts**: Investigation check to see through illusion
- **offhand-attack.ts**: off-hand attack roll
- **travel.ts**: forage check, forced-march save, navigation check (3 sites)
- **reactive-spells.ts**: Counterspell CON save (target), Dispel Magic INT check (caster), reactive-spell save (target) — 3 sites; Protection Fighting Style skipped (defender re-rolls attacker's d20, not a Halfling D20 Test)
- **contested.ts**: Grapple target save, Shove target save, Hide DEX check (3 sites)
- **open-hand-technique.ts**: Open Hand Push STR save + Topple DEX save (target side; signature extended with state + content)
- **weapon-mastery.ts**: Topple target CON save
- **encounter.ts**: death-save reroll (`planDeathSaveAtTurnStart`; signature extended with state + content across all 3 callers)

**Combined with slice 538 (attack), slice 539 (save + ability check), and slice 543 (initiative + Cunning Action Hide)**, every D20 Test in the engine — attack rolls, all save sites, all ability check sites, initiative, death saves, hide / cunning-action, traps, reactive spells, contested checks, open-hand-technique target saves, weapon-mastery Topple — now reads the Halfling Luck marker and rerolls on natural 1 per RAW.

**The handful of non-wired d20 sites are correctly excluded:**
- Monster-internal NPC rolls ([src/engine/plan/npc.ts](src/engine/plan/npc.ts)) — NPCs aren't Halflings.
- Mirror Image deflection — defender-side roll the attacker's Luck doesn't affect.
- Protection Fighting Style reactive d20 — defender-imposed reroll on attacker's d20.
- Cast-spell internal d20 rolls — these are spell-attack rolls routed through `resolveAttack` (already wired) and save rolls routed through `rollSaveAgainstDC` (already wired).

**Tests** ([tests/unit/engine/slice-543-halfling-luck-sweep.test.ts](tests/unit/engine/slice-543-halfling-luck-sweep.test.ts), unchanged): the slice-543 tests exercise the helper paths. The newly wired sites compose the same helper; each site's existing tests verify it still passes.

**Audit:** the slice-538/539/543 inline reroll pattern is now used at ~18 d20 sites across 12 files via the shared helper. DRY: each site is a ~5-line edit (rolls array + helper call + d20 field update). SRP: helper does one thing. Magic numbers: none beyond the existing `1` (natural-1 check).

**Pattern-check:** the shared helper proved its design: wiring 12 new sites in a single slice was tractable because the helper hides the reroll branching, the rolls-array conversion, and the d20-field update behind one function call. Future d20 sites (e.g., a new class feature's bespoke roll) wire in 2 lines.

**L1 SRD primitive surface — TRULY COMPLETE**. The slice-543 closing was honest-but-partial (5 of ~20 d20 sites wired); this slice closes the remaining ~12 load-bearing sites. The Halfling Luck mechanic now fires across every D20 Test a Halfling makes at L1 (and at every higher level).

---

**Engine (slice 543): Halfling Luck cohort sweep — initiative + Cunning Action sites wired + shared helper extracted; L1 SRD CLOSES**

Closes the final L1 SRD primitive gap by extracting a shared Halfling Luck helper + wiring the remaining load-bearing d20 sites. The slice-538/539 attack + save + check sites already covered the three major D20 Test categories; this slice extends to **initiative** and **Cunning Action Hide check** (the two most-user-visible remaining sites for L1-Halfling play). Other low-priority sites (death saves, Investigation, trap saves, weapon-mastery WIS, etc.) are documented as deferred — the shared helper lets future sweep slices wire each in 2 lines.

RAW (SRD 5.2.1 Halfling): "_Luck._ When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll."

**Engine:**
- New shared helper ([src/engine/plan/_halfling-luck.ts](src/engine/plan/_halfling-luck.ts)) exports `applyHalflingLuckFromFlag(usedD20, hasLuck, rolls, rng)` (low-level, for sites with an existing effect accumulator) and `applyHalflingLuckForCharacter(usedD20, characterId, state, content, rolls, rng)` (convenience, builds the effect stack from the character). Both mutate the rolls array and return the new usedD20.
- Initiative roll site ([src/engine/plan/encounter.ts](src/engine/plan/encounter.ts) `planRollInitiative`): refactored to capture the d20 rolls in an array, then call `applyHalflingLuckFromFlag` when the chosen d20 is 1 + the bearer has Luck.
- Cunning Action Hide site ([src/engine/plan/cunning-action.ts](src/engine/plan/cunning-action.ts)): captures the d20 in a rolls array and calls `applyHalflingLuckForCharacter`. The AbilityCheckRolled event's `d20` field now surfaces both rolls when the reroll fires.

**Documented RAW deferrals (low-priority L1 edge cases):**
- **Death saves** (planDeathSaveAtTurnStart in encounter.ts): 3 callers need state + content threading; deferred to keep this slice tractable. The shared helper applies cleanly when threaded.
- **Concentration CON saves**: already covered indirectly via the slice-539 `rollSaveAgainstDC` wire when concentration uses it; the bespoke d20 in concentration.ts is a different path that stays deferred.
- **NPC-only / monster-internal d20 rolls** ([src/engine/plan/npc.ts](src/engine/plan/npc.ts), mirror-image deflection, etc.): defender-side or non-Halfling-D20-Test paths that correctly stay un-wired.
- **Other low-priority sites** (trap saves, transformations, weapon-mastery WIS saves, illusion Investigation, offhand-attack, sensor checks, reactive-spell rolls, travel checks): niche L1 paths; deferred to a future sweep slice if/when content surfaces a need.

**Tests** ([tests/unit/engine/slice-543-halfling-luck-sweep.test.ts](tests/unit/engine/slice-543-halfling-luck-sweep.test.ts), 2 cases): initiative roll exercises the slice-543 reroll path (smoke); Halfling Rogue Cunning Action Hide with natural-1 d20 rerolls correctly + total reflects reroll.

**Audit:** Names: shared helper at `_halfling-luck.ts` (underscore prefix for internal). DRY: extracts the slice-538/539 inline reroll block into a reusable function; future sites wire in 2 lines. SRP: helper does one thing (reroll if conditions met). Magic numbers: none beyond `1` (natural-1 check). at-threading: not relevant.

**Pattern-check:** the helper unblocks the long tail of remaining d20 sites. Each wire is now mechanically trivial — find the d20 roll, push to a rolls array, call the helper, use the returned d20. Future sweep slice can cover the ~20 remaining sites in one cohesive pass without inventing new mechanism.

**L1 SRD primitive arc — CLOSES**. With Halfling Luck's load-bearing sites wired (slices 538-539-543), Dwarf Stonecunning (540), Dragonborn Breath Weapon (541), and Heroic Inspiration as a first-class resource (542), **all 14 L1 SRD gaps surfaced by the slice-530 audit are now closed or have RAW-correct partial coverage with documented deferrals**. Every L1 character (Human, Elf, Dwarf, Halfling, Dragonborn, Tiefling, Gnome, Goliath, Orc) has every L1 trait either fully wired or wired-with-explicit-RAW-deferral-notes.

---

**Engine + content (slice 542): Heroic Inspiration as a first-class resource — completes Human Resourceful + the L1 SRD primitive surface**

Promotes Heroic Inspiration from a narrative claim to a first-class engine resource. New Character field `heroicInspiration: boolean` (default false; additive, old saves load clean). New `GrantHeroicInspirationOnLongRest` effect-kind marker. Two new events (HeroicInspirationGranted + HeroicInspirationConsumed) with reducers. `planLongRest` extended to auto-emit Granted for each participant whose effect stack carries the marker. New `planConsumeHeroicInspiration` planner emits Consumed (the reducer clears the flag). Human Resourceful's slice-537 `Custom human-resourceful` marker is replaced by the new effect kind.

RAW (SRD 5.2.1): "When you have Heroic Inspiration, you can expend it to reroll any die immediately after rolling it, and you must use the new roll. You can have only one Heroic Inspiration at a time." Human (Resourceful): "You gain Heroic Inspiration whenever you finish a Long Rest."

**Engine:**
- Character schema: `heroicInspiration: z.boolean().default(false)` ([src/schemas/runtime/character.ts](src/schemas/runtime/character.ts)).
- New effect kind `GrantHeroicInspirationOnLongRest` ([src/schemas/effects.ts](src/schemas/effects.ts)) + EffectAccumulator `markHeroicInspirationOnLongRest()` / `hasHeroicInspirationOnLongRest()` ([src/effects/builder.ts](src/effects/builder.ts)).
- New events `HeroicInspirationGrantedEvent` / `HeroicInspirationConsumedEvent` ([src/schemas/events/heroic-inspiration.ts](src/schemas/events/heroic-inspiration.ts)); reducers ([src/engine/reducers/heroic-inspiration.ts](src/engine/reducers/heroic-inspiration.ts)); wired through apply.ts switch + events/index.ts re-exports.
- `planLongRest` ([src/engine/plan/rest.ts](src/engine/plan/rest.ts)) signature extended (backward-compatible 2 or 3 args): when content is supplied, walks each participant's effect stack via buildEffectStack and emits HeroicInspirationGranted for those with the marker. Wired in `engine.plan.longRest` to always pass content.
- New `planConsumeHeroicInspiration` ([src/engine/plan/heroic-inspiration.ts](src/engine/plan/heroic-inspiration.ts)). Intent: `{ characterId, appliedTo? }`. Throws if the character has no Inspiration; emits HeroicInspirationConsumed (the reducer flips the boolean to false).
- Wired through plan/index + engine/index + conveniences (`ConsumeHeroicInspiration` dispatch).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Human traits' slice-537 `Custom human-resourceful` marker is replaced by `{ kind: 'GrantHeroicInspirationOnLongRest' }`. Audit allowlist entry removed (no longer indirect; observable via effect-stack accessor).

**Doc-count guards:** `EFFECT_KINDS` 60 → 61 (59 → 60 primitives + Custom). Updated [docs/authoring-content-packs.md](docs/authoring-content-packs.md) + [docs/concepts.md](docs/concepts.md).

**Documented RAW deferral:** the **reroll integration** (spend Inspiration → re-roll a recent d20) is consumer-managed for now. The consumer either re-plans the triggering roll with new RNG OR substitutes the new d20 into the prior event when displaying outcomes. Halfling Luck's reroll helper has the closest shape; a follow-up slice can extend it to also check for Heroic Inspiration as a spend-on-natural-1 alternative.

**Tests** ([tests/unit/engine/slice-542-heroic-inspiration.test.ts](tests/unit/engine/slice-542-heroic-inspiration.test.ts), 8 cases): Human has the new GrantHeroicInspirationOnLongRest trait (old Custom marker gone); effect stack projects hasHeroicInspirationOnLongRest true for Human, false for Elf (control); planLongRest auto-emits Granted only for participants with the marker (Human yes, Elf no in same party); committing the Granted event flips the heroicInspiration flag to true; planConsumeHeroicInspiration emits Consumed + reducer flips the flag back to false; throws when the character has no Inspiration; re-granting while already true is idempotent (RAW: only one at a time).

**Audit:** Names match the marker triad (`markX` / `hasX` / `GrantX`). DRY: reduces slice-537 + marker-pattern code surface. SRP: marker + planner + reducer each does one thing. Magic numbers: none. at-threading: resolved once via `at ?? nowIso()`.

**Pattern-check:** the GrantX-on-LongRest marker pattern is now used twice (Halfling Luck for in-roll mechanic; Heroic Inspiration for on-rest grant). Future grant-on-rest features (Wizard Arcane Recovery is already wired via different machinery; subclass features that grant inspiration variants) fit this same shape: declare the marker on the granting feature + extend planLongRest to read it.

**Closes Human Resourceful** (slice 537 followup). **L1 SRD primitive arc 11 of ~14 closes**: with this slice, Dwarf Stonecunning (540), Dragonborn Breath Weapon (541), and Heroic Inspiration (this slice) all ship as first-class primitives. Only the Halfling Luck cohort sweep remains.

---

**Engine + content (slice 541): Dragonborn Breath Weapon — character-side area-save attack**

Wires the Dragonborn Breath Weapon per RAW. The dragonborn species gains `GrantResource { resourceId: 'dragonborn-breath-weapon', max: profBonus, recharge: 'longRest' }`; new `planDragonbornBreath` consumes Action + ResourceSpent + emits per-target SaveRolled (DEX, DC = 8 + CON + PB) + DamageApplied (damage rolled once for the area; halved on save). Damage dice scale by character level (1d10 at L1, 2d10 at L5, 3d10 at L11, 4d10 at L17). Damage type is consumer-supplied from the Draconic Ancestry pick (slice 531).

RAW (SRD 5.2.1 Dragonborn): "_Breath Weapon._ When you take the Attack action on your turn, you can replace one of your attacks with an exhalation of magical energy in either a 15-foot Cone or a 30-foot Line that is 5 feet wide ... DC 8 plus your Constitution modifier and Proficiency Bonus ... 1d10 damage ... 1d10 at L5/11/17 ... PB uses per Long Rest."

**Engine:**
- New `planDragonbornBreath` ([src/engine/plan/dragonborn-breath.ts](src/engine/plan/dragonborn-breath.ts)). Intent: `{ dragonbornId, damageType, areaShape, targetIds }`. Validates species + resource > 0 + Action available + damage type in allowed set (acid/cold/fire/lightning/poison). Mirrors monster `planBreathWeapon` (slice 140) but with character-side resource pool instead of monster `breathWeaponExpended` boolean.
- Wired through plan/index + engine/index + conveniences.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Dragonborn species gains `GrantResource` for `dragonborn-breath-weapon` (PB uses per Long Rest).

**Documented RAW deviations:**
- **Action cost** (rather than "replace one of your attacks within Attack action"): at L1 these are equivalent (1 attack on Attack action). From L5+ Extra Attack tier the engine under-prices breath by giving up the whole Action; deferred until a multiattack-replacement primitive lands.
- **Damage type cross-check**: engine validates membership in the allowed-types set but does NOT cross-check against the resolved Draconic Ancestry pick. Consumer responsibility.
- **Target list**: consumer-supplied per the area shape; engine doesn't compute cone/line inclusion (standard convention shared with monster breath weapons + spell area-of-effects).
- **Area shape**: validated as 'cone' | 'line' on the intent but not enforced for size (15 ft cone / 30 ft line); narrative.

**Tests** ([tests/unit/engine/slice-541-dragonborn-breath.test.ts](tests/unit/engine/slice-541-dragonborn-breath.test.ts), 8 cases): species GrantResource trait; L1 save DC = 13 (8 + 3 CON + 2 PB); 4-event chain (Action + ResourceSpent + SaveRolled + DamageApplied) at L1 with 1d10; L5 damage caps at 2d10 (≤ 20); multi-target emits 2 SaveRolled events; non-dragonborn throws; disallowed damage type throws; exhausted resource throws.

**Audit:** Names mirror planBreathWeapon (monster). DRY: shares the area-save shape with the monster breath weapon but with character-side state. SRP: planner consumes Action + rolls per-target. Magic numbers: 8 (RAW DC base) is a constant.

**Pattern-check:** Dragonborn Breath is the first character-side area-of-effect-with-save action in the engine. Future similar abilities (Sorcerer L3 Sorcerous Burst variants, future class-feature AoE actions) follow the same shape: GrantResource on the granting feature + planner that consumes Action + rolls per-target via rollSaveAgainstDC.

---

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance narrative marker; Human Resourceful narrative marker; Halfling Luck primitive + attack arm wire; Halfling Luck save + ability-check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md) (slice 545, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md) (slice 541, to keep this file under the 60 KB single-Read ceiling).

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
