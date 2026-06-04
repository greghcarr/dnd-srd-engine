# Archive: slices 545-548

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 553, to keep the live file under the 60 KB single-Read ceiling). Active-cycle work continues in the live CHANGELOG.

---

**Engine + content (slice 548): planRage + `raging` condition — Barbarian L1 plays**

Closes the highest-impact load-bearing gap from the slice-544 deep audit. Before this slice, an L1 Barbarian had the Rage *resource* (`GrantResource rage`) but no way to actually enter Rage — consumers had to manually emit `ConditionApplied(...)` + `ResourceSpent(...)` + `ActionEconomyConsumed(...)` and author the while-active condition themselves. Now Rage is a one-call entry that projects the four RAW while-active effects through the existing effect-stack machinery.

RAW (SRD 5.2.1 Barbarian L1, condensed): "As a Bonus Action if you aren't wearing Heavy armor... While active, your Rage follows the rules below: Damage Resistance (B/P/S); Rage Damage (+ bonus on STR-based attacks); Strength Advantage (checks + saves); No Concentration or Spells; Duration: until end of next turn (extendable)."

**Engine:**
- New `planRage` ([src/engine/plan/rage.ts](../../src/engine/plan/rage.ts)). Intent: `{ barbarianId }`. Validates Barbarian class membership + `rage` resource > 0 + not wearing Heavy armor (reads `attacker.equipped.armor` and checks `armorDef.category === 'heavy'`). Gates BA only when invoked inside an active encounter on the Barbarian's turn (out-of-encounter use is allowed by RAW — pre-combat preparation). Emits `ActionEconomyConsumed(bonusAction)` + `ResourceSpent(rage, 1)` + `ConditionApplied(raging)`.
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts) (interface + type re-export + factory), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`Rage` dispatch).
- New damage-time fact `event.damageAbility` in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) (`damageFacts` map, ~line 1133). Lets predicate-gated `AddModifier` effects scope to "STR-based attacks only" — Rage's `+2 damage` is the canonical user (RAW "when you make an attack using Strength"); future content gating on `event.damageAbility` plugs in by reading the same fact.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): new `raging` condition (non-stackable, ends on long rest). Effects:
- 3× `GrantResistance` (bludgeoning, piercing, slashing) — RAW B/P/S resistance.
- 1× `AddModifier { target: 'damage', value: 2, condition: event.damageAbility === 'STR' }` — RAW L1-3 Rage Damage. Higher tiers (L4 +3, L9 +4, L16 +4) require either per-tier variant conditions or a formula scale; deferred to a future slice.
- 2× `SetAdvantage` (`{ kind: 'check', ability: 'STR' }` + `{ kind: 'save', ability: 'STR' }`) — RAW Strength Advantage.

**Doc-count guards:** conditions 132 → 133 (117 → 118 mechanic-rider, 115 → 116 with effects). Updated [docs/getting-started.md](../getting-started.md) + [docs/starter-pack-gaps.md](../starter-pack-gaps.md) + [docs/status.md](../status.md) (both rows). The doc-counts audit caught all three drifts in CI; fixed in the same slice (slice 362 norm).

**Documented RAW deviations (consumer-managed; future-slice candidates):**
- **Duration**: RAW "until end of your next turn" (extendable by attacking, forcing a save, or BA up to 10 min). The engine doesn't model the auto-extend logic. The condition stays until consumer removes it via `ConditionRemoved` (or it clears on Long Rest). The most user-felt deviation; a per-round tick condition + "did the Barbarian X this round?" sensor would close it.
- **Auto-end on Heavy armor donned / Incapacitated**: not enforced. Consumer removes the condition when either trigger fires.
- **"No Concentration / no spells while raging"**: not enforced. Would need a concentration-block primitive on the condition.
- **Rage Damage scaling beyond L1's +2**: condition carries the L1-3 value. A future slice can ship per-tier variants (`raging-l4` / `raging-l9` / `raging-l16`) or scale via formula.

**Tests** ([tests/unit/engine/slice-548-rage.test.ts](../../tests/unit/engine/slice-548-rage.test.ts), 9 cases): out-of-encounter entry emits 2-event chain; in-encounter entry adds the BA gate (3 events); non-Barbarian (Wizard) rejected; depleted Rages rejected; Heavy armor (Plate) rejected; Light armor (Leather) allowed; BA-already-used rejected; STR check + STR save gain `hasAdvantage = true` via `computeAbilityCheck` / `computeSavingThrow` after Rage entry; DEX check stays `hasAdvantage = false` (scope is STR-only); condition shape verification (3 resistances + 1 STR-gated damage modifier + 2 SetAdvantage).

