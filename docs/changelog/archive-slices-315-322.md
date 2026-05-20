# CHANGELOG archive — slices 315-322

Per-slice detail for the post-alpha.9 magic-equipment + on-hit-rider cohort (slices 315-322), moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 326 when it approached the 60 KB single-Read ceiling. These slices are still in the `Unreleased` line (not yet promoted to a tagged version); the live CHANGELOG keeps a cohort summary + pointer to this file. Entries are newest-first, matching the CHANGELOG convention.

Cohort theme: magic equipment became real equipment (stages 1-3, slices 315-317: single-base armor, single-base weapons, multi-base enchantment overlay), then the on-hit weapon-rider trigger family was built out across target-gate (318), save-or-condition (319), the save-roll DRY refactor (320), unconditional condition (321), and a poison natural-weapon content sweep (322).

---

**Content: poison natural-weapon sweep — combined damage + condition riders (slice 322)**

Pure content slice (no engine work) exercising the now-complete on-hit-rider family. Adds three iconic poison natural weapons, two of which carry a single `onHit` rider holding **both** extra poison damage (slice 316 `dice`) and an unconditional Poisoned (slice 321 `applyConditionId`) — a combination the prior slices' tests hadn't pinned.

Content (3 natural weapons, modeled as wielded items like Ghoul's Claw / Couatl's Bite):
- **Wyvern's Sting** (2d6 piercing, reach; +7d6 poison + Poisoned per hit).
- **Ettercap's Bite** (1d6 piercing; +1d4 poison + Poisoned per hit).
- **Merrow's Bite** (1d4 piercing; Poisoned per hit, no extra damage — same shape as Couatl's Bite).

The base dice are the SRD natural-weapon dice; the printed +N attack/damage come from the wielder's ability + proficiency. The condition durations ("until the start/end of the creature's next turn") are consumer-managed (mirror of slices 286/319/321).

Content audit: the three RAW lines (Wyvern Sting, Ettercap Bite, Merrow Bite) were copied from [references/srd-markdown/monsters-A-Z.md](../../references/srd-markdown/monsters-A-Z.md); each wires to the existing rider primitives with no new engine surface. **Tests** — 3 new ([tests/unit/engine/slice-322-combined-poison-rider.test.ts](../../tests/unit/engine/slice-322-combined-poison-rider.test.ts)) asserting the combined rider emits both a `7d6`/`1d4` poison component AND an attacker-sourced Poisoned with no `SaveRolled`, and that Merrow's single-arm rider applies the condition with no extra damage. Full suite green (1938 passed), tsc clean, coverage snapshot unchanged (natural weapons have no mastery, aren't magic items). Docs: gaps Items (weapons 49 → 52).

**Engine + content: unconditional on-hit condition riders (slice 321)**

The 2024 SRD's common natural-attack shape isn't save-for-half damage — it's an unconditional on-hit condition ("Hit: ... and the target has the Poisoned condition", with no save). This slice adds that arm to the `onHit` rider, completing the on-hit-rider family (extra damage / save-or-condition / unconditional-condition).

Engine:
- The `onHit` rider schema gains optional `applyConditionId: string`. On a hit where the rider's slice-318 `condition` gate passes, the attack planner emits `ConditionApplied` (sourced by the attacker) with no save. The schema's "rider must do something" refine now accepts `dice`, `save`, or `applyConditionId`.
- The planner's post-damage rider loop (renamed `onHitRiderEvents`) handles both arms via a shared `applyRiderCondition` closure: the slice-319 `save.conditionOnFail` (gated behind a failed save) and the new unconditional `applyConditionId`.

Content (canonical user): **Couatl's Bite** (`couatl-bite`, simple melee 1d12 piercing) applies Poisoned on every hit — RAW "Hit: 11 (1d12 + 5) Piercing damage, and the target has the Poisoned condition until the end of the couatl's next turn." Like the Ghoul's Claw, it's a monster natural weapon modeled as a wielded item; the +5/+7 come from the wielder's ability + proficiency.

RAW deviation: the "until the end of the couatl's next turn" duration is consumer-managed (no `expiresOnRound`), mirroring slices 286/319.

