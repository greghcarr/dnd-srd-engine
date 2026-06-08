# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

Per-slice detail lives in [docs/changelog/slice-NNN.md](docs/changelog/) — the live file below carries only a compact pointer per slice (one headline + one-sentence summary) so the file stays bounded regardless of project age. Convention adopted in slice 628.

## Unreleased

**Engine (slice 739): Druid Elemental Fury (L7) + Cleric Potent Spellcasting closure**
The Druid L7 row gains `elemental-fury`: an `OfferChoice` between Potent Spellcasting (add WIS to Druid cantrip damage) and Primal Strike (once per turn, a weapon/Wild Shape hit deals +1d8 of a chosen element — offered as four element variants). No new effect kind: Potent Spellcasting is an `AddModifier { target: 'damage', value: WIS }` gated on a new `event.spellLevel == 0` (cantrip) fact added to the cast-spell damage-modifier facts (attack + save paths); Primal Strike reuses the Divine Strike `OnEvent` rider shape. The same `event.spellLevel` fact closes the previously-stubbed Cleric Blessed Strikes Potent Spellcasting arm (pattern-check). Additive (the new fact is inert for existing predicates), so existing casts are byte-identical.
Detail: [slice-739.md](docs/changelog/slice-739.md).

**Engine (slice 738): Rogue Reliable Talent (L7)**
New marker effect `GrantReliableTalent`: on an ability check that uses one of the rogue's skill (or tool) proficiencies, `planAbilityCheck` now treats a d20 of 9 or lower as a 10. Gated on a real proficiency contributing (proficient / expertise — the half-proficiency floor doesn't count, per RAW); surfaced via the check derivation's `hasReliableTalent` + `usesProficiency`. The d20 array still shows the actual die; the floor lands in `total` + a `reliable-talent` breakdown marker. Opens the L7 SRD-complete cycle. EFFECT_KINDS 67→68.
Detail: [slice-738.md](docs/changelog/slice-738.md).

**Fuzz harness (slice 737): build every class to any level 1-20**
`FUZZ_MAX_LEVEL` 6 → 20, and the fuzz auto-leveler now fails loud: `drainPendingChoices` resolves each choice via a deterministic legal-option-set picker (first-N first — byte-identical at the shipped levels — then a bounded combination fallback) and throws if none is legal; `levelUpTo` throws if the character doesn't reach the target level or leaves a dangling choice; `runBattle` no longer swallows a level-up failure (and skips statblock monsters). So `runBattle({ level })` reliably builds every `CLASS_POOLS` class and its opponent to any level 1-20 (correct HP / proficiency / spell slots) for the dnd-web 1-20 picker, instead of silently leaving a character at L1. New `tests/integration/combat-fuzz-level-range.test.ts` sweeps every class L2-20 (player + opponent) + an L20 combat-validity spot-check. L1-6 builds are byte-identical (goldens + fuzz matrix unchanged). NOTE: pack feature rows above ~L6 are still sparse, so high-level fuzz characters are correctly-leveled but under-featured until that content lands.
Detail: [slice-737.md](docs/changelog/slice-737.md).

## 0.9.0-alpha.0 - 2026-06-07

**Release (slice 736): bump to 0.9.0-alpha.0**

Promotes the post-0.8.0 cohort (slices 727-735) to a tagged release. `package.json` + `package-lock.json` bump `0.8.0-alpha.0` → `0.9.0-alpha.0`; `SCHEMA_VERSION` stays 1 (the cohort adds no new event types — every new mechanic reuses existing events / conditions, so a 0.9.0 consumer replays a 0.8.0 log unchanged). One headline cohort:

- **L6 SRD complete** (slices 727-735): every L6 row (base class + subclass) is now wired. Base classes — Fighter Ability Score Improvement (727), plus the already-present Rogue 2nd Expertise / Monk Empowered Strikes / Paladin Aura of Protection / rage·Channel-Divinity·Wild-Shape bumps / Ranger Roving. Subclasses — Barbarian Berserker Mindless Rage (728), Druid Land Natural Recovery (729), Warlock Fiend Dark One's Own Luck (730), Cleric Life Blessed Healer (731), Wizard Evoker Sculpt Spells (732), Bard Lore Magical Discoveries (733). The CI-guarded "L6 SRD complete" floor audit is 28/28 and the fuzz matrix now covers L1-L6 (72 cells × 30 seeds = 2,160 battles per run, slice 734). Slice 735 corrected a pre-existing edition drift: Monk Empowered Strikes now models the SRD 5.2.1 Force-damage choice instead of the 2014 "magical unarmed."

