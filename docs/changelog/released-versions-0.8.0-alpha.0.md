# Released versions: 0.8.0-alpha.0

Frozen release narrative for `0.8.0-alpha.0` (2026-06-07), evicted from the live [CHANGELOG.md](../../CHANGELOG.md) in slice 736 per the active-cycle invariant (the live file holds only the active cycle + the newest release). Sibling archives: [released-versions-0.7.0-alpha.0.md](released-versions-0.7.0-alpha.0.md), [released-versions-0.5.0-alpha.0.md](released-versions-0.5.0-alpha.0.md), [released-versions-0.4.0-alpha.0.md](released-versions-0.4.0-alpha.0.md), [released-versions-0.2.0-alpha.0.md](released-versions-0.2.0-alpha.0.md). Per-slice detail lives in the `slice-NNN.md` files alongside this one.

---

## 0.8.0-alpha.0 - 2026-06-07

**Release (slice 726): bump to 0.8.0-alpha.0**

Promotes the post-0.7.0 cohort (slices 712-725) to a tagged release. `package.json` + `package-lock.json` bump `0.7.0-alpha.0` → `0.8.0-alpha.0`; `SCHEMA_VERSION` stays 1 (the new events are additive, no persisted-shape change). Two headline cohorts:

- **L5 SRD complete** (slices 718-725): the marquee L5 mechanics (Extra Attack, 3rd/2nd-level slots, Uncanny Dodge, Stunning Strike, Sneak Attack 3d6) were already wired, so the cycle closed the real gaps — `RecoverResource` on a Short Rest activating Bard Font of Inspiration + Sorcerer Sorcerous Restoration (718), and the per-class L5 features: Cleric Sear Undead (720), Druid Wild Resurgence (721), Paladin Faithful Steed (722), Fighter Tactical Shift (723), Wizard Memorize Spell (724) — plus a Warlock invocation-count content fix (719). Two new additive events (`SpellSlotsRegained`, `PreparedSpellsChanged`). The CI-guarded "L5 SRD complete" floor audit is 24/24 and the fuzz matrix now covers L1-L5 (60 cells × 30 seeds = 1,800 battles per run).
- **Interactive-play affordances + Free Duel** (slices 713-717): enriched `engine.query.castableSpells` (castingTime / rangeFeet / target descriptor / resolves / concentration / multi-target `maxTargets`) + `legalSpellTargets` (713/716); `engine.query.bonusActions` + the generic `engine.plan.useOption` executor for the duel's Bonus Actions menu (714/715); and a `runBattle({ playerClass })` Free-Duel class pin on its own isolated RNG cursor (717). Plus a docs backlog slice (712).

**Breaking:** none. **Additive surface:** two new events (`SpellSlotsRegained`, `PreparedSpellsChanged`), new optional event fields (`ShortRestEnded.resourceDeltas`, `RecoverResource.limitedByResourceId`), new `engine.query.*` / `engine.plan.*` methods (`bonusActions`, `useOption`, `legalSpellTargets`, `wildResurgence`, `memorizeSpell`), and new exported types — all purely additive.

**RNG stream:** the new behavior is gated (L5 features fire only at L5+ / on the relevant arm) so sub-L5 and the default paths are byte-identical (golden + replay-equivalence + rng-capture unchanged); the L5 fuzz tier is new this cycle, so no prior per-seed transcript is pinned across the boundary. The Free-Duel class pin uses an isolated RNG cursor, so the seed-driven opponent + map are byte-identical with or without it.
Detail: [slice-726.md](slice-726.md).

**Tests/docs (slice 725): L5 SRD-complete floor audit + fuzz-to-L5**
New `tests/audit/srd-l5-complete.test.ts` (24 tests) pins the L5 floor: Extra Attack (5 martial classes), 3rd/2nd-level slots, Warlock pact level 3, and the per-class L5 features (slices 718-724). The fuzz matrix extends to L5 (`[1..5]`, 60 cells × 30 seeds = 1,800 battles). The five L5 stubs in gaps-class-features are annotated closed. Capstone of the L5 cycle. No engine change.
Detail: [slice-725.md](slice-725.md).

