# CHANGELOG archive: slices 472-481 (post-alpha.15 iconic-encounter sweep)

Per-slice detail for slices 472-481, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 487 to keep it under the 60 KB single-Read ceiling. Cohort: the post-alpha.15 iconic-encounter content sweep, picking up where [archive-slices-460-468.md](archive-slices-460-468.md) leaves off (slices 469-471 are part of the alpha.15 release narrative inline in the live CHANGELOG, soon to be evicted with the next release). Highlights:
- Slice 472: Scout Multiattack - opens the low-CR encounter sweep.
- Slice 473: Cultist Ritual Sickle natural weapon.
- Slice 474: Spy poison-coated weapons (Shortsword + Hand Crossbow).
- Slice 475: Cunning Action - closes the Spy statblock + wires the Rogue L2 feature.
- Slice 476: Pack Tactics sweep (Hobgoblin Warrior + Tough + Warrior Infantry).
- Slice 477: iconic L1-dungeon beast bites (Giant Spider + Giant Centipede).
- Slice 478: Hippogriff Multiattack.
- Slice 479: Brown Bear Multiattack (Bite + Claw).
- Slice 480: Black Bear Multiattack.
- Slice 481: Pirate Multiattack.

Slices 482-487 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + consumeOnIncomingAttack, Magic Initiate Druid, once-per-long-rest free-cast tracker, non-spellcaster Magic Initiate cast) stay in the live CHANGELOG as the most-recent cohort.

---

**Content (slice 481): Pirate Multiattack (two Daggers)**

Sixth user of the slice-464 `MonsterMultiattack` content field. RAW (SRD 5.2.1 Pirate, CR 1): "Multiattack. The pirate makes two Dagger attacks. It can replace one attack with a use of Enthralling Panache." The Pirate uses the existing pack `dagger`, so the slice is statblock-only - no new weapon needed.

- Pirate statblock gains `multiattack: { name: 'Pirate Multiattack', attacks: [{ weaponId: 'dagger', count: 2 }] }`.

**Deferred** (per the slice-464 follow-up family for Dragon-style "X attacks OR a Spellcasting" Multiattacks): the "replace one attack with Enthralling Panache" arm. Enthralling Panache itself (WIS save vs DC 12, Charmed on fail, ranged 30 ft) needs a stand-alone forced-save planner and stays deferred.

**Tests** at [tests/unit/engine/slice-481-pirate-multiattack.test.ts](../../tests/unit/engine/slice-481-pirate-multiattack.test.ts) - 2 cases: statblock pattern; 2 AttackRolled events via `engine.plan.multiattack`.

**Content (slice 480): Black Bear Multiattack (two Rends)**

Fifth user of the slice-464 `MonsterMultiattack` content field. RAW (SRD 5.2.1 Black Bear, CR 1/2): "Multiattack. The bear makes two Rend attacks. Rend: 1d6 slashing." Same single-weapon two-swing shape as Hippogriff Multiattack (slice 478).

- New `black-bear-rend` natural weapon (1d6 slashing, no rider).
- Black Bear statblock gains `multiattack: { name: 'Black Bear Multiattack', attacks: [{ weaponId: 'black-bear-rend', count: 2 }] }`.

**Doc-count update**: weapons 68 -> 69, items 531 -> 532.

**Tests** at [tests/unit/engine/slice-480-black-bear-multiattack.test.ts](../../tests/unit/engine/slice-480-black-bear-multiattack.test.ts) - 3 cases: weapon shape; statblock pattern; 2 AttackRolled events.

**Content (slice 479): Brown Bear Multiattack (one Bite + one Claw)**

Fourth user of the slice-464 `MonsterMultiattack` content field. RAW (SRD 5.2.1 Brown Bear, CR 1): "Multiattack. The bear makes one Bite attack and one Claw attack." Bite: 1d8 piercing. Claw: 1d4+3 slashing + Prone if Large or smaller (the `brown-bear-claw` was wired in slice 454).

Closes the deferred follow-up from slice 454 + slice 464 ("Brown Bear Multiattack: blocked on the Brown Bear Bite natural weapon not yet existing in the pack").

- New `brown-bear-bite` natural weapon (1d8 piercing, no rider).
- Brown Bear statblock gains `multiattack: { name: 'Brown Bear Multiattack', attacks: [{ weaponId: 'brown-bear-bite', count: 1 }, { weaponId: 'brown-bear-claw', count: 1 }] }`.

