# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Docs: split the Deferred primitives backlog out of starter-pack-gaps.md (slice 336)**

[docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) had grown to ~56 KB (approaching the 60 KB single-Read ceiling), 64% of it the Deferred primitives backlog table. Per the doc-size playbook, that table moved to a new sibling [docs/gaps-deferred-primitives.md](docs/gaps-deferred-primitives.md) (36 KB); the front-door doc keeps a one-paragraph pointer and drops to ~21 KB. Updated the intro references + the sibling-catalog list; the new file is auto-covered by the doc-size audit's `docs/gaps-*.md` glob. No code or content change; docs only. doc-size audit green.

**Engine: Step of the Wind planner — Monk's Focus trio complete, 0 deferred main-class features (slice 335)**

Last of the three Monk's Focus bonus-action planners. With it, **all 17 SRD main-class features are mechanically closed** — the deferred-with-reason main-class-feature count reaches 0 (the long-standing Monk L10 Heightened Focus, which gated on this trio, is closed).

- New `planStepOfTheWind` ([src/engine/plan/step-of-the-wind.ts](src/engine/plan/step-of-the-wind.ts)) + `engine.plan.stepOfTheWind`: as a Bonus Action, a Monk (level ≥ 2) takes the **Dash** action; or with `spendFocusPoint: true`, spends 1 Focus Point to take both **Disengage and Dash**. Reuses the existing `Dashed` + `Disengaged` events under a Bonus Action. Requires the monk to be the active combatant in an active encounter (rejects double-dash / used bonus action); consumes the Bonus Action and (focus mode) 1 Focus Point. Takes no RNG.
- Consumer-managed (consistent with the engine's movement-geometry stance, where it models no jump distance or positions): the RAW focus-mode "jump distance is doubled" and the L10 Heightened Focus "a willing Large-or-smaller creature within 5 ft moves with you without provoking." Documented on the planner.

Uncle Bob audit: **Names** — `planStepOfTheWind` / `StepOfTheWindIntent` / `spendFocusPoint` match the trio's vocabulary. **DRY** — reuses the `Dashed` + `Disengaged` events (the `planDash`/`planDisengage` shapes) and the same encounter/bonus-action/ki gates as the slice-334 Patient Defense planner. **SRP** — orchestrates economy + resource + the two sub-actions; no new mechanics. **Magic numbers** — only the L2 threshold (named). **at-threading** — single `nowIso()` to every event; no RNG. **Mechanical outcomes asserted** — free mode emits `Dashed` + a bonusAction consume with no Focus Point and no Disengage (works at 0 ki, sets `turnUsage.dashed`); focus mode spends 1 ki and emits both `Dashed` + `Disengaged` (sets both flags; replay + RNG-capture hold); throws on no-Focus-in-focus-mode and out-of-encounter. **Tests** — 4 new ([tests/unit/engine/slice-335-step-of-the-wind.test.ts](tests/unit/engine/slice-335-step-of-the-wind.test.ts)); full suite green (1968 passed), tsc clean. Docs: api-overview class-action list; status.md + gaps + the class audit all updated to "Heightened Focus closed / 0 deferred main-class features."

**Engine: Patient Defense planner (slice 334)**

Second of the three Monk's Focus bonus-action planners, and the Patient Defense arm of L10 Heightened Focus.

- New `planPatientDefense` ([src/engine/plan/patient-defense.ts](src/engine/plan/patient-defense.ts)) + `engine.plan.patientDefense`: as a Bonus Action, a Monk (level ≥ 2) takes the **Disengage** action; or with `spendFocusPoint: true`, spends 1 Focus Point to take both **Disengage and Dodge**. At Monk level 10+ (Heightened Focus), spending the Focus Point also grants **Temporary Hit Points equal to two rolls of the Martial Arts die**. Reuses the existing `Disengaged` event + `dodged` condition under a Bonus Action; the Martial Arts die helper was exported from the attack planner.
- Requires the monk to be the active combatant in an active encounter (Disengage/Dodge are combat-positioning actions, mirroring `planDodge` / `planDisengage`); consumes the Bonus Action and (focus mode) 1 Focus Point. Free mode works regardless of Focus Points.

Scope: closes the **Patient Defense** arm of Heightened Focus. Only `planStepOfTheWind` remains; once it lands the deferred main-class-feature count reaches 0.

Uncle Bob audit: **Names** — `planPatientDefense` / `PatientDefenseIntent` / `spendFocusPoint` are intention-revealing. **DRY** — reuses the `Disengaged` event + `dodged` condition (the `planDisengage`/`planDodge` shapes) and the exported `martialArtsDie` rather than re-deriving; bonus-action + ki-spend shapes match the slice-333 Flurry planner. **SRP** — the planner orchestrates economy + resource + the two sub-actions + the L10 temp-HP roll. **Magic numbers** — the L2/L10 thresholds and the two-dice temp-HP count are named constants, RAW-cited. **at-threading** — single `nowIso()` to every event; the temp-HP dice are the only RNG (focus mode at L10+), baked into `TempHPGranted`. **Mechanical outcomes asserted** — free mode emits `Disengaged` + a bonusAction consume with no Focus Point spent (works at 0 ki); focus mode (L5) spends 1 ki + applies `dodged` with no temp HP (replay + RNG-capture hold); L10 focus mode grants temp HP in [2,16]; throws on no-Focus-in-focus-mode and out-of-encounter. **Tests** — 5 new ([tests/unit/engine/slice-334-patient-defense.test.ts](tests/unit/engine/slice-334-patient-defense.test.ts)); full suite green (1964 passed), tsc clean. Docs: api-overview class-action list, status.md + gaps Heightened Focus rows (Patient Defense arm closed).

**Engine: Flurry of Blows planner (slice 333)**

First of the three Monk's Focus bonus-action planners, and the Flurry arm of the L10 Heightened Focus feature (the last partly-deferred SRD main-class feature).

- New `planFlurryOfBlows` ([src/engine/plan/flurry-of-blows.ts](src/engine/plan/flurry-of-blows.ts)) + `engine.plan.flurryOfBlows`: a Monk (level ≥ 2) with a Focus Point spends 1 Focus Point as a Bonus Action to make **two Unarmed Strikes** — **three** at Monk level 10+ (the Heightened Focus upgrade, gated on monk level). The strikes resolve through the shared `resolveAttack` path (so the Martial Arts die, on-hit riders, and mastery all apply) and do not consume the Attack-action budget. Consumes the Bonus Action (when the monk is the active combatant; rejects if it's already used) and 1 Focus Point.
- Guards: rejects non-Monks ("does not have Monk's Focus"), zero Focus Points, and any weapon that isn't an Unarmed Strike (RAW: Flurry is Unarmed Strikes specifically).

RAW deviation: the "immediately after you take the Attack action" timing isn't enforced (the engine's bonus-action timing is loose); the Bonus Action + Focus Point are still spent.

Scope: this closes the **Flurry** arm of Monk L10 Heightened Focus. The other two Monk's Focus planners — `planPatientDefense` (free Disengage, or 1 Focus for Disengage + Dodge; L10 adds temp HP) and `planStepOfTheWind` (free Disengage/Dash, or 1 Focus for both + doubled jump; L10 ally-move) — remain, each carrying its own Heightened Focus L10 arm; once they land the deferred main-class-feature count reaches 0.

Uncle Bob audit: **Names** — `planFlurryOfBlows` / `FlurryOfBlowsIntent` match the planner-naming convention; the strike-count constants name the RAW thresholds. **DRY** — reuses `resolveAttack` (the multiattack pattern) for the strikes and the established ki-spend (stunning-strike) + bonus-action (innate-sorcery) shapes rather than re-implementing. **SRP** — the planner orchestrates economy + resource + strikes; the attack mechanics stay in `resolveAttack`. **Magic numbers** — 2 / 3 strikes and the L2 / L10 thresholds are named constants, RAW-cited. **at-threading** — single `nowIso()` resolution passed to every emitted event and each `resolveAttack`. **Mechanical outcomes asserted** — L2 spends exactly 1 Focus Point and emits 2 AttackRolled (ki goes 2→1, replay-equivalence + RNG-capture hold); L10 emits 3; throws on no-Focus / non-unarmed-weapon / non-Monk. **Tests** — 5 new ([tests/unit/engine/slice-333-flurry-of-blows.test.ts](tests/unit/engine/slice-333-flurry-of-blows.test.ts)); full suite green (1959 passed), tsc clean. Docs: api-overview class-action list, status.md + gaps Heightened Focus rows (Flurry arm closed).

**Docs: correct the AddBonusDie sibling-spell claim (slice 332)**

Corrected slice 331's over-claim that Guidance / Resistance / Bardic Inspiration "just need a check-roll consumption pass." `AddBonusDie` is the right primitive only for *always-on* per-roll dice (Bless/Bane). Those cantrips add a die to *one* roll then end — intentionally consumer-managed today (`guided`/`resisted` ship `effects: []`; the consumer rolls the d4 and removes the condition). Auto-applying `AddBonusDie` would wrongly add the die to every roll. The gaps backlog row was corrected to say so. Docs only.

**Engine + content: save-roll bonus dice — Bless/Bane fully RAW (slice 331)**

Closes the slice-330 follow-up: the Bless/Bane **save** arm is now a per-roll 1d4 everywhere, completing the RAW fix (the attack arm landed in slice 330). A bonus die can only be rolled in a planner, so this threads the bonus through every save-rolling site.

Engine:
- `computeSavingThrow` now surfaces the pending save bonus dice on its result (`bonusDice: BonusDieContribution[]`, queried from the effect stack via `bonusDiceFor({kind:'save', ability})`). Pure derivation — it returns the dice unrolled; the planner rolls them. The two non-rolling callers (`engine.derive` save surface, character-view) simply ignore the field.
- New shared `rollSaveBonusDice` helper ([src/engine/plan/_bonus-dice.ts](src/engine/plan/_bonus-dice.ts)) rolls the dice and returns the signed total + `breakdown` entries to merge into the `SaveRolled` event (no new event field needed — the existing `breakdown` carries each rolled die).
- Every save-rolling planner consumes it: the shared `rollSaveAgainstDC` helper (covers on-hit-save / use-item / breath-weapon / recurring-save), plus cast-spell, concentration (×2), trap, stunning-strike, transformations, movement, sensor, checks, reactive-spells, and travel. Each folds the die into `bonus` + `total` + `breakdown`. No RNG is consumed when a save has no bonus dice, so unaffected saves keep their exact stream.

Content: **Bless**/**Bane** save arms re-wired from flat `AddModifier ±2` to `AddBonusDie 1d4` (Bane `subtract: true`). Both spells are now fully RAW.

Scope / deferral: **Guidance / Resistance / Bardic Inspiration** are unblocked on the data side (the primitive supports them) — Resistance (save) wires for free now; Guidance/Bardic on *checks* need the same consumption pass on the ability-check roll path (a small follow-up). **weapon-mastery (Topple) and the contested-check planner** compute their bonus as a raw ability modifier (bypassing `computeSavingThrow`), so no effect-stack save modifier — Bless included — applies there; routing them through `computeSavingThrow` is a separate tracked slice (they never honored Aura of Protection / Bless either, so this is a pre-existing limitation, not a regression).

Uncle Bob audit: **Names** — `bonusDice` / `rollSaveBonusDice` mirror the attack-side vocabulary. **DRY** — the bonus is surfaced once (in `computeSavingThrow`) and rolled through one helper consumed at every site, rather than re-deriving per site; the helper builds on slice-330's `rollBonusDice`. **SRP** — derivation surfaces, planner rolls, helper formats the breakdown. **Magic numbers** — 1d4 RAW-cited on the conditions. **at-threading** — the die rolls in each planner with the d20; `apply` stays RNG-free; replay re-reads baked values. **Mechanical outcomes asserted** — `computeSavingThrow` for a blessed creature carries no static +2 and surfaces exactly one 1d4 save bonus die per ability (rules-truth test rewritten from the old +2 assertion); the showcase shows a blessed CON save rolling `+1d4`. **Tests** — rules-truth blessed test updated to the per-roll shape; full suite green (1954 passed), tsc clean. The showcase transcript was regenerated (Bless now rolls a save 1d4, shifting the seeded stream; replay-equivalence + RNG-capture still hold). Docs: gaps backlog row struck through (closed); the deferred-with-reason note now tracks the check-roll siblings + the raw-ability-modifier save sites.

**Engine + content: `AddBonusDie` primitive + Bless/Bane attack arm (slice 330)**

Fixes a long-standing RAW deviation: Bless/Bane were approximated as a flat +2/−2, but RAW is "add (or subtract) 1d4." A bonus *die* (unlike `AddModifier`'s static value) must be rolled fresh per affected roll, so it has to be consumed in the planner (where RNG lives) and baked into the emitted roll event — `apply()` stays RNG-free.

Engine:
- New `AddBonusDie { target: ModifierTarget; dice; subtract?; condition? }` effect kind (`EFFECT_KINDS` 51 → 52 entries = 51 primitives + `Custom`). `target` reuses the `ModifierTarget` vocabulary (attack / `{kind:'save'}` / `{kind:'check'}` and per-ability/skill forms); `subtract` flips the sign (Bane).
- `EffectAccumulator` gains a `bonusDice` collector + `bonusDiceFor(target, facts)` query (mirrors `modifierSum`, including the slice-299 `save:*`/`check:*` wildcard merge and predicate gating).
- New `rollBonusDice` planner helper ([src/engine/plan/_bonus-dice.ts](src/engine/plan/_bonus-dice.ts)) rolls each contribution and returns the signed total + per-die detail.
- The attack planner rolls the attack-target bonus dice after the d20(s), folds the signed total into `attackBonus` (so `total === usedD20 + attackBonus` still holds), and records the dice on the new optional `AttackRolled.bonusDice` field (transcript shows e.g. `d20(1) + 8 [+1d4=2 condition] = 9`). No RNG is consumed when no bonus dice apply, so unblessed attacks keep their exact stream.

Content: **Bless**/**Bane** attack arms re-wired from flat `AddModifier` to `AddBonusDie 1d4` (Bane `subtract: true`).

Scope / deferral: only the **attack** arm is RAW now. The **save** arm stays the flat +2/−2 approximation (no regression) because a per-roll save die needs every save-roll site to consume `AddBonusDie`, and the engine has ~13 inline save-roll sites (only 4 share the slice-320 `rollSaveAgainstDC` helper). The tracked follow-up — centralize the remaining ~9 save sites through that helper, then add `bonusDiceFor({kind:'save'})` to it — makes Bless/Bane saves RAW **and** unblocks the siblings the primitive already supports (Guidance, Resistance, Bardic Inspiration).

Uncle Bob audit: **Names** — `AddBonusDie` / `bonusDiceFor` / `rollBonusDice` say what they are; `subtract` mirrors the RAW sign. **DRY** — `bonusDiceFor` reuses the modifier key + wildcard-merge helpers; the roll helper is the single bonus-die roller (attack uses it now, saves/checks will). **SRP** — schema / accumulator / roll-helper / planner each in their own layer. **Magic numbers** — 1d4 is RAW-cited on the conditions. **at-threading** — unchanged; the die rolls in the planner, baked into `AttackRolled`. **Mechanical outcomes asserted** — a plain attack has no `bonusDice` and `total === d20 + attackBonus`; Bless adds exactly one 1d4 (1-4) folded into the bonus; Bane subtracts a 1d4; same seed shows the d20 unchanged and the die added on top. **Tests** — 3 new ([tests/unit/engine/slice-330-add-bonus-die.test.ts](tests/unit/engine/slice-330-add-bonus-die.test.ts)); full suite green (1954 passed), tsc clean. The showcase transcript was regenerated (Bless now rolls a 1d4, shifting the seeded stream from that point — replay-equivalence + RNG-capture still hold). Docs: README / status.md / api-overview EFFECT_KINDS count 51 → 52; gaps backlog row (attack arm closed, save arm + siblings tracked).

**Docs: fix the SRD-compliance aggregate contradiction + sweep remaining stale numbers (slice 329)**

Follow-up accuracy pass. The status.md "SRD-compliance ~85%" headline row contradicted its own wired rows (it claimed "the remaining 15% is mechanical wiring depth" while the table shows spells ~47% / magic items ~35% / subclasses ~33% wired) and carried a stale "~195 spells schema-only" figure. Relabeled the row to **"SRD pack-presence + architecture"** — explicitly a presence-and-readiness number, not a mechanical-wiring number — with a pointer to the per-row wired figures for "how much does the engine actually execute." Then swept the rest of the live docs for stale counts:

- [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md): spell wiring "~147 (139 + 11)" → "164 via `mechanicalEffects` + 11 planners".
- [docs/getting-started.md](docs/getting-started.md): the starter-pack contents sentence was badly stale (399 spells, 7 species, 9 magic items, 6 monsters, 25 conditions, ~36 weapons, etc.) → refreshed to 351 spells / 9 species / 258 magic items / 253 monsters / 116 conditions / 52 weapons / 22 armors / 37 tools / 77 gear / 69 consumables / 35 feats.
- [docs/parallel-authoring.md](docs/parallel-authoring.md): "~1452 tests as of slice 177" → "~1951 tests as of slice 328".
- [docs/gaps-class-features.md](docs/gaps-class-features.md): the Mystic Arcanum deferral said "the pack ships 0 spells at L6-9" — it now ships 84; the real blocker (Warlock list curation) is preserved.

Frozen docs (CHANGELOG release blocks + `docs/changelog/` archives + the `srd-5.2.1-audit-*` / content-attribution point-in-time records + roadmap per-slice deliverables) were intentionally left as historical snapshots. Docs only; doc-size audit green.

## 0.1.0-alpha.10 - 2026-05-20

Promotes the post-alpha.9 cohort (slices 315-328) to a tagged release. `package.json` bumped from `0.1.0-alpha.9` to `0.1.0-alpha.10`; `package-lock.json` regenerated via `npm install --package-lock-only`. Per-slice detail for slices 315-322 is archived to [docs/changelog/archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md) (slice 326). Cohort summary:

- **Magic equipment became real equipment** (stages 1-3, slices 315-317): single-base magic armor `magic`→`armor`, single-base magic weapons `magic`→`weapon`, and multi-base magic equipment via the `enchantmentDefinitionId` enchantment overlay. The AC derive, attack planner, effect projection, and magicality detector all read the overlay.
- **On-hit weapon-rider trigger family** (slices 318-325): an `onHit` rider can carry extra `dice`, a target-gated `condition` predicate, a `save` arm (`conditionOnFail` / `conditionOnSuccess` / `destroyOnFail` / `hpThreshold`), an unconditional `applyConditionId`, an unconditional `destroy` arm, and a `requiresCritical` crit-gate — all composable. A new `CreatureDestroyed` event models instant death bypassing death saves. Canonical users: Sun Blade, Mace of Disruption (destroy-or-Frighten), Ghoul's Claw, Couatl's Bite, the Wyvern / Ettercap / Merrow poison sweep, Sword of Life Stealing (crit), Mace of Smiting (crit + Construct auto-destroy). Slice 320 unified all four save-roll sites on a shared `rollSaveAgainstDC` helper.
- **Doc hygiene** (slices 326-327): archived the 315-322 per-slice detail when the live CHANGELOG approached the 60 KB single-Read ceiling; refreshed the README + status.md counts to current state.

Net across the cohort: 1908 → 1951 tests across 288 files; item recategorization (weapons 39 → 52, armor 13 → 22, consumables 52 → 69, magic items 292 → 258 as single-/multi-base magic equipment moved to their real categories); one new event type (`CreatureDestroyed`); `EFFECT_KINDS` unchanged at 51 (50 primitives + `Custom`). tsc clean; full suite green; doc-size + SRD-drift + pack-integrity + RAW-compliance audits all green.

**Release: bump to 0.1.0-alpha.10 (slice 328)**

Version bump + this CHANGELOG release block + tag `v0.1.0-alpha.10`. No code change. The previous `## Unreleased` heading became `## 0.1.0-alpha.10 - 2026-05-20`; a fresh empty `## Unreleased` sits above for the next cohort.

**Docs: refresh README + status.md numbers to current state (slice 327)**

Accuracy pass: corrected stale counts that had drifted across the magic-equipment + rider work — test count (1833/268 → 1951/288), item totals (weapons 39 → 52, armor 13 → 22, consumables 52 → 69, magic 292 → 258), magic-item wiring (~86/292 → ~91/258), spell wiring (reconciled the 147-vs-160 inconsistency to the actual 164 via `mechanicalEffects`), conditions (reconciled the 102-vs-98 inconsistency to 116 = 15 RAW + 101 rider), and the `EFFECT_KINDS` off-by-one (50 primitives + `Custom` = 51 entries). Docs only; doc-size audit green.

**Docs: archive slices 315-322 per-slice detail (slice 326)**

The live CHANGELOG had climbed to 48 KB (approaching the 60 KB single-Read ceiling) across the post-alpha.9 cohort. Per the doc-size discipline playbook, the per-slice detail for the magic-equipment + on-hit-rider arc (slices 315-322) moved to [docs/changelog/archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md); the live file keeps a cohort summary + pointer (below) and the most recent three slices (323-325) inline. The archive pointer-block index gained the new file. No code or content change; docs only. doc-size audit green; live CHANGELOG back to ~27 KB.

**Engine + content: unconditional destroy rider arm + Mace of Smiting (slice 325)**

Adds the no-save sibling of slice 323's save-gated destroy, completing Mace of Smiting (crit damage tiers + the Construct auto-destroy).

Engine:
- The `onHit` rider gains an optional `destroy: { hpThreshold? }` arm. When the rider fires (its gates pass) and the target's HP AFTER the hit's damage is at or below `hpThreshold` (or always, when omitted), the target is destroyed (`CreatureDestroyed`, bypassing death saves) — no save, unlike slice 323's `save.destroyOnFail`. Parallels how `applyConditionId` is the unconditional sibling of `save.conditionOnFail`.
- The planner factored a `destroyTarget()` closure (reused by the save-gated and unconditional destroy paths) and an `hpWithin(threshold)` helper over the once-computed post-damage HP (shared by `save.hpThreshold` and `destroy.hpThreshold`).

Content (canonical user): **Mace of Smiting** — its existing `itemKind: 'weapon'` entry gains two crit riders (slice 324 `requiresCritical` + the `0d6+N` flat shape): "+7 Bludgeoning on a 20, or +14 if it's a Construct" (gated `not Construct` / `eq Construct`), and the Construct rider carries `destroy: { hpThreshold: 25 }` for "If a Construct has 25 Hit Points or fewer after taking this damage, it is destroyed."

Deferred: the "+3 vs a Construct" attack/damage bonus is a predicate-gated *base* enhancement (every hit, not just crits), a distinct primitive from the onHit riders — still deferred.

Uncle Bob audit: **Names** — `destroy` / `hpThreshold` mirror the save arm's vocabulary; `destroyTarget` / `hpWithin` are intention-revealing. **DRY** — extracted `destroyTarget` (was an inline literal in the save branch) and `hpWithin` over a single post-damage-HP read, both now shared by the save-gated and unconditional paths. **SRP** — schema arm, planner emission, content wiring each in their layer. **Magic numbers** — 7 / 14 / 25 / Construct are RAW-cited on the item. **at-threading** — `CreatureDestroyed` carries the planner's single `at`; no new RNG. **Mechanical outcomes asserted** — a crit vs a Humanoid adds +7 flat bludgeoning and no destroy; a non-crit adds nothing; a crit vs a high-HP Construct adds +14 but doesn't destroy (over threshold); a crit that leaves a Construct at <= 25 HP destroys it (hp 0, 3 failures) with replay-equivalence + RNG-capture holding. **Tests** — 4 new ([tests/unit/engine/slice-325-mace-of-smiting.test.ts](tests/unit/engine/slice-325-mace-of-smiting.test.ts)); full suite green (1951 passed), tsc clean. Coverage snapshot unchanged. Docs: gaps Items.

**Engine + content: crit-gated on-hit riders + Sword of Life Stealing (slice 324)**

Adds the last trigger gate to the on-hit-rider family: a rider can fire only on a critical hit (the 2024 "When you roll a 20 on the attack roll, the target takes an extra ..." shape).

Engine:
- The `onHit` rider schema gains optional `requiresCritical: boolean`. The attack planner's rider filter (which already gates on the slice-318 `condition` predicate) now also drops `requiresCritical` riders when the hit isn't a crit. The two gates compose. No new damage machinery: 2024 crit riders deal *flat* extra damage, which the existing dice field already expresses as a `0d6+N` constant (slice 122), and crit-doubling correctly leaves the flat amount unchanged (RAW doubles dice, not flat bonuses).

Content (canonical user): **Sword of Life Stealing** (a multi-base weapon enchantment, applied via the slice-317 overlay) gains its RAW crit rider — "When you roll a 20 ... the target takes an extra 15 Necrotic damage if it isn't a Construct or an Undead" — as `{ dice: '0d6+15', damageType: 'necrotic', requiresCritical: true, condition: not(Construct or Undead) }`.

Deferred: the "you gain Temporary Hit Points equal to the Necrotic damage taken" self-buff arm (the rider applies to the target; an attacker-side temp-HP arm is a future shape). Mace of Smiting's crit +7/+14 (flat, with a Construct auto-destroy) and Vorpal's crit decapitation (needs a head / too-big / Legendary-Resistance immunity fact before it can reuse the slice-323 `CreatureDestroyed` arm) stay deferred, but the crit-gate they need now exists.

Uncle Bob audit: **Names** — `requiresCritical` says what it gates. **DRY** — reused the existing rider filter, the `0d6+N` flat-damage shape (no new flat-damage field), and the slice-318 `condition` gate; the crit rider rides the same `rollExtraDamageDice` path. **SRP** — one boolean on the schema, one clause on the planner filter. **Magic numbers** — 15 / necrotic / Construct / Undead are RAW-cited on the enchantment. **at-threading** — unchanged (riders roll in the planner, baked into `DamageRolled`). **Mechanical outcomes asserted** — a crit vs a Humanoid emits a necrotic component of exactly +15 flat (0 dice, modifier 15, not doubled); a non-crit hit emits no necrotic; a crit vs a Construct or Undead emits no necrotic (gate). **Tests** — 3 new ([tests/unit/engine/slice-324-crit-rider.test.ts](tests/unit/engine/slice-324-crit-rider.test.ts)); full suite green (1947 passed), tsc clean. Coverage snapshot unchanged (the enchantment stays `itemKind: magic`). Docs: gaps Items.

**Engine + content: instant-destroy primitive + Mace of Disruption destroy-or-Frighten (slice 323)**

Adds the instant-death outcome the on-hit-save rider needed for Mace of Disruption (and the shared primitive future Vorpal-style decapitation will reuse). "Destroyed" / "dies instantly" is a real RAW outcome distinct from damage: the creature dies, bypassing the death-save sequence.

Engine:
- New `CreatureDestroyed` event ([combat.ts](src/schemas/events/combat.ts)) + reducer `applyCreatureDestroyed`: sets `hp.current` to 0 and `deathSaves.failures` to the kill threshold (so anything reading "dead" via death saves sees a dead creature), clears the destroyed creature's concentration (RAW: dying ends Concentration). Wired into [apply.ts](src/engine/apply.ts), the events barrel (5 registration sites), and the transcript formatter.
- The `onHit` rider's `save` arm gains three fields: `hpThreshold` (the save fires only when the target's HP AFTER this hit's damage is at or below it — read from the post-damage state the planner already computes), `destroyOnFail` (emit `CreatureDestroyed` on a failed save, taking precedence over `conditionOnFail`), and `conditionOnSuccess` (a condition applied on a successful save). `conditionOnFail` is now optional; a refine requires the save to have at least one outcome.

Content (canonical user): **Mace of Disruption**'s existing +2d6-radiant-vs-Fiend/Undead rider now also carries the save — RAW "If the target has 25 HP or fewer after taking this damage, DC 15 WIS save or be destroyed; on a success it's Frightened until the end of your next turn." (`hpThreshold: 25, destroyOnFail: true, conditionOnSuccess: 'frightened', sourceIsMagical: true`.) Closes the slice-319 follow-up for this item.

Deferred: the Frightened "until the end of your next turn" duration is consumer-managed (mirror of slices 286/319/321); the Light emanation stays unmodeled. Vorpal-style crit-gated decapitation will reuse `CreatureDestroyed` once the crit-gate rider trigger lands.

Uncle Bob audit: **Names** — `CreatureDestroyed` / `destroyOnFail` / `hpThreshold` / `conditionOnSuccess` say what they are. **DRY** — the reducer reuses the existing massive-damage death representation (failures = kill threshold) and `clearConcentrationEffect`; the planner reuses `applyRiderCondition` for both success and fail conditions; the HP gate reads the already-computed `stateAfterDamage`. **SRP** — event/reducer/planner/schema each in their own layer; the reducer does one thing (mark dead). **Magic numbers** — DC 15 / 25 HP / WIS / Frightened are RAW-cited on the content item; the kill threshold is the existing `DEATH_SAVE_FAILURES_TO_DIE` constant. **at-threading** — `CreatureDestroyed` carries the planner's single resolved `at`; the save's RNG rolls in the planner, apply stays RNG-free. **Mechanical outcomes asserted** — a failed save against a sub-25-HP Undead emits `CreatureDestroyed` and leaves the target dead (hp 0, 3 failures) with replay-equivalence + RNG-capture holding; a successful save Frightens instead; a 200-HP Undead rolls no save (over threshold) but still takes radiant; a Humanoid gets neither save nor radiant (vs-Fiend/Undead gate). **Tests** — 6 new (2 reducer [tests/unit/reducers/creature-destroyed.test.ts](tests/unit/reducers/creature-destroyed.test.ts) + 4 integration [tests/unit/engine/slice-323-destroy-rider.test.ts](tests/unit/engine/slice-323-destroy-rider.test.ts)); full suite green (1944 passed), tsc clean. Coverage snapshot unchanged. Docs: api-overview event list, gaps + slice-319 follow-up closure.

**Magic-equipment + on-hit-rider cohort (slices 315-322)** — per-slice detail archived to [docs/changelog/archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md) (moved in slice 326 when the live CHANGELOG approached the 60 KB single-Read ceiling). Cohort summary:

- **Magic equipment became real equipment** (stages 1-3, slices 315-317): single-base magic armor re-modeled `magic`→`armor` (AC derive grants base AC + `acBonus`; effects project when worn+attuned); single-base magic weapons `magic`→`weapon` (attack planner applies `attackBonus`/`damageBonus`/`onHit` riders); multi-base magic equipment via the **enchantment overlay** (an `itemKind: magic` enchantment referenced by `ItemInstance.enchantmentDefinitionId`, overlaid by the attack / AC / effect-projection / magicality layers). The slice-90 `rollExtraDamageDice` was generalized into the `onHit` per-hit rider.
- **On-hit weapon-rider trigger family** built out: target-gated `condition` predicate (318: Sun Blade vs Undead, Mace of Disruption vs Fiend/Undead); the save-or-condition `save` arm (319: Ghoul's Claw, CON DC 10 or Paralyzed) plus the `rollSaveAgainstDC` DRY refactor unifying all four save-roll sites (320); the unconditional `applyConditionId` (321: Couatl's Bite Poisoned); and a poison natural-weapon content sweep exercising the combined damage+condition rider (322: Wyvern / Ettercap / Merrow).

Net across the cohort: weapons 39 → 52, armor 13 → 22, magic items 275 → 258; ~1908 → 1938 tests; the new `enchantmentDefinitionId` overlay plus the full `onHit` rider vocabulary (`dice` / `condition` / `save` / `applyConditionId`).

## 0.1.0-alpha.9 - 2026-05-19

Promotes the post-alpha.8 cohort (slices 301-314) to a tagged release. `package.json` bumped from `0.1.0-alpha.8` to `0.1.0-alpha.9`; `package-lock.json` regenerated via `npm install --package-lock-only`. Per-slice detail for slices 301-312 is archived to [docs/changelog/archive-slices-301-312.md](docs/changelog/archive-slices-301-312.md) (slice 313 = the archive split; slice 314 = this version bump + tag). Cohort summary:

- **Buff-shape spell sweep (301-302)**: wired True Seeing, Warding Bond (3/4 arms), Heroes' Feast, Wind Walk via existing primitives. Surfaced + tracked the dead-2014-orphan-conditions row and the Warding Bond damage-sharing deferral.
- **pack-integrity audit + dead-orphan cleanup (303-304)**: promoted the slice-298/301 sweeps to [tests/audit/pack-integrity.test.ts](tests/audit/pack-integrity.test.ts) (duplicate-id, wired/empty name-group, orphan-condition checks); removed the 6 dead 2014-era orphan conditions; added two CLAUDE.md pattern-check norms (promote-sweeps-to-audits; under-walking-references false-positive trap).
- **Magic-item buff sweep (305-312)**: ~22 magic items wired through existing primitives (rings, robes, staves, rods, a medallion, potions, scrolls). Drove the magic-item wired count 64 → 86.
- **`IncreaseAbilityScore` primitive (308)**: new additive-ability-score effect kind (`EFFECT_KINDS` 50 → 51 primitives + `Custom`), distinct from `OverrideAbilityScore`; unblocked the six ability Ioun Stones + Belt of Dwarvenkind's Toughness arm.
- **`itemKind` categorization fixes + permanent guards (309-310)**: a full SRD-type vs pack-`itemKind` cross-reference found + fixed 4 mislabeled Potions and 10 generic Spell Scroll templates (`magic` → `consumable`); each class is now guarded (srd-drift SRD-Potion check; pack-integrity spell-scroll id check). The categorization bug class is closed.

Net across the cohort: 1833 → 1908 tests; magic-item wired count 64 → 86; conditions +1 (`potion-of-invulnerability-active`) / -6 (dead orphans); `EFFECT_KINDS` 50 → 51 primitives.

**Docs: archive slices 301-312 per-slice detail (slice 313)**

The live CHANGELOG was approaching the 60 KB single-Read ceiling (44 KB after slice 312, climbing ~2-3 KB per slice). Per the doc-size discipline playbook, the per-slice detail for the post-alpha.8 cohort (slices 301-312) moved to [docs/changelog/archive-slices-301-312.md](docs/changelog/archive-slices-301-312.md) (31 KB, fits a single Read); the live file keeps the cohort summary above plus this note. The archive pointer-block index below gained the new file. No code or content change; docs only. doc-size audit green.

## 0.1.0-alpha.8 - 2026-05-19

Promotes the slices 282-299 cohort to a tagged release. Eighteen slices on top of alpha.7. `package.json` version bumped from `0.1.0-alpha.7` to `0.1.0-alpha.8`; `package-lock.json` regenerated via `npm install --package-lock-only`. The previous `## Unreleased` heading becomes `## 0.1.0-alpha.8 - 2026-05-19`.

Headline themes for the cohort:

- **Consumable surface near complete.** ConsumeAction union grew through `GrantTempHP` (slice 282), `RemoveConditions` + `RemoveExhaustion` (slice 283), and `ApplyItemBuff` (slice 284). Drives consumables wired count to 42/52 (~81%). Canonical users: Potion of Heroism, Potion of Vitality, Oil of Sharpness, Poison Basic, Antitoxin (slice 291), Perfume (slice 292).
- **UseAction surface extended.** New `Save` variant (slice 286) for Pipes of Haunting's item-fixed-DC save mechanic. New `timeBudget` field on MagicItemSchema (slice 293) for Boots of Speed's cumulative 10-minute-per-long-rest cap, with `ItemTimeBudgetConsumed` event + `minutesElapsed` on UseItemIntent + LR reset hook.
- **Non-walk speed mechanically observable.** Slice 288 added `getEffectiveFlySpeed` / `Swim` / `Climb` / `Burrow` derives over the slice-77 walk algorithm. Slice 290 added the `matchWalkSpeed` op on `ModifySpeed` for "climb speed equal to walk speed" RAW (Cloak of Arachnida, Slippers of Spider Climbing, Spider Climb spell). Slice 289 wired Cloak of the Bat's fly-speed Toggle on top.
- **Three new predicate facts.** Slice 291 added `event.savePreventsCondition` (Antitoxin's "advantage on saves vs Poisoned" gate). Plus the slice-294 consumer-coordinated facts tracking section (catalogs the slice-276 / 278 / 279 LoS / lightLevel slots so future consumers know what to populate).
- **Variant-unroll content sweep.** Slices 295 + 296 carry the slice-229 Belt of Giant Strength pattern forward to the SRD d10 damage-type table: 10 Armor of Resistance variants + 10 Ring of Resistance variants + 10 Potion of Resistance variants + 5 new `protection-*-active` conditions. Slice 297 added the Elvenkind Stealth wires (Boots + Cloak). Slice 298 wired Eyes of Minute Seeing, Headband of Intellect, Necklace of Adaptation, Periapt of Health.
- **AddModifier save/check wildcard primitive.** Slice 299 mirrored slice-266's RollTarget wildcard onto `ModifierTarget`. Stone of Good Luck is the canonical user (12 unrolled entries → 2 wildcard). Five sibling cleanups (Cloak/Ring of Protection, blessed/baned, aura-of-protection-active + Paladin L6 self-effect) refactored in the same slice. 36 entries → 6 effective.
- **Two bugs caught via pattern-check.** (1) Slice 298 found a Stone of Good Luck duplicate pack entry (wired entry's name mismatched SRD canonical, so drift audit silently skipped it). Resolved. (2) Slice 299 surfaced Bless / Bane flat +2 / -2 vs RAW 1d4 deviation (pre-existing approximation documented in rules-truth.test.ts since the original wire). Tracked as deferred row for a future per-roll bonus-die primitive.
- **Doc-size audit shipped.** Slice 285 added [tests/audit/doc-size.test.ts](tests/audit/doc-size.test.ts) asserting every front-door doc + each `docs/changelog/*.md` archive + each `docs/gaps-*.md` catalog stays under the 60 KB single-Read ceiling. Closes the slice-270 / 277 recurring archive cadence.

Net counts: 1728 → 1833 tests across 253 → 268 files (+105 tests, +15 files). Magic-item wired count: 27 → 86 (slices 282-299 added the consumable-surface extensions, variant unrolls, and simple-wire sweep). Coverage snapshot reflects every new wired id. tsc clean; full vitest suite (1833 tests across 268 files) green; doc-size + SRD-drift + RAW-compliance audits all green.

Per-slice detail for slices 282-299 is archived to [docs/changelog/archive-slices-282-299.md](docs/changelog/archive-slices-282-299.md) (moved in slice 303 when the live CHANGELOG crossed the 60 KB single-Read ceiling, mirroring the slice 270 / 277 / 288 archive cadence).

**Release: bump to 0.1.0-alpha.7 (slice 281)**

Promotes the slice 269-280 cohort to a tagged release. `package.json` version bumped from `0.1.0-alpha.6` to `0.1.0-alpha.7`; `package-lock.json` regenerated via `npm install --package-lock-only`. The previous `## Unreleased` heading becomes `## 0.1.0-alpha.7 - 2026-05-19` immediately below.

No code changes. tsc clean; full vitest suite (1728 tests across 253 files) green. Per CLAUDE.md, the bump reflects meaningful surface change (12 slices closing 9 RAW-deviation bugs + a new consumer-coordinated pattern surface + filter-shape pattern-check refinement codified).

The alpha.7 release block keeps the per-slice detail inline. A follow-up archive slice can move the detail under `docs/changelog/archive-slices-269-280.md` once the next slice lands and the live CHANGELOG starts pushing the ceiling again (mirroring the slice 252 / 270 / 277 archive cadence).

## 0.1.0-alpha.7 - 2026-05-19

Cumulative post-alpha.6 release. 31 slices (251-280) shipped since alpha.6 (251-260 archived in slice 270; 261-268 in slice 277; 269-280 archived in slice 288 to [docs/changelog/archive-slices-269-280.md](docs/changelog/archive-slices-269-280.md)).

Headline changes since alpha.6:

- **9 RAW-deviation bugs closed**: Boots of Speed disadvantage on opportunity attacks (slice 269); Blur attacker-sense bypass (slice 271); Dodge benefits disabled by Incapacitated / Speed 0 (slice 272); Invisible perception bypass + missing disadvantage-on-attackers arm (slice 273); Gloves of Swimming Athletics sub-action gate (slice 274); Bracers of Archery +2 damage with longbow / shortbow (slice 275); Frightened breadth + LoS gate (slice 276); Dodge LoS gate per-attacker (slice 278); Cloak of the Bat dim-light Stealth gate (slice 279).
- **First consumer-coordinated bug-fix pattern** (slices 276 / 278 / 279). Engine adds optional input slots (`bearerCanSeeFearSource?`, `targetCanSeeAttacker?`, `lightLevel?`) on `AttackIntent` / `ComputeAbilityCheckInput` that consumers (UI, encounter manager, future VTT) populate when they model the relevant scene state. Default-apply for negative penalties (engine ships current behavior; consumer bypasses with explicit `false`); opt-in for positive benefits (engine ships strict-RAW-narrow; consumer specifies the scene state to receive the benefit).
- **Pattern-check working norm refined** (slices 268, 280). Slice 268 codified the "filter shape determines what a sweep can find" lesson into CLAUDE.md (`narrow filter → narrow sweep → missed adjacent shapes`). Slice 280 documented the negative-penalty vs. positive-benefit semantic in [docs/api-overview.md](docs/api-overview.md) so the choice is explicit for future consumer-coordinated fixes.
- **Predicate-fact namespace expanded** (slices 263 / 271 / 273 / 274 / 275 / 276 / 278 / 279). New `event.sense`, `event.athleticsSubAction`, `event.weaponId`, `attacker.bypassesSightIllusion`, `attacker.canLocateInvisible`, `target.canLocateInvisible`, `bearer.canSeeFearSource`, `bearer.canSeeAttacker`, `bearer.lightLevel`, `bearer.hasIncapacitated`, `bearer.speedZero` facts populated at the appropriate consumer sites.
- **`RollTarget` wildcards on save / check** (slice 266). `{ kind: 'save' }` and `{ kind: 'check' }` without an ability serve as wildcards matching every per-ability query. Mantle of Spell Resistance and poisoned collapsed from 6 per-ability entries each to 1 wildcard entry. Net pack diff: -11 effect entries with byte-identical behavior.
- **`condition` predicate plumbing closed across 4 effect kinds** (slices 258 + 262). `SetAdvantage` (slice 258), `GrantResistance`, `ModifyActionEconomy`, `GrantAdvantageToAttackers` (all three in slice 262) now thread their declared `condition?: Predicate` field through the effect-stack builder. Pre-258 the field was silently dropped.
- **Test count**: 1643 → 1728 across 244 → 253 files. +87 new tests (mostly the slice 269-279 bug-fix cohort: 4-7 cases each).
- **Doc discipline**: two archive slices (270 + 277) restored the single-Read ceiling on front-door docs when they drifted over. Slice 280 added tracking rows for a future CI doc-size check and for consumer-half coverage of engine-half-only RAW fixes.

---

## 0.1.0-alpha.6 - 2026-05-18

Cumulative post-alpha.5 release. 204 vocabulary-expansion slices (47-250) shipped since the alpha.5 line. Slice-by-slice detail for slices 241-250 lives in [docs/changelog/archive-slices-241-250.md](docs/changelog/archive-slices-241-250.md); older Unreleased entries (slices 48-240) were archived to per-cohort files under [docs/changelog/](docs/changelog/) in slice 248 (see the index below).

Headline changes since alpha.5:

- **Package and repo renamed** from `ttrpg-engine-dnd` to `dnd-srd-engine` (slice 247). The previous npm versions (alpha.0 through alpha.5) were unpublished on IP-cleanup grounds; no npm record exists under either name today. Consumers pin via git ref or local path.
- **SRD 5.2.1 pack-presence complete in every category**: 339/340 spells, 235/235 monsters, 275 magic items + 43 consumables, 9/9 species, 16/17 feats, 4/4 backgrounds (plus 17 PHB-2024 feats and 15 PHB-2024 backgrounds kept by policy). Mechanical wiring still grows: spell wiring ~42%, magic-item wiring ~15% (39 effective wires across magic items + consumables).
- **Effect-primitive vocabulary** expanded to 49 wired primitives plus the `Custom` escape hatch. Recent additions include `OverrideAbilityScore`, `GrantAdvantageVsBearersOfMyCondition`, `Regeneration`, `SpawnCreature`, plus the `ConsumeItem` planner and three `ConsumeAction` kinds (`Heal` / `ApplyCondition` / `CastSpell`) covering potions and spell scrolls.
- **SRD canon** now ships as a git submodule at `references/srd-markdown/` (slice 245). Web-source D&D content lookups explicitly forbidden in [CLAUDE.md](CLAUDE.md); enforced by the [SRD drift audit](tests/audit/srd-drift.test.ts) (slice 195) on script-detectable fields across spells, monsters, and magic items.
- **Fresh-agent discovery surface** polished: [AGENTS.md](AGENTS.md) + [.cursorrules](.cursorrules) cross-agent pointers (slice 247), single-Read ceiling enforced across front-door docs (slice 248), `starter-pack-gaps.md` split into per-category catalogs (slice 249), README top-level-dir map (slice 250).
- **Test count**: 1009 (at alpha.5) → 1643 across 244 files. New test layers: SRD drift audit (slice 195), feature-coverage matrix, public-API contract test, stateful combat-sequence property test (60-turn random fights, 6 invariants).

---

*Slice detail for slices 48-322 has been moved out of the live CHANGELOG to per-cohort archives under [docs/changelog/](docs/changelog/) (single-Read fitness; slices 315-322 were archived in slice 326; slices 301-312 in slice 313; slices 269-280 in slice 288; slices 261-268 in slice 277; slices 252-260 in slice 270; the alpha.6 release block of slices 241-250 in slice 252; older slices in slice 248). Each fits in a single Read tool call:*

- *[archive-slices-315-322.md](docs/changelog/archive-slices-315-322.md) (post-alpha.9 cohort: magic-equipment modeling stages 1-3 + the on-hit weapon-rider trigger family — target-gate, save, unconditional condition, plus the poison natural-weapon sweep)*
- *[archive-slices-301-312.md](docs/changelog/archive-slices-301-312.md) (post-alpha.8 cohort: buff-shape spell sweep, pack-integrity audit + orphan cleanup, magic-item buff sweep ~22 items, IncreaseAbilityScore primitive, itemKind categorization fixes + guards)*
- *[archive-slices-282-299.md](docs/changelog/archive-slices-282-299.md) (alpha.8 release block: consumable + UseAction surface, non-walk speed, variant unrolls, AddModifier wildcard)*
- *[archive-slices-269-280.md](docs/changelog/archive-slices-269-280.md) (alpha.7 release block: bug-fix cohort + consumer-coordinated pattern + docs hygiene)*
- *[archive-slices-261-268.md](docs/changelog/archive-slices-261-268.md) (pattern-check chain: norm codified, RAW-deviation sweeps, filter-shape refinement)*
- *[archive-slices-252-260.md](docs/changelog/archive-slices-252-260.md) (post-alpha.6 polish + audit-gap-fix trio + closure-annotation convention)*
- *[archive-slices-241-250.md](docs/changelog/archive-slices-241-250.md) (alpha.6 release block, slices 241-250)*
- *[archive-slices-235-240.md](docs/changelog/archive-slices-235-240.md)*
- *[archive-slices-217-234.md](docs/changelog/archive-slices-217-234.md)*
- *[archive-slices-201-216.md](docs/changelog/archive-slices-201-216.md)*
- *[archive-slices-196-200.md](docs/changelog/archive-slices-196-200.md) (also covers monster batches 5.x + subclass batches 1.x)*
- *[archive-slices-186-195.md](docs/changelog/archive-slices-186-195.md)*
- *[archive-slices-177-185.md](docs/changelog/archive-slices-177-185.md)*
- *[archive-monsters-batch-4.md](docs/changelog/archive-monsters-batch-4.md) (monsters batch 4.x)*
- *[archive-items-batch-4.md](docs/changelog/archive-items-batch-4.md) (items batch 4.x)*
- *[archive-slices-172-176.md](docs/changelog/archive-slices-172-176.md)*
- *[archive-content-batches-1.md](docs/changelog/archive-content-batches-1.md) (monsters batch 1.x + items batch 1.x)*
- *[archive-rollup-narrative-A.md](docs/changelog/archive-rollup-narrative-A.md) (slices 48-171 rollup, first half)*
- *[archive-rollup-narrative-B.md](docs/changelog/archive-rollup-narrative-B.md) (slices 48-150 rollup, second half + tail of Unreleased)*

*Released versions (alpha.0 through alpha.5) of the pre-rename package were moved to [docs/changelog/released-versions.md](docs/changelog/released-versions.md).*


## Released versions

Released versions (alpha.0 through alpha.5) of the pre-rename `ttrpg-engine-dnd` package live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). All were unpublished from npm in May 2026 on IP-cleanup grounds; the renamed `dnd-srd-engine` package has not yet cut a fresh release.
