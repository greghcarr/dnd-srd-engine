# Archive: slices 576-579

The L1-RAW Option-C closure mid-cohort: auto-fail save consumption (the load-bearing residual drift); the `consumeOnCheck` + `consumeOnSave` primitives unlocking `planBardicInspiration` and closing the slice-571 Help-on-check deferral; `planLayOnHands` for Paladin L1 BA heal-or-cure-poison; and the four thin action planners (Search / Study / Influence / Utilize) wrapping `planAbilityCheck` with the right action-economy consumption.

Evicted from the live CHANGELOG in slice 586 (active-cycle-only headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Engine (slice 579): four thin action planners — Search / Study / Influence / Utilize**

Closes the four deferred-by-design L1 actions from the deep audit's missing-planner list. Each is a thin wrapper around `planAbilityCheck` that adds the action-economy consumption RAW prescribes. Pre-slice the consumer had to manually bundle `ActionEconomyConsumed { kind: 'action' }` + `planAbilityCheck` — workable but error-prone.

RAW (PHB 2024 ch.7 Actions):
- **Search**: "make a Wisdom check to discern something that isn't obvious" — Insight / Medicine / Perception / Survival.
- **Study**: "make an Intelligence check to study your memory, a book, a clue, or another source of knowledge" — Arcana / History / Investigation / Nature / Religion.
- **Influence**: "urge a monster to do something" — CHA check via Animal Handling / Deception / Intimidation / Performance / Persuasion.
- **Utilize**: "when an object requires your action for its use" — STR / DEX / INT check depending on the object.

**Shared helper** ([src/engine/plan/_action-check.ts](../../src/engine/plan/_action-check.ts)): `planActionCheck` factors the common skeleton — `assertActorCanAct`, encounter / on-turn gate, action-already-used check, `ActionEconomyConsumed { kind: 'action' }` emission, delegation to `planAbilityCheck` with shared `at`. Each of the four planners is a ~50-line file that supplies an ability default + a sensible skill default + the action label for error messages.

**Per-planner shapes** ([src/engine/plan/search.ts](../../src/engine/plan/search.ts), [study.ts](../../src/engine/plan/study.ts), [influence.ts](../../src/engine/plan/influence.ts), [utilize.ts](../../src/engine/plan/utilize.ts)):
- `planSearch({ characterId, skill?: Skill, dc?: number })` — defaults to WIS + perception.
- `planStudy({ characterId, skill?, dc? })` — defaults to INT + investigation.
- `planInfluence({ characterId, skill?, dc? })` — defaults to CHA + persuasion.
- `planUtilize({ characterId, ability?: AbilityScore, skill?, dc? })` — defaults to STR + no skill (object-specific).

**Wiring**: [src/engine/plan/index.ts](../../src/engine/plan/index.ts) (4 re-exports), [src/engine/index.ts](../../src/engine/index.ts) (4 imports + 4 interface methods + 4 impls), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (4 `Search/Study/Influence/Utilize` dispatch entries).

**Tests** ([tests/unit/engine/slice-579-thin-action-planners.test.ts](../../tests/unit/engine/slice-579-thin-action-planners.test.ts), 11 cases): per-planner default ability + skill + DC; per-planner skill override (RAW alternative); shared validation (double-Action throws; Incapacitated throws; out-of-encounter use bypasses the action-economy event).

**Audit:**
- **Names:** the 4 planners follow `plan<ActionName>` naming convention; `_action-check.ts` is private (underscore-prefixed file naming); `ActionCheckIntent` mirrors `AbilityCheckIntent` shape.
- **DRY:** the shared `planActionCheck` helper eliminates the 4-line action-consume boilerplate. 4 planner files each ~30-50 lines (the file is mostly the RAW comment).
- **SRP:** one shared helper + four planner files + four wirings. Zero schema or content changes.
- **Magic numbers:** none.
- **at-threading:** `planActionCheck` resolves `at` once (`intent.at ?? nowIso()`) and passes through to both `ActionEconomyConsumed` and the delegated `planAbilityCheck` call (via the `at` field on AbilityCheckIntent — slice 539's per-intent override).
- **Mechanical outcomes asserted:** 11 cases (4 planners × default/override + 3 shared-validation).

**Pattern-check:** `planActionCheck` consolidates a pattern duplicated in 10+ planners (each carries the action-economy consume block inline). Future refactor optional; existing inline patterns aren't broken.

---

**Engine (slice 578): planLayOnHands — Paladin L1 BA heal-or-cure-poison**

Closes the Paladin L1 deferred-planner gap from the deep audit. Pre-slice the pack granted the `lay-on-hands` resource (`max: 5 × paladin level`, `recharge: 'longRest'`) but no planner existed to spend it. The consumer had to manually emit ResourceSpent + Healed; the BA gate, the pool validation, and the cure-poison mode were unreachable.

RAW (PHB 2024 Paladin L1, Lay On Hands):
> "You have a pool of healing power that replenishes when you finish a Long Rest. With that pool, you can restore a total number of Hit Points equal to five times your Paladin level. As a Bonus Action, you can touch a creature (which could be yourself) and draw power from the pool of healing to restore a number of Hit Points to that creature, up to the maximum amount remaining in the pool. You can also expend 5 Hit Points from the pool of healing power to remove the Poisoned condition from the creature; those points don't also restore Hit Points to the creature."

**Planner** ([src/engine/plan/lay-on-hands.ts](../../src/engine/plan/lay-on-hands.ts)): `planLayOnHands({ paladinId, targetId, mode: 'heal' | 'cure-poison', amount? })`. Validates `assertActorCanAct`, Paladin class membership, lay-on-hands resource sufficiency, mode-specific constraints (heal needs `amount >= 1`; cure-poison needs pool >= 5 AND target carries `poisoned`). Touch range consumer-managed (engine doesn't track positions). Consumes 1 Bonus Action (in-encounter on Paladin's turn).

**Event emission:**
- Mode `heal`: ActionEconomyConsumed(bonusAction) + ResourceSpent(amount) + Healed(amount).
- Mode `cure-poison`: ActionEconomyConsumed(bonusAction) + ResourceSpent(5) + ConditionRemoved(poisoned). **No Healed event** — RAW: "those points don't also restore Hit Points."

**Wiring**: [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts) (interface + import + impl), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`LayOnHands` dispatch).

**Tests** ([tests/unit/engine/slice-578-lay-on-hands.test.ts](../../tests/unit/engine/slice-578-lay-on-hands.test.ts), 9 cases): heal flows (heal another, heal self, over-pool throws, zero-amount throws); cure-poison flows (removes condition without Healed, insufficient pool throws, non-poisoned target throws to prevent waste); non-Paladin throws; Incapacitated Paladin can't use it.

**Audit:**
- **Names:** `LayOnHandsMode = 'heal' | 'cure-poison'` is the intent's discriminant; `CURE_POISON_COST = 5` extracted as a constant.
- **DRY:** the two modes share the validation prologue (Paladin, resource, target) but diverge in event emission. Not factored further — each mode is ~8 lines.
- **SRP:** one planner file (~150 lines); no schema or content changes (the resource is already granted by the existing Paladin L1 feature).
- **Magic numbers:** `CURE_POISON_COST = 5` extracted; the pool max (5 × Paladin level) is set by the existing GrantResource declaration in the pack.
- **at-threading:** single `nowIso()` per planner; all emitted events share the same `at`.
- **Mechanical outcomes asserted:** 9 cases covering both modes + 5 negative paths.

**Pattern-check:** Lay on Hands is the canonical "pool-spend BA heal" planner shape. Future similar features (a homebrew "Channel Divinity: heal pool") would reuse the same skeleton. The cure-poison mode's "no Healed event" RAW arm is a subtle correctness point — earlier audits had assumed naive `ResourceSpent + Healed(5)` which would over-grant HP.

---

**Engine + content (slice 577): consumeOnCheck + consumeOnSave primitives, planBardicInspiration, Help (Ability Check) closure**

Closes three deferred items in one slice — all three coupled because the new primitives unblock the Bardic Inspiration die and incidentally fix the slice-571 Help-on-check RAW deviation.

**1. New condition primitives** ([src/schemas/content/condition.ts](../../src/schemas/content/condition.ts)):
- `consumeOnCheck: boolean` — mirror of `consumeOnAttack` at the `AbilityCheckRolled` site. RAW user: Help (Ability Check mode) "advantage on THAT ability check"; Bardic Inspiration on a check.
- `consumeOnSave: boolean` — mirror at the `SaveRolled` site. RAW user: Bardic Inspiration on a save.

The existing `buildConsumeOnAttackRemovals` shape isn't shared; the consume-on-check and consume-on-save sites are simpler (no source-keying alternatives, no per-condition multi-target gating — bearers' rolls consume the condition regardless of source). Wired in [src/engine/plan/checks.ts](../../src/engine/plan/checks.ts) `planAbilityCheck` and `planSave`: post-roll, walk the bearer's `appliedConditions` and emit `ConditionRemoved` for any whose definition has the corresponding consume flag.

