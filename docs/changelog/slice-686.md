# Slice 686 — infra: retire the in-repo combat-fuzzer web demo

**Type:** Infra / doc cleanup. The browser GUI built around the combat-fuzz replay viewer has moved to an adjacent project; this slice removes it from the engine repo. **The fuzz CODE stays** — `scripts/combat-fuzz.ts` (CLI) and `scripts/combat-fuzz-core.ts` (pure simulator) remain in-repo as engine-debug surfaces and continue to back `tests/audit/fuzz-matrix.test.ts`, `tests/audit/multiclass-fuzz.test.ts`, `tests/integration/combat-fuzz-flags.test.ts`, and `tests/integration/combat-fuzz-pool-loadouts.test.ts`.

## Why

The web demo (slice 32, expanded across slices 583-619) lived under `web/` and shipped to GitHub Pages from this repo. It depended on the engine source directly via a Vite alias (dev) and on `dist/` (production), so engine work shipped instantly to the demo. That tight coupling is no longer wanted: the user is moving the GUI into a sibling project so it can evolve on its own cadence without forcing engine-repo CI to also pass front-end concerns.

The engine continues to ship `scripts/combat-fuzz.ts` for transcript-style debugging and the fuzz tests for CI coverage. No engine surface is affected.

## What's deleted

- **`web/`** (entire directory, ~14 files): the Vite app — `main.ts`, `engine-host.ts`, `index.html`, `styles.css`, `tsconfig.json`, `modes/event-inspector.ts`, `modes/fuzz-replay.ts`, `scenarios/*.ts`, `ui/*.ts`, and `README.md`.
- **`vite.web.config.ts`**: the dedicated Vite config for the demo.
- **`dist-web/`**: build artifact directory (was gitignored; cleaned from working tree).
- **`tests/integration/web-scenarios.test.ts`**: CI replay-equivalence test for the demo scenarios. Equivalent coverage continues via the engine's own golden + integration scenario suites.
- **`tests/unit/web-scrub-cache.test.ts`**: scrub-cache unit test that lived alongside the demo's step-through replay viewer.
- **`docs/web-demo-plan.md`**: architecture / decisions doc for the retired demo.
- **`.github/workflows/deploy-demo.yml`**: the GitHub Pages deploy workflow. The other workflows (`ci.yml`, `deploy-dndbnb.yml`, `nightly-fuzz.yml`) are unaffected.

## What's edited

- **`package.json`**: removed the `dev:web`, `build:web`, `preview:web` scripts.
- **`tsconfig.json`**: dropped `web/scenarios/**/*.ts` from `include` and `dist-web` from `exclude`.
- **`vite.dndbnb.config.ts`**: tightened header comments (removed parallel references to the retired `vite.web.config.ts`).
- **`README.md`**: removed the "Try it in your browser" paragraph, the `[web/]` row from the "What lives in this repo" table, and the three web-demo rows from the "Documentation" table.
- **`docs/roadmap.md`**: replaced the live link/source/plan/CI/deploy crosslinks inside the Slice 32 entry with a brief retirement note ("Slice 686 retired the in-repo web demo; the GUI moved to a sibling project"). The historical narrative of what shipped at slice 32 stays intact.
- **`tests/audit/doc-examples.test.ts`**: dropped `dist-web` from `SKIP_DIRS` (the directory no longer exists).
- **`tests/audit/doc-links.test.ts`**: extended `SKIP_PREFIXES` with `docs/changelog/archive-` and `docs/changelog/released-versions` — these are frozen historical narrative whose links to since-removed paths (including the now-gone `web/`) are accurate snapshots of past state and shouldn't trigger CI churn when the live repo evolves. Same skip rationale as `references/srd-markdown` (vendored).

## What's preserved (the fuzz code)

- **`scripts/combat-fuzz.ts`**: CLI front door — arg parsing, fs writes, markdown summary generation. `npx tsx scripts/combat-fuzz.ts --count 10 --seed 1 --level 3 --mode 2v2 --out /tmp/fuzz` still works exactly as before.
- **`scripts/combat-fuzz-core.ts`**: pure simulator (no node:fs / process / argv). The web demo imported this; now only the CLI + the in-repo fuzz tests consume it.
- **`tests/audit/fuzz-matrix.test.ts`**: 36-cell × 30-seeds-per-cell fuzz matrix audit (slices 644 / 651 / 674).
- **`tests/audit/multiclass-fuzz.test.ts`**: 50-seed L1+L1 multiclass build audit (slice 676).
- **`tests/integration/combat-fuzz-flags.test.ts`** and **`tests/integration/combat-fuzz-pool-loadouts.test.ts`**: the slice-585 CLI-shape pinning tests.

## Files

- Deleted: `web/` (15 files), `vite.web.config.ts`, `dist-web/` (untracked artifact dir), `tests/integration/web-scenarios.test.ts`, `tests/unit/web-scrub-cache.test.ts`, `docs/web-demo-plan.md`, `.github/workflows/deploy-demo.yml`.
- Edited: `package.json`, `tsconfig.json`, `vite.dndbnb.config.ts`, `README.md`, `docs/roadmap.md`, `tests/audit/doc-examples.test.ts`, `tests/audit/doc-links.test.ts`.

## Tests

- Full suite: 540 files / 4,118 passing + 173 skipped (was 542 / 4,140 post slice 685; -2 files / -22 tests = exactly the two retired web test files).
- `npx vitest run tests/audit/doc-links.test.ts`: green (after the SKIP_PREFIXES extension for archive / released-versions).
- `npx vitest run tests/audit/doc-size.test.ts tests/audit/doc-examples.test.ts`: green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.
- Manual: `npm run dev:web` / `build:web` / `preview:web` are no longer in `package.json` (npm exits with the usual missing-script error).

## RNG impact / Breaking change

**No engine-API breaking change.** The deleted surface was a separate Vite-built browser app + its CI scenario test, plus the doc surfaces describing it. Every engine entry point, schema, planner, derivation, and reducer is byte-identical. The fuzz simulator code (which IS imported by the in-repo fuzz tests) is unchanged.

Anyone who had `npm run dev:web` muscle memory will see that script no longer exists. The replacement is the sibling-project repo's equivalent (out of scope for this changelog).

## Audit (Uncle Bob)

- **Scope**: deletion is scoped to the GUI and its dedicated doc/CI surface. The fuzz simulator survives because it's a pure-data engine debug tool, not a GUI surface.
- **DRY**: no remaining duplicate of the deleted code in-repo; the sibling project will fork and own it.
- **Pattern-check**: greppd live (non-archive) docs for `web/`, `dist-web`, `vite.web`, `dev:web`, `build:web`, `preview:web`, `web-demo`, `deploy-demo` — zero matches post-edit. Historical archive doc references stay (frozen narrative) and are now exempt from the link audit by SKIP_PREFIXES extension.
- **Workflow inventory**: confirmed `ci.yml`, `deploy-dndbnb.yml`, and `nightly-fuzz.yml` are unchanged. Only `deploy-demo.yml` was deleted.

## Open follow-ups

None. The cycle of in-repo web demo (slices 32 / 583-619) is closed.
