# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content (slice 481): Pirate Multiattack (two Daggers)**

Sixth user of the slice-464 `MonsterMultiattack` content field. RAW (SRD 5.2.1 Pirate, CR 1): "Multiattack. The pirate makes two Dagger attacks. It can replace one attack with a use of Enthralling Panache." The Pirate uses the existing pack `dagger`, so the slice is statblock-only - no new weapon needed.

- Pirate statblock gains `multiattack: { name: 'Pirate Multiattack', attacks: [{ weaponId: 'dagger', count: 2 }] }`.

**Deferred** (per the slice-464 follow-up family for Dragon-style "X attacks OR a Spellcasting" Multiattacks): the "replace one attack with Enthralling Panache" arm. Enthralling Panache itself (WIS save vs DC 12, Charmed on fail, ranged 30 ft) needs a stand-alone forced-save planner and stays deferred.

**Tests** at [tests/unit/engine/slice-481-pirate-multiattack.test.ts](tests/unit/engine/slice-481-pirate-multiattack.test.ts) - 2 cases: statblock pattern; 2 AttackRolled events via `engine.plan.multiattack`.

**Content (slice 480): Black Bear Multiattack (two Rends)**

Fifth user of the slice-464 `MonsterMultiattack` content field. RAW (SRD 5.2.1 Black Bear, CR 1/2): "Multiattack. The bear makes two Rend attacks. Rend: 1d6 slashing." Same single-weapon two-swing shape as Hippogriff Multiattack (slice 478).

- New `black-bear-rend` natural weapon (1d6 slashing, no rider).
- Black Bear statblock gains `multiattack: { name: 'Black Bear Multiattack', attacks: [{ weaponId: 'black-bear-rend', count: 2 }] }`.

**Doc-count update**: weapons 68 -> 69, items 531 -> 532.

**Tests** at [tests/unit/engine/slice-480-black-bear-multiattack.test.ts](tests/unit/engine/slice-480-black-bear-multiattack.test.ts) - 3 cases: weapon shape; statblock pattern; 2 AttackRolled events.

**Content (slice 479): Brown Bear Multiattack (one Bite + one Claw)**

Fourth user of the slice-464 `MonsterMultiattack` content field. RAW (SRD 5.2.1 Brown Bear, CR 1): "Multiattack. The bear makes one Bite attack and one Claw attack." Bite: 1d8 piercing. Claw: 1d4+3 slashing + Prone if Large or smaller (the `brown-bear-claw` was wired in slice 454).

Closes the deferred follow-up from slice 454 + slice 464 ("Brown Bear Multiattack: blocked on the Brown Bear Bite natural weapon not yet existing in the pack").

- New `brown-bear-bite` natural weapon (1d8 piercing, no rider).
- Brown Bear statblock gains `multiattack: { name: 'Brown Bear Multiattack', attacks: [{ weaponId: 'brown-bear-bite', count: 1 }, { weaponId: 'brown-bear-claw', count: 1 }] }`.

The slice-454 description on `brown-bear-claw` updated to point at this slice's bite + multiattack wiring.

**Doc-count update**: weapons 67 -> 68, total items 530 -> 531.

**Tests** at [tests/unit/engine/slice-479-brown-bear-multiattack.test.ts](tests/unit/engine/slice-479-brown-bear-multiattack.test.ts) - 3 cases: bite shape; statblock pattern; end-to-end `engine.plan.multiattack` emits 2 `AttackRolled` events with the two distinct weapon instances.

**Content (slice 478): Hippogriff Multiattack - third monster-Multiattack user**

Third user of the slice-464 `MonsterMultiattack` content field after Ghoul (slice 464) and Scout (slice 472). RAW (SRD 5.2.1 Hippogriff, CR 1): "Multiattack. The hippogriff makes two Rend attacks. Rend. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Slashing damage."

Two-step content slice:
- New `hippogriff-rend` natural weapon (1d8 slashing, no rider). The +3 damage / +5 attack come from the wielder's STR + PB, not the weapon.
- Hippogriff statblock declares `multiattack: { name: 'Hippogriff Multiattack', attacks: [{ weaponId: 'hippogriff-rend', count: 2 }] }`.

**Doc-count update**: weapons 66 -> 67, total items 529 -> 530.

**Tests** at [tests/unit/engine/slice-478-hippogriff-multiattack.test.ts](tests/unit/engine/slice-478-hippogriff-multiattack.test.ts) - 3 cases: weapon shape; statblock pattern; end-to-end `engine.plan.multiattack` emits exactly 2 `AttackRolled` events both targeting the same Rend instance (RAW: "two Rend attacks," same weapon).