**Breaking:** none to the type surface. **Behavior change:** Monk L6 Empowered Strikes (slice 735) — a monk's unarmed strikes are no longer magical by default; instead the monk may opt a strike into Force damage. This is a RAW-correctness fix (2014 → SRD 5.2.1); the s207 golden was rewritten accordingly. **Additive surface:** three new effect kinds (`GrantBlessedHealer`, `GrantSculptSpells`, `GrantUnarmedForceOption`), a new condition (`mindless-rage-active`), new `engine.plan.*` methods (`naturalRecovery`, `darkOnesOwnLuck`), new optional intent fields (`CastSpellIntent.sculptedTargetIds`; `unarmedStrikeAsForce` on the attack / Flurry / off-hand intents), and the College of Lore L6 cross-list spell choice — all additive and opt-in.

**RNG stream:** the L6 features are gated (fire only at L6+ / on the relevant opt-in arm), and the Empowered Strikes Force option is opt-in, so default and sub-L6 paths are byte-identical (replay-equivalence + rng-capture unchanged). Goldens unchanged except the deliberately-rewritten s207. The L6 fuzz tier is new this cycle, so no prior per-seed transcript is pinned across the boundary.
Detail: [slice-736.md](docs/changelog/slice-736.md).

**Engine (slice 735): Monk Empowered Strikes re-wired to SRD 5.2.1 (L6)**
New marker effect `GrantUnarmedForceOption`: the Monk L6 feature now models the SRD 5.2.1 Force-damage choice ("Whenever you deal damage with your Unarmed Strike, it can deal your choice of Force damage or its normal damage type") instead of the 2014 "magical unarmed" (`GrantUnarmedAsMagical`). Opt-in `unarmedStrikeAsForce` on the attack / Flurry / off-hand intents overrides an unarmed strike's damage type to Force when the bearer has the marker; inert by default. The s207 golden now shows Force sidestepping Stoneskin's B/P/S resistance. `GrantUnarmedAsMagical` stays an available primitive (no pack user). EFFECT_KINDS 66→67. Closes the slice-734 L6 drift follow-up.
Detail: [slice-735.md](docs/changelog/slice-735.md).

**Tests/docs (slice 734): L6 SRD-complete floor audit + fuzz-to-L6**
New `tests/audit/srd-l6-complete.test.ts` (28 tests) pins the L6 floor: base-class L6 features (Fighter ASI, Rogue 2nd Expertise, Monk Empowered Strikes, Paladin Aura of Protection, more rage/Channel-Divinity/Wild-Shape uses, Ranger Roving), the eight subclass L6 features (slices 728-733 + 204/357), planner/effect-kind presence, a behavioral 5→6 level-up, and the spell-slot floor. The fuzz matrix extends to L6 (`[1..6]`, 72 cells × 30 seeds = 2,160 battles); `FUZZ_MAX_LEVEL` 5→6. Capstone of the L6 cycle — every L6 row is now wired. ~~**Known drift (tracked):** Monk Empowered Strikes carries 2014 "magical unarmed" semantics (`GrantUnarmedAsMagical`); the SRD 5.2.1 Force-damage-type choice is the one open L6 correctness follow-up.~~ **Closed by slice 735.** No engine change.
Detail: [slice-734.md](docs/changelog/slice-734.md).

**Content (slice 733): Bard College of Lore Magical Discoveries (L6)**
The previously-absent College of Lore L6 row gains `magical-discoveries`: an `OfferChoice` (oneOf 2, onAcquire) whose 18 curated options each grant a Cleric/Druid/Wizard spell (cantrip–level 3) `always-prepared` — the cross-list learn shape from Pact of the Tome (slice 517). Granted spells are treated as known by the cast path, so a chosen Wizard spell (e.g. Fireball) casts as a Bard spell with the bard's CHA + slots. No new engine primitive; the replace-on-level-up arm stays consumer-driven.
Detail: [slice-733.md](docs/changelog/slice-733.md).

**Engine (slice 732): Wizard Evoker Sculpt Spells (L6)**
New flag effect `GrantSculptSpells`: when an Evoker casts an Evocation save spell, `intent.sculptedTargetIds` names up to 1 + slot level creatures to exclude — each auto-succeeds and takes no damage (modeled as full exclusion: no save, no damage, no forced movement). Validated (feature/school/count/membership) and opt-in, so unsculpted casts are byte-identical. EFFECT_KINDS 65→66.
Detail: [slice-732.md](docs/changelog/slice-732.md).

