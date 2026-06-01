# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 556): Goliath Frost's Chill — on-hit +1d6 Cold + -10 ft speed (3rd of 6-arm Giant Ancestry cohort)**

Third arm of the Goliath Giant Ancestry sweep. Reuses the slice-555 attack-rider pattern (dial + validation + on-hit damage + on-hit resource consumption) and adds an on-hit ConditionApplied of a new `frosts-chill-slowed` condition that projects -10 ft walk speed with autoExpiry at start-of-attacker's-next-turn.

RAW (SRD 5.2.1 Goliath, Frost's Chill): "When you hit a target with an attack roll and deal damage to it, you can also deal 1d6 Cold damage to that target and reduce its Speed by 10 feet until the start of your next turn."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): new `frosts-chill-slowed` condition. Non-stackable, `autoExpiry: { afterRounds: 1, trigger: turnStart }`, effects: `[{ ModifySpeed walk add -10 }]`. The autoExpiry fires at the start of the source's next turn — RAW says "your next turn" (attacker's); the slice-484 `applyRiderCondition` helper sets `sourceCharacterId = attacker`, so the autoExpiry's turnStart trigger resolves to exactly that boundary.

**Engine** ([src/engine/plan/attack.ts](src/engine/plan/attack.ts)):
- New AttackIntent + ResolveAttackInput dial `useGiantAncestryFrostsChill?: boolean`.
- Pre-validation block: same Goliath species + ancestry-choice + giant-ancestry resource > 0 shape as Fire's Burn (slice 555).
- Damage-roll site: rolls 1d6 cold via `rollExtraDamageDice`. Folded into damageRolled.rolls + the mitigation pipeline.
- After the existing onHit rider loop, calls the existing `applyRiderCondition('frosts-chill-slowed')` helper — this stamps autoExpiry + sourceCharacterId correctly, mirror of how spell-rider conditions land.
- Tail: emits `ResourceSpent(giant-ancestry, 1)` after `firesBurnResource` (parallel arm).
- Forwarded through planAttack's intent → resolveAttack mapping.

**Doc-count guards:** conditions 133 → 134 (118 → 119 mechanic-rider, 116 → 117 with effects). Updated [docs/getting-started.md](docs/getting-started.md) + [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) + [docs/status.md](docs/status.md) (both rows). Coverage snapshot updated (one intentional addition: `frosts-chill-slowed`).

**Tests** ([tests/unit/engine/slice-556-frosts-chill.test.ts](tests/unit/engine/slice-556-frosts-chill.test.ts), 5 cases): condition shape (in-pack, -10 walk add, autoExpiry 1/turnStart); happy path (cold roll in damageRolled + ResourceSpent + ConditionApplied with attacker as source + target as target); non-Goliath rejected; wrong ancestry rejected; without dial: no rider arm fires.

**Audit:**
- **Names:** `useGiantAncestryFrostsChill` mirrors `useGiantAncestryFiresBurn`. Condition id `frosts-chill-slowed` mirrors existing `*-active` / `*-slowed` patterns.
- **DRY:** the dial → validate → roll → emit-resource shape is now used twice (Fire's Burn + Frost's Chill); slice 557 (Hill's Tumble) makes 3 — at the third sibling I'll extract a shared `validateGoliathAncestry(option, attacker, state)` helper. Today each block is ~12 lines and reads clearly inline.
- **SRP:** validation + damage roll + condition application + resource consumption are each independent ~5-line edits.
- **Magic numbers:** `'1d6'` and `'cold'` inline (RAW values). `-10` lives in the condition definition.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** cold roll on hit; condition applied with autoExpiry stamping; ResourceSpent; absence on miss + no-flag; rejection paths.

**Pattern-check:** the Goliath cohort now has 3 of 6 arms wired (Cloud's Jaunt, Fire's Burn, Frost's Chill). The slice-484 `applyRiderCondition` helper proved its reuse — Frost's Chill's autoExpiry stamping is identical to spell-rider conditions, no new mechanism. Slice 557 (Hill's Tumble) will reuse the same helper for applying Prone.

---

**Engine (slice 555): Goliath Fire's Burn — on-hit +1d10 Fire damage (2nd of 6-arm Giant Ancestry cohort)**

Second arm of the Goliath Giant Ancestry sweep. Wires via the slice-467 Savage Attacker pattern: AttackIntent dial + pre-validation + on-hit damage rider + on-hit resource consumption.

RAW (SRD 5.2.1 Goliath, Fire's Burn): "When you hit a target with an attack roll and deal damage to it, you can also deal 1d10 Fire damage to that target."

**Engine** ([src/engine/plan/attack.ts](src/engine/plan/attack.ts)):
- New AttackIntent + ResolveAttackInput dial `useGiantAncestryFiresBurn?: boolean`.
- Pre-validation in resolveAttack (~line 558): Goliath species + Fire's Burn ancestry choice resolved (via `findGoliathAncestryChoice` from the slice-554 shared helper) + `giant-ancestry` resource > 0. Rejects malformed intents up front before any d20 is committed.
- Damage-roll site (~line 1233): when set, rolls 1d10 fire via the existing `rollExtraDamageDice` helper (crits double the dice per general crit semantics). Folded into `damageRolled.rolls` + the mitigation pipeline (resistance / immunity / vulnerability apply).
- Tail (~line 1442): emits `ResourceSpent(giant-ancestry, 1)` only on hit — RAW "When you hit". The miss path returns early before the damage chain, so a missed swing with the flag set does NOT consume the resource (mirror of Savage Attacker).
- Forwarded through planAttack's intent → resolveAttack mapping.

**Tests** ([tests/unit/engine/slice-555-fires-burn.test.ts](tests/unit/engine/slice-555-fires-burn.test.ts), 6 cases): happy path (fire roll appears in DamageRolled + ResourceSpent emitted); miss path (no fire roll, no ResourceSpent); non-Goliath rejected; wrong ancestry rejected; depleted resource rejected; no flag set → no fire roll + no ResourceSpent.

**Audit:**
- **Names:** `useGiantAncestryFiresBurn` mirrors `useSavageAttacker` exactly (boolean dial + verb-prefixed).
- **DRY:** validation block mirrors the slice-467 Savage Attacker validation shape; the resource lookup reuses the slice-554 `findGoliathAncestryChoice` helper. The damage-roll inclusion + ResourceSpent emission are ~5-line edits each. Slices 556 (Frost's Chill) + 557 (Hill's Tumble) will reuse all three patterns (dial + validation + on-hit emission); if a 4th sibling appears, extract a shared `validateGoliathAncestry(ancestry, attacker, state)` helper.
- **SRP:** resolveAttack gains a 3-line damage-roll arm + a 5-line ResourceSpent arm. Both gated by the same boolean.
- **Magic numbers:** `'1d10'` and `'fire'` inline (the RAW values; hardcoded since they're per-arm). If a future ancestry uses a different die / type, the values stay at the call site.
- **at-threading:** unchanged (uses existing `at`).
- **Mechanical outcomes asserted:** fire roll + ResourceSpent on hit; both absent on miss; resource is in the `giant-ancestry` pool; 3 reject paths.

**Pattern-check:** the Goliath cohort now has 2 of 6 arms wired (slice 554 Cloud's Jaunt + this slice). The remaining 4 split: Frost's Chill + Hill's Tumble are attack-rider arms (mirror this slice), Stone's Endurance + Storm's Thunder are reaction-style planners (mirror neither — they're triggered post-DamageApplied by a different consumer-driven flow).

---

**Engine (slice 554): Goliath Cloud's Jaunt — BA teleport 30 ft (first of 6-arm Giant Ancestry cohort)**

Closes the first of six unwired Goliath Giant Ancestry options surfaced by the final L1 SRD compliance pass. Pre-slice each of the 6 ancestry options shipped as a Custom-marker `effects: []` choice — the OfferChoice presented to the player but no engine wire let the Goliath actually use the chosen ancestry. This slice ships the first arm with the shared infrastructure (helper + constants) the remaining 5 slices will reuse.

RAW (SRD 5.2.1 Goliath): "_Cloud's Jaunt (Cloud Giant)._ As a Bonus Action, you magically teleport up to 30 feet to an unoccupied space you can see."

**Engine:**
- New shared helper [src/engine/plan/_giant-ancestry.ts](src/engine/plan/_giant-ancestry.ts): constants (`GOLIATH_SPECIES_ID`, `GIANT_ANCESTRY_RESOURCE_ID`, `GIANT_ANCESTRY_CHOICE_ID`), the 6-option union (`GIANT_ANCESTRY_OPTION_IDS` / `GiantAncestryOption`), and `findGoliathAncestryChoice(character, state)` which scans the character's resolved pending choices for one of the 6 known ancestry option ids. The PendingChoice schema doesn't carry the source OfferChoice's `choiceId`, so the helper matches by option-id family — these 6 ids are unique to Giant Ancestry across the SRD content. Slices 555-559 reuse the helper.
- New `planCloudsJaunt` ([src/engine/plan/clouds-jaunt.ts](src/engine/plan/clouds-jaunt.ts)). Intent: `{ goliathId, to }`. Validates Goliath species + resolved Cloud's Jaunt choice + `giant-ancestry` resource > 0 + active combatant on own turn + BA available + destination ≤ 30 ft (Chebyshev) + unoccupied. Emits `ActionEconomyConsumed(bonusAction)` + `ResourceSpent(giant-ancestry, 1)` + `CombatantMoved(feetTraveled=0)` (teleport — doesn't drain normal movement, mirror of planMistyStep).
- Wired through [src/engine/plan/index.ts](src/engine/plan/index.ts), [src/engine/index.ts](src/engine/index.ts), [src/engine/conveniences.ts](src/engine/conveniences.ts) (`CloudsJaunt` dispatch).

**Documented RAW deviations (consumer-managed):**
- **"You can see it"**: the engine doesn't model line-of-sight to the destination cell. Consumer (UI / VTT) gates positionally.
- **Range as Chebyshev**: 30 ft is checked via `chebyshevDistance` (matches `planMistyStep`'s approach), so diagonal moves cost the same as orthogonal — RAW-compliant by the 5e square-grid model.

**Tests** ([tests/unit/engine/slice-554-clouds-jaunt.test.ts](tests/unit/engine/slice-554-clouds-jaunt.test.ts), 7 cases): happy path (3-event chain); non-Goliath rejected; wrong ancestry chosen rejected; depleted resource rejected; out-of-range destination rejected; BA-already-used rejected; replay equivalence (position updates + resource decrements).

**Audit:**
- **Names:** `planCloudsJaunt` / `CloudsJauntIntent` mirror the established planner-naming convention. Constants in `_giant-ancestry.ts` follow the slice-543 underscore-prefixed shared-helper convention.
- **DRY:** the shared helper hoists species id + resource id + choice id + option family + the resolved-choice lookup. Each of slices 555-559 will be a ~80-line planner that reuses these.
- **SRP:** helper does one thing (find the chosen ancestry); planner does one thing (teleport).
- **Magic numbers:** `CLOUDS_JAUNT_RANGE_FEET = 30` extracted.
- **at-threading:** single `nowIso()` resolution, threaded.
- **Mechanical outcomes asserted:** event count + types + feetTraveled=0 (teleport) + position update + 6 reject paths.

**Pattern-check:** the slice 465 Goliath species test introduced the OfferChoice + Custom-marker pattern; this slice is the first wire that actually consumes those Custom markers via the consumer-resolved choice. Slices 555-559 will follow: Fire's Burn / Frost's Chill / Hill's Tumble as AttackIntent dial-rider arms (consumed at the damage-roll site); Stone's Endurance / Storm's Thunder as reaction planners triggered post-DamageApplied.

---

**Content (slice 553): missing focus variants — Arcane Focus (Staff + Wand) and Druidic Focus (Wooden Staff)**

Closes a small but visible RAW gap from the final L1 SRD compliance pass: the SRD lists 5 Arcane Focus variants (Crystal / Orb / Rod / Staff / Wand) and 3 Druidic Focus variants (Sprig of Mistletoe / Wooden Staff / Yew Wand); the pack shipped only 3 + 2. The two Staff variants and the second wand were absent, denying spellcasters their RAW alternatives.

RAW (SRD 5.2.1 Equipment, condensed):
- Arcane Focus: Crystal 10 GP / 1 lb, Orb 20 GP / 3 lb, Rod 10 GP / 2 lb, Staff 5 GP / 4 lb (also a Quarterstaff), Wand 10 GP / 1 lb
- Druidic Focus: Sprig of Mistletoe 1 GP, Wooden Staff 5 GP / 4 lb (also a Quarterstaff), Yew Wand 10 GP / 1 lb

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): three new gear items + cost/weight backfill on the existing five (which had only id+name):
- New: `arcane-focus-staff` (5 GP, 4 lb), `arcane-focus-wand` (10 GP, 1 lb), `druidic-focus-wooden-staff` (5 GP, 4 lb)
- Backfilled metadata on the existing 5 variants per RAW

**Doc-count guards:** gear count 78 → 81 (items total 545 → 548). Updated [docs/getting-started.md](docs/getting-started.md) + [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md). The doc-counts audit caught the drift in CI.

**Documented RAW deviation (intentional):** the "Staff (also a Quarterstaff)" / "Wooden Staff (also a Quarterstaff)" dual-role is narrative-only — the engine doesn't model gear-that-is-also-a-weapon directly. To wield as a Quarterstaff, the consumer creates a sibling `quarterstaff` item instance (which already exists in the pack as a weapon). The description field on the new staff items calls this out explicitly so future contributors / consumers see the intent.

**Tests** ([tests/unit/engine/slice-553-focus-variants.test.ts](tests/unit/engine/slice-553-focus-variants.test.ts), 9 cases): each of the 5 Arcane Focus variants has correct cost + weight; each of the 3 Druidic Focus variants has correct cost + weight; all 8 ship as `gear` itemKind (not weapon/magic/consumable).

**Audit:**
- **Names:** id pattern follows the existing `arcane-focus-<name>` / `druidic-focus-<name>` convention.
- **DRY:** content-only edit; no abstraction.
- **SRP:** N/A.
- **Magic numbers:** none — cost/weight values come straight from the RAW table.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** per-variant cost + weight + itemKind matches RAW.

**Pattern-check:** the equipment-audit agent flagged this in the final L1 pass. With these three additions, the L1 equipment catalog matches RAW for every weapon (38), armor (12), shield (1), and spellcasting focus (8 — 5 Arcane + 3 Druidic). Other L1 gear (Healer's Kit slice 546, Thieves' Tools, Component Pouch, Holy Symbol variants) was already complete.

---

**Engine (slice 552): Reach property extends opportunity-attack threat to 10 ft**

Closes the reach-OA drift from the final L1 SRD compliance pass. RAW (SRD 5.2.1 Reach): "This weapon adds 5 feet to your reach when you attack with it, as well as when determining your reach for Opportunity Attacks with it." Pre-slice the movement planner hardcoded a 5-ft threat range for every reactor regardless of equipped weapon, so a Halberd / Glaive / Lance / Pike / Whip wielder could never threaten OAs at their RAW 10-ft range. The mover always treated the reach-weapon enemy as if they had no reach — effectively giving free movement through their threat zone.

**Engine** ([src/engine/plan/movement.ts](src/engine/plan/movement.ts), `planMove` OA emission loop ~line 283): per-reactor reach now reads from the reactor's equipped main-hand weapon. If the reactor's main-hand weapon is a melee weapon with the `reach` property, threat range = 10 ft; otherwise defaults to 5 ft. The lookup is `state.itemInstances[mainHandId]` → `content.items.get(definitionId)`.

**Documented design decisions:**
- **Main-hand only.** Off-hand reach is unusual (a reach weapon is typically heavy / two-handed); deferred until a canonical user appears.
- **Per-reactor computation.** Each combatant in the OA-emission loop computes their own reach independently; mixed reach + non-reach reactors in the same encounter all work correctly.
- **Default 5 ft for unarmed.** A reactor with no equipped main-hand weapon falls back to 5 ft (RAW: unarmed strike is 5 ft).

**Tests** ([tests/unit/engine/slice-552-reach-oa-threat.test.ts](tests/unit/engine/slice-552-reach-oa-threat.test.ts), 5 cases): Halberd reactor at 10 ft → mover to 15 ft provokes OA (was unreachable pre-slice); Halberd reactor at 5 ft → mover to 10 ft does NOT provoke (still in 10-ft reach); Longsword reactor at 10 ft → mover to 15 ft does NOT provoke (was never in 5-ft reach — control case); Longsword reactor at 5 ft → mover to 10 ft provokes (standard 5-ft OA — control case); unarmed reactor defaults to 5 ft.

**Audit:**
- **Names:** `DEFAULT_MELEE_REACH` + `REACH_PROPERTY_RANGE` constants extracted (the prior code had only `MELEE_REACH = 5` inline).
- **DRY:** the reach lookup is a small inline block; mirror of the slice-549 weapon-property fact pattern (read instance → def → check property). Below the abstraction threshold for now; could extract `effectiveMeleeReach(character, state, content)` if a third caller appears.
- **SRP:** OA detection loop gains a reach derivation; everything else unchanged.
- **Magic numbers:** `5` and `10` extracted to constants.
- **at-threading:** unchanged (no new events emitted).
- **Mechanical outcomes asserted:** reach weapon extends threat (positive); default 5-ft unchanged (control); unarmed defaults to 5 ft.

**Pattern-check:** the final L1 audit also flagged Heavy-weapon Small-creature disadvantage and the Loading property cap as unwired — verified BOTH were already wired (attack.ts:649 `heavyForSmall` and attack.ts:1514 `weaponIsLoading`). Slice 556 will add a brief audit-clarification CHANGELOG note for those. So the only verified unwired weapon-property concern was Reach, which this slice closes.

---

**Content (slice 551): Forest Gnome Speak with Animals — per-rest cap closure**

Closes an at-will over-grant surfaced by the final L1 SRD compliance pass. RAW caps Forest Gnome's Speak with Animals at PB free uses per long rest; the pack wired it as `at-will` (infinite). One-line content fix moves the preparation to `oncePerLongRest` — closer to RAW, erring toward stinginess (1 use per rest vs RAW PB uses) rather than the prior unbounded over-grant.

RAW (SRD 5.2.1 Forest Gnome): "You also always have the Speak with Animals spell prepared. You can cast it without a spell slot a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest. You can also use any spell slots you have to cast the spell."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): single line under `gnome` species → `gnome-gnomish-lineage` OfferChoice → `forest-gnome` option → `speak-with-animals` GrantSpell: `preparation: "at-will"` → `preparation: "oncePerLongRest"`. The pre-existing Minor Illusion grant stays at-will (correctly: it's a cantrip per RAW).

**Documented residual drift:** the engine's free-cast tracker ([src/schemas/runtime/character.ts](src/schemas/runtime/character.ts) `usedFreeCastSpellIds`, slice 486) is a boolean set per spell id — it can model "one free cast per rest" but NOT "PB free casts per rest." A future slice could introduce a per-spell-id counter primitive to land the exact RAW behavior. At L1 (PB 2), the engine grants 1 free cast vs RAW 2 — a one-cast-per-rest deficit. The slice-486 surface generalizes cleanly to a counter; tracked in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md).

**Tests** ([tests/unit/engine/slice-551-forest-gnome-speak-with-animals.test.ts](tests/unit/engine/slice-551-forest-gnome-speak-with-animals.test.ts), 3 cases): Speak with Animals is granted as `oncePerLongRest`, not `at-will`; Minor Illusion (cantrip) remains at-will; Rock Gnome cantrips remain at-will (control: didn't accidentally touch the wrong lineage).

**Audit:**
- **Names:** N/A (data-only change).
- **DRY:** content-only edit, no abstraction.
- **SRP:** N/A.
- **Magic numbers:** none.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** preparation field value + cohort-control assertions (Minor Illusion + Rock Gnome unchanged).

**Pattern-check:** the deep audit flagged this as the only at-will over-grant for a per-rest-uses RAW clause among species traits at L1. Other per-rest species resources (Stonecunning, Adrenaline Rush, Relentless Endurance, Heroic Inspiration, Dragonborn Breath, Halfling Luck) all wire correctly via `GrantResource` with `recharge: longRest` (or via dedicated marker primitives). Forest Gnome is the only one that's spell-shaped rather than resource-shaped, hence the unique drift.

---

**Engine (slice 550): Cover bonus on Dexterity saving throws**

Mirrors the existing cover-to-AC bonus onto Dexterity saves per RAW. Closes one of two HIGH-impact drifts surfaced by the final L1 SRD compliance pass (the other was Sneak Attack weapon gate, slice 549). Before this slice, a target with half / three-quarters cover got +2 / +5 to AC against attack rolls, but Fireball / Burning Hands / Sacred Flame / Ice Knife / breath weapons all ignored the cover bonus on the target's Dex save — players in cover would still take half damage on a successful save but the engine made the save itself less likely than RAW.

RAW (SRD 5.2.1 Cover): "A target with half cover has a +2 bonus to AC and Dexterity saving throws. A target with three-quarters cover has a +5 bonus to AC and Dexterity saving throws."

**Engine:**
- New helper `coverDexSaveBonus(cover)` in [src/engine/plan/attack.ts](src/engine/plan/attack.ts) — same magnitudes as `coverACBonus` (alias today; kept as a separate export so future RAW deviations on one arm don't entangle the other).
- [src/engine/plan/_save-roll.ts](src/engine/plan/_save-roll.ts) (`rollSaveAgainstDC` — used by spell on-hit-save / breath weapons / recurring saves / use-item Save / sensor / trap / reactive spells / etc.): `RollSaveInput` gains optional `cover?: CoverKind`. When ability is `DEX` AND cover is supplied, the bonus is added to the total + an entry appears in the SaveRolled `breakdown` (`{ source: "cover (half)", value: 2 }`).
- [src/engine/plan/checks.ts](src/engine/plan/checks.ts) (`planSave` — the public direct-save planner): `SaveIntent` gains the same `cover` field with identical semantics.

**Why the bonus is DEX-only:** RAW scopes the cover bonus to Dexterity saves specifically. Other ability saves (STR/CON/INT/WIS/CHA) are unaffected, matching the AC-only-on-attack-rolls scoping. The save site checks `ability === 'DEX'` before reading the helper.

**Documented design decisions:**
- **Consumer supplies cover, not the engine.** The engine doesn't model positions, so cover detection (who's behind a wall / corner / ally) is a UI / VTT concern. The `cover` field rides on the save intent / planner input; absent it, behavior is unchanged.
- **Total cover means untargetable.** The helper returns 0 for `total` — consumers should reject the attack / save entirely before reaching the save site (`coverACBonus` already throws for total-cover attacks; the save planner mirrors that pattern by returning 0).

**Tests** ([tests/unit/engine/slice-550-cover-dex-save.test.ts](tests/unit/engine/slice-550-cover-dex-save.test.ts), 8 cases): helper returns correct values for all 4 cover kinds; helper mirrors `coverACBonus` exactly (parametrized over all 4 kinds); DEX save with half cover adds +2 + breakdown entry; DEX save with three-quarters cover adds +5; DEX save with no cover unchanged; CON save with half cover IGNORES cover (DEX-only); STR save with three-quarters cover IGNORES cover; DEX save with total cover adds 0.

**Audit:**
- **Names:** `coverDexSaveBonus` mirrors `coverACBonus`. The `cover?` field on `RollSaveInput` / `SaveIntent` matches the existing `cover?` field on `AttackIntent`.
- **DRY:** the helper aliases `coverACBonus`. Two save sites (`_save-roll.ts` + `checks.ts`) each get a 5-line conditional. Below the abstraction threshold; if a third independent save site appears, extract a `applyCoverToSave` helper.
- **SRP:** helper returns a number; save sites add it to the bonus and append to breakdown.
- **Magic numbers:** none beyond the pre-existing `HALF_COVER_AC_BONUS` / `THREE_QUARTERS_COVER_AC_BONUS`.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** the bonus magnitude + DEX-only scope + breakdown surfacing + identity of cover-AC and cover-DEX-save values.

**Pattern-check:** the audit also flagged that **all 9 other call sites** of `rollSaveAgainstDC` (recurring-save tick, intimidating-presence, land's-aid, breath weapons, reactive-spells target, trap, sensor, transformations, weapon-mastery Topple) automatically pick up the cover bonus when their callers thread it. Most of those call sites don't naturally have positional context (e.g. an aura-damage tick doesn't know about cover), so they leave `cover` unset — which is fine. The big winners are AOE spell saves (Burning Hands, Sacred Flame, Ice Knife splash, breath weapons) where the caster explicitly knows the target's cover state.

---

**Engine + content (slice 549): Sneak Attack RAW weapon gate (Finesse or Ranged)**

Closes the highest-impact drift surfaced by the final L1 SRD compliance pass. RAW (SRD 5.2.1 Rogue L1): "Once per turn, you can deal an extra 1d6 damage to one creature you hit with an attack roll if you have Advantage on the roll **and the attack uses a Finesse or Ranged weapon**." The engine's pre-slice Sneak Attack filter checked Advantage + ally-adjacent disjunction but DID NOT enforce the weapon-type clause — a L1 Rogue could trigger Sneak Attack with a Greatsword or Mace as long as they had Advantage.

**Engine** ([src/engine/triggers/dispatch.ts](src/engine/triggers/dispatch.ts)): three new dispatch-time facts on AttackRolled events:
- `event.attackerWeaponHasFinesse` — the weapon defines `finesse` in its properties
- `event.attackerWeaponIsRanged` — mirror of `event.attackKind === 'ranged'` for parallel usage
- `event.attackerWeaponIsFinesseOrRanged` — disjunction (the convenience fact Sneak Attack reads)

The dispatcher looks the weapon up via `state.itemInstances[event.weaponInstanceId]` → `content.items.get(definitionId)`, falling back to `false` for synthetic / unknown weapons. Future RAW gates on other weapon properties (heavy / light / two-handed) plug in by reading the same instance.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): added `{ "kind": "eq", "path": "event.attackerWeaponIsFinesseOrRanged", "value": true }` as a third term in the `all` filter for every Sneak Attack rider — all 10 levels (L1, L3, L5, L7, L9, L11, L13, L15, L17, L19). Filter order intentionally puts the weapon gate before the advantage/ally-adjacent disjunction so the cheap eq predicate short-circuits the expensive `any` evaluation for non-finesse/ranged attacks.

**Tests** ([tests/unit/engine/slice-549-sneak-attack-weapon-gate.test.ts](tests/unit/engine/slice-549-sneak-attack-weapon-gate.test.ts), 5 cases): Rapier (finesse) → SA fires; Shortbow (ranged) → SA fires; Shortsword (light finesse) → SA fires; Mace (no properties, melee) → SA does NOT fire; Greatsword (heavy/two-handed, melee) → SA does NOT fire. The "fires" assertions check `TriggerFired` event count = 1; the "blocked" assertions check count = 0 — surface that's robust against the dual `DamageRolled`/`DamageApplied` flow.

Existing tests stay green: the [tests/golden/s7-sneak-attack.test.ts](tests/golden/s7-sneak-attack.test.ts) golden uses a Rapier (finesse) so its outcome is unchanged. The [tests/golden/showcase.test.ts](tests/golden/showcase.test.ts) golden also passes — Vex (the showcase Rogue) carries a finesse weapon.

**Audit:**
- **Names:** `attackerWeaponHasFinesse` / `attackerWeaponIsRanged` / `attackerWeaponIsFinesseOrRanged` mirror the existing `event.attackerHasAllyAdjacentToTarget` shape.
- **DRY:** three facts share a single weapon lookup. The convenience disjunction fact avoids requiring every consumer to OR two booleans.
- **SRP:** the dispatcher gains read-only facts. The filter is data; no new code paths.
- **Magic numbers:** none.
- **at-threading:** N/A (no events emitted by this slice).
- **Mechanical outcomes asserted:** trigger fires on finesse + ranged; trigger blocked on non-finesse melee; 10 wire sites updated atomically.

**Pattern-check:** the "weapon-property fact at dispatch time" approach generalizes. Future slices that need to gate riders on heavy / light / two-handed / loading wire by reading the same `state.itemInstances` → `content.items` lookup at the same dispatch site.

---

Per-slice detail for slices 545-548 (final L1 deep-audit closure cohort: planSecondWind for Fighter L1, Healer's Kit + planUseHealersKit, Savage Attacker audit-clarification, planRage + raging condition for Barbarian L1) is archived at [docs/changelog/archive-slices-545-548.md](docs/changelog/archive-slices-545-548.md) (slice 553, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon character-side area-save; Heroic Inspiration as a first-class resource + Human Resourceful conversion; Halfling Luck cohort sweep with shared helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md) (slice 548, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance narrative marker; Human Resourceful narrative marker; Halfling Luck primitive + attack arm wire; Halfling Luck save + ability-check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md) (slice 545).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md) (slice 541).

Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md) (slice 537).

Per-slice detail for slices 520-524 (L1-completion-followed-by-monster-sweep arc: Spare the Dying + stabilize; Expeditious Retreat + planExpeditiousRetreatDash; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md) (slice 529).

Per-slice detail for slices 517-519 (L1-RAW-strict Pact boon completion arc: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520).

Per-slice detail for slices 506-512 (the L1-completion polish arc: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation — choice mechanism, Agonizing Blast, event.spellId, GrantFeat indirection, per-cantrip variants) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike + largeCreatureAdvantage + extraDicePerSlotLevel; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + consumeOnIncomingAttack, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490).

Per-slice detail for slices 472-481 (the post-alpha.15 iconic-encounter content sweep: Scout / Cultist / Spy / Pack Tactics / Giant Spider+Centipede / Hippogriff / Brown Bear / Black Bear / Pirate Multiattacks and weapons) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487).

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
