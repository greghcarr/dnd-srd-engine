# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

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

Cumulative post-alpha.6 release. 31 slices (251-280) shipped since alpha.6 (251-260 archived in slice 270; 261-268 in slice 277; 269-280 detail inline below).

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

**Docs: refresh front-door counts + api-overview consumer-state pattern + 2 new tracking rows (slice 280)**

Pre-bump hygiene before promoting Unreleased to alpha.7. Three same-shape docs updates:

- **Test counts**: README.md and docs/status.md (2 spots) updated from "1643 tests across 244 files" to "1728 tests across 253 files." 85 new tests and 9 new files across the slice 251-279 window.
- **api-overview.md**: new paragraph documenting the consumer-supplied scene-state fact pattern (slices 263, 274, 276, 278, 279). Lists each of the five optional input fields, their host shapes (`AttackIntent` vs. `ComputeAbilityCheckInput`), their default semantic (default-apply vs. opt-in), and the framing distinction between negative penalties (default-apply) and positive benefits (opt-in).
- **starter-pack-gaps.md**: 2 new deferred-backlog rows. (1) Doc-size CI check (slice 270 + 277 each had to archive when the front-door doc went over ceiling silently; a `wc -c`-based pre-commit script would catch this earlier). (2) Consumer-half tracking for engine-half-only RAW fixes (slices 276 / 278 / 279 ship engine-side fact slots that no consumer currently populates; the bug fixes are silent in production until consumers wire them).

No code changes; no test changes; coverage snapshot unchanged. tsc clean; full vitest suite (1728 tests across 253 files) still green.

**Engine+content: Cloak of the Bat dim-light Stealth gate (slice 279)**

Closes the slice-263 deferred Cloak of the Bat Stealth row. RAW: "Advantage on Dexterity (Stealth) checks while wearing this cloak in an area of dim light or darkness." Pre-279 the SetAdvantage applied unconditionally (broader than RAW).

Same opt-in semantic as slice 263 (Eyes of the Eagle, `sense?`) and slice 274 (Gloves of Swimming, `athleticsSubAction?`): the consumer reports the value, undefined produces no advantage. Different from slice 276/278's default-apply: this is a positive benefit consumers opt INTO, not a negative penalty consumers opt OUT of.

**Plumbing**: new `lightLevel?: 'bright' | 'dim' | 'darkness'` on [`ComputeAbilityCheckInput`](src/derive/ability-check.ts). `computeAbilityCheck` populates `bearer.lightLevel` fact alongside the existing slice 263/274/276 facts.

**Content wired**: Cloak of the Bat's SetAdvantage on Stealth gains `condition: any(eq path:'bearer.lightLevel' value:'dim', eq path:'bearer.lightLevel' value:'darkness')`. Description rewritten to cite the RAW spec.

**Pattern-check sweep**: searched the pack for sibling Stealth-on-light items — none. Cloak of Elvenkind uses a different shape (target's WIS perception to spot bearer has disadvantage, not bearer's own Stealth advantage). Cloak of the Bat is the unique user.

**Related deferred rows updated**: the Cloak of the Bat fly-speed and Polymorph-to-Bat arms (slice-227 deferred rows) have half (b) — the `bearer.lightLevel` fact — closed by this slice. Half (a) still needs the slice-242 Toggle UseAction wire (fly speed) and a Polymorph cross-reference primitive (Polymorph arm).

Audit: name matches slice 263/274 sibling fields in `ComputeAbilityCheckInput`. Derive-only; plan/commit split preserved. tsc clean; full vitest suite (1728 tests across 253 files, was 1722) green. 6 cases: dim/darkness → advantage; bright → no advantage; undefined → no advantage; non-Stealth skill in dim → no advantage; unattuned in dim → no advantage. Pack drift: `cloak-of-the-bat.effects[0]` gains a `condition` field.

**Engine+content: Dodge LoS gate (consumer-supplied per-attacker) (slice 278)**

Closes the slice-267 deferred row for Dodge's missing LoS gate. RAW (SRD 5.2.1 Dodge): "any attack roll made against you has Disadvantage if you can see the attacker." Slice 272 added the Incap/Speed-0 self-disable; this slice adds the per-attacker LoS gate on the attack-disadvantage arm only (RAW: the LoS clause applies to the attack benefit; the DEX-save advantage has no LoS clause).

Same consumer-coordinated pattern as slice 276 (Frightened), but per-**attacker** rather than per-**bearer**: the same dodging creature might see attacker A but not attacker B, so the fact lives on `AttackIntent` (per-call) rather than on a per-character state field.

