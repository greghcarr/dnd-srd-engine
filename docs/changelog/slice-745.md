# Slice 745 — infra: fast local test lanes + local-fast / CI-full testing norm

**Type:** Workflow / infra (scripts + docs). No source change.

## Why

The full suite takes ~10 minutes. Profiling showed the dominant cost is a **content-pack validation tax**: `loadStarterPack()` zod-validates the whole pack at ~1.6s per call, and ~570 test files do it at module load. The suite is CPU-bound across workers. Running the full suite after every small edit during development is wasteful.

This slice establishes a **local-fast / CI-full** workflow so the full suite runs at the push/PR gate rather than after every slice. (A separate perf slice will attack the validation tax itself so the full suite is faster everywhere — see below.)

## What changed

- **`npm run test:changed`** → `vitest run --changed`: runs only the tests affected by the current edits (the tight iteration loop — seconds for a typical source/test change). Note: a change to `package.json` or a config file is a global invalidation that runs everything (expected; ordinary source/test edits run only the affected files).
- **`npm run test:fast`** → the full suite minus the heavy tiers via a single brace-glob exclude (`{tests/property/**,tests/integration/**,**/fuzz-matrix.test.ts,**/fuzz-tactical-matrix.test.ts,**/multiclass-fuzz.test.ts}`). vitest 1.6.1 mis-parses repeated `--exclude` flags, so the exclusions are one brace pattern. A broad correctness check that skips the slowest execution tiers.
- **CONTRIBUTING.md + CLAUDE.md**: the pre-commit section is now "pre-commit / pre-push." Per slice (local, fast): `tsc` + `test:changed` / `test:fast` (+ `-u` when touching the coverage snapshot). Before pushing (the full gate): `npm test` (full suite), which CI also runs on every PR across Node 20/22/24.

## Scope note

`test:fast` still pays the per-file validation tax (it's on nearly every file, not just the excluded tiers), so it's only a moderate win over the full run; `test:changed` is the big iteration lever. The validation tax itself is the target of the planned perf slice (cache the validated pack + `isolate: false`, after fixing the one pack-mutating test and auditing for other shared-state isolation hazards), which will speed up dev and CI alike.

## Files

- [package.json](../../package.json): `test:changed`, `test:fast` scripts.
- [CONTRIBUTING.md](../../CONTRIBUTING.md), [CLAUDE.md](../../CLAUDE.md): the local-fast / CI-full norm.

## Verification

- `npx tsc --noEmit`: clean (no source change). The `test:fast` brace-glob exclude was validated against `tests/audit` (30 files vs 33 — the 3 fuzz matrices correctly dropped). No behavior change, so the suite state is unchanged from the slice-744 full-green run.
