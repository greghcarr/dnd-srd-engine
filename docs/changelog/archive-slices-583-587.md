# Archive: slices 583-587

Five slices spanning a test-coverage expansion (aura-damage harness conversions), a web-app cleanup (Rules Lab removal), the combat-fuzz CLI introduction (slice 585 — the foundational tool for the slice 586-591 fuzz-driven bug-discovery cycle), and two slices that closed bugs the fuzz surfaced (spell-attack trigger dispatch + transcript advantage display).

Evicted from the live CHANGELOG in slice 591 (active-cycle-only headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Tests (slice 587): SaveRolled / AbilityCheckRolled transcript advantage display**

Closes a slice-585 fuzz-tool finding: in the second 15-battle batch (seeds 200-214), seed 200's transcript showed `Bran WIS save: d20(2) + 4 (...) = 23 vs DC 12 -> success` — apparent math bug. The engine was correct: Bran the gnome druid had Gnomish Cunning (advantage on INT/WIS/CHA saves vs magic), rolled `[2, 19]`, used the 19. The transcript formatter at [tests/transcript.ts:204](../../tests/transcript.ts#L204) (`SaveRolled`) and the parallel `AbilityCheckRolled` branch only stringified `event.d20[0]` and ignored `event.used`, so the second die and the advantage label both disappeared.

**Fix:** mirror the existing `AttackRolled` formatter shape on both branches — `d20.length === 2 ? '${event.d20[0]}/${event.d20[1]}' : '${event.d20[0]}'` for the roll, and ` [advantage]` / ` [disadvantage]` after the roll-name when `event.used !== 'none'`. Normal (non-adv/disadv) rolls keep the existing `d20(X)` shape so unaffected snapshots don't move.

**Tests:** new [tests/unit/transcript-advantage-display.test.ts](../../tests/unit/transcript-advantage-display.test.ts) (5 cases) pins `d20(X/Y)` + `[advantage]` on a save with adv, `[disadvantage]` on a save with disadv, the unchanged single-die shape on a normal save, and parallel coverage for `AbilityCheckRolled` with both a skill and a bare ability check. Full suite green (3239 passing, 173 unrelated skips).

---

**Engine (slice 586): dispatch OnEvent triggers on spell-attack `AttackRolled`**

Closes the slice 585 finding. `planAttackMechanic` in [cast-spell.ts](../../src/engine/plan/cast-spell.ts) emitted `AttackRolled` for spell attacks (Eldritch Blast, Fire Bolt, Ray of Frost, Chill Touch, etc.) WITHOUT calling `dispatchTriggers`. The weapon-attack path at [src/engine/plan/attack.ts:1101](../../src/engine/plan/attack.ts#L1101) always did. Result: target-side attack-triggered riders (Hex's 1d6 necrotic, Hunter's Mark's 1d6 force, etc.) fired on weapon swings but were silently dropped on spell-attack hits.

**Fix:** one call to `dispatchTriggers({state: applyAll(state, events), content, rng, event: attackEvent, at})` immediately after the `AttackRolled` push in `planAttackMechanic`. Mirrors the weapon-attack dispatch site. **Test:** new [tests/unit/engine/slice-586-spell-attack-trigger-dispatch.test.ts](../../tests/unit/engine/slice-586-spell-attack-trigger-dispatch.test.ts) walks seeds 1-79 to find a Warlock-EB-hit-against-Hexed-target and asserts a necrotic damage component appears on hit.

---

**Tooling (slice 585): combat-fuzz CLI — random L1 battles + transcripts for human review**

New `scripts/combat-fuzz.ts` CLI that drives random L1 1v1 battles to completion and writes markdown transcripts to disk. Catches emergent-interaction bugs the unit + golden tests don't cover.

**Architecture**:
- **Random L1 builder**: standard array {15,14,13,12,10,8} assigned to per-class primary/secondary; random species + background; class-appropriate weapon + armor; class-keyed resources.
- **Class-aware action policy** (`pickIntent`): low-HP self-heal first; first-turn buff (Rage / Hunter's Mark / Hex); damaging cantrip for casters; weapon attack for martial.
- **Battle runner**: cast → advance → repeat until one combatant ≤ 0 HP or 20-round cap.
- **CLI**: `npx tsx scripts/combat-fuzz.ts [--count N] [--seed S] [--out DIR]`. Defaults: 5 battles, seed 1, `/tmp/combat-fuzz/`.

**Found by the first 15-battle run** (slice 586 closes these):
- **Hex (and Hunter's Mark) damage rider doesn't fire on spell-attack hits.** Verified across seeds 103 / 105 / 114; isolated to spell attacks (`planAttackMechanic` in cast-spell.ts emits AttackRolled WITHOUT a corresponding dispatch).

---

**Web (slice 584): remove the Rules Lab mode from the demo app**

The browser demo (`web/`) previously shipped a "Rules Lab" mode — a click-to-run RAW-compliance verifier that re-executed the engine's audit probes against the loaded starter pack. Slice 584 removes it entirely.

The CI-side equivalent at [tests/audit/raw-compliance.test.ts](../../tests/audit/raw-compliance.test.ts) is unchanged. Removed: `web/modes/rules-lab.ts`, `web/audit/probes.ts`, `web/audit/`. Edited: `web/main.ts` (dropped the mount block), `web/index.html` (removed the section), `web/styles.css` (removed 119 lines of `.rules-lab*` selectors).

---

**Tests (slice 583): spell-coverage harness — `aura-damage` expectation kind**

Converts 9 of the previously-skipped `aura-damage` spell-coverage entries from `it.skip` to `it` by extending the harness with a new `kind: 'aura-damage'` expectation. Each aura-damage spell now exercises the full cast → tickAura → assert chain rather than being acknowledged-but-untested.

**Harness change** ([tests/unit/engine/spell-coverage.test.ts](../../tests/unit/engine/spell-coverage.test.ts)):
- New `Expectation` union member: `{ kind: 'aura-damage', castingClass: 'cleric'|'druid'|'wizard', slotLevel: number, expectsSave: boolean, expectsDamage: boolean }`.
- New `buildDruid` fixture (mirrors `buildCleric` / `buildWizard`) for druid-list aura spells.
- New harness branch that runs cast + commit + `engine.plan.tickAura` and asserts the expected SaveRolled / DamageApplied events fire on tick.

**Per-spell conversions** (9 entries): spirit-guardians, entangle, flaming-sphere, stinking-cloud, black-tentacles, wall-of-fire, blade-barrier, wall-of-ice, wall-of-thorns.

**Test count delta**: 182 → 173 skipped (9 fewer skipped tests, 9 more passing).
