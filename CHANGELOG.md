# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

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
