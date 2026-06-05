# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

Per-slice detail lives in [docs/changelog/slice-NNN.md](docs/changelog/) — the live file below carries only a compact pointer per slice (one headline + one-sentence summary) so the file stays bounded regardless of project age. Convention adopted in slice 628.

## Unreleased

**Content (slice 670): Slow (composite area condition)**
Closes 1 deferred L3 spell. Zero engine change. Slow: `save WIS -> slowed-by-spell-active`. New composite condition projects walk *0.5 / AC -2 / DEX-saves -2 — the load-bearing combat arms. Remaining RAW arms (no reactions / one-action-or-bonus / max-one-attack / spellcasting 50% gate) stay consumer-managed reads of the condition. Auto-cleared on concentration drop. 3 new tests. L3 wired 29 → 30 (2 deferred); aggregate 206/339 → 207/339; conditions 153 → 154.
Detail: [slice-670.md](docs/changelog/slice-670.md).

**Engine + content (slice 669): Dragon's Breath (on-action rider via dedicated planner)**
Closes the final L2 deferred spell — **L2 is now 100% wired-or-narrative.** Buff mechanic with `casterChoosesVariant` over 5 damage types applies a marker (`dragons-breath-<type>-active`) on the touched ally. New planner `planExhaleDragonsBreath({ characterId, damageType, targetIds })`: enforces the marker, derives slot level from the caster's concentration EffectInstance (3d6 + 1d6/slot above 2), computes the caster's spell save DC, rolls DEX save for each target (full damage on fail, half on success) with full mitigation + concentration-on-damage. Wired into performIntent dispatch + planner-wiring audit. 5 new conditions, 4 new tests. L2 wired 41 → 42 (0 deferred); aggregate 205/339 → 206/339; conditions 148 → 153.
Detail: [slice-669.md](docs/changelog/slice-669.md).

**Content (slice 668): Levitate (flight/hover via buff + levitating-active)**
Closes 1 deferred L2 spell, zero engine change. The `ModifySpeed fly` primitive (used by Fly + Dragon Wings) + the existing `buff` mechanic deliver the full RAW shape. Levitate gets the buff mechanic; new `levitating-active` condition projects `ModifySpeed fly 20` so the effective speed stack reflects RAW. Horizontal-block + 20-ft-up/down move-action are consumer-managed (engine has no positions). 4 new tests. L2 wired 40 → 41 (1 deferred); aggregate 204/339 → 205/339; conditions 147 → 148.
Detail: [slice-668.md](docs/changelog/slice-668.md).

**Content (slice 667): Phantasmal Force via existing recurring-rider primitive**
Closes 1 deferred L2 spell with zero engine change. The existing `recurring` mechanic schema comment explicitly cited Phantasmal Force as a canonical user; the engine had the primitive, the spell just needed authoring. Composition: `save INT -> phantasmal-force-active on fail` + `recurring damage 1d6 psychic` (consumer drives `planTickRecurring` on the target's turn). New `phantasmal-force-active` marker condition (auto-cleared on concentration drop via slice-110 sweep). Disbelieve-on-INT-investigation arm + "damage applies if phantasm could damage" arm stay consumer-driven (the engine doesn't model phantasm semantics). 4 new tests. L2 wired 39 → 40 (2 deferred). Aggregate 203/339 → 204/339; conditions 146 → 147.
Detail: [slice-667.md](docs/changelog/slice-667.md).

**Engine + content (slice 666): on-hit rider via castSpell (shining-smite, ray-of-enfeeblement)**
Second spell-wiring primitive of the post-L3-RAW push; closes 2 deferred L2 spells. New `conditionOnHit?: string` on the attack mechanic (plus `damageDice` now optional) — Ray of Enfeeblement: ranged spell attack with `conditionOnHit: 'enfeebled'`, no damage emitted; concentration drop sweeps the condition off the target via `sourceEffectInstanceId`. Shining Smite: existing buff + OnEvent infrastructure (zero engine change for this one) — `shining-smite-active` carries two consume-on-trigger OnEvent riders (+2d6 radiant on first melee hit + apply target debuff `shining-smite-target-illuminated` for advantage-to-attackers). 3 new conditions, 6 new tests; L2 spell wiring 37 → 39 (3 deferred). Aggregate 201/339 → 203/339 wired; conditions 143 → 146. Save-ends arms for both spells stay consumer-driven (no recurring-save mechanic today).
Detail: [slice-666.md](docs/changelog/slice-666.md).

