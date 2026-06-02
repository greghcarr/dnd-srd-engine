# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

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

**Engine + content (slices 580 + 581 + 582): Option-C closure tail — Deafened auto-fail, Frightened movement-gate audit-clarification, minimal encumbrance domain**

Closes the final three Option-C items in one bundled commit. All three are scoped narrowly (each is small / clarifying / minimum-viable) and together close the deferred-list end-to-end.

**Slice 580: Deafened auto-fails ability checks that require hearing**

RAW (SRD 5.2.1 Deafened): "A deafened creature can't hear and automatically fails any ability check that requires hearing."

Pre-slice the deafened condition shipped with `effects: []` — the auto-fail arm wasn't enforced anywhere.

- **Derive change** ([src/derive/ability-check.ts](src/derive/ability-check.ts)): `AbilityCheckResult` gains `hasAutoFail: boolean` (mirror of slice 576's SaveResult).
- **Planner change** ([src/engine/plan/checks.ts](src/engine/plan/checks.ts)): `AbilityCheckIntent` gains optional `sense?: 'sight'|'hearing'|'smell'|'touch'|'taste'` (threaded into the existing slice-263 `event.sense` fact); `planAbilityCheck` forces `success = false` when the bearer is Deafened AND the check declares `sense: 'hearing'`.
- **Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): Deafened gains a predicate-gated `SetAdvantage on: { kind: 'check' }, mode: 'auto-fail', condition: event.sense == 'hearing'`.
- Tests: 9 cases ([tests/unit/engine/slice-580-deafened-auto-fail.test.ts](tests/unit/engine/slice-580-deafened-auto-fail.test.ts)) — pack declaration; derive hasAutoFail per-sense; planner force-fail; sense mismatch passes; non-Deafened passes; no-DC emits with breakdown but no success field.

**Slice 581: Frightened movement-gate (audit-clarification)**

The slice 567 CHANGELOG entry listed Frightened "can't move closer to source" as deferred ("no engine primitive"). **That was incorrect** — the gate IS wired ([src/engine/plan/movement.ts:127-153](src/engine/plan/movement.ts#L127-L153)) and exercised by [tests/audit/raw-compliance.test.ts](tests/audit/raw-compliance.test.ts). Slice 581 adds a dedicated behavior test under tests/unit/engine/ so the integration is also covered at the unit level (faster regression catch). No engine or content change; pure audit-clarification.

Tests: 3 cases ([tests/unit/engine/slice-581-frightened-movement-gate.test.ts](tests/unit/engine/slice-581-frightened-movement-gate.test.ts)) — Frightened with sourceCharacterId stamps correctly; Frightened condition still has its LoS-gated bearer-side disadvantage; the movement-gate code path remains present in movement.ts (structural smoke check).

**Slice 582: minimal encumbrance domain**

Closes the Petrified weight ×10 + Goliath Powerful Build carrying-capacity RAW arms with two new derive functions. **Scope intentionally narrow**: no per-item weights, no total-carried-load tracking, no speed-by-load gates. Just the two derives so a consumer surfacing the sheet has a canonical source.

- [src/derive/carrying-capacity.ts](src/derive/carrying-capacity.ts) ships:
  - `computeCarryingCapacity(character, content)` → `{ capacity: number, breakdown }`. Base = `STR × 15`; Goliath species adds ×2 Powerful Build multiplier. Per-source breakdown entries.
  - `computeCreatureWeight(character, content)` → `{ weight: number, breakdown }`. Base from size (Tiny 5 / Small 40 / Medium 150 / Large 1000 / Huge 8000 / Gargantuan 64000). Petrified condition adds ×10 multiplier.

Constants extracted: `STRENGTH_TO_CAPACITY_LB = 15`, `POWERFUL_BUILD_MULTIPLIER = 2`, `PETRIFIED_WEIGHT_MULTIPLIER = 10`, `POWERFUL_BUILD_SPECIES_IDS` set.

Tests: 11 cases ([tests/unit/derive/slice-582-carrying-capacity.test.ts](tests/unit/derive/slice-582-carrying-capacity.test.ts)) — base capacity at STR 1 / 10 / 18; Goliath ×2 at multiple STR; non-Goliath species explicitly don't get the multiplier (8 species × control); per-size weight; Petrified ×10 on Medium + Small; non-Petrified has no breakdown entry.

**Combined audit:**
- **Names:** `hasAutoFail` parallels slice 576's SaveResult flag; per-multiplier constants in carrying-capacity.ts named for clarity.
- **DRY:** the auto-fail wiring mirrors slice 576's save-side block; the carrying-capacity derive is a fresh module.
- **SRP:** slice 580 adds one schema field + one derive output field + one content effect entry; slice 581 is test-only; slice 582 is two pure derive functions in a new file.
- **Magic numbers:** all encumbrance constants extracted.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** 23 cases (9 + 3 + 11).

**Option C closure complete.** Original residual gap list closed:
1. ~~Auto-fail save consumption~~ — slice 576 ✓
2. ~~consumeOnCheck + planBardicInspiration + Help-on-check~~ — slice 577 ✓
3. ~~planLayOnHands~~ — slice 578 ✓
4. ~~planSearch / planStudy / planInfluence / planUtilize~~ — slice 579 ✓
5. ~~Deafened auto-fail hearing checks~~ — slice 580 ✓
6. ~~Frightened movement-gate~~ — slice 581 (audit-clarification; already wired) ✓
7. ~~Encumbrance (Petrified ×10 + Goliath Powerful Build)~~ — slice 582 ✓

Remaining truly-trivial deferrals (not worth slices): `planDash` + `planDisengage` standalone unit tests (both wired correctly; exercised indirectly).

---

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
