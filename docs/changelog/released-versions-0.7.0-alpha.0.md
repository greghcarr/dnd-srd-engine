# Released versions: 0.7.0-alpha.0

Frozen release narrative for `0.7.0-alpha.0` (2026-06-06), evicted from the live [CHANGELOG.md](../../CHANGELOG.md) in slice 726 per the active-cycle invariant (the live file holds only the active cycle + the newest release). Sibling archives: [released-versions-0.5.0-alpha.0.md](released-versions-0.5.0-alpha.0.md), [released-versions-0.4.0-alpha.0.md](released-versions-0.4.0-alpha.0.md), [released-versions-0.2.0-alpha.0.md](released-versions-0.2.0-alpha.0.md). Per-slice detail lives in the `slice-NNN.md` files alongside this one.

---

## 0.7.0-alpha.0 - 2026-06-06

**Release (slice 711): bump to 0.7.0-alpha.0**

Promotes the post-0.6.0 cohort (slices 702-710) to a tagged release. `package.json` + `package-lock.json` bump `0.6.0-alpha.0` → `0.7.0-alpha.0`; `SCHEMA_VERSION` stays 1 (no persisted-shape change). Two headline features plus an audit-found fix:

- **L4 SRD complete** (slices 702-703, 707-709): every class gains the Ability Score Improvement choice at L4 — the ASI feat (+2 one / +1 two ability scores, max 20) or another general feat, via the existing `GrantFeat` cascade — which also completed the SRD 5.2.1 feat catalog (17/17). Monk Slow Fall (already wired via `planFalling`), Fighter Second Wind 3 uses, and Sorcery/Focus Points → 4 round out the tier. The CI-guarded "L4 SRD complete" floor audit is 20/20, and the fuzz matrix now covers L1-L4 (48 cells × 30 seeds = 1,440 battles per run).
- **Interactive-play public seams** (slices 704-706; the A1/A2/A3 cohort for the dnd-web interactive viewer): `engine.query.*` intent-shaped affordance queries (legal move destinations / action economy / available actions / legal targets / castable spells); a die-typed, resumable `engine.withRollProvider` roll seam (`SeededRollProvider` / `SuppliedRollProvider` / `NeedRoll`) for player-entered physical dice; and the tactical enemy policy graduated from `scripts/` into `src/ai/` (barrel-exported `planTacticalMove` / `classifyTacticalRole`).
- **Fix** (slice 710): the derived character + AC now reflect effective ability scores (ASI / items / floors), not base.

**Breaking:** none ([docs/breaking-changes-queued.md](../breaking-changes-queued.md) was "(none queued)" at cut). **Behavior note (slice 710):** `engine.derive.character` / `buildCharacterSheet` ability modifiers now reflect EFFECTIVE ability scores instead of base, and `DerivedCharacter` gains an effective `abilityScores` field — a consumer that pinned the prior (buggy) base-derived modifiers will see corrected values. The `engine.query.*` / roll-provider / `src/ai` additions are purely additive.

**RNG stream:** positionless `'none'` fuzz (L1-L3) + golden transcripts + replay-equivalence + rng-capture are byte-identical — the A2 roll-provider seam is a no-op with no provider installed, and the L4 content changes a character's ability scores only via a post-level-up choice, not the combat RNG stream. L4 fuzz is new this cycle (slice 709), so no prior per-seed transcript is pinned across the boundary.

**Fix (slice 710): derived character + AC reflect effective ability scores (not base)**
The L4 audit found `computeDerivedCharacter.abilityModifiers` + `computeArmorAC`'s DEX used base scores, so ASI / Ioun Stones / Belt / floors didn't show in the derived character, character sheet, initiative, or light/medium/unarmored AC (saves/checks/attacks were already correct — an internal inconsistency). Both now use `effectiveAbilityScore`; `DerivedCharacter` gains an effective `abilityScores` field. Pattern-checked the rest; three minor edges (mirror-image dup AC, finesse ability-choice, a monster-only per-trait save) tracked. No event schema change.
Detail: [slice-710.md](slice-710.md).

