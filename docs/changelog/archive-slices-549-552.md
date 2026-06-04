# Archive: slices 549-552

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 558, to keep the live file under the 60 KB single-Read ceiling). Active-cycle work continues in the live CHANGELOG.

---

**Engine (slice 552): Reach property extends opportunity-attack threat to 10 ft**

Closes the reach-OA drift from the final L1 SRD compliance pass. RAW (SRD 5.2.1 Reach): "This weapon adds 5 feet to your reach when you attack with it, as well as when determining your reach for Opportunity Attacks with it." Pre-slice the movement planner hardcoded a 5-ft threat range for every reactor regardless of equipped weapon, so a Halberd / Glaive / Lance / Pike / Whip wielder could never threaten OAs at their RAW 10-ft range. The mover always treated the reach-weapon enemy as if they had no reach — effectively giving free movement through their threat zone.

**Engine** ([src/engine/plan/movement.ts](../../src/engine/plan/movement.ts), `planMove` OA emission loop ~line 283): per-reactor reach now reads from the reactor's equipped main-hand weapon. If the reactor's main-hand weapon is a melee weapon with the `reach` property, threat range = 10 ft; otherwise defaults to 5 ft. The lookup is `state.itemInstances[mainHandId]` → `content.items.get(definitionId)`.

**Documented design decisions:**
- **Main-hand only.** Off-hand reach is unusual (a reach weapon is typically heavy / two-handed); deferred until a canonical user appears.
- **Per-reactor computation.** Each combatant in the OA-emission loop computes their own reach independently; mixed reach + non-reach reactors in the same encounter all work correctly.
- **Default 5 ft for unarmed.** A reactor with no equipped main-hand weapon falls back to 5 ft (RAW: unarmed strike is 5 ft).

**Tests** ([tests/unit/engine/slice-552-reach-oa-threat.test.ts](../../tests/unit/engine/slice-552-reach-oa-threat.test.ts), 5 cases): Halberd reactor at 10 ft → mover to 15 ft provokes OA (was unreachable pre-slice); Halberd reactor at 5 ft → mover to 10 ft does NOT provoke (still in 10-ft reach); Longsword reactor at 10 ft → mover to 15 ft does NOT provoke (was never in 5-ft reach — control case); Longsword reactor at 5 ft → mover to 10 ft provokes (standard 5-ft OA — control case); unarmed reactor defaults to 5 ft.

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

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): single line under `gnome` species → `gnome-gnomish-lineage` OfferChoice → `forest-gnome` option → `speak-with-animals` GrantSpell: `preparation: "at-will"` → `preparation: "oncePerLongRest"`. The pre-existing Minor Illusion grant stays at-will (correctly: it's a cantrip per RAW).

**Documented residual drift:** the engine's free-cast tracker ([src/schemas/runtime/character.ts](../../src/schemas/runtime/character.ts) `usedFreeCastSpellIds`, slice 486) is a boolean set per spell id — it can model "one free cast per rest" but NOT "PB free casts per rest." A future slice could introduce a per-spell-id counter primitive to land the exact RAW behavior. At L1 (PB 2), the engine grants 1 free cast vs RAW 2 — a one-cast-per-rest deficit. The slice-486 surface generalizes cleanly to a counter; tracked in [docs/starter-pack-gaps.md](../starter-pack-gaps.md).

**Tests** ([tests/unit/engine/slice-551-forest-gnome-speak-with-animals.test.ts](../../tests/unit/engine/slice-551-forest-gnome-speak-with-animals.test.ts), 3 cases): Speak with Animals is granted as `oncePerLongRest`, not `at-will`; Minor Illusion (cantrip) remains at-will; Rock Gnome cantrips remain at-will (control: didn't accidentally touch the wrong lineage).

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
- New helper `coverDexSaveBonus(cover)` in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) — same magnitudes as `coverACBonus` (alias today; kept as a separate export so future RAW deviations on one arm don't entangle the other).
- [src/engine/plan/_save-roll.ts](../../src/engine/plan/_save-roll.ts) (`rollSaveAgainstDC` — used by spell on-hit-save / breath weapons / recurring saves / use-item Save / sensor / trap / reactive spells / etc.): `RollSaveInput` gains optional `cover?: CoverKind`. When ability is `DEX` AND cover is supplied, the bonus is added to the total + an entry appears in the SaveRolled `breakdown` (`{ source: "cover (half)", value: 2 }`).
- [src/engine/plan/checks.ts](../../src/engine/plan/checks.ts) (`planSave` — the public direct-save planner): `SaveIntent` gains the same `cover` field with identical semantics.

**Why the bonus is DEX-only:** RAW scopes the cover bonus to Dexterity saves specifically. Other ability saves (STR/CON/INT/WIS/CHA) are unaffected, matching the AC-only-on-attack-rolls scoping. The save site checks `ability === 'DEX'` before reading the helper.

**Documented design decisions:**
- **Consumer supplies cover, not the engine.** The engine doesn't model positions, so cover detection (who's behind a wall / corner / ally) is a UI / VTT concern. The `cover` field rides on the save intent / planner input; absent it, behavior is unchanged.
- **Total cover means untargetable.** The helper returns 0 for `total` — consumers should reject the attack / save entirely before reaching the save site (`coverACBonus` already throws for total-cover attacks; the save planner mirrors that pattern by returning 0).

**Tests** ([tests/unit/engine/slice-550-cover-dex-save.test.ts](../../tests/unit/engine/slice-550-cover-dex-save.test.ts), 8 cases): helper returns correct values for all 4 cover kinds; helper mirrors `coverACBonus` exactly (parametrized over all 4 kinds); DEX save with half cover adds +2 + breakdown entry; DEX save with three-quarters cover adds +5; DEX save with no cover unchanged; CON save with half cover IGNORES cover (DEX-only); STR save with three-quarters cover IGNORES cover; DEX save with total cover adds 0.

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

**Engine** ([src/engine/triggers/dispatch.ts](../../src/engine/triggers/dispatch.ts)): three new dispatch-time facts on AttackRolled events:
- `event.attackerWeaponHasFinesse` — the weapon defines `finesse` in its properties
- `event.attackerWeaponIsRanged` — mirror of `event.attackKind === 'ranged'` for parallel usage
- `event.attackerWeaponIsFinesseOrRanged` — disjunction (the convenience fact Sneak Attack reads)

The dispatcher looks the weapon up via `state.itemInstances[event.weaponInstanceId]` → `content.items.get(definitionId)`, falling back to `false` for synthetic / unknown weapons. Future RAW gates on other weapon properties (heavy / light / two-handed) plug in by reading the same instance.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): added `{ "kind": "eq", "path": "event.attackerWeaponIsFinesseOrRanged", "value": true }` as a third term in the `all` filter for every Sneak Attack rider — all 10 levels (L1, L3, L5, L7, L9, L11, L13, L15, L17, L19). Filter order intentionally puts the weapon gate before the advantage/ally-adjacent disjunction so the cheap eq predicate short-circuits the expensive `any` evaluation for non-finesse/ranged attacks.

