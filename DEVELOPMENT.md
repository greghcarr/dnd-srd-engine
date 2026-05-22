# Development

## Branches

Two long-lived branches:

- `main`: stable, releasable, tagged. Slice work **never** lands directly here. Treat it as the "what a fresh clone should see" reference.
- `dev`: daily slice work. All slice commits land here first. Periodically merged into `main` when a coherent group of slices is ready to ship.

### Working flow

1. Start a session by checking out (or creating) `dev`: `git checkout dev` (or `git checkout -b dev` if it doesn't exist yet locally).
2. Do slice work on `dev`. One slice per commit; commit early and often.
3. Pre-commit checks: `npx tsc --noEmit && npx vitest run`. Both must be green.
4. After a slice commits cleanly, surface it to whoever is steering the session (typically the user). They decide when `dev` rolls into `main`.
5. Never push or merge to `main` without explicit instruction. See [CLAUDE.md](CLAUDE.md#commit-dont-push) for the full git-safety rules.

### Branch-from rules

- Slices generally branch off `dev` (or commit directly to it for small slices). For a larger refactor that may want extra review before merging into `dev`, create a feature branch off `dev` and merge back when ready.
- For parallel engine + content authoring, see [docs/parallel-authoring.md](docs/parallel-authoring.md). Worktrees still target `dev` (or per-worktree feature branches that merge to `dev`).
- Never create branches that target `main` directly.

## First-time setup

Clone with submodules so the SRD markdown comes along:

```
git clone --recurse-submodules https://github.com/greghcarr/dnd-srd-engine.git
cd dnd-srd-engine
npm install
```

If you cloned without `--recurse-submodules`, populate the submodule afterward:

```
git submodule update --init --recursive
```

`references/srd-markdown/` is the canonical SRD 5.2.1 source (CC-BY-4.0). All content audits, drift checks, and RAW citations point at it. See [CLAUDE.md](CLAUDE.md#srd-is-canon-use-the-local-clone) for why web lookups are off the table.

## Commands

```
npm install            # install deps
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run test:watch     # vitest in watch mode
npm run test:coverage  # vitest with coverage gates
npm run build          # vite build + .d.ts emit
npm run ci             # typecheck + coverage + build (full gate)
```

## Adding a new effect primitive

1. Add the discriminated-union variant in [src/schemas/effects.ts](src/schemas/effects.ts) (both the `Effect` type and the `EffectSchema` Zod definition).
2. Add the `EFFECT_KINDS` entry.
3. Add interpretation in [src/effects/builder.ts](src/effects/builder.ts) `applyEffectToBuilder` if the primitive contributes statically to the effect stack. Triggered primitives (`OnEvent`) are handled by the trigger system instead.
4. Add reducer tests for any features that exercise the new primitive end to end (via a golden scenario).

## Adding a new event type

1. Add schema in [src/schemas/events/](src/schemas/events/) and re-export from [src/schemas/events/index.ts](src/schemas/events/index.ts) (including `EVENT_TYPES` and the discriminated union).
2. Add reducer in [src/engine/reducers/](src/engine/reducers/).
3. Wire into [src/engine/apply.ts](src/engine/apply.ts): both the import at the top and the switch case in `apply()`. Both edits are easy to forget, the resulting bug surfaces only at runtime as `Unhandled event`.
4. Reducer unit test in [tests/unit/reducers/](tests/unit/reducers/).
5. At least one golden scenario in [tests/golden/](tests/golden/) emits the event so the replay-equivalence gate covers it.
6. If the event involves RNG, the resolution event must carry the baked roll. Verify by including the new flow in a `ThrowOnCallRNG` test (apply with a no-RNG must not throw).

## Adding a new planner

1. Add `src/engine/plan/<thing>.ts` with the intent type and the `plan*` function.
2. Re-export from [src/engine/plan/index.ts](src/engine/plan/index.ts).
3. Add to the `Engine['plan']` type in [src/engine/index.ts](src/engine/index.ts) and to `planNs` in `createEngine`.
4. Re-export from the public barrel [src/index.ts](src/index.ts).
5. Planner test: deterministic for fixed seed, different seeds produce different rolls, applied events do not call RNG.

## Versioning

Bump policy, pre-release tag meanings (alpha / beta / rc), promotion criteria, and the roadmap to 1.0.0 are in [VERSIONING.md](VERSIONING.md). Short version: don't bump on every PR, treat ambiguous changes as breaking, update CHANGELOG with every release.

## Cutting a release

A release promotes a coherent group of `dev` slices to `main` under a tag. The headline content counts (spells, items, monsters, conditions, `EFFECT_KINDS`, the spell wired/narrative/deferred split) are guarded per-commit by [tests/audit/doc-counts.test.ts](tests/audit/doc-counts.test.ts) + [tests/audit/gaps-spells-counts.test.ts](tests/audit/gaps-spells-counts.test.ts), so they are always accurate. The headline "N tests across M files" total used to be reconciled at release time, but slice 433 removed it from README.md + docs/status.md entirely under the "CI-guarded or not stated" rule (it drifts every commit and isn't worth a per-slice guard, so the docs now make the qualitative claim and let the guarded content counts carry the precision).

On `dev`, before merging to `main`:

1. `npm run release:doc-counts`: a now-optional safeguard. With the "N tests across M files" citation removed (slice 433) it prints a "no citation found" warning and does nothing; keep running it so that if a precise test/file total ever creeps back into the front-door docs it gets caught and reconciled to the live count rather than shipping stale.
2. `npm run release:doc-review`: read-only report of the front-door percentages and wired-counts that are NOT cleanly machine-derivable. For each figure it prints the ground-truth signal, every doc line that cites it, and a verdict (COMPUTED -> MATCH / DRIFT; JUDGMENT -> confirm against the signal). Fix any DRIFT; for JUDGMENT figures (magic-item / subclass / primitive maturity %, the headline aggregate) confirm the estimate against its signal and recent slices. **When any number changes, re-read the full sentence it sits in for stale accompanying text**; the report lists the surrounding line precisely, so this is a read, not a hunt.
3. Bump `version` in [package.json](package.json) and regenerate `package-lock.json` (`npm install --package-lock-only`).
4. Bump `SCHEMA_VERSION` in [src/version.ts](src/version.ts) only if persisted shapes changed (see Schema migrations below).
5. Promote the `## Unreleased` CHANGELOG heading to `## <version> - <date>` and add a fresh empty `## Unreleased` above it. **Then evict the previously-latest release narrative** (the one now second from the top) and its cohort pointers to a `docs/changelog/released-versions-<range>.md` archive, re-rooting its links, leaving only the new release + Unreleased + the "Older releases" pointer inline. The live CHANGELOG holds only the active cycle; never let completed release entries accumulate inline (this is the rule that stops the split treadmill, see CLAUDE.md "Doc size discipline"). When a `released-versions-<range>.md` approaches the 60 KB ceiling, start a new range file rather than growing it.
6. `npm run ci` (typecheck + coverage + build) must be green.
7. Merge `dev` into `main` and tag (`git tag v<version>`). **Only on explicit instruction**, see [CLAUDE.md](CLAUDE.md#commit-dont-push).

`npm run release:doc-counts:check` is the non-writing variant (exits non-zero if stale); use it in CI if the release ever becomes automated.

## Schema migrations

Bump `SCHEMA_VERSION` in [src/version.ts](src/version.ts) and add a migration function in [src/migrations/](src/migrations/) in the same PR as the breaking schema change. Migration test accompanies it. `SCHEMA_VERSION` is independent of the package version, see [VERSIONING.md](VERSIONING.md) for the contract.

## Consumer integration

For local development from a consumer app (e.g. `dndbnb`):

```jsonc
// in the consumer's package.json
"dependencies": {
  "dnd-srd-engine": "file:../dnd-srd-engine"
}
```

Or use `npm link` for tighter iteration loops.

## House rules

- No em dashes or en dashes anywhere (code, comments, docs, error messages). Use commas, parentheses, colons, or separate sentences.
- No magic numbers or strings. Extract to named module-scope constants. The 5.5e rules contain many of these (hit die averages, death save thresholds, exhaustion cap, ability score range). Each gets a name.
- Reducers stay small. If `applyFoo` grows past about 30 lines, extract named helpers. The reducer reads as a sequence of named operations.
- No defensive error handling for impossible cases. Trust types. Use `invariant()` only for genuine preconditions on incoming events.