**Audit (content slice):** RAW match exact. DRY: same multiattack-declaration pattern as Ghoul/Scout, same plain-natural-weapon pattern as Wolf Bite. Mechanical outcomes asserted: pattern shape on both pack entries; 2-AttackRolled event chain.

**Open follow-up:** Hippogriff Flyby (no Opportunity Attack provoked when flying out of an enemy's reach) - needs a new "movement-modality-gated OA suppression" primitive. Sibling to the Mobile feat's no-OA-vs-attacked-target arm but movement-mode-keyed. *Still open.*

**Content (slice 477): iconic L1-dungeon beast bites - Giant Spider + Giant Centipede**

Sixth content slice in the L1-encounter sweep, pivoting from humanoids to beasts. Both bites are pure content using existing primitives.

RAW (SRD 5.2.1):
- **Giant Spider (CR 1) Bite**: "Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage plus 7 (2d6) Poison damage."
- **Giant Centipede (CR 1/4) Bite**: "Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage, and the target has the Poisoned condition until the start of the centipede's next turn."

Two new pack items ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):

- `giant-spider-bite`: 1d8 piercing primary + slice-316 unconditional onHit `2d6 poison` rider (same shape as `spy-shortsword`).
- `giant-centipede-bite`: 1d4 piercing primary + slice-321 unconditional `applyConditionId: 'poisoned'` rider (same shape as `couatl-bite`).

The +3 damage / +5 attack (spider) and +2 damage / +4 attack (centipede) come from the wielder's STR/DEX + PB, not the weapons. Climb 30 ft speeds were already in the pack for both. The "until start of the centipede's next turn" Poisoned duration is consumer-managed (slice-286 mirror, same as Couatl).

**Doc-count update**: weapons 64 -> 66 in [docs/getting-started.md](docs/getting-started.md) (items-by-kind line) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) (Items row); 527 -> 529 total items in starter-pack-gaps.

**Tests** at [tests/unit/engine/slice-477-iconic-beast-bites.test.ts](tests/unit/engine/slice-477-iconic-beast-bites.test.ts) - 4 cases: pack shape for both bites; Giant Spider hit emits piercing + poison; Giant Centipede hit emits ConditionApplied(poisoned).

**Audit (content slice):**
- *RAW match*: both bites exactly per SRD. Climb speeds preserved.
- *DRY*: same onHit rider shapes as the slice-316 damage rider (Ghoul Bite / Spy weapons) and slice-321 condition rider (Couatl Bite). No new primitive.
- *Mechanical outcomes asserted*: pack shape; hit paths emit the expected riders.

**Deferred (need new primitives, listed for the next slices):**
- **Giant Spider Web Walker**: needs an immunity to "Restrained from webs" specifically (distinct from Restrained from any source). A new gating predicate on movement-restriction sources. *Still open.*
- **Boar Bloodied Fury** (Advantage on attacks while HP <= max/2): needs a `bearer.bloodied` predicate fact. *Still open.*
- **Boar Gore movement-conditional rider** (extra damage + Prone if moved 20+ ft straight at the target): needs a movement-direction fact and a "moved straight N feet" tracker; bigger shape, deferred. *Still open.*
- **Stirge Blood Drain attach** (attaches on hit, drains HP each turn while attached): needs a stateful attached-condition + periodic damage primitive; bigger. *Still open.*

**Content (slice 476): Pack Tactics sweep - Hobgoblin Warrior + Tough + Warrior Infantry**

Fifth content slice in the L1-encounter low-CR sweep. The 2024 SRD Pack Tactics list includes three CR <= 0.5 humanoid pack-fighters whose pack entries shipped with `traits: []`:
- **Hobgoblin Warrior (CR 1/2)** - RAW: "Pack Tactics. The hobgoblin has Advantage on an attack roll against a creature if at least one of the hobgoblin's allies is within 5 feet of the creature and the ally doesn't have the Incapacitated condition."
- **Tough (CR 1/2)** - same text scoped to "the tough"
- **Warrior Infantry (CR 1/8)** - same text scoped to "the warrior"

Pure content slice. Each statblock gains the same `SetAdvantage on:'attack' mode:'advantage'` trait gated on the slice-445 `event.attackerHasAllyAdjacentToTarget` consumer-coordinated fact - identical shape to the already-wired wolf / dire-wolf / giant-rat / kobold-warrior. No engine work.