**Engine (slice 731): Cleric Blessed Healer (Life Domain L6)**
New flag effect `GrantBlessedHealer` (the `GrantMaxHealingDice` pattern): the cast-spell heal handler now self-heals the cleric 2 + slot level once when a slot heal lands on a creature other than the caster (cantrips/free casts excluded). EFFECT_KINDS 64→65.
Detail: [slice-731.md](docs/changelog/slice-731.md).

**Engine (slice 730): Warlock Dark One's Own Luck (Fiend Patron L6)**
New `engine.plan.darkOnesOwnLuck(state, { warlockId })` → `{ events, d10 }`: spend a use (the `dark-ones-own-luck` resource, max CHA-mod, long-rest recharge) and roll a d10 the consumer folds into an ability check or saving throw (Hero Points shape; engine doesn't mutate the linked roll). No new event/condition.
Detail: [slice-730.md](docs/changelog/slice-730.md).

**Engine (slice 729): Druid Natural Recovery slot recovery (Circle of the Land L6)**
New `engine.plan.naturalRecovery(state, { druidId, slots })`: recover expended spell slots on a short rest, combined level ≤ ceil(druid/2), no L6+, once per long rest (gated by the `natural-recovery` resource; reuses the slice-721 `SpellSlotsRegained` event). The free-Circle-spell-cast arm is deferred to the land-specific Circle Spells wiring.
Detail: [slice-729.md](docs/changelog/slice-729.md).

**Engine (slice 728): Barbarian Mindless Rage (Berserker L6)**
`planRage` now applies a new `mindless-rage-active` condition (Charmed/Frightened immunity) alongside `raging` for a Berserker at L6+, and ends existing Charmed/Frightened on entering Rage. Reuses the `GrantConditionImmunity` + `isImmuneToCondition` gate; gated on subclass + level; non-Berserker / sub-L6 rage byte-identical. Conditions count 157→158.
Detail: [slice-728.md](docs/changelog/slice-728.md).

**Content (slice 727): Fighter L6 Ability Score Improvement**
The Fighter's L6 row (previously empty) gains `ability-score-improvement-6` — the same OfferChoice as L4 (ASI feat or another general feat), reusing the level-up cascade. SRD gives the Fighter extra ASIs at 6/14 beyond the every-class 4/8/12/16. Opens the L6 SRD-complete cycle. Content-only.
Detail: [slice-727.md](docs/changelog/slice-727.md).

## 0.6.0-alpha.0 - 2026-06-05

**Release (slice 701): bump to 0.6.0-alpha.0**

Promotes the post-0.5.0 cohort (slices 697-700) to a tagged release. `package.json` bumps `0.5.0-alpha.0` → `0.6.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1 (no persisted-shape changes). Net effect over 0.5.0: positioned Push now lands on a legal cell (an engine correctness fix), tactical arenas are richer (irregular rock borders, `difficult` + `water` terrain, occasional fenced pens), and the `normalizeEvents` determinism oracle handles compound ids — while the tactical movement policy itself is unchanged from 0.5.0 (the slice-697 convergence push was reverted in slice 699, so battles still accept draws).

**Breaking:** none. No engine `src/` public surface changed; `pushDestination` is an internal derive helper (not in the public barrel). `docs/breaking-changes-queued.md` was empty at cut time.

**RNG stream:** `'none'` (positionless) battles are byte-identical (fuzz-matrix + replay-equivalence pass unchanged). Tactical per-seed transcripts differ from 0.5.0 (the Push fix changes positioned shove destinations; the arena generator changed), but tactical mode is new this release cycle and behind the `movement: 'tactical'` option, so no consumer pins a tactical transcript across the boundary.

**Feat (slice 700): richer tactical arenas (irregular rock border, terrain types, fenced pens)**
Rewrites `generateArenaMap`: an irregular per-seed rock border (smooth edge random walks, so the playable shape varies by seed), fewer hard obstacles (impassable cover 0.18 → 0.07) plus passable `difficult` + `water` terrain, and an occasional fenced pen (an impassable ring with a guaranteed non-corner side gate, so it always has a real entrance) on the larger map. Dims enlarged a little (duel 18×13, squad 22×16). Connectivity stays structural via a protected spawn-to-spawn corridor (no border/fence/pillar can disconnect A↔B); deterministic; `'none'` unaffected (tactical-only). Verified over seeds 1-100: 0 connectivity failures, fences ~15% of seeds, every pen interior reachable from a spawn, draw rate unchanged (3.8%), 0 illegal moves. CHANGELOG note: this slice also evicted the 0.4.0-alpha.0 release narrative to [released-versions-0.4.0-alpha.0.md](docs/changelog/released-versions-0.4.0-alpha.0.md) (doc-size discipline).
Detail: [slice-700.md](docs/changelog/slice-700.md).

**Revert (slice 699): restore the slice-695 kiting tactical policy (accept draws again)**
Undoes the slice-697 convergence push: `planTacticalMove` goes back to the slice-695 flee/kite/close cascade, so tactical battles stalemate to draws again (≈4% over seeds 1-40 × {1v1,2v2}; seed 42 1v1 draws at the round cap), as at the 0.5.0 release — per request, forcing convergence wasn't wanted. **Kept** as orthogonal correctness improvements: slice 698 (Push lands on a legal cell) and the slice-697 `normalizeEvents` compound-ulid oracle fix. `policy.ts` / `constants.ts` / `move-policy.ts` + their unit tests restored to slice-695; the slice-697 convergence assertion removed (the slice-698 move-legality guard stays). `'none'` byte-identical; no API change.
Detail: [slice-699.md](docs/changelog/slice-699.md).

**Fix (slice 698): Push forced-movement lands on a legal cell, not an off-grid vector**
The weapon-mastery Push (and, by pattern-check, Open Hand Push) computed the shove destination by adding a *cell count* to a *feet* coordinate with no map validation, so a target could be shoved off-grid onto cover or off the map (seeds 19, 29 at 2v2). Slice 697's convergence surfaced it (melee Push hits now land). New pure `pushDestination` helper (`src/derive/pathing.ts`) steps the shove cell-by-cell and stops against the first out-of-bounds / impassable / occupied / closed-door cell, returning a grid-aligned position; both Push planners now use it. Verified: 0 illegal `CombatantMoved`/final positions across seeds 1-40 × {1v1,2v2} (matrix assertion added). Corrects positioned Push for every consumer, not just the fuzz. `'none'` byte-identical (positionless → Push emits no move); no API change.
Detail: [slice-698.md](docs/changelog/slice-698.md).

**Fix (slice 697): tactical movement converges instead of stalemating** — **Reverted by slice 699.**
The round-leashed `planTacticalMove` convergence model is no longer in the tree (the user opted to accept draws). Its `normalizeEvents` compound-ulid oracle fix was kept. Original detail (for the record): [slice-697.md](docs/changelog/slice-697.md).

**Release (slice 696): bump to 0.5.0-alpha.0**
Promotes the post-0.4.0 cohort (slices 689-695) to a tagged release: cross-repo sibling-consumer infra (689-692) + tactical movement support for the combat fuzz (693-695). No engine-API breaking change; `'none'` byte-identical; `SCHEMA_VERSION` stays 1.
Detail: [slice-696.md](docs/changelog/slice-696.md).

## 0.3.0-alpha.0 - 2026-06-05

**Release (slice 687): bump to 0.3.0-alpha.0**

Promotes the strict-RAW completeness cohort (slices 633-682, 50 slices) to a tagged release. The minor pre-1.0 bump (per [VERSIONING.md](VERSIONING.md)'s escape hatch) marks this cycle's chapter status — **the engine is strict-RAW-complete for L1, L2, and L3**: every documented "engine *could* enforce" arm is closed; engine-scope-excluded arms (positions, plane, scene) stay consumer-managed by design. `package.json` bumps `0.2.0-alpha.0` → `0.3.0-alpha.0`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: no breaking persisted-shape changes in this cycle.

This release intentionally excludes the spatial combat support cycle (slices 683-685) and the in-repo web demo retirement (slice 686). Those land in 0.4.0-alpha.0 immediately above.

### Highlights

- **Strict-RAW completeness for L1+L2+L3 (slices 677-682).** The slice-660 deferral catalog ("engine *could* enforce but doesn't") is now closed. New marker-effect primitives `HalvesStrengthWeaponDamage` (slice 678; enfeebled now actually halves STR-based weapon damage), `GrantDeathSaveAdvantage` (slice 679; closes Beacon of Hope's death-save arm), and Slow's full enforcement triplet — no-reactions + action-OR-bonus (slice 680), max-one-attack cap (slice 681), and the V/S spellcasting d20 fizzle gate (slice 682). `recurring-save` metadata (slice 677) handles end-of-turn save-to-end arms for Shining Smite, Ray of Enfeeblement, and Slow uniformly. `EFFECT_KINDS` grew from 61 entries to 64 (63 primitives + Custom).
- **L2 + L3 RAW-completeness closures (slices 633-664).** The L2 punch-list audit (slice 633) gated five planners: Tactical Mind (Fighter L2, slice 634), Divine Spark (Cleric L2, slice 635), Uncanny Metabolism (Monk L2, slice 636), Magical Cunning (Warlock L2, slice 637), and the eldritch-invocation catalog fix (slice 638). L3 floor audit (slice 645) closed L3 planners Steady Aim (Rogue L3, slice 646), Fast Hands (Thief L3, slice 647), and Deflect Attacks (Monk L3 reduction arm slice 648, counter arm slice 658, damage-pipeline auto-integration slice 664). Long-rest OfferChoice replay (slice 660; closes Circle of the Land land swap) plus its supersession primitive (slice 661). New `GrantAbilitySubstitution` effect (slice 662) and always-enforce mode (slice 663) generalize Primal Knowledge (slice 659) into a reusable shape.
- **Spell-mechanics fills (slices 665-672).** Non-damage zone primitive lands Zone of Truth, Tiny Hut, Wind Wall (slice 665). On-hit rider via castSpell wires Shining Smite + Ray of Enfeeblement (slice 666). Phantasmal Force via existing recurring rider (slice 667). Levitate (slice 668). Dragon's Breath as on-action rider (slice 669). Slow as composite area condition (slice 670). Beacon of Hope composite buff (slice 671). Blink's per-turn ethereal toggle (slice 672) — L3 spell wiring 100% wired-or-narrative.
- **Schema + ergonomics (slices 654, 657, 675).** Subclass-selection cascade (slice 654; OfferChoice fires on subclass-grant level, slot pre-allocated by slice 31 spellcasting). New `partialShortFullLong` recharge primitive (slice 657; Channel Divinity, Lay on Hands, etc.). `seedResourcesFromContent` helper (slice 675; closes the slice-660 documented deferral around per-rest recharge ergonomics).
- **Audit + fuzz expansion (slices 633, 639-645, 649-651, 653, 655-656, 673-676).** L2 + L3 RAW floor audits, fuzz matrix extended to L3 (slice 651, widened to 30 seeds/cell post-cycle in slice 674), L1+L2 multiclass build audit (slice 656), L1+L1+L1 triple multiclass audit (slice 673; all 220 distinct triples), and the multiclass-fuzz floor (slice 676; 50 random L1+L1 builds). Pack-integrity allowlist sync (slice 676) for 8 marker conditions added in the cycle.

### Breaking changes

None. The cycle is fully additive: new effect primitives, new optional fields on existing events, new planners, new conditions, new content. No removed or renamed public exports; no shipped event shape contracted; no schema migration required.

### RNG-stream changes (per-seed reproducibility shifts)

Per [docs/determinism.md](docs/determinism.md), per-seed RNG reproducibility is version-sensitive. The following slice in this cycle changed RNG consumption patterns:

- Slice 682: Slow's V/S spellcasting fizzle gate rolls an extra d20 before the spell resolves whenever a slowed caster casts a V or S spell. A transcript from `combat-fuzz --seed N` generated on `0.2.0-alpha.0` will NOT byte-match the same command on `0.3.0-alpha.0` if any cast in the transcript went through this code path. Consumers depending on cross-version per-seed reproducibility should snapshot the resulting `CampaignState` alongside the seed.

### Cycle inventory

Per-slice detail for slices 633-687 lives in `docs/changelog/slice-NNN.md` files (the slice-628 convention). The pointer list below indexes the cycle.

**Engine (slice 682): Slow's spellcasting V/S d20 fizzle gate**
**Sixth and final slice of the strict-RAW completeness cycle (677-682).** New `SpellCastFizzledEvent` (no-op reducer, transcript-only marker). `planCastSpell` rolls a d20 before SpellCastDeclared when the caster has `slowed-by-spell-active` AND the spell has V or S components; on ≤ 10 emits SpellCastDeclared + SpellCastFizzled + ActionEconomyConsumed and returns early (slot preserved per RAW). 3 new tests. Snapshot regen for `enfeebled` (now wired via slice 678's HalvesStrengthWeaponDamage). **Engine is now strict-RAW-complete for L1, L2, L3** — every documented "engine *could* enforce" arm is closed; engine-scope-excluded arms (positions, plane, scene) stay consumer-managed by design.
Detail: [slice-682.md](docs/changelog/slice-682.md).

**Engine (slice 681): Slow's max-one-attack cap**
Reducer-side gate in `applyActionEconomyConsumed` `case 'attack'`: slowed combatant whose `attacksMadeThisTurn >= 1` throws. Reuses slice 680's `isSlowedBySpell` helper. Extra Attack and other multi-attack features are capped at 1 for the duration. 2 new tests; non-slowed baseline preserved.
Detail: [slice-681.md](docs/changelog/slice-681.md).

**Engine (slice 680): Slow's no-reactions + action-OR-bonus restrictions**
Reducer-side gate in `applyActionEconomyConsumed`: checks the combatant for `slowed-by-spell-active` and enforces (a) reactions blocked, (b) action-OR-bonus mutual exclusion. Hardcoded condition id (single RAW user). Single-file change; 5 new tests; non-slowed baseline unchanged.
Detail: [slice-680.md](docs/changelog/slice-680.md).

**Engine + content (slice 679): `GrantDeathSaveAdvantage` (Beacon of Hope arm)**
Closes the Beacon of Hope death-save advantage arm (pre-679 consumer-managed). New marker effect (63 primitives total); EffectAccumulator gains mark/has methods; `planDeathSaveAtTurnStart` consults the bearer's effect stack and rolls 2d20 (max) when set. Halfling Luck reroll-on-nat-1 composes on top. `beacon-of-hope-active` projects the marker. 3 new tests.
Detail: [slice-679.md](docs/changelog/slice-679.md).

**Engine + content (slice 678): `HalvesStrengthWeaponDamage` primitive (enfeebled enforcement)**
New marker effect (62 primitives total). `EffectAccumulator` gains `mark`/`has` methods; `planAttack` halves the base weapon damage when the attacker carries the flag AND `damageAbility === 'STR'`. Riders (smite/sneak/on-hit dice) pass through unhalved per the RAW "weapon's damage line" reading. `enfeebled` condition projects the marker. 3 new tests including same-seed greatsword (halved) and rapier (unaffected, finesse → DEX) comparisons.
Detail: [slice-678.md](docs/changelog/slice-678.md).

**Content (slice 677): recurring-save spell-ends arms (Shining Smite, Ray of Enfeeblement, Slow)**
**First slice of the strict-RAW completeness cycle (677-682).** Zero engine code. Three conditions gain `recurringSave` metadata so `planTickRecurringSave` handles their end-of-turn save-to-end arms uniformly with Hold Person's pre-existing wiring: `shining-smite-target-illuminated` + `enfeebled` use `{CON, turnEnd, removeCondition}`; `slowed-by-spell-active` uses `{WIS, turnEnd, removeCondition}`. DC resolved from caster's spell DC via the AppliedCondition's `sourceCharacterId`. Phantasmal Force NOT included (RAW arm is an Investigation check, not a save). 6 new tests.
Detail: [slice-677.md](docs/changelog/slice-677.md).

**Tests (slice 676): multiclass fuzz audit + pack-integrity allowlist sync**
**Sixteenth and final slice of the post-L3-RAW completeness push.** Closes the slice-644 deferred "multiclass fuzz support" follow-up. New `tests/audit/multiclass-fuzz.test.ts`: 50 seeds of random L1+L1 distinct-class characters; each builds + derives with `ac.total > 0` without throwing. Pack-integrity `EFFECT_LESS_OK` allowlist extended with 8 marker conditions added in slices 667/669/672 (phantasmal-force-active, 5 dragons-breath variants, blink-active, blink-ethereal-active) with documented rationale. **The 16-slice cycle is closed: L1+L2+L3 spell wiring 100% wired-or-narrative, all slice-660 RAW gaps closed, multiclass + fuzz + recharge ergonomics covered. Ready to tag.**
Detail: [slice-676.md](docs/changelog/slice-676.md).

**Engine (slice 675): `seedResourcesFromContent` helper**
Closes the slice-660 documented deferral. New helper `seedResourcesFromContent(character, content): Character` walks the character's effect stack for `GrantResource` effects and auto-populates `character.resources` with proper `max` (formula-evaluated) and `recharge` (incl. slice-657's `partialShortFullLong` primitive). Highest-`max` wins per resourceId; idempotent for pre-existing entries; pure transform. Opt-in helper alongside createPC (signature stable). 5 new tests. Resolves the manual "consumer must hand-author Channel Divinity's `partialShortFullLong` recharge" drift trap.
Detail: [slice-675.md](docs/changelog/slice-675.md).

**Tests (slice 674): L3 fuzz floor (widen seed coverage post-L3-cycle)**
Slice 651 added L3 to the fuzz matrix (LEVELS = [1,2,3]); slice 674 widens SEEDS_PER_CELL 20 → 30 post the 8 spell-wiring slices (665-672) + L3 RAW closures (661-664) that grew the L3 event surface. 36 cells × 30 seeds = 1,080 battles per CI run; ~13s wall-clock. Header history updated; describe title widened from "slice 644: (L1+L2)" to "slice 644 / 651 / 674: (L1+L2+L3)".
Detail: [slice-674.md](docs/changelog/slice-674.md).

**Tests (slice 673): L3 triple-class multiclass audit (L1+L1+L1, C(12,3) = 220)**
Sibling of slices 642 (L1+L1 pairs, 66) and 656 (L1+L2 ordered pairs, 132). Audits all 220 distinct L1+L1+L1 triples: each builds via `CharacterSchema.parse`, commits CharacterCreated, and derives via `engine.derive.character` without throwing. All-14 ability scores clear every RAW multiclass prerequisite. 221 tests (220 triples + 1 enumeration). ~3s wall-clock. First of the 4 audit/polish slices in this cycle.
Detail: [slice-673.md](docs/changelog/slice-673.md).

**Engine + content (slice 672): Blink (cross-plane per-turn ethereal toggle)**
Closes the final L3 deferred spell — **L3 spells are now 100% wired-or-narrative.** Buff applies `blink-active` marker; new planner `planBlinkTurnEnd` rolls d20 at the end of each of the bearer's turns and applies `blink-ethereal-active` on 11+. Plane semantics + 10-ft re-emergence + duration cleanup are consumer-managed (engine has no positions or plane model). 4 new tests. L3 wired 31 → 32 (0 deferred); aggregate 208/339 → 209/339; conditions 155 → 157. **L1+L2+L3 spell wiring is now 100% wired-or-narrative.**
Detail: [slice-672.md](docs/changelog/slice-672.md).

**Content (slice 671): Beacon of Hope (composite-buff condition)**
Closes 1 deferred L3 spell, zero engine change. Buff applies `beacon-of-hope-active` to each target. Condition projects `SetAdvantage on save:WIS` + `GrantMaxHealingDice` (existing primitive — each healing spell hits max). Death-save advantage arm deferred (needs threading effect stack through `planDeathSaveAtTurnStart`). 3 new tests. L3 wired 30 → 31 (1 deferred); aggregate 207/339 → 208/339; conditions 154 → 155.
Detail: [slice-671.md](docs/changelog/slice-671.md).

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


## Older releases

Tagged release `0.8.0-alpha.0` lives in [docs/changelog/released-versions-0.8.0-alpha.0.md](docs/changelog/released-versions-0.8.0-alpha.0.md); `0.7.0-alpha.0` lives in [docs/changelog/released-versions-0.7.0-alpha.0.md](docs/changelog/released-versions-0.7.0-alpha.0.md); `0.5.0-alpha.0` lives in [docs/changelog/released-versions-0.5.0-alpha.0.md](docs/changelog/released-versions-0.5.0-alpha.0.md); `0.4.0-alpha.0` lives in [docs/changelog/released-versions-0.4.0-alpha.0.md](docs/changelog/released-versions-0.4.0-alpha.0.md); `0.2.0-alpha.0` lives in [docs/changelog/released-versions-0.2.0-alpha.0.md](docs/changelog/released-versions-0.2.0-alpha.0.md); `0.1.0-alpha.15` lives in [docs/changelog/released-versions-alpha-15.md](docs/changelog/released-versions-alpha-15.md); `0.1.0-alpha.14` lives in [docs/changelog/released-versions-alpha-14.md](docs/changelog/released-versions-alpha-14.md); `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
