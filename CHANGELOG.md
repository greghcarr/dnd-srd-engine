# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content + bug-fix: simple wires sweep + Stone of Good Luck dedup (slice 298)**

Sweep of unwired magic items using existing primitives, with a bug-pattern audit that surfaced one duplicate. Per the slice-261 pattern-check norm, the audit found that 3 items (Cloak of Protection, Ring of Protection, Stone of Good Luck) and 3 conditions (blessed, baned, aura-of-protection-active) all ship 6 per-ability AddModifier entries to model universal save bonuses — wireable today via slice-266's wildcard pattern extended to AddModifier (deferred to a focused primitive slice). The wider sweep also surfaced one pack-data bug fixed here.

Bug fix: Stone of Good Luck duplicate. The pack carried two entries — `stone-of-good-luck` (wired with 12 save+check AddModifier entries, name "Stone of Good Luck") and `stone-of-good-luck-luckstone` (empty, name "Stone of Good Luck (Luckstone)"). SRD 5.2.1 canonical name is "Stone of Good Luck (Luckstone)" so the wired entry's name silently mismatched and the SRD drift audit silently skipped it. Resolution: renamed the wired entry to the SRD-canonical name, deleted the empty duplicate. Net pack delta: -1 entry. ID stability: kept `stone-of-good-luck` (the wired id).