**Engine (slice 724): Wizard Memorize Spell (L5)**
New `engine.plan.memorizeSpell(state, { wizardId, removeSpellId, addSpellId })`: swap one prepared level-1+ spell for a non-prepared spellbook (knownSpells) spell, validated per RAW. Adds a `PreparedSpellsChanged` event (the first to mutate `preparedSpells`). The engine doesn't enforce prepared-spell counts, so this is the swap mechanic (short-rest timing consumer-driven). Completes the L5 stub set.
Detail: [slice-724.md](slice-724.md).

**Engine (slice 723): Fighter Tactical Shift (L5)**
`planSecondWind` now grants half-Speed no-provoke movement when a level-5+ fighter activates Second Wind as a Bonus Action — a `Disengaged{limitedToFeet}` event (the Rogue Withdraw primitive → `noProvokeMovementUpToFeet`). Gated on L5 + the bonus-action arm; sub-L5 and out-of-encounter Second Wind byte-identical (no RNG change).
Detail: [slice-723.md](slice-723.md).

**Content (slice 722): Paladin Faithful Steed (L5)**
The Paladin L5 `faithful-steed` feature now grants `GrantSpell{ find-steed, oncePerLongRest, CHA }`: Find Steed is always prepared (castable with a 2nd-level slot) and free-castable once per long rest, reusing the effectiveSpellList + free-cast machinery. Find Steed is an already-wired summon spell. Content-only.
Detail: [slice-722.md](slice-722.md).

**Engine (slice 721): Druid Wild Resurgence (L5)**
New `engine.plan.wildResurgence(state, { druidId, mode })`: `slot-to-wild-shape` expends a spell slot to regain a Wild Shape use when out of uses; `wild-shape-to-slot` expends a Wild Shape use to regain a level-1 slot, once per Long Rest (gate resource). Adds a `SpellSlotsRegained` event (standard-slot sibling of `PactSlotsRegained`). Both no-action; pure.
Detail: [slice-721.md](slice-721.md).

**Engine (slice 720): Cleric Sear Undead (L5)**
`planTurnUndead` now applies Sear Undead for a level-5+ cleric: one pooled roll of max(1, WIS mod) d8s of Radiant to each Undead that fails the Turn Undead save, through the normal mitigate + fatal-intercept pipeline. Emitted before the Frightened/Incapacitated conditions (which carry endsOnDamage) so it doesn't end the turn effect, per RAW. Gated on cleric L5; sub-L5 Turn Undead byte-identical.
Detail: [slice-720.md](slice-720.md).

**Content (slice 719): Warlock Eldritch Invocation count labels match SRD 5.2.1**
The L5 audit found the Warlock invocations-known labels were drifted (L5 read "4 known"; SRD is 5). Corrected the whole column's `name` labels to the SRD values (L1 1, L2 3, L5 5, L7 6, L9 7, L12 8, L15 9, L18 10); ids keep their suffixes (load-bearing). Display-only — the per-tier invocation gain/replace system is still unwired (tracked in gaps-class-features). No engine change.
Detail: [slice-719.md](slice-719.md).

**Engine (slice 718): wire RecoverResource on a Short Rest (L5 Font of Inspiration + Sorcerous Restoration)**
`RecoverResource` was a no-op, so two L5 features were inert. `planShortRest` now resolves `RecoverResource{when:'shortRest'}` effects into `resourceDeltas` on the `ShortRestEnded` event and the reducer applies them: Bard Font of Inspiration regains all Bardic Inspiration on a short rest; Sorcerer Sorcerous Restoration regains floor(level/2) Sorcery Points once per long rest (new `limitedByResourceId` gate + half-level Formula; corrects the prior flat amount). Plan/commit-pure, backward-compatible `planShortRest`. First L5-SRD-complete slice.
Detail: [slice-718.md](slice-718.md).