The slice-454 description on `brown-bear-claw` updated to point at this slice's bite + multiattack wiring.

**Doc-count update**: weapons 67 -> 68, total items 530 -> 531.

**Tests** at [tests/unit/engine/slice-479-brown-bear-multiattack.test.ts](../../tests/unit/engine/slice-479-brown-bear-multiattack.test.ts) - 3 cases: bite shape; statblock pattern; end-to-end `engine.plan.multiattack` emits 2 `AttackRolled` events with the two distinct weapon instances.

**Content (slice 478): Hippogriff Multiattack - third monster-Multiattack user**

Third user of the slice-464 `MonsterMultiattack` content field after Ghoul (slice 464) and Scout (slice 472). RAW (SRD 5.2.1 Hippogriff, CR 1): "Multiattack. The hippogriff makes two Rend attacks. Rend. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Slashing damage."

Two-step content slice:
- New `hippogriff-rend` natural weapon (1d8 slashing, no rider). The +3 damage / +5 attack come from the wielder's STR + PB, not the weapon.
- Hippogriff statblock declares `multiattack: { name: 'Hippogriff Multiattack', attacks: [{ weaponId: 'hippogriff-rend', count: 2 }] }`.

**Doc-count update**: weapons 66 -> 67, total items 529 -> 530.

**Tests** at [tests/unit/engine/slice-478-hippogriff-multiattack.test.ts](../../tests/unit/engine/slice-478-hippogriff-multiattack.test.ts) - 3 cases: weapon shape; statblock pattern; end-to-end `engine.plan.multiattack` emits exactly 2 `AttackRolled` events both targeting the same Rend instance (RAW: "two Rend attacks," same weapon).

**Audit (content slice):** RAW match exact. DRY: same multiattack-declaration pattern as Ghoul/Scout, same plain-natural-weapon pattern as Wolf Bite. Mechanical outcomes asserted: pattern shape on both pack entries; 2-AttackRolled event chain.

**Open follow-up:** Hippogriff Flyby (no Opportunity Attack provoked when flying out of an enemy's reach) - needs a new "movement-modality-gated OA suppression" primitive. Sibling to the Mobile feat's no-OA-vs-attacked-target arm but movement-mode-keyed. *Still open.*

**Content (slice 477): iconic L1-dungeon beast bites - Giant Spider + Giant Centipede**

Sixth content slice in the L1-encounter sweep, pivoting from humanoids to beasts. Both bites are pure content using existing primitives.

RAW (SRD 5.2.1):
- **Giant Spider (CR 1) Bite**: "Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage plus 7 (2d6) Poison damage."
- **Giant Centipede (CR 1/4) Bite**: "Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage, and the target has the Poisoned condition until the start of the centipede's next turn."

Two new pack items ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):

- `giant-spider-bite`: 1d8 piercing primary + slice-316 unconditional onHit `2d6 poison` rider (same shape as `spy-shortsword`).
- `giant-centipede-bite`: 1d4 piercing primary + slice-321 unconditional `applyConditionId: 'poisoned'` rider (same shape as `couatl-bite`).

The +3 damage / +5 attack (spider) and +2 damage / +4 attack (centipede) come from the wielder's STR/DEX + PB, not the weapons. Climb 30 ft speeds were already in the pack for both. The "until start of the centipede's next turn" Poisoned duration is consumer-managed (slice-286 mirror, same as Couatl).

**Doc-count update**: weapons 64 -> 66 in [docs/getting-started.md](../../docs/getting-started.md) (items-by-kind line) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) (Items row); 527 -> 529 total items in starter-pack-gaps.

**Tests** at [tests/unit/engine/slice-477-iconic-beast-bites.test.ts](../../tests/unit/engine/slice-477-iconic-beast-bites.test.ts) - 4 cases: pack shape for both bites; Giant Spider hit emits piercing + poison; Giant Centipede hit emits ConditionApplied(poisoned).

**Audit (content slice):**
- *RAW match*: both bites exactly per SRD. Climb speeds preserved.
- *DRY*: same onHit rider shapes as the slice-316 damage rider (Ghoul Bite / Spy weapons) and slice-321 condition rider (Couatl Bite). No new primitive.
- *Mechanical outcomes asserted*: pack shape; hit paths emit the expected riders.

