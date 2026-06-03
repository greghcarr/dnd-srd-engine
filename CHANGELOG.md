# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Tooling (slice 610): scrub cache — replay is now incremental, not from-genesis-per-step**

The slice-600 observer review flagged the demo's scrub performance as an architectural smell that would bite once battles grew past a few hundred events: every cursor change called `replay(events.slice(0, cursor))` from genesis, O(N) per step. A 1500-event L5 multi-round battle scrubbing one step back was a full re-application of 1499 events.

**Changes** ([web/main.ts](web/main.ts)):
- New `ScrubCache = Map<number, Campaign>` per session, seeded with the full-cursor campaign on session start.
- `buildScrubbed(full, cursor, cache)`:
  - Cache hit → return cached campaign (referential equality).
  - Cache miss → find largest cached prefix `≤ cursor`, `applyAll(base.state, full.events.slice(bestKey, cursor))`. For a single-step forward jump from cursor K → K+1 that's one event applied; for a backward jump it's a from-nearest-prefix replay.
  - Cache the result.
- `startSession` builds the cache; `onSeek` threads it through.

**Memory tradeoff:** O(unique-cursors-visited × state-size). A 2000-event battle scrubbed exhaustively caches ~2000 campaigns at a few KB each (~10MB). Acceptable for interactive sessions; an LRU would be a follow-up if session lifetimes grow.

**Tests** ([tests/unit/web-scrub-cache.test.ts](tests/unit/web-scrub-cache.test.ts), 3 cases): cache produces the same state at every cursor as a fresh `replay()` (20 sampled stops on a real seed-42 fuzz battle); forward-then-jump-to-mid is a referential cache hit (no recompute); scrubbed campaign carries the slice cursor + events length while preserving identity props.

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

**Files** ([web/index.html](web/index.html), [web/modes/fuzz-replay.ts](web/modes/fuzz-replay.ts), [web/styles.css](web/styles.css)). No engine work.

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