**Plumbing**: new `targetCanSeeAttacker?: boolean` on [`AttackIntent`](src/engine/plan/attack.ts) and `ResolveAttackInput`, threaded into the `attackerFacts` map as `bearer.canSeeAttacker` (the bearer of `dodged` is the target of this attack). Default-apply: predicate is `not eq value:false`, undefined and true both fire the disadvantage.

**Content wired**: `dodged.effects[0]` (the `ImposeDisadvantageOnAttackers` entry) combines the slice-272 Incap/Speed-0 gate with the new LoS gate via `all`. The DEX-save advantage arm stays unchanged (RAW: no LoS clause). Description rewritten to cite both gates.

Audit: name parallels slice 276's `bearerCanSeeFearSource` but axis differs (per-attacker vs. per-bearer). Threading uses the slice-206 spread-on-defined idiom. Derive-only fact-population; plan/commit split preserved. tsc clean; full vitest suite (1722 tests across 252 files, was 1718) green. 4 cases in [tests/unit/engine/dodge-los-gate.test.ts](tests/unit/engine/dodge-los-gate.test.ts): undefined fires disadvantage; true fires; false bypasses; non-dodged target has no disadvantage. Default-apply preserved prior behavior (the 1718 pre-slice tests still pass without modification). Pack drift: `dodged.effects[0].condition.terms` gains a third (LoS) term.

**Docs+infra: archive slices 261-268 to restore single-Read ceiling (slice 277)**

Companion to slice 276. Slice 276's CHANGELOG entry pushed the live doc ~70 tokens over the single-Read ceiling. This slice archives the pattern-check chain (slices 261-268) to [docs/changelog/archive-slices-261-268.md](docs/changelog/archive-slices-261-268.md), mirroring slice 270's archive of 252-260. Live Unreleased now carries slices 269-276 (the bug-fix cohort that surfaced from the pattern-check chain).

CHANGELOG.md drops from ~63 KB → ~35 KB. Mechanical reorganization only; path-prefix sweep applied per the slice-252 convention. tsc clean; full vitest suite (1718 tests across 251 files) green. Both front-door docs verified to fit in a single Read post-archive.

**Engine+content: Frightened breadth + LoS gate (slice 276)**

Closes the dual-bug slice-264 deferred row. Both axes fixed simultaneously: breadth (now all 6 ability checks via the slice-266 check wildcard; was STR-only) + LoS gate (consumer-supplied, default-apply). RAW (SRD 5.2.1): "Disadvantage on ability checks and attack rolls while the source of fear is within line of sight."

First slice in this chain to ship the **engine half of a consumer-coordinated fix**: the engine exposes a `bearerCanSeeFearSource?: boolean` slot on `AttackIntent` + `ComputeAbilityCheckInput`, the consumer (UI, encounter manager, future VTT) supplies the value when it models line of sight, undefined preserves current behavior. The predicate is `not eq path:'bearer.canSeeFearSource' value:false` — default-apply semantics so consumers not yet wired don't regress. Future LoS-gated bugs (Dodge LoS gate, Cloak of the Bat dim-light family) will follow the same pattern.

**Plumbing**: new `bearerCanSeeFearSource?: boolean` on [`AttackIntent`](src/engine/plan/attack.ts), [`ResolveAttackInput`](src/engine/plan/attack.ts), and [`ComputeAbilityCheckInput`](src/derive/ability-check.ts). Threaded from `planAttack` through `resolveAttack` into `attackerSelfAdvantageFacts` (attack arm); populated directly in `computeAbilityCheck`'s facts map (check arm). Mirrors slice-263 / 274 consumer-supplied scene-state pattern.

**Content wired**: `frightened` condition's existing STR-only check entry replaced with the slice-266 wildcard; both arms gain `condition: { kind: 'not', term: { kind: 'eq', path: 'bearer.canSeeFearSource', value: false } }`.

**Pattern-check sweep**: Frightened is the unique RAW source-in-LoS-gated condition. Charmed gates on a specific source-relative target (different shape); Hex tracks without LoS. Per-source `frightened-by-X` variants don't ship today.

Audit: names match the `bearer.*` namespace and slice-263 / 274 sibling fields. Threading uses the slice-206 spread-on-defined idiom. Derive-only fact-population; plan/commit split preserved. tsc clean; full vitest suite (1718 tests across 251 files, was 1711) green. 7 cases in [tests/unit/engine/frightened-los-gate.test.ts](tests/unit/engine/frightened-los-gate.test.ts) — 4 ability-check + 3 attack-roll. Default-apply preserves prior behavior (the 1711 pre-slice tests still pass without modification). Pack drift: `frightened.effects[0]` + `effects[1]` each gain a `condition` field; the check arm switches from per-ability (STR) to wildcard.

**Engine+content: Bracers of Archery +2 damage with longbow / shortbow (slice 275)**

