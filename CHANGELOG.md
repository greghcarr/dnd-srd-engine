# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content: magic-item buff sweep, 5 wires via existing primitives (slice 305)**

Pure-content sweep, no engine changes. Five DMG magic items wired through primitives the engine already supports, each pinned by a test in [tests/unit/engine/slice-305-magic-item-wires.test.ts](tests/unit/engine/slice-305-magic-item-wires.test.ts):

- **Ring of Feather Falling** → `effects: [{ GrantFallingProtection }]`. The slice-129 falling planner already short-circuits to no events when this effect is present; the attuned ring projects it via slice-132 magic-item projection (RAW: "you descend 60 feet per round and take no damage from falling").
- **Gloves of Thievery** → `effects: [{ AddModifier, target: { kind: skill, skill: sleight-of-hand }, value: 5 }]`. Projects from inventory (no attunement) and surfaces in the ability-check modifier sum (RAW: "+5 bonus to Dexterity (Sleight of Hand) checks").
- **Potion of Invulnerability** → `onConsume: [{ ApplyCondition, conditionId: potion-of-invulnerability-active }]` + a new condition carrying `GrantResistance { damageType: 'all' }` (RAW: "Resistance to all damage" for 1 minute).
- **Potion of Gaseous Form** → `onConsume: [{ ApplyCondition, conditionId: gaseous-form-active }]`, reusing the slice-287 condition (RAW: "the effect of the Gaseous Form spell for 1 hour").
- **Elixir of Health** → `onConsume: [{ RemoveConditions, conditionIds: [blinded, deafened, paralyzed, poisoned] }]` via the slice-283 ConsumeAction variant (RAW: those four conditions end).

The three potions/elixir were miscategorized as `itemKind: 'magic'` with empty `effects` (the pack's other potions are already `consumable`); slice 305 corrected them to `itemKind: 'consumable'` so they carry `onConsume`. RAW deviations carried as consumer-managed (mirror of slice 236's ApplyCondition doc): the 1-minute / 1-hour potion durations and Gaseous Form's bonus-action dismissal are not auto-expired; Elixir's "cured of all magical contagions" arm is narrative (no disease model).

Process note (why this is a content sweep, not the planned next buff-spell wire): a full audit of the remaining buff-shape `skip` spells in spell-coverage.test.ts found the cheap pure-content spell wires are exhausted — every remaining one needs a missing primitive (see-invisibility wants a `see-invisible` sense; glibness/nondetection want anti-divination + check-floor primitives; beacon-of-hope needs a death-save advantage RollTarget plus recipient-side max-healing). Magic items still hold wireable-today content, so the sweep pivoted there to keep pushing coverage cheaply.

Audit (content sweep): Names — reused existing effect-primitive vocabulary and the `*-active` condition naming convention. DRY — no new abstraction; each wire is a direct primitive application. SRP — the one new condition does one thing (resistance to all). Magic numbers — the +5 (Gloves) and the four cleared conditions (Elixir) are RAW-cited above. Mechanical outcomes asserted — falling planner returns no events with the ring (and damage without it / unattuned); Gloves add exactly +5 to the sleight-of-hand modifier sum and 0 to other skills; consuming each potion applies/removes the expected conditions and Invulnerability yields resistance to fire/bludgeoning/necrotic. Tests — 9 new, pinning each wire plus an unattuned-ring control, a non-skill-bleed check, and a no-op Elixir clear that still consumes the item. Coverage snapshot gained `potion-of-invulnerability-active` + the 2 magic items; full suite green (1873 passed), tsc clean. Docs: gaps Items + Conditions rows refreshed.

**Content cleanup: remove 6 dead 2014-era orphan conditions (slice 304)**

