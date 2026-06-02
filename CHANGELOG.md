# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Tooling (slice 590): combat-fuzz buff/utility spell policy**

The combat fuzz's pickIntent step 2 (first-turn buff) handled only the four BA-cast riders (Barbarian Rage, Ranger Hunter's Mark, Warlock Hex, plus Paladin Divine Favor added this slice). The fuzz never exercised Action-cast L1 buffs (Bless, Mage Armor, Faerie Fire), so the engine's `blessed` / `mage-armor` / `faerie-fire-active` condition wiring, slot-consume + concentration tracking on Action casts, and any interactions with the existing AttackRolled / SaveRolled flow were unexercised by the bug-discovery harness.

**Changes** ([scripts/combat-fuzz.ts](scripts/combat-fuzz.ts)):
- New `firstTurnActionBuffTried` flag on `Combatant` (parallel to `firstTurnBuffTried`); reset is implicit (each new battle constructs new combatants).
- Step 2 (BA buff) now also handles `paladin → divine-favor` self-cast, gated by `hasUnusedL1Slot(c)`. Paladin at L1 has zero slots per RAW (spellcasting starts at L2), so the gate skips the branch — Divine Favor is exercised at L2+ once the fuzz supports higher levels (slice 593).
- New step 2b (Action buff) after step 2 + the mastery-fire hook, before step 3. Branches:
  - `cleric` / `bard` → Bless self-target (1st-level slot, concentration, +1d4 to attacks / saves for 1 minute).
  - `wizard` / `sorcerer` → Mage Armor self-target (1st-level slot, no concentration, AC base 13 + DEX for 8 hours).
  - `druid` → Faerie Fire on opponent (1st-level slot, concentration, advantage on attacks vs outlined target).
- `CLASS_BUILDS` `l1Spells` expanded so the policy branches have a prepared spell to cast:
  - `bard` += `bless`
  - `cleric` += `bless`
  - `druid` += `faerie-fire`
  - `sorcerer` += `mage-armor`

**Verification** (30 seeds, slice 590-fuzz):
- 23 buff casts across the batch: Mage Armor (8 + 8), Bless (4 + 4), Faerie Fire (5 + 3), Divine Favor (0 — paladin L1 has no slots, expected).
- Mage Armor verified raising AC end-to-end (seed 400: sorcerer Aria's AC went from 11 → 14 after the cast; Bran's longsword attack roll vs Aria flipped from `vs AC 11` to `vs AC 14`).
- Bless verified casting + applying `blessed` condition + claiming concentration ("Bran is now Blessed", "Bran is now concentrating on Bless"). The +1d4 attack/save modifier didn't surface in transcripts in this batch because the Blessed bearers (Cleric / Bard) cast save-based spells (Sacred Flame / Vicious Mockery) where the +1d4 doesn't apply; engine-side unit tests already cover the modifier.
- Faerie Fire verified casting (Druid Bran cast on opponent Aria + slot consumed + concentration claimed).
- No engine errors / bugs surfaced this run; the buff policy works cleanly against the engine.

**Audit:**
- **Names:** `firstTurnActionBuffTried` parallels `firstTurnBuffTried`. The buff order in step 2b mirrors caster class order in `CLASS_BUILDS`.
- **DRY:** each buff branch is a single `return` statement; the shared check (`!actionUsed && hasUnusedL1Slot && hasSpell`) is intentional per-branch since the spell id varies.
- **SRP:** policy hook only; no engine, content, or test changes.
- **Magic numbers:** none added.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** live fuzz verification (23 buff casts across 30 seeds with the AC change verified end-to-end).

