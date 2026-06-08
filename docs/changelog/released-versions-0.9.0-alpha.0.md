# Released versions: 0.9.0-alpha.0

Frozen release narrative for `0.9.0-alpha.0` (2026-06-07), evicted from the live [CHANGELOG.md](../../CHANGELOG.md) in slice 748 per the active-cycle invariant (the live file holds only the active cycle + the newest release). Sibling archives: [released-versions-0.8.0-alpha.0.md](released-versions-0.8.0-alpha.0.md), [released-versions-0.7.0-alpha.0.md](released-versions-0.7.0-alpha.0.md), [released-versions-0.5.0-alpha.0.md](released-versions-0.5.0-alpha.0.md), [released-versions-0.4.0-alpha.0.md](released-versions-0.4.0-alpha.0.md), [released-versions-0.2.0-alpha.0.md](released-versions-0.2.0-alpha.0.md). Per-slice detail lives in the `slice-NNN.md` files alongside this one.

---

## 0.9.0-alpha.0 - 2026-06-07

**Release (slice 736): bump to 0.9.0-alpha.0**

Promotes the post-0.8.0 cohort (slices 727-735) to a tagged release. `package.json` + `package-lock.json` bump `0.8.0-alpha.0` → `0.9.0-alpha.0`; `SCHEMA_VERSION` stays 1 (the cohort adds no new event types — every new mechanic reuses existing events / conditions, so a 0.9.0 consumer replays a 0.8.0 log unchanged). One headline cohort:

- **L6 SRD complete** (slices 727-735): every L6 row (base class + subclass) is now wired. Base classes — Fighter Ability Score Improvement (727), plus the already-present Rogue 2nd Expertise / Monk Empowered Strikes / Paladin Aura of Protection / rage·Channel-Divinity·Wild-Shape bumps / Ranger Roving. Subclasses — Barbarian Berserker Mindless Rage (728), Druid Land Natural Recovery (729), Warlock Fiend Dark One's Own Luck (730), Cleric Life Blessed Healer (731), Wizard Evoker Sculpt Spells (732), Bard Lore Magical Discoveries (733). The CI-guarded "L6 SRD complete" floor audit is 28/28 and the fuzz matrix now covers L1-L6 (72 cells × 30 seeds = 2,160 battles per run, slice 734). Slice 735 corrected a pre-existing edition drift: Monk Empowered Strikes now models the SRD 5.2.1 Force-damage choice instead of the 2014 "magical unarmed."

**Breaking:** none to the type surface. **Behavior change:** Monk L6 Empowered Strikes (slice 735) — a monk's unarmed strikes are no longer magical by default; instead the monk may opt a strike into Force damage. This is a RAW-correctness fix (2014 → SRD 5.2.1); the s207 golden was rewritten accordingly. **Additive surface:** three new effect kinds (`GrantBlessedHealer`, `GrantSculptSpells`, `GrantUnarmedForceOption`), a new condition (`mindless-rage-active`), new `engine.plan.*` methods (`naturalRecovery`, `darkOnesOwnLuck`), new optional intent fields (`CastSpellIntent.sculptedTargetIds`; `unarmedStrikeAsForce` on the attack / Flurry / off-hand intents), and the College of Lore L6 cross-list spell choice — all additive and opt-in.

**RNG stream:** the L6 features are gated (fire only at L6+ / on the relevant opt-in arm), and the Empowered Strikes Force option is opt-in, so default and sub-L6 paths are byte-identical (replay-equivalence + rng-capture unchanged). Goldens unchanged except the deliberately-rewritten s207. The L6 fuzz tier is new this cycle, so no prior per-seed transcript is pinned across the boundary.
Detail: [slice-736.md](slice-736.md).

**Engine (slice 735): Monk Empowered Strikes re-wired to SRD 5.2.1 (L6)**
New marker effect `GrantUnarmedForceOption`: the Monk L6 feature now models the SRD 5.2.1 Force-damage choice ("Whenever you deal damage with your Unarmed Strike, it can deal your choice of Force damage or its normal damage type") instead of the 2014 "magical unarmed" (`GrantUnarmedAsMagical`). Opt-in `unarmedStrikeAsForce` on the attack / Flurry / off-hand intents overrides an unarmed strike's damage type to Force when the bearer has the marker; inert by default. The s207 golden now shows Force sidestepping Stoneskin's B/P/S resistance. `GrantUnarmedAsMagical` stays an available primitive (no pack user). EFFECT_KINDS 66→67. Closes the slice-734 L6 drift follow-up.
Detail: [slice-735.md](slice-735.md).