Closes the slice-301 deferred row, now guided by the slice-303 pack-integrity audit. Removed all six conditions that carried effects but had no SRD 5.2.1 spell carrier (all 2014 PHB leftovers): `wrathful-smite-active`, `thunderous-smite-active`, `branding-smite-active` (named-smite spells, replaced by 2024's Divine Smite feature), `holy-weapon-active` (Holy Weapon), `invulnerable-active` (Invulnerability), `earthbound-active` (Earthbind). None are in the spells catalog; the conditions were stranded when the IP cleanup / SRD 5.2.1 migration dropped the carrier spells.

Test fixture preserved: `effective-non-walk-speed.test.ts`'s "zero-set wins" case leaned on `earthbound-active` (fly set 0) to prove a `ModifySpeed set 0` overrides a non-walk speed source. That coverage stays — the fly-set-0 fixture moved into a test-local pack (`test-fly-grounded-fixture`) so it exercises the engine path without shipping a dead condition to consumers.

Audit allowlist emptied: `KNOWN_DEAD_ORPHANS` in [tests/audit/pack-integrity.test.ts](tests/audit/pack-integrity.test.ts) is now `new Set([])`. The orphan-condition audit enforces zero orphans going forward (a new unwired condition fails the test; the fix is to wire it, not allowlist it).

Audit: content removal + 1 test-fixture refactor + 1 audit allowlist edit. tsc clean; 1864 tests across 271 files (unchanged count). Conditions coverage snapshot dropped exactly the 6 removed ids (verified diff). Doc updates: gaps-row struck through closed; Conditions count 117 → 115; the slice-78 shipped-primitives doc note updated to record the Earthbind retirement.

**Tests+infra: pack-integrity audits + pattern-check norm update (slice 303)**

Promotes two ad-hoc pattern-check sweeps (slices 298 + 301) to a permanent audit harness, and documents the promotion path + the false-positive lesson in CLAUDE.md. Same path as srd-drift (slice 195) and doc-size (slice 285): when a sweep is script-checkable, it belongs in `tests/audit/` so CI catches regressions at commit time.

New audit [tests/audit/pack-integrity.test.ts](tests/audit/pack-integrity.test.ts) (8 tests):
- **No duplicate ids within a category** — per-category, since `shield` legitimately exists as both an armor item and a spell (ids are looked up per category). Would have caught the slice-298 Stone of Good Luck duplicate if both copies had shared an id; they didn't, hence the second check.
- **No wired/empty mix in a name group** — the actual Stone of Good Luck signature: two entries sharing a normalized name (parentheticals stripped), one wired + one empty stub. Intentional variant families (Armor/Ring/Potion of Resistance, Greatclub/Ogre Greatclub, absorb-elements-charged-*) are internally consistent (all wired or all empty), so they pass; an accidental stub-vs-real duplicate is the only mix.
- **Conditions with effects are reachable** — walks content refs (`conditionId` / `allyConditionId` / `conditionOnFail` / `bearerConditionId`) AND the engine source under `src/`, plus two documented allowlists: `KNOWN_DEAD_ORPHANS` (the 6 dead 2014-era conditions, tracked for cleanup) and `DYNAMICALLY_APPLIED` (the 5 `absorb-elements-charged-*` conditions applied via runtime string interpolation that no static scan can see). A `stale allowlist` test flags any KNOWN_DEAD entry that becomes reachable or is removed, so the list can't rot.

Negative-proof verified: planting a wired/empty duplicate + a new orphan condition makes 2 of the 8 tests fail; removing the plant restores green.

CLAUDE.md "Pattern-check on bugs" gains two norms:
- **Promote repeatable sweeps to permanent audits** (with the srd-drift / doc-size / pack-integrity precedents).
- **Under-walking references is the false-positive trap** — the mirror of the existing "filter shape determines what a sweep can find" false-negative norm. The slice-301 orphan sweep produced ~13 false positives because its first pass missed planner-emitted (string-literal in `src/engine/plan/`) and interpolation-applied conditions. The rule: before trusting a "found N unreferenced things" sweep, ask which reference forms you're NOT looking at (interpolation, indirection, code-vs-data, cross-category).

Bundled archive: shipping this slice's CHANGELOG entry pushed the live file past the 60 KB ceiling (the very audit promoted last cohort). Per the slice-300 release note's plan, the alpha.8 per-slice detail (slices 282-299) moved to [docs/changelog/archive-slices-282-299.md](docs/changelog/archive-slices-282-299.md); the alpha.8 summary block + headline themes stay inline. Archive pointer block + the alpha.8 release-block pointer updated.

Audit: tests + docs only, no engine or content change. tsc clean; 1864 tests across 271 files (was 1856 / 270; +8 in the new audit). doc-size audit green (CHANGELOG back to ~20 KB; new archive 43 KB; CLAUDE.md 36 KB).

**Content: buff-shape spell sweep cluster 2 (slice 302)**

Continues the alpha.9 sweep. Two more wires using existing primitives.

- **Heroes' Feast (L6)** -> `heroes-feasted-active`: `GrantResistance(poison)` + `GrantConditionImmunity(frightened)` + `GrantConditionImmunity(poisoned)`. 2d10 HP-max-increase arm deferred (needs per-cast random rolled value baked at cast time, distinct from Aid's flat `flatAmount`). 1-hour delay is consumer-managed.
- **Wind Walk (L6)** -> `wind-walking-active`: `ModifySpeed(fly, set, 300)` + `GrantConditionImmunity(prone)` + 3x `GrantResistance(B/P/S)`. Fly lights up via slice-288's `getEffectiveFlySpeed`. Action restriction + revert-takes-1-minute-Stunned arms are consumer-managed (mirror of slice-287 gaseous-form-active).