**Fuzz harness (slice 717): Free Duel class pin (`playerClass`)**
`runBattle`'s `FuzzBattleOptions` gains `playerClass?: string` — a valid `CLASS_POOLS` classId builds team A[0] (the duel's player) as that class; unknown/unset stays random. The pin uses an isolated RNG cursor so the seed-driven opponent + tactical map are byte-identical with or without it (class is an independent axis from the seed), and A[0] levels via the same `levelUpTo` path as everyone else. Default path byte-identical; no engine API change.
Detail: [slice-717.md](slice-717.md).

**Engine (slice 716): spell-targeting refinements — multi-target maxTargets**
`castableSpells.target` + `legalSpellTargets` now report real `maxTargets` for multi-target spells, derived from the spell's own mechanics (beam-scaling cantrips like Eldritch Blast → 1/2/3/4 by character level; `auto-hit` darts like Magic Missile → 3 at slot 1, +1 per slot above), matching the cast-spell gate; `legalSpellTargets` recomputes per chosen slot. Exact AOE cone aiming was resolved as consumer scope (engine-scope.md: area cell selection is the app's spatial query). Additive; no new export.
Detail: [slice-716.md](slice-716.md).

**Engine (slice 715): complete the bonus-action surface**
`engine.plan.useOption` grows a `{ targetId, amount, weaponInstanceId }` param bag (`amount` for Lay on Hands heal, `weaponInstanceId` for Flurry of Blows) and `bonusActions` adds five options: `lay-on-hands-heal`, `flurry-of-blows`, `adrenaline-rush` (Orc), `nimble-escape-disengage` / `nimble-escape-hide` (Goblin). Frenzy was reclassified as a Rage modifier (not a bonus action) and is intentionally not enumerated. Additive; reuses the existing planners; closes the slice-714 bonus-action deferrals.
Detail: [slice-715.md](slice-715.md).

**Engine (slice 714): bonus-action affordances — bonusActions + useOption**
New `engine.query.bonusActions(state, encounterId, combatantId)` enumerates the bonus-action features a combatant owns (Second Wind, Rage, Cunning Action, Patient Defense / Step of the Wind ± Focus, Bardic Inspiration, Lay on Hands cure-poison), each flagged `enabled` with a machine-readable `reason` and a `target` kind; new `engine.plan.useOption(state, { combatantId, optionId, targetId? })` is a generic executor that maps an option id to its dedicated planner (no per-feature wiring in the UI). Pure/read-only enumeration; dispatch reuses the existing planners (one shared dispatch table) so behavior is byte-identical and dice route through the slice-704 RollProvider. So the dnd-web duel renders + performs a Bonus Actions menu without reimplementing rules.
Detail: [slice-714.md](slice-714.md).

**Engine (slice 713): spell affordances — enriched castableSpells + legalSpellTargets**
`engine.query.castableSpells` entries now carry UI-driving metadata read from spell content (`castingTime`, `rangeFeet`, a discriminated `target` descriptor, `resolves` + `saveAbility`, `concentration`); new `engine.query.legalSpellTargets(state, encounterId, casterId, spellId, slotLevel)` returns the legal targets at a slot honoring range + line of effect (self / creatures+candidates / AOE points). Pure, deterministic, additive; `legalTargets` byte-identical. So the dnd-web Spells menu buckets + targets without parsing spell text.
Detail: [slice-713.md](slice-713.md).

**Docs (slice 712): queue the L4-cycle follow-ups in the deferred-primitives backlog**
Adds three rows to [docs/gaps-deferred-primitives.md](../gaps-deferred-primitives.md) that were recorded only in per-slice changelogs: the L4 ASI-menu feat-eligibility filter (707), the ASI "+1 to two" distinctness guard (703), and the three residual base-vs-effective ability-modifier derive sites (710). No source change.
Detail: [slice-712.md](slice-712.md).

**Release (slice 711): bump to 0.7.0-alpha.0**
Promotes the post-0.6.0 cohort (slices 702-710) to a tagged release: L4 SRD-completeness and the interactive-play public seams, plus the audit-found effective-ability-score fix. No engine-API breaking change; `SCHEMA_VERSION` stays 1; positionless `'none'` byte-identical.
Detail: [slice-711.md](slice-711.md).
