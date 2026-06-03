# Archive: slices 604-610

Seven slices covering the slice-600 observer-review polish pass: HP display clamp (604), RE + Shield post-hit wording (605), Beast-name regression fix (606), initiative panel observability polish (607), event log readability (608), toolbar UX (609), incremental scrub cache (610).

Evicted from the live CHANGELOG in slice 613 (active-cycle headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Tooling (slice 610): scrub cache — replay is now incremental, not from-genesis-per-step**

The slice-600 observer review flagged the demo's scrub performance as an architectural smell that would bite once battles grew past a few hundred events: every cursor change called `replay(events.slice(0, cursor))` from genesis, O(N) per step. A 1500-event L5 multi-round battle scrubbing one step back was a full re-application of 1499 events.

**Changes** ([web/main.ts](../../web/main.ts)):
- New `ScrubCache = Map<number, Campaign>` per session, seeded with the full-cursor campaign on session start.
- `buildScrubbed(full, cursor, cache)`:
  - Cache hit → return cached campaign (referential equality).
  - Cache miss → find largest cached prefix `≤ cursor`, `applyAll(base.state, full.events.slice(bestKey, cursor))`. For a single-step forward jump from cursor K → K+1 that's one event applied; for a backward jump it's a from-nearest-prefix replay.
  - Cache the result.
- `startSession` builds the cache; `onSeek` threads it through.

**Memory tradeoff:** O(unique-cursors-visited × state-size). A 2000-event battle scrubbed exhaustively caches ~2000 campaigns at a few KB each (~10MB). Acceptable for interactive sessions; an LRU would be a follow-up if session lifetimes grow.

**Tests** ([tests/unit/web-scrub-cache.test.ts](../../tests/unit/web-scrub-cache.test.ts), 3 cases): cache produces the same state at every cursor as a fresh `replay()` (20 sampled stops on a real seed-42 fuzz battle); forward-then-jump-to-mid is a referential cache hit (no recompute); scrubbed campaign carries the slice cursor + events length while preserving identity props.

**Verification:** full suite green (485 files, 3265 tests, 173 skipped); tsc clean root + web/; vite boots without runtime errors.

**Audit (perf slice):**
- **Names:** `ScrubCache` is the type alias; `buildScrubbed(full, cursor, cache)` is intent-revealing.
- **DRY:** the cache helper lives in one place; production version in main.ts, test inlines the same algorithm against the public engine surface so it can't drift silently without the test noticing.
- **SRP:** session lifecycle, scrub helper, render loop all still single-job.
- **Magic numbers:** none added. `bestKey = -1` is the standard sentinel.
- **at-threading:** N/A — the cache stores Campaign snapshots; the underlying events keep their original timestamps.
- **Mechanical outcomes asserted:** the test pins both correctness (state at cursor N matches replay()) and cache-hit semantics (referential equality on repeat lookup).

**Pattern-check** (filter shape: "O(N) per interactive operation when an incremental path is available"): the engine's `replay()` is genuinely O(N) by design — it has no notion of intermediate checkpoints. `applyAll(state, events)` is the incremental path the engine already exposes. Other O(N) sites in the demo: the event inspector's append-only rendering already uses an O(K) fast path for K new events. The grid-view re-render also computed a full bounds-and-tokens pass per commit — moot, the grid was removed in slice 600. No other hot paths surfaced.

---

**Tooling (slice 609): toolbar UX — tooltips, "Run new battle" label, mid-scrub outcome placeholder**

Three small toolbar/page-copy fixes from the slice-600 observer review:

1. **Tooltips on every toolbar control** — `seed`, `mode`, `opponent`, `level`, `post-battle rest` all gained `title=` attributes explaining what they do (and why an observer might want each one). The labels themselves stay short; the tooltip carries the explanation. The "Run new battle" button gets a tooltip explaining "different seeds give different battles" so observers know re-running with the same seed gives the same battle.
2. **"Run" → "Run new battle"** — the prior label was ambiguous (continue? restart? re-render?). New label says exactly what the button does.
3. **Mid-scrub outcome placeholder** — pre-slice the outcome banner hid entirely while `cursor < total`, leaving no signal that an outcome was waiting. Now shows "Battle in progress (step N of M). Scrub to the end (⏭) to see the outcome." in a quiet gray banner. Still doesn't spoil the result; just tells the observer there IS one and how to reveal it.

Plus a copy refresh: the page's content-notice and hint paragraphs now reference the new panel names ("Random Battle", "Event Log", "Developer tools") established by slices 607-608.

**Files** ([web/index.html](../../web/index.html), [web/modes/fuzz-replay.ts](../../web/modes/fuzz-replay.ts), [web/styles.css](../../web/styles.css)). No engine work.

**Verification:** `tsc --noEmit -p web/tsconfig.json` clean; `vite` boots without runtime errors.

**Audit (presentation slice):**
- **Names:** new CSS class `.fuzz-outcome-inprogress` mirrors the existing `-win` / `-draw` siblings.
- **DRY:** tooltips are one-line `title=` attributes inline; not worth a per-tooltip helper for 5 entries.
- **SRP:** index.html copy + panel mid-scrub branch; both surface-only.
- **Magic numbers:** none added.

**Pattern-check** (filter shape: "user-facing toolbar / page copy that referenced retired vocabulary"): swept index.html + the page's hint copy for stale references to "Fuzz Replay" / "Event Inspector" / "cursor" / "map". Three sites updated (content-notice paragraph, panels aria-label, hint paragraph). One stale phrase in the README will need a follow-up sweep if it shows the old vocabulary — leaving the README scope for now since this slice was scoped to in-page UX.

---

**Tooling (slice 608): event inspector readability — human labels, vocabulary, developer-tools collapse, subdued state-change**

Four observer-experience gaps in the event log panel (the right side of the demo), bundled in one focused slice:

1. **Human-readable event-type labels** — pre-slice, the inspector printed raw event slugs (`AttackRolled`, `ActionEconomyConsumed`, `RoundEnded`) which read as engine-developer jargon. A new `HUMAN_LABELS` map at [web/ui/event-row.ts:36-89](../../web/ui/event-row.ts#L36-L89) renders "Attack roll", "Action used", "Round ended" instead. Falls back to a CamelCase-split for unmapped types so a new event-type ships as English without forcing a sync update. The raw slug stays available as a tooltip on the type chip.
2. **Vocabulary consistency** — the panel said "cursor X · N events" while the Random Battle panel says "step X / N". Two names for the same axis; observers had to translate. Inspector header now reads "step X of N · …" — same vocabulary as the transport.
3. **Developer-tools collapsed** — Verify replay / Export / Import are engine-developer features (replay-equivalence proof, save/load roundtripping); an observer has no reason to want them. Moved into a `<details>` summary block ("Developer tools") that's collapsed by default. The engine devs who want them are one click away; the casual reader gets a cleaner header.
4. **State-change rows subdued** — the inspector colored events by category (resolution / encounter / state-change) but each row had the same visual weight. State-change events are the highest-volume + lowest-signal category (`ActionEconomyConsumed`, `SpellSlotConsumed`, internal bookkeeping). CSS opacity dialed to `0.72` so the eye lands on resolution + encounter rows first.

Plus a panel-title rename: "Event Inspector" → "Event Log" so it doesn't read like a debugger tool.

**Files** ([web/ui/event-row.ts](../../web/ui/event-row.ts), [web/modes/event-inspector.ts](../../web/modes/event-inspector.ts), [web/styles.css](../../web/styles.css)). No engine work.

**Verification:** `tsc --noEmit` clean (root + web/); `vite --config vite.web.config.ts` boots without runtime errors.

**Audit (presentation slice):**
- **Names:** `HUMAN_LABELS`, `humanLabel(type)`, `splitCamelCase(s)` are intent-revealing.
- **DRY:** label map is the single source of truth; CamelCase fallback handles unmapped types without forcing label updates per new event.
- **SRP:** `event-row.ts` still renders one row; the new label is a swap-in for the prior `event.type` rendering. Inspector mode-file's only added responsibility is the `<details>` wrapper for the developer toolbar.
- **Magic numbers:** opacity `0.72` for state-change rows — tracked inline.

**Pattern-check** (filter shape: "user-facing surfaces that print engine-internal slugs"): swept `web/` for raw `event.type`, `appliedConditions[].conditionId`, etc. Three places had the pattern pre-slice; conditions (slice 607) + event types (this slice) are now both content-aware. The third — `event.payload` JSON in the expandable `<details>` block — is intentionally raw (it's the engineer's deep-dive view, surfaced only on click). Sweep clean for the surfaced concern.

---

**Tooling (slice 607): initiative panel observability polish — team color, condition display names, class/species inline, coord-column drop, panel title rename**

The slice-600 observer review surfaced five small UX gaps in the demo's initiative panel that together made the demo harder to parse for an observer than for an engine-developer. Bundled into one focused slice so the surface read changes once rather than five times:

1. **Team coloring** — 2v2 mode interleaves all four combatants by initiative; a left-border color per team (blue for Aria team, red for Bran/Beast team) makes "who's on which side" instant. Extended [`FuzzBattleResult`](../../scripts/combat-fuzz-core.ts) with `teamACharacterIds` and `teamBCharacterIds` arrays so the panel doesn't have to guess by name pattern.
2. **Condition display names** — replaced raw id rendering (`viciously-mocked`, `dragonborn-breath-weapon-active`) with content lookup ("Viciously Mocked", "Dragonborn Breath Weapon Active"). The panel now resolves the pack once at mount via `resolveContent([pack])`.
3. **Class / species inline** — name line was bare ("Aria"); now reads "Aria (bard elf)" so observers can scan the initiative list and immediately tell builds apart. Skips the suffix for `companion`-classed creatures (monster team — would just say "(companion companion)").
4. **Coord column drop** — `.combatant-pos` column was showing "(5,5)" with no map context after slice 600 retired the grid view. Orphaned data; removed from the row template and the CSS.
5. **Panel title rename** — "Fuzz Replay" → "Random Battle". "Fuzz" is internal harness vocabulary; observers reading the page have no idea what it means.

**Files** ([scripts/combat-fuzz-core.ts:598-628](../../scripts/combat-fuzz-core.ts#L598-L628), [web/modes/fuzz-replay.ts](../../web/modes/fuzz-replay.ts), [web/main.ts](../../web/main.ts), [web/styles.css](../../web/styles.css)). No engine work; pure UX / public-interface surface.

**Verification:** `npx tsc --noEmit` clean (root + web/), `npx vitest run tests/integration/web-scenarios.test.ts` green (17 tests; the scenarios use the engine surface unchanged), `npx vite --config vite.web.config.ts` boots without runtime errors.

**Audit (presentation slice):**
- **Names:** `teamACharacterIds`/`teamBCharacterIds` mirror the existing `teamA`/`teamB` private names; `conditionName(id)` is intent-revealing; `teamLabel(combatantId) → 'team-a' | 'team-b' | ''` is the panel-internal CSS-class mapper.
- **DRY:** `resolveContent([pack])` and `teamAIds`/`teamBIds` Sets cached once at mount, queried per render. The class+species blurb is one helper expression, not duplicated.
- **SRP:** panel-only changes; the simulator core touches only its public return shape (additive — no fields removed).
- **Magic numbers:** team colors `#4a89ff` (Aria/blue) and `#e7553c` (Bran/red) borrowed from the dropped grid-view's `TOKEN_PALETTE` so the demo's color identity stays consistent with prior versions.

**Pattern-check** (filter shape: "panel rendering that prints engine-internal slugs to a user-facing surface"): swept `web/modes/` for `.appliedConditions.map`, `.classes[0].classId`, `.speciesId` raw-text uses. Only `fuzz-replay.ts` had the pattern; the inspector renders event-type slugs (`AttackRolled` etc.) which is a separate observability gap tracked as slice 608. The pending-choice resolver uses content-side `prompt` / `label` strings already.

---

**Fix (slice 606): restore "Beast" name for monster opponents (slice-600 regression)**

The slice-600 core-extraction refactor (`scripts/combat-fuzz.ts` → `combat-fuzz-core.ts`) silently lost the slice-596 monster-naming distinction: both PC and monster opposing teams ended up named "Bran", so `--vs monster` battles read like PC battles in the transcripts and the web demo. Caught by the slice-600 observer review.

**Fix** ([scripts/combat-fuzz-core.ts:619-627](../../scripts/combat-fuzz-core.ts#L619-L627)): `teamNames` type extended to include `'Beast'`, and the `vs === 'monster'` branch now uses `'Beast'` again. Type-only change beyond the literal swap; no other code path touches the name.

**Verification:** `npx tsx scripts/combat-fuzz.ts --count 1 --seed 2000 --vs monster` produces "**Beast** appears (giant-spider, 26/26 HP)" + "Final HP: Beast 26/26" / "Winner: Beast". Pre-slice the same run showed "Bran appears (giant-spider, ...)" — same monster statblock, mislabeled. Full suite green.

**Audit (trivial fix):** N/A — one-character file edit (`Bran` → `Beast`). Includes a fix to the slice-605 test file's `ShieldCast` event literals which carried three speculative fields (`triggeringAttackTotal`, `originalAC`, plus a duplicate id) not on the event schema — caught by tsc when re-typechecking after this slice. Test still pins the same wording branches.

---

**Tooling (slice 605): transcript wording — Relentless Endurance + Shield post-hit**

Two cosmetic-but-misleading transcript lines the slice-600 fuzz audit surfaced:

1. **Relentless Endurance** (`ResourceSpent` event) read "**Aria** spends 1 relentless-endurance." The user had to back-derive "why?" from the damage arithmetic two events earlier (`Damage rolled: 1d6=[3]+2 piercing` showed a rolled 5, but `Aria takes 3 damage` showed only 3 applied because `interceptFatalDamage` scaled the components to bring HP to 1). RAW outcome was correct; only the wording was opaque.
2. **Shield reaction** showed "+5 AC, **turns the hit into a miss**" when the `preventedHit` boolean was true (the +5 AC would mathematically have made the original attack miss). The wording was misleading because the engine fires Shield post-hit per the slice-592 documented limitation: the damage was already applied. A reader sees "turns into a miss" and expects no damage; the HP still dropped.

**Changes** ([tests/transcript.ts](../../tests/transcript.ts)):
- `ResourceSpent` formatter now special-cases `resource === 'relentless-endurance'`: "**Aria**'s Relentless Endurance prevents the killing blow (drops to 1 HP)." Other resources keep the generic spend wording.
- `ShieldCast` formatter swaps both branches:
  - `preventedHit: true` → "+5 AC (would have prevented this hit; damage already applied per post-hit Shield limitation)".
  - `preventedHit: false` → "+5 AC for subsequent attacks (this attack still lands)".

**CHANGELOG headroom:** slices 599-603 evicted to [docs/changelog/archive-slices-599-603.md](../../docs/changelog/archive-slices-599-603.md) (the doc-counts audit started failing at 62.2 KB; live file now ~33 KB, under the 60 KB single-Read ceiling).

**Tests** ([tests/unit/transcript-slice-605-wording.test.ts](../../tests/unit/transcript-slice-605-wording.test.ts), 4 cases): Relentless Endurance ResourceSpent renders the named-outcome line; other resources (`rage`) keep the generic spend wording; Shield preventedHit branch carries the "would have prevented" + "post-hit Shield limitation" phrases; Shield not-prevented branch carries the "subsequent attacks" + "this attack still lands" phrasing.

**Verification:** full suite green after the wording change. Spot-checked existing golden transcripts — none asserted on the old Shield wording (no snapshot diffs).

**Audit (presentation slice):**
- **Names:** the two formatter branches name the RAW mechanic explicitly ("Relentless Endurance", "post-hit Shield limitation") so a reader doesn't need engine context.
- **DRY:** both fixes are single-call-site formatter case branches; no helper extraction needed.
- **SRP:** transcript formatter still does one job; the changes are inside its existing dispatch table.
- **Magic numbers:** none added.
- **Mechanical outcomes asserted:** the new test pins both wording cases for both branches of the Shield formatter and the RE special-case + generic-fallback.

**Pattern-check** (filter shape: "transcript event formatters that read non-obvious to a reader without engine context"): swept the formatter for similar "back-derive from prior events" cases. Found:
- `AbsorbElementsCast` line ("**X** casts Absorb Elements: heals N damageType.") — clear, names the spell + outcome.
- `GuidanceUsed` line ("**X** spends Guidance: +N to the ability check.") — clear.
- `HeroicInspirationSpent` line ("**X** spends Heroic Inspiration (applied-to)") — clear.
- `FreeCastUsed` line — generic but reads OK in context.
- The damage rider chain (`_(hex-damage-rider triggers for X)_`) — surfaces the rider source explicitly.

The only similar shape that COULD use a sweep: `ConcentrationBroken (reason: 'failedSave')` events emitted by slice 601 show the SaveRolled then the Broken event but don't link them in prose ("Aria CON save: ... failure. / Aria's concentration on their spell broke (failedSave).") — a reader sees both lines and connects them. Acceptable as-is; if it confuses future readers it can be tightened later.

Sweep clean for the surfaced patterns; slice 605 scope kept tight.

---

**Tooling (slice 604): transcript clamps HP displays at 0 (RAW: HP minimum is 0)**

The slice 600 fuzz audit flagged this across 7 of 15 transcripts: "Final HP: -7/9", "(HP 5 -> -3)", etc. Internal HP can go signed because the engine uses the post-damage value to compute the instant-death threshold (excess damage >= max HP → instant death per PHB Damage at 0 HP). But the user-facing transcript shouldn't leak that internal value — RAW HP minimum is 0; "-7/9" reads as if the engine has a bug.

**Changes:**
- [tests/transcript.ts](../../tests/transcript.ts) `hpChange` helper now wraps both sides with a new `displayHp(value) = Math.max(0, value)` clamp before formatting, and elides the "(HP X -> Y)" parenthetical when both sides clamp to the same value (e.g. "0 -> -2" both clamp to 0, no delta to show; the "takes N damage" line stays).
- [scripts/combat-fuzz.ts](../../scripts/combat-fuzz.ts) `summarize` clamps the "Final HP: X/Y" line the same way.
- Engine state stays unchanged — `character.hp.current` still tracks the signed value internally for instant-death detection (`interceptFatalDamage` reads it). The clamp is presentation-only.

**Tests** ([tests/unit/transcript-hp-clamp.test.ts](../../tests/unit/transcript-hp-clamp.test.ts), 2 cases): non-fatal-then-fatal damage chain renders as "HP 5 -> 0" (not "HP 5 -> -3"); subsequent heal renders as "HP 0 -> 6" (not "HP -3 -> 6").

**Snapshot updates:** 4 golden transcripts touched ([s1-damage-to-zero-revive](../../tests/golden/transcripts/s1-damage-to-zero-revive.transcript.md), [s9-opportunity-attack](../../tests/golden/transcripts/s9-opportunity-attack.transcript.md), [s29-resurrection](../../tests/golden/transcripts/s29-resurrection.transcript.md), [showcase](../../tests/golden/transcripts/showcase.transcript.md)) — every "HP X -> -Y" pair regenerated with the clamp. Diffs reviewed: cleanly intentional, no semantic loss (the "takes N damage" line still shows the raw damage value).

**Verification:** fuzz seed=2009 shows "(HP 8 -> 0)" and "Final HP: 0/8" where pre-slice they showed "(HP 8 -> -1)" and "Final HP: -1/8". Full suite green (483 files, 3258 tests, 173 unrelated skips).

**Audit (presentation slice):**
- **Names:** `displayHp` is intent-revealing; mirrors the implicit convention that "display" prefixes indicate presentation-side transforms.
- **DRY:** one helper, two call sites (transcript hpChange + CLI summary).
- **SRP:** transcript formatter still has one job (render an event stream); the new helper sits at the same level as `formatBreakdown` etc.
- **Magic numbers:** none. `Math.max(0, value)` is the RAW floor.
- **Mechanical outcomes asserted:** the new test pins the clamp on both before/after edges of the parenthetical and the heal-from-below-zero edge.

**Pattern-check** (filter shape: "every place that prints `character.hp.current` to a user-facing surface"): swept all `.hp.current` accesses across `tests/transcript.ts`, `scripts/combat-fuzz.ts`, `scripts/combat-fuzz-core.ts`, `web/`, `examples/`:
- `tests/transcript.ts` CharacterCreated formatter: prints `c.hp.current/c.hp.max` at character creation, never negative there ✓ (no clamp needed).
- `tests/transcript.ts` DamageApplied / Healed: clamped via `hpChange` ✓ (this slice).
- `scripts/combat-fuzz.ts` summarize Final HP: clamped ✓ (this slice).
- `scripts/combat-fuzz-core.ts`: all reads are policy comparisons (`hp.current <= 0`, `hp.current < hp.max/2`) — not user-facing strings, no change needed.
- `web/modes/fuzz-replay.ts` initiative panel HP display: reads `ch.hp.current` for the "X/Y HP" string — same gap, same `Math.max(0, value)` fix applied in this slice (single-line edit; not worth a separate slice).

All user-facing HP printouts now clamp; engine internals unchanged.


---
