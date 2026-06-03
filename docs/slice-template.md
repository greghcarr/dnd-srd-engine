# Slice template

Most slices in this repo fall into one of three shapes. This doc lists the file checklist + order of operations for each. The planner skeleton itself is documented in [CLAUDE.md](../CLAUDE.md#planner-shape).

For the project-wide slice workflow (event-first, reducer, planner, tests), see the "Slice workflow" section of [CLAUDE.md](../CLAUDE.md#slice-workflow). This doc breaks it out by slice shape.

## Pre-flight (every slice)

1. Read the relevant entry in [docs/starter-pack-gaps.md](starter-pack-gaps.md) (the per-primitive future-slice queue + per-spell wired catalog) to confirm scope and pick the canonical content user.
2. Find the closest prior analogous slice via `git log --oneline | head -40`; skim its commit and tests for the pattern. The recent slices that head shows are the most representative.
3. Decide which of the three shapes below applies. If two apply, do them as two slices.

## Definition of done (every slice)

- Full test suite green (`npm test`).
- `npm run typecheck` clean (CI also gates this).
- Replay-equivalence holds on every new golden scenario.
- New events round-trip through `formatTranscript` (a case in [tests/transcript.ts](../tests/transcript.ts) for each new event type).
- Write the full slice detail (Files / Tests / Verification / Audit / Open-follow-ups) to `docs/changelog/slice-NNN.md`, AND add a 3-line pointer entry to `CHANGELOG.md` under `## Unreleased` (post-slice-628 convention; see [CLAUDE.md](../CLAUDE.md) "CHANGELOG entry shape" for the templates).
- [docs/starter-pack-gaps.md](starter-pack-gaps.md) updated: future-engine-slices row marked shipped if a primitive landed; per-level spell sections walked from `schema-only` to `wired` for the canonical content user(s); "Coverage at a glance" totals refreshed.
- Pre-commit Uncle Bob review: clean code / externalities / regressions / tests / Uncle Bob check.

---

## Shape 1, new planner (combat mechanic, spell, class feature)

The most common shape. Adds an `IntentX` + `planX` + supporting events.

### Files

- **Events**: add or extend a schema file under [src/schemas/events/](../src/schemas/events/) (e.g. `attack.ts`, `action-economy.ts`). Wire into [src/schemas/events/index.ts](../src/schemas/events/index.ts) (union + export).
- **Reducer**: add `applyFoo(draft, event)` to the matching reducer file in [src/engine/reducers/](../src/engine/reducers/) (one file per event category). Wire into the switch in [src/engine/apply.ts](../src/engine/apply.ts) (both the import and the case, easy to forget).
- **Planner**: new file in [src/engine/plan/](../src/engine/plan/) following the skeleton in [CLAUDE.md](../CLAUDE.md#planner-shape).
- **Public API**: re-export from [src/engine/plan/index.ts](../src/engine/plan/index.ts), add to [src/engine/index.ts](../src/engine/index.ts) Engine interface + `planNs` factory if intended for consumers, optionally add a convenience method in [src/engine/conveniences.ts](../src/engine/conveniences.ts).
- **Tests**:
  - Reducer test in [tests/unit/reducers/](../tests/unit/reducers/).
  - Planner test in [tests/unit/engine/](../tests/unit/engine/) asserting the event sequence shape + `ThrowOnCallRNG` proof on `applyAll`.
  - Golden scenario in [tests/golden/](../tests/golden/) with transcript snapshot.
  - Add a `formatEvent` case in [tests/transcript.ts](../tests/transcript.ts) for each new event type.

### Order

1. Event schema(s). Run typecheck.
2. Reducer + wire into `apply.ts`. Run typecheck.
3. Reducer unit test (forces you to pin the semantics).
4. Planner. Wire into barrels.
5. Planner test (RNG-capture proof and event-sequence shape).
6. Golden scenario + transcript snapshot (`npx vitest run -u` to write the initial snapshot, then review the diff carefully).
7. Write per-slice file at `docs/changelog/slice-NNN.md` + pointer in `CHANGELOG.md`; update README only if needed.

---

## Shape 2, new content (feat, spell, weapon, condition, class feature wiring)

Adds data to the starter pack and exercises an existing planner / effect primitive.

### Files

- **Content**: edit [src/content/packs/starter-pack.json](../src/content/packs/starter-pack.json). Effects use the primitive vocabulary in [src/schemas/effects.ts](../src/schemas/effects.ts) (extend the schema only if no primitive fits, and prefer extending over a `CustomEffect`).
- **Effect primitive** (only if needed): extend [src/schemas/effects.ts](../src/schemas/effects.ts), the `EffectAccumulator` in [src/effects/builder.ts](../src/effects/builder.ts), and any derivation that needs to read the new state.
- **Derivation** (only if needed): update or add a file in [src/derive/](../src/derive/).
- **Tests**:
  - If a derivation changes, add a unit test in [tests/unit/derive/](../tests/unit/derive/).
  - Add a golden scenario that exercises the content end-to-end. The transcript is the proof the wiring works.

### Order

1. Pick the effect primitive(s); extend only if necessary.
2. If extending: schema, builder method, derivation read site, builder unit test.
3. Wire the content in `starter-pack.json`.
4. Golden scenario exercising the content via an existing planner.
5. Update the content table in [README.md](../README.md) (class matrix, feat count, etc.).
6. Write per-slice file at `docs/changelog/slice-NNN.md` + pointer in `CHANGELOG.md`.

### Gotchas

- New effect primitives need a `formatTranscript` case only if they emit a new event. Pure derivation contributions don't.
- `OfferChoice` at L1 is currently unsupported; defer the choice to a later level if the slice opens one.
- Don't bake hardcoded numbers in `starter-pack.json`; if a value is rulebook-canonical (a fixed proficiency die size, a per-level table entry), check whether the engine should compute it from a formula instead.

---

## Shape 3, new derivation (computed value over state)

A pure function over `CampaignState` (plus content) that doesn't emit events.

### Files

- **Derivation**: new file in [src/derive/](../src/derive/). Pure, no RNG, no state mutation.
- **Public API**: re-export from [src/derive/index.ts](../src/derive/index.ts) and (if consumer-facing) from [src/index.ts](../src/index.ts).
- **Character view** (if applicable): if the derivation is part of a character's computed view, add it to `DerivedCharacter` in [src/derive/character-view.ts](../src/derive/character-view.ts).
- **Tests**: unit test in [tests/unit/derive/](../tests/unit/derive/). Table-driven if a rulebook table exists (ability mod, proficiency bonus, spell-slot multiclass table). Otherwise cover the meaningful branches, not every branch.

### Order

1. Decide if the derivation belongs on the character view or as a standalone helper. Standalone is fine for one-off queries; character-view membership is for values consumers will want alongside other derived state.
2. Write the function.
3. Unit test (table-driven where applicable).
4. Export from barrel(s).
5. Per-slice file + CHANGELOG pointer, only if surface-changing.

### Gotchas

- Derivations read the effect stack via `buildEffectStack({character, content, itemInstances, pendingChoices})`. Don't reach into `appliedConditions` directly; the effect stack composes condition + species + background + class + feat effects.
- Memoization lives inside `createEngine` in [src/engine/index.ts](../src/engine/index.ts) (a `memo` Map keyed on `CampaignState.version`). Adding a new derivation to the memoized surface means adding a method on `engine.derive.*` and wrapping its body with the `memoize()` helper. Only memoize derivations that are called many times per turn (AC, attack bonus, action economy budget). One-off queries can stay non-memoized.
- Derivations must not throw on missing optional fields; return a sensible default and let validation happen at boundaries.