Content wired:
- **Eyes of Minute Seeing** — `SetAdvantage on:{kind:'skill', skill:'investigation'}` (slice-263 primitive). "Within 1 foot" gate is consumer-managed; the 1-foot Darkvision arm is narrative (engine doesn't reason about sub-5-foot vision).
- **Headband of Intellect** — `OverrideAbilityScore { ability:'INT', value: 19 }` (slice-229 primitive, floor semantics).
- **Necklace of Adaptation** (arm 2) — `SetAdvantage on:{kind:'save'} condition: eq event.savePreventsCondition 'poisoned'` (slice-291 fact, bearer-side passive form rather than consumable-applied). The "breathe in any environment" arm 1 stays deferred (needs the `GrantBreathlessness` marker from the slice-224 backlog).
- **Periapt of Health** (arm 2) — same shape as Necklace of Adaptation. The 1/dawn self-heal arm 1 stays deferred (UseActionSchema lacks a Heal variant).

Pattern-check sweep results:
- **Universal save bonus (6-ability AddModifier unroll)**: 6 occurrences across pack (3 items + 3 conditions). Symptom of a missing wildcard primitive in AddModifier. Tracked as a future "AddModifier save/check wildcard + canonical user" slice. Existing wires are correct but verbose.
- **Duplicate pack entries**: ran a normalize-by-name audit across the full items list. Stone of Good Luck was the only true duplicate. Resistance variant groups (Armor / Ring / Potion) are intentional unrolls per slice 295/296. "Greatclub (Ogre)" is a weapon variant for the Ogre monster, not a magic item duplicate.
- **Poisoned-save advantage**: searched SRD for sibling items. Found Necklace of Adaptation + Periapt of Health (wired here), Periapt of Proof against Poison (already wired with full immunity), Belt of Dwarvenkind (deferred — multi-arm with creature-type "if not dwarf or duergar" gate that needs a `bearer.species` predicate the engine doesn't have).

Audit:
- Names: descriptive ids; the renamed Stone of Good Luck keeps its original id (less churn) while updating name to match SRD.
- DRY: each wire is one effect entry; no copy-paste.
- SRP: each wire targets one observable behavior.
- Magic numbers: 19 (Headband INT floor) cited to RAW + slice-229 primitive doc.
- Mechanical outcomes: 14 tests pin the 4 wires + the dedup invariant (only one Stone entry exists; canonical name matches SRD; 12-entry effect array preserved).

tsc clean; 1824 tests across 267 files (was 1810 / 266; +14 in new [tests/unit/derive/slice-298-wires.test.ts](tests/unit/derive/slice-298-wires.test.ts)). Coverage snapshot updated for the 4 new wiredIds. SRD drift audit now silently SKIPS Stone of Good Luck via the new name (the SRD entry name still doesn't map to an `srdItems.get` hit because the audit's name parser doesn't match parenthetical canonicals — same as Belt of Giant Strength variants); rarity + attunement assertions still pass.

Doc updates: Items count refreshed (511 → 510; 58 → 62 wired); deferred-primitives backlog gains a tracked row for the universal-save-bonus wildcard primitive (AddModifier save/check wildcard).

**Content: Elvenkind Stealth wires (slice 297)**

Two simple wires picked up on the way past — both items had `effects: []` since the original starter-pack authoring even though the slice-263 skill-discriminated `SetAdvantage on:{kind:'skill', skill:'stealth'}` primitive (originally landed for Eyes of the Eagle) covers their bearer-side arms.

Content wired:
- Boots of Elvenkind (uncommon, no attunement): RAW grants Stealth advantage unconditionally + silent steps. The silent-steps arm is narrative (engine doesn't model sound); the Stealth advantage wires as a single SetAdvantage.
- Cloak of Elvenkind (uncommon, attunement-required): RAW grants Stealth advantage (hood-up gated) + imposes disadvantage on third-party Perception checks against the wearer. Slice 297 wires arm 1 (the hood-up gate is consumer-managed, mirroring slice 289's Cloak of the Bat dim-light gate); arm 2 stays deferred since it needs a per-skill-roll-from-another-creature's-perspective primitive the engine doesn't carry yet (same blocker as Cloak of Displacement's third-party attack-disadvantage arm).

Pattern-check: searched for sibling unwired items with bearer-side skill advantage covered by existing primitives. Found these two (and Cloak of the Bat's Stealth arm already wired at slice 279; Eyes of the Eagle's sight-Perception arm at slice 263). No remaining bearer-side skill-advantage wires await a missing primitive.

Audit: pure content. tsc clean; 1810 tests across 266 files (was 1804 / 265; +6 in new [tests/unit/derive/elvenkind-stealth.test.ts](tests/unit/derive/elvenkind-stealth.test.ts)). Coverage snapshot updated for the 2 new `boots-of-elvenkind` + `cloak-of-elvenkind` wiredIds. SRD drift audit passes (rarity/attunement unchanged).

Doc updates: [docs/gaps-items-batches-1.1-1.10.md](docs/gaps-items-batches-1.1-1.10.md) "Conditional advantage / disadvantage grant" bullet refreshed to note arm-1 closure on both items + remaining arm-2 deferral on the cloak.

**Content: Potion of Resistance variant unroll + 5 missing protection-*-active conditions (slice 296)**

Closes the slice-239 deferred row, sibling of slice 295's Armor / Ring of Resistance unroll (same SRD 5.2.1 d10 damage-type table). Same variant-unroll pattern, but Potion of Resistance has the extra dimension of needing 5 new conditions since the existing `protection-*-active` set (acid, cold, fire, lightning, thunder) only covered the 5 elemental types Protection from Energy targets in RAW.

Content wired:
- 5 new conditions: `protection-force-active`, `protection-necrotic-active`, `protection-poison-active`, `protection-psychic-active`, `protection-radiant-active`. Each is dead-simple: one `GrantResistance` for the matching damage type. Mirrors the existing 5 from Protection from Energy.
- 10 Potion of Resistance variants (`potion-of-resistance-<type>`, named "Potion of Resistance (<Type>)"). Each carries a single `ApplyCondition` ConsumeAction pointing at the matching `protection-<type>-active` condition. Single empty parent entry removed.

RAW deviations: 1-hour duration is consumer-managed (mirror of slice 236's ApplyCondition doc); no engine-side auto-expiry. Protection from Energy's RAW spell scope (only the 5 elemental types) is unchanged — the new 5 conditions are not added to its caster-chooses-variant list.

Pattern-check: this slice + slice 295 form the natural pair (both bound by SRD 5.2.1's "1d10 damage type" chooser-at-creation). Belt of Giant Strength (slice 229) was the earlier canonical pattern. No other sibling chooser-at-creation magic items in 2024 RAW today.

Audit: pure content. tsc clean; 1804 tests across 265 files (unchanged count; conditions coverage snapshot updated for the 5 new `protection-*-active` IDs). SRD drift audit passes (variant names not in srdItems map → rarity asserts silently skip, same as slice 295).

Doc updates: gaps-row closed; Coverage-at-a-glance Items count refreshed (502 → 511 total; consumables 42 → 52); Conditions count refreshed (98 → 117; prior count had drifted across slices 263-296).

**Content: Armor + Ring of Resistance variant unroll (slice 295)**

Closes the slice-224 deferred row that bundled Armor of Resistance + Ring of Resistance together (same chooser-at-creation pattern, same SRD 5.2.1 d10 damage-type table). The slice-229 Belt of Giant Strength variant-unroll pattern carries forward: one pack entry per damage type, single `GrantResistance` effect per variant.

Content wired: 10 Armor of Resistance variants (`armor-of-resistance-<type>`, named "Armor of Resistance (Acid)" etc., rare + attunement-required per RAW) and 10 Ring of Resistance variants (`ring-of-resistance-<type>`, rare + no-attunement per slice-184 SRD-drift fix). Damage types: acid, cold, fire, force, lightning, necrotic, poison, psychic, radiant, thunder. The pre-slice single empty parent entries were removed (verified no consumers reference them via grep across src/ tests/ docs/).

Pattern-check: searched for sibling chooser-at-creation magic items. Belt of Giant Strength variants already shipped (slice 229). Potion of Resistance is the next sibling on the same RAW pattern but stays deferred — it adds the additional dimension of needing 5 missing `protection-*-active` conditions (force, necrotic, poison, psychic, radiant) plus the ConsumeAction ApplyCondition wire. The 5 existing protection conditions cover only the Protection from Energy spell's RAW set (acid, cold, fire, lightning, thunder); the wider damage-type set for Potion of Resistance hadn't authored. Tracking left as a deferred row.

Audit: pure content. No engine changes. tsc clean; 1804 tests across 265 files (unchanged count; coverage snapshot updated to include the 20 new wiredIds). Coverage snapshot diff verified: only the 10 armor-of-resistance-* + 10 ring-of-resistance-* IDs added to the magic-items wiredIds list. SRD drift audit passes (parent name "Armor of Resistance" / "Ring of Resistance" not in srdItems map for the variant ids, so rarity/attunement asserts silently skip — same as Belt of Giant Strength variants per the slice-229 doc).

Doc updates: gaps-row closed (strikethrough + slice 295 closure note); Coverage-at-a-glance Items count refreshed (484 total → 502 total; +18 from the unroll net of 2 parent removals). The pre-slice "27 wired" count had drifted across slices 242-289; new count "58 wired" matches the coverage snapshot, with a parenthetical pointer to the drift for future readers.

**Docs: consumer-coordinated fact-slot tracking section (slice 294)**

Closes the slice-276 follow-up row that slice 280 introduced ("Consumer-half tracking for engine-half-only RAW fixes"). New "Consumer-coordinated fact slots" section in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) catalogs the three engine-half-landed slots (`bearerCanSeeFearSource`, `targetCanSeeAttacker`, `lightLevel`) plus their entry-point inputs (AttackIntent / ResolveAttackInput / ComputeAbilityCheckInput), the default-undefined semantic (default-apply vs opt-in), and what observable RAW behavior is gated. Includes a "when to use which semantic" rule for future consumer-coordinated facts.

Why this is its own slice: future consumers (dndbnb, web demo, VTT integrations) need a single canonical reference for which engine inputs to populate from their scene state. Before this slice, the information was scattered across slice 276 / 278 / 279 commit bodies + per-condition wires + inline doc comments. The new section is the front-door reference, and future slices append to its table as new slots land.

Pattern-check: the row was opened slice 280 alongside the doc-size CI check row; that one closed slice 285. Both came from the same "we have a deferred meta-task; we need a concrete artifact" reframe. Future cross-cutting tracking gaps follow the same shape — open a row when noticed, close it when the artifact exists.

Audit: pure doc slice — no engine changes. tsc clean (no source touched); 1804 tests across 265 files (unchanged). The doc-size audit passes for the updated starter-pack-gaps.md (44 KB, under the 60 KB ceiling). No new tests; the artifact's value is reference content for consumers, not a behavior to assert.

**Engine+content: Boots of Speed time-budget cap (slice 293)**

Closes the slice-242 deferred row that had been open since the initial Toggle UseAction landed. RAW (SRD 5.2.1): "When the boots' property has been used for a total of 10 minutes, the magic ceases to function until you finish a Long Rest." A continuous, cumulative minutes-per-LR pool distinct from `charges` (per-use integer count) and round-based auto-expiry (slice 102).

Plumbing: new optional `timeBudget: { maxMinutesPerLongRest: number }` field on `MagicItemSchema` + `minutesUsed?: number` counter on `ItemInstance`. New `ItemTimeBudgetConsumed` event (carries `instanceId`, `amountMinutes`, `byCharacterId`). `UseItemIntent` gains `minutesElapsed?: number`. `planUseItem`'s Toggle branch validates `minutesUsed < max` on toggle-on (throws "exhausted ... finish a Long Rest to reset" past the cap) and emits `ItemTimeBudgetConsumed` on toggle-off when the consumer reports elapsed minutes. `applyLongRestEnded` walks each participant's inventory and resets `minutesUsed` to 0 on instances that carry the counter (undefined → undefined; never been activated stays pristine).

Consumer contract: the engine doesn't model real-time elapsed-while-toggled (would require continuous clock or per-tick state) — the consumer reports cumulative elapsed minutes on the toggle-off intent. This mirrors the engine's general consumer-coordinated stance (positions, scene state, RAW LoS).

Content wired: Boots of Speed gains `timeBudget: { maxMinutesPerLongRest: 10 }`. Same shape applies to Winged Boots' "4 hours per day, can be used in 1-min increments" (still wires-only; same primitive, different cap + reset cadence).

Pattern-check: searched MagicItemSchema callers for sibling "minutes-per-cadence" shapes — Winged Boots is the only match in 2024 RAW. Future content (e.g. a Cloak of Invisibility-style "2 hours total before sundown") would plug into the same field with a different cap and possibly a different reset event (DawnReset, ShortRestEnded). The current cadence is "long-rest reset only"; future variants can split.

Audit:
- Names: `timeBudget`, `minutesUsed`, `minutesElapsed`, `ItemTimeBudgetConsumed` — each names a distinct thing (the def's spec, the instance's counter, the consumer's per-use report, the event). The `amountMinutes` event field mirrors slice-261's `amount` naming on ItemChargeConsumed.
- DRY: reset-on-LR walks the inventory inline in `applyLongRestEnded` rather than a helper — 6 lines, single call site, below the abstraction threshold. If a second cadence (DawnReset, ShortRestEnded) ever lands, factor then.
- SRP: planner gate (validation + emit), reducer (state mutation), rest-reset (lifecycle hook) each do one thing.
- Magic numbers: `maxMinutesPerLongRest: 10` lives in the content pack (Boots-specific), not in engine code. The gate uses the def's value, no hardcoding.
- at-threading: planner resolves `at = intent.at ?? nowIso()` once; ItemTimeBudgetConsumed inherits it from the same call.
- Mechanical outcomes: 5 tests pin (1) emit on toggle-off-with-minutesElapsed, (2) no emit on toggle-off-without-minutesElapsed (rounds-only use), (3) cumulative accumulation across cycles, (4) toggle-on-after-cap throws, (5) long-rest resets + re-enables toggle-on.
- Tests: prevent regression of the budget gate, the cumulative semantic, the LR reset, and the no-op-when-not-reported case (would silently drop a feature if reversed).

tsc clean; 1804 tests across 265 files (was 1799 across 264). No coverage snapshot change (no `wiredIds` flips). Transcript formatter gains a one-line case for `ItemTimeBudgetConsumed`.

**Content: Perfume + perfumed-active condition (slice 292)**

Closes the slice-239 Perfume deferred row. The original row miscategorized the gap — the skill-discriminated SetAdvantage target `on: { kind: 'skill', skill: Skill }` had been in the schema since slices 263 / 274 (canonical users at the time: Eyes of the Eagle Perception, Gloves of Swimming Athletics, slice 279 Cloak of the Bat Stealth). Perfume is the canonical Persuasion user; pure content slice on top of existing primitives.

Content wired: new `perfumed-active` condition with `SetAdvantage on:{kind:'skill', skill:'persuasion'} mode:'advantage'`. Perfume's `onConsume` becomes `[ApplyCondition perfumed-active]` (slice-236 ApplyCondition variant).

RAW deviations: "Indifferent Humanoid" target-attitude gate is consumer-managed (engine doesn't model attitude); 5-ft range is consumer-managed; 1-hour duration is consumer-managed (mirror of slice 236).

Audit: pure content. tsc clean; 1799 tests across 264 files (was 1793). 6 cases: cast emits ConditionApplied; CHA(Persuasion) advantage; CHA(Deception) no advantage; raw CHA no advantage; WIS(Persuasion) advantage (skill-discriminated, ability-agnostic); baseline no advantage. Coverage: `perfumed-active` joins conditions wired list.

**Engine+content: Antitoxin + `event.savePreventsCondition` predicate fact (slice 291)**

Closes the slice-239 Antitoxin deferred row. RAW: "Advantage on saving throws to avoid or end the Poisoned condition for 1 hour." Pre-291 the engine had no way to gate save advantage on the specific condition the save would prevent or end.

Plumbing: new `savePreventsCondition?: string` field on [`ComputeSaveInput`](src/derive/save.ts) surfaces as the `event.savePreventsCondition` predicate fact. Cast-spell save resolution populates it from `mechanic.conditionOnFail` (poison-spell saves, Hold-shape saves, etc.). Recurring-save planner populates it from the bearer condition id when `recurringSave.onSuccess === 'removeCondition'` (so a Hold Person target's end-of-turn save would carry `savePreventsCondition: 'held-paralyzed'` etc.). Generic saves (Stunning Strike CON, multiattack save) leave the fact undefined and per-condition gates evaluate false.

Content wired: new `antitoxin-active` condition with `SetAdvantage on:{kind:'save'}` (slice-266 wildcard) gated on `eq event.savePreventsCondition 'poisoned'`. Antitoxin consumable's `onConsume` becomes `[{ kind: 'ApplyCondition', conditionId: 'antitoxin-active' }]` (slice-236 ApplyCondition variant). 1-hour duration consumer-managed.

Pattern-check: searched for sibling per-condition save-advantage buffs — none in SRD 5.2.1 today. The new fact is generic enough that future content (e.g. a buff that grants advantage on saves vs Charmed, or future Restoration potions) plugs in by gating on the same fact with a different condition id.

Audit: input field + 2 planner threadings + 1 condition + 1 content wire. tsc clean; 1793 tests across 263 files (was 1787). 6 cases: drinking emits ConditionApplied; save with savePreventsCondition='poisoned' gets advantage; save with savePreventsCondition='frightened' does NOT; save with undefined does NOT; all 6 ability scores get advantage on poisoned-gating save (slice-266 wildcard); no-antitoxin baseline does not. Coverage snapshot: `antitoxin-active` joins conditions wired list.

**Engine+content: ModifySpeed matchWalkSpeed op + Cloak of Arachnida + Spider Climb (slice 290)**

Closes the slice-227 Cloak of Arachnida row. RAW: "Climb Speed equal to your walking speed" — Cloak of Arachnida + Slippers of Spider Climbing + Spider Climb spell all share this shape. Pre-290 the engine had no way to express it; all three shipped as `op: 'set', value: 30` approximations.

Plumbing: new `op: 'matchWalkSpeed'` on `ModifySpeed` (Zod enum extension + TS union update). `getEffectiveSpeedForMode` recurses once into walk-mode resolution to find the effective walk speed, then treats it as a `set` for the non-walk mode (so Fast Movement / Unarmored Movement / Haste's ×2 fold in). Walk mode itself ignores `matchWalkSpeed` (would be circular). `value` is required by the union but ignored for this op; content ships `value: 0`.

Content re-wired (3 entries; same observable for human/30 base, dynamic across faster bases):
- Cloak of Arachnida (very-rare): `ModifySpeed climb matchWalkSpeed`. Description rewrites the RAW spec and enumerates remaining deferrals (Athletics-climb advantage; Web spell-cast).
- Slippers of Spider Climbing (uncommon): same.
- `spider-climbing-active` condition (Spider Climb spell + Potion of Climbing): same. Description drops the "approximated as 30 ft" caveat.

Pattern-check: the three users share the same RAW phrasing and the same primitive — clean three-canonical-users-in-one-slice closure. No sibling shapes need the same op (climb-only RAW; no swim/fly variants today). The Athletics-climb-advantage arm of Cloak of Arachnida would gate on slice-274's `athleticsSubAction='climb'` if a future slice wires it.

Audit: schema + resolver + 3 content wires. tsc clean; 1787 tests across 262 files (was 1778). 9 cases in new [tests/unit/engine/match-walk-speed.test.ts](tests/unit/engine/match-walk-speed.test.ts): human walk 30 → climb 30; Barbarian L5 Fast Movement walk 40 → climb 40; hasted Barbarian walk 80 → climb 80 (multiplier folds); Cloak of Arachnida attuned 40, unattuned 0; Slippers climb 30 (human) / 40 (Barbarian L5); walk-mode-ignores-matchWalkSpeed regression. Coverage snapshot unchanged (no wiredIds membership flips).

**Content: Cloak of the Bat fly-speed Toggle wire (slice 289)**

Closes the slice-227 deferred Cloak of the Bat fly-speed row. Composes three prior slices into one wired item: slice 240's `ApplyCondition` UseAction + slice 279's `bearer.lightLevel` Stealth gate + slice 288's `getEffectiveFlySpeed`. No new engine primitives needed.

Content wired: Cloak of the Bat gains `charges: { max: 1, recharge: 'dawn' }` and `onUse: [{ kind: 'ApplyCondition', conditionId: 'cloak-of-the-bat-active' }]`. New `cloak-of-the-bat-active` condition carries `ModifySpeed fly set 40`. The slice-279 Stealth advantage stays independently wired on the cloak's passive `effects` array.

RAW deviations: the "in an area of dim light or darkness" activation gate is consumer-managed — same shape as Pipes of Haunting's 30-ft scope (engine doesn't model scene lighting at activation time, and RAW most-naturally reads as "the buff lasts 1 hour from activation regardless of where you walk"). The 1-hour duration is consumer-managed (mirror of slice 236's ApplyCondition doc). The Polymorph-self-to-Bat arm stays deferred (needs a `CastSpell` UseAction variant dispatching to dedicated planPolymorph, parallel to slice-237).

Pattern-check: this slice is the third post-alpha.7 composition of pre-existing primitives (slice 282 used slice 235 + 236; slice 284 used slice 76 + 90 + 235; slice 289 uses slice 240 + 279 + 288). The pattern that emerges: each Toggle UseAction wire ships once the prerequisite engine primitives are in place. The slice 281's "consumer-half tracking" gap row (engine half landed, consumer half pending) is the symmetric tracker.

Audit: no engine changes — pure content slice. One new condition (1 effect entry) + one item config update + onUse array. tsc clean; 1778 tests across 261 files (was 1774). 4 cases pin: useItem emits charge + condition + ItemUsed; fly speed flips from 0 to 40 across the cast; second use throws on 0 charges; Stealth arm stays independent of fly activation. Coverage snapshot: `cloak-of-the-bat-active` joins conditions wired list; `cloak-of-the-bat` joins `withChargesIds` list.

**Engine: non-walk speed derives (slice 288)**

Closes the slice-263 pattern-check finding: ~30 in-pack `ModifySpeed` entries for fly / swim / climb / burrow modes projected to the effect stack but no consumer read them. Slice 288 ships `getEffectiveFlySpeed` / `getEffectiveSwimSpeed` / `getEffectiveClimbSpeed` / `getEffectiveBurrowSpeed` mode-parameterized off slice 77's walk algorithm.

**Lights up mechanically** (no content changes): Gaseous Form fly 10 (slice 287's declarative wire), Cloak of the Bat fly 40 (pending Toggle), Slippers of Spider Climbing climb 30, Ring of Swimming swim 40, Gloves of Swimming and Climbing climb/swim 30, Spider Climb climb 30, native monster fly/climb/swim/burrow.

Plumbing: shared `getEffectiveSpeedForMode(input, mode)` in [_actor-state.ts](src/engine/plan/_actor-state.ts) + four aliases. `getEffectiveSpeed` becomes a thin wrapper; algorithm unchanged. Base lookup: walk → `character.speedFeet`; non-walk → monster statblock or species `speed[mode]`, default 0.

Cloak of Arachnida half-closure: non-walk derive lands; remaining blocker is a `ModifySpeed { op: 'matchWalkSpeed' }` op for "climb speed equal to walking speed."

Audit: derive-only. No reducer / planner changes. Existing call sites unchanged (consumers opt in incrementally). tsc clean; 1774 tests across 260 files (was 1766). 8 cases: PC defaults all 0; Gaseous Form fly 10; Spider Climb climb 30; Ring of Swimming swim 40; Gloves (climb + swim 30); Young Red Dragon fly 80 / climb 40; zero-set wins (Gaseous Form + Earthbind); walk derive unchanged (regression check).

Bundled archive: this slice also triggered the slice-285 doc-size audit (CHANGELOG drifted past 60 KB after slice 287's entry plus this one). Per the slice-281 plan + slice-270 / 277 precedent, slices 269-280 (the alpha.7 release-block detail) moved to [docs/changelog/archive-slices-269-280.md](docs/changelog/archive-slices-269-280.md). The slice 281 release-bump entry stays live alongside slices 282-288.

**Content: Gaseous Form wired through existing primitives (slice 287)**

Closes one of two spells on the slice-241 "Transformation handler" row. RAW reframing: both alter-self and gaseous-form are buff-condition shaped (not statblock-swap), so no wildShape/polymorph-style planner is needed. Gaseous Form wires through the slice-73 buff mechanic + new `gaseous-form-active` condition: `OverrideACFormula base 11`, `GrantResistance` for B/P/S, `GrantConditionImmunity prone`, `SetAdvantage` on STR/DEX/CON saves, declarative `ModifySpeed fly set 10`.

Alter Self stays deferred — all three arms need missing primitives (Aquatic: non-walk speed derive + `matchWalkSpeed` op; Natural Weapons: unarmed-strike attack replacement; Change Appearance: pure narrative). Gap row reframed as "Alter Self (spell wiring)" with per-arm prerequisites.

Audit: no engine changes. tsc clean; 1766 tests across 259 files (was 1758). 8 cases pin cast chain + AC override + B/P/S resistance + prone immunity + per-ability save advantage. Coverage: `gaseous-form-active` joins conditions wired list.

**Engine+content: Pipes of Haunting + Save UseAction variant (slice 286)**

Closes the slice-241 deferred Pipes of Haunting row. RAW (SRD 5.2.1): "Each creature of your choice within 30 feet of you must succeed on a DC 15 Wisdom saving throw or have the Frightened condition for 1 minute." Pre-286 Pipes shipped with `effects: []` / `onUse: []` — charges were declared but no UseAction rolled the bespoke item-fixed-DC save. This slice adds the fourth variant to the slice-240 `UseActionSchema` (sibling to ApplyCondition, Toggle, CastSpell).

**Plumbing**:

- New `{ kind: 'Save', saveAbility, saveDC, conditionOnFail, sourceIsMagical? }` variant on [`UseActionSchema`](src/schemas/content/item.ts). Distinct from CastSpell because no spell is cast and no class spell-DC is involved — the item carries its own fixed DC. `sourceIsMagical` defaults to true (item-played effects are magical for Magic Resistance purposes).
- New `saveTargetIds?: ReadonlyArray<string>` field on [`UseItemIntent`](src/engine/plan/use-item.ts). Required (non-empty) when the fired action is a Save; engine doesn't model positions, so the 30-foot scope is consumer territory.
- planUseItem branch rolls one save per target via [`computeSavingThrow`](src/derive/save.ts) (mirrors the cast-spell save resolution: honors advantage / disadvantage from the target's effect stack; rolls 1 or 2 d20s as needed). Emits SaveRolled per target and ConditionApplied per failed target with `sourceCharacterId = item user`.

**Content wired**:

- **Pipes of Haunting**: `onUse: [{ kind: 'Save', saveAbility: 'WIS', saveDC: 15, conditionOnFail: 'frightened' }]`. Also fixed the recharge formula from a pre-285 stub of `1d4+1` to the RAW `1d3`. Description rewrites the RAW spec verbatim and enumerates the deferrals.

**RAW deviations**: 30-ft scope is consumer territory; 1-minute duration is consumer-managed (mirror of slice 236's ApplyCondition doc); the RAW end-of-turn recurring save and 24-hour immunity-on-success are still deferred (would need a `recurringSave` shape applied via the planner and consumer-tracked per-target immunity state).

**Pattern-check sweep**: searched the pack for sibling items with bespoke item-fixed-DC save mechanics — none currently wired. Wind Fan ships `effects: []` and would benefit from this same shape if RAW carries a save; other "save vs effect" items mostly route through CastSpell (the spell's save mechanic handles it). The variant is reusable for any future item that carries its own DC outside the spell pipeline.

Audit: variant name follows the UseAction convention (`ApplyCondition`, `CastSpell`, `Toggle`, now `Save`). One new variant + one new intent field, one new planner branch, one content wire. tsc clean; full vitest suite (1758 tests across 258 files, was 1752) green. 6 cases: failed-save applies frightened; successful-save (seed-search loop) does not apply; multi-target preserves the per-target save↔condition relationship; charge gate fires; throws on missing / empty saveTargetIds. Coverage snapshot: `pipes-of-haunting` joins `wiredIds`.

**Tests+infra: doc-size audit on front-door docs (slice 285)**

Closes the recurring problem that bit slices 270 + 277: front-door docs (CHANGELOG.md, starter-pack-gaps.md) silently drifted over the single-Read ceiling between content slices, surfacing only when a fresh agent's Read tool errored out. New [tests/audit/doc-size.test.ts](tests/audit/doc-size.test.ts) audit asserts every front-door doc fits the documented ~60 KB ceiling. Runs as part of `npm test` so CI catches the drift at commit time, not next-agent-Read.

**Implementation**: nine vitest cases. Seven per-file `expect` cases pin the fixed front-door docs (README.md, CHANGELOG.md, CLAUDE.md, docs/starter-pack-gaps.md, docs/status.md, docs/roadmap.md, docs/api-overview.md). One dynamic case enumerates `docs/changelog/*.md` archives and `docs/gaps-*.md` per-category catalogs so new archives are caught without test edits. One floor-count sanity case prevents a vacuously-green audit if the file list ever empties (path renames, dir moves).

Threshold: 60,000 bytes per file. Matches CLAUDE.md's "Doc size discipline" documented hard ceiling ("anything safely under 60,000 bytes will fit"). Empirical verification at slice 285: the 59 KB and 56 KB archives ([archive-rollup-narrative-A.md](docs/changelog/archive-rollup-narrative-A.md) + [gaps-monsters-deferred-mechanics.md](docs/gaps-monsters-deferred-mechanics.md)) both Read cleanly; the 65 KB CHANGELOG at slice 277 pre-archive failed. 60 KB is the practical boundary for typical content density.

**Failure message**: when a file exceeds the threshold, the assertion prints the file path, current byte count, and a one-line pointer to CLAUDE.md's split playbook. A developer / agent shipping a slice that pushes a doc over the limit sees the failure inline rather than hitting it next session.

Audit: no engine / content changes. tsc clean; full vitest suite (1752 tests across 257 files, was 1743) green. 9 new cases. The audit itself is the test.

**Engine+content: ApplyItemBuff ConsumeAction variant + Oil of Sharpness + Poison Basic (slice 284)**

Third slice of the consumable-variant chain. Closes two slice-239 deferred rows with one new variant: Oil of Sharpness (+3 attack / +3 damage / counts as magical) and Poison Basic (1d4 poison rider) both wire as `ApplyItemBuff` ConsumeActions that stamp a `temporaryBuff` onto a target weapon via the slice-76 shape. The Poison Basic save-vs-Poisoned arm stays deferred (would need an on-hit-rider extension to the temporaryBuff shape or composition with slice-61).

**Plumbing**:

- New `{ kind: 'ApplyItemBuff', attackBonus?, damageBonus?, extraDamageDice?, extraDamageType? }` variant on [`ConsumeActionSchema`](src/schemas/content/item.ts). Field shape mirrors `ItemTemporaryBuff` so the attack planner picks up the buff automatically (slice 76's attack-bonus / damage-bonus path; slice 90's elemental-rider path for extra dice).
- New `targetWeaponInstanceId?: string` field on [`ConsumeItemIntent`](src/engine/plan/consume-item.ts). Defaults to the actor's `equipped.mainHand`. Throws if the target isn't a weapon or no main hand is set.
- planConsumeItem emits `ItemBuffApplied` with a fresh synthetic `sourceEffectInstanceId` (consumable-applied buffs aren't linked to concentration; the id tags the buff for any future "remove this specific oil" semantics).

**Content wired (2 consumables)**:

- **Oil of Sharpness**: `onConsume: [{ kind: 'ApplyItemBuff', attackBonus: 3, damageBonus: 3 }]`. The "counts as magical" arm is free — slice 112's `isMagicWeaponAttack` returns true for any temporaryBuff-bearing item.
- **Poison Basic**: `onConsume: [{ kind: 'ApplyItemBuff', extraDamageDice: '1d4', extraDamageType: 'poison' }]`.

**RAW deviations** (both items): engine doesn't gate on weapon type (RAW: piercing / slashing only) or auto-expire after the narrative duration (1 hour / 1 minute or first-hit). Consumer-managed.

**Pattern-check sweep**: searched for other consumables that apply weapon buffs — none in SRD 5.2.1. Drow Poison and similar future content would extend with on-hit-save composition (deferred).

Audit: variant name follows the ConsumeAction convention. One new variant + one new intent field, one new planner branch, two content wires. tsc clean; full vitest suite (1743 tests across 256 files, was 1737) green. 6 cases in two describes + an error-paths describe: Oil emits +3/+3 on equipped main hand; weapon state carries the buff after consume; explicit targetWeaponInstanceId overrides main hand; Poison Basic emits 1d4 poison rider; throws when no target weapon; throws when target isn't a weapon.

**Engine+content: Potion of Vitality + RemoveConditions / RemoveExhaustion ConsumeAction variants (slice 283)**

Second slice of the consumable-variant chain. Closes the first arm of the slice-239 Potion of Vitality row. RAW: "removes any Exhaustion you are suffering and cures any disease or Poison affecting you. For the next 24 hours, you regain the maximum number of Hit Points for any Hit Die you spend." The 24-hour max-HD-spend rider stays deferred (the engine doesn't model Hit Die spend max yet).

Two variants instead of one combined "cleanse" because the shapes are mechanically distinct: RemoveConditions walks `character.appliedConditions` and emits ConditionRemoved per matched instance; RemoveExhaustion emits a single ExhaustionChanged from current → 0 on the numeric `exhaustion` field (a separate state slot, not a condition).

**Plumbing**: two new variants on [`ConsumeActionSchema`](src/schemas/content/item.ts) — `{ kind: 'RemoveConditions', conditionIds: string[] }` and `{ kind: 'RemoveExhaustion' }`. [`planConsumeItem`](src/engine/plan/consume-item.ts) gains two branches. RemoveConditions walks the target's appliedConditions and emits ConditionRemoved per match (handles multiply-sourced conditions correctly). RemoveExhaustion no-ops cleanly when exhaustion is already 0 (no event emitted, audit trail stays clean).

**Content wired**: Potion of Vitality's `onConsume` becomes `[{ kind: 'RemoveExhaustion' }, { kind: 'RemoveConditions', conditionIds: ['poisoned'] }]`. Description rewrites the RAW spec and notes the deferred HD-spend rider.

**Pattern-check sweep**: RemoveExhaustion + RemoveConditions are reusable. Future canonical users: Greater Restoration spell (RAW reduces exhaustion by 1, not zeroes out — needs a different variant); Heroes' Feast (RAW: "cures all diseases and poison effects"). Both stay deferred — they're spell-driven, not consumable-driven. The variants land here for the consumable surface; future spell wiring may extend RemoveConditions or add siblings.

Audit: variant names follow the ConsumeAction convention (`Heal`, `ApplyCondition`, `CastSpell`, `GrantTempHP`, `RemoveConditions`, `RemoveExhaustion`). Two new variants, two new planner branches, one content wire. tsc clean; full vitest suite (1737 tests across 255 files, was 1732) green. 5 cases: both cleared together; state-side verification; no-op when neither present; exhaustion-only; poisoned-only.

**Engine+content: Potion of Heroism + GrantTempHP ConsumeAction variant (slice 282)**

First slice of the consumable-variant chain. Closes the slice-239 deferred row for Potion of Heroism. RAW: "For 1 hour, the drinker gains 10 Temporary Hit Points and the Blessed condition." Pre-282 the potion shipped `onConsume: []` — the engine had no shape for "flat temp HP grant on consume." This slice adds the fourth variant to the slice-235 `ConsumeAction` discriminated union and wires its canonical user.

**Plumbing**: new `{ kind: 'GrantTempHP', amount }` variant on [`ConsumeActionSchema`](src/schemas/content/item.ts). [`planConsumeItem`](src/engine/plan/consume-item.ts) gains a branch that emits a `TempHPGranted` event with the action's `amount` and a `source: 'item:<def-id>'` tag. The existing slice-75 `applyTempHPGranted` reducer enforces RAW max-not-additive semantics; no reducer changes needed.

**Content wired**: Potion of Heroism's `onConsume` becomes `[{ kind: 'GrantTempHP', amount: 10 }, { kind: 'ApplyCondition', conditionId: 'blessed' }]`. The Bless half uses the existing slice-236 ApplyCondition variant pointing at the pre-existing `blessed` condition (Bless spell shares the same condition). The 1-hour duration is consumer-managed per the ConsumeAction doc comment.

**Pattern-check sweep**: searched the pack for other consumables that need flat temp HP grants — none in the SRD 5.2.1 consumables catalog beyond Potion of Heroism. Potion of Vitality grants HP differently (full restore + remove conditions); Potion of Healing variants use the slice-235 Heal action. Future monster ability descriptions that grant temp HP on consume (rare) would plug in by reusing this variant.

Audit: variant name follows the kebab-case ConsumeAction convention (`Heal`, `ApplyCondition`, `CastSpell`, now `GrantTempHP`). One new variant, one new planner branch, one content wire. tsc clean; full vitest suite (1732 tests across 254 files, was 1728) green. 4 cases: emits TempHPGranted + ConditionApplied + ItemConsumed in correct shape; instance retires from inventory; drinker carries 10 temp HP + blessed; ally-feed via targetId override grants the ally, not the drinker.

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

*Slice detail for slices 48-280 has been moved out of the live CHANGELOG to per-cohort archives under [docs/changelog/](docs/changelog/) (single-Read fitness; slices 269-280 were archived in slice 288; slices 261-268 in slice 277; slices 252-260 in slice 270; the alpha.6 release block of slices 241-250 in slice 252; older slices in slice 248). Each fits in a single Read tool call:*

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