**2. planBardicInspiration** ([src/engine/plan/bardic-inspiration.ts](../../src/engine/plan/bardic-inspiration.ts)): Bard L1 bonus-action confer-die-to-ally. Validates Bard class, non-self recipient, resource > 0; consumes 1 `bardic-inspiration` use + 1 Bonus Action (in-encounter on Bard's turn); emits `ConditionApplied` for `bearing-bardic-inspiration` on the recipient. The condition (also new in this slice) carries `consumeOnAttack + consumeOnSave + consumeOnCheck + autoExpiry { afterRounds: 100, trigger: 'turnEnd' }` (10-minute approximation of RAW duration) and three `AddBonusDie 1d6` entries (one per roll-target — attack / save / check). The first roll of any of the three consumes the condition (RAW: "Once the d20 is rolled, the die is lost").

**Documented RAW deviation**: L1 die is fixed `1d6`; per-tier scaling (d8 at L5, d10 at L10, d12 at L15) is content-side and deferred — a future slice can add `bearing-bardic-inspiration-d8` etc. variants with OfferChoice over the Bard's level table. Also: sourceCharacterId intentionally omitted on the BI `ConditionApplied` event so the consume primitives treat it as Sap-style any-roll (not Vex-style source-keyed); transcript link to "who conferred" comes from the `ResourceSpent { characterId: bard }` companion event.

**3. Help (Ability Check) consume closure** — slice 571 noted: "the engine does NOT enforce 'consumed on first check' (no consumeOnCheck primitive yet)." With the new primitive, [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)'s `helped-on-check-active` gains `consumeOnCheck: true`. The bearer's first ability check now consumes the condition (RAW: "on THAT ability check" — singular).

**Wiring**: [src/engine/plan/index.ts](../../src/engine/plan/index.ts) (re-export), [src/engine/index.ts](../../src/engine/index.ts) (Engine.plan.bardicInspiration + import + interface), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`BardicInspiration` dispatch).

