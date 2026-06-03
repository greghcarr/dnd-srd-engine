# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

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

**Engine + tests (slice 621): concentration RAW closure — wire helper at 6 missed damage sites + use post-rider state on main-damage save + permanent coverage audit**

The slice-620 "do another round of 12" fuzz batch surfaced two distinct RAW deviations the slice 601-620 wiring missed:

1. **Six unwired DamageApplied emission sites.** The slice-614 audit-rigor pass *claimed* a clean sweep of every DamageApplied emitter, but the actual sweep was filter-shape-narrow (only checked `cast-spell.ts` and `attack.ts`). [src/engine/plan/dragonborn-breath.ts](src/engine/plan/dragonborn-breath.ts), [src/engine/plan/breath-weapon.ts](src/engine/plan/breath-weapon.ts) (monster breath), [src/engine/plan/movement.ts](src/engine/plan/movement.ts) (Thunder Step area damage), [src/engine/plan/paladins-smite.ts](src/engine/plan/paladins-smite.ts), [src/engine/plan/storms-thunder.ts](src/engine/plan/storms-thunder.ts) (Goliath retaliation), and [src/engine/plan/trap.ts](src/engine/plan/trap.ts) all emitted DamageApplied without rolling the per-source CON save RAW requires. Six sites: a concentrating target eating dragon breath, a trap's poison dart, or a paladin smite would never lose concentration.

