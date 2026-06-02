# Archive: slices 580-582

The Option-C closure tail — three small / clarifying / minimum-viable wires that together closed the deferred-list end-to-end after the slices 576-579 mid-cohort: Deafened auto-fail (hearing-gated checks), Frightened movement-gate audit-clarification (engine was already wired; test added), and a minimal encumbrance domain (Petrified ×10 weight + Goliath Powerful Build carrying capacity).

Evicted from the live CHANGELOG in slice 590 (active-cycle-only headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Engine + content (slices 580 + 581 + 582): Option-C closure tail — Deafened auto-fail, Frightened movement-gate audit-clarification, minimal encumbrance domain**

Closes the final three Option-C items in one bundled commit. All three are scoped narrowly (each is small / clarifying / minimum-viable) and together close the deferred-list end-to-end.

**Slice 580: Deafened auto-fails ability checks that require hearing**

RAW (SRD 5.2.1 Deafened): "A deafened creature can't hear and automatically fails any ability check that requires hearing."

Pre-slice the deafened condition shipped with `effects: []` — the auto-fail arm wasn't enforced anywhere.

- **Derive change** ([src/derive/ability-check.ts](../../src/derive/ability-check.ts)): `AbilityCheckResult` gains `hasAutoFail: boolean` (mirror of slice 576's SaveResult).
- **Planner change** ([src/engine/plan/checks.ts](../../src/engine/plan/checks.ts)): `AbilityCheckIntent` gains optional `sense?: 'sight'|'hearing'|'smell'|'touch'|'taste'` (threaded into the existing slice-263 `event.sense` fact); `planAbilityCheck` forces `success = false` when the bearer is Deafened AND the check declares `sense: 'hearing'`.
- **Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Deafened gains a predicate-gated `SetAdvantage on: { kind: 'check' }, mode: 'auto-fail', condition: event.sense == 'hearing'`.
- Tests: 9 cases ([tests/unit/engine/slice-580-deafened-auto-fail.test.ts](../../tests/unit/engine/slice-580-deafened-auto-fail.test.ts)) — pack declaration; derive hasAutoFail per-sense; planner force-fail; sense mismatch passes; non-Deafened passes; no-DC emits with breakdown but no success field.

**Slice 581: Frightened movement-gate (audit-clarification)**

The slice 567 CHANGELOG entry listed Frightened "can't move closer to source" as deferred ("no engine primitive"). **That was incorrect** — the gate IS wired ([src/engine/plan/movement.ts:127-153](../../src/engine/plan/movement.ts#L127-L153)) and exercised by [tests/audit/raw-compliance.test.ts](../../tests/audit/raw-compliance.test.ts). Slice 581 adds a dedicated behavior test under tests/unit/engine/ so the integration is also covered at the unit level (faster regression catch). No engine or content change; pure audit-clarification.

Tests: 3 cases ([tests/unit/engine/slice-581-frightened-movement-gate.test.ts](../../tests/unit/engine/slice-581-frightened-movement-gate.test.ts)) — Frightened with sourceCharacterId stamps correctly; Frightened condition still has its LoS-gated bearer-side disadvantage; the movement-gate code path remains present in movement.ts (structural smoke check).

**Slice 582: minimal encumbrance domain**

Closes the Petrified weight ×10 + Goliath Powerful Build carrying-capacity RAW arms with two new derive functions. **Scope intentionally narrow**: no per-item weights, no total-carried-load tracking, no speed-by-load gates. Just the two derives so a consumer surfacing the sheet has a canonical source.

- [src/derive/carrying-capacity.ts](../../src/derive/carrying-capacity.ts) ships:
  - `computeCarryingCapacity(character, content)` → `{ capacity: number, breakdown }`. Base = `STR × 15`; Goliath species adds ×2 Powerful Build multiplier. Per-source breakdown entries.
  - `computeCreatureWeight(character, content)` → `{ weight: number, breakdown }`. Base from size (Tiny 5 / Small 40 / Medium 150 / Large 1000 / Huge 8000 / Gargantuan 64000). Petrified condition adds ×10 multiplier.

Constants extracted: `STRENGTH_TO_CAPACITY_LB = 15`, `POWERFUL_BUILD_MULTIPLIER = 2`, `PETRIFIED_WEIGHT_MULTIPLIER = 10`, `POWERFUL_BUILD_SPECIES_IDS` set.

Tests: 11 cases ([tests/unit/derive/slice-582-carrying-capacity.test.ts](../../tests/unit/derive/slice-582-carrying-capacity.test.ts)) — base capacity at STR 1 / 10 / 18; Goliath ×2 at multiple STR; non-Goliath species explicitly don't get the multiplier (8 species × control); per-size weight; Petrified ×10 on Medium + Small; non-Petrified has no breakdown entry.

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