**Deferred (need new primitives, listed for the next slices):**
- **Giant Spider Web Walker**: needs an immunity to "Restrained from webs" specifically (distinct from Restrained from any source). A new gating predicate on movement-restriction sources. *Still open.*
- ~~**Boar Bloodied Fury** (Advantage on attacks while HP <= max/2): needs a `bearer.bloodied` predicate fact.~~ **Closed by slice 483.**
- **Boar Gore movement-conditional rider** (extra damage + Prone if moved 20+ ft straight at the target): needs a movement-direction fact and a "moved straight N feet" tracker; bigger shape, deferred. *Still open.*
- **Stirge Blood Drain attach** (attaches on hit, drains HP each turn while attached): needs a stateful attached-condition + periodic damage primitive; bigger. *Still open.*

**Content (slice 476): Pack Tactics sweep - Hobgoblin Warrior + Tough + Warrior Infantry**

Fifth content slice in the L1-encounter low-CR sweep. The 2024 SRD Pack Tactics list includes three CR <= 0.5 humanoid pack-fighters whose pack entries shipped with `traits: []`:
- **Hobgoblin Warrior (CR 1/2)** - RAW: "Pack Tactics. The hobgoblin has Advantage on an attack roll against a creature if at least one of the hobgoblin's allies is within 5 feet of the creature and the ally doesn't have the Incapacitated condition."
- **Tough (CR 1/2)** - same text scoped to "the tough"
- **Warrior Infantry (CR 1/8)** - same text scoped to "the warrior"

Pure content slice. Each statblock gains the same `SetAdvantage on:'attack' mode:'advantage'` trait gated on the slice-445 `event.attackerHasAllyAdjacentToTarget` consumer-coordinated fact - identical shape to the already-wired wolf / dire-wolf / giant-rat / kobold-warrior. No engine work.

**Tests** at [tests/unit/engine/slice-476-pack-tactics-sweep.test.ts](../../tests/unit/engine/slice-476-pack-tactics-sweep.test.ts) - 9 cases (3 per monster x 3 monsters via `it.each`): (1) the Pack Tactics trait is present on the statblock; (2) attacks with `attackerHasAllyAdjacentToTarget: true` roll with Advantage; (3) attacks without the fact roll normally.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Pack Tactics text matches verbatim across all three. The pack-derived `not Incapacitated` arm is the consumer's responsibility (the predicate is opaque to the engine), same as the existing wired Pack Tactics users.
- *Names*: trait shape mirrors the slice-445 wolf / kobold-warrior wires exactly.
- *DRY*: identical `SetAdvantage` shape across all three statblocks; same shape as the four already-wired Pack Tactics users.
- *Mechanical outcomes asserted*: trait presence; advantage applies with the fact; no advantage without it.

**Open follow-ups (per the broader sweep):**
- ~~**Worg Bite "next attack vs target gets advantage" rider** (RAW: "the next attack roll made against the target before the start of the worg's next turn has Advantage"): novel primitive. The Worg in 2024 SRD does NOT have Pack Tactics - the trait was replaced with this stronger, more positional shape. Needs an onHit-applied-condition that grants advantage to attackers, plus an "until end of source's next turn" lifetime.~~ **Closed by slice 484.**
- **Iconic beast/monstrosity traits**: Giant Spider's Spider Climb + Web Walker + Web (action), Stirge's Blood Drain attach, Giant Centipede's poison rider, Cockatrice's petrifying bite, Bugbear's Brute. Each is a small content (or content + small-primitive) slice. *Still open.*

**Engine + content (slice 475): Cunning Action - closes the Spy statblock + wires the Rogue L2 feature**

Fourth and final L1-encounter content slice in the low-CR sweep. RAW (SRD 5.2.1):
- Rogue L2: "You can take the Dash, Disengage, or Hide action as a Bonus Action."
- Spy (CR 1): "Cunning Action. The spy takes the Dash, Disengage, or Hide action [as a Bonus Action]."

Pre-slice, both Rogue L2 `cunning-action` and the Spy statblock shipped with empty effects / traits — the mechanic was unimplemented. This slice ships a new planner that handles both paths via a dual eligibility gate.

**New planner** [planCunningAction](../../src/engine/plan/cunning-action.ts) ships as `engine.plan.cunningAction({ actorId, mode, dc? })`. Three modes: `'dash'` / `'disengage'` / `'hide'`. Mirrors the slice-455 `planNimbleEscape` body with the addition of a Dash mode. Eligibility gate accepts EITHER:
- A Rogue L2+ character (any character whose `classes` includes `{ classId: 'rogue', level: >= 2 }`), OR
- A monster whose `statblockId` is on the `CUNNING_ACTION_STATBLOCKS` allowlist (currently `{'spy'}`; add ids here when a new monster carries Cunning Action).