Closes the slice-224 deferred row that has been waiting on weapon-id specificity. RAW: "Proficiency with the longbow and the shortbow, and gain a +2 bonus to damage rolls on ranged attacks made with such weapons." Pre-275 Bracers of Archery shipped unwired (`effects: []`). This slice ships the +2 damage arm (the higher-payoff mechanical wire); the proficiency arm stays deferred until conditional `GrantProficiency` lands.

**Plumbing**:

- New `event.weaponId: string` predicate fact on the attack planner's `damageFacts` map (carrying the weapon instance's `definitionId`). Sits alongside `event.attackKind`, `event.damageType`, and `bearer.offHandHasWeapon`. Unblocks any future weapon-specific item buff with the same shape (Sun Blade vs. specific sword types, Dwarven Thrower vs. specific hammers, etc.).

**Content wired (1 magic item)**:

- **Bracers of Archery** (was `effects: []`): new `AddModifier { target: 'damage', value: 2, condition: { kind: 'any', terms: [{ kind: 'eq', path: 'event.weaponId', value: 'longbow' }, { kind: 'eq', path: 'event.weaponId', value: 'shortbow' }] } }`. Description rewrites the RAW spec and notes the deferred proficiency arm.

**Pattern-check sweep**: searched the pack for sibling items with weapon-id-specific damage gates — none currently. Sun Blade gates on weapon TYPE (radiant) which the existing `event.damageType` covers. Dwarven Thrower, Trident of Fish Command, and other "specific weapon type" items mostly ship as `effects: []` and would benefit from `event.weaponId` when wired; tracking those as a future content sweep rather than this slice.