**Engine + content (slice 665): non-damage area zone primitive (zone-of-truth, tiny-hut, wind-wall)**
First spell-wiring primitive of the post-L3-RAW push; closes 3 deferred L2/L3 spells with one event. New `SpellEffectStarted` event + `applySpellEffectStarted` reducer (sibling of ConcentrationStarted for non-concentration spells; creates an `EffectInstance` with `requiresConcentration: false` and does NOT claim the caster's concentration slot). Cleanup re-uses `ConcentrationBroken` (cleanup helper is type-agnostic) so `planExpireSpellDurations` works for both. planCastSpell extracts zone-payload computation as a single source of truth + adds an `else if (hasZoneMechanic)` branch for non-concentration zones. zone-of-truth + tiny-hut get `[{kind:'zone'}]` mechanic; wind-wall gets `targeting: { shape: 'line', size: 50 }` + the zone mechanic. L2 spell wiring 36 → 37 wired (5 deferred); L3 27 → 29 wired (3 deferred). 5 new tests; aggregate 198/339 → 201/339 wired across README / status / getting-started / starter-pack-gaps; doc-counts audit green.
Detail: [slice-665.md](docs/changelog/slice-665.md).

**Engine (slice 664): Deflect Attacks damage-pipeline auto-integration**
Closes the slice-660 deferral. `planDeflectAttacks` now emits a `Healed { amount: min(reduction, incomingDamage), source: 'deflect-attacks' }` after the marker event so the engine restores the deflected damage automatically — consumers no longer manually subtract reduction from the pending DamageApplied. New `appliedReduction` field on `DeflectAttacksOutcome`. `applyHealed`'s maxHP clamp + wasUnconscious branch handle over-heal cap + transient-0-HP edge cases for free. 6 new tests; slice-648 9 tests still green. **All three slice-660 RAW behavior gaps now closed.**
Detail: [slice-664.md](docs/changelog/slice-664.md).

**Engine (slice 663): always-enforce ability substitutions**
Closes the slice-660 "always-enforce mode for ability substitutions" deferral. `planAbilityCheck` now always validates `(ability, skill)`: accept iff the ability matches `SKILL_ABILITY[skill]` (the RAW default) OR a `GrantAbilitySubstitution` on the bearer's effect stack covers the combo and its `activeWhileConditionId` (if set) is satisfied. Otherwise throw. The `useAbilitySubstitution: boolean` field is retained as a no-op for back-compat (substitution is checked implicitly now). Pre-663 permissive behavior (any ability for any skill) is gone. 6 new tests + slice-659/662 tests updated. Full suite green (no other engine call site relied on permissive combos).
Detail: [slice-663.md](docs/changelog/slice-663.md).

**Engine + content (slice 662): generic `GrantAbilitySubstitution` Effect primitive**
Closes the slice-660 "generic primitive" deferral (and the original slice-659 follow-up). New effect kind `GrantAbilitySubstitution { ability, skills, activeWhileConditionId? }`. The slice-659 hardcoded Primal Knowledge gate (5 constants + multi-branch check) is replaced with an effect-stack walk + generic match. Primal Knowledge content ships the new effect; future ability-substitution features are content-only additions. Behavior preserved; error messages shifted to a generic shape (slice 659 tests updated). EFFECT_KINDS count 61 → 62 (61 primitives + `Custom`); doc-counts updated across README / status / concepts / authoring-content-packs.
Detail: [slice-662.md](docs/changelog/slice-662.md).

**Engine + content (slice 661): OfferChoice `lifecycle: 'supersede'` (land-swap supersession)**
Closes the slice-660 documented deferral. New optional `lifecycle?: 'accumulate' | 'supersede'` on `OfferChoiceEffect`, threaded through `ChoiceRequiredEvent` + `PendingChoice` + `collectResolvedChoiceEffects`. When `'supersede'`, the derive layer drops all but the latest resolved PendingChoice per promptKey (replay-honest: prior resolutions stay in state). Default `'accumulate'` preserves slice-618 behavior for every existing OfferChoice. Circle of the Land Spells ships `lifecycle: 'supersede'` so a druid who long-rests with Arid then Polar has only Polar's spells prepared, per RAW. First slice of the post-L3-RAW push (~16-slice plan to close L1+L2+L3 deferrals before release tag).
Detail: [slice-661.md](docs/changelog/slice-661.md).

**Engine + content (slice 660): `offerLongRestChoices` (Circle of the Land land swap)**
**Eighth and final slice of the L3 RAW-completeness push.** New planner `engine.plan.offerLongRestChoices` — sibling of slice-618's `offerCharacterChoices` for onLongRest OfferChoices. Dedupes against unresolved PendingChoices; lets resolved ones re-fire on subsequent long rests (RAW: "each long rest = new pick"). Circle of the Land Spells content flipped from `when: 'onAcquire'` → `when: 'onLongRest'`. Land-swap supersession (clearing the prior land's grants when a new land is picked) documented as deferred. **Land-swap supersession closed by slice 661.**
Detail: [slice-660.md](docs/changelog/slice-660.md).

**Engine (slice 659): Primal Knowledge ability-substitution gate**
RAW Barbarian L3 second arm: "while raging, may use STR for Acrobatics / Intimidation / Perception / Stealth / Survival." Slice 649 wired the first arm (OfferChoice for the extra skill prof); this slice wires the second via a new opt-in `useAbilitySubstitution: boolean` on `AbilityCheckIntent`. When set, planner enforces 4 gates (Barbarian L3+, raging, ability=STR, skill in 5-skill set); throws on failure. Default unset preserves permissive back-compat.
Detail: [slice-659.md](docs/changelog/slice-659.md).

**Engine (slice 658): Deflect Attacks counter arm**
Closes the slice-648 deferred counter arm. New optional `counterTargetId` on `DeflectAttacksIntent`; when supplied + reduction zeros incoming damage + monk has ≥1 ki, the planner spends 1 ki, rolls a DEX save against the counter target (DC = 8 + WIS + PB), and on failure deals 2 × Martial Arts die + DEX damage of the same type as the incoming attack. Range constraints (5 ft / 60 ft Total Cover) consumer-supplied. 5 new tests; back-compat with slice-648 reduction-only behavior preserved.
Detail: [slice-658.md](docs/changelog/slice-658.md).

**Engine + content + schema (slice 657): `partialShortFullLong` recharge primitive**
Discovered during authoring: pre-657 short-rest reducer didn't honor the `recharge` field at all — every `recharge: 'shortRest'` was silently long-rest-only. Slice 657 fixes both gaps in one: new `'partialShortFullLong'` enum value, new optional `ResourceState.recharge` field (default undefined preserves pre-657 behavior), and `applyShortRestEnded` now honors cadences (`'shortRest'` = full restore, `'partialShortFullLong'` = +1 capped). 8 Channel Divinity + Wild Shape content grants updated. Audit pins in L2 + L3 floors updated to match.
Detail: [slice-657.md](docs/changelog/slice-657.md).

