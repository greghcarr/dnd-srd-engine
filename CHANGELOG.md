# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + tests + transcript (slice 626): close three open follow-ups from the L1 fuzz cycle**

Three small, tightly-related closures:

**1. On-hit masteries gate on damage > 0** (closes slice 624's open item). RAW Sap/Vex/Slow/Topple/Push: *"If you hit a creature with this weapon **AND deal damage to the creature**..."* A hit reduced to 0 by resistance/immunity shouldn't fire the rider. `WeaponMasteryIntent` gained `attackDealtDamage?: boolean`; when `false` for one of the 5 damage-gated masteries, [src/engine/plan/weapon-mastery.ts](src/engine/plan/weapon-mastery.ts) emits only the activation event and skips the rider. Cleave is exempt (RAW: "if you hit... you can make a melee attack roll" — no damage gate). Graze is unaffected (miss-only). Fuzz dispatch ([scripts/combat-fuzz-core.ts](scripts/combat-fuzz-core.ts)) inspects the following `DamageApplied` event's component sum and threads `attackDealtDamage = atk.hit && damageTotal > 0`.

**2. s23-weapon-mastery's "Graze deals ability mod damage" test now actually tests Graze** (closes slice 624's open item). Pre-slice the test fired Sap with a longsword because TEST_PACK had no Graze weapon (mislabel survived since the test was originally written). Slice 626 adds a `greatsword` (2d6 slashing, Graze) to [tests/fixtures/content/test-pack.json](tests/fixtures/content/test-pack.json) and the test now exercises `mastery: 'Graze', attackHit: false` and asserts the STR-mod-damage event with the right type.

