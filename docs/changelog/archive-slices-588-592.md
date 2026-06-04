# Archive: slices 588-592

Five slices of combat-fuzz hardening + the first engine RAW deviation surfaced by the fuzz: species-granted resources + slot-availability fallback (588), weapon-mastery firings + property-qualified weapon proficiency tokens + Rogue/Monk/Wizard proficiency RAW fixes (589), buff/utility spell policy (590), item variety (shields + healing potions) (591), and reactions (Shield post-hit dispatch) (592).

Evicted from the live CHANGELOG in slice 596 (active-cycle-only headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Tooling (slice 592): combat-fuzz reactions — Shield post-hit dispatch**

The fuzz tool's runBattle loop ignored reaction-triggering events. Wizard / Sorcerer characters with `shield` prepared (an L1 spell, cast as a reaction in response to being hit) never reacted; the Shield planner + the `shielded` condition + reaction action-economy wiring all went unexercised by the bug-discovery harness.

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)): new `tryShieldReaction(campaign, defender)` helper gates the cast on RAW prerequisites; after each `performIntent` / `consumeItem` call, scan tail events for AttackRolled hits against the opponent and fire Shield via `engine.plan.shield` directly (allowlisted reaction planner).

**Documented limitation:** the fuzz fires Shield AFTER DamageRolled + DamageApplied, so a Shield that would RAW-retroactively convert a hit into a miss doesn't undo the damage. The slot / reaction / condition wiring + the +5 AC for subsequent attacks fire correctly. RAW-correct retroactive Shield needs the attack planner to split AttackRolled emission from damage emission — deferred.

**Bonus engine-RAW confirmation:** slice 587's transcript fix was correctly surfacing `[disadvantage]` on Halfling Ranger longbow attacks. Traced to [src/engine/plan/attack.ts:727-730](../../src/engine/plan/attack.ts#L727-L730) `heavyForSmall`: Small creature + Heavy weapon → Disadvantage per RAW.

---

**Tooling (slice 591): combat-fuzz item variety — shields + healing potions**

The fuzz tool previously equipped exactly one weapon and one armor per combatant. Shields (+2 AC) were never exercised, and healing potions (a single-charge consumable that emits the engine's consume-item / Heal flow) were also never used.

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)):
- New `useShield` flag on `ClassBuild`. Set for `cleric`, `fighter`, `paladin`. When set, `buildL1` creates a `shield` ItemInstance and equips it.
- Every combatant gets a `healing-potion`. Policy step 1 drinks it via a new `ConsumeItem` intent when no class-specific heal path matched.
- New runBattle branch: `ConsumeItem` is on the `EXCLUDED_FROM_DISPATCH` allowlist; route directly to `engine.plan.consumeItem`.

**Verification:** Shields verified raising AC (seed 501: cleric AC 16 = 13 chain shirt + 1 DEX + 2 shield). Healing potion verified (seed 500: "Bran healed 6 from item:healing-potion").

---

**Tooling (slice 590): combat-fuzz buff/utility spell policy**

The fuzz's pickIntent step 2 handled only BA-cast riders. Action-cast L1 buffs (Bless, Mage Armor, Faerie Fire) were never exercised.

**Changes** ([scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts)):
- New `firstTurnActionBuffTried` flag on Combatant.
- Step 2 now also handles paladin Divine Favor (gated by `hasUnusedL1Slot` — Paladin L1 has 0 slots per RAW, so skips).
- New step 2b (Action buff): cleric/bard → Bless self, wizard/sorcerer → Mage Armor self, druid → Faerie Fire on opponent.
- CLASS_BUILDS l1Spells expanded: bard += bless, cleric += bless, druid += faerie-fire, sorcerer += mage-armor.

**Verification** (30 seeds): 23 buff casts across the batch. Mage Armor verified raising AC (sorcerer 11 → 14). Bless + Faerie Fire verified casting + condition + concentration.

---

**Engine + content + tooling (slice 589): weapon-mastery firings in fuzz; property-qualified weapon proficiency tokens; Rogue / Monk / Wizard proficiency RAW fixes**

Wiring the fuzz to fire mastery riders after hits surfaced a deeper RAW deviation: the pack's class definitions used a flat string list for `weaponProficiencies` that couldn't express "Martial weapons that have the Finesse or Light property" — Rogue's RAW shape per [references/srd-markdown/classes.md](../../references/srd-markdown/classes.md).

**Engine** ([src/derive/attack.ts](../../src/derive/attack.ts)): `isWeaponProficient` now recognizes property-qualified category tokens (`"martial-light"`, `"martial-finesse"`). The token matches a weapon whose category equals `<category>` AND whose `properties` contains `<property>`.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): three pre-existing RAW deviations fixed:
- **Rogue**: `["simple"]` → `["simple", "martial-finesse", "martial-light"]`. Pre-fix Rogue rolled with -2 attack on shortsword / rapier / scimitar / whip / hand crossbow.
- **Monk**: `["simple"]` → `["simple", "martial-light"]`. Pre-fix Monk same issue on shortsword / scimitar / hand crossbow.
- **Wizard**: `[]` → `["simple"]`. Outright omission; slice-494 True Strike test had codified the drift (attackBonus +4 instead of RAW +6); updated.

**Tooling — fuzz weapon-mastery firings**: `MASTERY_CLASSES` (Fighter / Barbarian / Paladin / Ranger / Rogue) + a `WEAPON_MASTERY` table mapping fuzz weapons → mastery properties. `buildL1` sets `character.weaponMasteries: [build.weaponId]` for mastery classes. The runBattle inner loop queues `pendingMasteryFire` after a hit and pickIntent returns a `WeaponMastery` intent next iteration.

**Tests:** new property-qualified-proficiency test (7 cases); slice-494 True-Strike test updated to RAW +6. Full suite green.

---

**Tooling (slice 588): combat-fuzz hardening — species resource grants + slot-availability fallback**

Closed the two fuzz-tool gaps surfaced by the second 15-battle run (seeds 200-214):

**1. Species-granted resources weren't populated.** The CLASS_BUILDS table seeded only class-granted resources. Species traits like Orc Relentless Endurance, Dwarven Stonecunning, Dragonborn Breath Weapon, and Goliath Giant Ancestry — all wired as `GrantResource` declarations on `species.traits` — were silently dropped, so the engine's `PreventFatalDamageConsumingResource` intercept found the effect on Orc Aria but no matching entry in `character.resources`, and she died at -1 HP in seed 207. New helpers: `speciesGrantedResources(pack, speciesId)` + `evalL1ResourceMax` evaluating `max` at L1.

**2. Cure Wounds spam after slot exhaustion left druid silent for 4 rounds.** The policy's low-HP branch returned a `cure-wounds` intent unconditionally. Engine threw "No spell slots of level 1 available"; runBattle silently broke; druid did nothing in seed 210 rounds 8-11. New `hasUnusedL1Slot(character)` gate behind `< 2` slots for full casters.

**Verification:** Seed 207 Orc Aria's Relentless Endurance fires; seed 210 Druid Bran casts Produce Flame every slot-exhausted round.