**Pattern-check (filter shape: "L1 spell preparable by class X but not in CLASS_BUILDS"):** swept the CLASS_BUILDS table against the spell list per class:
- Bard could also prepare Faerie Fire / Heroism / Charm Person at L1; left at Bless for slice 590.
- Cleric could also prepare Shield of Faith / Sanctuary / Command at L1; left at Bless.
- Druid could also prepare Longstrider / Goodberry at L1; left at Faerie Fire.
- Wizard / Sorcerer could prepare Shield (reaction, slice 592 work) + Charm Person; left at Mage Armor.
The fuzz exercises the most-impactful buff per class in 1v1 combat; broader spell coverage would be a "more random L1 spell selection" follow-up (deferred).

---

**Engine + content + tooling (slice 589): weapon-mastery firings in fuzz; property-qualified weapon proficiency tokens; Rogue / Monk / Wizard proficiency RAW fixes**

The combat fuzz never exercised Weapon Mastery because the fuzz built characters without a chosen mastery list. Wiring the fuzz to fire mastery riders after hits surfaced a deeper RAW deviation: the pack's class definitions used a flat string list for `weaponProficiencies` (`"simple"`, `"martial"`, weapon id) that couldn't express "Martial weapons that have the Finesse or Light property" — Rogue's RAW shape per [references/srd-markdown/classes.md](references/srd-markdown/classes.md). With only `"simple"` declared, the engine's [src/derive/attack.ts](src/derive/attack.ts) `isWeaponProficient` returned false for a Rogue holding a shortsword, and `canUseWeaponMastery` then rejected the Vex rider as un-mastered.