**Tests** ([tests/unit/engine/slice-577-bardic-inspiration.test.ts](../../tests/unit/engine/slice-577-bardic-inspiration.test.ts), 10 cases): pack declarations for both conditions; planBardicInspiration confers + emits ResourceSpent + applies condition; self-confer / non-Bard / depleted-resource throw; consume on first attack / first save / first check; helped-on-check-active is consumed after first check (slice 571 deviation closed).

**Doc counts**: conditions 142 → 143 (rider 127 → 128). Updated in getting-started.md / status.md (×2 rows) / starter-pack-gaps.md.

**Audit:**
- **Names:** `consumeOnCheck` / `consumeOnSave` mirror the existing `consumeOnAttack` / `consumeOnIncomingAttack` naming axis. `bearing-bardic-inspiration` matches the `bearing-X` convention used by other recipient-side buffs.
- **DRY:** the three planners now each carry a small `for...of appliedConditions` post-roll consume block. Not factored into a shared helper because each planner's event-emission shape is different (AttackRolled emits in a chain; AbilityCheckRolled + SaveRolled emit standalone).
- **SRP:** schema adds 2 optional fields; condition primitives wire is ~8 lines per planner; new planner is ~120 lines (Bardic Inspiration with the action-economy + resource + condition chain); new condition is one JSON object.
- **Magic numbers:** none added. 100-round autoExpiry is a documented approximation (10 minutes), not a magic constant.
- **at-threading:** single `nowIso()` per planner; the consume-removed events share the same `at`.
- **Mechanical outcomes asserted:** 10 cases covering both primitives + all three consume sites + the slice-571 deviation.

