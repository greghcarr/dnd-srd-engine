# Archive: slices 573-575

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 584, to keep the live file under the 60 KB single-Read ceiling). These three combined-commit slices closed the L1 audit's test-rigor + audit-test gaps: per-class L1 end-to-end scenarios for 8 previously-uncovered classes (573); CI-guarded L1 SRD invariants audit (574); behavioral coverage for 8 RAW conditions + INCAPACITATING_CONDITIONS / ACTION_BLOCKING_CONDITIONS parity audit (575).

**Tests (slices 573 + 574 + 575): closure of the L1 audit's test-rigor + audit-test gaps**

Closes the last three items of the deep-audit closure plan in one combined slice. All three are test-only — no engine or content changes.

**Slice 573: per-class L1 end-to-end scenarios** ([tests/unit/engine/slice-573-l1-per-class-scenarios.test.ts](../../tests/unit/engine/slice-573-l1-per-class-scenarios.test.ts), 8 cases): one test per class for the 8 classes the audit flagged as lacking end-to-end L1 coverage (Barbarian, Bard, Cleric, Druid, Monk, Ranger, Sorcerer, Warlock). Fighter / Paladin / Rogue / Wizard already had golden L1 coverage. Each test builds an L1 character of the class, exercises a class-specific L1 feature (Rage + greataxe; Vicious Mockery cast; Cure Wounds heal; Produce Flame cantrip; Martial Arts unarmed strike; Hunter's Mark free-cast via Favored Enemy; Innate Sorcery activation; Eldritch Blast L1 single-beam), and asserts the architectural invariant `replay(campaign.events) deep-equals campaign.state` via the existing `replay` helper.

**Slice 574: CI-guarded L1 SRD invariants audit** ([tests/audit/srd-l1-invariants.test.ts](../../tests/audit/srd-l1-invariants.test.ts), 30 cases): pins three drift-prone L1 facts against the pack:
1. Per-class hit die (12 cases — d6/d8/d10/d12 per class). A future content edit that bumped a hit die now fails CI.
2. Per-caster L1 spell-slot table + ability + progression (8 cases — Bard CHA-full / Cleric WIS-full / Druid WIS-full / Sorcerer CHA-full / Wizard INT-full / Paladin CHA-half / Ranger WIS-half / Warlock CHA-pact). Mirror of slice 564's derive-side coverage but as an audit, so a regression in `FULL_CASTER_SLOTS` or the class's `spellcasting` field fails immediately.
3. Non-caster classes have no spellcasting (4 cases — Barbarian / Fighter / Monk / Rogue).
4. Standard ability-score array values (8 / 10 / 12 / 13 / 14 / 15) are accepted by the schema (6 cases — boundary check).

**Slice 575: condition behavior tests + parity audit** ([tests/unit/engine/slice-575-condition-behavior.test.ts](../../tests/unit/engine/slice-575-condition-behavior.test.ts), 10 cases; [tests/audit/incapacitated-parity.test.ts](../../tests/audit/incapacitated-parity.test.ts), 2 cases):
- Behavioral coverage for 8 RAW conditions that previously had only pack-declaration assertions: Blinded (attacker advantage + self disadvantage), Poisoned (self attack disadvantage), Restrained (attacker advantage), Stunned (attacker advantage), Invisible (attacker disadvantage), Charmed (can't attack charmer — throws), Frightened (self attack disadvantage), Prone (asymmetric melee advantage), Unconscious (attacker advantage). Each test commits a fixture with the condition applied and asserts the resulting attack-roll mode through `engine.plan.attack`.
- New audit pins the `INCAPACITATING_CONDITIONS` (reducer-side, slice 570) and `ACTION_BLOCKING_CONDITIONS` (planner-side, slice 339+) sets at parity. The two sets enforce the same RAW semantic ("Incapacitated breaks concentration" / "Incapacitated blocks actions") and must contain the same condition ids; the audit parses both source files via regex (comment-aware), strips line comments to skip mentions in prose, and asserts set equality. If a future slice adds a new incapacitating condition (e.g., `tasha-hideous-laughter-active`) to one side but not the other, CI fails immediately.

**Real RAW drift uncovered during slice 575 (documented; tracked for future closure):**

Stunned / Paralyzed / Unconscious / Petrified all carry `SetAdvantage on:{kind:'save',ability:'STR'|'DEX'} mode:'auto-fail'` entries (verified by slice 567's pack-declaration tests). The `EffectAccumulator` builder tracks `autoFail` per ability ([src/effects/builder.ts:81](../../src/effects/builder.ts#L81)). **HOWEVER**, the save derive ([src/derive/save.ts:174-175](../../src/derive/save.ts#L174-L175)) only exposes `hasAdvantage` / `hasDisadvantage`, NOT `hasAutoFail`. The save planner therefore doesn't force-fail saves on auto-fail-bearing characters; a Stunned target rolling a STR save can still succeed if the d20 result + modifiers exceed DC. This is a real RAW drift not previously caught. Slice 575 documents it in the test (commented-out assertion with the explanation) so a future engine closure can wire the auto-fail path through the save planner. The pack-declaration parity tests (slice 567) catch any regression in the effect-list itself.

**Audit (combined):**
- **Names:** `INCAPACITATING_CONDITIONS` / `ACTION_BLOCKING_CONDITIONS` follow the slice-570 naming convention; `RAW_HIT_DICE` / `RAW_CASTERS` in the slice-574 audit are RAW-reference constants.
- **DRY:** parity audit + per-class L1 tests both use the same buildL1 helper convention (slice 573 file-local; slice 564's CASTERS table re-stated in slice 574's audit since the audit checks the SAME table via a different code path — derive vs pack — and a shared module would couple the layers).
- **SRP:** four new test files; zero engine / content changes.
- **Magic numbers:** all RAW values (hit dice; standard array; slot tables) extracted to named constants in the test files.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** 50 cases total (8 per-class scenarios + 30 L1 invariants + 10 condition behaviors + 2 parity).

**Pattern-check:** the auto-fail save drift surfaces a class of "effect-stack-tracked but planner-unconsumed" bugs. A future slice can sweep all EffectAccumulator state for read-site coverage. The deep audit's 8-item closure plan is complete:
1. ~~Condition effect-list completeness~~ — slice 567.
2. ~~Within-5ft auto-crit + Prone asymmetric + Grappled non-grappler~~ — slice 568.
3. ~~Exhaustion attack-roll + speed penalties~~ — slice 569.
4. ~~Incapacitated → concentration-break~~ — slice 570.
5. ~~planHelp~~ — slice 571.
6. ~~planReady~~ — slice 572.
7. ~~Per-class L1 golden scenarios~~ — slice 573 (8 of 8 classes).
8. ~~CI-guarded L1 audit tests~~ — slice 574.
9. ~~Condition behavior tests + INCAPACITATING parity~~ — slice 575.

The remaining engine gaps (auto-fail save consumption; planSearch / planStudy / planInfluence / planUtilize) are documented in the slice 572 + 575 entries and deferred to future engine slices — no longer surfaced by the audit's L1 closure plan.

---