Uncle Bob audit: **Names** — `applyConditionId` parallels the slice-286 `conditionId` naming; `applyRiderCondition` says what it does. **DRY** — the save-fail and unconditional arms share one `ConditionApplied`-building closure instead of two literals. **SRP** — schema, planner emission each in their own layer; the closure does one thing. **Magic numbers** — none (1d12 / piercing / poisoned RAW-cited on the content item). **at-threading** — the condition applies with the planner's single resolved `at`; no RNG consumed for the unconditional arm. **Mechanical outcomes asserted** — a hit applies attacker-sourced Poisoned with no `SaveRolled` + base piercing damage; a miss applies nothing. **Tests** — 2 new ([tests/unit/engine/slice-321-onhit-condition.test.ts](../../tests/unit/engine/slice-321-onhit-condition.test.ts)); full suite green (1935 passed), tsc clean. Coverage snapshot unchanged (couatl-bite has no mastery, isn't a magic item). Docs: gaps Items (weapons 48 → 49).

**Engine refactor: unify save-rolling on the shared `rollSaveAgainstDC` helper (slice 320)**

Closes the slice-319 follow-up. The d20-roll + advantage-resolution + `SaveRolled`-assembly shape was inlined in four places once slice 319 added the on-hit-save rider; this slice routes the three legacy copies (use-item `Save`, recurring-save, breath-weapon) through the same `rollSaveAgainstDC` helper the rider already uses. No behavior change.

Engine:
- `rollSaveAgainstDC` ([src/engine/plan/_save-roll.ts](../../src/engine/plan/_save-roll.ts)) gains two optional inputs so it covers all four callers: `causedByEventId` (breath-weapon stamps its save with the `BreathWeaponFired` marker id) and `savePreventsCondition` (recurring-save threads the slice-291 Antitoxin gate into `computeSavingThrow`).
- [use-item.ts](../../src/engine/plan/use-item.ts) `Save` action, [breath-weapon.ts](../../src/engine/plan/breath-weapon.ts), and [recurring-save.ts](../../src/engine/plan/recurring-save.ts) drop their inline save blocks (and the now-unused `computeSavingThrow` / `SaveRolledEvent` / `rollDie` / `D20_SIDES` imports) in favor of the helper. recurring-save still computes its own DC via `computeSpellSaveDC` and passes the result as the helper's fixed `dc`.

No new tests: this is a behavior-preserving refactor, and the existing golden transcripts + replay-equivalence + RNG-capture suites pin the exact event streams (including d20 RNG-consumption order and `causedByEventId` links) for all three planners. Any drift would have failed them.

Uncle Bob audit: **Names** — unchanged (the helper and its two new optional fields name what they carry). **DRY** — this is the DRY fix: one save-roller instead of four near-identical copies. **SRP** — the helper does one thing (roll a fixed-DC save → `{event, success}`); each caller keeps its own downstream branching (condition apply / action-consume / halved damage). **Magic numbers** — none. **at-threading** — each caller passes its single resolved `at` to the helper. **Mechanical outcomes asserted** — covered by the unchanged golden/replay/RNG-capture suites (1933 passed), tsc clean. **Tests** — none added (refactor; see above).

**Engine + content: on-hit-save weapon riders (slice 319)**

Extends the slice-316/317/318 `onHit` rider with a saving-throw arm: a rider can carry a `save` block (`ability` + fixed `dc` + `conditionOnFail`); on a hit the target makes the save and, on failure, gains the condition. The save fires only when the rider's slice-318 `condition` gate passes, so the gate and the save compose. This is the on-hit-save primitive that the slice-318 entry flagged as deferred.