**RAW deviation tracked**: the proficiency arm of Bracers of Archery (RAW: grants longbow/shortbow proficiency regardless of class) is not yet wired. Conditional `GrantProficiency` would be the cleanest path (a `condition` field on the existing `GrantProficiency` shape, mirror of slice 258's `SetAdvantage.condition` plumbing). No current canonical user other than this; tracked as deferred and waiting for a second use case before adding the schema field.

Pre-commit Uncle Bob audit:

- **Names**: `event.weaponId` lives in the existing `event.*` namespace alongside `event.attackKind` and `event.damageType`. Mirrors the slice-263 / 274 `event.sense` / `event.athleticsSubAction` pattern.
- **DRY**: same fact-map-then-AddModifier shape as Dueling fighting style (`event.attackKind == melee`) and Archery fighting style (`event.attackKind == ranged`). The Bracers wire reads consistently with both.
- **SRP**: one new fact, one content wire, no API change. The damageFacts map already existed and already routed predicates; this slice extends it by one key.
- **Magic numbers**: `2` (the damage bonus) is RAW; `'longbow'` / `'shortbow'` are content ids (RAW-named).
- **at-threading**: N/A (damage modifier, no new event emitted).
- **Plan/commit split preserved**: derive-only (modifier sum), no RNG.
- **Pattern-check applied**: confirmed Bracers of Archery is the only currently-applicable user of weapon-id-specific damage gates. Future "specific weapon type" items (Dwarven Thrower, Trident of Fish Command, etc.) plug in by gating on `event.weaponId`.
- **Mechanical outcomes asserted**: tsc clean; full vitest suite (1711 tests across 250 files, was 1706) green. 5 cases: Bracers + longbow gets +2; Bracers + shortbow gets +2; Bracers + heavy crossbow gets +0 (RAW bows only); no Bracers baseline; Bracers carried but not attuned stays at baseline (slice-132 projection gate).
- **Tests**: 5 cases in new [tests/unit/engine/bracers-of-archery.test.ts](tests/unit/engine/bracers-of-archery.test.ts). Coverage snapshot: `bracers-of-archery` joins `wiredIds` (was unwired).

Pack snapshot drift: `bracers-of-archery.effects` goes from `[]` to a single AddModifier entry. Coverage matrix: 1 new entry in `wiredIds`.

**Engine+content: Gloves of Swimming and Climbing sub-action gate (slice 274)**

Closes the deferred row from slice 263's pattern-check sweep. RAW: "Advantage on any Strength (Athletics) check you make to climb or swim." Pre-274 the wire was broader (advantage on every Athletics check). Mirror of slice 263's `sense?` field pattern on a different axis (skill sub-action vs. environmental sense).

**Plumbing**:

- New `athleticsSubAction?: 'climb' | 'swim' | 'jump' | 'grapple' | 'shove'` field on [`ComputeAbilityCheckInput`](src/derive/ability-check.ts). The five-value enum covers 2024 PHB-named Athletics applications. Populated by the consumer who knows the narrative context; defaults to undefined.
- `computeAbilityCheck` populates `event.athleticsSubAction: input.athleticsSubAction` in the facts map alongside slice 263's `event.sense`. Undefined means "consumer didn't specify" — gates requiring a specific sub-action evaluate false.

**Content wired (1 magic item)**:

- **Gloves of Swimming and Climbing**: existing `SetAdvantage on:{kind:'skill', skill:'athletics'} mode:'advantage'` gains `condition: { kind: 'any', terms: [{ kind: 'eq', path: 'event.athleticsSubAction', value: 'climb' }, { kind: 'eq', path: 'event.athleticsSubAction', value: 'swim' }] }`. The ClimbSpeed / SwimSpeed arms stay unconditional (RAW: granted while the gloves are worn).

**Pattern-check sweep**: searched the pack for other `SetAdvantage on:{kind:'skill', skill:'athletics'}` wires — none. Gloves of Swimming and Climbing is the unique Athletics-targeting SetAdvantage in the pack. The pattern-check chain from slice 263 (which surfaced 3 broader-than-RAW SetAdvantage wires: Eyes of the Eagle closed slice 263; Cloak of the Bat Stealth still open per the deferred light-level row; Gloves closed this slice) is now down to 1 remaining.

Pre-commit Uncle Bob audit:

- **Names**: `athleticsSubAction` is intention-revealing about its scope (Athletics-only) and the axis (sub-action vs. ambient context). `event.athleticsSubAction` mirrors `event.sense` in the predicate namespace.
- **DRY**: same shape as slice 263's `sense?` field. The two facts live side-by-side in the same facts map population in `computeAbilityCheck` (3 lines vs. 1 line each); no abstraction needed.
- **SRP**: the input field, fact population, and content wire each own one concern. No engine API change beyond the optional input field.
- **Magic numbers**: none. The five sub-action enum values are RAW vocabulary.
- **at-threading**: N/A (derive-only).
- **Plan/commit split preserved**: derive-only change.
- **Pattern-check applied**: confirmed Gloves are the unique Athletics-targeting SetAdvantage. Closing this row leaves Cloak of the Bat Stealth as the only remaining slice-263 deferred sibling (which still needs the `bearer.lightLevel` consumer-state fact).
- **Mechanical outcomes asserted**: tsc clean; full vitest suite (1706 tests across 249 files, was 1700) green. 6 cases: advantage on climb, advantage on swim, no advantage on jump, no advantage on grapple/shove (loop), no advantage when sub-action omitted, no advantage when Gloves unattuned (slice-132 projection gate still works).
- **Tests**: 6 cases in new [tests/unit/derive/gloves-of-swimming-and-climbing.test.ts](tests/unit/derive/gloves-of-swimming-and-climbing.test.ts).

Pack snapshot drift: `gloves-of-swimming-and-climbing.effects[2]` gains a `condition` field. Coverage matrix counts unchanged.

**Engine+content: Invisible condition perception-bypass on both arms (slice 273)**

Closes the gap tracked in slice 271's pattern-check secondary finding. The `invisible` condition had a known two-bug shape:

1. The bearer-side `SetAdvantage on:'attack' mode:'advantage'` (bearer's own attacks) applied unconditionally; RAW: "If a creature can somehow see you, you don't gain this benefit against that creature."
2. The disadvantage-on-attackers arm was missing entirely; RAW: "Attack rolls against you have Disadvantage."

This slice ships both. The shape is symmetric to slice 271's Blur bypass but uses a different bypass clause (Blinded creatures do NOT bypass invisibility — they can't see anything to begin with — so they're excluded from this fact).

**Plumbing**:

- New `attacker.canLocateInvisible` + `target.canLocateInvisible` boolean facts populated in [src/engine/plan/attack.ts](src/engine/plan/attack.ts). True when the counter-party has blindsight, tremorsense, or truesight. Computed via a shared helper closure (`canLocateInvisible(effectStack)`) applied to both attacker and target.
- `attackerEffects.advantageFor('attack')` now receives a facts map containing `target.canLocateInvisible` (previously called with no facts). The existing `attackerFacts` map (passed to `imposesDisadvantageOnAttackers`) gains `attacker.canLocateInvisible`.

**Content wired (1 condition)**:

- **`invisible`**: existing `SetAdvantage on:'attack' mode:'advantage'` gains `condition: { kind: 'eq', path: 'target.canLocateInvisible', value: false }`. New `ImposeDisadvantageOnAttackers` entry with `condition: { kind: 'eq', path: 'attacker.canLocateInvisible', value: false }`. Description rewrites the RAW spec and notes the Blinded distinction.

**Pattern-check sweep**: Invisible is the only 2024 RAW condition with `SetAdvantage on:'attack' mode:'advantage'` (slice 113 archived: "invisible — gains advantage on its own attacks"). All other conditions with `SetAdvantage on:'attack'` use `mode:'disadvantage'` (blinded, frightened, poisoned, prone, restrained — none need a bypass clause; they impose on the bearer's own attacks unconditionally per RAW). No sibling bugs surfaced.

Pre-commit Uncle Bob audit:

- **Names**: `canLocateInvisible` reads as a boolean question targeted at the Invisible RAW shape ("can a creature somehow see you"). Mirror naming on both attacker and target sides. The slice-271 `bypassesSightIllusion` fact is kept separate because its bypass clause includes Blinded (Blur's "doesn't rely on sight" applies to blinded creatures; Invisible's "can somehow see you" does not).
- **DRY**: shared `canLocateInvisible(effects)` closure used at both attacker and target call sites — three-line helper, two call sites, the symmetry made the abstraction worth the named function.
- **SRP**: facts live in the existing maps already passed to `advantageFor` / `imposesDisadvantageOnAttackers`. No new helper or API change. The condition uses existing `eq` predicate; no new predicate kinds.
- **Magic numbers**: none added. The three senses (blindsight, tremorsense, truesight) are RAW vocabulary.
- **at-threading**: N/A (derive-only fact population).
- **Plan/commit split preserved**: derive-only change. No RNG, no event emission.
- **Pattern-check applied**: confirmed Invisible is the unique 2024 condition with `SetAdvantage on:'attack' mode:'advantage'`. Five other `SetAdvantage on:'attack'` wires all use disadvantage; none need a bypass.
- **Mechanical outcomes asserted**: tsc clean; full vitest suite (1700 tests across 248 files, was 1695) green. 5 integration cases organized in two describes: bearer-attacks-someone (advantage with sight-only target; no advantage with truesight target) + attacker-targets-bearer (disadvantage with sight-only attacker; no disadvantage with truesight attacker) + a no-Invisible baseline.
- **Tests**: 5 cases in new [tests/unit/engine/invisible-perception-bypass.test.ts](tests/unit/engine/invisible-perception-bypass.test.ts).

Pack snapshot drift: `invisible.effects[0]` gains a `condition` field; new `effects[1]` is the ImposeDisadvantageOnAttackers entry. Coverage matrix counts unchanged.

**Engine+content: Dodge benefits disabled by Incapacitated / Speed 0 (slice 272)**

Closes the second of the slice-267 outstanding bugs. RAW (2024 PHB Dodge action): "You lose these benefits if you have the Incapacitated condition or if your Speed is 0." Pre-272 the `dodged` condition imposed both benefits (disadvantage on attackers + advantage on DEX saves) unconditionally. The gaps row sketched two paths; this slice ships path (a) — per-effect `condition` predicate — because it reuses the slice-103 + slice-258 plumbing already in place without new schema surface. Path (b) (a condition-level `disabledWhile?` field) is deferred unless a second canonical user emerges.

**Plumbing**:

- New `bearer.hasIncapacitated` and `bearer.speedZero` boolean facts populated at the two consumer sites: [src/engine/plan/attack.ts](src/engine/plan/attack.ts) (for the `ImposeDisadvantageOnAttackers` arm) and [src/derive/save.ts](src/derive/save.ts) (for the `SetAdvantage on:save.DEX` arm). The existing `findActorBlockingCondition` helper (slice 199) covers Incapacitated + the four conditions that RAW-include Incapacitated (Stunned, Paralyzed, Petrified, Unconscious) plus HP <= 0; `getEffectiveSpeed` (slice 77) computes the bearer's effective walking speed across the full effect stack.
- `computeSavingThrow` adds the new facts to the same facts map already carrying `event.isSpellSave`. No API change.

**Content wired (1 condition)**:

- **`dodged`**: both effect entries gain a `condition: { kind: 'all', terms: [{ kind: 'eq', path: 'bearer.hasIncapacitated', value: false }, { kind: 'eq', path: 'bearer.speedZero', value: false }] }` predicate. Description rewritten to cite the RAW disable clause and the slice-267 LoS row that stays deferred.

**Pattern-check sweep** (per slice 261 / 268 norms): the "RAW lose these benefits if X" shape is uniquely Dodge among 2024 conditions. Rage, Concentration, and Hide all *end* on their respective triggers rather than disabling effects while keeping the condition active. No sibling bugs surfaced. The slice-103 `ImposeDisadvantageOnAttackers.condition` plumbing already honored predicates; the only missing piece was the bearer-state facts at the call sites — populated here for both consumer paths.

Pre-commit Uncle Bob audit:

- **Names**: `bearer.hasIncapacitated` reads as a boolean question; `bearer.speedZero` is concise. Both live in the existing `bearer.*` namespace alongside `bearer.tempHp` (slice 122) and `bearer.wieldingShield` (slice 230). The old Elusive-era `bearerHasIncapacitated` fact (no dot, slice 199) is left untouched because pulling Elusive into the new namespace would be a separate concern.
- **DRY**: same two facts populated at two call sites (attack planner + save derive). Considered factoring into a helper but the call sites differ (attack consumes the target via its planner state; save consumes `input.character` via its derive input) and the construction is 3 lines each. Inline keeps each consumer self-contained.
- **SRP**: facts live next to existing predicate facts in the same maps. No new helper. The condition's predicate composition uses existing `all` + `eq` shapes; no new predicate kinds.
- **Magic numbers**: none added.
- **at-threading**: N/A (derive-only fact population).
- **Plan/commit split preserved**: derive-only change. No RNG, no event emission.
- **Pattern-check applied**: searched for RAW "lose these benefits if..." shape across the 2024 PHB conditions; Dodge is the unique instance. The cleaner path-(b) abstraction (condition-level `disabledWhile?`) is deferred because there's no second user to justify the schema extension.
- **Mechanical outcomes asserted**: tsc clean; full vitest suite (1695 tests across 247 files, was 1692) green. 3 integration cases: baseline (both arms work), Incapacitated disables both, Grappled (speed 0) disables both. Grappled rather than Restrained for the speed-zero case because Restrained adds its own advantage-on-attackers + DEX-save disadvantage that would muddy the observable.
- **Tests**: 3 cases in new [tests/unit/engine/dodge-self-disable.test.ts](tests/unit/engine/dodge-self-disable.test.ts).

Pack snapshot drift: `dodged.effects[0]` and `effects[1]` each gain a `condition` field. Coverage matrix counts unchanged.

**Engine+content: Blurred attacker-sense bypass closes the slice-267 outstanding bug (slice 271)**

Closes the third of the slice-267 outstanding bugs: the `blurred-active` condition imposed disadvantage on attackers unconditionally, but Blur RAW says "An attacker is immune to this effect if it doesn't rely on sight, as with Blindsight, or can see through illusions, as with Truesight." The bypass shape is mirror of slice 127's Mirror Image vision-gate (already shipped for that one spell's dedicated deflection branch).

**Plumbing**:

- New `attacker.bypassesSightIllusion` boolean fact populated in [src/engine/plan/attack.ts](src/engine/plan/attack.ts)'s `attackerFacts` map. True when the attacker has blindsight, tremorsense, or truesight, OR carries the Blinded condition. Mirrors the slice-127 Mirror Image bypass logic verbatim. Darkvision is sight-based and intentionally excluded.

**Content wired (1 condition)**:

- **`blurred-active`**: the existing `ImposeDisadvantageOnAttackers` entry gains `condition: { kind: 'eq', path: 'attacker.bypassesSightIllusion', value: false }`. Description rewritten to drop the "blindsight / truesight / blindness isn't modeled" caveat.

**Pattern-check sweep** (per slice 261 / 268 norms): walked all 8 `ImposeDisadvantageOnAttackers` wires in the pack against RAW. Blur was the only same-shape bug:

- `escape-the-horde` (slice 206): gated on `event.isOpportunityAttack` — correct.
- `dodged` (Dodge action): two separately-tracked deferred rows (LoS gate + Incap/Speed-0 disabler) blocked on consumer-supplied scene state and bearer-state predicate facts respectively.
- `boots-of-speed-active` (slice 269): gated on `event.isOpportunityAttack` — correct.
- `foresight-active` (Foresight spell): unconditional — RAW-correct (precognitive sense, not a sight-illusion).
- `protection-from-evil-and-good-active` (slice 103): gated on `attackerCreatureType` — correct.
- `magic-circle-active` (slice 103): gated on `attackerCreatureType` — correct.
- `holy-aura-active` (slice 103): unconditional — RAW-correct (universal).

**Pattern-check secondary finding** (different shape, new tracking row): the `invisible` condition's wire is broken on a different axis. It carries `SetAdvantage on:'attack' mode:'advantage'` (bearer's own attack advantage) but is missing both:
1. The disadvantage-on-attackers arm entirely.
2. The bypass clause on the existing advantage arm ("if a creature can somehow see you, you don't gain this benefit against that creature").

Tracked as a new deferred row in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md). Closing (b) for Invisible is a one-line content edit (parallel to this slice); closing (a) needs a target-side perception fact symmetric to this slice's attacker-side fact (the engine doesn't track per-target see-invisibility today).