**Pattern-check:** `consumeOnCheck` / `consumeOnSave` complete the trio (attack / check / save) for one-shot riders. Future conditions following the slice-577 pattern (Inspiration, Divine Favor's "next attack," etc.) reuse these primitives. The slice-571 Help-on-check note in its CHANGELOG entry is now obsolete (deferred → closed); a future cleanup pass can revise that prose.

---

**Engine (slice 576): auto-fail save consumption — the load-bearing residual L1 RAW drift**

Closes the only Medium-impact item from the post-closure audit. Pre-slice the pack carried `SetAdvantage { on: { kind:'save', ability:'STR'|'DEX' }, mode: 'auto-fail' }` entries on Paralyzed / Stunned / Petrified / Unconscious (verified by slice 567's pack-declaration tests). The `EffectAccumulator` ([src/effects/builder.ts:81](../../src/effects/builder.ts#L81)) tracked `autoFail` per ability. **But** [src/derive/save.ts:174-175](../../src/derive/save.ts#L174-L175) only exposed `hasAdvantage` / `hasDisadvantage`; neither save planner (`planSave` or `rollSaveAgainstDC`) consumed the auto-fail flag. A Stunned target rolling a STR save could still succeed — a real RAW deviation surfaced in slice 575's documentation block.

**Derive change** ([src/derive/save.ts](../../src/derive/save.ts)): `SaveResult` gains `hasAutoFail: boolean`. The computation reads `adv.autoFail` from the EffectAccumulator (which the builder already merges per-ability via the existing wildcard + specific-target logic from slice 258).

**Planner changes** (two save paths, both updated symmetrically):
- [src/engine/plan/_save-roll.ts](../../src/engine/plan/_save-roll.ts) (`rollSaveAgainstDC`): when `derivation.hasAutoFail` is true, the rolled d20 + modifiers are computed normally (so transcripts still show the roll), but `success` is forced to `false` and the breakdown gains an `{ source: 'auto-fail', value: 0 }` entry.
- [src/engine/plan/checks.ts](../../src/engine/plan/checks.ts) (`planSave`): identical wiring — the consumer-facing save planner mirrors the internal save-roll helper.

**Tests** ([tests/unit/engine/slice-576-auto-fail-save.test.ts](../../tests/unit/engine/slice-576-auto-fail-save.test.ts), 30 cases):
- Derive level: per-condition (paralyzed / stunned / petrified / unconscious) × per-ability (STR / DEX / CON / INT / WIS / CHA) — STR + DEX flag auto-fail, others don't (24 cases). Plus a healthy-character control (6 abilities × `hasAutoFail === false`).
- Planner level: 4 cases — each of the 4 conditions forces a STR or DEX save to fail despite STR/DEX 20 + L5 prof bonus + low DC. The breakdown contains `'auto-fail'`. Plus 1 control: Stunned CON save succeeds (RAW only auto-fails STR + DEX).

**Audit:**
- **Names:** `hasAutoFail` parallels the existing `hasAdvantage` / `hasDisadvantage` / `hasHalflingLuck` flags on `SaveResult`. The breakdown entry source is `'auto-fail'` (kebab-case matches `'cover (...)'` and other derive sources).
- **DRY:** the two save paths (`planSave` + `rollSaveAgainstDC`) get the same forced-failure logic. A future consolidation into a shared helper would be worth ~10 lines saved; not factored here because the two paths have slightly different rolled-bonus-dice plumbing.
- **SRP:** derive adds one flag; each planner adds one `if` + one breakdown entry. Reducer untouched (the SaveRolled event already exists; the breakdown entry just carries one more annotation).
- **Magic numbers:** none. The breakdown entry uses `value: 0` because auto-fail doesn't contribute a numerical modifier; the source name carries the semantic.
- **at-threading:** unchanged.
- **Mechanical outcomes asserted:** 30 cases — derive flag per condition × ability, planner force-fail for STR + DEX, normal resolution for CON / INT / WIS / CHA, healthy-character control.

**Pattern-check:** the EffectAccumulator tracks several flags (autoFail, autoCrit, halflingLuck) that may have un-consumed counterparts elsewhere in the engine. Slice 576 closes the save side; future slices can audit attack/check sides for similar drift. The slice-575 test comment that originally documented this drift is now obsolete (deferred → closed); a future cleanup pass can remove the explanatory block.
