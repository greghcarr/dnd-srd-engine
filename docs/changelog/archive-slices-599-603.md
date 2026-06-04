# Archive: slices 599-603

Five slices covering the demo-overhaul-then-engine-audit arc: README onboarding polish (599), web demo becomes a fuzz-replay viewer (600), then three engine fixes the slice-600 fuzz-replay surfaced — auto-trigger CON save on every damage (601), spell attacks consult target's effect stack for advantage / disadvantage (602), and Produce Flame consuming BA + Action (603).

Evicted from the live CHANGELOG in slice 605 (active-cycle headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Engine (slice 603): BA-cast spells with an attack mechanic consume BA + Action (Produce Flame action-economy fix)**

The slice 600 fuzz audit's third real bug: Produce Flame's `castingTime: "Bonus Action"` cost only a BA in the engine, leaving the caster's Action free even when they immediately rolled the hurl-attack on the same turn. RAW PF: BA cast produces the flame (utility/light, persists 10 min), and a SEPARATE Magic action is required to hurl. Pre-slice, druids/Pact-of-Tome warlocks effectively got a free spell attack with their BA while keeping their full Action available.

**RAW** (SRD 5.2.1 Produce Flame): "Casting Time: Bonus Action ... Until the spell ends, you can take a Magic action to hurl fire at a creature."

**Changes** ([src/engine/plan/cast-spell.ts:1929-1985](../../src/engine/plan/cast-spell.ts#L1929)): detect the shape by content, not by spell id — `castingTime === 'Bonus Action'` AND `mechanicalEffects` contains an `attack` mechanic AND `duration !== 'Instantaneous'` AND the cast has at least one target id. When all four hold, the cast simulates "BA cast + Magic-action hurl in one turn" and consumes BOTH economy slots:
- Pre-check: throws if Action already used (rejection path mirrors the existing BA / Reaction rejection wording).
- Emits TWO `ActionEconomyConsumed` events after `SpellCastDeclared`: one with `kind: 'bonusAction'` (the cast), one with `kind: 'action'` (the hurl).
- Light-only cast (no targetIds) consumes ONLY the BA — RAW: cast without hurl is fine (the flame is utility).

Detection by content shape catches Produce Flame today and any future spell of the same shape (Spiritual Weapon will hit this when added) without per-spell wiring. This is a stopgap; proper RAW would split the cast (emits persistent effect) from the hurl (separate `MagicAction` intent rolls the attack). Tracked as a future refactor — the stopgap gets the action economy right without surfacing new intent types or breaking the existing single-call `castSpell` consumer API.

**Tests** ([tests/unit/engine/slice-603-produce-flame-action-economy.test.ts](../../tests/unit/engine/slice-603-produce-flame-action-economy.test.ts), 3 cases): hurl-with-target emits BOTH `bonusAction` + `action`; Action-already-used throws; targetless cast emits ONLY `bonusAction` (light-only).

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

The slice 600 fuzz audit's second real bug: spell attacks (Eldritch Blast, Fire Bolt, Produce Flame, etc.) ignored every target-side condition that grants attackers Advantage. Faerie Fire'd / Restrained / Paralyzed / Unconscious targets all got attacked with a bare d20 because [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts) rolled `d20 = rollDie(D20_SIDES, rng)` with no advantage logic, while [src/engine/plan/attack.ts:700](../../src/engine/plan/attack.ts#L700) (weapon attacks) consulted the full target effect stack. The condition data was wired correctly; only weapon attacks read it.

**RAW** (2024 PHB Spellcasting): "If you cast a spell that has an attack roll, follow the rules for an attack roll." Faerie Fire: "Attack rolls against an affected creature or object have Advantage if the attacker can see it." Restrained / Paralyzed / Unconscious / Prone-within-5-ft all impose the same `GrantAdvantageToAttackers` shape.

**Changes** ([src/engine/plan/cast-spell.ts:485-583](../../src/engine/plan/cast-spell.ts#L485)): the spell-attack roll path now builds the target's effect stack and queries three accessors before rolling, mirroring the weapon-attack branch:
- `targetEffects.grantsAdvantageToAttackers(facts)` — Faerie Fire, Restrained, Paralyzed, Unconscious, Prone-within-5ft (melee), Reckless Attack target side.
- `targetEffects.cancelsAdvantageOnAttackers(facts)` — Rogue L18 Elusive.
- `targetEffects.imposesDisadvantageOnAttackers(facts)` — Dodge, Blur, Invisible (per-attacker).
- New `rangedSpellInMelee` check: ranged spell attacks within 5 ft of a non-incapacitated enemy roll with Disadvantage (PHB Ranged Attacks in Close Combat — explicit RAW for spells too).
- 2024 cancellation rule: Advantage + Disadvantage → roll with neither.
- Halfling Luck / Bless +1d4 / War Caster spell-attack advantage are NOT wired here — they're the same pre-slice gap on the spell-attack path and need their own follow-up (tracked).

Predicate facts mirror `attack.ts` exactly (`event.attackKind`, `bearer.hasIncapacitated`, `bearer.speedZero`, `bearer.canSeeAttacker`) so the same content-side condition gates wire through both paths uniformly.

The `AttackRolled` event now stamps `d20: [r1, r2]` and `used: 'advantage' | 'disadvantage'` correctly for spell attacks, so the transcript surfaces "**Bran** attacks **Aria** [advantage]: d20(15/5) + 4 = 19 vs AC 12 -> hit." (verified against fuzz seed=2008 post-slice — pre-slice the same hit showed a bare `d20(15)`).

**Tests** ([tests/unit/engine/slice-602-spell-attack-advantage.test.ts](../../tests/unit/engine/slice-602-spell-attack-advantage.test.ts), 3 cases): Faerie Fire'd target → Advantage; unaffected target → bare d20; Faerie Fire + Dodge cancel → bare d20. Uses the starter pack (not TEST_PACK) because TEST_PACK's stubbed `restrained` / `paralyzed` conditions don't carry `GrantAdvantageToAttackers` — surfaced this gap during build (test-pack stubs are a known scope deviation, not in slice scope).

**Verification:** fuzz seed=2008 now shows every Faerie Fired attack rolling with advantage; full suite green (481 files, 3253 tests, 173 unrelated skips).

**Audit:**
- **Names:** new locals `targetEffects`, `targetGrantsAdvantage`, `targetCancelsAdvantage`, `targetImposesDisadvantage`, `rangedSpellInMelee`, `effectivelyGrantsAdvantage`, `effectivelyImposesDisadvantage`, `d20Rolls` mirror attack.ts exactly (`d20Rolls` renamed from `rolls` to avoid the downstream collision with the damage-rolls variable).
- **DRY:** the inline duplication is intentional for this slice — attack.ts has 350+ lines of attack-roll machinery with weapon-only facts (mastery, fighting-style, weapon-property gates) that don't translate, so a shared helper would need a richer signature than a slice-602 scope justifies. Tracked as future refactor.
- **SRP:** the spell-attack path stays one responsibility (roll the attack); the new section is a focused "compute advantage state from target effects" block.
- **Magic numbers:** `5` (ranged-in-melee threshold) extracted to a comment (already a magic value in attack.ts; tracked as global cleanup).
- **at-threading:** no events emitted by the new section; advantage state is computed inline and stamped on the existing `AttackRolled` event.
- **Mechanical outcomes asserted:** the new test pins three cases (Advantage applied, no-condition baseline, cancellation rule).

**Pattern-check** (filter shape: "every place that rolls a d20 against a target without consulting target-side advantage conditions"): swept `grep -rn "rollDie(D20_SIDES" src/engine/` → 28 sites. Already-correct: `attack.ts`, `offhand-attack.ts`, `weapon-mastery.ts`, `opportunity-attack.ts` (all weapon-attack paths). The 6 spell-attack target-loops at [cast-spell.ts:485](../../src/engine/plan/cast-spell.ts#L485), [:795](../../src/engine/plan/cast-spell.ts#L795), [:1027](../../src/engine/plan/cast-spell.ts#L1027), [:1086](../../src/engine/plan/cast-spell.ts#L1086), [:1175](../../src/engine/plan/cast-spell.ts#L1175), [:1232](../../src/engine/plan/cast-spell.ts#L1232) — only the first (`attackTargetIds`) is an actual attack-roll site; the others are save-roll sites (target makes a save vs spell DC; advantage on the SAVE side is a different code path and already correct via `computeSavingThrow`'s consultation of the target's effect stack). Other sites: `concentration.ts` (CON save, advantage already handled via `computeSavingThrow`), `init.ts` (initiative; advantage from Alert handled separately). All other d20-roll sites are save-side, not attack-side. **Sweep clean** for attack-roll target-advantage gaps. The save-side parallel for spells already works — slice 602 closes the attack-side gap.

**Open follow-ups:**
- **Spell-attack advantage from attacker side**: Halfling Luck (reroll on natural 1), Bless +1d4, War Caster advantage on opportunity-attack spells, Reckless Attack (melee-spell-attack), Faerie Fire's "attacker can see it" gate (which the engine doesn't yet model line-of-sight for). All are weapon-only today; same shape as slice 602 but on the attacker-side effect stack. Tracked for a follow-up slice.
- **Shared `resolveAttackRoll` helper**: the inline duplication between attack.ts (350 lines) and cast-spell.ts (the slice-602 50-line block) is the boundary between "focused fix" and "premature abstraction". Once the attacker-side spell-attack work above lands and the duplication is 100+ lines, extracting a shared helper that takes per-attack-kind config becomes worth the refactor. Defer until then.

---

**Engine (slice 601): auto-trigger CON save on every DamageApplied to a concentrating creature**

The slice 600 fuzz-replay viewer surfaced this gap end-to-end across 15 battles: Bless, Hex, Hunter's Mark, Faerie Fire and every other concentration spell stayed up indefinitely under chip damage because the engine never rolled the per-damage CON save RAW requires. The planner existed ([src/engine/plan/concentration.ts](../../src/engine/plan/concentration.ts) `planCheckConcentration`, slice 515) but was only callable explicitly, not wired into the damage path. Only the drop-to-0 unconscious break path fired automatically.

**RAW** (2024 PHB Concentration): "Whenever you take damage while you are concentrating on a spell, you must make a Constitution saving throw to maintain your concentration. The DC equals 10 or half the damage you take (rounded down), whichever number is higher. If you take damage from multiple sources, such as an arrow and a dragon's breath, you make a separate saving throw for each source of damage."

**Changes:**

- New helper [`planConcentrationOnDamage`](../../src/engine/plan/concentration.ts) ([src/engine/plan/concentration.ts](../../src/engine/plan/concentration.ts)) — supersedes `planConcentrationBreakOnDrop` at every damage emission site. Single entry point that:
  - If `damageWouldDropTo0` → emits `ConcentrationBroken (reason='unconscious')` (legacy path, kept verbatim).
  - Else if non-fatal damage → rolls a CON save through the standard `computeSavingThrow` derivation (`isConcentrationCheck: true` so Eldritch Mind / War Caster / Bless / Bane / Halfling Luck wire through automatically) and emits a `SaveRolled` event. On failure, also emits `ConcentrationBroken (reason='failedSave')` chained off the save's id.
  - Damage of 0 (full immunity / resistance to 0) returns no events — RAW: no damage, no save.
- Wired all 8 emission sites: [src/engine/plan/attack.ts:1433](../../src/engine/plan/attack.ts#L1433), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts) (3 sites: spell-attack hit, save-half damage, fatal interception), [src/engine/plan/weapon-mastery.ts:260](../../src/engine/plan/weapon-mastery.ts#L260) (graze), [src/engine/plan/offhand-attack.ts:254](../../src/engine/plan/offhand-attack.ts#L254), [src/engine/plan/stirge-drain.ts:125](../../src/engine/plan/stirge-drain.ts#L125), [src/engine/plan/lands-aid.ts:191](../../src/engine/plan/lands-aid.ts#L191), [src/engine/plan/falling.ts:131](../../src/engine/plan/falling.ts#L131).
- [src/engine/plan/falling.ts](../../src/engine/plan/falling.ts) `planFalling` signature gained an `rng: RNG` parameter (was the only damage emitter without one); the `engine.plan.falling` factory at [src/engine/index.ts:874](../../src/engine/index.ts#L874) supplies it from its closure, so no consumer-facing change.
- `planConcentrationBreakOnDrop` kept as the unconscious-only variant for tests and the rare call site without RNG. The new helper is now canonical for damage emitters.

**Tests:** new [tests/unit/engine/slice-601-concentration-save-on-damage.test.ts](../../tests/unit/engine/slice-601-concentration-save-on-damage.test.ts) (4 cases): non-fatal damage emits exactly one CON save with DC = max(10, half); failed save emits `ConcentrationBroken (failedSave)` chained to the save id; successful save emits no Broken event; fatal damage skips the save and emits Broken (unconscious) directly. Existing [tests/unit/engine/plan-concentration-on-drop.test.ts](../../tests/unit/engine/plan-concentration-on-drop.test.ts) updated: the "stays conscious" case now also filters seeds to successful CON saves before asserting no break (previously the assertion would trip on rare failed-save seeds).

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

**Extraction so the simulator can run in two contexts**: `runBattle()` and its supporting builders / policy / level-up helpers moved from [scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts) into a side-effect-free [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) — no `node:fs`, no `process`, browser-safe. [scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts) is now a thin CLI front-door (arg parsing, fs writes, markdown summary) that imports the core; [web/main.ts](../../web/main.ts) imports the same core. `runBattle()`'s return shape collapsed from `{ events, finalState, winner, rounds }` to `{ campaign, winner, rounds }` — both callers needed the full Campaign for their downstream work (CLI for the transcript, demo for `replay(events.slice(0, cursor))`), so the prior split was a duplication.

**New panel**: [web/modes/fuzz-replay.ts](../../web/modes/fuzz-replay.ts) — read-only initiative list (HP, conditions, position, active marker) + the 5-button transport + a play/pause auto-advance at 350 ms per step + an outcome banner that hides while the cursor is mid-stream (showing the winner mid-scrub spoils the playback).

**Map panel removed** per user request. The grid view added marginal value at three tokens on a 6x4 grid and the demo's centre column was crowding the inspector. Dropped: `web/modes/grid-view.ts` (delete), the `#grid-view-root` section, the `.grid-*` CSS, and the three-column `.panels` template (now two columns). The historical archive entry at [docs/changelog/released-versions.md](../../docs/changelog/released-versions.md) was unlinked + tagged "(Removed in slice 600.)" matching the convention slice 584 set when it retired Rules Lab.

**Combat sandbox + scenario picker removed**: `web/modes/combat-sandbox.ts` (delete), the action-toolbar / OA-queue / scenario-hint CSS, and the scenario-picker `<select>`. [web/scenarios/](../../web/scenarios/) stays as a test fixture only — the four scenarios still drive [tests/integration/web-scenarios.test.ts](../../tests/integration/web-scenarios.test.ts) (replay-equivalence + headline-action probes for Frightened source-tracking, Misty Step occupancy, concentration auto-clear) which is the real value they were carrying.

**Bug fix during smoke-test**: the outcome banner originally showed the winner banner unconditionally and looked up the winner name in the *scrubbed* campaign — at cursor < CharacterCreated event-index, the lookup fell through to the raw ULID (e.g. `Winner: 01KT51WT1XWKT9DTZ9HXQRG7CJ in 11 rounds`). Fixed two ways at once: (1) resolve the winner name once against the full campaign at session start and pass it into the panel; (2) hide the outcome banner while `cursor < totalEvents` since the post-credits result spoils the playback. The cursor-update path was also adjusted so the panel's internal cursor syncs *before* `replaceCampaign()` notifies subscribers, otherwise the hash-driven seek path would flash the wrong outcome state for one frame.

**Files**: [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) (new, ~600 lines), [scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts) (slimmed to ~110 lines), [web/main.ts](../../web/main.ts) (full rewrite), [web/modes/fuzz-replay.ts](../../web/modes/fuzz-replay.ts) (new), [web/index.html](../../web/index.html), [web/styles.css](../../web/styles.css), [web/README.md](../../web/README.md), `web/modes/combat-sandbox.ts` (delete), `web/modes/grid-view.ts` (delete), [web/scenarios/index.ts](../../web/scenarios/index.ts) (clarify it's now a test fixture), [docs/changelog/released-versions.md](../../docs/changelog/released-versions.md) (unlink the removed-grid-view archive bullet).

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

**Changes** ([README.md](../../README.md), [examples/README.md](../../examples/README.md)):
- New "See it run a real combat in 5 seconds" subsection in Quick start: a single `npx tsx examples/02-combat-encounter/index.ts` invocation with the verbatim expected output (HP drop + replay-equivalent + RNG-free apply). Closes the "is this engine actually alive?" loop in the first scroll. The example was already runnable; the README just didn't advertise it.
- New "Want to watch random battles?" subsection: `combat-fuzz` CLI invocation with the flag matrix (`--level`, `--mode`, `--vs`, `--rest`) the slices 585-598 cycle built. Surfaces the engine's exhaustive battle-simulator without burying it in the script directory.
- New "Where do I go from here?" routing block right after the TS snippet: 5 bulleted reader-personas (tutorial → getting-started, runnable code → examples/, mental model → concepts, symbol lookup → api-overview, extending → recipes + CLAUDE.md). Mirrors the existing Documentation table at line ~92 but lives at the point a reader who just read the snippet would actually be looking for guidance.
- [examples/README.md](../../examples/README.md): added `00-quickstart` to the `npx tsx` run block — previously listed only 01/02/03 even though the directory exists.

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