Pre-commit Uncle Bob audit:

- **Names**: `attacker.bypassesSightIllusion` is intention-revealing about both the bypass condition and the use case (sight-illusion effects, not all sight-related). The path namespace (`attacker.*`) matches the existing `attacker` family (`attackerCreatureType` already in the same map).
- **DRY**: bypass logic mirrors slice 127 byte-for-byte (`hasSense('blindsight') || hasSense('tremorsense') || hasSense('truesight') || appliedConditions.includes('blinded')`). Extracted as a local boolean named `attackerBypassesSightIllusion` for readability; not factored to a shared helper because slice 127's Mirror Image branch reads its own logic inline (the inline form lets each call site document its bypass clauses against its own RAW source).
- **SRP**: the fact-population sits next to the existing `attackerCreatureType` and `event.isOpportunityAttack` facts (one map, one purpose: predicate gates for `ImposeDisadvantageOnAttackers`). The condition entry gates via the existing slice-103 predicate plumbing; no engine API change.
- **Magic numbers**: none added. The four sense / condition checks are RAW vocabulary.
- **at-threading**: N/A (no events emitted by the new code path).
- **Plan/commit split preserved**: derive-only fact-population; no RNG, no event emission.
- **Pattern-check applied**: 8 wires audited, 1 closed (Blur), 0 false-positives (RAW-correct universal wires kept as-is), 1 new tracking row (Invisible — different shape).
- **Mechanical outcomes asserted**: tsc clean; full vitest suite (1692 tests across 246 files, was 1689) green. 3 new integration cases: baseline sight-only attacker rolls with disadvantage (2 d20); truesight attacker bypasses (1 d20, used='none'); no-condition baseline doesn't impose disadvantage (1 d20). The Blinded-attacker case is observationally muddied by Blinded's own attacker-side disadvantage (slice 97) and isn't pinned at the integration level; the slice-127 Mirror Image tests pin the same Blinded-bypass code path in a different scenario.
- **Tests**: 3 cases in new [tests/unit/engine/blur-attacker-sense-bypass.test.ts](tests/unit/engine/blur-attacker-sense-bypass.test.ts).

