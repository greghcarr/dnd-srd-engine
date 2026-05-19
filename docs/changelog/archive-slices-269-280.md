# Changelog archive: slices 269-280 (alpha.7 release block)

These entries were originally in the `## 0.1.0-alpha.7 - 2026-05-19` section of [../../CHANGELOG.md](../../CHANGELOG.md). The slice-by-slice detail was moved here in slice 288 to keep the live CHANGELOG under the single-Read ceiling, following the same archive pattern as the [sibling archives](.) for older slices (slice-252 archived 241-250 to the alpha.6 release block; slice 270 archived 252-260; slice 277 archived 261-268).

This window covers the post-alpha.6 bug-fix cohort plus the docs/infra slices that surfaced from the slice 261-268 pattern-check chain:

- Slice 269: Boots of Speed Disadvantage-on-OA arm closed (stale gap row from slice 242)
- Slice 270: front-door docs split (first archive-rescue triggered by silent ceiling drift)
- Slice 271: Blurred attacker-sense bypass (slice-267 outstanding bug #3)
- Slice 272: Dodge benefits disabled by Incapacitated / Speed 0 (slice-267 outstanding bug #2)
- Slice 273: Invisible perception-bypass on both arms + missing disadvantage-on-attackers
- Slice 274: Gloves of Swimming Athletics sub-action gate
- Slice 275: Bracers of Archery +2 damage with longbow / shortbow
- Slice 276: Frightened breadth + LoS gate (first consumer-coordinated bug fix)
- Slice 277: archive slices 261-268 (second archive-rescue)
- Slice 278: Dodge LoS gate (consumer-supplied per-attacker)
- Slice 279: Cloak of the Bat dim-light Stealth gate
- Slice 280: pre-bump docs refresh (test counts, api-overview consumer-state pattern, tracking rows)

Order: most-recent first (slice 280 at top, slice 269 at bottom). For the alpha.7 release-block headline summary, see the live [CHANGELOG.md](../../CHANGELOG.md) (alpha.7 block, slices 269-280 inline → archived here). For slice 281 (release bump) and later, see the live CHANGELOG.

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

**Plumbing**: new `lightLevel?: 'bright' | 'dim' | 'darkness'` on [`ComputeAbilityCheckInput`](../../src/derive/ability-check.ts). `computeAbilityCheck` populates `bearer.lightLevel` fact alongside the existing slice 263/274/276 facts.

**Content wired**: Cloak of the Bat's SetAdvantage on Stealth gains `condition: any(eq path:'bearer.lightLevel' value:'dim', eq path:'bearer.lightLevel' value:'darkness')`. Description rewritten to cite the RAW spec.

**Pattern-check sweep**: searched the pack for sibling Stealth-on-light items — none. Cloak of Elvenkind uses a different shape (target's WIS perception to spot bearer has disadvantage, not bearer's own Stealth advantage). Cloak of the Bat is the unique user.

**Related deferred rows updated**: the Cloak of the Bat fly-speed and Polymorph-to-Bat arms (slice-227 deferred rows) have half (b) — the `bearer.lightLevel` fact — closed by this slice. Half (a) still needs the slice-242 Toggle UseAction wire (fly speed) and a Polymorph cross-reference primitive (Polymorph arm).

Audit: name matches slice 263/274 sibling fields in `ComputeAbilityCheckInput`. Derive-only; plan/commit split preserved. tsc clean; full vitest suite (1728 tests across 253 files, was 1722) green. 6 cases: dim/darkness → advantage; bright → no advantage; undefined → no advantage; non-Stealth skill in dim → no advantage; unattuned in dim → no advantage. Pack drift: `cloak-of-the-bat.effects[0]` gains a `condition` field.

**Engine+content: Dodge LoS gate (consumer-supplied per-attacker) (slice 278)**

Closes the slice-267 deferred row for Dodge's missing LoS gate. RAW (SRD 5.2.1 Dodge): "any attack roll made against you has Disadvantage if you can see the attacker." Slice 272 added the Incap/Speed-0 self-disable; this slice adds the per-attacker LoS gate on the attack-disadvantage arm only (RAW: the LoS clause applies to the attack benefit; the DEX-save advantage has no LoS clause).

Same consumer-coordinated pattern as slice 276 (Frightened), but per-**attacker** rather than per-**bearer**: the same dodging creature might see attacker A but not attacker B, so the fact lives on `AttackIntent` (per-call) rather than on a per-character state field.

**Plumbing**: new `targetCanSeeAttacker?: boolean` on [`AttackIntent`](../../src/engine/plan/attack.ts) and `ResolveAttackInput`, threaded into the `attackerFacts` map as `bearer.canSeeAttacker` (the bearer of `dodged` is the target of this attack). Default-apply: predicate is `not eq value:false`, undefined and true both fire the disadvantage.

**Content wired**: `dodged.effects[0]` (the `ImposeDisadvantageOnAttackers` entry) combines the slice-272 Incap/Speed-0 gate with the new LoS gate via `all`. The DEX-save advantage arm stays unchanged (RAW: no LoS clause). Description rewritten to cite both gates.

Audit: name parallels slice 276's `bearerCanSeeFearSource` but axis differs (per-attacker vs. per-bearer). Threading uses the slice-206 spread-on-defined idiom. Derive-only fact-population; plan/commit split preserved. tsc clean; full vitest suite (1722 tests across 252 files, was 1718) green. 4 cases in [tests/unit/engine/dodge-los-gate.test.ts](../../tests/unit/engine/dodge-los-gate.test.ts): undefined fires disadvantage; true fires; false bypasses; non-dodged target has no disadvantage. Default-apply preserved prior behavior (the 1718 pre-slice tests still pass without modification). Pack drift: `dodged.effects[0].condition.terms` gains a third (LoS) term.

**Docs+infra: archive slices 261-268 to restore single-Read ceiling (slice 277)**

Companion to slice 276. Slice 276's CHANGELOG entry pushed the live doc ~70 tokens over the single-Read ceiling. This slice archives the pattern-check chain (slices 261-268) to [docs/changelog/archive-slices-261-268.md](../../docs/changelog/archive-slices-261-268.md), mirroring slice 270's archive of 252-260. Live Unreleased now carries slices 269-276 (the bug-fix cohort that surfaced from the pattern-check chain).

CHANGELOG.md drops from ~63 KB → ~35 KB. Mechanical reorganization only; path-prefix sweep applied per the slice-252 convention. tsc clean; full vitest suite (1718 tests across 251 files) green. Both front-door docs verified to fit in a single Read post-archive.

**Engine+content: Frightened breadth + LoS gate (slice 276)**

Closes the dual-bug slice-264 deferred row. Both axes fixed simultaneously: breadth (now all 6 ability checks via the slice-266 check wildcard; was STR-only) + LoS gate (consumer-supplied, default-apply). RAW (SRD 5.2.1): "Disadvantage on ability checks and attack rolls while the source of fear is within line of sight."

First slice in this chain to ship the **engine half of a consumer-coordinated fix**: the engine exposes a `bearerCanSeeFearSource?: boolean` slot on `AttackIntent` + `ComputeAbilityCheckInput`, the consumer (UI, encounter manager, future VTT) supplies the value when it models line of sight, undefined preserves current behavior. The predicate is `not eq path:'bearer.canSeeFearSource' value:false` — default-apply semantics so consumers not yet wired don't regress. Future LoS-gated bugs (Dodge LoS gate, Cloak of the Bat dim-light family) will follow the same pattern.

**Plumbing**: new `bearerCanSeeFearSource?: boolean` on [`AttackIntent`](../../src/engine/plan/attack.ts), [`ResolveAttackInput`](../../src/engine/plan/attack.ts), and [`ComputeAbilityCheckInput`](../../src/derive/ability-check.ts). Threaded from `planAttack` through `resolveAttack` into `attackerSelfAdvantageFacts` (attack arm); populated directly in `computeAbilityCheck`'s facts map (check arm). Mirrors slice-263 / 274 consumer-supplied scene-state pattern.

**Content wired**: `frightened` condition's existing STR-only check entry replaced with the slice-266 wildcard; both arms gain `condition: { kind: 'not', term: { kind: 'eq', path: 'bearer.canSeeFearSource', value: false } }`.

**Pattern-check sweep**: Frightened is the unique RAW source-in-LoS-gated condition. Charmed gates on a specific source-relative target (different shape); Hex tracks without LoS. Per-source `frightened-by-X` variants don't ship today.

Audit: names match the `bearer.*` namespace and slice-263 / 274 sibling fields. Threading uses the slice-206 spread-on-defined idiom. Derive-only fact-population; plan/commit split preserved. tsc clean; full vitest suite (1718 tests across 251 files, was 1711) green. 7 cases in [tests/unit/engine/frightened-los-gate.test.ts](../../tests/unit/engine/frightened-los-gate.test.ts) — 4 ability-check + 3 attack-roll. Default-apply preserves prior behavior (the 1711 pre-slice tests still pass without modification). Pack drift: `frightened.effects[0]` + `effects[1]` each gain a `condition` field; the check arm switches from per-ability (STR) to wildcard.

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
- **Tests**: 5 cases in new [tests/unit/engine/bracers-of-archery.test.ts](../../tests/unit/engine/bracers-of-archery.test.ts). Coverage snapshot: `bracers-of-archery` joins `wiredIds` (was unwired).

Pack snapshot drift: `bracers-of-archery.effects` goes from `[]` to a single AddModifier entry. Coverage matrix: 1 new entry in `wiredIds`.

**Engine+content: Gloves of Swimming and Climbing sub-action gate (slice 274)**

Closes the deferred row from slice 263's pattern-check sweep. RAW: "Advantage on any Strength (Athletics) check you make to climb or swim." Pre-274 the wire was broader (advantage on every Athletics check). Mirror of slice 263's `sense?` field pattern on a different axis (skill sub-action vs. environmental sense).

**Plumbing**:

- New `athleticsSubAction?: 'climb' | 'swim' | 'jump' | 'grapple' | 'shove'` field on [`ComputeAbilityCheckInput`](../../src/derive/ability-check.ts). The five-value enum covers 2024 PHB-named Athletics applications. Populated by the consumer who knows the narrative context; defaults to undefined.
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
- **Tests**: 6 cases in new [tests/unit/derive/gloves-of-swimming-and-climbing.test.ts](../../tests/unit/derive/gloves-of-swimming-and-climbing.test.ts).

Pack snapshot drift: `gloves-of-swimming-and-climbing.effects[2]` gains a `condition` field. Coverage matrix counts unchanged.

**Engine+content: Invisible condition perception-bypass on both arms (slice 273)**

Closes the gap tracked in slice 271's pattern-check secondary finding. The `invisible` condition had a known two-bug shape:

1. The bearer-side `SetAdvantage on:'attack' mode:'advantage'` (bearer's own attacks) applied unconditionally; RAW: "If a creature can somehow see you, you don't gain this benefit against that creature."
2. The disadvantage-on-attackers arm was missing entirely; RAW: "Attack rolls against you have Disadvantage."

This slice ships both. The shape is symmetric to slice 271's Blur bypass but uses a different bypass clause (Blinded creatures do NOT bypass invisibility — they can't see anything to begin with — so they're excluded from this fact).

**Plumbing**:

- New `attacker.canLocateInvisible` + `target.canLocateInvisible` boolean facts populated in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts). True when the counter-party has blindsight, tremorsense, or truesight. Computed via a shared helper closure (`canLocateInvisible(effectStack)`) applied to both attacker and target.
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
- **Tests**: 5 cases in new [tests/unit/engine/invisible-perception-bypass.test.ts](../../tests/unit/engine/invisible-perception-bypass.test.ts).

Pack snapshot drift: `invisible.effects[0]` gains a `condition` field; new `effects[1]` is the ImposeDisadvantageOnAttackers entry. Coverage matrix counts unchanged.

**Engine+content: Dodge benefits disabled by Incapacitated / Speed 0 (slice 272)**

Closes the second of the slice-267 outstanding bugs. RAW (2024 PHB Dodge action): "You lose these benefits if you have the Incapacitated condition or if your Speed is 0." Pre-272 the `dodged` condition imposed both benefits (disadvantage on attackers + advantage on DEX saves) unconditionally. The gaps row sketched two paths; this slice ships path (a) — per-effect `condition` predicate — because it reuses the slice-103 + slice-258 plumbing already in place without new schema surface. Path (b) (a condition-level `disabledWhile?` field) is deferred unless a second canonical user emerges.

**Plumbing**:

- New `bearer.hasIncapacitated` and `bearer.speedZero` boolean facts populated at the two consumer sites: [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) (for the `ImposeDisadvantageOnAttackers` arm) and [src/derive/save.ts](../../src/derive/save.ts) (for the `SetAdvantage on:save.DEX` arm). The existing `findActorBlockingCondition` helper (slice 199) covers Incapacitated + the four conditions that RAW-include Incapacitated (Stunned, Paralyzed, Petrified, Unconscious) plus HP <= 0; `getEffectiveSpeed` (slice 77) computes the bearer's effective walking speed across the full effect stack.
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
- **Tests**: 3 cases in new [tests/unit/engine/dodge-self-disable.test.ts](../../tests/unit/engine/dodge-self-disable.test.ts).

Pack snapshot drift: `dodged.effects[0]` and `effects[1]` each gain a `condition` field. Coverage matrix counts unchanged.

**Engine+content: Blurred attacker-sense bypass closes the slice-267 outstanding bug (slice 271)**

Closes the third of the slice-267 outstanding bugs: the `blurred-active` condition imposed disadvantage on attackers unconditionally, but Blur RAW says "An attacker is immune to this effect if it doesn't rely on sight, as with Blindsight, or can see through illusions, as with Truesight." The bypass shape is mirror of slice 127's Mirror Image vision-gate (already shipped for that one spell's dedicated deflection branch).

**Plumbing**:

- New `attacker.bypassesSightIllusion` boolean fact populated in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)'s `attackerFacts` map. True when the attacker has blindsight, tremorsense, or truesight, OR carries the Blinded condition. Mirrors the slice-127 Mirror Image bypass logic verbatim. Darkvision is sight-based and intentionally excluded.

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

