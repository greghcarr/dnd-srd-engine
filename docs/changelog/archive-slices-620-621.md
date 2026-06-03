# Archive: slices 620-621

Two slices closing the L1 fuzz review concentration RAW work: slice 620 wired the trigger-dispatched rider-damage path (Hex, Hunter's Mark, smites) to roll the per-source CON save; slice 621 closed six missed DamageApplied emission sites + fixed the main-damage CON save to use post-rider state (no more double-break, no more wrong "failedSave" reason on drop-to-0) + added a permanent CI audit so future emission sites can't silently skip the helper.

Evicted from the live CHANGELOG in slice 625 (active-cycle headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Engine + tests (slice 621): concentration RAW closure — wire helper at 6 missed damage sites + use post-rider state on main-damage save + permanent coverage audit**

The slice-620 "do another round of 12" fuzz batch surfaced two distinct RAW deviations the slice 601-620 wiring missed:

1. **Six unwired DamageApplied emission sites.** The slice-614 audit-rigor pass *claimed* a clean sweep of every DamageApplied emitter, but the actual sweep was filter-shape-narrow (only checked `cast-spell.ts` and `attack.ts`). [src/engine/plan/dragonborn-breath.ts](../../src/engine/plan/dragonborn-breath.ts), [src/engine/plan/breath-weapon.ts](../../src/engine/plan/breath-weapon.ts) (monster breath), [src/engine/plan/movement.ts](../../src/engine/plan/movement.ts) (Thunder Step area damage), [src/engine/plan/paladins-smite.ts](../../src/engine/plan/paladins-smite.ts), [src/engine/plan/storms-thunder.ts](../../src/engine/plan/storms-thunder.ts) (Goliath retaliation), and [src/engine/plan/trap.ts](../../src/engine/plan/trap.ts) all emitted DamageApplied without rolling the per-source CON save RAW requires. Six sites: a concentrating target eating dragon breath, a trap's poison dart, or a paladin smite would never lose concentration.

2. **Stale-state main-damage CON save** (seeds 5003 + 5006 in the L1 fuzz batch). The main-damage `planConcentrationOnDamage` call in `attack.ts:1423` (and `cast-spell.ts` ×3) passed the pre-attack state + pre-attack `target` snapshot, missing two facts the helper needed: (a) whether a rider (Hex, Hunter's Mark) had already broken concentration this chain (→ double-break: rider broke via failedSave then main re-fired Broken(failedSave) idempotent-but-wrong), and (b) the target's post-rider HP (→ wrong-reason: main damage that *would* drop a post-rider HP=3 target to 0 saw stale HP=9, fell through to per-component save, failed → emitted `ConcBroken(failedSave)` when RAW says `'unconscious'`).

**Fix** ([src/engine/plan/attack.ts:1423](../../src/engine/plan/attack.ts#L1423), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts) ×3): pass `stateBeforeMainDamage = applyAll(state, [...rider+staged events])` and re-fetch the target from it. The helper now sees the rider already cleared `concentrationEffectId` (returns `[]` → no double-break) AND sees post-rider HP (`damageWouldDropTo0` fires the correct `'unconscious'` branch). Same shape applied to all 6 newly-wired sites.

**Permanent audit** ([tests/audit/concentration-save-coverage.test.ts](../../tests/audit/concentration-save-coverage.test.ts)): every `src/engine/plan/` file that emits `DamageApplied` must either call `planConcentrationOnDamage` or be allowlisted with a documented reason (currently only `concentration.ts` itself, which IS the helper). Promoted from "remember to sweep" to CI gate — this closes the filter-shape-narrow class of bug for good.

**Tests** ([tests/unit/engine/slice-621-conc-save-post-rider-state.test.ts](../../tests/unit/engine/slice-621-conc-save-post-rider-state.test.ts), 2 cases over 400-seed sweeps): (1) Hex rider + main Eldritch Blast on concentrating target emits at most ONE `ConcentrationBroken` (proves no double-break + proves post-rider state being used); (2) a chain never emits BOTH `failedSave` AND `unconscious` for the same target (proves the wrong-reason class is closed). Slice 620's test updated to filter for seeds where the rider's save passed (so both rider's + main's saves still fire — the slice 620 invariant), since the slice 621 fix correctly suppresses the second save when the first broke conc.

**Verification:** full suite green, tsc clean. The L1 fuzz seeds 5003 (double-break) and 5006 (wrong-reason) now produce RAW-correct transcripts.

**RNG impact:** breath weapon damage, trap damage, smite damage, and movement-zone damage on concentrating targets now consume an additional d20 per source. Same per-seed determinism shift class as slices 601 / 612 / 620 — tracked in [docs/determinism.md](../../docs/determinism.md) and [docs/breaking-changes-queued.md](../../docs/breaking-changes-queued.md).

**Audit:**
- Names: `stateBeforeMainDamage`, `targetAfterRiders`, `targetForConc`, `stateBeforeThisDamage`, `targetCharForConc` — each names a snapshot at a specific moment in the event chain. Variable boundary names are intentionally explicit; the bug here was conflating "raw state" with "state at this moment."
- DRY: every wire follows the same shape (compute pre-damage state, re-fetch target, call helper). Six sites, one pattern. The slice-621 comment block in each site cross-references attack.ts:1423 as the canonical example.
- SRP: `planConcentrationOnDamage` unchanged; only call sites adjusted to pass the right state. Audit file does one thing — pin the wiring.
- Magic numbers: none added.
- at-threading: each wire uses the planner's existing `at` value; no new clock reads.
- Mechanical outcomes asserted: (a) at most one `ConcentrationBroken` per attack chain per target; (b) `failedSave` and `unconscious` reasons never co-occur on the same target in one chain; (c) every DamageApplied emission site wires the helper or is allowlisted.
- Pattern-check: this audit IS the pattern-check, promoted to permanent CI guard. The slice-614 sweep that *claimed* clean coverage missed 6 sites because it only walked `cast-spell.ts` + `attack.ts` (filter-shape-narrow false negative — same class as the slice-264 SetAdvantage sweep that missed `ImposeDisadvantageOnAttackers` siblings). The audit walks every `.ts` file in `src/engine/plan/`; future emissions can't slip through.
- Tests: test 1 prevents double-break regressions; test 2 prevents wrong-reason regressions; audit prevents new unwired sites. Each test catches a specific named bug from the L1 fuzz batch.

**Closes** slice-614's *unintentionally false* claim "swept all DamageApplied emission sites" — that sweep was filter-shape-narrow. The audit now makes the claim mechanically verifiable.

---

**Engine (slice 620): trigger-dispatched rider damage triggers concentration save (closes the L1 fuzz review's bug)**

The L1 fuzz review (60 battles across `--vs pc`, `--vs monster`, `--mode 2v2`) surfaced one real bug the slice 601-612 wiring missed: OnEvent `AddDamage` riders (Hex, Hunter's Mark, Divine Smite, Searing Smite, any on-hit damage trigger) emit their own DamageApplied via `fireAddDamage` in [src/engine/triggers/dispatch.ts](../../src/engine/triggers/dispatch.ts), and that path didn't call `planConcentrationOnDamage`. Result: a Hex rider hitting a concentrating creature never triggered the per-damage-source CON save RAW requires.

RAW (PHB 2024 Concentration): "If you take damage from multiple sources, such as an arrow and a dragon's breath, you make a separate saving throw for each source of damage." Each rider IS a separate source.

**Changes** ([src/engine/triggers/dispatch.ts](../../src/engine/triggers/dispatch.ts)):
- `fireAddDamage` (line 235+) now calls `planConcentrationOnDamage` after emitting the rider's DamageApplied, with `applyAll(state, out)` so the helper sees the just-committed damage event when deciding whether the target would drop to 0.
- `fireAddDamageToAttacker` (the retaliation variant for Fire Shield / Armor of Agathys) gets the same wire — retaliation damage to the original attacker is also a separate source for concentration.

**Tests** ([tests/unit/engine/slice-620-rider-concentration-save.test.ts](../../tests/unit/engine/slice-620-rider-concentration-save.test.ts), 1 case): warlock with Hex hits a concentrating fighter with Eldritch Blast; both the Hex rider's DamageApplied AND the main spell's DamageApplied emit their own CON save (so `conSaves.length === damageApplieds.length`). Pre-slice only the main damage triggered a save.

**Verification:** the seed=4006 fuzz transcript that originally surfaced the bug now shows TWO CON saves (one for the 1 necrotic Hex rider, one for the 3 force main damage) where pre-slice it showed only one. Full suite green (493 files, 3330 tests). The RAW-correct outcome is now visible at every Hex / Hunter's Mark / smite hit.

**RNG impact:** rider hits on concentrating targets now consume an additional d20 per rider. Same per-seed determinism shift class as slices 601/602/611/612/614 — tracked in [docs/determinism.md](../../docs/determinism.md) and [docs/breaking-changes-queued.md](../../docs/breaking-changes-queued.md).

**Audit:**
- Names: `planConcentrationOnDamage` import in dispatch.ts; helper unchanged.
- DRY: reuses the slice 601/612 helper; no new save-rolling logic.
- SRP: trigger dispatch still owns rider firing; concentration save is delegated.
- Magic numbers: none added.
- Pattern-check: this is the THIRD wiring location for `planConcentrationOnDamage` (after slice 601's 8 main-damage sites and slice 612's 3 aura-tick sites). Swept the codebase for other `DamageApplied` emitters — `fireAddDamage` + `fireAddDamageToAttacker` were the only outstanding sites. Sweep clean.

**L1 fuzz review additional findings** (verified clean, no slices needed):
- Sap mastery → next-attack disadvantage fires correctly.
- Vex mastery → next-attack advantage + Sneak Attack chain fires correctly.
- Sneak Attack damage doubles on crit (1d6 → 2d6, observed in seed-4023).
- Disadvantage uses lower die; nat-20-with-disadvantage doesn't spuriously crit.
- Slice 601 / 602 / 603 / 604 / 605 / 611 / 612 / 618 all observably correct in real battles.

---