Engine:
- The `onHit` rider schema gains optional `save: { ability, dc, conditionOnFail, sourceIsMagical? }`. `dice`/`damageType` are now optional and paired (a rider carries extra damage, a save, or both — a pure-save rider omits dice entirely), enforced by two `.refine` checks.
- The attack planner splits the (already condition-filtered) applicable riders into damage rolls and save rolls. After the damage chain, each save rider rolls a save against the target and, on failure, emits `ConditionApplied` (sourced by the attacker). `sourceIsMagical` defaults to false (monster natural-weapon saves are nonmagical).
- New shared `rollSaveAgainstDC` helper ([src/engine/plan/_save-roll.ts](../../src/engine/plan/_save-roll.ts)) bakes the d20(s) + computed bonus into a `SaveRolled` event. Three older planners (use-item `Save`, recurring-save, breath-weapon) still inline the same shape; routing them through the helper is a tracked follow-up (below).
- The rider-facts map gains `target.speciesId`, so a gate can express lineage exclusions (the Ghoul's "isn't an Undead or elf") that creature-type alone can't.

Content (canonical user): **Ghoul's Claw** (`ghoul-claws`, a Ghoul natural weapon: simple melee 1d4 slashing) carries the RAW save rider — CON DC 10 or Paralyzed — gated on `not(any[target.creatureType = Undead, target.speciesId = elf])`. Monster natural attacks are modeled as wielded weapon items (the slice-13 Ogre/longsword pattern), so the claw is the canonical user.

Open follow-ups:
- ~~The three legacy inlined save-roll blocks (use-item `Save`, recurring-save, breath-weapon) should route through the new `rollSaveAgainstDC` helper.~~ **Closed by slice 320.**
- Magic-weapon on-hit-save users with extra gating stay deferred as content: ~~Mace of Disruption's destroy-or-Frighten (low-HP-gated)~~ **Closed by slice 323** (added the post-damage HP-threshold gate + `destroyOnFail` + `conditionOnSuccess` arms). Dagger of Venom's poison (coat-gated, once/long-rest) is **still open** — its gate is the consumable coat-the-blade action, not an HP threshold.
- Poison Basic's DC 10 CON save vs Poisoned arm is still deferred: the save lives on the static weapon-def/enchantment `onHit` rider, not on the slice-76 `temporaryBuff` (consumable) shape. A future slice would add a `save` slot to `temporaryBuff`.

RAW deviation: the Paralyzed condition's "until the end of its next turn" duration is consumer-managed (the planner emits `ConditionApplied` without `expiresOnRound`), mirroring the slice-286 `Save` UseAction.

Uncle Bob audit: **Names** — `save` / `conditionOnFail` reuse the slice-286 `Save` UseAction field names; `rollSaveAgainstDC` says what it does. **DRY** — extracted the save-roll shape into one helper instead of adding a 4th inline copy; the rider condition-gate reuses the slice-318 `.filter`. **SRP** — schema, helper, and planner save-emission each live in their own layer; the helper does one thing (roll a fixed-DC save). **Magic numbers** — none new (DC 10 / CON / Paralyzed are RAW-cited on the content item). **at-threading** — the save rolls in the planner, baked into `SaveRolled`; `apply` stays RNG-free. **Mechanical outcomes asserted** — a hit vs a humanoid emits a CON DC 10 `SaveRolled` + base slashing damage; a failed save applies Paralyzed sourced by the attacker; a hit vs an Undead or an elf emits no `SaveRolled` (gate filters the rider) but still deals slashing. **Tests** — 4 new ([tests/unit/engine/slice-319-onhit-save.test.ts](../../tests/unit/engine/slice-319-onhit-save.test.ts)); full suite green (1933 passed), tsc clean. Coverage snapshot unchanged (ghoul-claws has no mastery, isn't a magic item). Docs: gaps Items (weapons 47 → 48; on-hit-save mechanism marked landed).

**Engine + content: target-gated on-hit weapon riders (slice 318)**

Builds on the slice-316/317 `onHit` rider mechanism: a rider can now carry an optional `condition` predicate, evaluated against target facts at hit time, so it only fires against a matching target. This unblocks the conditional weapon riders (vs Undead / Fiend / etc.) that were deferred when the rider mechanism first landed.

Engine:
- The `onHit` rider schema (shared by `WeaponSchema`/`MagicItemSchema`) gains `condition?: Predicate`.
- The attack planner builds a rider-facts map carrying `target.creatureType` (via the existing `getCreatureType`) and filters the rider list: a rider with a `condition` only rolls when the predicate passes; unconditional riders (Thunderous Greatclub) always fire.

Content (canonical users): **Sun Blade** gains its RAW +1d8 radiant vs Undead rider (`eq target.creatureType = Undead`). **Mace of Disruption** is modeled as `itemKind: 'weapon'` (Mace base) with +2d6 radiant vs Fiend or Undead (an `any` predicate over `target.creatureType`). Still deferred: ranged-gated riders (Dwarven Thrower vs Giants), on-hit save riders (Mace of Disruption's destroy/Frighten, Dagger of Venom's poison), and crit-only riders (Mace of Smiting).

Uncle Bob audit: **Names** — reused `condition` (the field name used by every other predicate-gated effect). **DRY** — reused the existing `evaluatePredicate` + `getCreatureType`; the rider filter is one `.filter` ahead of the existing `.map`. **SRP** — the rider condition is evaluated at the one rider-assembly site. **Magic numbers** — none (dice + types RAW-cited). **at-threading** — riders still roll in the planner, baked into `DamageRolled`. **Mechanical outcomes asserted** — Sun Blade emits 2 radiant components vs an Undead but 1 vs a Humanoid; Mace of Disruption emits radiant vs a Fiend but only bludgeoning vs a Humanoid. **Tests** — 4 new ([tests/unit/engine/slice-318-conditional-riders.test.ts](../../tests/unit/engine/slice-318-conditional-riders.test.ts)); full suite green (1928 passed), tsc clean. Coverage snapshot gained mace-of-disruption (now a weapon). Docs: gaps Items (weapons 46 → 47, magic 259 → 258).

**Engine + content: magic-equipment modeling, stage 3 — multi-base enchantment overlay (slice 317)**

Final stage: the multi-base magic equipment whose base is chosen at creation (Frost Brand = any of 6 weapons, "+1 weapon" = any weapon, "+1 armor" = any armor) — which can't ship as a single `itemKind: 'weapon'/'armor'` definition the way stage 1/2's single-base items did. Modeled as an **enchantment overlay**: the magic item stays `itemKind: 'magic'` (the enchantment) and a base weapon/armor instance references it via the new `ItemInstance.enchantmentDefinitionId`, parallel to how `temporaryBuff` already overlays the attack planner.

Engine:
- `ItemInstance` gains `enchantmentDefinitionId`. `MagicItemSchema` gains the magic-equipment fields (`attackBonus`/`damageBonus`/`onHit`/`acBonus`/`weaponDamageType`), now shared with `WeaponSchema`/`ArmorSchema` via extracted `weaponEnhancementFields` / `armorEnhancementFields` fragments (the stage 1/2 inline fields were refactored onto these).
- New `resolveEnchantment(instance, content)` helper. The overlay is read by: `computeAttackBonus` (+`attackBonus`), the attack planner (+`damageBonus`, `onHit` riders, `weaponDamageType` override on the main component), the AC derive (+`acBonus` on body armor + shields), `collectItemEffects` (projects the enchantment's `effects`, gated on the enchantment's own attunement), and `isMagicWeaponAttack` (an enchanted base counts as magical).

Content (canonical-user enchantments, stay `itemKind: 'magic'`): Frost Brand (`onHit` +1d6 cold + the slice-312 fire resistance); the generic Weapon +1/+2/+3 (`attackBonus`/`damageBonus`) and Armor +1/+2/+3 (`acBonus`). The base is consumer-chosen via `enchantmentDefinitionId`, so these aren't single pre-wired pack items — they're the mechanism plus its drivers.

Uncle Bob audit: **Names** — `enchantmentDefinitionId` / `resolveEnchantment` say what they are; the `*EnhancementFields` fragments name the shared shapes. **DRY** — the magic-field shapes are now defined once and spread into Weapon/Armor/MagicItem; the onHit roll reuses slice-316's `rollExtraDamageDice`; `resolveEnchantment` is the single overlay-resolution point used by all five consumers. **SRP** — each consumer reads the overlay in its own layer; resolution is centralized. **Magic numbers** — none new (the +N / 1d6 are RAW-cited per enchantment). **at-threading** — onHit riders roll in the planner, baked into `DamageRolled` (apply RNG-free). **Mechanical outcomes asserted** — a +2 weapon enchantment on a longsword adds +2 attack; an enchanted base counts as magical (plain doesn't); a real Frost Brand longsword hit emits a cold component + projects fire resistance; a +1 armor enchantment on plate yields AC 19. **Tests** — 5 new ([tests/unit/engine/slice-317-enchantment-overlay.test.ts](../../tests/unit/engine/slice-317-enchantment-overlay.test.ts)); full suite green (1925 passed), tsc clean, coverage snapshot unchanged (enchantments stay `itemKind: magic`). Docs: gaps Items + api-overview enchantment-overlay notes.

This completes the magic-equipment modeling arc (stages 1-3, slices 315-317): single-base armor, single-base weapons, and multi-base enchantments are all now real equipment.

**Engine + content: magic-equipment modeling, stage 2 — magic weapons (slice 316)**

Second half of the magic-equipment modeling (stage 1 was magic armor, slice 315). Magic weapons were `itemKind: 'magic'`, so the attack planner (which requires `itemKind === 'weapon'`) couldn't wield them — they were decorative catalog entries with no link to an attack. This slice models single-base magic weapons as `itemKind: 'weapon'`, which also lands the on-hit elemental rider primitive (the original goal that kicked off this whole thread).

Engine:
- `WeaponSchema` gains optional magic fields: `rarity`, `requiresAttunement`, `attunementCondition`, `attackBonus`, `damageBonus`, `onHit` (a list of per-hit `{ dice, damageType }` riders), `effects`.
- `computeAttackBonus` adds the intrinsic `attackBonus` (Sun Blade +2) alongside the existing temporaryBuff path.
- The attack planner adds `damageBonus` to the damage modifier and rolls each `onHit` rider fresh on a hit (crit-doubling the dice, baked into the `DamageRolled` event so replay stays RNG-free) — generalized from the slice-90 temporaryBuff rider via a shared `rollExtraDamageDice` helper.
- `collectItemEffects` broadened to project `weapon` effects (and to walk the `equipped.mainHand` / `offHand` slots), so a magic weapon's passive effect (Thunderous Greatclub's STR-20 floor) reaches the wielder.
- `isMagicWeaponAttack` gains a branch: a weapon with a `rarity` counts as magical (resistance bypass).
- srd-drift rarity/attunement checks broadened to `itemKind: 'weapon'`.