Same active-encounter + active-combatant + bonus-action-available + mode-specific-already-spent validation as Nimble Escape. Emits `ActionEconomyConsumed(bonusAction)` + the mode-specific event (`Dashed` / `Disengaged` for the movement modes; `AbilityCheckRolled` + optional `ConditionApplied(invisible)` on a successful Hide check).

**Wired across the 4 standard sites** (plan/index.ts export, engine/index.ts import + intent type + Engine.plan method + impl, conveniences.ts `performIntent` dispatch). The slice-364 planner-wiring audit is green.

**Content wires**:
- Rogue L2 `cunning-action` feature: `effects: []` -> `effects: [{ kind: 'Custom', handlerId: 'cunning-action' }]`. The handlerId string is referenced via the `'./cunning-action.js'` import path in [src/engine/plan/index.ts](../../src/engine/plan/index.ts), so the slice-303 pack-integrity audit recognizes it as backed (same mechanism that satisfies `nimble-escape`).
- Spy statblock: `traits` field added carrying the same Custom marker.

**Tests** at [tests/unit/engine/slice-475-cunning-action.test.ts](../../tests/unit/engine/slice-475-cunning-action.test.ts) - 12 cases: Spy paths (Dash / Disengage / Hide success / Hide failure); Rogue L2+ paths (L2 succeeds, L5 succeeds, L1 rejected); rejection paths (Fighter no Cunning Action, out-of-encounter, double bonus-action use); content wires (Spy traits + Rogue L2 feature effects).

**Coverage snapshot updated** intentionally for `rogue L2 cunning-action` (now wired).

**Audit (engine + content slice):**
- *RAW match*: Rogue L2 Cunning Action + Spy Cunning Action exactly. Three modes match RAW's "Dash, Disengage, or Hide". Bonus-action consumption + active-combatant gate match the existing slice-455 / slice-294 (planDash) shape.
- *Names*: `planCunningAction` / `CunningActionIntent` / `CunningActionMode` mirror the `planNimbleEscape` family. The handlerId string `cunning-action` matches the feature id used in the pack.
- *DRY*: planner body is structurally identical to `planNimbleEscape` with one extra mode (dash) and a different eligibility predicate. Considered factoring a shared `applyBonusActionMovement(mode, ...)` helper but declined: two callers, ~15 lines of shared shape, below the abstraction threshold.
- *SRP*: planner validates eligibility + emits events; reducers already handle Dashed / Disengaged / ConditionApplied; the feature trait is just the discoverable surface.
- *Magic numbers*: `CUNNING_ACTION_MIN_CLASS_LEVEL = 2` + `HIDE_DEFAULT_DC = 15` extracted as named constants (the DC default mirrors planHide).
- *Mechanical outcomes asserted*: all three modes emit the expected event chain; the Rogue gate (L2 ok, L1 reject); the statblock gate (Spy ok, Fighter reject); out-of-encounter + double-bonus-action rejection; pack content wires.

**Closes the Spy statblock's RAW gap entirely.** The Spy now ships full 2024 SRD behavior: ability scores + skills + senses + poison-rider weapons (slice 474) + Cunning Action (slice 475).

**Closes the Rogue L2 Cunning Action gap.** Pre-slice, a Rogue character couldn't actually take Dash / Disengage / Hide as a Bonus Action; the feature was descriptive only. Now `engine.plan.cunningAction(...)` works for any Rogue L2+ character.

**Closes the low-CR humanoid encounter sweep.** Bandit, Skeleton, Cultist, Guard are RAW-correct as-is (per the 2024 SRD simplification). Scout has Multiattack (slice 472). Cultist has Ritual Sickle (slice 473). Spy has poison weapons (slice 474) + Cunning Action (slice 475). The four canonical "first encounter" L1 foes are now mechanically complete.

**Content (slice 474): Spy poison-coated weapons (Shortsword + Hand Crossbow) - low-CR encounter sweep**

Third L1-encounter content slice in the low-CR sweep. RAW (SRD 5.2.1 Spy, CR 1):

- "Shortsword. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Piercing damage plus 7 (2d6) Poison damage."
- "Hand Crossbow. Ranged Attack Roll: +4, range 30/120 ft. Hit: 5 (1d6 + 2) Piercing damage plus 7 (2d6) Poison damage."

Two new pack items ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):