**Tests** ([tests/unit/engine/slice-549-sneak-attack-weapon-gate.test.ts](../../tests/unit/engine/slice-549-sneak-attack-weapon-gate.test.ts), 5 cases): Rapier (finesse) → SA fires; Shortbow (ranged) → SA fires; Shortsword (light finesse) → SA fires; Mace (no properties, melee) → SA does NOT fire; Greatsword (heavy/two-handed, melee) → SA does NOT fire. The "fires" assertions check `TriggerFired` event count = 1; the "blocked" assertions check count = 0 — surface that's robust against the dual `DamageRolled`/`DamageApplied` flow.

Existing tests stay green: the [tests/golden/s7-sneak-attack.test.ts](../../tests/golden/s7-sneak-attack.test.ts) golden uses a Rapier (finesse) so its outcome is unchanged. The [tests/golden/showcase.test.ts](../../tests/golden/showcase.test.ts) golden also passes — Vex (the showcase Rogue) carries a finesse weapon.

**Audit:**
- **Names:** `attackerWeaponHasFinesse` / `attackerWeaponIsRanged` / `attackerWeaponIsFinesseOrRanged` mirror the existing `event.attackerHasAllyAdjacentToTarget` shape.
- **DRY:** three facts share a single weapon lookup. The convenience disjunction fact avoids requiring every consumer to OR two booleans.
- **SRP:** the dispatcher gains read-only facts. The filter is data; no new code paths.
- **Magic numbers:** none.
- **at-threading:** N/A (no events emitted by this slice).
- **Mechanical outcomes asserted:** trigger fires on finesse + ranged; trigger blocked on non-finesse melee; 10 wire sites updated atomically.

**Pattern-check:** the "weapon-property fact at dispatch time" approach generalizes. Future slices that need to gate riders on heavy / light / two-handed / loading wire by reading the same `state.itemInstances` → `content.items` lookup at the same dispatch site.

---

Per-slice detail for slices 545-548 (final L1 deep-audit closure cohort: planSecondWind for Fighter L1, Healer's Kit + planUseHealersKit, Savage Attacker audit-clarification, planRage + raging condition for Barbarian L1) is archived at [docs/changelog/archive-slices-545-548.md](../changelog/archive-slices-545-548.md) (slice 553, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon character-side area-save; Heroic Inspiration as a first-class resource + Human Resourceful conversion; Halfling Luck cohort sweep with shared helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](../changelog/archive-slices-541-544.md) (slice 548, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance narrative marker; Human Resourceful narrative marker; Halfling Luck primitive + attack arm wire; Halfling Luck save + ability-check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](../changelog/archive-slices-536-540.md) (slice 545).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](../changelog/archive-slices-530-535.md) (slice 541).

Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](../changelog/archive-slices-525-529.md) (slice 537).

Per-slice detail for slices 520-524 (L1-completion-followed-by-monster-sweep arc: Spare the Dying + stabilize; Expeditious Retreat + planExpeditiousRetreatDash; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](../changelog/archive-slices-520-524.md) (slice 529).

Per-slice detail for slices 517-519 (L1-RAW-strict Pact boon completion arc: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](../changelog/archive-slices-517-519.md) (slice 523).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](../changelog/archive-slices-513-516.md) (slice 520).

Per-slice detail for slices 506-512 (the L1-completion polish arc: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation — choice mechanism, Agonizing Blast, event.spellId, GrantFeat indirection, per-cantrip variants) is archived at [docs/changelog/archive-slices-506-512.md](../changelog/archive-slices-506-512.md) (slice 517).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike + largeCreatureAdvantage + extraDicePerSlotLevel; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](../changelog/archive-slices-501-505.md) (slice 511).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + consumeOnIncomingAttack, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](../changelog/archive-slices-482-486.md) (slice 490).

Per-slice detail for slices 472-481 (the post-alpha.15 iconic-encounter content sweep: Scout / Cultist / Spy / Pack Tactics / Giant Spider+Centipede / Hippogriff / Brown Bear / Black Bear / Pirate Multiattacks and weapons) is archived at [docs/changelog/archive-slices-472-481.md](../changelog/archive-slices-472-481.md) (slice 487).