**Engine** ([src/derive/attack.ts:55-79](src/derive/attack.ts#L55-L79)): `isWeaponProficient` now recognizes property-qualified category tokens of the shape `"<category>-<property>"` (e.g. `"martial-light"`, `"martial-finesse"`). The token matches a weapon whose category equals `<category>` AND whose `properties` array contains `<property>`. The existing three forms (exact weapon id, plain category, `"all"`) are preserved. The extension is non-invasive: classes that don't use the new tokens behave identically.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): three pre-existing RAW deviations fixed in the same sweep:
- **Rogue**: `["simple"]` → `["simple", "martial-finesse", "martial-light"]`. RAW per SRD 5.2.1: "Simple weapons and Martial weapons that have the Finesse or Light property." Pre-fix, Rogue attacks with a shortsword / rapier / scimitar / whip / hand crossbow rolled at -2 vs RAW (missing the +2 proficiency) and the engine refused weapon-mastery use on those weapons.
- **Monk**: `["simple"]` → `["simple", "martial-light"]`. RAW: "Simple weapons and Martial weapons that have the Light property." Same shape as Rogue; affected shortsword / scimitar / hand crossbow.
- **Wizard**: `[]` → `["simple"]`. RAW: "Simple weapons." The empty list was an outright omission. Pre-fix, a Wizard with a quarterstaff (a simple weapon) attacked without proficiency; the slice-494 True Strike test had codified this drift into its expectation (attackBonus +4 instead of the RAW +6); that test's comment + expectation are updated in this slice to reflect RAW.

**Tooling — fuzz weapon-mastery firings** ([scripts/combat-fuzz.ts](scripts/combat-fuzz.ts)):
- `MASTERY_CLASSES` (Fighter, Barbarian, Paladin, Ranger, Rogue per RAW) and a `WEAPON_MASTERY` table mapping fuzz weapons → mastery properties (`longsword` → Sap, `shortsword` / `rapier` → Vex, `longbow` → Slow). Cleave / Nick / Push / Topple / Graze are skipped: Cleave needs a second target, Nick an off-hand weapon, Push the encounter position layer, Topple is on weapons no fuzz class wields, Graze fires on miss for two-handed greatswords / glaives the fuzz also doesn't wield.
- `buildL1` now sets `character.weaponMasteries: [build.weaponId]` for mastery classes, bypassing the `chooseWeaponMasteries` planner (the choose path is exercised by [tests/golden/s23-weapon-mastery.test.ts](tests/golden/s23-weapon-mastery.test.ts); the fuzz just needs the resulting state).
- The runBattle inner loop, after each `Attack` intent by a mastery-class actor wielding a known-mastery weapon, scans the tail of `campaign.events` for the matching `AttackRolled` and (if hit) queues `pendingMasteryFire` on the active Combatant. The next `pickIntent` call returns a `WeaponMastery` intent (free rider — no extra action-economy spend); the engine's `canUseWeaponMastery` gate already validated the weapon-character-mastery triple at build time. Verified end-to-end across 20 seeds: Sap fires on Fighter / Paladin longsword hits, Slow on Ranger longbow hits, Vex on Rogue shortsword hits.

**Tests:**
- [tests/unit/derive/slice-589-property-qualified-proficiency.test.ts](tests/unit/derive/slice-589-property-qualified-proficiency.test.ts) (7 cases): Rogue + Monk + Wizard proficiency truth table including the negative cases (Rogue NOT proficient with greataxe; Monk NOT proficient with rapier; Wizard NOT proficient with any martial weapon).
- [tests/unit/engine/slice-494-true-strike.test.ts](tests/unit/engine/slice-494-true-strike.test.ts) updated: the test had hardcoded the pre-fix Wizard-no-proficiency drift into its `expect(attack?.attackBonus).toBe(4)` assertion; updated to `.toBe(6)` (INT +4 + prof +2) with a corrected comment. The +5 True-Strike-override delta is still proven (+6 with override vs +1 without).
- Full suite green: 479 test files, 3246 passing, 173 unrelated skips.

**Audit:**
- **Names:** `martial-finesse` / `martial-light` follow the kebab-case category-property axis; `MASTERY_CLASSES` / `WEAPON_MASTERY` parallel `FULL_CASTER_CLASSES` from slice 588.
- **DRY:** the engine extension at `isWeaponProficient` consolidates the previous three `.includes()` calls into a single token loop; ~5 lines added net.
- **SRP:** engine adds one feature to one helper; content fixes three class declarations; fuzz adds one policy hook + one runBattle scan. Three layers, but all unified by the same end-to-end behavior (Rogue Vex on shortsword fires).
- **Magic numbers:** none added.
- **at-threading:** N/A (the fuzz mastery intent inherits the planner's `at`).
- **Mechanical outcomes asserted:** 7 proficiency cases + 4 True-Strike cases + live fuzz verification (Sap / Slow / Vex firings across 20 seeds).

**Pattern-check (filter shape: "class weapon proficiency strings deviate from SRD body prose"):** swept all 12 starter-pack classes against [references/srd-markdown/classes.md](references/srd-markdown/classes.md). Three RAW deviations fixed (Rogue, Monk, Wizard); the other nine match SRD. The `srd-drift` audit at [tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts) covers table-detectable class facts (PB column, feature names per level) but not body-prose proficiency lists; those remain manual.

---

**Tooling (slice 588): combat-fuzz hardening — species resource grants + slot-availability fallback**

Closes the two fuzz-tool gaps surfaced by the second 15-battle run (seeds 200-214):

**1. Species-granted resources weren't populated.** The CLASS_BUILDS table seeded only class-granted resources (Rage, Second Wind, Lay on Hands, ...) into the L1 character. Species traits like Orc Relentless Endurance, Dwarven Stonecunning, Dragonborn Breath Weapon, and Goliath Giant Ancestry — all wired as `GrantResource` declarations on `species.traits` — were silently dropped, so the engine's `PreventFatalDamageConsumingResource` intercept ([src/derive/fatal-damage-intercept.ts:170-188](src/derive/fatal-damage-intercept.ts#L170-L188)) found the effect on Orc Aria but no matching entry in `character.resources`, and she died at -1 HP in seed 207. New helpers in [scripts/combat-fuzz.ts](scripts/combat-fuzz.ts): `speciesGrantedResources(pack, speciesId)` walks `species.traits` and emits a `{ resourceId, current: max, max }` per `GrantResource` trait; `evalL1ResourceMax` evaluates the `max` field at L1 (handles literal numbers, `{ kind: 'profBonus' }` → 2, `{ kind: 'level' }` → 1, defensive fallback to 1 for shapes the species traits don't currently use). `buildL1` now takes the pack and merges class + species resources at character construction.

**2. Cure Wounds spam after slot exhaustion left druid silent for 4 rounds.** The policy's low-HP branch unconditionally returned a `cure-wounds` intent with `slotLevel: 1` for druid / cleric / bard, even when all L1 slots were spent. The engine threw "No spell slots of level 1 available"; the runBattle catch silently broke the turn loop; the druid did nothing in seed 210 rounds 8-11. New helper `hasUnusedL1Slot(character)` gates the branch behind `(character.spellSlotsUsed['1'] ?? 0) < 2` for full casters (bard, cleric, druid, sorcerer, wizard). With the gate, slot-exhausted casters fall through to step 3 (damaging cantrip / weapon attack).

**Verification** (same seed range, post-slice):
- Seed 207: Orc Aria takes Hex 3 necrotic + EB 4 force (scaled from 6 by the fatal-damage intercept to land HP at 1), Relentless Endurance fires, transcript line: "**Aria** spends 1 relentless-endurance." Aria survives the round. (Pre-slice: dropped to -1, no intercept, immediate death.)
- Seed 210: Druid Bran now casts Produce Flame in every non-cure round including rounds 4-6 + 8-9 (slot-exhausted). 9 Produce-Flame casts + 2 Cure-Wounds across the battle. Pre-slice: 5 silent rounds, no fallback.

**Audit:**
- **Names:** `speciesGrantedResources`, `evalL1ResourceMax`, `hasUnusedL1Slot` are declarative; `FUZZ_L1_PROF_BONUS`, `FUZZ_L1_LEVEL`, `FULL_CASTER_L1_SLOTS`, `FULL_CASTER_CLASSES` are constants for the L1-only assumption.
- **DRY:** the species-merge is one append (`...speciesGrantedResources(pack, speciesId)`) into the existing `resources:` field.
- **SRP:** one tooling file changed; no engine, schema, content, or test change.
- **Magic numbers:** L1 prof-bonus (2), L1 level (1), full-caster L1 slot count (2), defensive `evalL1ResourceMax` fallback (1) — all extracted as named constants.
- **at-threading:** N/A (fuzz tool stamps synthetic timestamps per event).
- **Mechanical outcomes asserted:** verification is the live fuzz transcripts (seeds 207 + 210 above), consistent with how slice 585 introduced the tool.

**Pattern-check (filter shape: "buildL1 silently drops content-pack-granted state"):** the only L1 character state surfaces are `abilityScores`, `hp`, `inventory` + `equipped`, `knownSpells` + `preparedSpells`, `resources`, `appliedConditions`. Background `originFeatId` is not yet walked (e.g. Alert grants the `alert` feat, no resource at L1; Magic Initiate origin feats grant once-per-long-rest spell entries via `usedFreeCastSpellIds`, also no resource). Re-grepped `src/content/packs/starter-pack.json` for `"originFeatId"` + the feats those map to (Savage Attacker, Alert, Magic Initiate Wizard, Magic Initiate Cleric) — none of the four grant a resource the fuzz tool's policy reads, so background coverage isn't load-bearing for surfacing bugs today. Tracking as a deferred row if a future feat granting a combat-resource (e.g. Lucky's `luck` pool) is added.

**Remaining known fuzz-tool gaps** (cosmetic, not bug-hiding):
- The policy's step 3 (action: cantrip / weapon) still re-fires after a successful Produce-Flame cast (transcript-invisible "bonus action already used" throw, caught silently) — bounded to 1 wasted iteration per turn.
- Innate Sorcery is allowlisted out of the `performIntent` dispatch ([tests/audit/planner-wiring.test.ts:93](tests/audit/planner-wiring.test.ts#L93)); sorcerers still just cast Fire Bolt every turn.

---

**Tests (slice 587): SaveRolled / AbilityCheckRolled transcript advantage display**

Closes a slice-585 fuzz-tool finding: in the second 15-battle batch (seeds 200-214), seed 200's transcript showed `Bran WIS save: d20(2) + 4 (...) = 23 vs DC 12 -> success` — apparent math bug. The engine was correct: Bran the gnome druid had Gnomish Cunning (advantage on INT/WIS/CHA saves vs magic), rolled `[2, 19]`, used the 19. The transcript formatter at [tests/transcript.ts:204](tests/transcript.ts#L204) (`SaveRolled`) and the parallel `AbilityCheckRolled` branch only stringified `event.d20[0]` and ignored `event.used`, so the second die and the advantage label both disappeared.

**Fix:** mirror the existing `AttackRolled` formatter shape on both branches — `d20.length === 2 ? '${event.d20[0]}/${event.d20[1]}' : '${event.d20[0]}'` for the roll, and ` [advantage]` / ` [disadvantage]` after the roll-name when `event.used !== 'none'`. Normal (non-adv/disadv) rolls keep the existing `d20(X)` shape so unaffected snapshots don't move.

**Tests:** new [tests/unit/transcript-advantage-display.test.ts](tests/unit/transcript-advantage-display.test.ts) (5 cases) pins `d20(X/Y)` + `[advantage]` on a save with adv, `[disadvantage]` on a save with disadv, the unchanged single-die shape on a normal save, and parallel coverage for `AbilityCheckRolled` with both a skill and a bare ability check. Full suite green (3239 passing, 173 unrelated skips) — no existing golden transcript needed re-snapshotting, confirming no in-tree scenario currently exercises an adv/disadv save or check (which is itself a small coverage gap, separately worth a future scenario slice).

**Audit:**
- **Names:** `saveAdvLabel` / `saveRollLabel` and `checkAdvLabel` / `checkRollLabel` keep the AttackRolled `advLabel` / `rollLabel` naming axis.
- **DRY:** three branches now compute the same two locals. A shared helper (`d20Display(event)` returning `{ rollLabel, advLabel }`) would save ~6 lines across the three sites; declined — the formatters are intentionally flat and the duplicated lines read as the canonical pattern at each site.
- **SRP:** test-file change; one branch each in two switch arms; no engine, schema, or content change.
- **Magic numbers:** none added.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** 5 transcript-shape cases.

**Pattern-check (filter shape: "rolls with `event.used` + 1-or-2 `event.d20` whose formatter drops the second die"):** grepped `tests/transcript.ts` for `event.d20[0]` outside of the AttackRolled branch — two matches, both fixed above. `DamageRolled`, `BreathWeaponRecharged`, `HitDieSpent`, and the various "rolled X" lines emit a single die without any advantage axis, so no other formatter is in this family. Sweep clean.

---

**Engine (slice 586): dispatch OnEvent triggers on spell-attack `AttackRolled`**

Closes the slice 585 finding. `planAttackMechanic` in [cast-spell.ts](src/engine/plan/cast-spell.ts) emitted `AttackRolled` for spell attacks (Eldritch Blast, Fire Bolt, Ray of Frost, Chill Touch, etc.) WITHOUT calling `dispatchTriggers`. The weapon-attack path at [src/engine/plan/attack.ts:1101](src/engine/plan/attack.ts#L1101) always did. Result: target-side attack-triggered riders (Hex's 1d6 necrotic, Hunter's Mark's 1d6 force, etc.) fired on weapon swings but were silently dropped on spell-attack hits.

**Fix:** one call to `dispatchTriggers({state: applyAll(state, events), content, rng, event: attackEvent, at})` immediately after the `AttackRolled` push in `planAttackMechanic`. Mirrors the weapon-attack dispatch site. `applyAll` + `dispatchTriggers` were already imported. The slice-516 `DamageApplied`-side dispatch lower in the function is unchanged (it covers damage-side triggers like Repelling Blast; the new dispatch covers attack-side riders gated on `event.hit`).

**Test:** new [tests/unit/engine/slice-586-spell-attack-trigger-dispatch.test.ts](tests/unit/engine/slice-586-spell-attack-trigger-dispatch.test.ts) walks seeds 1-79 to find a Warlock-EB-hit-against-Hexed-target and asserts a `necrotic` damage component appears on hit; the un-Hexed counterpart asserts no necrotic. Full suite green (3234 passing, 173 unrelated skips).

**Audit:**
- **Names:** N/A (single existing-call mirror).
- **DRY:** the dispatch shape is now identical at both sites (weapon `AttackRolled` and spell `AttackRolled`).
- **SRP:** the planner emits an event then dispatches triggers on it. One concern per call site.
- **Magic numbers:** none added.
- **at-threading:** uses the planner's already-resolved `at`; no new `nowIso()` call.
- **Mechanical outcomes asserted:** Hex damage rider fires on EB hits; absent without Hex.

**Pattern-check (filter shape: "AttackRolled emission without dispatchTriggers" in planners):** grepped `src/engine/plan/` for `events.push(attackEvent)` and similar — `attack.ts` (dispatches), `cast-spell.ts` (now dispatches), `offhand-attack.ts` (the weapon offhand path uses the same wiring as `attack.ts`), `opportunity-attack.ts` (planner-internal, called from reaction dispatch — its callers handle triggers). No other planner emits `AttackRolled` directly. Sweep clean.

---

**Tooling (slice 585): combat-fuzz CLI — random L1 battles + transcripts for human review**

New `scripts/combat-fuzz.ts` CLI that drives random L1 1v1 battles to completion and writes markdown transcripts to disk. Catches **emergent-interaction** bugs the unit + golden tests don't cover — condition interactions mid-cast, reaction-window timing, action-economy edge cases — exactly the class of bug deterministic tests miss.

**Architecture**:
- **Random L1 builder**: standard array {15,14,13,12,10,8} assigned to per-class primary/secondary; random species + background; class-appropriate weapon + armor (longsword/chain-mail Fighter, greataxe/leather Barbarian, longbow/studded-leather Ranger, dagger Sorcerer, etc.); class-appropriate cantrips + L1 spells; class-keyed resources (Rage, Second Wind, Lay on Hands, Hunter's Mark, etc.).
- **Class-aware action policy** (`pickIntent`): low-HP self-heal first (Lay on Hands / Second Wind / Cure Wounds); first-turn buff (Rage / Hunter's Mark / Hex with random ability variant); damaging cantrip for casters; weapon attack for martial. Returns null when there's nothing left to do on the turn.
- **Battle runner**: cast → advance → repeat until one combatant ≤ 0 HP or 20-round cap. Uses the existing `performIntent` dispatch; throws are silently caught (the turn just ends).
- **Output**: per-seed `seed-NNNN.md` files + an `index.md` summary, default to `/tmp/combat-fuzz/`. Transcript via the existing `formatTranscript()`.

**CLI**: `npx tsx scripts/combat-fuzz.ts [--count N] [--seed S] [--out DIR]`. Defaults: 5 battles, seed 1, `/tmp/combat-fuzz/`.

**Found by the first 15-battle run** (slice 586 closes these):
- **Hex (and Hunter's Mark) damage rider doesn't fire on spell-attack hits.** Verified across seeds 103 / 105 / 114 (warlock casts Hex, then EB hits the Hexed target — no extra 1d6 necrotic emitted). The bug is isolated to spell attacks: `planAttack` (weapon attacks) dispatches triggers on AttackRolled ([src/engine/plan/attack.ts:1101](src/engine/plan/attack.ts#L1101)), but `planAttackMechanic` ([src/engine/plan/cast-spell.ts:500-523](src/engine/plan/cast-spell.ts#L500-L523)) emits AttackRolled WITHOUT a corresponding dispatch. Ranger Hunter's Mark on a longbow swing DOES fire (seed 102: weapon attack), confirming the gap is spell-attack-only.

**Scope limit**: Sorcerer's Innate Sorcery is currently allowlisted out of the `performIntent` dispatch (see [tests/audit/planner-wiring.test.ts:93](tests/audit/planner-wiring.test.ts#L93) — "Special-cast / placed-entity / multi-arg spell planners" category). The fuzz routes everything via `performIntent` so the policy skips Innate Sorcery; sorcerers just cast Fire Bolt every turn. A future fuzz revision can route allowlisted planners through their direct `engine.plan.X` calls.

**Audit:**
- **Names:** `ClassBuild` / `BuiltCharacter` / `Combatant` mirror the existing planner-side naming axis.
- **DRY:** the per-class `CLASS_BUILDS` table is the single source of truth for character roster construction; the policy walks it by `classId`.
- **SRP:** one tooling file (~330 lines); zero engine, content, or test changes.
- **Magic numbers:** `MAX_ROUNDS = 20`, `STANDARD_ARRAY = [15,14,13,12,10,8]`, hit-die-by-class table all extracted.
- **at-threading:** synthetic ISO timestamps stamped sequentially per event (deterministic transcripts).
- **Mechanical outcomes asserted:** N/A (tooling; output is for human review).

**Pattern-check:** the fuzz tool's value is **bug discovery**, not regression prevention — it doesn't run in CI. Each run produces fresh seeds + fresh transcripts; the human reviewer (me, in this case) reads them and surfaces issues. The slice 586 Hex-spell-attack bug is the first such finding.

---

**Web (slice 584): remove the Rules Lab mode from the demo app**

The browser demo (`web/`) previously shipped a "Rules Lab" mode — a click-to-run RAW-compliance verifier that re-executed the engine's audit probes against the loaded starter pack and rendered pass/fail rows for visitor inspection. Slice 584 removes it entirely.

The CI-side equivalent at [tests/audit/raw-compliance.test.ts](tests/audit/raw-compliance.test.ts) is unchanged — the engine's RAW-probe coverage still runs in the test suite. Slice 584 only removes the browser-side surface that re-ran the probes for visitors.

**Removed:**
- `web/modes/rules-lab.ts` — the mode implementation.
- `web/audit/probes.ts` — exclusive dependency (no other web-side caller).
- `web/audit/` — empty directory.

**Edited:**
- [web/main.ts](web/main.ts): dropped the `mountRulesLab` import, the `rulesLabRoot` `getElementById`, and the mount block.
- [web/index.html](web/index.html): removed the `<section id="rules-lab-root">` element and the "Click **Run audit** in the Rules Lab below…" sentence from the hint paragraph.
- [web/styles.css](web/styles.css): removed 119 lines of `.rules-lab*` selectors + the `.btn-run-audit` button style (no other call site).

**Audit:**
- **Names:** N/A (pure removal).
- **DRY:** removes redundant browser-side coverage of probes the test suite already enforces.
- **SRP:** web-only change. No engine, content, or test changes.
- **Magic numbers:** N/A.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** N/A (no new tests; existing suite still green).

**Pattern-check:** the Rules Lab was the only "execute audits in the browser" surface; no other web modes share its pattern. The slice 285 doc-size audit + the slice 432 doc-links audit + slice 195 SRD drift audit + slice 574 L1 invariants audit all remain CI-only as before.

Full suite: 476 files / 3232 passed / 0 failed / 173 skipped. `tsc --noEmit` clean across `src/` + `tests/` + `web/`.

---

**Tests (slice 583): spell-coverage harness — `aura-damage` expectation kind**

Converts 9 of the previously-skipped `aura-damage` spell-coverage entries from `it.skip` to `it` by extending the harness with a new `kind: 'aura-damage'` expectation. Each aura-damage spell now exercises the full cast → tickAura → assert chain rather than being acknowledged-but-untested.

Before slice 583 the spell-coverage smoke test skipped 11 aura-damage spells (Spirit Guardians, Entangle, Grease, Cloud of Daggers, Flaming Sphere, Stinking Cloud, Black Tentacles, Wall of Fire, Blade Barrier, Wall of Ice, Wall of Thorns) on the rationale "fires via engine.plan.tickAura per-turn, not on cast." Each was tested elsewhere (Spirit Guardians by [tests/unit/engine/plan-tick-aura.test.ts](tests/unit/engine/plan-tick-aura.test.ts); the rest by ad-hoc planners) but appeared as a `skip` in the canonical per-spell coverage matrix. Slice 583 moves them into the matrix.

**Harness change** ([tests/unit/engine/spell-coverage.test.ts](tests/unit/engine/spell-coverage.test.ts)):
- New `Expectation` union member: `{ kind: 'aura-damage', castingClass: 'cleric'|'druid'|'wizard', slotLevel: number, expectsSave: boolean, expectsDamage: boolean }`.
- New `buildDruid` fixture (mirrors `buildCleric` / `buildWizard`) for druid-list aura spells (Entangle, Flaming Sphere, Wall of Thorns).
- New harness branch (before the existing `it()` body) that runs cast + commit + `engine.plan.tickAura` and asserts:
  - Cast emits `SpellCastDeclared` + `SpellSlotConsumed` + `ConcentrationStarted`; NO `SaveRolled` / `DamageApplied` (those fire only on tick).
  - Tick emits `SaveRolled` when `expectsSave` is true.
  - Tick emits `DamageApplied` when `expectsDamage` is true (every aura with `halfOnSuccess: true` or no save emits damage every tick).

**Per-spell conversions** (9 entries flipped from `kind: 'skip'` to `kind: 'aura-damage'`):
- `spirit-guardians` (cleric L3, save+damage)
- `entangle` (druid L1, save-only — condition-on-fail; halfOnSuccess: false)
- `flaming-sphere` (druid L2, save+damage)
- `stinking-cloud` (wizard L3, save-only — condition-on-fail)
- `black-tentacles` (wizard L4, save+damage)
- `wall-of-fire` (wizard L4, save+damage)
- `blade-barrier` (cleric L6, save+damage)
- `wall-of-ice` (wizard L6, save+damage)
- `wall-of-thorns` (druid L6, save+damage)

**Entries that stay skipped (with rationale)**:
- `grease`: non-concentration aura. `planTickAura` requires the caster's concentration effect, but Grease's 1-minute duration doesn't concentrate. RAW Grease is an "on-enter zone" (creature entering DEX-saves or falls prone); the engine doesn't yet model on-enter triggers for non-concentration zones. Updated skip reason to document the deferral.
- `cloud-of-daggers`: was already skip-listed but `cloud-of-daggers` isn't actually in the starter pack (the `every shipped spell has an entry in SPELL_EXPECTATIONS` audit only iterates over `ALL_SPELL_IDS`, so the dead-code entry was harmless). Kept as documentation; not iterated.

**Test count delta**:
- Before: 182 skipped across the full suite (181 spell-coverage + 1 srd-drift content-missing case).
- After: 173 skipped (172 + 1).
- Net: **9 fewer skipped tests, 9 more passing tests**, no engine or content changes.

**Audit:** test-only; one new expectation kind + one new fixture (`buildDruid`) + one harness branch + 9 per-spell entry conversions. No schema / content / engine changes. RAW slot levels documented per entry. 9 cast-and-tick chains asserted.

**Pattern-check:** future dedicated-planner skips (planShield / planCounterspell) could similarly convert with a delegated assertion, but those already have dedicated tests so the value-per-conversion is lower; deferred.

---


---

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