- `spy-shortsword`: martial melee, 1d6 piercing, `finesse` + `light`, Vex mastery, plus a slice-316 unconditional onHit `2d6 poison` rider.
- `spy-hand-crossbow`: martial ranged, 1d6 piercing, `ammunition` + `light` + `loading`, Vex mastery, 30/120 ft range, plus the same `2d6 poison` rider.

Same rider shape as Ghoul Bite's `1d6 necrotic` (slice 462) and Wyvern's Sting / Ettercap's Bite / Merrow's Bite (slice 322). Distinct from the generic `shortsword` and `crossbow-hand` items so adventurer-wielded versions don't inherit the poison rider. The +2 damage / +4 attack come from the wielder's DEX + PB, not the weapon.

**Doc-count update**: weapons 62 -> 64 in [docs/getting-started.md](../../docs/getting-started.md) (items-by-kind line) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) (Items row); 525 -> 527 total items in starter-pack-gaps.

**Tests** at [tests/unit/engine/slice-474-spy-poison-weapons.test.ts](../../tests/unit/engine/slice-474-spy-poison-weapons.test.ts) - 5 cases: pack declares the right shape for both weapons; spy-shortsword hits emit piercing + poison with the poison total in the 2d6 range (or 4d6 on a crit); spy-hand-crossbow hits emit piercing + poison; generic shortsword / crossbow-hand still carry no onHit rider.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Spy weapons exactly. Both weapons keep their base type's properties + mastery; poison is purely a rider.
- *Names*: `spy-shortsword` / `spy-hand-crossbow` mirror the slice-462 `ghoul-bite` / `ghoul-claws` naming convention for natural-weapon variants.
- *DRY*: identical onHit shape on both weapons (the rider is the same per RAW). No new primitive.
- *Mechanical outcomes asserted*: pack shape on both weapons; both hit paths emit the poison rider; generic versions untouched.

**Closes most of the Spy statblock's RAW gap.** Only Cunning Action (Bonus Action: Dash / Disengage / Hide) remains - the same Rogue L2 feature applied to a non-Rogue creature, which needs a Custom-marker feature trait the engine routes to the existing Cunning Action mechanic.

**Open follow-ups:**
- **Spy Cunning Action** (RAW: "The spy takes the Dash, Disengage, or Hide action."): closes the Spy statblock. The Rogue L2 Cunning Action mechanic is already wired; this needs a way to extend it to non-Rogue creatures via a content marker. *Still open.*

**Content (slice 473): Cultist Ritual Sickle natural weapon (low-CR encounter sweep)**

Second L1-encounter content slice in the low-CR sweep. RAW (SRD 5.2.1 Cultist, CR 1/8): "Ritual Sickle. Melee Attack Roll: +3, reach 5 ft. Hit: 3 (1d4 + 1) Slashing damage plus 1 Necrotic damage."

New `ritual-sickle` item ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): regular sickle base (1d4 slashing, `light`, Nick mastery) plus a slice-316 unconditional onHit flat-1 necrotic rider via the `0d6+1` flat-damage shape (the same shape Mace of Smiting / Sword of Life Stealing / Sprite Enchanting Bow use for fixed-amount riders). Distinct from the generic `sickle` so adventurer-wielded sickles don't inherit the necrotic rider. The +1 damage / +3 attack come from the wielder's DEX + PB, not the weapon.

**Doc-count update**: weapons 61 -> 62 in [docs/getting-started.md](../../docs/getting-started.md) (items-by-kind line) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) (Items row); 524 -> 525 total items in starter-pack-gaps.

**Tests** at [tests/unit/engine/slice-473-ritual-sickle.test.ts](../../tests/unit/engine/slice-473-ritual-sickle.test.ts) - 3 cases: pack declares the right damage / properties / onHit rider; on a non-critical hit the DamageRolled carries slashing primary + exactly 1 necrotic; the generic `sickle` is unaffected (still has no onHit rider).

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Cultist Ritual Sickle exactly. The 1d4+1 slashing comes from sickle damage + wielder ability mod (DEX), the +3 attack comes from DEX + PB, the flat 1 necrotic is the rider.
- *DRY*: reuses the slice-316 unconditional onHit rider shape (same as Ghoul Bite, slice 462) with the slice-324 `0d6+N` flat-damage convention. No new primitive.
- *SRP*: weapon definition declares; existing attack planner consumes; rider fires on every hit.
- *Mechanical outcomes asserted*: pack shape; on-hit emits both damage components; generic sickle untouched.