**Tests (slice 656): L1+L2 multiclass build audit**
Sibling of slice 642's L1+L1 audit. Covers total-level-3 multiclass: one class at L1 + a different class at L2. Ordered pairs (Fighter1+Wizard2 ≠ Fighter2+Wizard1): 12 × 11 = 132 pairs. All 132 build + derive cleanly in ~345ms. Triple-class L1+L1+L1 (C(12,3) = 220) deferred to future hardening.
Detail: [slice-656.md](docs/changelog/slice-656.md).

**Tests (slice 655): L3 floor Section 7 — subclass L3 spell-list RAW pin**
Pins each of the 4 fixed-list L3 subclass spell features (Life Domain Spells, Devotion Spells, Fiend Spells, Draconic Spells) against SRD 5.2.1. Verifies: (1) the exact array of granted spell ids matches RAW, (2) every GrantSpell uses `preparation: 'always-prepared'`, (3) every granted spellId exists in the pack's spells catalog. All 4 match RAW exactly. Druid Circle of the Land Spells uses an OfferChoice and is pinned separately by slice 653's Section 6.
Detail: [slice-655.md](docs/changelog/slice-655.md).

**Engine + schema (slice 654): subclass-selection cascade**
Closes the second L3 RAW-completeness gap. planLevelUp at `newClassLevel === cls.subclassLevel` now emits a subclass-selection ChoiceRequired with the available subclasses as options + a `subclassChoiceForClassId` marker. planResolveChoice detects the marker and emits a new `SubclassChosen` event; the reducer assigns `enrollment.subclassId`. End-to-end cascade: Druid L2→L3 picks Circle of the Land, then re-invoking `offerCharacterChoices` surfaces the nested Circle Cantrip + Land Type choices. Old characters built with subclassId already set are unaffected (guard short-circuits the cascade).
Detail: [slice-654.md](docs/changelog/slice-654.md).

**Tests (slice 653): L3 floor Section 6 — OfferChoice cascade verification**
Verifies the 3 L3 OfferChoices wired in slices 649/652 actually fire via `engine.plan.offerCharacterChoices` for a fresh L3 character: Barbarian Primal Knowledge (6 skill options), Druid Circle of the Land Cantrip (11 cantrip options), Druid Circle of the Land Spells (4 SRD lands). All 3 pass — the cascade is sound. First slice of the L3 RAW-completeness push (8-slice plan after the user requested it).
Detail: [slice-653.md](docs/changelog/slice-653.md).

**Content (slice 652): Druid Circle of the Land Spells (L3 tier)**
Closes the last L3 content stub. SRD 5.2.1 ships 4 lands (Arid / Polar / Temperate / Tropical) — not 2014's 8. OfferChoice over 4 land options at L3, each granting 3 always-prepared spells (Arid: Blur / Burning Hands / Fire Bolt; Polar: Fog Cloud / Hold Person / Ray of Frost; Temperate: Misty Step / Shocking Grasp / Sleep; Tropical: Acid Splash / Ray of Sickness / Web). L5/L7/L9 tier expansions deferred to those tiers. **L3 punch list is now fully closed for content + planners.** Ready to tag `v0.4.0-alpha.0` ("L3 SRD complete").
Detail: [slice-652.md](docs/changelog/slice-652.md).

**Tests (slice 651): L3 fuzz matrix extension**
Extends slice 644's fuzz matrix from `LEVELS = [1, 2]` to `[1, 2, 3]`. New cell count: 3 × 4 × 3 = **36 cells × 20 seeds = 720 battles** per CI run, ~7.3s wall-clock. L3 cells exercise everything the L3 cycle introduced (Steady Aim / Fast Hands / Deflect Attacks planners, Paladin Channel Divinity, scaled-to-3 resources, plus L3 subclass features composing with them). All 720 complete without throwing.
Detail: [slice-651.md](docs/changelog/slice-651.md).

**Tests (slice 650): L3 floor Section 5 — resource scaffolding pin**
Mirrors slice 639/640's L2 resource pin pattern but for the four resources that scale to / come online at L3: Barbarian rage (max=3, longRest), Paladin channel-divinity (max=2, shortRest), Sorcerer sorcery-points (max=3 via formula, longRest), Monk ki (max=3 via formula, shortRest). Sorcerer + Monk formulas evaluate via `evaluateFormula` with a synthesized L3 `FormulaContext`. First of the L3 hardening cycle (mirror of L2's 639-644).
Detail: [slice-650.md](docs/changelog/slice-650.md).

**Content + audit (slice 649): L3 stub sweep (3 of 4)**
Flips two content stubs from slice 645's Section 4: Barbarian Primal Knowledge ships an OfferChoice over the 6 L1 Barbarian skills (`oneOf: 1`); Druid Circle of the Land Cantrip ships an OfferChoice over the 11 Druid cantrips. Reclassifies Hunter's Lore as intentionally narrative (RAW reveals immunity info; no shown-information primitive). Section 4 reorganized into three groups (planner-wired-intentional, narrative, still-unwired). Only Circle of the Land Spells remains as a still-unwired content stub.
Detail: [slice-649.md](docs/changelog/slice-649.md).