**3. Transcript shows ALL d20 rolls when Halfling Lucky reroll grew the array** (closes the slice-625 review's transcript-display nit). Pre-slice [tests/transcript.ts](tests/transcript.ts) collapsed length≥3 d20 arrays to just `event.d20[0]`, so a `[disadvantage]: d20(19)` line looked bizarre (it was actually disadvantage rolling [19, 1], halfling lucky rerolling the 1 to 19, used=19). New `formatD20Rolls(rolls, used)` helper renders length-1 as "X", length-2 as "X/Y", length-3+ as "X/Y→Z" (the "→" marks the reroll). Used by AttackRolled / SaveRolled / AbilityCheckRolled formatters.

**Tests** ([tests/unit/engine/slice-626-mastery-damage-gate.test.ts](tests/unit/engine/slice-626-mastery-damage-gate.test.ts), 4 cases): Sap with `attackDealtDamage:false` → only the activation event (no Sapped); Sap with `attackDealtDamage:true` → Sapped applied; legacy caller (no field) still applies Sapped (backwards-compat); Cleave with `attackDealtDamage:false` still fires (Cleave has no damage gate per RAW). The s23 test now exercises real Graze. Transcript change is exercised implicitly by every golden + integration test that consumes `formatTranscript`; full suite green confirms no regressions.

**Verification:** tsc clean, full suite green. The transcript change is purely additive (formatting only): no golden transcripts regenerated since none currently include a Halfling Lucky + disadvantage combo with length≥3 d20 arrays.

**RNG impact**: none. Damage-gate is a planner-side skip on borderline RAW (no new rolls). Transcript change is presentation-only.

**Audit:**
- Names: `attackDealtDamage` mirrors `attackHit` from slice 624; `formatD20Rolls(rolls, used)` reads as what it does.
- DRY: damage-gated mastery list is a `Set<string>` literal at the top of the gate block. `formatD20Rolls` collapses 3 duplicate `length === 2 ? ... : event.d20[0]` ternaries into one helper.
- Pattern-check: swept other `event.d20.length === 2` references in [tests/transcript.ts](tests/transcript.ts) — three sites (AttackRolled, SaveRolled, AbilityCheckRolled), all updated to the helper. No other "show only the first d20" patterns elsewhere.
- Tests: 4 cases pin the damage-gate logic per branch (skip, fire, legacy, Cleave-exempt).

**Open follow-ups still tracked for later slices:**
- **Innate Sorcery class gate** (slice 623 open): currently grants advantage on ALL spell attacks; should gate on Sorcerer-list spells via a new `bearer.castingClassId` predicate fact. Needs predicate-fact infrastructure work.
- **Power Word Speed Zero autoExpiry** (slice 623 open): same source-vs-bearer confusion as Vex; needs separate RAW review (the spell's "until the start of the caster's next turn" is ambiguous about which actor's turn-start fires it).
- **Hellish Rebuke / Heroism / Searing Smite / Ensnaring Strike in fuzz** (slice 622/624 open): each is a reaction or bonus-action rider that doesn't fit the existing turn-start / first-turn-buff dispatch slots; needs new dispatch paths in the fuzz.

---

**Engine + tests (slice 625): Martial Arts Die scales monk weapons too, not just unarmed strikes**

The slice-624 fuzz review caught it (seed 5508): a monk wielding a sickle (1d4, Light simple melee → monk-eligible) still rolled the sickle's 1d4 when the L1 Martial Arts die is 1d6. RAW 2024 ([references/srd-markdown/classes.md](references/srd-markdown/classes.md) Martial Arts → Martial Arts Die): *"You can roll 1d6 in place of the normal damage of your Unarmed Strike **or Monk weapons**."* Slice 623 fixed the **Dexterous Attacks** arm of Martial Arts (STR→DEX on monk weapons) via the `martialArtsApplies` helper but missed widening the **die-scaling** arm — `applyMartialArtsDieScaling` still had the narrow `weaponDefId !== 'unarmed-strike'` early-return.

**Fix** ([src/engine/plan/attack.ts:391](src/engine/plan/attack.ts#L391)): `applyMartialArtsDieScaling` now keys off `martialArtsApplies(character, weapon)`, the same RAW gate slice 623 added (monk level ≥ 1 + monk-eligible weapon + no armor + no shield). Both Martial Arts arms now share the gate. Signature widened from `({ classes }, weaponDefId, ...)` to `(Character, Weapon, ...)`; the two call sites ([attack.ts:1149](src/engine/plan/attack.ts#L1149), [offhand-attack.ts:264](src/engine/plan/offhand-attack.ts#L264)) already had `attacker` and `weaponDef` in scope — no plumbing required.

**Tests** ([tests/unit/engine/slice-625-martial-arts-die-on-monk-weapons.test.ts](tests/unit/engine/slice-625-martial-arts-die-on-monk-weapons.test.ts), 5 cases): L1 monk sickle → 1d6 (not 1d4); L5 monk sickle → 1d8; armored monk → 1d4 (RAW gate strips Martial Arts); monk with greatsword (martial 2H → NOT monk-eligible) → 2d6 native; unarmed strike still scales (the original path).

**Verification:** tsc clean, full suite green. Re-running fuzz seed 5508 confirms Bran's sickle now rolls 1d6.

**RNG impact**: monk attacks with monk weapons (sickle, dagger, scimitar, shortsword, club, light-hammer, javelin, dart) now use the larger Martial Arts die. Larger dice → different damage rolls per seed (no extra d20s consumed). Same per-seed determinism-shift class as slices 623/624.

**Audit:**
- Names: reuses `martialArtsApplies` from slice 623; both arms now share the gate.
- DRY: removed the duplicate `unarmed-strike` check in favor of the shared helper.
- Pattern-check: this was the **sibling bug** to slice 623's Martial Arts fix. The engine had implemented BOTH arms (Dexterous Attacks + Martial Arts Die) narrowly (unarmed-only); slice 623 widened one arm, slice 625 widens the other. Grepped `src/engine/plan/` and `src/derive/` for other "monk + unarmed-strike" early-returns — none remain. Martial Arts L1 is now complete.
- Tests: each case pins one RAW shape (no-armor scaling, armored loses, non-monk-weapon stays native, unarmed unchanged).

**Open follow-ups:** the L5+ monk's Bonus Unarmed Strike (Martial Arts → Bonus Unarmed Strike arm) is an action-economy benefit, not a damage benefit; remains separate. Slice-624's open items still apply (on-hit masteries' damage > 0 gate; s23 mislabeled Graze test).

---

**Engine + tests (slice 624): Graze weapon mastery fires on MISS only (RAW gate)**

The slice-623 fuzz review caught Graze firing on hit (seed 6009: Aria glaive HIT for 7, then engine added 2 graze damage on top). RAW 2024 ([references/srd-markdown/equipment.md](references/srd-markdown/equipment.md)): Graze fires *"if your attack roll with this weapon misses a creature"* -- miss-only. Other 6 hit-and-damage masteries all fire on hit. Two-layer bug: [src/engine/plan/weapon-mastery.ts](src/engine/plan/weapon-mastery.ts)'s Graze case dealt damage unconditionally (comment even said "miss-fallback" but no invariant); [scripts/combat-fuzz-core.ts](scripts/combat-fuzz-core.ts) dispatch fired all masteries on `atk.hit === true`.

**Fix**: `WeaponMasteryIntent` gained optional `attackHit?: boolean`. `planWeaponMastery` invariants: Graze requires `false`; Sap/Vex/Slow/Topple/Push/Cleave require `true`; Nick/Flex unaffected (handled in attack planner). Legacy callers (no field) keep working for non-Graze. Fuzz dispatch threads `atk.hit` into `pendingMasteryFire` and gates: `mastery === 'Graze' ? !atk.hit : atk.hit`.

**Tests** ([tests/unit/engine/slice-624-graze-miss-gate.test.ts](tests/unit/engine/slice-624-graze-miss-gate.test.ts), 4 cases): Graze+miss emits STR-mod damage; Graze+hit throws; Sap+miss throws; legacy no-field caller still works.

**Verification:** tsc clean, full suite green. Re-running seed 6009 confirms the spurious "Mastery: Graze ... +2 damage" line is gone.

**RNG impact**: per-seed shift in mastery-class + Graze-weapon battles only (greatsword, glaive). Tracked in [docs/breaking-changes-queued.md](docs/breaking-changes-queued.md).

**Audit:**
- Names: `attackHit` matches `AttackRolledEvent.hit: boolean`.
- DRY: single invariant block covers all 7 gated masteries.
- Pattern-check: swept `src/engine/triggers/` and `src/engine/plan/` for other "on miss" handlers (`onMiss`, `missFallback`, `attackOutcome`, `hit: false`). Graze is the single instance.
- Tests: each pins one RAW shape; backwards-compat case prevents golden-test breakage.

**Open follow-ups:**
- On-hit masteries (Sap et al.) RAW also gates on "deal damage" -- 0-damage hits (resistance) shouldn't fire them either. Rare; not in scope.
- s23-weapon-mastery.test.ts "Graze deals ability mod damage" still fires Sap (mislabeled pre-slice-622). Could tighten now that starter pack has Graze weapons.

---

**Engine + tests (slice 623): close the three RAW bugs the slice-622 fuzz review surfaced (Vex autoExpiry, Innate Sorcery advantage, Monk Dexterous Attacks)**

The slice-622 pool-based fuzz immediately paid back: a 10-seed review caught three real RAW deviations that the prior narrow-loadout fuzz couldn't see because it never rolled the right class+weapon+condition combinations. Each fix targets a different subsystem.

**Bug 1: Vex weapon mastery expired on the wrong turn** (fuzz seed 7000).

RAW 2024 Vex: "you have Advantage on your next attack roll against that creature before the end of *your* next turn." [src/engine/plan/encounter.ts:85](src/engine/plan/encounter.ts#L85) `planAutoExpireConditionsAtTurnEnd` keyed the sweep off `applied.sourceCharacterId` — Vex's `vexing-active` condition sets source = vexed target (so `consumeOnAttack` at [src/engine/plan/attack.ts:535](src/engine/plan/attack.ts#L535) can scope to attacks against that target). Result: Vex expired at the *vexed target's* turn-end, before the vexer got their next turn.

Two usages of `sourceCharacterId` on the same condition were in conflict: consume needs target-as-source; expiry RAW says bearer-as-source.

**Fix**: new `expirySourceFromBearer?: boolean` flag on the [AutoExpirySchema](src/schemas/content/condition.ts) decouples them. When true, the encounter sweeps use `character.id` (the BEARER who carries the condition) instead of `applied.sourceCharacterId`. `vexing-active` gets the flag; the consumeOnAttack scoping stays unchanged. Both sweeps (`planAutoExpireConditionsAtTurnStart` + `planAutoExpireConditionsAtTurnEnd`) now thread `content` so they can read the flag.

**Bug 2: Innate Sorcery advantage on sorcerer spell attacks never fired** (fuzz seed 7006).

RAW 2024 Sorcerer L1 Innate Sorcery: 1-minute BA buff that gives "+1 spell save DC AND Advantage on the attack rolls of Sorcerer spells you cast." The `innate-sorcery-active` condition only carried the +1 DC arm; the advantage arm was deferred per [src/engine/plan/innate-sorcery.ts:45-50](src/engine/plan/innate-sorcery.ts#L45-L50). Independently, the spell-attack path in [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts) never queried `casterEffects.advantageFor('attack', ...)` — weapon attacks did the equivalent at [src/engine/plan/attack.ts:867](src/engine/plan/attack.ts#L867) but spell attacks dropped the attacker-side advantage entirely.

**Fix**: (a) add `SetAdvantage on:'attack' mode:'advantage'` to `innate-sorcery-active`; (b) compute `casterSelfAdvantage = casterEffects.advantageFor('attack', casterAttackFacts)` in cast-spell.ts and fold it into the same grants/imposes resolution the weapon path uses. Documented RAW deviation: the engine grants advantage on ALL spell attacks while Innate Sorcery is active, not strictly Sorcerer-cast spells. At L1 this is the same set; multiclass sorcerers casting non-sorcerer-list spells over-benefit. Tracked as a follow-up needing a `bearer.castingClassId` fact on the spell-attack predicate matcher.

**Bug 3: Monk Martial Arts "Dexterous Attacks" never swapped STR→DEX on monk weapons** (fuzz seed 7007).

RAW 2024 Monk L1 Martial Arts: while unarmed or wielding only monk weapons and not wearing armor or wielding a shield, monks use DEX instead of STR for attack + damage rolls on monk-eligible weapons (Simple Melee + Martial Melee with the Light property). [src/engine/plan/attack.ts:371-395](src/engine/plan/attack.ts#L371-L395) implemented only the Martial Arts *die scaling*, and only for `unarmed-strike`. The STR→DEX swap on monk-eligible weapons (javelin, shortsword, scimitar, etc.) was missing — a fuzz monk attacking with a javelin used STR (+1) when RAW says DEX (+2).

**Fix**: new exported `martialArtsApplies(character, weapon)` helper in [src/derive/attack.ts](src/derive/attack.ts) checks (a) monk level ≥ 1, (b) no armor + no shield (RAW gate on the whole feature), (c) the weapon is unarmed strike OR a simple melee OR a martial melee with light + not two-handed. Called from both `chooseAttackAbility` (derive) and `chooseDamageAbility` (planner). The signature widened from `{ abilityScores }` to a full `Character` so the helper has access to `classes` and `equipped`. The slice-622 monk fuzz transcript at seed 7007 now correctly attacks at +4 (DEX +2 + PB +2) instead of +3 (STR +1 + PB +2); the L6 monk golden at [tests/golden/transcripts/s207-empowered-strikes.transcript.md](tests/golden/transcripts/s207-empowered-strikes.transcript.md) regenerated (Kai's unarmed strike now uses DEX +4 vs STR +2 — RAW-correct, expected change).

**Tests** ([tests/unit/engine/slice-623-fuzz-review-bugs.test.ts](tests/unit/engine/slice-623-fuzz-review-bugs.test.ts), 5 cases — one per bug + an "armored monk loses Martial Arts" negative test + a "no Innate Sorcery means single d20" negative test). The Vex test steps through round-1 + round-2 turn-ends and asserts the removal happens at the *bearer's* turn-end, not the source's; pre-fix this test would have caught Vex disappearing at the wrong moment.

**Real bug avoided**: when wiring `chooseDamageAbility` for the monk fix, I caught my own narrow signature (`{ abilityScores }`) that wouldn't have given access to `classes`/`equipped`. The build failed loudly until I widened to `Character` — better than silently using the narrow type and missing the new path.

**Verification:** `npx tsc --noEmit` clean. Full suite green (497 files / 3344 tests, including 1 intentional snapshot regen). 10-seed `--vs pc` re-sweep at seeds 7000-7009 confirms: seed 7000 now shows `Aria attacks Bran [advantage]: d20(16/19)` (Vex advantage consumed by Aria's next-turn attack — pre-fix the `[advantage]` marker was missing because Vex had already expired); seed 7006 shows `Aria attacks Bran [advantage]: d20(1/19)` for Chromatic Orb (Innate Sorcery advantage now applied); seed 7007 shows Bran's monk javelin at `+4` (was `+3`) and damage `+2` (was `+1`).

**RNG impact**: every spell-attack now consumes a query against `casterEffects.advantageFor('attack', ...)`. No additional `rollDie` consumption unless `casterSelfAdvantage.advantage` actually flips the d20 from 1 to 2 rolls — i.e., only when a sorcerer with Innate Sorcery is casting. Vex's autoExpiry flag is data-only and doesn't shift RNG. Monk Dexterous Attacks shifts the attack-bonus number but doesn't change die counts. Per-seed determinism shifts on (a) sorcerer Innate Sorcery battles, (b) monk-with-monk-weapon battles, (c) Vex-mastery battles where the vexer's next-turn attack now actually rolls 2 d20s. Tracked in [docs/breaking-changes-queued.md](docs/breaking-changes-queued.md).

**Audit:**
- Names: `expirySourceFromBearer`, `martialArtsApplies`, `casterSelfAdvantage` — each names a concept the surrounding code lacked a vocabulary for. `weaponOf`/`masteryOf` would have shadowed slice 622 unfortunately; chose `martialArtsApplies` to mirror `canUseWeaponMastery` from slice 502.
- DRY: the existing `bonusDiceFor` / `critThreshold` / `advantageFor` call shape for weapon attacks is reused verbatim for spell attacks — only the missing line was added.
- SRP: each fix is one-concept, one-site. The autoExpire decoupling lives at the SCHEMA layer (one flag) + the SWEEP layer (one ternary); content opts in via the flag. Martial Arts lives in the derive layer; cast-spell.ts owns spell-attack-side advantage.
- Magic numbers: none added.
- at-threading: no new clock reads — the planners use their existing `at` values.
- Mechanical outcomes asserted: (a) Vex removal happens at the BEARER's turn-end; (b) Innate Sorcery active = 2d20 spell attack; (c) Monk with simple-melee weapon = DEX bonus; (d) armored monk loses Martial Arts.
- Pattern-check: Power Word Speed Zero (`power-word-speed-zero-active`) was flagged by the inventory pass as having the same source-vs-bearer confusion. Left for a separate slice because its RAW reading is ambiguous ("until the start of the caster's next turn") and the fix needs a separate RAW review of whether `expirySourceFromBearer` is the right fix or the trigger should change to `turnStart`. Not in scope for the fuzz-review closure.
- Tests: each bug's test pins the canonical RAW outcome the fuzz transcript surfaced. The negative test for armored monk catches a likely regression class (someone removing the no-armor gate would have a passing positive test but a failing negative).

**Open follow-ups** (tracked for separate slices):
- **`power-word-speed-zero-active`** autoExpiry semantics: needs its own RAW pass on whether `expirySourceFromBearer` or trigger change is correct.
- **Innate Sorcery class gate**: currently advantage fires on ALL spell attacks while active; should gate on "spell is a Sorcerer-list spell" via a new `bearer.castingClassId` predicate fact.

---

**Tooling + tests (slice 622): pool-based fuzz loadouts — every seed exercises a different swath of L1 SRD**

The combat-fuzz tool ([scripts/combat-fuzz-core.ts](scripts/combat-fuzz-core.ts)) is the engine's bug-spotter: human DnD experts skim random transcripts and catch RAW correctness errors (slices 601-621 surfaced ~12 real bugs this way). Coverage per seed determines bugs per review. Pre-slice the tool had fixed per-class loadouts (one weapon, one armor, one fixed cantrip+spell list per class) and 10 monsters — so 50 seeds produced only 12 distinct spells cast, 3 of 8 weapon masteries, 15 distinct equipment items, and 10 monster types ever seen.

**Changes** ([scripts/combat-fuzz-core.ts](scripts/combat-fuzz-core.ts)):

- **`CLASS_BUILDS` → `CLASS_POOLS`**: each class now has a `weaponPool`, `armorPool`, optional `cantripPool` + `numCantrips`, optional `l1SpellPool` + `numL1Spells`. New `pickN` helper does without-replacement draws via the existing `rngFloat` cursor. Build phase draws everything at character creation; `pickIntent` stays RNG-free.
- **Two-handed + shield resolution**: build phase rolls `useShieldChance` (gated on class shield proficiency) BEFORE the weapon draw; if shield wins, the weapon pool is filtered to non-two-handed options. Mutually-exclusive equipment guaranteed by construction.
- **Local `WEAPON_MASTERY` table deleted**: replaced with one-line pack lookup `pack.items.find(...).mastery`. Single source of truth — every RAW mastery (Sap, Vex, Slow, Cleave, Graze, Push, Topple, Nick) surfaces automatically the moment its weapon rolls.
- **`MONSTER_OPTIONS` expanded** from 10 to 25, mixing natural-weapon beasts (stirge, black bear, sprite, giant wolf spider) and humanoid/undead with mundane weapons (goblin warrior, skeleton, zombie, bandit, cultist, guard, scout, hobgoblin warrior, gnoll warrior, kobold warrior).
- **~10 new `pickIntent` spell branches** for previously-unused L1 spells: `magic-missile` (wizard/sorcerer, before fire-bolt so it preempts), `chromatic-orb` (with `casterChoice.damageType=fire`), `burning-hands`, `ice-knife`, `thunderwave`, `guiding-bolt`, `inflict-wounds`, `command` (with `casterChoice.commandWord=flee`), `dissonant-whispers`, plus `entangle` / `heroism` / `bane` in the first-turn buff slot. Concentration spells now gate on `c.concentrationEffectId === undefined` to avoid wasting slots on a re-buff that breaks the active one.
- **Cantrip fallback reads `c.preparedSpells.includes(...)`** instead of the build-time `build.cantrips.includes(...)` — automatically activates Magic-Initiate-granted cantrips that the slice-618 cascade attaches to Sage (wizard cantrip) and Acolyte (cleric cantrip) PCs. Six new cantrips also wired (`ray-of-frost`, `shocking-grasp`, `poison-spray`, `acid-splash`, `chill-touch`, `sorcerous-burst`) so wider cantrip pools actually fire.

**Coverage gain** (measured on a 100-seed `--vs pc` sweep, same baseline command before vs after):

| Metric | Before | After |
|---|---|---|
| Distinct spells cast | 12 | 25 |
| Distinct weapon masteries firing | 3 | 7+ (8 in 30-seed sample) |
| Distinct equipment items acquired | 15 | 42 |
| Monsters in pool | 10 | 25 |

**Tests** ([tests/integration/combat-fuzz-pool-loadouts.test.ts](tests/integration/combat-fuzz-pool-loadouts.test.ts), 6 cases over 20 seeds): every equipped weapon / armor is a real pack id; equipped weapons respect class `weaponProficiencies` (simple / martial / martial-finesse / martial-light buckets); every prepared spell is a real pack id; two-handed weapon + shield never co-occur; equipped armor matches class `armorProficiencies`. Deliberately NOT a per-spell coverage floor — that over-pins the random surface.

**Real bug caught during test development**: the rogue pool initially included `blowgun` (martial ranged, neither finesse nor light) — rogue isn't proficient. Caught by the proficiency invariant on its first run; removed from the rogue pool with a comment.

[tests/integration/combat-fuzz-flags.test.ts](tests/integration/combat-fuzz-flags.test.ts) (slice 614, 6 cases) re-audited: all assertions check character count / names / classId / level / `LongRestStarted` presence — nothing references weapons / spells / armor / damage. Stays green across the slice as expected.

**Verification:** `npx tsc --noEmit` clean; full suite green; 50-seed `--vs pc` sweep produces 21+ distinct spells cast (vs 12), 6+ distinct masteries (vs 3), 42 distinct items (vs 15). 100-seed sweep adds Dissonant Whispers + Acid Splash. Visual spot-check of 5 random transcripts: each contains at least one spell-cast event the prior fuzz never produced.

**Audit:**
- Names: `ClassPool`, `pickN`, `weaponOf`, `masteryOf`, `isTwoHandedWeapon`, `CLASS_SHIELD_PROFICIENT` — each intention-revealing. `ClassBuild` retained as the per-character snapshot (vs the per-class `ClassPool`), so the existing `BuiltCharacter.build` field and `pickIntent` reads are unchanged.
- DRY: one `pickN` helper covers cantrip + L1 spell draws; one `weaponOf` narrows the pack-item union; one `masteryOf` reads from it. The local `WEAPON_MASTERY` table that DUPLICATED a subset of pack data is gone.
- SRP: `buildL1` owns all per-character randomization (weapon, armor, shield, cantrips, spells); `pickIntent` reads `c.preparedSpells` without touching RNG (preserves the seed→battle determinism contract).
- Magic numbers: `STANDARD_ARRAY`, `FUZZ_MAX_LEVEL`, `useShieldChance` are all named or live on a per-pool field with documented intent.
- Pattern-check: swept `CLASS_BUILDS` and `WEAPON_MASTERY` references; the only consumer was within this file. No external module imported the old structures. Reviewed [tests/integration/combat-fuzz-flags.test.ts](tests/integration/combat-fuzz-flags.test.ts) for hidden assumptions about specific weapons/spells — none.
- Tests: pool-membership invariants catch typo / proficiency / two-handed-shield regressions (already caught one — blowgun). Coverage-floor test deliberately NOT added (over-pinning the random surface; future pool tuning would break it).

**Open follow-ups** (tracked for separate slices, not in scope here):
- **Slice 623**: positional combat — spawn combatants at fixed positions and add Move intents to unlock opportunity attacks and ranged-vs-melee divergence.
- **Slice 624**: magic-item content authoring — pack has 0 common-rarity items today; ship ~10 (Eyes of Charming, Wand of Magic Missiles, +1 weapon variants, ring of protection) so fuzz can roll a random magic-item starter.
- **Slice 625**: feat-active intents — drive Magic-Initiate's `oncePerLongRest` free cast, Lucky reroll trigger, etc.
- **Slice 626**: Hellish Rebuke as a reaction (mirror the existing Shield reaction shape; not a turn-start branch).
- **Heroism / Searing Smite / Ensnaring Strike** branches added but not observed firing in the 100-seed sweep — heroism needs allies (1v1 has none), the two smites are bonus-action riders that need a different injection point than the BA-buff slot. Move to slice 626 with Hellish Rebuke.

---

Per-slice detail for slices 620-621 (L1 fuzz concentration RAW work: trigger-dispatched rider damage triggers CON saves; six missed DamageApplied emission sites wired + main-damage CON save uses post-rider state + permanent coverage audit) is archived at [docs/changelog/archive-slices-620-621.md](docs/changelog/archive-slices-620-621.md) (slice 625, to keep this file under the 60 KB single-Read ceiling).


Per-slice detail for slices 615-619 (web tooling polish — placeholder text + CSS variables, LRU scrub cache for long demo sessions; the determinism + breaking-change + CHANGELOG-template docs cycle; engine.plan.offerCharacterChoices drains L1 OfferChoice entries on fresh characters; CI-guarded L1 SRD floor audit) is archived at [docs/changelog/archive-slices-615-619.md](docs/changelog/archive-slices-615-619.md) (slice 623, to keep this file under the 60 KB single-Read ceiling).

---

Per-slice detail for slices 611-614 (shared `resolveAttackRoll` helper closing slice-602 spell-attack duplication + off-hand attack-roll gap; per-component concentration saves + aura-tick coverage closing slice-601 follow-ups; content-driven `ResourceSpent` wording decoupled from slugs; slice-600-review audit rigor pass with golden scenarios + fuzz CLI integration test) is archived at [docs/changelog/archive-slices-611-614.md](docs/changelog/archive-slices-611-614.md) (slice 621, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 604-610 (slice-600 observer-review polish: HP display clamp, RE + Shield wording, Beast-name regression, initiative panel polish, event log readability, toolbar UX, incremental scrub cache) is archived at [docs/changelog/archive-slices-604-610.md](docs/changelog/archive-slices-604-610.md) (slice 613, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 599-603 (README onboarding polish; web demo becomes a fuzz-replay viewer; engine fixes the slice-600 review surfaced — auto-trigger CON save on damage, spell attacks consult target advantage, Produce Flame consumes BA + Action) is archived at [docs/changelog/archive-slices-599-603.md](docs/changelog/archive-slices-599-603.md) (slice 605, to keep this file under the 60 KB single-Read ceiling).
---

Per-slice detail for slices 593-598 (combat-fuzz expansion: level-up to L2-5; out-of-combat rest cycles; 2v2 multi-combatant mode; PC vs Monster mode; 10 L1-CR monster variety; Bonus-Action policy slot for species + class L1 BAs) is archived at [docs/changelog/archive-slices-593-598.md](docs/changelog/archive-slices-593-598.md) (slice 600, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 588-592 (combat-fuzz hardening: species resource grants + slot fallback; weapon mastery + RAW proficiency fixes for Rogue/Monk/Wizard; buff/utility spell policy; item variety with shields + potions; Shield reaction post-hit dispatch) is archived at [docs/changelog/archive-slices-588-592.md](docs/changelog/archive-slices-588-592.md) (slice 596, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 583-587 (spell-coverage aura-damage harness expansion; Rules Lab removal from the web app; combat-fuzz CLI introduction; spell-attack trigger dispatch fix; transcript advantage display fix) is archived at [docs/changelog/archive-slices-583-587.md](docs/changelog/archive-slices-583-587.md) (slice 591, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 580-582 (Option-C closure tail: Deafened auto-fail hearing checks; Frightened movement-gate audit-clarification; minimal encumbrance domain — Petrified ×10 + Goliath Powerful Build) is archived at [docs/changelog/archive-slices-580-582.md](docs/changelog/archive-slices-580-582.md) (slice 590, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 576-579 (auto-fail save consumption; `consumeOnCheck` + `consumeOnSave` primitives + planBardicInspiration + Help-on-check closure; planLayOnHands; the four thin action planners Search / Study / Influence / Utilize) is archived at [docs/changelog/archive-slices-576-579.md](docs/changelog/archive-slices-576-579.md) (slice 586, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 573-575 (per-class L1 end-to-end scenarios; CI-guarded L1 invariants audit; condition behavior tests + INCAPACITATING parity audit) is archived at [docs/changelog/archive-slices-573-575.md](docs/changelog/archive-slices-573-575.md) (slice 584, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 571-572 (planHelp — both Attack + Ability Check modes; planReady) is archived at [docs/changelog/archive-slices-571-572.md](docs/changelog/archive-slices-571-572.md) (slice 582, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 569-570 (Exhaustion attack-roll + Speed penalties — PHB 2024 unified d20-Tests semantic; Incapacitated → concentration-break on apply) is archived at [docs/changelog/archive-slices-569-570.md](docs/changelog/archive-slices-569-570.md) (slice 578, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 567-568 (condition effect-list completeness sweep + three attack-resolution gates: within-5-ft auto-crit, Prone asymmetric attacker advantage, Grappled non-grappler disadvantage) is archived at [docs/changelog/archive-slices-567-568.md](docs/changelog/archive-slices-567-568.md) (slice 576, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 565-566 (Hex ability-disadvantage rider; Favored Enemy Hunter's Mark pool-based free-cast wiring) is archived at [docs/changelog/archive-slices-565-566.md](docs/changelog/archive-slices-565-566.md) (slice 572, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 562-564 (Eldritch Blast multi-beam scaling; Vicious Mockery disadvantage rider; per-caster L1 spellcasting math test suite) is archived at [docs/changelog/archive-slices-562-564.md](docs/changelog/archive-slices-562-564.md) (slice 569, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 560-561 (Human / Tiefling Medium-or-Small size choice; Druid Magician cantrip choice + deep-audit clarifications) is archived at [docs/changelog/archive-slices-560-561.md](docs/changelog/archive-slices-560-561.md) (slice 567, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 553-559 (Goliath Giant Ancestry × 6 arms cohort + 3 missing focus variants) is archived at [docs/changelog/archive-slices-553-559.md](docs/changelog/archive-slices-553-559.md) (slice 562, to keep this file under the 60 KB single-Read ceiling).

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
