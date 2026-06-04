# Archive: slices 553-559

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 562, to keep the live file under the 60 KB single-Read ceiling). Active-cycle work continues in the live CHANGELOG.

Slices 553 (3 missing focus variants) + 554-559 (Goliath Giant Ancestry × 6 arms cohort).

---

**Engine (slice 559): Goliath Storm's Thunder — reaction 1d8 thunder to attacker; Giant Ancestry COHORT COMPLETE**

Sixth and final arm of the Goliath Giant Ancestry sweep. Reaction-style planner mirror of `planStonesEndurance` but emits a damage chain at the attacker instead of a compensating Healed on the bearer. **All 6 Goliath Giant Ancestry options are now mechanically wired** (Cloud's Jaunt, Fire's Burn, Frost's Chill, Hill's Tumble, Stone's Endurance, Storm's Thunder); the L1 Goliath species plays end-to-end without consumer-side mechanical bookkeeping for any ancestry choice.

RAW (SRD 5.2.1 Goliath, Storm's Thunder): "When you take damage from a creature within 60 feet of you, you can take a Reaction to deal 1d8 Thunder damage to that creature."

**Engine:**
- New planner [src/engine/plan/storms-thunder.ts](../../src/engine/plan/storms-thunder.ts). Intent: `{ goliathId, attackerId, triggeringDamageEventId? }`. Returns `StormsThunderOutcome { events, damageDealt }`. Validates via the shared `validateGoliathAncestry` helper + `assertReactionAvailable`, plus a self-target rejection (the attacker must not be the goliath). Rolls 1d8, emits `ActionEconomyConsumed(reaction)` + `ResourceSpent(giant-ancestry, 1)` + `DamageRolled(1d8 thunder)` + `DamageApplied` (via the standard `mitigateDamage` + `interceptFatalDamage` chain — thunder resistance / immunity / vulnerability applies, fatal-damage intercept fires for things like Death Ward).
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts), and added to the [tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts) `EXCLUDED_FROM_DISPATCH` allowlist (reaction-style outcome planner, mirror of Stone's Endurance).

**Documented design decisions:**
- **Within-60-ft gate is consumer-side.** The engine doesn't auto-check position-based range for reactions; consumers (UI / VTT) skip invoking when the attacker is too far. Same convention as Uncanny Dodge's "you can see the attacker" gate.
- **Synthetic weapon-instance id.** `DamageRolledEvent.weaponInstanceId` is required by the schema (designed for weapon attacks), so we set it to the Goliath's id as a no-op synthetic. The `DamageApplied.source = 'storms-thunder'` is the canonical discriminator for downstream consumers / triggers.
- **Source is non-magical.** RAW doesn't mark Goliath traits as magical sources, so `sourceIsMagical = false` in mitigation.

**Tests** ([tests/unit/engine/slice-559-storms-thunder.test.ts](../../tests/unit/engine/slice-559-storms-thunder.test.ts), 7 cases): happy path (damage in [1,8] + 4-event chain + correct source attribution); damage actually applied to attacker not goliath (replay equivalence on HP); self-target rejected; non-Goliath / wrong ancestry / depleted / reaction-used all rejected.

**Audit:**
- **Names:** `planStormsThunder` / `StormsThunderIntent` / `StormsThunderOutcome` mirror Stone's Endurance.
- **DRY:** reuses `validateGoliathAncestry` + `assertReactionAvailable` + `economyConsumedIfEncountered` + `mitigateDamage` + `interceptFatalDamage`. Net new logic ~30 lines (the damage emission chain).
- **SRP:** planner does one thing (one Storm's Thunder reaction).
- **Magic numbers:** `STORMS_THUNDER_DIE_SIDES = 8` extracted; `'storms-thunder'` source string extracted.
- **at-threading:** single `nowIso()` resolution, threaded through all emitted events.
- **Mechanical outcomes asserted:** damage in [1,8]; correct source / sourceCharacterId attribution; replay updates attacker HP (not goliath HP); 5 reject paths.

**Pattern-check — Goliath cohort retrospective:** all 6 arms wired across slices 554-559 ship in 6 commits over 1 day with shared infrastructure (`_giant-ancestry.ts` helper + `validateGoliathAncestry`). Split by mechanic shape:
- **BA actions** (1): Cloud's Jaunt — dedicated planner.
- **Attack riders** (3): Fire's Burn / Frost's Chill / Hill's Tumble — AttackIntent dial in resolveAttack with pre-validation + on-hit damage / condition / resource emission.
- **Reactions** (2): Stone's Endurance / Storm's Thunder — dedicated reaction-style planners returning outcomes the consumer branches on.

The shared `validateGoliathAncestry` helper unified the species + choice + resource preconditions across all 6 arms (extracted in slice 557 after the third sibling). The deep-audit gap that surfaced this cohort ("Goliath Giant Ancestry × 6 options entirely unwired") is now fully closed — every L1 Goliath plays their RAW ancestry mechanically.

---

**Engine (slice 558): Goliath Stone's Endurance — reaction reduce damage by 1d12 + CON (5th of 6-arm Giant Ancestry cohort)**

Fifth arm of the Goliath Giant Ancestry sweep. First reaction-style arm; modeled after `planUncannyDodge` (slice 200): the consumer invokes the planner post-DamageApplied with the damage amount, the planner rolls 1d12 + CON mod, and emits a compensating `Healed` event for the reduction value (capped at `damageAmount` so the reaction never over-heals).

RAW (SRD 5.2.1 Goliath, Stone's Endurance): "When you take damage, you can take a Reaction to roll 1d12. Add your Constitution modifier to the number rolled and reduce the damage by that total."

**Engine:**
- New planner [src/engine/plan/stones-endurance.ts](../../src/engine/plan/stones-endurance.ts). Intent: `{ goliathId, damageAmount, triggeringDamageEventId? }`. Returns `StonesEnduranceOutcome { events, reducedBy }` (mirror of UncannyDodgeOutcome shape — consumers branch on the reduced amount). Validates via the slice-557 shared `validateGoliathAncestry` helper (Goliath + Stone's Endurance ancestry + giant-ancestry > 0), then `assertReactionAvailable` (reaction not yet used this round). Rolls 1d12 + CON mod, caps at `damageAmount`. Emits `ActionEconomyConsumed(reaction)` (when in encounter) + `ResourceSpent(giant-ancestry, 1)` + `Healed(amount = reducedBy, source = 'stones-endurance')` (skipped if reducedBy = 0).
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts) (interface + type re-exports + factory). Added to the [tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts) `EXCLUDED_FROM_DISPATCH` allowlist (reaction-style planners that return outcomes the consumer branches on — same category as `uncannyDodge`, `cuttingWords`, `superiorDefense`).

**Event-sourcing model**: the triggering DamageApplied has already committed when this planner runs, so rather than mutate the original event we emit a compensating Healed. The bearer's HP nets out at `(damage - reduction)` and the audit trail preserves both the full hit and the reaction outcome. This is the same pattern as Uncanny Dodge and Absorb Elements.

**Tests** ([tests/unit/engine/slice-558-stones-endurance.test.ts](../../tests/unit/engine/slice-558-stones-endurance.test.ts), 8 cases): happy path (Healed + ResourceSpent + reaction); reduction capped at damageAmount (tiny damage / big roll); Healed amount = reducedBy; non-Goliath rejected; wrong ancestry rejected; depleted resource rejected; reaction-already-used rejected; zero damage → reducedBy=0 + no Healed but still consumes resource + reaction (consumer-side commit decision).

**Audit:**
- **Names:** `planStonesEndurance` mirrors `planUncannyDodge` exactly; outcome type follows the same shape (`{ events, reducedBy }` vs `{ events, halvedAmount }`).
- **DRY:** reuses shared `validateGoliathAncestry` + `assertReactionAvailable` + `economyConsumedIfEncountered` helpers. The planner body is ~20 lines of net new logic.
- **SRP:** planner does one thing (one Stone's Endurance reaction). Reduction logic is one line; event emission is three sequential pushes.
- **Magic numbers:** `STONES_ENDURANCE_DIE_SIDES = 12` extracted; `'stones-endurance'` source string extracted.
- **at-threading:** single `nowIso()` resolution.
- **Mechanical outcomes asserted:** roll within `[1+conMod, 12+conMod]`; cap at damageAmount; Healed event amount matches; 5 reject paths.

**Pattern-check:** the Goliath cohort now has 5 of 6 arms wired. Slice 559 (Storm's Thunder) is the last and is also reaction-style — it'll mirror this planner's shape but emit `DamageApplied` to the attacker instead of `Healed` to the bearer.

---

**Engine (slice 557): Goliath Hill's Tumble + shared validation helper (4th of 6-arm Giant Ancestry cohort)**

Fourth arm of the Goliath Giant Ancestry sweep. Adds the on-hit Prone rider with a Large-or-smaller target gate AND fulfills the slice-555 audit promise to extract a shared `validateGoliathAncestry` helper once the third sibling arrives — refactoring the existing Fire's Burn + Frost's Chill validation blocks to call it.

RAW (SRD 5.2.1 Goliath, Hill's Tumble): "When you hit a Large or smaller creature with an attack roll and deal damage to it, you can give that target the Prone condition."

**Engine:**
- [src/engine/plan/_giant-ancestry.ts](../../src/engine/plan/_giant-ancestry.ts) — new exported `validateGoliathAncestry(attacker, state, expectedOption, optionLabel)` helper. Throws the matching rejection if any of the three preconditions fail (Goliath species + matching ancestry choice + giant-ancestry resource > 0). The `optionLabel` parameter ("Hill's Tumble") feeds the error message.
- [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts):
  - New AttackIntent + ResolveAttackInput dial `useGiantAncestryHillsTumble?: boolean`.
  - Three validation blocks now collapse to one-line calls of `validateGoliathAncestry(...)`. Hill's Tumble adds a 4th-line precondition: target size ≤ Large via the existing `creatureSize` derive + `isLargeOrSmaller` helper (reused from slice 446).
  - Hit-time arm: when set, calls `applyRiderCondition('prone')` (mirror of slice 556's Frost's Chill condition application). No damage component — Hill's Tumble doesn't deal extra damage.
  - Tail emits `ResourceSpent(giant-ancestry, 1)` after the other two arms' resource events.
  - Forwarded through planAttack's intent → resolveAttack mapping.

**Tests** ([tests/unit/engine/slice-557-hills-tumble.test.ts](../../tests/unit/engine/slice-557-hills-tumble.test.ts), 6 cases): happy path (Prone applied to Medium target + ResourceSpent + attacker as source); Huge target (Hill Giant statblock) rejected pre-attack; non-Goliath rejected via shared helper; wrong ancestry rejected via shared helper; depleted resource rejected via shared helper; no-dial: no Prone + no ResourceSpent.

**Audit:**
- **Names:** `useGiantAncestryHillsTumble` mirrors siblings; helper name `validateGoliathAncestry` is intention-revealing.
- **DRY:** the three-block validation collapses from ~36 lines (3 × 12) to ~9 lines (3 × 1-line helper calls). Cleanest refactor of the cohort.
- **SRP:** helper does one thing (validate); each arm's dial does one thing (gate + emit).
- **Magic numbers:** none new.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** Prone applied with correct source attribution; Large-or-smaller gate works (Huge rejected); shared helper rejects across all 5 paths.

**Pattern-check:** the Goliath cohort now has 4 of 6 arms wired (Cloud's Jaunt, Fire's Burn, Frost's Chill, Hill's Tumble). The 2 remaining (Stone's Endurance, Storm's Thunder) are **reaction-style** planners triggered post-DamageApplied, not attack-rider dials — they don't reuse the AttackIntent shape. They'll live as their own planner files (mirror of `planClouds Jaunt` / `planRage` shape) and consume 1 giant-ancestry + 1 reaction each. Both will reuse the shared `validateGoliathAncestry` helper for the species + ancestry + resource preconditions.

---

**Engine + content (slice 556): Goliath Frost's Chill — on-hit +1d6 Cold + -10 ft speed (3rd of 6-arm Giant Ancestry cohort)**

Third arm of the Goliath Giant Ancestry sweep. Reuses the slice-555 attack-rider pattern (dial + validation + on-hit damage + on-hit resource consumption) and adds an on-hit ConditionApplied of a new `frosts-chill-slowed` condition that projects -10 ft walk speed with autoExpiry at start-of-attacker's-next-turn.

RAW (SRD 5.2.1 Goliath, Frost's Chill): "When you hit a target with an attack roll and deal damage to it, you can also deal 1d6 Cold damage to that target and reduce its Speed by 10 feet until the start of your next turn."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): new `frosts-chill-slowed` condition. Non-stackable, `autoExpiry: { afterRounds: 1, trigger: turnStart }`, effects: `[{ ModifySpeed walk add -10 }]`. The autoExpiry fires at the start of the source's next turn — RAW says "your next turn" (attacker's); the slice-484 `applyRiderCondition` helper sets `sourceCharacterId = attacker`, so the autoExpiry's turnStart trigger resolves to exactly that boundary.

**Engine** ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)):
- New AttackIntent + ResolveAttackInput dial `useGiantAncestryFrostsChill?: boolean`.
- Pre-validation block: same Goliath species + ancestry-choice + giant-ancestry resource > 0 shape as Fire's Burn (slice 555).
- Damage-roll site: rolls 1d6 cold via `rollExtraDamageDice`. Folded into damageRolled.rolls + the mitigation pipeline.
- After the existing onHit rider loop, calls the existing `applyRiderCondition('frosts-chill-slowed')` helper — this stamps autoExpiry + sourceCharacterId correctly, mirror of how spell-rider conditions land.
- Tail: emits `ResourceSpent(giant-ancestry, 1)` after `firesBurnResource` (parallel arm).
- Forwarded through planAttack's intent → resolveAttack mapping.

**Doc-count guards:** conditions 133 → 134 (118 → 119 mechanic-rider, 116 → 117 with effects). Updated [docs/getting-started.md](../getting-started.md) + [docs/starter-pack-gaps.md](../starter-pack-gaps.md) + [docs/status.md](../status.md) (both rows). Coverage snapshot updated (one intentional addition: `frosts-chill-slowed`).

**Tests** ([tests/unit/engine/slice-556-frosts-chill.test.ts](../../tests/unit/engine/slice-556-frosts-chill.test.ts), 5 cases): condition shape (in-pack, -10 walk add, autoExpiry 1/turnStart); happy path (cold roll in damageRolled + ResourceSpent + ConditionApplied with attacker as source + target as target); non-Goliath rejected; wrong ancestry rejected; without dial: no rider arm fires.

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

**Engine** ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)):
- New AttackIntent + ResolveAttackInput dial `useGiantAncestryFiresBurn?: boolean`.
- Pre-validation in resolveAttack (~line 558): Goliath species + Fire's Burn ancestry choice resolved (via `findGoliathAncestryChoice` from the slice-554 shared helper) + `giant-ancestry` resource > 0. Rejects malformed intents up front before any d20 is committed.
- Damage-roll site (~line 1233): when set, rolls 1d10 fire via the existing `rollExtraDamageDice` helper (crits double the dice per general crit semantics). Folded into `damageRolled.rolls` + the mitigation pipeline (resistance / immunity / vulnerability apply).
- Tail (~line 1442): emits `ResourceSpent(giant-ancestry, 1)` only on hit — RAW "When you hit". The miss path returns early before the damage chain, so a missed swing with the flag set does NOT consume the resource (mirror of Savage Attacker).
- Forwarded through planAttack's intent → resolveAttack mapping.

**Tests** ([tests/unit/engine/slice-555-fires-burn.test.ts](../../tests/unit/engine/slice-555-fires-burn.test.ts), 6 cases): happy path (fire roll appears in DamageRolled + ResourceSpent emitted); miss path (no fire roll, no ResourceSpent); non-Goliath rejected; wrong ancestry rejected; depleted resource rejected; no flag set → no fire roll + no ResourceSpent.

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
- New shared helper [src/engine/plan/_giant-ancestry.ts](../../src/engine/plan/_giant-ancestry.ts): constants (`GOLIATH_SPECIES_ID`, `GIANT_ANCESTRY_RESOURCE_ID`, `GIANT_ANCESTRY_CHOICE_ID`), the 6-option union (`GIANT_ANCESTRY_OPTION_IDS` / `GiantAncestryOption`), and `findGoliathAncestryChoice(character, state)` which scans the character's resolved pending choices for one of the 6 known ancestry option ids. The PendingChoice schema doesn't carry the source OfferChoice's `choiceId`, so the helper matches by option-id family — these 6 ids are unique to Giant Ancestry across the SRD content. Slices 555-559 reuse the helper.
- New `planCloudsJaunt` ([src/engine/plan/clouds-jaunt.ts](../../src/engine/plan/clouds-jaunt.ts)). Intent: `{ goliathId, to }`. Validates Goliath species + resolved Cloud's Jaunt choice + `giant-ancestry` resource > 0 + active combatant on own turn + BA available + destination ≤ 30 ft (Chebyshev) + unoccupied. Emits `ActionEconomyConsumed(bonusAction)` + `ResourceSpent(giant-ancestry, 1)` + `CombatantMoved(feetTraveled=0)` (teleport — doesn't drain normal movement, mirror of planMistyStep).
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`CloudsJaunt` dispatch).

**Documented RAW deviations (consumer-managed):**
- **"You can see it"**: the engine doesn't model line-of-sight to the destination cell. Consumer (UI / VTT) gates positionally.
- **Range as Chebyshev**: 30 ft is checked via `chebyshevDistance` (matches `planMistyStep`'s approach), so diagonal moves cost the same as orthogonal — RAW-compliant by the 5e square-grid model.

**Tests** ([tests/unit/engine/slice-554-clouds-jaunt.test.ts](../../tests/unit/engine/slice-554-clouds-jaunt.test.ts), 7 cases): happy path (3-event chain); non-Goliath rejected; wrong ancestry chosen rejected; depleted resource rejected; out-of-range destination rejected; BA-already-used rejected; replay equivalence (position updates + resource decrements).

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

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): three new gear items + cost/weight backfill on the existing five (which had only id+name):
- New: `arcane-focus-staff` (5 GP, 4 lb), `arcane-focus-wand` (10 GP, 1 lb), `druidic-focus-wooden-staff` (5 GP, 4 lb)
- Backfilled metadata on the existing 5 variants per RAW

**Doc-count guards:** gear count 78 → 81 (items total 545 → 548). Updated [docs/getting-started.md](../getting-started.md) + [docs/starter-pack-gaps.md](../starter-pack-gaps.md). The doc-counts audit caught the drift in CI.

**Documented RAW deviation (intentional):** the "Staff (also a Quarterstaff)" / "Wooden Staff (also a Quarterstaff)" dual-role is narrative-only — the engine doesn't model gear-that-is-also-a-weapon directly. To wield as a Quarterstaff, the consumer creates a sibling `quarterstaff` item instance (which already exists in the pack as a weapon). The description field on the new staff items calls this out explicitly so future contributors / consumers see the intent.

**Tests** ([tests/unit/engine/slice-553-focus-variants.test.ts](../../tests/unit/engine/slice-553-focus-variants.test.ts), 9 cases): each of the 5 Arcane Focus variants has correct cost + weight; each of the 3 Druidic Focus variants has correct cost + weight; all 8 ship as `gear` itemKind (not weapon/magic/consumable).

**Audit:**
- **Names:** id pattern follows the existing `arcane-focus-<name>` / `druidic-focus-<name>` convention.
- **DRY:** content-only edit; no abstraction.
- **SRP:** N/A.
- **Magic numbers:** none — cost/weight values come straight from the RAW table.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** per-variant cost + weight + itemKind matches RAW.

**Pattern-check:** the equipment-audit agent flagged this in the final L1 pass. With these three additions, the L1 equipment catalog matches RAW for every weapon (38), armor (12), shield (1), and spellcasting focus (8 — 5 Arcane + 3 Druidic). Other L1 gear (Healer's Kit slice 546, Thieves' Tools, Component Pouch, Holy Symbol variants) was already complete.