**Engine + schema (slice 648): Monk L3 Deflect Attacks planner (reduction arm)**
Reaction-style planner returning `DeflectAttacksOutcome { reduction, remainingDamage }` (mirrors `cuttingWords` / `shield` shape). Gates on Monk L3+, B/P/S damage, reaction-available. Reduction = 1d10 + DEX + monk level. Counter arm (Focus Point + DEX save + 2× Martial Arts die counter damage) and damage-pipeline auto-integration deferred. **Closes the last L3 planner xfail; all three L3 planner xfails are now wired (slices 646-648).** L3 punch list reduces to 4 non-planner content stubs + L3 hardening cycle.
Detail: [slice-648.md](docs/changelog/slice-648.md).

**Engine + schema (slice 647): Rogue Thief L3 Fast Hands planner**
BA dispatcher: gates on Rogue L3+ Thief, emits `ActionEconomyConsumed { bonusAction } + FastHandsActivated { mode }` where mode is `'sleightOfHand' | 'utilize' | 'useMagicItem'`. Consumer chains to `planAbilityCheck` / `planUtilize` / `planUseItem` per mode. Marker-only event avoids double-action-consumption from inline composition. Closes the second L3 planner xfail; 1 remaining (planDeflectAttacks).
Detail: [slice-647.md](docs/changelog/slice-647.md).

**Engine + schema (slice 646): Rogue L3 Steady Aim planner**
Two-arm self-effect using the per-turn flag pattern (mirrors Reckless Attack from slice 461): `steadyAimActive` consumed by next attack roll (new `SteadyAimActivated` + `SteadyAimConsumed` events); `speedZeroUntilEndOfTurn` consulted by `planMove` and cleared at next `TurnStarted`. Attack-side advantage applied in `resolveAttack` alongside the existing advantage sources. Closes the first L3 planner xfail; 2 remaining.
Detail: [slice-646.md](docs/changelog/slice-646.md).

**Tests (slice 645): CI-guarded "L3 SRD complete" floor audit**
Companion to slice 619 (L1) and slice 633 (L2). 32-test audit across 4 sections: per-class L3 features (4 classes have named L3 features; 8 have only subclass selection), per-subclass L3 features (12 canonical subclasses), planner presence (5 wired + 3 xfail: Steady Aim, Fast Hands, Deflect Attacks), and 7 content-stub pins. Defines the L3 punch list before any planner work lands. Opens the L3 cycle.
Detail: [slice-645.md](docs/changelog/slice-645.md).

**Tests (slice 644): fuzz matrix audit (L1 + L2 across shapes + rests)**
Supersedes slice 643's single-cell L2 fuzz floor. New matrix: 2 levels × 4 combat shapes (1v1 PC, 2v2 PC, 1v1 monster, 2v2 monster) × 3 rest cadences (none / short / long) × 20 seeds = **480 battles per CI run, ~5 sec wall-clock**. Closes the "no L1 fuzz coverage in CI at all" gap noted post-slice-643 (the L1 cycle's bug-finding fuzz never became a permanent guard until now).
Detail: [slice-644.md](docs/changelog/slice-644.md).

**Tests (slice 643): L2 fuzz floor**
Drives the existing combat-fuzz harness at L2: 20 seeded 1v1 PC-vs-PC battles, each runs to HP=0 or MAX_ROUNDS=20 without throwing. **Closes the L2-complete gate** — the L2 floor now covers feature presence, planner export, resource max + recharge, spell wiring floor, multiclass build cleanliness, AND end-to-end engine behavior. v0.3.0-alpha.0 ("L2 SRD complete") is unblocked. Total CI overhead: ~200ms.
Detail: [slice-643.md](docs/changelog/slice-643.md).

**Tests (slice 642): multiclass L1+L1 build audit**
Adds 67 tests (one per unordered class pair, plus enumeration sanity): each builds an L1+L1 character with all-14 stats, commits CharacterCreated, and confirms `engine.derive.character` returns a sheet without throwing. Closes the multiclass-at-total-level-2 gap the single-class L2 floor didn't cover. Fourth of five L2 hardening slices.
Detail: [slice-642.md](docs/changelog/slice-642.md).

**Tests (slice 641): per-level spell wiring floor enforcement**
Extends `gaps-spells-counts.test.ts` with a `MIN_WIRED_PER_LEVEL` ratchet: each level's wired count must stay at or above its slice-641 snapshot (L2 floor = 36). Lowering requires bumping the floor in the same slice; raising is silently allowed. Test count grows 23 → 33 (one new `it()` per level). First "ratchet" audit in the repo; pattern is reusable for any "this count can only go up" invariant.
Detail: [slice-641.md](docs/changelog/slice-641.md).

**Tests (slice 640): L2 floor Section 3 recharge-cadence pin**
Extends Section 3 with a recharge-field pin per resource (action-surge=shortRest, channel-divinity=shortRest, wild-shape=shortRest, ki=shortRest, sorcery-points=longRest). Documents two pre-existing partial-recharge RAW deviations (Channel Divinity, Wild Shape — engine binary model is over-permissive) inline so a future partial-recharge engine primitive can flip both atomically. Audit-only; no content or engine change.
Detail: [slice-640.md](docs/changelog/slice-640.md).

**Tests (slice 639): L2 floor Section 3 hardening (resource max-value pin)**
Promotes Section 3 from "GrantResource exists" to "GrantResource exists AND its L2 max evaluates to the RAW value." Pins Action Surge=1, Channel Divinity=2, Wild Shape=2, Ki=2, Sorcery Points=2 — the formula-driven Monk / Sorcerer maxes evaluate via `evaluateFormula` with a synthesized L2 context. First of five L2 hardening slices on the road to a defensible 0.3.0-alpha.0 tag.
Detail: [slice-639.md](docs/changelog/slice-639.md).