**Audit:**
- **Names:** `planRage` / `RageIntent` mirror the established planner-naming convention. `BARBARIAN_CLASS_ID`, `RAGE_RESOURCE_ID`, `RAGING_CONDITION_ID` extracted as module constants.
- **DRY:** the BA-gated "consume resource + apply condition" composition is the third sibling of this family (planAdrenalineRush, planStonecunning, planRage). At three siblings, the abstraction threshold gets close; if a fourth member arrives, extract a helper. Today each carries enough validation-specific logic that inlining is still clearer.
- **SRP:** validates (class + resource + armor + BA) + emits — one thing.
- **Magic numbers:** none beyond the existing literal `1` (resource spend amount). RAW values (B/P/S types, +2 damage, STR ability) live in the condition's effects array as data, not in the planner.
- **at-threading:** single `nowIso()` resolution, threaded.
- **Mechanical outcomes asserted:** event count + types + BA gate behavior + four reject paths + projection of advantage on STR check / save + DEX-unaffected control + condition shape.

**Pattern-check:** the `event.damageAbility` fact joins the existing `event.attackKind` / `event.damageType` / `event.weaponId` / `bearer.offHandHasWeapon` family in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts). Any future content gating damage on a specific ability (Hexblade's CHA-as-attack rider, Dex-only sneak-tier feats) wires by predicating on the same fact — no new plumbing.

**L1 SRD deep-audit FULLY CLOSED.** All four gaps surfaced by the slice-544 audit are now resolved:
- ~~Second Wind (Fighter L1 BA heal)~~ — **Closed by slice 545.**
- ~~Healer's Kit + Utilize-action stabilize~~ — **Closed by slice 546.**
- ~~Savage Attacker primitive~~ — **Already shipped slice 467** (audit misread; slice 547 added a clarifying note).
- ~~planRage (Barbarian L1)~~ — **Closed by this slice.**

L1 Barbarian, L1 Fighter, the Healer feat, and the Soldier background all play end-to-end now without consumer-side mechanical bookkeeping. The remaining L1 surface items (Human/Tiefling Medium-or-Small size choice, Alert's initiative-swap clause, weapon-property enforcement edge cases) are smaller and tracked in the broader L1 audit notes.

---

**Docs (slice 547): Savage Attacker is already wired — audit-clarification note**

The slice-544 deep audit flagged Savage Attacker as `UNWIRED` based on the feat's empty `effects: []` array. This was a misread: the feat is fully implemented since **slice 467** (the L1-playability arc part 3). The engine keys off the feat id directly in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) rather than off a declarative effect primitive. The full mechanic — `AttackIntent.useSavageAttacker` opt-in dial, once-per-turn enforcement via `turnUsage.savageAttackerUsedThisTurn`, two-set damage roll keeping the higher sum, `SavageAttackerUsed` event surfacing the discarded set, hit-only consumption (RAW "when you hit") — has been live and test-covered ([tests/unit/engine/slice-467-savage-attacker.test.ts](../../tests/unit/engine/slice-467-savage-attacker.test.ts), 4 cases) for ~80 slices.

**Engine** ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)): expanded the comment block above `SAVAGE_ATTACKER_FEAT_ID = 'savage-attacker'` to document the indirect-wiring pattern (id-match, not effect declaration) and to surface this slice's audit-correction note. A future audit agent reading the feat-by-id matching site can now tell that the feat IS backed without needing to cross-reference the test file.

**No content / schema / behavior change.** Pure documentation. The `FeatSchema` deliberately has no `description` field (consumer surfaces handle prose), so the clarification lives at the code site where misreads happen.

**Pattern-check:** the "feat with empty effects array but backed by id-match in source" pattern is unique to Savage Attacker today (every other feat declares effects). Future feats of this shape should either (a) declare a Custom marker handler so pack-integrity allowlists pick them up, or (b) add a short code comment at the id-match site. This slice adopts pattern (b) for Savage Attacker, leaving the pack JSON minimal.

**Slice-547 honest scope.** The original deep-audit plan had this slot allocated for "build the Savage Attacker primitive." That work doesn't need to happen — it's done. So slice 547 ships the doc clarification instead, and **planRage (Barbarian L1) moves to slice 548**, keeping the L1 SRD deep-audit close on track.