Pack snapshot drift: 1 entry on `blurred-active.effects[0]` gains a `condition` field. Coverage matrix counts unchanged.

**Docs+infra: front-door docs split back under single-Read ceiling (slice 270)**

Two same-shape splits to restore single-Read fitness on the two front-door docs that drifted over the ceiling during the recent slice cluster:

1. **CHANGELOG.md**: slices 252-260 archived to [docs/changelog/archive-slices-252-260.md](docs/changelog/archive-slices-252-260.md) (mirrors the slice 248 / slice 252 archive convention). Slices 261-269 stay live as the recent pattern-check chain + bug-fix slice.
2. **docs/starter-pack-gaps.md**: the shipped engine-slice rows (~30 rows, all `~~struck through~~` ✓ shipped) split out to [docs/gaps-engine-slices-shipped.md](docs/gaps-engine-slices-shipped.md). The "Future engine slices" table in the live gaps doc now lists only the unshipped rows plus a pointer to the shipped archive.

Surface symptom: pre-split, both files errored out on the Read tool with "exceeds maximum allowed tokens." A fresh agent landing on the repo couldn't open either front-door doc in one call, breaking the slice-template discovery path. Both are now back under the ceiling and read in one call.

What changed:

- **CHANGELOG.md**: 65 KB → ~36 KB. Live Unreleased section keeps slices 261-269 (9 slices); archived range 252-260 (9 slices) follows the slice-252 archive format including the `../../` path prefix sweep on root-relative links.
- **New file [docs/changelog/archive-slices-252-260.md](docs/changelog/archive-slices-252-260.md)** (~35 KB): header + slice-by-slice entries copied verbatim with the path-prefix sweep applied. Order: most-recent first.
- **CHANGELOG archive pointer block**: gains the new archive's row at the top of the index; description prose updated to reflect "slices 48-260" coverage and slice 270 as the most recent archive operation.
- **docs/starter-pack-gaps.md**: 64 KB → ~33 KB. The "Future engine slices" table now contains only unshipped rows; a pointer line and a sentence of context route readers to the shipped-engine-slices archive when they want the historical view.
- **New file [docs/gaps-engine-slices-shipped.md](docs/gaps-engine-slices-shipped.md)** (~32 KB): carries the shipped rows verbatim (relative links unchanged because the new file is a sibling under `docs/`, same depth as the original).

