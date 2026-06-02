# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine (slice 603): BA-cast spells with an attack mechanic consume BA + Action (Produce Flame action-economy fix)**

The slice 600 fuzz audit's third real bug: Produce Flame's `castingTime: "Bonus Action"` cost only a BA in the engine, leaving the caster's Action free even when they immediately rolled the hurl-attack on the same turn. RAW PF: BA cast produces the flame (utility/light, persists 10 min), and a SEPARATE Magic action is required to hurl. Pre-slice, druids/Pact-of-Tome warlocks effectively got a free spell attack with their BA while keeping their full Action available.

**RAW** (SRD 5.2.1 Produce Flame): "Casting Time: Bonus Action ... Until the spell ends, you can take a Magic action to hurl fire at a creature."

**Changes** ([src/engine/plan/cast-spell.ts:1929-1985](src/engine/plan/cast-spell.ts#L1929)): detect the shape by content, not by spell id — `castingTime === 'Bonus Action'` AND `mechanicalEffects` contains an `attack` mechanic AND `duration !== 'Instantaneous'` AND the cast has at least one target id. When all four hold, the cast simulates "BA cast + Magic-action hurl in one turn" and consumes BOTH economy slots:
- Pre-check: throws if Action already used (rejection path mirrors the existing BA / Reaction rejection wording).
- Emits TWO `ActionEconomyConsumed` events after `SpellCastDeclared`: one with `kind: 'bonusAction'` (the cast), one with `kind: 'action'` (the hurl).
- Light-only cast (no targetIds) consumes ONLY the BA — RAW: cast without hurl is fine (the flame is utility).

Detection by content shape catches Produce Flame today and any future spell of the same shape (Spiritual Weapon will hit this when added) without per-spell wiring. This is a stopgap; proper RAW would split the cast (emits persistent effect) from the hurl (separate `MagicAction` intent rolls the attack). Tracked as a future refactor — the stopgap gets the action economy right without surfacing new intent types or breaking the existing single-call `castSpell` consumer API.

**Tests** ([tests/unit/engine/slice-603-produce-flame-action-economy.test.ts](tests/unit/engine/slice-603-produce-flame-action-economy.test.ts), 3 cases): hurl-with-target emits BOTH `bonusAction` + `action`; Action-already-used throws; targetless cast emits ONLY `bonusAction` (light-only).

**Verification:** fuzz seed=2010 now shows "_(Aria consumes bonusAction)_" + "_(Aria consumes action)_" on every PF turn, where pre-slice only the BA marker fired. The CON save and `[advantage]` from slices 601-602 also chain through correctly. Full suite green (482 files, 3256 tests, 173 unrelated skips).

**Audit:**
- **Names:** `hasAttackMechanic`, `hasNonInstantaneousDuration`, `consumesImplicitMagicAction` are intent-revealing locals matching the RAW vocabulary.
- **DRY:** detection conditional is a single boolean computed once and read twice (precondition check + event emission). No duplication.
- **SRP:** the new block sits inside cast-spell's existing action-economy section; no new responsibility added — it extends the same "check then emit" pattern that already handles the four castingTime kinds.
- **Magic numbers:** none added.
- **at-threading:** both new events use the same `at` as the surrounding cast.
- **Mechanical outcomes asserted:** the new test pins the three branches (both-consumed, action-already-used rejection, targetless-only-BA).

**Pattern-check** (filter shape: "spells whose attack mechanic is rolled by the cast planner but should cost a separate Action"): swept `grep -A 15 '"castingTime": "Bonus Action"' src/content/packs/starter-pack.json` for spells with `mechanicalEffects.kind: 'attack'`. Found:
- `produce-flame` ✓ (this slice)
- That's the only currently-wired one. `spiritual-weapon` is on the future-wiring list (would benefit automatically). All other BA-cast spells in the pack (Healing Word, Hex, Hunter's Mark, Bardic Inspiration consume, Sanctuary, etc.) either have non-attack mechanics or instantaneous-then-condition shape, so the slice 603 gate correctly skips them.

**Open follow-ups:**
- **Split cast vs hurl into two intents**: the proper RAW model is `cast` (BA, emits persistent effect, no attack) and `hurl` (Magic action, requires the persistent effect, rolls the spell attack). This would let a caster cast PF on T1 (BA only) and hurl on T2-T100 within the 10-minute duration. The stopgap collapses to "cast and hurl on the same turn" which is the common case but not the only legal play. Tracked.
- **Aura-tick concentration saves (carryover from slice 601)**: the `planTickAura` / `planTickRecurring` / `planTickMovementDamage` paths still don't trigger the slice-601 CON save on the target. Once split, the same `planConcentrationOnDamage` helper plugs in.

---

**Engine (slice 602): spell attacks consult target's effect stack for Advantage / Disadvantage**

The slice 600 fuzz audit's second real bug: spell attacks (Eldritch Blast, Fire Bolt, Produce Flame, etc.) ignored every target-side condition that grants attackers Advantage. Faerie Fire'd / Restrained / Paralyzed / Unconscious targets all got attacked with a bare d20 because [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts) rolled `d20 = rollDie(D20_SIDES, rng)` with no advantage logic, while [src/engine/plan/attack.ts:700](src/engine/plan/attack.ts#L700) (weapon attacks) consulted the full target effect stack. The condition data was wired correctly; only weapon attacks read it.

**RAW** (2024 PHB Spellcasting): "If you cast a spell that has an attack roll, follow the rules for an attack roll." Faerie Fire: "Attack rolls against an affected creature or object have Advantage if the attacker can see it." Restrained / Paralyzed / Unconscious / Prone-within-5-ft all impose the same `GrantAdvantageToAttackers` shape.

**Changes** ([src/engine/plan/cast-spell.ts:485-583](src/engine/plan/cast-spell.ts#L485)): the spell-attack roll path now builds the target's effect stack and queries three accessors before rolling, mirroring the weapon-attack branch:
- `targetEffects.grantsAdvantageToAttackers(facts)` — Faerie Fire, Restrained, Paralyzed, Unconscious, Prone-within-5ft (melee), Reckless Attack target side.
- `targetEffects.cancelsAdvantageOnAttackers(facts)` — Rogue L18 Elusive.
- `targetEffects.imposesDisadvantageOnAttackers(facts)` — Dodge, Blur, Invisible (per-attacker).
- New `rangedSpellInMelee` check: ranged spell attacks within 5 ft of a non-incapacitated enemy roll with Disadvantage (PHB Ranged Attacks in Close Combat — explicit RAW for spells too).
- 2024 cancellation rule: Advantage + Disadvantage → roll with neither.
- Halfling Luck / Bless +1d4 / War Caster spell-attack advantage are NOT wired here — they're the same pre-slice gap on the spell-attack path and need their own follow-up (tracked).

Predicate facts mirror `attack.ts` exactly (`event.attackKind`, `bearer.hasIncapacitated`, `bearer.speedZero`, `bearer.canSeeAttacker`) so the same content-side condition gates wire through both paths uniformly.

The `AttackRolled` event now stamps `d20: [r1, r2]` and `used: 'advantage' | 'disadvantage'` correctly for spell attacks, so the transcript surfaces "**Bran** attacks **Aria** [advantage]: d20(15/5) + 4 = 19 vs AC 12 -> hit." (verified against fuzz seed=2008 post-slice — pre-slice the same hit showed a bare `d20(15)`).

**Tests** ([tests/unit/engine/slice-602-spell-attack-advantage.test.ts](tests/unit/engine/slice-602-spell-attack-advantage.test.ts), 3 cases): Faerie Fire'd target → Advantage; unaffected target → bare d20; Faerie Fire + Dodge cancel → bare d20. Uses the starter pack (not TEST_PACK) because TEST_PACK's stubbed `restrained` / `paralyzed` conditions don't carry `GrantAdvantageToAttackers` — surfaced this gap during build (test-pack stubs are a known scope deviation, not in slice scope).

**Verification:** fuzz seed=2008 now shows every Faerie Fired attack rolling with advantage; full suite green (481 files, 3253 tests, 173 unrelated skips).

**Audit:**
- **Names:** new locals `targetEffects`, `targetGrantsAdvantage`, `targetCancelsAdvantage`, `targetImposesDisadvantage`, `rangedSpellInMelee`, `effectivelyGrantsAdvantage`, `effectivelyImposesDisadvantage`, `d20Rolls` mirror attack.ts exactly (`d20Rolls` renamed from `rolls` to avoid the downstream collision with the damage-rolls variable).
- **DRY:** the inline duplication is intentional for this slice — attack.ts has 350+ lines of attack-roll machinery with weapon-only facts (mastery, fighting-style, weapon-property gates) that don't translate, so a shared helper would need a richer signature than a slice-602 scope justifies. Tracked as future refactor.
- **SRP:** the spell-attack path stays one responsibility (roll the attack); the new section is a focused "compute advantage state from target effects" block.
- **Magic numbers:** `5` (ranged-in-melee threshold) extracted to a comment (already a magic value in attack.ts; tracked as global cleanup).
- **at-threading:** no events emitted by the new section; advantage state is computed inline and stamped on the existing `AttackRolled` event.
- **Mechanical outcomes asserted:** the new test pins three cases (Advantage applied, no-condition baseline, cancellation rule).

**Pattern-check** (filter shape: "every place that rolls a d20 against a target without consulting target-side advantage conditions"): swept `grep -rn "rollDie(D20_SIDES" src/engine/` → 28 sites. Already-correct: `attack.ts`, `offhand-attack.ts`, `weapon-mastery.ts`, `opportunity-attack.ts` (all weapon-attack paths). The 6 spell-attack target-loops at [cast-spell.ts:485](src/engine/plan/cast-spell.ts#L485), [:795](src/engine/plan/cast-spell.ts#L795), [:1027](src/engine/plan/cast-spell.ts#L1027), [:1086](src/engine/plan/cast-spell.ts#L1086), [:1175](src/engine/plan/cast-spell.ts#L1175), [:1232](src/engine/plan/cast-spell.ts#L1232) — only the first (`attackTargetIds`) is an actual attack-roll site; the others are save-roll sites (target makes a save vs spell DC; advantage on the SAVE side is a different code path and already correct via `computeSavingThrow`'s consultation of the target's effect stack). Other sites: `concentration.ts` (CON save, advantage already handled via `computeSavingThrow`), `init.ts` (initiative; advantage from Alert handled separately). All other d20-roll sites are save-side, not attack-side. **Sweep clean** for attack-roll target-advantage gaps. The save-side parallel for spells already works — slice 602 closes the attack-side gap.

**Open follow-ups:**
- **Spell-attack advantage from attacker side**: Halfling Luck (reroll on natural 1), Bless +1d4, War Caster advantage on opportunity-attack spells, Reckless Attack (melee-spell-attack), Faerie Fire's "attacker can see it" gate (which the engine doesn't yet model line-of-sight for). All are weapon-only today; same shape as slice 602 but on the attacker-side effect stack. Tracked for a follow-up slice.
- **Shared `resolveAttackRoll` helper**: the inline duplication between attack.ts (350 lines) and cast-spell.ts (the slice-602 50-line block) is the boundary between "focused fix" and "premature abstraction". Once the attacker-side spell-attack work above lands and the duplication is 100+ lines, extracting a shared helper that takes per-attack-kind config becomes worth the refactor. Defer until then.

---

**Engine (slice 601): auto-trigger CON save on every DamageApplied to a concentrating creature**

The slice 600 fuzz-replay viewer surfaced this gap end-to-end across 15 battles: Bless, Hex, Hunter's Mark, Faerie Fire and every other concentration spell stayed up indefinitely under chip damage because the engine never rolled the per-damage CON save RAW requires. The planner existed ([src/engine/plan/concentration.ts](src/engine/plan/concentration.ts) `planCheckConcentration`, slice 515) but was only callable explicitly, not wired into the damage path. Only the drop-to-0 unconscious break path fired automatically.

**RAW** (2024 PHB Concentration): "Whenever you take damage while you are concentrating on a spell, you must make a Constitution saving throw to maintain your concentration. The DC equals 10 or half the damage you take (rounded down), whichever number is higher. If you take damage from multiple sources, such as an arrow and a dragon's breath, you make a separate saving throw for each source of damage."

**Changes:**

- New helper [`planConcentrationOnDamage`](src/engine/plan/concentration.ts) ([src/engine/plan/concentration.ts](src/engine/plan/concentration.ts)) — supersedes `planConcentrationBreakOnDrop` at every damage emission site. Single entry point that:
  - If `damageWouldDropTo0` → emits `ConcentrationBroken (reason='unconscious')` (legacy path, kept verbatim).
  - Else if non-fatal damage → rolls a CON save through the standard `computeSavingThrow` derivation (`isConcentrationCheck: true` so Eldritch Mind / War Caster / Bless / Bane / Halfling Luck wire through automatically) and emits a `SaveRolled` event. On failure, also emits `ConcentrationBroken (reason='failedSave')` chained off the save's id.
  - Damage of 0 (full immunity / resistance to 0) returns no events — RAW: no damage, no save.
- Wired all 8 emission sites: [src/engine/plan/attack.ts:1433](src/engine/plan/attack.ts#L1433), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts) (3 sites: spell-attack hit, save-half damage, fatal interception), [src/engine/plan/weapon-mastery.ts:260](src/engine/plan/weapon-mastery.ts#L260) (graze), [src/engine/plan/offhand-attack.ts:254](src/engine/plan/offhand-attack.ts#L254), [src/engine/plan/stirge-drain.ts:125](src/engine/plan/stirge-drain.ts#L125), [src/engine/plan/lands-aid.ts:191](src/engine/plan/lands-aid.ts#L191), [src/engine/plan/falling.ts:131](src/engine/plan/falling.ts#L131).
- [src/engine/plan/falling.ts](src/engine/plan/falling.ts) `planFalling` signature gained an `rng: RNG` parameter (was the only damage emitter without one); the `engine.plan.falling` factory at [src/engine/index.ts:874](src/engine/index.ts#L874) supplies it from its closure, so no consumer-facing change.
- `planConcentrationBreakOnDrop` kept as the unconscious-only variant for tests and the rare call site without RNG. The new helper is now canonical for damage emitters.

**Tests:** new [tests/unit/engine/slice-601-concentration-save-on-damage.test.ts](tests/unit/engine/slice-601-concentration-save-on-damage.test.ts) (4 cases): non-fatal damage emits exactly one CON save with DC = max(10, half); failed save emits `ConcentrationBroken (failedSave)` chained to the save id; successful save emits no Broken event; fatal damage skips the save and emits Broken (unconscious) directly. Existing [tests/unit/engine/plan-concentration-on-drop.test.ts](tests/unit/engine/plan-concentration-on-drop.test.ts) updated: the "stays conscious" case now also filters seeds to successful CON saves before asserting no break (previously the assertion would trip on rare failed-save seeds).

**Verification:** fuzz seed=2010 now emits four CON saves across the battle, one of which fails and breaks the warlock's Hex mid-fight — exactly the RAW-correct outcome the slice-600 review flagged as missing. Full suite green (480 files, 3250 tests, 173 unrelated skips), tsc clean.

**Audit:**
- **Names:** `planConcentrationOnDamage` parallels the existing `planConcentrationBreakOnDrop` and `planCheckConcentration`; intent-revealing.
- **DRY:** the new helper consolidates the unconscious-break path with the save-roll path that was duplicated across `planCheckConcentration`'s body. The DC calculation moved to a single private `concentrationDC` referenced by both call sites.
- **SRP:** one helper, one job (handle every concentration consequence of one damage event).
- **Magic numbers:** `CONCENTRATION_MIN_DC = 10` and `CONCENTRATION_DC_DIVISOR = 2` were already extracted (slice 515); no new literals.
- **at-threading:** every site passes through the surrounding planner's `at`.
- **Mechanical outcomes asserted:** the new test pins DC math, save-fail → Broken event linkage, save-success → no Broken event, and the drop-to-0 skip path.

**Pattern-check** (filter shape: "every site that emits DamageApplied to a character that could be concentrating"): swept `grep -rn "type: 'DamageApplied'" src/engine/` → 14 emission sites. 8 already called `planConcentrationBreakOnDrop` and are now upgraded. The other 6 emit damage in contexts where concentration breaks aren't applicable: `planTickAura` (the caster's own aura damaging targets — the targets aren't concentrating on the caster's spell; their own concentration on something else would need a separate trigger but the aura damage path here is symmetric; deferred as future), `planTickRecurring` (same shape), `planTickMovementDamage` (same), `planResolveSavingThrow` damage emission for area spells already routes through the cast-spell.ts site, plus two interceptFatalDamage paths that emit ExcessDamage as a label not real damage. Of the 6 deferred, the 3 `Tick*` planners are worth a follow-up slice — they apply damage to creatures that may be concentrating (e.g. a wizard taking Spirit Guardians aura damage from a hostile cleric while concentrating on Hex). Tracked here as **Open follow-up.**

**Open follow-ups:**
- Wire `planConcentrationOnDamage` into the three aura-tick planners (`planTickAura`, `planTickRecurring`, `planTickMovementDamage`) so a concentrating creature taking Spirit Guardians / Cloud of Daggers / Spike Growth damage gets the same auto-save the direct-damage path now provides.
- Multi-source-per-event RAW separation: a single attack that emits multiple `DamageComponent` entries (1d8 piercing + 1d6 hex necrotic) currently rolls one CON save against the total. RAW: separate saves per source. Engine fix needs the helper to iterate components rather than total them; deferred since the practical impact is small (one DC vs two, usually the same outcome at low damages).

---

**Tooling (slice 600): web demo becomes a fuzz-replay viewer (combat-sandbox retired, map removed)**

The web demo's old shape (user clicks Attack / Move / Dash / Dodge buttons on the active combatant's row, plus a small grid map, plus the event inspector) didn't scale with the engine. Every new planner or condition or class feature wanted its own toolbar button; the four hand-built scenarios couldn't surface emergent-interaction bugs the way the combat-fuzz tool already does (slices 585-598). The "interactive sandbox" framing also competed with the doc-routing the README's quick start now does better (slice 599: `examples/02-combat-encounter` for code, `combat-fuzz` for CLI battles).

This slice realigns the demo around what it's actually good at: showing the engine working. The demo now:

1. Picks a seed (plus mode 1v1/2v2, opponent kind PC/monster, level 1-5, post-battle rest) and runs the same `runBattle()` the CLI uses.
2. Renders a transport (⏮ ⏪ ▶ ⏩ ⏭) over the resulting event log. Each step replays `events.slice(0, cursor)` and re-renders the panels against the resulting state — same `EngineHost` seam that already powered the live commit subscriptions, so no panel needed its own scrub logic.
3. Encodes the full session in the URL hash (`seed`, `mode`, `vs`, `level`, `rest`, `step`) so any moment in any battle is byte-for-byte sharable.

**Extraction so the simulator can run in two contexts**: `runBattle()` and its supporting builders / policy / level-up helpers moved from [scripts/combat-fuzz.ts](scripts/combat-fuzz.ts) into a side-effect-free [scripts/combat-fuzz-core.ts](scripts/combat-fuzz-core.ts) — no `node:fs`, no `process`, browser-safe. [scripts/combat-fuzz.ts](scripts/combat-fuzz.ts) is now a thin CLI front-door (arg parsing, fs writes, markdown summary) that imports the core; [web/main.ts](web/main.ts) imports the same core. `runBattle()`'s return shape collapsed from `{ events, finalState, winner, rounds }` to `{ campaign, winner, rounds }` — both callers needed the full Campaign for their downstream work (CLI for the transcript, demo for `replay(events.slice(0, cursor))`), so the prior split was a duplication.

**New panel**: [web/modes/fuzz-replay.ts](web/modes/fuzz-replay.ts) — read-only initiative list (HP, conditions, position, active marker) + the 5-button transport + a play/pause auto-advance at 350 ms per step + an outcome banner that hides while the cursor is mid-stream (showing the winner mid-scrub spoils the playback).

**Map panel removed** per user request. The grid view added marginal value at three tokens on a 6x4 grid and the demo's centre column was crowding the inspector. Dropped: `web/modes/grid-view.ts` (delete), the `#grid-view-root` section, the `.grid-*` CSS, and the three-column `.panels` template (now two columns). The historical archive entry at [docs/changelog/released-versions.md](docs/changelog/released-versions.md) was unlinked + tagged "(Removed in slice 600.)" matching the convention slice 584 set when it retired Rules Lab.

**Combat sandbox + scenario picker removed**: `web/modes/combat-sandbox.ts` (delete), the action-toolbar / OA-queue / scenario-hint CSS, and the scenario-picker `<select>`. [web/scenarios/](web/scenarios/) stays as a test fixture only — the four scenarios still drive [tests/integration/web-scenarios.test.ts](tests/integration/web-scenarios.test.ts) (replay-equivalence + headline-action probes for Frightened source-tracking, Misty Step occupancy, concentration auto-clear) which is the real value they were carrying.

**Bug fix during smoke-test**: the outcome banner originally showed the winner banner unconditionally and looked up the winner name in the *scrubbed* campaign — at cursor < CharacterCreated event-index, the lookup fell through to the raw ULID (e.g. `Winner: 01KT51WT1XWKT9DTZ9HXQRG7CJ in 11 rounds`). Fixed two ways at once: (1) resolve the winner name once against the full campaign at session start and pass it into the panel; (2) hide the outcome banner while `cursor < totalEvents` since the post-credits result spoils the playback. The cursor-update path was also adjusted so the panel's internal cursor syncs *before* `replaceCampaign()` notifies subscribers, otherwise the hash-driven seek path would flash the wrong outcome state for one frame.

**Files**: [scripts/combat-fuzz-core.ts](scripts/combat-fuzz-core.ts) (new, ~600 lines), [scripts/combat-fuzz.ts](scripts/combat-fuzz.ts) (slimmed to ~110 lines), [web/main.ts](web/main.ts) (full rewrite), [web/modes/fuzz-replay.ts](web/modes/fuzz-replay.ts) (new), [web/index.html](web/index.html), [web/styles.css](web/styles.css), [web/README.md](web/README.md), `web/modes/combat-sandbox.ts` (delete), `web/modes/grid-view.ts` (delete), [web/scenarios/index.ts](web/scenarios/index.ts) (clarify it's now a test fixture), [docs/changelog/released-versions.md](docs/changelog/released-versions.md) (unlink the removed-grid-view archive bullet).

**Verification:**
- `npx tsc --noEmit` and `npx tsc --noEmit -p web/tsconfig.json` both clean.
- `npx vitest run` full suite green (a transient `doc-links` failure on the first run after the README update — the grid-view archive link still pointed at the deleted file — was fixed in the same slice by unlinking the archive bullet matching the slice-584 convention).
- `npx tsx scripts/combat-fuzz.ts --count 2 --seed 100` writes the same transcripts the prior CLI did (the core extraction is behavior-preserving for the CLI).
- `npx vite --config vite.web.config.ts` boots the demo without runtime errors; manual interaction confirms transport buttons step the cursor, hash params round-trip, Run resets the session with new config values.

**Audit (doc / infra change, no engine work):**
- **Names**: `runBattle`, `FuzzBattleResult`, `FuzzRest`, `FuzzVs`, `mountFuzzReplay`, `buildScrubbed`, `findEncounterId`, `onSeek` all match the existing demo / fuzz conventions (`mount*` for panels, `build*` for state helpers).
- **DRY**: the simulator now has one source of truth — both the CLI and the demo `import { runBattle } from './combat-fuzz-core'`. The fuzz tool's behavior is byte-for-byte unchanged (same CLI smoke run produces the same transcript bytes), so the extraction is a refactor not a rewrite.
- **SRP**: `combat-fuzz-core.ts` simulates a battle; `combat-fuzz.ts` is the CLI; `fuzz-replay.ts` renders + transports; `main.ts` wires the host + cursor + URL. No file does two jobs.
- **Magic numbers**: `STEP_DELAY_MS = 350` named in `fuzz-replay.ts`; `DEFAULT_SEED = 42`, `DEFAULT_LEVEL = 1`, `DEFAULT_MODE = '1v1'`, `DEFAULT_VS`, `DEFAULT_REST` named in `main.ts`.
- **Tests prevent**: the existing audit suite (doc-size, doc-links, doc-examples, srd-drift, planner-wiring, coverage-ledger) caught the only regression introduced by the move — a deleted source file with a still-live archive link — and the fix kept the pattern (`code-formatted path + "(Removed in slice N.)"`) the codebase already uses.

**Pattern-check** (filter shape: "demo files that referenced the removed surfaces"): swept for `combat-sandbox`, `grid-view`, `CombatSandbox`, `mountGridView`, `mountCombatSandbox`, `scenario-control`, `oa-queue`, `action-toolbar` across `web/`, `tests/`, `src/`, `scripts/`, `docs/`. All call sites resolved; the only collateral was the released-versions archive link fixed in the same slice. Scenarios stay because they remain useful test fixtures (their builders bake the regression cases the headline-action probes pin), not because they're load-bearing for the demo — that's a real consumer (`tests/integration/web-scenarios.test.ts`), not dead code.

---

**Docs (slice 599): README quick-start closes the loop on a real combat + adds post-import routing**

The previous README onboarding path stopped short. Its `<!-- typecheck -->` snippet built a character and printed a sheet, then dropped the reader into the repo structure table — no "see a combat" verification, no clear next-step routing for someone who'd just imported the library. A reader could clone the repo, run `npm test`, and still not see the engine actually resolve a combat without spelunking the examples directory.

**Changes** ([README.md](README.md), [examples/README.md](examples/README.md)):
- New "See it run a real combat in 5 seconds" subsection in Quick start: a single `npx tsx examples/02-combat-encounter/index.ts` invocation with the verbatim expected output (HP drop + replay-equivalent + RNG-free apply). Closes the "is this engine actually alive?" loop in the first scroll. The example was already runnable; the README just didn't advertise it.
- New "Want to watch random battles?" subsection: `combat-fuzz` CLI invocation with the flag matrix (`--level`, `--mode`, `--vs`, `--rest`) the slices 585-598 cycle built. Surfaces the engine's exhaustive battle-simulator without burying it in the script directory.
- New "Where do I go from here?" routing block right after the TS snippet: 5 bulleted reader-personas (tutorial → getting-started, runnable code → examples/, mental model → concepts, symbol lookup → api-overview, extending → recipes + CLAUDE.md). Mirrors the existing Documentation table at line ~92 but lives at the point a reader who just read the snippet would actually be looking for guidance.
- [examples/README.md](examples/README.md): added `00-quickstart` to the `npx tsx` run block — previously listed only 01/02/03 even though the directory exists.

**Verification:**
- `npx tsx examples/02-combat-encounter/index.ts` produces the README's quoted output verbatim (verified pre-commit).
- `npx tsx examples/00-quickstart/index.ts` produces `Alyx: AC 12, HP 26/26` (the README snippet's expected output line).
- `npx tsx scripts/combat-fuzz.ts --count 1 --seed 7` writes a battle transcript.
- doc-size + doc-links + doc-examples audits all green (the existing `<!-- typecheck -->` block remained untouched; the new content is prose + shell + a non-typechecked code-fence quote of program output).

**Audit:**
- **Names:** N/A (pure doc additions).
- **DRY:** the new bullets reference existing docs by file path; no content duplication.
- **SRP:** README onboarding flow only; engine / content / tests / fuzz unchanged.
- **Magic numbers:** N/A.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** doc audits green; quoted example output verified by actually running the command pre-edit.

**Pattern-check (filter shape: "docs that promise a thing but stop short of showing it"):** swept the top of README for other dropped-loops. The "Try it in your browser" link is concrete + actionable; the "Usage (preview)" section's `attack` / `castSpell` / `levelUp` snippets are honest about being preview shapes (the "Quick start" snippet is the only one that runs end-to-end); the "Documentation" routing table at line ~92 is structurally identical to the new bullets but lives below repo-structure — both are useful (one for orientation, one as catalog). Sweep clean.

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