Tracked as a new deferred row in [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md). Closing (b) for Invisible is a one-line content edit (parallel to this slice); closing (a) needs a target-side perception fact symmetric to this slice's attacker-side fact (the engine doesn't track per-target see-invisibility today).

Pre-commit Uncle Bob audit:

- **Names**: `attacker.bypassesSightIllusion` is intention-revealing about both the bypass condition and the use case (sight-illusion effects, not all sight-related). The path namespace (`attacker.*`) matches the existing `attacker` family (`attackerCreatureType` already in the same map).
- **DRY**: bypass logic mirrors slice 127 byte-for-byte (`hasSense('blindsight') || hasSense('tremorsense') || hasSense('truesight') || appliedConditions.includes('blinded')`). Extracted as a local boolean named `attackerBypassesSightIllusion` for readability; not factored to a shared helper because slice 127's Mirror Image branch reads its own logic inline (the inline form lets each call site document its bypass clauses against its own RAW source).
- **SRP**: the fact-population sits next to the existing `attackerCreatureType` and `event.isOpportunityAttack` facts (one map, one purpose: predicate gates for `ImposeDisadvantageOnAttackers`). The condition entry gates via the existing slice-103 predicate plumbing; no engine API change.
- **Magic numbers**: none added. The four sense / condition checks are RAW vocabulary.
- **at-threading**: N/A (no events emitted by the new code path).
- **Plan/commit split preserved**: derive-only fact-population; no RNG, no event emission.
- **Pattern-check applied**: 8 wires audited, 1 closed (Blur), 0 false-positives (RAW-correct universal wires kept as-is), 1 new tracking row (Invisible — different shape).
- **Mechanical outcomes asserted**: tsc clean; full vitest suite (1692 tests across 246 files, was 1689) green. 3 new integration cases: baseline sight-only attacker rolls with disadvantage (2 d20); truesight attacker bypasses (1 d20, used='none'); no-condition baseline doesn't impose disadvantage (1 d20). The Blinded-attacker case is observationally muddied by Blinded's own attacker-side disadvantage (slice 97) and isn't pinned at the integration level; the slice-127 Mirror Image tests pin the same Blinded-bypass code path in a different scenario.
- **Tests**: 3 cases in new [tests/unit/engine/blur-attacker-sense-bypass.test.ts](../../tests/unit/engine/blur-attacker-sense-bypass.test.ts).