Pattern-check meta-finding: both front-door docs drifted over the ceiling during the slice 253-269 window. Slice 248 originally enforced the ceiling but didn't add a mechanical check; slices since then grew the files past the limit silently. Adding a CI check (a script that fails when front-door docs exceed N bytes / tokens) would catch this earlier; tracked as a small future infra slice.

Pre-commit short audit (docs/infra slice):

- **Names**: archive file naming follows the existing `archive-slices-NNN-MMM.md` convention; the new `gaps-engine-slices-shipped.md` mirrors the slice-249 pattern (`gaps-{category}.md` siblings under `docs/`).
- **DRY**: archive headers reuse the slice-252 archive's structure (intro paragraph + bullet list of covered slices + most-recent-first note). Path-prefix sweep uses the slice-252 sed pattern verbatim.
- **SRP**: pure docs/infra slice. No code, schemas, or content surface touched. The split is mechanical reorganization; no content edits beyond the path-prefix sweep.
- **Magic numbers**: ceiling target stated as "comfortably under 60 KB" matching CLAUDE.md's documented threshold.
- **at-threading**: N/A.
- **Mechanical outcomes asserted**: tsc clean; full vitest suite (1689 tests across 245 files) green; CHANGELOG.md fits in a single Read post-split; docs/starter-pack-gaps.md fits in a single Read post-split; both archive files fit individually; sibling-archive cross-references in `docs/changelog/` still resolve.
- **Tests**: no new tests. The doc-size check is manual at this point (verified by attempting `Read` on each front-door doc without offset/limit).

