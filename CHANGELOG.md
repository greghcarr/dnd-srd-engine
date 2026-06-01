# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine (slice 558): Goliath Stone's Endurance — reaction reduce damage by 1d12 + CON (5th of 6-arm Giant Ancestry cohort)**

Fifth arm of the Goliath Giant Ancestry sweep. First reaction-style arm; modeled after `planUncannyDodge` (slice 200): the consumer invokes the planner post-DamageApplied with the damage amount, the planner rolls 1d12 + CON mod, and emits a compensating `Healed` event for the reduction value (capped at `damageAmount` so the reaction never over-heals).

RAW (SRD 5.2.1 Goliath, Stone's Endurance): "When you take damage, you can take a Reaction to roll 1d12. Add your Constitution modifier to the number rolled and reduce the damage by that total."

**Engine:**
- New planner [src/engine/plan/stones-endurance.ts](src/engine/plan/stones-endurance.ts). Intent: `{ goliathId, damageAmount, triggeringDamageEventId? }`. Returns `StonesEnduranceOutcome { events, reducedBy }` (mirror of UncannyDodgeOutcome shape — consumers branch on the reduced amount). Validates via the slice-557 shared `validateGoliathAncestry` helper (Goliath + Stone's Endurance ancestry + giant-ancestry > 0), then `assertReactionAvailable` (reaction not yet used this round). Rolls 1d12 + CON mod, caps at `damageAmount`. Emits `ActionEconomyConsumed(reaction)` (when in encounter) + `ResourceSpent(giant-ancestry, 1)` + `Healed(amount = reducedBy, source = 'stones-endurance')` (skipped if reducedBy = 0).
- Wired through [src/engine/plan/index.ts](src/engine/plan/index.ts), [src/engine/index.ts](src/engine/index.ts) (interface + type re-exports + factory). Added to the [tests/audit/planner-wiring.test.ts](tests/audit/planner-wiring.test.ts) `EXCLUDED_FROM_DISPATCH` allowlist (reaction-style planners that return outcomes the consumer branches on — same category as `uncannyDodge`, `cuttingWords`, `superiorDefense`).

**Event-sourcing model**: the triggering DamageApplied has already committed when this planner runs, so rather than mutate the original event we emit a compensating Healed. The bearer's HP nets out at `(damage - reduction)` and the audit trail preserves both the full hit and the reaction outcome. This is the same pattern as Uncanny Dodge and Absorb Elements.

**Tests** ([tests/unit/engine/slice-558-stones-endurance.test.ts](tests/unit/engine/slice-558-stones-endurance.test.ts), 8 cases): happy path (Healed + ResourceSpent + reaction); reduction capped at damageAmount (tiny damage / big roll); Healed amount = reducedBy; non-Goliath rejected; wrong ancestry rejected; depleted resource rejected; reaction-already-used rejected; zero damage → reducedBy=0 + no Healed but still consumes resource + reaction (consumer-side commit decision).

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
- [src/engine/plan/_giant-ancestry.ts](src/engine/plan/_giant-ancestry.ts) — new exported `validateGoliathAncestry(attacker, state, expectedOption, optionLabel)` helper. Throws the matching rejection if any of the three preconditions fail (Goliath species + matching ancestry choice + giant-ancestry resource > 0). The `optionLabel` parameter ("Hill's Tumble") feeds the error message.
- [src/engine/plan/attack.ts](src/engine/plan/attack.ts):
  - New AttackIntent + ResolveAttackInput dial `useGiantAncestryHillsTumble?: boolean`.
  - Three validation blocks now collapse to one-line calls of `validateGoliathAncestry(...)`. Hill's Tumble adds a 4th-line precondition: target size ≤ Large via the existing `creatureSize` derive + `isLargeOrSmaller` helper (reused from slice 446).
  - Hit-time arm: when set, calls `applyRiderCondition('prone')` (mirror of slice 556's Frost's Chill condition application). No damage component — Hill's Tumble doesn't deal extra damage.
  - Tail emits `ResourceSpent(giant-ancestry, 1)` after the other two arms' resource events.
  - Forwarded through planAttack's intent → resolveAttack mapping.

**Tests** ([tests/unit/engine/slice-557-hills-tumble.test.ts](tests/unit/engine/slice-557-hills-tumble.test.ts), 6 cases): happy path (Prone applied to Medium target + ResourceSpent + attacker as source); Huge target (Hill Giant statblock) rejected pre-attack; non-Goliath rejected via shared helper; wrong ancestry rejected via shared helper; depleted resource rejected via shared helper; no-dial: no Prone + no ResourceSpent.

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

Per-slice detail for slices 549-552 (post-L1-audit fixes: Rogue Sneak Attack finesse/ranged weapon gate; Cover bonus on Dex saves; Forest Gnome Speak with Animals per-rest cap; Reach property OA threat range) is archived at [docs/changelog/archive-slices-549-552.md](docs/changelog/archive-slices-549-552.md) (slice 558, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 545-548 (final L1 deep-audit closure cohort: planSecondWind for Fighter L1, Healer's Kit + planUseHealersKit, Savage Attacker audit-clarification, planRage + raging condition for Barbarian L1) is archived at [docs/changelog/archive-slices-545-548.md](docs/changelog/archive-slices-545-548.md) (slice 553).

Per-slice detail for slices 541-544 (the L1 SRD primitive-completion cohort: Dragonborn Breath Weapon; Heroic Inspiration first-class resource; Halfling Luck cohort sweep + helper extraction; Halfling Luck final 12-site sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md) (slice 548).

Per-slice detail for slices 536-540 (L1 SRD species coverage tail: Elf Trance; Human Resourceful narrative marker; Halfling Luck primitive + attack arm; Halfling Luck save + check arms; Dwarf Stonecunning per-Long-Rest BA tremorsense) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md) (slice 545).

Per-slice detail for slices 530-535 (L1 SRD species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy narrative markers) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md) (slice 541).

Per-slice detail for slices 525-529 (at-will monster spellcasting discovery + Pact of the Chain familiar combat-surface completion + cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md) (slice 537).

Per-slice detail for slices 520-524 (Spare the Dying + stabilize; Expeditious Retreat + planExpeditiousRetreatDash; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md) (slice 529).

Per-slice detail for slices 517-519 (Pact boon completion arc: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520).

Per-slice detail for slices 506-512 (L1-completion polish arc: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490).

Per-slice detail for slices 472-481 (post-alpha.15 iconic-encounter content sweep) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487).

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