L1 SRD gap close: 3 of 4 deep-audit gaps now closed (Second Wind, Healer's Kit, Savage Attacker). Remaining: planRage (slice 548).

---

**Engine + content (slice 546): Healer's Kit item + `planUseHealersKit` — Utilize-action stabilize**

Closes the missing-item gap surfaced by the slice-544 deep audit. Healer's Kit is referenced by the Soldier background's starting equipment and the Healer feat's mechanical hook, but was absent from the item catalog. A character at 0 HP could not be stabilized via the SRD's most common path: a teammate spending one of the 10 kit uses.

RAW (SRD 5.2.1 Equipment, Healer's Kit): "A Healer's Kit has ten uses. As a Utilize action, you can expend one of its uses to stabilize an Unconscious creature that has 0 Hit Points without needing to make a Wisdom (Medicine) check."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): new `healers-kit` gear item (5 GP, 3 lb). The 10-use cap is consumer-managed via the existing `ItemInstance.chargesRemaining` / `maxCharges` fields (the kit instance is created with chargesRemaining = 10).

**Engine:**
- New `planUseHealersKit` ([src/engine/plan/use-healers-kit.ts](../../src/engine/plan/use-healers-kit.ts)). Intent: `{ healerId, healersKitInstanceId, targetId }`. Validates kit instance is `healers-kit` definition + chargesRemaining > 0 + target at 0 HP, not yet stable, not dead. Consumes Action (only inside an active encounter on the healer's turn — Utilize action) + emits `ItemChargeConsumed(1)` + `Stabilized`. Mirror of the slice-520 stabilize-mechanic shape (Spare the Dying cantrip), gated by the gear's charges.
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts) (interface + type re-export + factory), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`UseHealersKit` dispatch).

**Doc-count updates:** gear count 77 → 78 (and items total 544 → 545). Updated [docs/getting-started.md](../getting-started.md) + [docs/starter-pack-gaps.md](../starter-pack-gaps.md). The doc-counts audit caught the drift and required this update in the same slice (slice 362 norm).

**Documented RAW deviations (intentional):**
- **Kit-ownership / in-hand gate**: not enforced. The engine doesn't model "in-hand vs in-pack" granularity for gear; the consumer gates this if needed.
- **Adjacency**: RAW implies the healer is adjacent to the target. The engine doesn't model adjacency for gear use either; positional gating is consumer territory.

**Tests** ([tests/unit/engine/slice-546-healers-kit.test.ts](../../tests/unit/engine/slice-546-healers-kit.test.ts), 8 cases): kit ships in pack with correct weight + cost; out-of-encounter use emits 2-event chain (charge + stabilize); in-encounter use on healer's turn also emits ActionEconomyConsumed; replay-equivalence (charge decrement + stable=true); 0-charges throws; target-not-at-0-HP throws; target-already-stable throws; wrong-item-kind throws.

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
- New `planSecondWind` ([src/engine/plan/second-wind.ts](../../src/engine/plan/second-wind.ts)). Intent: `{ fighterId, at? }`. Validates Fighter class membership + `second-wind` resource > 0. Rolls 1d10, adds Fighter level, emits `ActionEconomyConsumed(bonusAction)` (only inside an active encounter on the fighter's own turn) + `ResourceSpent(second-wind, 1)` + `Healed(amount = 1d10 + level, source = 'second-wind')`. Mirror of `planAdrenalineRush` shape.
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts) (interface method + type re-export + factory), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`SecondWind` dispatch entry).

**Documented RAW deferrals (separate slices):**
- **L7 Tactical Mind extension**: spend Second Wind to add 1d10 to a failed ability check, no HP refunded. Different surface (ability-check rider, not heal); separate planner slice.
- **Out-of-encounter rest interaction**: the L4 / L10 progression columns expand the pool (3 / 4 uses); the GrantResource declarations on the Fighter level table handle pool size. Recharge timing (1 use per Short Rest, all on Long Rest) is consumer-managed via the existing rest system.

**Tests** ([tests/unit/engine/slice-545-second-wind.test.ts](../../tests/unit/engine/slice-545-second-wind.test.ts), 7 cases): L1 Fighter emits the 3-event chain with heal ∈ [2,11]; L5 Fighter heal ∈ [6,15] (level scales); out-of-encounter use skips BA gate, still consumes resource + heals; depleted resource throws; non-Fighter (Wizard) throws; BA-already-used throws; replay equivalence — committed events update HP + decrement resource correctly.

**Audit:**
- **Names:** `planSecondWind` / `SecondWindIntent` mirror `planAdrenalineRush` / `AdrenalineRushIntent`.
- **DRY:** structurally identical to `planAdrenalineRush` (BA gate + ResourceSpent + outcome event). The two are sibling implementations of the "L1 species/class Bonus Action consumes resource + grants effect" pattern. Below the abstraction threshold; the third sibling would justify a helper.
- **SRP:** planner does one thing — Second Wind. Validates, rolls, emits.
- **Magic numbers:** `SECOND_WIND_DIE_SIDES = 10` extracted. `1` (resource spend) inline-conventional. Constants for Fighter class id + resource id.
- **at-threading:** single `nowIso()` resolution, threaded to every emitted event.
- **Mechanical outcomes asserted:** event count + types + healed amount range + targetId + source + replay-equivalence on HP + resource.