**Tests (slice 638): correct L2 floor's invocation-catalog audit query**
The final L2 xfail turned out to be an audit-authoring bug, not a content gap: the slice-633 audit queried `pack.eldritchInvocations` (nonexistent key), but invocations ship as `feats` with `category: 'invocation'` and the pack already has 16 of them. Corrected the query, flipped `it.fails` → `it`. **L2 floor is now 32/32 plain `it` — `0.3.0-alpha.0` ("L2 SRD complete") is unblocked.**
Detail: [slice-638.md](docs/changelog/slice-638.md).

**Engine + content + event schema (slice 637): Warlock L2 Magical Cunning planner**
Adds the new `PactSlotsRegained { count, source }` event (first mid-rest pact-slot-refund primitive) + reducer + transcript line; planner consumes the per-long-rest `magical-cunning` gate and emits a regain of `min(ceil(maxPactSlots/2), pactSlotsUsed)`. Closes the fourth L2 punch-list xfail; only the Eldritch Invocations catalog remains.
Detail: [slice-637.md](docs/changelog/slice-637.md).

**Engine + content + tests (slice 636): Monk L2 Uncanny Metabolism planner**
Adds `GrantResource { uncanny-metabolism, max 1, longRest }` to the L2 Monk feature (was `effects: []`); planner consumes the once-per-long-rest gate, emits `ResourceRestored { ki, 'all' }` to refund Focus Points, and `Healed { monkLevel + martial-arts die }`. First mid-encounter consumer of `ResourceRestored { amount: 'all' }`. Closes the third L2 punch-list xfail (2 remaining).
Detail: [slice-636.md](docs/changelog/slice-636.md).

**Engine + tests (slice 635): Cleric L2 Channel Divinity Divine Spark planner**
Sibling of Turn Undead (L2 CD) and Land's Aid (heal-or-damage save-for-half). Spends one CD use; heal mode emits Healed for NdN + WIS HP, damage mode rolls CON save for full / half necrotic-or-radiant damage. Dice scale 1d8 / 2d8 / 3d8 / 4d8 at cleric L2 / 7 / 13 / 18. Closes the second of slice 633's L2 punch-list xfails (3 remaining).
Detail: [slice-635.md](docs/changelog/slice-635.md).

**Engine + tests (slice 634): Fighter L2 Tactical Mind planner**
Self-targeted mirror of slice 358's Peerless Skill: spend a Second Wind use to roll 1d10 and boost a failed ability check; use refunded if the boost still fails. Closes the first of slice 633's five L2 punch-list xfails (4 remaining).
Detail: [slice-634.md](docs/changelog/slice-634.md).

**Tests (slice 633): CI-guarded "L2 SRD complete" floor audit**
Defines the L2-complete exit criteria via 32-test audit (27 pass + 5 xfail) modelled on slice 619's L1 floor; the five xfails (planTacticalMind, planDivineSpark, planUncannyMetabolism, planMagicalCunning, eldritch-invocation catalog) form the punch list for the 0.3.0-alpha.0 release.
Detail: [slice-633.md](docs/changelog/slice-633.md).

**Release (slice 632): bump to 0.2.0-alpha.0**
Promotes the post-alpha.15 cohort (~160 slices) to a tagged release; fixes one EFFECT_KINDS drift surfaced by `release:doc-review` and adds four pinned CHECKs for the front-door primitive citations so the next vocabulary bump trips CI in the same slice.
Detail: [slice-632.md](docs/changelog/slice-632.md).

## 0.2.0-alpha.0 - 2026-06-03

**Release (slice 632): bump to 0.2.0-alpha.0**

Promotes the post-alpha.15 cohort (slices 472-631, ~160 slices) to a tagged release. The minor-pre-1.0 bump (the "escape hatch" per [VERSIONING.md](VERSIONING.md)) marks this cycle's chapter status — full L1 SRD coverage now floor-guarded by audit, plus the documented breaking changes below — without claiming beta-ready API stability. `package.json` bumps `0.1.0-alpha.15` → `0.2.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: no breaking persisted-shape changes in this cycle.

### Highlights

