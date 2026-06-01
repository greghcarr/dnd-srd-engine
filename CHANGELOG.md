# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

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

**Engine + content (slice 548): planRage + `raging` condition — Barbarian L1 plays**

Closes the highest-impact load-bearing gap from the slice-544 deep audit. Before this slice, an L1 Barbarian had the Rage *resource* (`GrantResource rage`) but no way to actually enter Rage — consumers had to manually emit `ConditionApplied(...)` + `ResourceSpent(...)` + `ActionEconomyConsumed(...)` and author the while-active condition themselves. Now Rage is a one-call entry that projects the four RAW while-active effects through the existing effect-stack machinery.

RAW (SRD 5.2.1 Barbarian L1, condensed): "As a Bonus Action if you aren't wearing Heavy armor... While active, your Rage follows the rules below: Damage Resistance (B/P/S); Rage Damage (+ bonus on STR-based attacks); Strength Advantage (checks + saves); No Concentration or Spells; Duration: until end of next turn (extendable)."

**Engine:**
- New `planRage` ([src/engine/plan/rage.ts](src/engine/plan/rage.ts)). Intent: `{ barbarianId }`. Validates Barbarian class membership + `rage` resource > 0 + not wearing Heavy armor (reads `attacker.equipped.armor` and checks `armorDef.category === 'heavy'`). Gates BA only when invoked inside an active encounter on the Barbarian's turn (out-of-encounter use is allowed by RAW — pre-combat preparation). Emits `ActionEconomyConsumed(bonusAction)` + `ResourceSpent(rage, 1)` + `ConditionApplied(raging)`.
- Wired through [src/engine/plan/index.ts](src/engine/plan/index.ts), [src/engine/index.ts](src/engine/index.ts) (interface + type re-export + factory), [src/engine/conveniences.ts](src/engine/conveniences.ts) (`Rage` dispatch).
- New damage-time fact `event.damageAbility` in [src/engine/plan/attack.ts](src/engine/plan/attack.ts) (`damageFacts` map, ~line 1133). Lets predicate-gated `AddModifier` effects scope to "STR-based attacks only" — Rage's `+2 damage` is the canonical user (RAW "when you make an attack using Strength"); future content gating on `event.damageAbility` plugs in by reading the same fact.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): new `raging` condition (non-stackable, ends on long rest). Effects:
- 3× `GrantResistance` (bludgeoning, piercing, slashing) — RAW B/P/S resistance.
- 1× `AddModifier { target: 'damage', value: 2, condition: event.damageAbility === 'STR' }` — RAW L1-3 Rage Damage. Higher tiers (L4 +3, L9 +4, L16 +4) require either per-tier variant conditions or a formula scale; deferred to a future slice.
- 2× `SetAdvantage` (`{ kind: 'check', ability: 'STR' }` + `{ kind: 'save', ability: 'STR' }`) — RAW Strength Advantage.

**Doc-count guards:** conditions 132 → 133 (117 → 118 mechanic-rider, 115 → 116 with effects). Updated [docs/getting-started.md](docs/getting-started.md) + [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) + [docs/status.md](docs/status.md) (both rows). The doc-counts audit caught all three drifts in CI; fixed in the same slice (slice 362 norm).

**Documented RAW deviations (consumer-managed; future-slice candidates):**
- **Duration**: RAW "until end of your next turn" (extendable by attacking, forcing a save, or BA up to 10 min). The engine doesn't model the auto-extend logic. The condition stays until consumer removes it via `ConditionRemoved` (or it clears on Long Rest). The most user-felt deviation; a per-round tick condition + "did the Barbarian X this round?" sensor would close it.
- **Auto-end on Heavy armor donned / Incapacitated**: not enforced. Consumer removes the condition when either trigger fires.
- **"No Concentration / no spells while raging"**: not enforced. Would need a concentration-block primitive on the condition.
- **Rage Damage scaling beyond L1's +2**: condition carries the L1-3 value. A future slice can ship per-tier variants (`raging-l4` / `raging-l9` / `raging-l16`) or scale via formula.

**Tests** ([tests/unit/engine/slice-548-rage.test.ts](tests/unit/engine/slice-548-rage.test.ts), 9 cases): out-of-encounter entry emits 2-event chain; in-encounter entry adds the BA gate (3 events); non-Barbarian (Wizard) rejected; depleted Rages rejected; Heavy armor (Plate) rejected; Light armor (Leather) allowed; BA-already-used rejected; STR check + STR save gain `hasAdvantage = true` via `computeAbilityCheck` / `computeSavingThrow` after Rage entry; DEX check stays `hasAdvantage = false` (scope is STR-only); condition shape verification (3 resistances + 1 STR-gated damage modifier + 2 SetAdvantage).

**Audit:**
- **Names:** `planRage` / `RageIntent` mirror the established planner-naming convention. `BARBARIAN_CLASS_ID`, `RAGE_RESOURCE_ID`, `RAGING_CONDITION_ID` extracted as module constants.
- **DRY:** the BA-gated "consume resource + apply condition" composition is the third sibling of this family (planAdrenalineRush, planStonecunning, planRage). At three siblings, the abstraction threshold gets close; if a fourth member arrives, extract a helper. Today each carries enough validation-specific logic that inlining is still clearer.
- **SRP:** validates (class + resource + armor + BA) + emits — one thing.
- **Magic numbers:** none beyond the existing literal `1` (resource spend amount). RAW values (B/P/S types, +2 damage, STR ability) live in the condition's effects array as data, not in the planner.
- **at-threading:** single `nowIso()` resolution, threaded.
- **Mechanical outcomes asserted:** event count + types + BA gate behavior + four reject paths + projection of advantage on STR check / save + DEX-unaffected control + condition shape.

**Pattern-check:** the `event.damageAbility` fact joins the existing `event.attackKind` / `event.damageType` / `event.weaponId` / `bearer.offHandHasWeapon` family in [src/engine/plan/attack.ts](src/engine/plan/attack.ts). Any future content gating damage on a specific ability (Hexblade's CHA-as-attack rider, Dex-only sneak-tier feats) wires by predicating on the same fact — no new plumbing.

**L1 SRD deep-audit FULLY CLOSED.** All four gaps surfaced by the slice-544 audit are now resolved:
- ~~Second Wind (Fighter L1 BA heal)~~ — **Closed by slice 545.**
- ~~Healer's Kit + Utilize-action stabilize~~ — **Closed by slice 546.**
- ~~Savage Attacker primitive~~ — **Already shipped slice 467** (audit misread; slice 547 added a clarifying note).
- ~~planRage (Barbarian L1)~~ — **Closed by this slice.**

L1 Barbarian, L1 Fighter, the Healer feat, and the Soldier background all play end-to-end now without consumer-side mechanical bookkeeping. The remaining L1 surface items (Human/Tiefling Medium-or-Small size choice, Alert's initiative-swap clause, weapon-property enforcement edge cases) are smaller and tracked in the broader L1 audit notes.

---

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

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon character-side area-save; Heroic Inspiration as a first-class resource + Human Resourceful conversion; Halfling Luck cohort sweep with shared helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md) (slice 548, to keep this file under the 60 KB single-Read ceiling).

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
