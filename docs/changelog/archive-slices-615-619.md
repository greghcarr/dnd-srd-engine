# Archive: slices 615-619

Five slices: web tooling polish (615 placeholder text + CSS variables, 616 LRU scrub cache); the determinism + breaking-change + CHANGELOG-template docs cycle (617); the `engine.plan.offerCharacterChoices` L1 cascade for Fighting Style and future origin-feat picks (618); and the CI-guarded L1 SRD floor audit (619).

Evicted from the live CHANGELOG in slice 623 (active-cycle headroom). See [CHANGELOG.md](../../CHANGELOG.md) for current work.

---

**Tests (slice 619): CI-guarded "L1 SRD complete" floor audit**

Companion to slice 574's `srd-l1-invariants.test.ts` (hit dice + spell-slot table + ability-score bounds). This audit goes broader: it locks in the surface area that constitutes "a complete L1 SRD experience" so a future slice can't silently drop a class feature, a species, a background's origin feat, or a RAW condition.

**Pinned** ([tests/audit/srd-l1-complete.test.ts](../../tests/audit/srd-l1-complete.test.ts), 41 cases — one per invariant so a regression names the exact dropped piece):

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
- New planner [src/engine/plan/offer-character-choices.ts](../../src/engine/plan/offer-character-choices.ts) walks the character's full effective effect stack (`collectEffectsFromCharacter`), filters for `OfferChoice when: 'onAcquire'`, and emits a `ChoiceRequired` event per choice not already pending or resolved for the character. Wired through `engine.plan.offerCharacterChoices({ characterId })`.
- Idempotency via `promptKey`: [src/schemas/runtime/pending-choice.ts](../../src/schemas/runtime/pending-choice.ts) gained an optional `promptKey` field (additive — no migration); [src/engine/reducers/level-up.ts:41-50](../../src/engine/reducers/level-up.ts#L41) `applyChoiceRequired` persists `event.promptKey` to the pending entry. The new planner dedupes by `promptKey`, so repeat calls (e.g. after later content additions) skip choices already in flight.
- Engine surface: added to the `Engine.plan` interface + factory at [src/engine/index.ts:364](../../src/engine/index.ts#L364). Routed onto `EXCLUDED_FROM_DISPATCH` in [tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts) (not a player-action, not part of the per-turn dispatch — it's a post-creation cascade).

**Tests** ([tests/unit/engine/slice-618-offer-character-choices.test.ts](../../tests/unit/engine/slice-618-offer-character-choices.test.ts), 4 cases): fresh L1 Fighter emits ChoiceRequired with the 6 SRD fighting-style options; committed pending choice has `promptKey: 'fighting-style-fighter'`; idempotent (second call returns nothing for the same choice); resolved choice stays suppressed on subsequent calls.

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

1. **[docs/determinism.md](../../docs/determinism.md)** (new) — four-layer table covering what "deterministic" means in this engine. Replay equivalence is always stable; per-seed RNG is version-sensitive (slices 601/602/611/612/614 all changed RNG consumption patterns and per-seed transcripts from before the cycle no longer byte-match). Practical advice: snapshot resulting state + event log for cross-version regression testing, not just the seed.

2. **[docs/breaking-changes-queued.md](../../docs/breaking-changes-queued.md)** (new) — durable announcement queue for breaking changes that landed on `dev` after the most-recent release tag. Slice 603 (Produce Flame action-economy) is the first entry. The doc rolls into the next release's release notes; per-slice CHANGELOG entries flag "Breaking change" so contributors know to append. CLAUDE.md updated to point at it.

3. **CLAUDE.md "CHANGELOG entry shape"** section (new, in the existing Doc-updates-per-slice block) — standard template after the slice 601-616 cycle showed the entries trending verbose enough to force back-to-back archive operations (slices 593-598, 599-603, 604-610 all evicted within ~10 slices). Template caps entries at ~25-40 lines and pushes the "pre-slice the engine did X; now it does Y" narrative into the commit-message body.

**Files**: [docs/determinism.md](../../docs/determinism.md) (new), [docs/breaking-changes-queued.md](../../docs/breaking-changes-queued.md) (new), [CLAUDE.md](../../CLAUDE.md) (two sections updated).

**Verification:** doc-size + doc-links audits green (the new docs are well under the 60 KB ceiling; all internal links resolve). 490 files / 3284 tests pass.

**Audit:** doc-only slice; no engine work.
- Names: `determinism.md` and `breaking-changes-queued.md` self-describing.
- DRY: the determinism doc cross-references the per-slice CHANGELOG entries for specific RNG-impact details rather than restating each.
- Pattern-check: swept the repo for other places that promise "deterministic" without qualifying the layer. README and concepts.md both say "deterministic replay" / "byte-equivalent state" — those claims are LAYER 1 (replay equivalence), still true. Neither overpromises per-seed cross-version reproducibility. Sweep clean.

---

**Tooling (slice 616): LRU scrub cache — bound memory for long sessions**

Slice 610's scrub cache was unbounded — a 2000-event battle scrubbed exhaustively could hold ~2000 Campaign snapshots in memory. Acceptable for short sessions; risky for long ones. The slice-610 audit flagged this as an open follow-up.

**Changes** ([web/main.ts](../../web/main.ts)): `ScrubCache` upgraded from a bare `Map<number, Campaign>` to a `{ entries, pinned, maxSlots }` struct with LRU eviction. Cap defaults to `SCRUB_CACHE_MAX_SLOTS = 128` (~1-2 MB for typical L1 battles; small battles never hit it).

- `cacheGet` touches the entry on read by deleting + re-inserting (JS Map preserves insertion order, so MRU is at the tail).
- `cacheSet` evicts the LRU non-pinned entry when size exceeds cap. Pinned cursors (the genesis `0` and the end `totalEvents` anchors per session) never evict so from-start / from-end paths never re-replay.
- `startSession` pre-seeds both pinned anchors (cursor=0 via `buildScrubbed(full, 0, cache)`, cursor=total with the full campaign).

**Tests** ([tests/unit/web-scrub-cache.test.ts](../../tests/unit/web-scrub-cache.test.ts), now 5 cases): correctness (matches `replay()` at every cursor); referential cache hit on revisit; LRU eviction under cap pressure; pinned anchors survive eviction; MRU-touching keeps recently-accessed entries when newer cursors evict older ones.

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

1. **Mid-scrub outcome placeholder** ([web/modes/fuzz-replay.ts](../../web/modes/fuzz-replay.ts)) said "Battle in progress (step N of M). Scrub to the end (⏭) to see the outcome." The transport directly above already shows "step N / M" — redundant. New copy: "Battle in progress — scrub to the end (⏭) to see the outcome."
2. **Team colors as CSS variables** ([web/styles.css](../../web/styles.css)): `--team-a-color: #4a89ff` and `--team-b-color: #e7553c` on `:root`; the four `.combatant.team-*` rules now reference the variables instead of inline hexes. A future theme override or palette change touches one declaration instead of four.

No engine work, no tests touched.

**Verification:** `tsc -p web/tsconfig.json` clean; `vite` boots without runtime errors.

**Audit (trivial slice):**
- Names: `--team-a-color` / `--team-b-color` mirror existing `--token-color` convention from the dropped grid-view.
- DRY: 4 hardcoded hexes collapse to 2 variable declarations.