- **L1 SRD floor (slices 530-619).** Every printed L1 species trait, class feature, weapon mastery, and SRD spell mechanic is now wired and floor-guarded by [tests/audit/srd-l1-complete.test.ts](tests/audit/srd-l1-complete.test.ts) (slice 619). The L1 fuzz cycle (slices 620-627) surfaced and closed RAW bugs in concentration RAW dispatch, rider-damage concentration triggers, Vex auto-expiry, Innate Sorcery's class gate, Monk Dexterous Attacks + Martial Arts Die scaling, the Graze hit/miss gate, and the on-hit mastery 0-damage gate. `engine.plan.offerCharacterChoices` now drains L1 OfferChoice entries on fresh characters (slice 618).
- **Fuzz tooling + web replay (slices 583-624).** New combat-fuzz CLI generates seeded markdown transcripts of L1-L5 PCs (and monsters) fighting each other; pool-based loadouts (slice 622) exercise 25+ distinct spells per seed across 7+ masteries. The web demo pivoted to a fuzz-replay viewer (slices 599-616) with LRU-bounded scrub cache, per-step incremental replay, and observer-review-driven readability polish.
- **Doc overhaul (slices 628-631).** CHANGELOG sustainability (pointer-per-slice + detail-per-file: live file 59 KB → 12 KB, growth per slice 4-9 KB → ~150 B); CLAUDE.md split into agent-only file (72 lines) plus [CONTRIBUTING.md](CONTRIBUTING.md) (288 lines), new [docs/architecture.md](docs/architecture.md), new [docs/engine-scope.md](docs/engine-scope.md) (the engine-tracks-vs-consumer-tracks reference); comprehensive feature tutorial at [docs/tutorial.md](docs/tutorial.md) with every typecheck-tagged block compiled against the real public API; numerical accuracy sweep that promoted the spell-wired percentage + EFFECT_KINDS citations to permanent CHECKs (doc-counts audit grew from 10 to 19 cases).
- **Engine vocabulary growth.** `EFFECT_KINDS` grew from 53 entries at alpha.15 to 61 (60 primitives + Custom). Spell mechanical wiring rose from 182/339 (~54%) to 198/339 (~58%). New planners across the cycle include polymorph / wild shape, simulacrum, wish, breath weapon (dragonborn), wholeness-of-body, peerless skill, cutting words, divine intervention, paladin's smite, frenzy, plus the action-economy planners (cunning action, second wind, lay on hands, search, study, influence, utilize, help, ready, dodge, dash, disengage).
- **Content depth.** Pact-boon completion (slices 517-519: Tome, Blade with `planConjurePactWeapon`, Chain with at-will Find Familiar); Warlock invocations content sweep (slices 513-516); monster Multiattack with Pack-Tactics-aware monsters; species coverage (Goliath, Tiefling Fiendish Legacy, Dragonborn Draconic Ancestry, Halfling Luck, Elf Trance, Dwarven Toughness, Dwarf Stonecunning).

### Breaking changes

#### Slice 603: `engine.plan.castSpell` on Produce Flame (and equivalent BA-cast + persistent + attack-mechanic spells) now requires Action available

**Pre-slice:** `engine.plan.castSpell({ spellId: 'produce-flame', targetIds: [...] })` succeeded if the caster had a Bonus Action available. The cast consumed only the BA but rolled the hurl-attack inline, so a consumer could "cast PF" while their Action was already used elsewhere.

**Post-slice:** the same call now throws if the caster's Action is already used when targets are supplied, with message: `"<Caster> cannot hurl <spell>: action already used this turn (RAW: a BA cast + Magic action hurl requires both unspent)"`. The cast consumes BOTH a Bonus Action AND an Action when targets are supplied (matching RAW: BA cast produces the flame, Magic action hurls). Cast-without-hurl (no targetIds) keeps the BA-only behavior.

**Why:** RAW correction. SRD 5.2.1 Produce Flame: "Casting Time: Bonus Action ... Until the spell ends, you can take a Magic action to hurl fire at a creature." The hurl IS a separate action. Pre-slice the engine collapsed cast + hurl into one BA, giving casters a free spell attack alongside their full Action.

**Migration:** consumers calling `castSpell` for Produce Flame inside a turn where Action is consumed should either:
- Cast without targets (BA only, no attack rolled) — gets the flame for light/utility.
- Wait until next turn to hurl — call `castSpell` separately when Action is free. (The engine doesn't yet model the persistent-flame state across turns; the proper-RAW split planner is tracked as an open follow-up in [slice 603's archive entry](docs/changelog/archive-slices-599-603.md).)

**Detection:** an existing campaign with a logged Produce Flame cast on a turn where Action was already used would still REPLAY correctly (replay-equivalence holds for committed events; the rejection happens at plan time only). The break only surfaces when new intents are planned.

### RNG-stream changes (per-seed reproducibility shifts)

Per [docs/determinism.md](docs/determinism.md), per-seed RNG reproducibility is version-sensitive. The following slices in this cycle changed RNG consumption patterns:

- Slice 601: CON save on every damage to a concentrating creature.
- Slice 602: 2 d20 rolls on spell attacks vs advantage-granting targets.
- Slice 611: Halfling Luck reroll + Bless bonus dice on spell attacks.
- Slice 612: per-component CON saves (one per damage source instead of one totaled).
- Slice 614: 2 d20 rolls on off-hand attacks vs advantage-granting targets.

A transcript from `combat-fuzz --seed N` generated on `0.1.0-alpha.15` will NOT byte-match the same command on `0.2.0-alpha.0` if any of these paths fired. Consumers depending on cross-version per-seed reproducibility should snapshot the resulting `CampaignState` alongside the seed.

### Cycle inventory

Per-slice detail for slices 472-621 lives in per-cohort `docs/changelog/archive-slices-NNN-MMM.md` files (the pre-slice-628 convention) plus the inline pointers below for slices 622-631 (the post-slice-628 per-slice-file convention). The pointer list below indexes both.

**Tests + docs (slice 631): numerical accuracy sweep + audit extension**
Extended doc-counts.test.ts to derive the spell wired/narrative/deferred/total split + rounded percentage from gaps-spells.md and pin five front-door-doc citations against the derived values. Updated stale percentages (README "~54%" → "~58%"; status.md "196/339" / "182" → "198/339"). Rewrote the two genuinely unmeasurable percentages ("~75% of planned EFFECT_KINDS", "~95% of printed mechanics") qualitatively per "CI-guarded or not stated."
Detail: [slice-631.md](docs/changelog/slice-631.md).

**Docs (slice 630): comprehensive feature tutorial**
New docs/tutorial.md walks every major capability end-to-end in one running example (install → engine → character → L1 choices → equip → derive → encounter → attack → spell → reaction → masteries → rests → level-up → event stream → save/load/replay → undo → custom content → custom handlers → determinism → engine scope). Every typecheck-tagged block compiles against the real public API via the doc-examples audit.
Detail: [slice-630.md](docs/changelog/slice-630.md).