Pattern-check: searched for sibling "+Nd10 HP max" arms. Heroes' Feast is the only random-HP-max-bonus today; no second canonical user yet to justify a new primitive.

Audit: pure content. tsc clean; 1856 tests / 270 files (+10 in [tests/unit/engine/slice-302-buff-spells.test.ts](tests/unit/engine/slice-302-buff-spells.test.ts) + 2 new conditions in snapshot). Spell-coverage: both flip skip -> buff.

**Content: buff-shape spell sweep (slice 301)**

First slice of the alpha.9 buff-shape spell sweep. Two clean wires using existing primitives + pattern-check audit that surfaced a deferred orphan-conditions backlog row.

Content wired:
- **True Seeing (L6)** — new `true-seeing-active` condition with `GrantSense truesight 120`. Auto-folds into slice-271's `attacker.bypassesSightIllusion` (Blur, Mirror Image) and slice-273's `canLocateInvisible` (Invisible condition) facts, since both check `hasSense('truesight')`. Truesight gain is immediately observable on incoming-attack + visibility-bypass paths. 1-hour duration consumer-managed.
- **Warding Bond (L2)** — new `warding-bond-active` condition with 3 of the 4 RAW arms: `AddModifier ac 1`, `AddModifier save wildcard 1` (slice-299 primitive), `GrantResistance damageType:'all'`. 60-ft proximity gate consumer-managed. Damage-sharing arm deferred (needs a shared-damage-link primitive); tracked as new backlog row.

Pattern-check sweep — orphan `*-active` conditions audit. Three categories surfaced:
- **Planner-emitted (false positives, NOT orphans)**: sacred-weapon-active, innate-sorcery-active, superior-defense-active, frenzied, dodged, shielded, baned, faerie-fired, absorb-elements-charged-*, healing-blocked-active. Engine-applied via dedicated planners or reducer-tagged conditions; initial walk-conditionId-refs script didn't follow src/engine/plan/ refs.
- **Already wired** (false positives): death-ward-active, freedom-of-movement-active, mind-blanked-active. My initial filter mis-classified them.
- **Dead 2014-era orphans (real)**: wrathful-smite-active, thunderous-smite-active, branding-smite-active, holy-weapon-active, invulnerable-active, earthbound-active. None of their source spells in SRD 5.2.1. Tracked as new deferred row for a focused future cleanup; not removed in slice 301 to keep scope tight.

Spell-coverage table: `true-seeing` and `warding-bond` flip from `skip` to `buff` in [tests/unit/engine/spell-coverage.test.ts](tests/unit/engine/spell-coverage.test.ts).

Audit: pure content. tsc clean; 1844 tests across 269 files (was 1833 / 268; +11 in new [tests/unit/engine/slice-301-buff-spells.test.ts](tests/unit/engine/slice-301-buff-spells.test.ts)). Conditions coverage snapshot adds true-seeing-active + warding-bond-active.

Doc updates: 2 new deferred-primitives-backlog rows (Warding Bond damage-sharing arm; dead 2014 orphan conditions cleanup).

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

*Slice detail for slices 48-280 has been moved out of the live CHANGELOG to per-cohort archives under [docs/changelog/](docs/changelog/) (single-Read fitness; slices 269-280 were archived in slice 288; slices 261-268 in slice 277; slices 252-260 in slice 270; the alpha.6 release block of slices 241-250 in slice 252; older slices in slice 248). Each fits in a single Read tool call:*

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