Content (7 conversions, `magic` → `weapon`): Sun Blade (Longsword→Radiant, +2), Dwarven Thrower (Warhammer, +3), Dagger of Venom (Dagger, +1), Scimitar of Speed (Scimitar, +2), Mace of Smiting (Mace, +1), **Thunderous Greatclub** (Greatclub; the canonical `onHit` rider user — +1d8 thunder on every hit — plus a STR-20 floor effect), Quarterstaff of the Acrobat (Quarterstaff, +2, retaining its slice-312 Acrobatics advantage). Conditional riders (vs Undead/Giants/Constructs), charged/reaction arms, and multi-base magic weapons (Frost Brand, Flame Tongue, "Weapon +N", etc.) stay deferred.

Uncle Bob audit: **Names** — `attackBonus`/`damageBonus`/`onHit` parallel the existing weapon-buff fields; `rollExtraDamageDice` names the extracted shared roller. **DRY** — `buildBuffExtraDamageRoll` and the new `onHit` path both call the one `rollExtraDamageDice`; the projection/audit/magicality changes mirror the slice-315 armor shapes. **SRP** — schema, attack-bonus derive, damage assembly, effect projection, magicality, audit each changed in their own layer. **Magic numbers** — base weapon dice/properties/masteries copied from the SRD base weapon; the +N values RAW-cited per item. **at-threading** — the onHit riders roll in the planner and bake into `DamageRolled` (apply stays RNG-free). **Mechanical outcomes asserted** — Sun Blade +2 attack-bonus delta + breakdown source; a real Thunderous Greatclub hit emits a thunder damage component; STR-20 floor + Acrobatics advantage project from the held weapon; a magic weapon counts as magical (mundane does not). **Tests** — 5 new ([tests/unit/engine/slice-316-magic-weapons.test.ts](../../tests/unit/engine/slice-316-magic-weapons.test.ts)); full suite green (1918 passed), tsc clean. Coverage snapshot: the 7 weapons left the magic-item catalog and now appear in the weapon-mastery catalog. Docs: gaps Items breakdown (weapons 39 → 46, magic 266 → 259), api-overview WeaponSchema note.