**Tests (slice 709): extend the fuzz matrix to L4 (the L4 fuzz floor)**
Extends the fuzz matrix `LEVELS` from `[1,2,3]` to `[1,2,3,4]` — now 48 cells × 30 seeds = 1,440 battles per CI run. Each L4 fuzz character levels to 4 via `planLevelUp` + `drainPendingChoices`, exercising the slice-707 ASI choice cascade before fighting. All 1,440 complete without throwing. The L4 cycle's end-to-end runtime guard; the L4 floor audit (20/20) + this fuzz floor make L4 release-ready.
Detail: [slice-709.md](slice-709.md).

**Tests (slice 708): correct the L4 floor audit's Slow Fall planner reference**
Monk Slow Fall was already wired via `planFalling`'s `useSlowFall` arm (5 × monk level, Monk L4+, reaction-consuming, with a real fall-damage model); slice 702's floor audit wrongly assumed a separate `planSlowFall`. Points Section 6 at the real `planFalling` and drops the redundant duplicate (caught by the pack-integrity + planner-wiring audits). Closes the last L4 floor-audit xfail — **the L4 floor is now 20/20 green** (fuzz extension + release tag remain). No engine/content/schema change.
Detail: [slice-708.md](slice-708.md).

**Content (slice 707): the L4 Ability Score Improvement choice across all 12 classes**
Adds an `ability-score-improvement-4` feature to every class's L4 row: an OfferChoice granting the ASI feat (slice 703) or another general feat (Grappler) via `GrantFeat`, riding the existing level-up + cascade + derive machinery (no new primitive). Leveling 3→4 → pick ASI → +2/+1 → ability picker now moves the derived ability score. Flips the L4 floor audit's Section 1 (12) + Section 4; only Slow Fall (Section 6) remains. Per-character feat eligibility (Grappler's ability prereq) is a documented follow-up.
Detail: [slice-707.md](slice-707.md).

**Refactor (slice 706): graduate the tactical enemy policy to the package (interactive-play A3)**
Relocates the pure tactical movement policy (`planTacticalMove` / `classifyTacticalRole` / `pickByTotalOrder` + types) from `scripts/tactical/` into `src/ai/`, barrel-exported so a consumer imports it from the package instead of `scripts/`. `scripts/tactical/{policy,constants}.ts` become re-export shims, so the fuzz harness + its tests are byte-identical (golden tactical transcript + fuzz determinism unchanged). `pickIntent` / `makeTacticalMovePolicy` stay in scripts (fuzz-type-coupled). No behavior or schema change.
Detail: [slice-706.md](slice-706.md).

**Engine (slice 705): intent-shaped affordance query API (interactive-play A1)**
Adds `engine.query.*` (mirrors `engine.derive.*`): `legalMoveDestinations`, `actionEconomy`, `availableActions` (with machine-readable disabled reasons), `legalTargets`, `castableSpells` — pure, read-only, deterministically ordered, wrapping the existing pathing/terrain/action-economy/speed/spell-slot helpers so a UI renders affordances without reconstructing rules. No event schema change.
Detail: [slice-705.md](slice-705.md).

**Engine (slice 704): die-typed roll-provider seam (interactive-play A2)**
Adds a die-typed, resumable roll seam (`RollProvider` / `SeededRollProvider` / `SuppliedRollProvider` / `NeedRoll` / `withRollProvider`) so a consumer can supply player-entered physical dice while planning stays sync + pure. `rollDie` routes through an ambient provider; with none installed the default path is byte-identical (golden + replay-equivalence unchanged). No event schema change.
Detail: [slice-704.md](slice-704.md).

**Content (slice 703): the Ability Score Improvement feat (L4 core)**
Adds the SRD 5.2.1 ASI feat (General, Level 4+, repeatable): a two-tier OfferChoice (+2 one / +1 two, max 20) over `IncreaseAbilityScore`, riding the existing nested-OfferChoice cascade. ASI was the one missing SRD feat, so the SRD 5.2.1 feat catalog is now complete (17/17). Flips the L4 floor's Section 3 xfail.
Detail: [slice-703.md](slice-703.md).

**Tests (slice 702): CI-guarded "L4 SRD complete" floor audit**
Opens the L4 cycle. 20-test audit (5 green + 15 xfail) pinning L4's surface: the universal Ability Score Improvement at L4 (unmodeled today — every class's `levelTable['4']` is empty), Monk Slow Fall + Fighter Second Wind 3 (present), and the Sorcery Points / Focus Points → 4 resource scaling. The 15 xfails are the punch list; when they flip, tag `0.7.0-alpha.0`.
Detail: [slice-702.md](slice-702.md).