**Content: Boots of Speed Disadvantage-on-OA arm closed; stale gap row (slice 269)**

Closes the Boots of Speed RAW "Disadvantage on opportunity attacks against the wearer" arm that has been deferred since slice 242. The `boots-of-speed-active` condition now wires a second effect: `ImposeDisadvantageOnAttackers` gated on `{ kind: 'eq', path: 'event.isOpportunityAttack', value: true }`. No engine work — the predicate fact landed in slice 206 (for Hunter L7 Escape the Horde, the first canonical user of the same shape), making this a one-line content edit.

What changed:

- **[src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)** boots-of-speed-active condition: added the `ImposeDisadvantageOnAttackers` entry; rewrote the description to drop the stale "needs an `event.isOpportunityAttack` predicate fact" caveat (slice 206 landed it).
- **[tests/unit/engine/boots-of-speed-oa-disadvantage.test.ts](tests/unit/engine/boots-of-speed-oa-disadvantage.test.ts)** (new, 3 cases): an OA against the boots-active wearer rolls with disadvantage (2 d20); a regular attack does not (1 d20, used='none'); an OA against a baseline target without the condition does not (1 d20).
- **[docs/starter-pack-gaps.md](docs/starter-pack-gaps.md)**: struck the deferred row; closure annotation cites the meta-finding below.

**Pattern-check meta-finding**: this row sat 27 slices past the primitive's landing (slice 206 → slice 269 for the second canonical user). Slice 206 wired one canonical user (Escape the Horde) and tested the fact's plumbing, but didn't sweep the deferred-primitives backlog for OTHER content already documented as waiting on the same fact. The pattern-check norm focuses on "did I make this mistake elsewhere?" — this slice surfaces a complementary axis: **when a new predicate fact lands, sweep the deferred-primitives backlog for content awaiting it**. Adding this to the slice-template checklist could be a future docs slice; for now, the lesson is captured in this entry plus the row's closure annotation.

Pre-commit short audit (content slice):

- **Names**: reuses the slice-206 `event.isOpportunityAttack` path verbatim; condition id and effect kind are existing vocabulary.
- **DRY**: the predicate shape `{ kind: 'eq', path: 'event.isOpportunityAttack', value: true }` matches Escape the Horde's wire (slice 206) byte-for-byte. Two users of the same primitive, factored at the schema layer.
- **SRP**: the boots condition now does two things (speed × 2 + OA disadvantage) but both arms are RAW from one item, atomic by design.
- **Magic numbers**: none added. The d20-count (2 vs 1) tested in the new file is the standard advantage/disadvantage shape.
- **at-threading**: N/A (content-only slice).
- **Mechanical outcomes asserted**: OA against active wearer → `used='disadvantage'`, d20.length=2; regular attack same wearer → `used='none'`, d20.length=1; OA against inactive baseline → `used='none'`, d20.length=1. Pins the predicate gates on both axes (boots-state and attack-shape).
- **Tests**: 3 new cases under boots-of-speed-oa-disadvantage.test.ts. The third (baseline-without-boots) ensures the entry is genuinely gated on the condition and isn't a global side effect.

Pack snapshot drift: 1 new entry on `boots-of-speed-active.effects[]`. Coverage matrix counts unchanged (the slice doesn't add a new effect kind).

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

*Slice detail for slices 48-268 has been moved out of the live CHANGELOG to per-cohort archives under [docs/changelog/](docs/changelog/) (single-Read fitness; slices 261-268 were archived in slice 277; slices 252-260 in slice 270; the alpha.6 release block of slices 241-250 in slice 252; older slices in slice 248). Each fits in a single Read tool call:*

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