**Engine + content: magic-equipment modeling, stage 1 — magic armor (slice 315)**

First half of making magic equipment behave as equipment, not just effect-projectors. Magic armor and shields were `itemKind: 'magic'`, so the AC derive (which keys on `itemKind === 'armor'`) didn't recognize them — even a Spellguard / Sentinel Shield granted no AC. This slice models single-base magic armor as `itemKind: 'armor'`.

Engine:
- `ArmorSchema` gains optional magic fields: `rarity`, `requiresAttunement`, `attunementCondition`, `acBonus`, `effects` (the rarity enum extracted to a shared `MagicRaritySchema`, reused by `MagicItemSchema`). A single-base magic armor now ships as `itemKind: 'armor'` with its base stats + these fields.
- `computeAC` adds `acBonus` to both the body-armor and shield branches (Dragon Scale Mail +1, etc.).
- `collectItemEffects` (slice-132 projection) broadened to also project an armor's `effects` under the same equipped/attuned rule, and to walk the `equipped.armor` / `equipped.shield` slots. So a magic shield's `GrantMagicResistance` / a magic armor's resistance reaches the wearer's effect stack when worn + attuned.
- srd-drift audit's rarity + attunement checks broadened to `itemKind: 'armor'` so the converted items stay drift-checked against SRD (mundane armor has no SRD magic-item entry, so it's skipped).