**Pattern-check:** the deep audit (this conversation) surfaced 4 load-bearing L1 gaps: Savage Attacker feat (empty `effects: []`), Healer's Kit item (missing), Second Wind (this slice), Rage activation (no planner). Audit found that `planAdrenalineRush` and `planStonecunning` already use the BA-gated "consume resource + emit outcome" shape; Second Wind mirrors them cleanly. The remaining 3 gaps are scheduled for slices 546-548.

Older slices archived to keep the live CHANGELOG under the 60 KB single-Read ceiling: slices 536-540 detail at [docs/changelog/archive-slices-536-540.md](../changelog/archive-slices-536-540.md).

---

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon character-side area-save; Heroic Inspiration as a first-class resource + Human Resourceful conversion; Halfling Luck cohort sweep with shared helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](../changelog/archive-slices-541-544.md) (slice 548, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance narrative marker; Human Resourceful narrative marker; Halfling Luck primitive + attack arm wire; Halfling Luck save + ability-check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](../changelog/archive-slices-536-540.md) (slice 545, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](../changelog/archive-slices-530-535.md) (slice 541, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep: Imp Sting; Quasit Rend completes Chain combat surface; at-will Invisibility for Imp/Quasit/Sprite via pre-existing composition; docs correction; at-will spellcasting sweep across 8 monsters + 5 Magic Resistance fixes) is archived at [docs/changelog/archive-slices-525-529.md](../changelog/archive-slices-525-529.md) (slice 537, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 520-524 (L1-completion-followed-by-monster-sweep arc: Spare the Dying + `stabilize` mechanic; Expeditious Retreat + `planExpeditiousRetreatDash`; Venomous Snake statblock closing slice 519's follow-up; Pseudodragon Bite + Multiattack; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](../changelog/archive-slices-520-524.md) (slice 529, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 517-519 (L1-RAW-strict Pact boon completion arc: ChoiceResolved cascade primitive + Pact of the Tome canonical user; Pact of the Blade + `GrantPactBlade` marker + `planConjurePactWeapon`; Pact of the Chain + `GrantPactChain` marker + at-will Find Familiar free-cast) is archived at [docs/changelog/archive-slices-517-519.md](../changelog/archive-slices-517-519.md) (slice 523, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind + `event.isConcentrationCheck` save fact; Repelling Blast + `PushTarget` TriggerAction + `event.source` damage fact + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](../changelog/archive-slices-513-516.md) (slice 520, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 506-512 (Cleric Divine Order test; Floating Disk reclassification; Skilled origin feat; stale-note sweep; Warlock invocation foundation — choice mechanism + Agonizing Blast + `event.spellId` + `GrantFeat` indirection + per-cantrip variants) is archived at [docs/changelog/archive-slices-506-512.md](../changelog/archive-slices-506-512.md) (slice 517, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 501-505 (Shillelagh + `weapon-buff` mechanic; Ensnaring Strike + `largeCreatureAdvantage` + `extraDicePerSlotLevel`; Weapon Mastery enforcement; Rogue Thieves' Cant stale-stub sweep; Wizard Ritual Adept marker promotion) is archived at [docs/changelog/archive-slices-501-505.md](../changelog/archive-slices-501-505.md) (slice 511, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 496-500 (zone-cohort sweep: Silence / Move Earth / Reverse Gravity / Earthquake; Ice Knife + `targetScope`; Sorcerous Burst + `explodeOnMaxDie`; Goodberry + `create-item` + inventory grant; Animal Friendship + `targetCreatureType` + `conditionEndsOnDamage`) is archived at [docs/changelog/archive-slices-496-500.md](../changelog/archive-slices-496-500.md) (slice 503, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 491-495 (Boar Gore + `event.attackerChargedThisTarget`; Web Walker + `restrained-by-web`; Death Dog disease + RecurringSave `'longRest'`; True Strike + `weaponAttack`; the positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness) is archived at [docs/changelog/archive-slices-491-495.md](../changelog/archive-slices-491-495.md) (slice 499, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 487-490 (non-spellcaster Magic Initiate cast path; Cockatrice Petrifying Bite + `escalateToCondition`; Hippogriff Flyby + `MovementMode`; Stirge Blood Drain) is archived at [docs/changelog/archive-slices-487-490.md](../changelog/archive-slices-487-490.md) (slice 494, to keep this file under the 60 KB single-Read ceiling).