**Tests** at [tests/unit/engine/slice-476-pack-tactics-sweep.test.ts](tests/unit/engine/slice-476-pack-tactics-sweep.test.ts) - 9 cases (3 per monster x 3 monsters via `it.each`): (1) the Pack Tactics trait is present on the statblock; (2) attacks with `attackerHasAllyAdjacentToTarget: true` roll with Advantage; (3) attacks without the fact roll normally.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Pack Tactics text matches verbatim across all three. The pack-derived `not Incapacitated` arm is the consumer's responsibility (the predicate is opaque to the engine), same as the existing wired Pack Tactics users.
- *Names*: trait shape mirrors the slice-445 wolf / kobold-warrior wires exactly.
- *DRY*: identical `SetAdvantage` shape across all three statblocks; same shape as the four already-wired Pack Tactics users.
- *Mechanical outcomes asserted*: trait presence; advantage applies with the fact; no advantage without it.

**Open follow-ups (per the broader sweep):**
- **Worg Bite "next attack vs target gets advantage" rider** (RAW: "the next attack roll made against the target before the start of the worg's next turn has Advantage"): novel primitive. The Worg in 2024 SRD does NOT have Pack Tactics - the trait was replaced with this stronger, more positional shape. Needs an onHit-applied-condition that grants advantage to attackers, plus an "until end of source's next turn" lifetime. *Still open.*
- **Iconic beast/monstrosity traits**: Giant Spider's Spider Climb + Web Walker + Web (action), Stirge's Blood Drain attach, Giant Centipede's poison rider, Cockatrice's petrifying bite, Bugbear's Brute. Each is a small content (or content + small-primitive) slice. *Still open.*

**Engine + content (slice 475): Cunning Action - closes the Spy statblock + wires the Rogue L2 feature**

Fourth and final L1-encounter content slice in the low-CR sweep. RAW (SRD 5.2.1):
- Rogue L2: "You can take the Dash, Disengage, or Hide action as a Bonus Action."
- Spy (CR 1): "Cunning Action. The spy takes the Dash, Disengage, or Hide action [as a Bonus Action]."

Pre-slice, both Rogue L2 `cunning-action` and the Spy statblock shipped with empty effects / traits — the mechanic was unimplemented. This slice ships a new planner that handles both paths via a dual eligibility gate.

**New planner** [planCunningAction](src/engine/plan/cunning-action.ts) ships as `engine.plan.cunningAction({ actorId, mode, dc? })`. Three modes: `'dash'` / `'disengage'` / `'hide'`. Mirrors the slice-455 `planNimbleEscape` body with the addition of a Dash mode. Eligibility gate accepts EITHER:
- A Rogue L2+ character (any character whose `classes` includes `{ classId: 'rogue', level: >= 2 }`), OR
- A monster whose `statblockId` is on the `CUNNING_ACTION_STATBLOCKS` allowlist (currently `{'spy'}`; add ids here when a new monster carries Cunning Action).

Same active-encounter + active-combatant + bonus-action-available + mode-specific-already-spent validation as Nimble Escape. Emits `ActionEconomyConsumed(bonusAction)` + the mode-specific event (`Dashed` / `Disengaged` for the movement modes; `AbilityCheckRolled` + optional `ConditionApplied(invisible)` on a successful Hide check).

**Wired across the 4 standard sites** (plan/index.ts export, engine/index.ts import + intent type + Engine.plan method + impl, conveniences.ts `performIntent` dispatch). The slice-364 planner-wiring audit is green.

**Content wires**:
- Rogue L2 `cunning-action` feature: `effects: []` -> `effects: [{ kind: 'Custom', handlerId: 'cunning-action' }]`. The handlerId string is referenced via the `'./cunning-action.js'` import path in [src/engine/plan/index.ts](src/engine/plan/index.ts), so the slice-303 pack-integrity audit recognizes it as backed (same mechanism that satisfies `nimble-escape`).
- Spy statblock: `traits` field added carrying the same Custom marker.

**Tests** at [tests/unit/engine/slice-475-cunning-action.test.ts](tests/unit/engine/slice-475-cunning-action.test.ts) - 12 cases: Spy paths (Dash / Disengage / Hide success / Hide failure); Rogue L2+ paths (L2 succeeds, L5 succeeds, L1 rejected); rejection paths (Fighter no Cunning Action, out-of-encounter, double bonus-action use); content wires (Spy traits + Rogue L2 feature effects).

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

Two new pack items ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):

- `spy-shortsword`: martial melee, 1d6 piercing, `finesse` + `light`, Vex mastery, plus a slice-316 unconditional onHit `2d6 poison` rider.
- `spy-hand-crossbow`: martial ranged, 1d6 piercing, `ammunition` + `light` + `loading`, Vex mastery, 30/120 ft range, plus the same `2d6 poison` rider.

Same rider shape as Ghoul Bite's `1d6 necrotic` (slice 462) and Wyvern's Sting / Ettercap's Bite / Merrow's Bite (slice 322). Distinct from the generic `shortsword` and `crossbow-hand` items so adventurer-wielded versions don't inherit the poison rider. The +2 damage / +4 attack come from the wielder's DEX + PB, not the weapon.