Content (9 conversions, `magic` → `armor`):
- Body armor: Glamoured Studded Leather (Studded Leather, +1 AC), Dragon Scale Mail (Scale Mail, +1 AC), Armor of Invulnerability (Plate, + the slice-307 B/P/S resistance now projecting from worn armor).
- Shields (base Shield, +2 AC): Sentinel (+ init/perception advantage), Spellguard (+ Magic Resistance), Animated, Arrow-Catching, Shield of Missile Attraction, Shield of the Cavalier — all now grant their shield AC; their charged / conditional / cursed arms stay deferred.

Multi-base magic armor (Dwarven Plate, Elven Chain, Mithral, Adamantine, Demon Armor) stays `itemKind: 'magic'` (deferred): no single base AC; needs a magic-property-applied-to-a-chosen-base model. Stage 2 (next slice) does the weapon side.

Uncle Bob audit: **Names** — `acBonus` parallels `baseAC`; `MagicRaritySchema` extracted to remove the duplicated inline rarity enum. **DRY** — the rarity enum is now shared between `MagicItemSchema` and `ArmorSchema` (and the future `WeaponSchema`); effect projection reused the existing `fold` rather than a parallel path. **SRP** — schema fields, AC fold, effect projection, audit each changed in their own layer. **Magic numbers** — base AC values (12 / 14 / 18 / 2) are the SRD base-armor values, cited per item. **at-threading** — n/a (derivation-only). **Mechanical outcomes asserted** — Glamoured Studded Leather AC 15 (12+DEX+1), Dragon Scale Mail 17 (14+cap2+1), Armor of Invulnerability 18 (plate, no DEX); Spellguard Shield +2 AC delta; effects project when worn+attuned (Spellguard magic resistance, Armor of Invulnerability B/P/S resistance, Sentinel init/perception advantage). **Tests** — 7 new ([tests/unit/engine/slice-315-magic-armor.test.ts](../../tests/unit/engine/slice-315-magic-armor.test.ts)); the slice-307/311/312 effect-projection tests still pass unchanged (attuned projection covers armor). Coverage snapshot dropped the 3 converted wired items from the magic-item catalog (now armor). Full suite green (1914 passed), tsc clean. Docs: gaps Items breakdown (armor 13 → 22, magic 275 → 266), api-overview ArmorSchema note.