Pack snapshot drift: 1 entry on `blurred-active.effects[0]` gains a `condition` field. Coverage matrix counts unchanged.

**Docs+infra: front-door docs split back under single-Read ceiling (slice 270)**

Two same-shape splits to restore single-Read fitness on the two front-door docs that drifted over the ceiling during the recent slice cluster:

1. **CHANGELOG.md**: slices 252-260 archived to [docs/changelog/archive-slices-252-260.md](../../docs/changelog/archive-slices-252-260.md) (mirrors the slice 248 / slice 252 archive convention). Slices 261-269 stay live as the recent pattern-check chain + bug-fix slice.
2. **docs/starter-pack-gaps.md**: the shipped engine-slice rows (~30 rows, all `~~struck through~~` ✓ shipped) split out to [docs/gaps-engine-slices-shipped.md](../../docs/gaps-engine-slices-shipped.md). The "Future engine slices" table in the live gaps doc now lists only the unshipped rows plus a pointer to the shipped archive.

Surface symptom: pre-split, both files errored out on the Read tool with "exceeds maximum allowed tokens." A fresh agent landing on the repo couldn't open either front-door doc in one call, breaking the slice-template discovery path. Both are now back under the ceiling and read in one call.

What changed:

- **CHANGELOG.md**: 65 KB → ~36 KB. Live Unreleased section keeps slices 261-269 (9 slices); archived range 252-260 (9 slices) follows the slice-252 archive format including the `../../` path prefix sweep on root-relative links.
- **New file [docs/changelog/archive-slices-252-260.md](../../docs/changelog/archive-slices-252-260.md)** (~35 KB): header + slice-by-slice entries copied verbatim with the path-prefix sweep applied. Order: most-recent first.
- **CHANGELOG archive pointer block**: gains the new archive's row at the top of the index; description prose updated to reflect "slices 48-260" coverage and slice 270 as the most recent archive operation.
- **docs/starter-pack-gaps.md**: 64 KB → ~33 KB. The "Future engine slices" table now contains only unshipped rows; a pointer line and a sentence of context route readers to the shipped-engine-slices archive when they want the historical view.
- **New file [docs/gaps-engine-slices-shipped.md](../../docs/gaps-engine-slices-shipped.md)** (~32 KB): carries the shipped rows verbatim (relative links unchanged because the new file is a sibling under `docs/`, same depth as the original).

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

- **[src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)** boots-of-speed-active condition: added the `ImposeDisadvantageOnAttackers` entry; rewrote the description to drop the stale "needs an `event.isOpportunityAttack` predicate fact" caveat (slice 206 landed it).
- **[tests/unit/engine/boots-of-speed-oa-disadvantage.test.ts](../../tests/unit/engine/boots-of-speed-oa-disadvantage.test.ts)** (new, 3 cases): an OA against the boots-active wearer rolls with disadvantage (2 d20); a regular attack does not (1 d20, used='none'); an OA against a baseline target without the condition does not (1 d20).
- **[docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md)**: struck the deferred row; closure annotation cites the meta-finding below.

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