**Docs (slice 629): CLAUDE.md split + engine-scope reference + tone polish**
Split the 464-line CLAUDE.md by audience: agent safety + pointers stay in CLAUDE.md (72 lines); universal contributor norms expand CONTRIBUTING.md (288 lines); architecture internals move to docs/architecture.md (new); engine-tracks-vs-consumer-tracks reference lands at docs/engine-scope.md (new).
Detail: [slice-629.md](docs/changelog/slice-629.md).

**Docs (slice 628): CHANGELOG sustainability — pointer-per-slice + detail-per-file**
Live CHANGELOG no longer holds verbose per-slice entries; full detail lives at `docs/changelog/slice-NNN.md`. Live file shrank from ~59 KB to ~10 KB; growth per slice now ~150 bytes instead of 4-9 KB.
Detail: [slice-628.md](docs/changelog/slice-628.md).

**Engine + tests (slice 627): Innate Sorcery advantage gates on Sorcerer-list spells**
Multiclass sorcerer/wizard casting a wizard-only spell (e.g. Acid Arrow) no longer gets the advantage; predicate gates on `event.spellCastingClassId === 'sorcerer'`.
Detail: [slice-627.md](docs/changelog/slice-627.md).

**Engine + tests + transcript (slice 626): three follow-up closures**
On-hit masteries skip the rider on a 0-damage hit; s23 Graze test actually tests Graze; transcript shows all d20 rolls when Halfling Lucky reroll grew the array.
Detail: [slice-626.md](docs/changelog/slice-626.md).

**Engine + tests (slice 625): Martial Arts Die scales monk weapons too**
Sibling fix to slice 623: `applyMartialArtsDieScaling` now keys off the same `martialArtsApplies` helper. Monk sickle / dagger / scimitar now roll the L1 1d6 instead of the weapon's native die.
Detail: [slice-625.md](docs/changelog/slice-625.md).

**Engine + tests (slice 624): Graze weapon mastery fires on MISS only**
`WeaponMasteryIntent` gained `attackHit?: boolean`; planner invariants enforce Graze=miss, Sap/Vex/Slow/Topple/Push/Cleave=hit. Fuzz dispatch gates accordingly.
Detail: [slice-624.md](docs/changelog/slice-624.md).

**Engine + tests (slice 623): three RAW bugs the slice-622 fuzz review surfaced**
Vex autoExpiry now keys on bearer's turn-end (new `expirySourceFromBearer` flag); Innate Sorcery advantage on spell attacks wired; Monk Martial Arts "Dexterous Attacks" (STR→DEX) extended to monk weapons.
Detail: [slice-623.md](docs/changelog/slice-623.md).

**Tooling + tests (slice 622): pool-based fuzz loadouts**
Per-class loadouts replaced with pools (weapon / armor / cantrip / L1-spell). Each seed exercises a different swath: 12→25 distinct spells, 3→7+ masteries, 15→42 items, 10→25 monsters.
Detail: [slice-622.md](docs/changelog/slice-622.md).

---

Per-slice detail for slices 620-621 (L1 fuzz concentration RAW work) is archived at [docs/changelog/archive-slices-620-621.md](docs/changelog/archive-slices-620-621.md).

Per-slice detail for slices 615-619 (web tooling polish, determinism docs, OfferCharacterChoices L1 cascade, SRD floor audit) is archived at [docs/changelog/archive-slices-615-619.md](docs/changelog/archive-slices-615-619.md).

Per-slice detail for slices 611-614 (`resolveAttackRoll` helper; per-component concentration saves; content-driven `ResourceSpent` wording; audit-rigor pass) is archived at [docs/changelog/archive-slices-611-614.md](docs/changelog/archive-slices-611-614.md).

Per-slice detail for slices 604-610 (observer-review polish: HP display clamp, RE + Shield wording, Beast-name regression, scrub cache) is archived at [docs/changelog/archive-slices-604-610.md](docs/changelog/archive-slices-604-610.md).

Per-slice detail for slices 599-603 (web demo becomes fuzz-replay viewer; engine fixes — auto-trigger CON save on damage, spell-attack target-advantage, Produce Flame BA+Action) is archived at [docs/changelog/archive-slices-599-603.md](docs/changelog/archive-slices-599-603.md).

Per-slice detail for slices 593-598 (combat-fuzz expansion: level-up to L2-5; rest cycles; 2v2; PC-vs-monster; 10 monster variety; species + class L1 BAs) is archived at [docs/changelog/archive-slices-593-598.md](docs/changelog/archive-slices-593-598.md).

Per-slice detail for slices 588-592 (combat-fuzz hardening: species resource grants; weapon mastery + RAW proficiency fixes for Rogue/Monk/Wizard; buff/utility spell policy; Shield reaction post-hit) is archived at [docs/changelog/archive-slices-588-592.md](docs/changelog/archive-slices-588-592.md).

Per-slice detail for slices 583-587 (spell-coverage aura-damage harness; Rules Lab removal; combat-fuzz CLI introduction; spell-attack trigger dispatch fix; transcript advantage fix) is archived at [docs/changelog/archive-slices-583-587.md](docs/changelog/archive-slices-583-587.md).

Per-slice detail for slices 580-582 (Option-C closure: Deafened auto-fail hearing checks; Frightened movement-gate audit; minimal encumbrance — Petrified ×10 + Goliath Powerful Build) is archived at [docs/changelog/archive-slices-580-582.md](docs/changelog/archive-slices-580-582.md).