**Tests/docs (slice 734): L6 SRD-complete floor audit + fuzz-to-L6**
New `tests/audit/srd-l6-complete.test.ts` (28 tests) pins the L6 floor: base-class L6 features (Fighter ASI, Rogue 2nd Expertise, Monk Empowered Strikes, Paladin Aura of Protection, more rage/Channel-Divinity/Wild-Shape uses, Ranger Roving), the eight subclass L6 features (slices 728-733 + 204/357), planner/effect-kind presence, a behavioral 5→6 level-up, and the spell-slot floor. The fuzz matrix extends to L6 (`[1..6]`, 72 cells × 30 seeds = 2,160 battles); `FUZZ_MAX_LEVEL` 5→6. Capstone of the L6 cycle — every L6 row is now wired. ~~**Known drift (tracked):** Monk Empowered Strikes carries 2014 "magical unarmed" semantics (`GrantUnarmedAsMagical`); the SRD 5.2.1 Force-damage-type choice is the one open L6 correctness follow-up.~~ **Closed by slice 735.** No engine change.
Detail: [slice-734.md](slice-734.md).

**Content (slice 733): Bard College of Lore Magical Discoveries (L6)**
The previously-absent College of Lore L6 row gains `magical-discoveries`: an `OfferChoice` (oneOf 2, onAcquire) whose 18 curated options each grant a Cleric/Druid/Wizard spell (cantrip–level 3) `always-prepared` — the cross-list learn shape from Pact of the Tome (slice 517). Granted spells are treated as known by the cast path, so a chosen Wizard spell (e.g. Fireball) casts as a Bard spell with the bard's CHA + slots. No new engine primitive; the replace-on-level-up arm stays consumer-driven.
Detail: [slice-733.md](slice-733.md).

**Engine (slice 732): Wizard Evoker Sculpt Spells (L6)**
New flag effect `GrantSculptSpells`: when an Evoker casts an Evocation save spell, `intent.sculptedTargetIds` names up to 1 + slot level creatures to exclude — each auto-succeeds and takes no damage (modeled as full exclusion: no save, no damage, no forced movement). Validated (feature/school/count/membership) and opt-in, so unsculpted casts are byte-identical. EFFECT_KINDS 65→66.
Detail: [slice-732.md](slice-732.md).

**Engine (slice 731): Cleric Blessed Healer (Life Domain L6)**
New flag effect `GrantBlessedHealer` (the `GrantMaxHealingDice` pattern): the cast-spell heal handler now self-heals the cleric 2 + slot level once when a slot heal lands on a creature other than the caster (cantrips/free casts excluded). EFFECT_KINDS 64→65.
Detail: [slice-731.md](slice-731.md).

**Engine (slice 730): Warlock Dark One's Own Luck (Fiend Patron L6)**
New `engine.plan.darkOnesOwnLuck(state, { warlockId })` → `{ events, d10 }`: spend a use (the `dark-ones-own-luck` resource, max CHA-mod, long-rest recharge) and roll a d10 the consumer folds into an ability check or saving throw (Hero Points shape; engine doesn't mutate the linked roll). No new event/condition.
Detail: [slice-730.md](slice-730.md).

**Engine (slice 729): Druid Natural Recovery slot recovery (Circle of the Land L6)**
New `engine.plan.naturalRecovery(state, { druidId, slots })`: recover expended spell slots on a short rest, combined level ≤ ceil(druid/2), no L6+, once per long rest (gated by the `natural-recovery` resource; reuses the slice-721 `SpellSlotsRegained` event). The free-Circle-spell-cast arm is deferred to the land-specific Circle Spells wiring.
Detail: [slice-729.md](slice-729.md).

**Engine (slice 728): Barbarian Mindless Rage (Berserker L6)**
`planRage` now applies a new `mindless-rage-active` condition (Charmed/Frightened immunity) alongside `raging` for a Berserker at L6+, and ends existing Charmed/Frightened on entering Rage. Reuses the `GrantConditionImmunity` + `isImmuneToCondition` gate; gated on subclass + level; non-Berserker / sub-L6 rage byte-identical. Conditions count 157→158.
Detail: [slice-728.md](slice-728.md).

**Content (slice 727): Fighter L6 Ability Score Improvement**
The Fighter's L6 row (previously empty) gains `ability-score-improvement-6` — the same OfferChoice as L4 (ASI feat or another general feat), reusing the level-up cascade. SRD gives the Fighter extra ASIs at 6/14 beyond the every-class 4/8/12/16. Opens the L6 SRD-complete cycle. Content-only.
Detail: [slice-727.md](slice-727.md).