2. **Stale-state main-damage CON save** (seeds 5003 + 5006 in the L1 fuzz batch). The main-damage `planConcentrationOnDamage` call in `attack.ts:1423` (and `cast-spell.ts` ×3) passed the pre-attack state + pre-attack `target` snapshot, missing two facts the helper needed: (a) whether a rider (Hex, Hunter's Mark) had already broken concentration this chain (→ double-break: rider broke via failedSave then main re-fired Broken(failedSave) idempotent-but-wrong), and (b) the target's post-rider HP (→ wrong-reason: main damage that *would* drop a post-rider HP=3 target to 0 saw stale HP=9, fell through to per-component save, failed → emitted `ConcBroken(failedSave)` when RAW says `'unconscious'`).

**Fix** ([src/engine/plan/attack.ts:1423](src/engine/plan/attack.ts#L1423), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts) ×3): pass `stateBeforeMainDamage = applyAll(state, [...rider+staged events])` and re-fetch the target from it. The helper now sees the rider already cleared `concentrationEffectId` (returns `[]` → no double-break) AND sees post-rider HP (`damageWouldDropTo0` fires the correct `'unconscious'` branch). Same shape applied to all 6 newly-wired sites.

**Permanent audit** ([tests/audit/concentration-save-coverage.test.ts](tests/audit/concentration-save-coverage.test.ts)): every `src/engine/plan/` file that emits `DamageApplied` must either call `planConcentrationOnDamage` or be allowlisted with a documented reason (currently only `concentration.ts` itself, which IS the helper). Promoted from "remember to sweep" to CI gate — this closes the filter-shape-narrow class of bug for good.

**Tests** ([tests/unit/engine/slice-621-conc-save-post-rider-state.test.ts](tests/unit/engine/slice-621-conc-save-post-rider-state.test.ts), 2 cases over 400-seed sweeps): (1) Hex rider + main Eldritch Blast on concentrating target emits at most ONE `ConcentrationBroken` (proves no double-break + proves post-rider state being used); (2) a chain never emits BOTH `failedSave` AND `unconscious` for the same target (proves the wrong-reason class is closed). Slice 620's test updated to filter for seeds where the rider's save passed (so both rider's + main's saves still fire — the slice 620 invariant), since the slice 621 fix correctly suppresses the second save when the first broke conc.

**Verification:** full suite green, tsc clean. The L1 fuzz seeds 5003 (double-break) and 5006 (wrong-reason) now produce RAW-correct transcripts.

**RNG impact:** breath weapon damage, trap damage, smite damage, and movement-zone damage on concentrating targets now consume an additional d20 per source. Same per-seed determinism shift class as slices 601 / 612 / 620 — tracked in [docs/determinism.md](docs/determinism.md) and [docs/breaking-changes-queued.md](docs/breaking-changes-queued.md).

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

The L1 fuzz review (60 battles across `--vs pc`, `--vs monster`, `--mode 2v2`) surfaced one real bug the slice 601-612 wiring missed: OnEvent `AddDamage` riders (Hex, Hunter's Mark, Divine Smite, Searing Smite, any on-hit damage trigger) emit their own DamageApplied via `fireAddDamage` in [src/engine/triggers/dispatch.ts](src/engine/triggers/dispatch.ts), and that path didn't call `planConcentrationOnDamage`. Result: a Hex rider hitting a concentrating creature never triggered the per-damage-source CON save RAW requires.

RAW (PHB 2024 Concentration): "If you take damage from multiple sources, such as an arrow and a dragon's breath, you make a separate saving throw for each source of damage." Each rider IS a separate source.

**Changes** ([src/engine/triggers/dispatch.ts](src/engine/triggers/dispatch.ts)):
- `fireAddDamage` (line 235+) now calls `planConcentrationOnDamage` after emitting the rider's DamageApplied, with `applyAll(state, out)` so the helper sees the just-committed damage event when deciding whether the target would drop to 0.
- `fireAddDamageToAttacker` (the retaliation variant for Fire Shield / Armor of Agathys) gets the same wire — retaliation damage to the original attacker is also a separate source for concentration.

**Tests** ([tests/unit/engine/slice-620-rider-concentration-save.test.ts](tests/unit/engine/slice-620-rider-concentration-save.test.ts), 1 case): warlock with Hex hits a concentrating fighter with Eldritch Blast; both the Hex rider's DamageApplied AND the main spell's DamageApplied emit their own CON save (so `conSaves.length === damageApplieds.length`). Pre-slice only the main damage triggered a save.

**Verification:** the seed=4006 fuzz transcript that originally surfaced the bug now shows TWO CON saves (one for the 1 necrotic Hex rider, one for the 3 force main damage) where pre-slice it showed only one. Full suite green (493 files, 3330 tests). The RAW-correct outcome is now visible at every Hex / Hunter's Mark / smite hit.

**RNG impact:** rider hits on concentrating targets now consume an additional d20 per rider. Same per-seed determinism shift class as slices 601/602/611/612/614 — tracked in [docs/determinism.md](docs/determinism.md) and [docs/breaking-changes-queued.md](docs/breaking-changes-queued.md).

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

**Tests (slice 619): CI-guarded "L1 SRD complete" floor audit**

Companion to slice 574's `srd-l1-invariants.test.ts` (hit dice + spell-slot table + ability-score bounds). This audit goes broader: it locks in the surface area that constitutes "a complete L1 SRD experience" so a future slice can't silently drop a class feature, a species, a background's origin feat, or a RAW condition.

**Pinned** ([tests/audit/srd-l1-complete.test.ts](tests/audit/srd-l1-complete.test.ts), 41 cases — one per invariant so a regression names the exact dropped piece):

1. **Per-class L1 feature ids present** — each of the 12 SRD classes has its canonical L1 feature ids (e.g., Fighter: `second-wind`, `fighting-style-fighter`, `weapon-mastery-fighter`; Barbarian: `rage`, `unarmored-defense-barbarian-feature`, `weapon-mastery-barbarian`; etc.). 12 cases.
2. **All 9 SRD species** present with non-empty `traits`. 9 cases.
3. **All 4 SRD backgrounds** present with an `originFeatId` that resolves to a feat in the pack. 4 cases.
4. **All 15 RAW conditions** ship under their canonical ids. 15 cases.
5. **Slice 618 OfferCharacterChoices cascade** works for a fresh L1 Fighter — emits Fighting Style ChoiceRequired with the 6 SRD options (`archery`, `defense`, `dueling`, `great-weapon`, `protection`, `two-weapon`). 1 case.

**Intentionally NOT pinned** (already guarded elsewhere or volatile):
- Numerical counts (test totals, mechanical-wiring percentages, spell-bucket splits) — guarded by `doc-counts`, `gaps-spells-counts`, and the per-spell `spell-coverage.test.ts`.
- Hit dice + spell slots + ability scores — already in `srd-l1-invariants.test.ts`.

**Verification:** 492 files / 3329 tests pass.

**Audit:**
- Names: `REQUIRED_L1_FEATURES`, `REQUIRED_SPECIES`, `REQUIRED_BACKGROUNDS`, `RAW_CONDITIONS` — each carries the canonical id set as the source of truth.
- DRY: pulls counts from the pack; assertions per id rather than aggregate counts.
- SRP: one audit, one floor — content surface stability.
- Magic numbers: none added. The id lists are documentation pinned in code.
- Pattern-check: swept `tests/audit/` for similar coverage gaps. `phantom-fields`, `srd-drift`, `srd-l1-invariants`, `pack-integrity`, `doc-counts`, `coverage-ledger` all carry their own piece of the floor. This audit fills the "feature / species / background / condition presence" hole that none of the others covered.

When a future content edit intentionally renames or removes one of these ids, update both the content + this audit in the same slice — the audit's job is to make that update visible, not to block valid content evolution.

---

**Engine (slice 618): `engine.plan.offerCharacterChoices` — drain L1 OfferChoice entries on fresh characters**

Closes the docs/status.md-flagged gap and the headline "what's left for L1 SRD" item: fresh L1 characters built via `CharacterCreated` (not stepped through `planLevelUp`) didn't receive their L1 `OfferChoice` grants. Fighter L1 Fighting Style is the canonical user — its `OfferChoice when: 'onAcquire'` only fired through the level-up path, so a direct-built L1 Fighter never got a `ChoiceRequired` for their fighting style. Paladin / Ranger Fighting Style work because they're acquired on L1→L2 (which does go through planLevelUp).

**Changes:**
- New planner [src/engine/plan/offer-character-choices.ts](src/engine/plan/offer-character-choices.ts) walks the character's full effective effect stack (`collectEffectsFromCharacter`), filters for `OfferChoice when: 'onAcquire'`, and emits a `ChoiceRequired` event per choice not already pending or resolved for the character. Wired through `engine.plan.offerCharacterChoices({ characterId })`.
- Idempotency via `promptKey`: [src/schemas/runtime/pending-choice.ts](src/schemas/runtime/pending-choice.ts) gained an optional `promptKey` field (additive — no migration); [src/engine/reducers/level-up.ts:41-50](src/engine/reducers/level-up.ts#L41) `applyChoiceRequired` persists `event.promptKey` to the pending entry. The new planner dedupes by `promptKey`, so repeat calls (e.g. after later content additions) skip choices already in flight.
- Engine surface: added to the `Engine.plan` interface + factory at [src/engine/index.ts:364](src/engine/index.ts#L364). Routed onto `EXCLUDED_FROM_DISPATCH` in [tests/audit/planner-wiring.test.ts](tests/audit/planner-wiring.test.ts) (not a player-action, not part of the per-turn dispatch — it's a post-creation cascade).

**Tests** ([tests/unit/engine/slice-618-offer-character-choices.test.ts](tests/unit/engine/slice-618-offer-character-choices.test.ts), 4 cases): fresh L1 Fighter emits ChoiceRequired with the 6 SRD fighting-style options; committed pending choice has `promptKey: 'fighting-style-fighter'`; idempotent (second call returns nothing for the same choice); resolved choice stays suppressed on subsequent calls.

**Usage:**
```ts
campaign = commit(campaign, [{ type: 'CharacterCreated', snapshot: fighter, ... }]);
const { events } = engine.plan.offerCharacterChoices(campaign.state, { characterId: fighter.id });
campaign = commit(campaign, events); // ChoiceRequired now in pendingChoices for the consumer to resolve
```

**Verification:** 491 files / 3288 tests pass. tsc clean.

**Audit:**
- Names: `planOfferCharacterChoices`, `OfferCharacterChoicesIntent`, `promptKey` all intent-revealing.
- DRY: reuses `collectEffectsFromCharacter` (already expands `GrantFeat` references at the boundary). Idempotency check is one Set lookup per OfferChoice.
- SRP: planner does one thing — emit ChoiceRequired for unresolved `onAcquire` choices. Reducer change is minimal (one field copy).
- Magic numbers: none.
- Pattern-check: swept for other lifecycle moments where direct-built characters might miss content. `onLongRest` choices (resource picks at long rest) are handled by `planRest`. `onLevelUp` choices are handled by `planLevelUp`. `onAcquire` was the only unhandled moment for the CharacterCreated path; this slice closes it.

---

**Docs (slice 617): determinism doc + breaking-change queue + CHANGELOG entry template**

Three doc-shape gaps the slice-600 observer review surfaced + the slice 614 follow-up complaint about my own CHANGELOG verbosity:

1. **[docs/determinism.md](docs/determinism.md)** (new) — four-layer table covering what "deterministic" means in this engine. Replay equivalence is always stable; per-seed RNG is version-sensitive (slices 601/602/611/612/614 all changed RNG consumption patterns and per-seed transcripts from before the cycle no longer byte-match). Practical advice: snapshot resulting state + event log for cross-version regression testing, not just the seed.

2. **[docs/breaking-changes-queued.md](docs/breaking-changes-queued.md)** (new) — durable announcement queue for breaking changes that landed on `dev` after the most-recent release tag. Slice 603 (Produce Flame action-economy) is the first entry. The doc rolls into the next release's release notes; per-slice CHANGELOG entries flag "Breaking change" so contributors know to append. CLAUDE.md updated to point at it.

3. **CLAUDE.md "CHANGELOG entry shape"** section (new, in the existing Doc-updates-per-slice block) — standard template after the slice 601-616 cycle showed the entries trending verbose enough to force back-to-back archive operations (slices 593-598, 599-603, 604-610 all evicted within ~10 slices). Template caps entries at ~25-40 lines and pushes the "pre-slice the engine did X; now it does Y" narrative into the commit-message body.

**Files**: [docs/determinism.md](docs/determinism.md) (new), [docs/breaking-changes-queued.md](docs/breaking-changes-queued.md) (new), [CLAUDE.md](CLAUDE.md) (two sections updated).

**Verification:** doc-size + doc-links audits green (the new docs are well under the 60 KB ceiling; all internal links resolve). 490 files / 3284 tests pass.

**Audit:** doc-only slice; no engine work.
- Names: `determinism.md` and `breaking-changes-queued.md` self-describing.
- DRY: the determinism doc cross-references the per-slice CHANGELOG entries for specific RNG-impact details rather than restating each.
- Pattern-check: swept the repo for other places that promise "deterministic" without qualifying the layer. README and concepts.md both say "deterministic replay" / "byte-equivalent state" — those claims are LAYER 1 (replay equivalence), still true. Neither overpromises per-seed cross-version reproducibility. Sweep clean.

---

**Tooling (slice 616): LRU scrub cache — bound memory for long sessions**

Slice 610's scrub cache was unbounded — a 2000-event battle scrubbed exhaustively could hold ~2000 Campaign snapshots in memory. Acceptable for short sessions; risky for long ones. The slice-610 audit flagged this as an open follow-up.

**Changes** ([web/main.ts](web/main.ts)): `ScrubCache` upgraded from a bare `Map<number, Campaign>` to a `{ entries, pinned, maxSlots }` struct with LRU eviction. Cap defaults to `SCRUB_CACHE_MAX_SLOTS = 128` (~1-2 MB for typical L1 battles; small battles never hit it).

- `cacheGet` touches the entry on read by deleting + re-inserting (JS Map preserves insertion order, so MRU is at the tail).
- `cacheSet` evicts the LRU non-pinned entry when size exceeds cap. Pinned cursors (the genesis `0` and the end `totalEvents` anchors per session) never evict so from-start / from-end paths never re-replay.
- `startSession` pre-seeds both pinned anchors (cursor=0 via `buildScrubbed(full, 0, cache)`, cursor=total with the full campaign).

**Tests** ([tests/unit/web-scrub-cache.test.ts](tests/unit/web-scrub-cache.test.ts), now 5 cases): correctness (matches `replay()` at every cursor); referential cache hit on revisit; LRU eviction under cap pressure; pinned anchors survive eviction; MRU-touching keeps recently-accessed entries when newer cursors evict older ones.

**Verification:** tsc clean root + web/; vite boots without runtime errors. The 5-case test suite covers both correctness invariants from slice 610 and the new LRU semantics from slice 616.

**Audit:**
- Names: `ScrubCache`, `createScrubCache`, `cacheSet`, `cacheGet`, `SCRUB_CACHE_MAX_SLOTS`, `pinned` all intent-revealing.
- DRY: one cache helper handles both pin protection and LRU eviction; the production + test paths share the same algorithm.
- SRP: cache helpers do cache things; `buildScrubbed` still owns the replay-or-incremental path decision.
- Magic numbers: `SCRUB_CACHE_MAX_SLOTS = 128` named at top of file.
- Pattern-check: the cap doesn't break behavior — every cursor visited still returns a correct campaign, just with O(K) recompute on a cache miss instead of O(1) hit. Worst case: a cursor that was evicted gets re-walked from the nearest remaining prefix (still incremental, never full-genesis-replay unless ALL prefixes ≤ cursor were evicted).

---

**Tooling (slice 615): web polish — drop redundant placeholder text, team colors → CSS variables**

Two small cosmetic fixes from the slice-600 observer-review item list:

1. **Mid-scrub outcome placeholder** ([web/modes/fuzz-replay.ts](web/modes/fuzz-replay.ts)) said "Battle in progress (step N of M). Scrub to the end (⏭) to see the outcome." The transport directly above already shows "step N / M" — redundant. New copy: "Battle in progress — scrub to the end (⏭) to see the outcome."
2. **Team colors as CSS variables** ([web/styles.css](web/styles.css)): `--team-a-color: #4a89ff` and `--team-b-color: #e7553c` on `:root`; the four `.combatant.team-*` rules now reference the variables instead of inline hexes. A future theme override or palette change touches one declaration instead of four.

No engine work, no tests touched.

**Verification:** `tsc -p web/tsconfig.json` clean; `vite` boots without runtime errors.

**Audit (trivial slice):**
- Names: `--team-a-color` / `--team-b-color` mirror existing `--token-color` convention from the dropped grid-view.
- DRY: 4 hardcoded hexes collapse to 2 variable declarations.

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
