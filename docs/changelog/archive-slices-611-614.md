# Archive: slices 611-614

Four slices covering the slice-602 follow-up closure (shared `resolveAttackRoll` helper for spell attacks too), the slice-601 multi-source concentration RAW (per-component CON saves + aura-tick coverage), content-driven `ResourceSpent` wording (decoupled from slug), and the slice-600-review audit-rigor pass (golden scenarios + fuzz CLI integration test + slice-611 follow-up actually paid down).

Evicted from the live CHANGELOG in slice 621 (active-cycle headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Tests + engine (slice 614): audit rigor — golden scenarios, fuzz CLI integration test, and the slice-611 follow-up actually paid down**

The slice-600 observer review flagged three weaknesses in the slice 601-610 audit work: shallow test coverage (focused unit tests but no full-battle golden scenarios for the new behaviors), a process gap (no integration test caught the slice-600 Beast-name regression), and superficial pattern-check sweeps (claimed "swept all 28 rollDie sites" — actual count was 51, and one of them, `offhand-attack.ts`, was a real gap I tracked as a follow-up but didn't close).

This slice does the rigor pass.

**1. Golden scenario for slices 601 + 602** ([tests/golden/s31-concentration-and-spell-advantage.test.ts](../../tests/golden/s31-concentration-and-spell-advantage.test.ts)): a 3-turn battle where the Druid casts Faerie Fire on the Wizard (concentration), Druid's next Fire Bolt rolls with [advantage] (slice 602 pin), Wizard's retaliating Fire Bolt deals damage that triggers the Druid's CON save (slice 601 pin). One end-to-end chain pins both behaviors against snapshot drift in realistic combat.

**2. Fuzz CLI flag integration test** ([tests/integration/combat-fuzz-flags.test.ts](../../tests/integration/combat-fuzz-flags.test.ts), 6 cases): exercises every CLI flag combo at the `runBattle` core (not via subprocess — calls the same core both the CLI + web demo use). Default 1v1, `--vs monster` (pins the slice-606 Beast-not-Bran regression with explicit "no character named 'Bran' in monster mode" assertion), `--mode 2v2` (suffix naming), `--mode 2v2 --vs monster`, `--level 3` (PCs leveled correctly), `--rest long` (LongRestStarted event present). The Beast-name regression class can't slide again — a future refactor breaking the naming would fail this test.

**3. Pattern-check sweep verification + close the real follow-up.** Walked the slice 602 claim "swept all `rollDie(D20_SIDES)` sites" with actual rigor. Real count: 51 sites (not 28). Categorized:
- Save-side: 26 sites (correctly use save-side advantage via `computeSavingThrow` / `_save-roll.ts`).
- Initiative + ability checks + travel + reactive-spells + transformations: 18 sites (each has its own d20 pipeline for save/check semantics; none are attack rolls).
- Attack-roll sites: 7 — `attack.ts` (×3 incl. Mirror Image deflection), `cast-spell.ts` (×1 attack site, post-611), `_attack-roll.ts` (×2 in the shared helper), `offhand-attack.ts` (×1 — **REAL GAP**), `weapon-mastery.ts` (×1 — that's a SAVE site, not attack).

`offhand-attack.ts:161` rolled a bare d20 with Halfling Luck only — no target-side advantage (Faerie Fire / Restrained / Paralyzed got no advantage on off-hand attacks), no Bless +1d4, no extended crit range, no melee-vs-paralyzed auto-crit. Same shape gap as the pre-slice-602 spell-attack path. Slice 611 tracked this as an open follow-up "for completeness" without closing it.

**Fixed**: [src/engine/plan/offhand-attack.ts:144-220](../../src/engine/plan/offhand-attack.ts#L144) now routes through `resolveAttackRoll`, computing target-side advantage / disadvantage / cancellation from the target's effect stack and passing through bonus dice + crit threshold + the melee auto-crit `forceCritIfHit`. Off-hand attacks against Faerie Fired / Unconscious / Restrained targets now correctly roll with advantage, and melee off-hand attacks against Paralyzed/HP-0 targets auto-crit.

**Snapshot update:** showcase transcript regenerated — Vex's nick (off-hand) attack against an already-downed Goblin Scout now correctly auto-crits per RAW (`forceCritIfHit` from the slice-611 helper, picked up here via the slice-614 wiring). Downstream RNG shifted because off-hand attacks against advantage-granting targets now consume 2 d20s instead of 1.

**Verification:** 490 files / 3282 tests pass. tsc clean.

**Audit (rigor slice):**
- Names: golden test prefixed `s31` per existing convention; integration test in `tests/integration/combat-fuzz-flags.test.ts` matches existing fuzz-related integration test layout.
- DRY: off-hand wiring reuses `resolveAttackRoll`; no duplicated d20 / advantage logic remains in `offhand-attack.ts`.
- SRP: the test files exercise one behavior each (chain golden + flag matrix). The off-hand engine change is the same shape as slices 602/611's other-attack-kind wirings.
- Magic numbers: none added.
- Pattern-check (this slice's): the slice 604 sweep claim about `.hp.current` accesses I verified by walking each match in `combat-fuzz-core.ts`. Each is genuinely a policy comparison (`hp.current <= 0`, `hp.current < hp.max / 2`) — none print to a user-facing string. The slice 604 sweep was right; the slice 602 sweep was wrong on the COUNT but the underlying conclusion (save-side is already correct, only attack-roll sites in attack.ts + cast-spell.ts needed wiring) held — except for the off-hand site which slice 611 tracked but I never closed, until now.

**Open follow-ups:** none from this slice. The slice-611-tracked "off-hand routes through resolveAttackRoll" is now closed.

---

**Content + tooling (slice 613): ResourceSpent wording is content-driven — uncoupled from slug**

Slice 605 hardcoded `resourceId === 'relentless-endurance'` in the transcript formatter for the killing-blow special wording, and printed raw slugs ("spends 1 relentless-endurance") for every other resource. Both shapes are the same coupling: presentation logic bound to specific content ids. A content rename or a future species/feat shipping the same effect-shape would silently fall through to wrong-or-ugly wording.

**Schema** ([src/schemas/effects.ts](../../src/schemas/effects.ts)): `GrantResource` gained an optional `label?: string` for the human-readable display name. Additive (no migration, no behavior change for existing unlabeled grants).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Orc Relentless Endurance + Adrenaline Rush both got `"label"` fields. Other resources stay unlabeled and rely on the formatter's title-case fallback.

**Formatter** ([tests/transcript.ts](../../tests/transcript.ts)): new `summarizeResources(content)` helper walks species traits, class level-table features, subclass level-grants, feats, and background traits to build:
- `labels: Map<resourceId, displayLabel>` from every `GrantResource` entry with a `label`.
- `preventsKillingBlow: Set<resourceId>` from every `PreventFatalDamageConsumingResource` entry.

The summary is computed once per `formatTranscript` call and threaded through `FormatterContext`. The `ResourceSpent` formatter now reads:
- `preventsKillingBlow.has(resourceId)` for the killing-blow wording (any species/feat that ships `PreventFatalDamageConsumingResource` earns the wording automatically — no formatter change needed when new content lands).
- `labels.get(resourceId) ?? titleizeSlug(resourceId)` for the display name. "rage" → "Rage", "relentless-endurance" → "Relentless Endurance" (with explicit label) or auto-title-cased.

**Tests** ([tests/unit/transcript-slice-613-resource-labels.test.ts](../../tests/unit/transcript-slice-613-resource-labels.test.ts), 4 cases): content-marked prevent-resource gets killing-blow wording; content-labeled resource uses its label; unlabeled resource falls back to title-cased slug; killing-blow wording does NOT fire for plain resources. Slice 605's test updated to expect "Rage" (title-cased) instead of "rage".

**Snapshot updates:** 4 golden transcripts touched (s201-sorcery-incarnate, s209-superior-defense, s9b-reaction-window, showcase) — each replaced raw slugs with title-cased labels. Cleanly intentional.

**Verification:** 488 files / 3275 tests pass. tsc clean.

**Audit:**
- Names: `summarizeResources`, `ResourceSummary`, `resourceLabel`, `titleizeSlug`, `preventsKillingBlow` all intent-revealing.
- DRY: one helper, one call, one map per transcript. The `visitEffects` walker handles all five content surfaces (species/feats/classes/subclasses/backgrounds) uniformly.
- Magic numbers: none added.
- Pattern-check: swept the formatter for other hardcoded slug references. Found none in `ResourceSpent` after this change. `condition.conditionId` and `spell.spellId` lookups already go through `content.conditions` / `content.spells` Maps. Sweep clean.

---

**Engine (slice 612): per-component concentration saves + aura-tick coverage — closes the slice-601 open follow-ups**

Slice 601 left two known gaps tracked as follow-ups:
1. Multi-source damage rolled ONE save against the totaled damage. RAW: "If you take damage from multiple sources, such as an arrow and a dragon's breath, you make a separate saving throw for each source of damage." Hex (1d6 necrotic) + weapon damage (1d8 piercing) hitting a concentrating target rolled one save vs the larger DC instead of two saves at per-source DCs.
2. The three aura-tick planners (`planTickAura`, `planTickRecurring`, `planTickMovementDamage`) emitted DamageApplied without triggering the slice-601 concentration save. A concentrating wizard taking Spirit Guardians aura damage from a hostile cleric wouldn't save.

**Changes** ([src/engine/plan/concentration.ts](../../src/engine/plan/concentration.ts)):
- `planConcentrationOnDamage` now iterates damage components. New private `rollConcentrationSave` helper rolls one save per source. On first failure, emit Broken and short-circuit (concentration is already broken). Single-component damage (the common case — most attacks emit one component) behaves identically to slice 601.
- DC math is per-component: `max(10, floor(component.amount / 2))`. A 30-piercing + 4-cold split now rolls vs DC 15 + DC 10 instead of one save vs DC 17 (totaled).
- All three aura-tick planners now call `planConcentrationOnDamage` after their DamageApplied, mirroring the direct-damage path's slice-601 wiring.

**Tests** ([tests/unit/engine/slice-612-multi-source-concentration.test.ts](../../tests/unit/engine/slice-612-multi-source-concentration.test.ts), 4 cases): two-source damage emits two saves (or one + Broken on early fail); per-source DC math pinned (30 → DC 15, 4 → DC 10); zero-amount components skipped; single-component matches slice 601.

**Verification:** 487 files / 3271 tests pass. Slice 601 tests still green (single-component is the trivial multi-source case). tsc clean.

**RNG impact:** any multi-component damage event to a concentrating target now consumes more RNG (one d20 per component instead of one total). Same per-seed determinism shift class as slices 601/602/611; tracked for slice 617's RNG-versioning doc. The aura-tick wiring also adds RNG to any battle where a hostile aura damages a concentrating target.

**Audit:**
- Names: `rollConcentrationSave` (private helper); `planConcentrationOnDamage` signature unchanged.
- DRY: per-component save logic extracted from the slice-601 inline body into the new helper; the outer loop is short and readable.
- Magic numbers: DC math constants unchanged from slice 601.
- Pattern-check: swept all `DamageApplied` emission sites in `src/engine/`. 11 sites: 8 already call `planConcentrationOnDamage` (slice 601), and the 3 aura-tick sites are now wired (this slice). Remaining DamageApplied sites (`fatal-damage-intercept` ExcessDamage labels, save-based area-damage in `cast-spell.ts` which already wires through the existing call) all check out — none are unwired damage-to-concentrating-target paths. Sweep clean.

---

**Engine (slice 611): shared `resolveAttackRoll` helper — closes slice-602 duplication + attacker-side spell-attack gap**

Slice 602's review flagged two debts (same root cause): spell attacks duplicated 50 lines of `plan/attack.ts`, and spell attacks skipped the attacker-side advantage pipeline (Halfling Luck, Bless +1d4, extended crit range).

New [src/engine/plan/_attack-roll.ts](../../src/engine/plan/_attack-roll.ts) extracts the d20 + advantage resolution + Halfling Luck reroll + Bless/Bane bonus dice + crit-threshold math. Caller passes pre-resolved advantage state, attack bonus, target AC, and effect-stack queries (`hasHalflingLuck()`, `bonusDiceFor('attack', facts)`, `critThreshold()`); helper runs the dice. `forceCritIfHit?: boolean` carries the Paralyzed/Unconscious melee-auto-crit rule from both call sites.

Both [src/engine/plan/attack.ts:993](../../src/engine/plan/attack.ts#L993) (weapon, behavior-preserving) and [src/engine/plan/cast-spell.ts:569](../../src/engine/plan/cast-spell.ts#L569) (spell, behavior-adding) now route through the helper. Spell attacks gain four pre-existing weapon-only behaviors, all RAW:
- Halfling Luck reroll on nat-1 spell attacks
- Bless / Bane bonus dice on the spell attack roll (event now stamps `bonusDice` field too)
- Extended crit ranges (Improved Critical 19+)
- Melee spell attacks auto-crit Paralyzed / Unconscious / HP-0 targets (Shocking Grasp et al.)

**Tests** ([tests/unit/engine/slice-611-shared-attack-roll.test.ts](../../tests/unit/engine/slice-611-shared-attack-roll.test.ts), 2 cases): Halfling-caster spell attack rerolls on nat 1; Shocking Grasp on Paralyzed target auto-crits on hit.

**Verification:** 486 files / 3267 tests pass. Slice 601-603 tests unchanged. RNG stream for spell attacks shifts when Halfling Luck or Bless is involved — tracked for slice 617's RNG-versioning doc.

**Audit:**
- DRY: 50-line duplication gone; one helper, two callers.
- Names: helper file `_attack-roll.ts` matches `_halfling-luck` / `_bonus-dice` / `_save-roll` internal-helper convention.
- Magic numbers: none added.
- Pattern-check: swept `rollDie(D20_SIDES` across `src/engine/plan/`; remaining sites are save-side (use `_save-roll.ts`) or wrap `planAttack` (pick up the helper transitively). **`planOffHandAttack` still has its own d20 site** — same shape, would benefit from routing through `resolveAttackRoll` too; tracked as open follow-up since offhand has additional two-weapon-fighting gating not in slice 611's scope.

---