Per-slice detail for slices 576-579 (auto-fail save consumption; `consumeOnCheck` + `consumeOnSave` + planBardicInspiration + Help-on-check; planLayOnHands; Search/Study/Influence/Utilize) is archived at [docs/changelog/archive-slices-576-579.md](docs/changelog/archive-slices-576-579.md).

Per-slice detail for slices 573-575 (per-class L1 end-to-end scenarios; CI-guarded L1 invariants audit; condition behavior tests + INCAPACITATING parity audit) is archived at [docs/changelog/archive-slices-573-575.md](docs/changelog/archive-slices-573-575.md).

Per-slice detail for slices 571-572 (planHelp — both modes; planReady) is archived at [docs/changelog/archive-slices-571-572.md](docs/changelog/archive-slices-571-572.md).

Per-slice detail for slices 569-570 (Exhaustion attack-roll + Speed penalties; Incapacitated → concentration-break on apply) is archived at [docs/changelog/archive-slices-569-570.md](docs/changelog/archive-slices-569-570.md).

Per-slice detail for slices 567-568 (condition effect-list completeness sweep + three attack-resolution gates: within-5-ft auto-crit, Prone asymmetric attacker advantage, Grappled non-grappler disadvantage) is archived at [docs/changelog/archive-slices-567-568.md](docs/changelog/archive-slices-567-568.md).

Per-slice detail for slices 565-566 (Hex ability-disadvantage rider; Favored Enemy Hunter's Mark pool-based free-cast) is archived at [docs/changelog/archive-slices-565-566.md](docs/changelog/archive-slices-565-566.md).

Per-slice detail for slices 562-564 (Eldritch Blast multi-beam scaling; Vicious Mockery disadvantage rider; per-caster L1 spellcasting math test suite) is archived at [docs/changelog/archive-slices-562-564.md](docs/changelog/archive-slices-562-564.md).

Per-slice detail for slices 560-561 (Human / Tiefling Medium-or-Small size choice; Druid Magician cantrip choice + audit clarifications) is archived at [docs/changelog/archive-slices-560-561.md](docs/changelog/archive-slices-560-561.md).

Per-slice detail for slices 553-559 (Goliath Giant Ancestry × 6 arms cohort + 3 missing focus variants) is archived at [docs/changelog/archive-slices-553-559.md](docs/changelog/archive-slices-553-559.md).

Per-slice detail for slices 549-552 (post-L1-audit fixes: Rogue Sneak Attack finesse/ranged weapon gate; Cover bonus on Dex saves; Forest Gnome Speak with Animals per-rest cap; Reach property OA threat range) is archived at [docs/changelog/archive-slices-549-552.md](docs/changelog/archive-slices-549-552.md).

Per-slice detail for slices 545-548 (final L1 deep-audit closure: planSecondWind; Healer's Kit + planUseHealersKit; Savage Attacker audit-clarification; planRage + raging condition) is archived at [docs/changelog/archive-slices-545-548.md](docs/changelog/archive-slices-545-548.md).

Per-slice detail for slices 541-544 (L1 SRD primitive completion: Dragonborn Breath Weapon; Heroic Inspiration first-class resource; Halfling Luck cohort sweep) is archived at [docs/changelog/archive-slices-541-544.md](docs/changelog/archive-slices-541-544.md).

Per-slice detail for slices 536-540 (L1 species coverage tail: Elf Trance; Human Resourceful narrative marker; Halfling Luck primitive + attack/save/check arms; Dwarf Stonecunning) is archived at [docs/changelog/archive-slices-536-540.md](docs/changelog/archive-slices-536-540.md).

Per-slice detail for slices 530-535 (L1 species coverage sweep: Tiefling Fiendish Legacy + Otherworldly Presence; Dragonborn Draconic Ancestry + Damage Resistance; Elf + Gnome Lineage choices; Human Versatile; Dwarven Toughness; Halfling Nimbleness + Naturally Stealthy) is archived at [docs/changelog/archive-slices-530-535.md](docs/changelog/archive-slices-530-535.md).

Per-slice detail for slices 525-529 (at-will monster spellcasting; Pact of the Chain familiar combat-surface; cross-monster sweep) is archived at [docs/changelog/archive-slices-525-529.md](docs/changelog/archive-slices-525-529.md).

Per-slice detail for slices 520-524 (Spare the Dying + stabilize; Expeditious Retreat; Venomous Snake; Pseudodragon Bite; Sphinx of Wonder Rend) is archived at [docs/changelog/archive-slices-520-524.md](docs/changelog/archive-slices-520-524.md).

Per-slice detail for slices 517-519 (Pact boon completion: ChoiceResolved cascade + Pact of the Tome; Pact of the Blade + planConjurePactWeapon; Pact of the Chain + at-will Find Familiar) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md).

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind; Repelling Blast + PushTarget) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md).

Per-slice detail for slices 506-512 (L1-completion polish: Cleric Divine Order test, Floating Disk reclassification, Skilled origin feat, stale-note sweep, Warlock invocation foundation) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md).

Per-slice detail for slices 501-505 (Shillelagh + weapon-buff; Ensnaring Strike; Weapon Mastery enforcement; Rogue Thieves' Cant sweep; Wizard Ritual Adept marker) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md).

Per-slice detail for slices 472-481 (post-alpha.15 iconic-encounter content sweep) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md).

## Older releases

Tagged release `0.1.0-alpha.15` lives in [docs/changelog/released-versions-alpha-15.md](docs/changelog/released-versions-alpha-15.md); `0.1.0-alpha.14` lives in [docs/changelog/released-versions-alpha-14.md](docs/changelog/released-versions-alpha-14.md); `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
