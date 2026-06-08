# Slice 746 — perf: ~4.3× faster test suite (cache the validated pack + `isolate: false`)

**Type:** Perf / infra (production `loadStarterPack` + vitest config + one test fix). The follow-up to slice 745's workflow change — this makes the suite itself fast, for dev and CI alike.

## The bottleneck

`loadStarterPack()` calls `loadContentPack(starterPackJson)`, which zod-validates the entire pack (339 spells, 250+ monsters, classes, items, conditions) at **~1.6s per call**. ~570 test files do this at module load. Under vitest's default `isolate: true`, every test file re-executes its module graph in a fresh registry, so the pack was re-validated ~570 times — the dominant cost of the ~10-minute suite (the "collect" phase was ~2953s summed across workers). `resolveContent` is 0.3s/call — irrelevant.

## The fix

1. **Cache the validated pack** ([src/content/packs/starter.ts](../../src/content/packs/starter.ts)): `loadStarterPack` memoizes `loadContentPack(starterPackJson)` in a module-level `let`. The starter pack is the same static JSON every call, so re-validating it is pure waste.
2. **Deep-freeze the cached pack**: the canonical content pack is immutable, so the cached instance is recursively frozen. This makes the shared instance safe — any accidental in-place mutation throws loudly instead of silently leaking across tests.
3. **`isolate: false`** ([vitest.config.ts](../../vitest.config.ts)): each worker reuses its module graph across the test files it runs, so the module-level cache persists per worker — the pack validates ~once per worker (≈ CPU count) instead of once per file. This is the lever that lets the cache actually amortize.

### Why `isolate: false` is safe here

The engine is pure / event-sourced with no shared mutable module state; ids are random `ulid()`s (not module counters) and golden transcripts normalize them, so cross-file module isolation isn't relied upon. The one place that did rely on a fresh pack — a test mutating the shared pack in place (`effective-non-walk-speed` did `conditions.push(...)`) — was fixed to clone the pack instead; the deep-freeze is the backstop. The full suite passing green under `isolate: false` (578 files, 4490 tests) confirms no other cross-file dependency.

## Result

- Full suite: **~611s → ~143s** (~4.3×). "Collect" 2953s → 58s (summed). All 578 files / 4490 tests green. `test:fast` (slice 745) and CI's per-PR run benefit equally.

## Consumer note

`loadStarterPack()` now returns a **shared, frozen** instance. For immutable content this is correct (and faster for consumers, who previously re-validated on every call), but a consumer that mutated the returned pack would now throw. The engine never mutates content (content is read-only input; state is separate), so this is invisible to normal use.

## Files

- [src/content/packs/starter.ts](../../src/content/packs/starter.ts): memoized + deep-frozen `loadStarterPack`.
- [vitest.config.ts](../../vitest.config.ts): `isolate: false`.
- [tests/unit/engine/effective-non-walk-speed.test.ts](../../tests/unit/engine/effective-non-walk-speed.test.ts): builds its fixture pack by cloning rather than mutating the shared pack.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green (578 files, 4490 passed) in ~143s. Deep-freeze threw nothing (no remaining mutators); `isolate: false` surfaced no cross-file failures.

## Audit (Uncle Bob)

- **Root-cause fix**: removes redundant work (re-validating identical JSON) rather than masking it; benefits every run (dev + CI).
- **Safe sharing**: immutability made explicit via deep-freeze (silent cross-contamination → loud throw); the one real mutator fixed.
- **No behavior change to the engine**: same events, same state, same goldens; only the pack's parse-once + the test runner's isolation mode changed.