**Doc-count update**: weapons 62 -> 64 in [docs/getting-started.md](docs/getting-started.md) (items-by-kind line) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) (Items row); 525 -> 527 total items in starter-pack-gaps.

**Tests** at [tests/unit/engine/slice-474-spy-poison-weapons.test.ts](tests/unit/engine/slice-474-spy-poison-weapons.test.ts) - 5 cases: pack declares the right shape for both weapons; spy-shortsword hits emit piercing + poison with the poison total in the 2d6 range (or 4d6 on a crit); spy-hand-crossbow hits emit piercing + poison; generic shortsword / crossbow-hand still carry no onHit rider.

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

New `ritual-sickle` item ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): regular sickle base (1d4 slashing, `light`, Nick mastery) plus a slice-316 unconditional onHit flat-1 necrotic rider via the `0d6+1` flat-damage shape (the same shape Mace of Smiting / Sword of Life Stealing / Sprite Enchanting Bow use for fixed-amount riders). Distinct from the generic `sickle` so adventurer-wielded sickles don't inherit the necrotic rider. The +1 damage / +3 attack come from the wielder's DEX + PB, not the weapon.

**Doc-count update**: weapons 61 -> 62 in [docs/getting-started.md](docs/getting-started.md) (items-by-kind line) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) (Items row); 524 -> 525 total items in starter-pack-gaps.

**Tests** at [tests/unit/engine/slice-473-ritual-sickle.test.ts](tests/unit/engine/slice-473-ritual-sickle.test.ts) - 3 cases: pack declares the right damage / properties / onHit rider; on a non-critical hit the DamageRolled carries slashing primary + exactly 1 necrotic; the generic `sickle` is unaffected (still has no onHit rider).

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

**Tests** at [tests/unit/engine/slice-472-scout-multiattack.test.ts](tests/unit/engine/slice-472-scout-multiattack.test.ts) — 3 cases: Scout statblock declares the expected pattern; `runtimeMultiattackFromStatblock` produces a 2-attack runtime pattern with two distinct weapon instances; end-to-end `engine.plan.multiattack` emits exactly 2 `AttackRolled` events that target the two different weapon instances.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Scout Multiattack exactly, mapping the "any combination" RAW to the canonical mixed loadout. Pure shortsword / pure longbow are still reachable by building the runtime pattern directly.
- *Names*: choice of mixed loadout matches the most-distinctive Scout encounter (the scout draws back as the party closes — bow at range, shortsword in melee).
- *DRY*: no helper changes; same slice-464 primitive consuming an existing weapon-id pair.
- *Mechanical outcomes asserted*: pattern shape on the pack; runtime helper output; two distinct AttackRolled events with the right weaponInstanceIds.

**Open follow-ups:**
- **Cultist Ritual Sickle** (RAW: "Hit: 3 (1d4 + 1) Slashing damage plus 1 Necrotic damage"): needs a new `ritual-sickle` weapon (sickle base + flat necrotic onHit rider). Tiny content slice; the onHit primitive (slice 316) already supports flat-damage riders. *Still open.*
- **Spy poison weapons** (RAW: Shortsword + Hand Crossbow each deal +2d6 poison damage on hit): two new pack items (`spy-shortsword` + `spy-hand-crossbow`) following the slice-322 poison-natural-weapon pattern. *Still open.*
- **Spy Cunning Action** (RAW: takes the Dash, Disengage, or Hide action as a Bonus Action): needs the Rogue L2 Cunning Action mechanic to apply to non-Rogue creatures via a feature marker. *Still open.*

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
- **Once-per-long-rest free-cast gate**: a per-feat resource the engine auto-tracks (granted via the GrantSpell `oncePerLongRest` preparation, consumed by a cast with `noSlotCost: true`) would close the consumer-responsibility gap for Magic Initiate's L1-spell free cast, Warlock Contact Patron, and any other future once-per-long-rest cast. Sibling primitive opportunity. *Still open.*
- **Spell Change at level-up** (RAW: "Whenever you gain a new level, you can replace one of the spells you chose for this feat"): needs an OfferChoice mode that exposes a "replace one of your prior selections" semantic on level-up. The schema's `when: 'onLevelUp'` is there but the replace-prior-pick shape isn't expressed. *Still open.*
- **spellcastingAbility player choice** (RAW: pick INT/WIS/CHA at feat acquisition): a third OfferChoice on each feat over the three abilities, with each option re-projecting the GrantSpell entries with that ability. Deferred for now; the canonical defaults match the linked backgrounds' ability options. *Still open.*
- **Magic Initiate (Druid)**: not currently in the pack as a feat; would mirror the Cleric / Wizard wiring over the Druid list once that list is fully present. *Still open.*

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