1. **Human-readable event-type labels** — pre-slice, the inspector printed raw event slugs (`AttackRolled`, `ActionEconomyConsumed`, `RoundEnded`) which read as engine-developer jargon. A new `HUMAN_LABELS` map at [web/ui/event-row.ts:36-89](web/ui/event-row.ts#L36-L89) renders "Attack roll", "Action used", "Round ended" instead. Falls back to a CamelCase-split for unmapped types so a new event-type ships as English without forcing a sync update. The raw slug stays available as a tooltip on the type chip.
2. **Vocabulary consistency** — the panel said "cursor X · N events" while the Random Battle panel says "step X / N". Two names for the same axis; observers had to translate. Inspector header now reads "step X of N · …" — same vocabulary as the transport.
3. **Developer-tools collapsed** — Verify replay / Export / Import are engine-developer features (replay-equivalence proof, save/load roundtripping); an observer has no reason to want them. Moved into a `<details>` summary block ("Developer tools") that's collapsed by default. The engine devs who want them are one click away; the casual reader gets a cleaner header.
4. **State-change rows subdued** — the inspector colored events by category (resolution / encounter / state-change) but each row had the same visual weight. State-change events are the highest-volume + lowest-signal category (`ActionEconomyConsumed`, `SpellSlotConsumed`, internal bookkeeping). CSS opacity dialed to `0.72` so the eye lands on resolution + encounter rows first.

Plus a panel-title rename: "Event Inspector" → "Event Log" so it doesn't read like a debugger tool.

**Files** ([web/ui/event-row.ts](web/ui/event-row.ts), [web/modes/event-inspector.ts](web/modes/event-inspector.ts), [web/styles.css](web/styles.css)). No engine work.

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

1. **Team coloring** — 2v2 mode interleaves all four combatants by initiative; a left-border color per team (blue for Aria team, red for Bran/Beast team) makes "who's on which side" instant. Extended [`FuzzBattleResult`](scripts/combat-fuzz-core.ts) with `teamACharacterIds` and `teamBCharacterIds` arrays so the panel doesn't have to guess by name pattern.
2. **Condition display names** — replaced raw id rendering (`viciously-mocked`, `dragonborn-breath-weapon-active`) with content lookup ("Viciously Mocked", "Dragonborn Breath Weapon Active"). The panel now resolves the pack once at mount via `resolveContent([pack])`.
3. **Class / species inline** — name line was bare ("Aria"); now reads "Aria (bard elf)" so observers can scan the initiative list and immediately tell builds apart. Skips the suffix for `companion`-classed creatures (monster team — would just say "(companion companion)").
4. **Coord column drop** — `.combatant-pos` column was showing "(5,5)" with no map context after slice 600 retired the grid view. Orphaned data; removed from the row template and the CSS.
5. **Panel title rename** — "Fuzz Replay" → "Random Battle". "Fuzz" is internal harness vocabulary; observers reading the page have no idea what it means.

**Files** ([scripts/combat-fuzz-core.ts:598-628](scripts/combat-fuzz-core.ts#L598-L628), [web/modes/fuzz-replay.ts](web/modes/fuzz-replay.ts), [web/main.ts](web/main.ts), [web/styles.css](web/styles.css)). No engine work; pure UX / public-interface surface.

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

**Fix** ([scripts/combat-fuzz-core.ts:619-627](scripts/combat-fuzz-core.ts#L619-L627)): `teamNames` type extended to include `'Beast'`, and the `vs === 'monster'` branch now uses `'Beast'` again. Type-only change beyond the literal swap; no other code path touches the name.

**Verification:** `npx tsx scripts/combat-fuzz.ts --count 1 --seed 2000 --vs monster` produces "**Beast** appears (giant-spider, 26/26 HP)" + "Final HP: Beast 26/26" / "Winner: Beast". Pre-slice the same run showed "Bran appears (giant-spider, ...)" — same monster statblock, mislabeled. Full suite green.

**Audit (trivial fix):** N/A — one-character file edit (`Bran` → `Beast`). Includes a fix to the slice-605 test file's `ShieldCast` event literals which carried three speculative fields (`triggeringAttackTotal`, `originalAC`, plus a duplicate id) not on the event schema — caught by tsc when re-typechecking after this slice. Test still pins the same wording branches.

---

**Tooling (slice 605): transcript wording — Relentless Endurance + Shield post-hit**

Two cosmetic-but-misleading transcript lines the slice-600 fuzz audit surfaced:

1. **Relentless Endurance** (`ResourceSpent` event) read "**Aria** spends 1 relentless-endurance." The user had to back-derive "why?" from the damage arithmetic two events earlier (`Damage rolled: 1d6=[3]+2 piercing` showed a rolled 5, but `Aria takes 3 damage` showed only 3 applied because `interceptFatalDamage` scaled the components to bring HP to 1). RAW outcome was correct; only the wording was opaque.
2. **Shield reaction** showed "+5 AC, **turns the hit into a miss**" when the `preventedHit` boolean was true (the +5 AC would mathematically have made the original attack miss). The wording was misleading because the engine fires Shield post-hit per the slice-592 documented limitation: the damage was already applied. A reader sees "turns into a miss" and expects no damage; the HP still dropped.

**Changes** ([tests/transcript.ts](tests/transcript.ts)):
- `ResourceSpent` formatter now special-cases `resource === 'relentless-endurance'`: "**Aria**'s Relentless Endurance prevents the killing blow (drops to 1 HP)." Other resources keep the generic spend wording.
- `ShieldCast` formatter swaps both branches:
  - `preventedHit: true` → "+5 AC (would have prevented this hit; damage already applied per post-hit Shield limitation)".
  - `preventedHit: false` → "+5 AC for subsequent attacks (this attack still lands)".

**CHANGELOG headroom:** slices 599-603 evicted to [docs/changelog/archive-slices-599-603.md](docs/changelog/archive-slices-599-603.md) (the doc-counts audit started failing at 62.2 KB; live file now ~33 KB, under the 60 KB single-Read ceiling).

**Tests** ([tests/unit/transcript-slice-605-wording.test.ts](tests/unit/transcript-slice-605-wording.test.ts), 4 cases): Relentless Endurance ResourceSpent renders the named-outcome line; other resources (`rage`) keep the generic spend wording; Shield preventedHit branch carries the "would have prevented" + "post-hit Shield limitation" phrases; Shield not-prevented branch carries the "subsequent attacks" + "this attack still lands" phrasing.

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
- [tests/transcript.ts](tests/transcript.ts) `hpChange` helper now wraps both sides with a new `displayHp(value) = Math.max(0, value)` clamp before formatting, and elides the "(HP X -> Y)" parenthetical when both sides clamp to the same value (e.g. "0 -> -2" both clamp to 0, no delta to show; the "takes N damage" line stays).
- [scripts/combat-fuzz.ts](scripts/combat-fuzz.ts) `summarize` clamps the "Final HP: X/Y" line the same way.
- Engine state stays unchanged — `character.hp.current` still tracks the signed value internally for instant-death detection (`interceptFatalDamage` reads it). The clamp is presentation-only.

**Tests** ([tests/unit/transcript-hp-clamp.test.ts](tests/unit/transcript-hp-clamp.test.ts), 2 cases): non-fatal-then-fatal damage chain renders as "HP 5 -> 0" (not "HP 5 -> -3"); subsequent heal renders as "HP 0 -> 6" (not "HP -3 -> 6").

**Snapshot updates:** 4 golden transcripts touched ([s1-damage-to-zero-revive](tests/golden/transcripts/s1-damage-to-zero-revive.transcript.md), [s9-opportunity-attack](tests/golden/transcripts/s9-opportunity-attack.transcript.md), [s29-resurrection](tests/golden/transcripts/s29-resurrection.transcript.md), [showcase](tests/golden/transcripts/showcase.transcript.md)) — every "HP X -> -Y" pair regenerated with the clamp. Diffs reviewed: cleanly intentional, no semantic loss (the "takes N damage" line still shows the raw damage value).

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