**Closes the Cultist statblock's RAW gap** (only the Ritual Sickle was missing; the cultist's skills / WIS save proficiency / no-multiattack / no-trait shape were already correct in the pack).

**Open follow-ups (from slice 472):**
- **Spy poison weapons** (RAW: Shortsword + Hand Crossbow each deal +2d6 poison damage on hit): two new pack items (`spy-shortsword` + `spy-hand-crossbow`) following the same onHit-rider pattern. *Still open.*
- **Spy Cunning Action** (RAW: takes Dash, Disengage, or Hide as a Bonus Action): needs the Rogue L2 Cunning Action mechanic to apply to non-Rogue creatures via a feature marker. *Still open.*

**Content (slice 472): Scout Multiattack - second monster-Multiattack content user (opens the low-CR encounter sweep)**

Slice 464 shipped the `MonsterMultiattack` content field with Ghoul (two Bites) as the canonical user. This slice opens the next-arc encounter sweep with the second user: Scout (CR 1/2). RAW (SRD 5.2.1 Scout): "Multiattack. The scout makes two attacks, using Shortsword and Longbow in any combination."

Pure-content slice. Both `shortsword` and `longbow` are existing pack items, so no engine work or new weapons needed. Wired as:

```json
"multiattack": {
  "name": "Scout Multiattack",
  "attacks": [
    { "weaponId": "shortsword", "count": 1 },
    { "weaponId": "longbow", "count": 1 }
  ]
}
```

The schema declares a concrete pattern; "any combination" maps to the canonical mixed-loadout interpretation (1 melee + 1 ranged). A consumer who wants pure shortsword or pure longbow builds the runtime pattern directly instead of via `runtimeMultiattackFromStatblock`. The slice-392 state-threading already runs across both swings, so a prone-on-first-bite (no rider on these weapons today, but the pattern composes) would apply to the second swing's resolution.

**Pre-survey of the CR <= 1 cohort against the SRD multiattack list**: most "empty traits" low-CR monsters in the pack are RAW-correct as-is — the 2024 SRD simplified Bandit / Skeleton / Cultist / Guard / Spy to single-attack actions. Of the CR <= 1 humanoid/undead combatants the engine ships, only **Scout** has Multiattack RAW (the "Bandit makes two attacks" line lives on the CR 2 Bandit Captain). The bigger CR <= 1 trait gaps are unique-weapon riders (Cultist Ritual Sickle's +1 necrotic, Spy's +2d6 poison on Shortsword + Hand Crossbow) and the Spy's Cunning Action bonus-action — separate small slices to follow.

**Tests** at [tests/unit/engine/slice-472-scout-multiattack.test.ts](../../tests/unit/engine/slice-472-scout-multiattack.test.ts) — 3 cases: Scout statblock declares the expected pattern; `runtimeMultiattackFromStatblock` produces a 2-attack runtime pattern with two distinct weapon instances; end-to-end `engine.plan.multiattack` emits exactly 2 `AttackRolled` events that target the two different weapon instances.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Scout Multiattack exactly, mapping the "any combination" RAW to the canonical mixed loadout. Pure shortsword / pure longbow are still reachable by building the runtime pattern directly.
- *Names*: choice of mixed loadout matches the most-distinctive Scout encounter (the scout draws back as the party closes — bow at range, shortsword in melee).
- *DRY*: no helper changes; same slice-464 primitive consuming an existing weapon-id pair.
- *Mechanical outcomes asserted*: pattern shape on the pack; runtime helper output; two distinct AttackRolled events with the right weaponInstanceIds.

**Open follow-ups:**
- **Cultist Ritual Sickle** (RAW: "Hit: 3 (1d4 + 1) Slashing damage plus 1 Necrotic damage"): needs a new `ritual-sickle` weapon (sickle base + flat necrotic onHit rider). Tiny content slice; the onHit primitive (slice 316) already supports flat-damage riders. *Still open.*
- **Spy poison weapons** (RAW: Shortsword + Hand Crossbow each deal +2d6 poison damage on hit): two new pack items (`spy-shortsword` + `spy-hand-crossbow`) following the slice-322 poison-natural-weapon pattern. *Still open.*
- **Spy Cunning Action** (RAW: takes the Dash, Disengage, or Hide action as a Bonus Action): needs the Rogue L2 Cunning Action mechanic to apply to non-Rogue creatures via a feature marker. *Still open.*
