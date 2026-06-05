# Slice 690 — infra: pre-push hook verifying sibling consumers + `+dirty` engine-SHA marker in consumers

**Type:** Infra / dev-workflow safety net. Two coordinated additions across three repos that catch the two new failure modes introduced by slice 689's sibling-checkout structure (engine + dndbnb + dnd-web). Engine surface byte-identical; no API change.

## Why

After slice 689 extracted dndbnb from the monorepo, the engine + dndbnb + dnd-web triangle has two failure modes that the previous co-located arrangement made invisible:

1. **Engine main breaks a consumer's build.** The engine's CI doesn't know either consumer exists, so an engine change that compiles cleanly in `dnd-srd-engine` can still break a consumer's TypeScript build or rollup pass. The first place you'd find out is the consumer's next deploy.
2. **Local consumer build secretly uses uncommitted engine code.** Both consumers' Vite configs resolve `dnd-srd-engine` → `../dnd-srd-engine/src/index.ts` on disk *right now*, so engine edits you haven't committed (let alone pushed) silently make it into a locally-running consumer. The version-badge SHA matches the engine's current HEAD commit, which lies about the contents of the bundle. The deployed bundle will be different.

This slice closes both gaps with small, isolated mechanisms.

## What's wired

### Engine repo: `.githooks/pre-push` (new)

- Bash script. Activates via `git config core.hooksPath .githooks`, which the `prepare` script in `package.json` runs automatically on `npm install` (so a fresh clone + `npm install` gets the hook for free; no separate setup step).
- Triggers ONLY when the local `main` ref is being pushed. Pushes to `dev` or other branches are unaffected — `main` is what consumers' deploys check out via `ref: main`, so it's the only branch where engine changes can reach a consumer.
- For each sibling consumer that exists at `../dndbnb` or `../dnd-web`:
  - Skip with a warning if the dir has no `package.json` (not a project) or no `node_modules` (not installed; the contributor needs to `npm install` there separately first).
  - Otherwise `cd` in and run `npm run typecheck && npm run build`. Either failing aborts the push with a clear message and a pointer to the escape hatch.
- Escape hatch: `SKIP_CONSUMER_CHECKS=1 git push origin main`. For emergencies (hotfix to engine main where the consumer breakage is already known + tracked).
- No siblings found → message + allow push. Hook is non-blocking when no siblings to verify (e.g., a fresh clone with only the engine).

### Engine repo: `package.json` `prepare` script

- New line: `"prepare": "git config core.hooksPath .githooks 2>/dev/null || true"`.
- npm runs `prepare` after `npm install`, so any contributor (or CI runner that runs `npm install`) gets the hooks path configured automatically. The `2>/dev/null || true` makes it a no-op in environments without git (e.g., a tarball install in a Docker layer).

### Engine repo: CONTRIBUTING.md note

- New "Pre-push consumer verification" section between "Pre-commit checks" and "Code style". Documents the hook, what it does, when it fires, and the escape hatch. Cross-links the `.githooks/pre-push` script + `package.json`.

### Consumers: `+dirty` marker on the engine SHA

Both [greghcarr/dndbnb](https://github.com/greghcarr/dndbnb) and [greghcarr/dnd-web](https://github.com/greghcarr/dnd-web) get the same vite.config.ts change (committed separately to each repo, not part of this engine slice):

```ts
const dirty = execSync(`git -C "${ENGINE_ROOT}" status --porcelain`, { encoding: 'utf8' }).trim();
if (dirty.length > 0) engineSha += '+dirty';
```

Non-empty `status --porcelain` output → append `+dirty` to the SHA. The version-badge then reads e.g. `dnd-web 0.2.0-pre-alpha / engine 0.4.0-alpha.0 (83ebbae+dirty)` whenever the engine has uncommitted changes. In CI the engine is freshly checked out clean, so `+dirty` never appears on the deployed badge.

Together, the two pieces cover both failure modes:
- Failure mode 1 (engine breaks a consumer's build): the engine pre-push hook catches it before push reaches `main`.
- Failure mode 2 (local consumer secretly uses uncommitted engine code): the `+dirty` marker makes it visible in the running build's version-badge.

## Files (this engine slice only)

- Added: [.githooks/pre-push](../../.githooks/pre-push), [docs/changelog/slice-690.md](slice-690.md).
- Edited: [package.json](../../package.json) (`prepare` script), [CONTRIBUTING.md](../../CONTRIBUTING.md) ("Pre-push consumer verification" section).

## Files (sibling consumer commits, for the record)

- greghcarr/dndbnb commit `1096ae4` "ui: version-badge appends '+dirty' when engine has uncommitted changes" — 1 file (`vite.config.ts`), 8 lines.
- greghcarr/dnd-web PR #2, commit `9d4e855`, same shape.

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green (no test-affecting changes in this slice).
- Hook activation: `git config --get core.hooksPath` returns `.githooks` after `npm install` (verified locally).
- Hook execution end-to-end: pushed slice 690 to dev (`dev` push does not trigger the hook — the trigger gates on `refs/heads/main`); a subsequent push of this slice to `main` (via the release PR) will exercise the hook for the first time.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.
- `bash .githooks/pre-push </dev/null`: returns 0 (no refs being pushed → no-op), confirming the script parses cleanly.
- `+dirty` marker tested end-to-end on the dndbnb side: touched engine's `README.md`, rebuilt dndbnb, confirmed bundle SHA literal became `83ebbae+dirty`; reverted the engine edit + rebuild restored bare `83ebbae`.

## RNG impact / Breaking change

**No engine-API change.** Pure infra. The hook only fires on pushes to `main` from a developer's machine; it cannot affect what gets deployed (the deploy already happens from CI, which doesn't run local hooks). Any contributor who clones the repo without running `npm install` gets the old no-hook behavior — the hook is opt-in via the standard package install flow, not a hard gate.

## Audit (Uncle Bob)

- **Scope**: this slice does only what its title says — adds the hook + the package.json `prepare` line + the doc note. No engine code touched; no test suite touched; no schema touched.
- **DRY**: the hook is one file, sibling list is one bash array near the top. Add a future consumer (e.g., a third sibling app) by appending one path.
- **SRP**: the hook has one job (verify siblings against the about-to-push engine state). Nothing else.
- **Magic numbers**: none. Sibling paths are named near the top.
- **Pattern-check**: the hook follows the same opt-out-via-env-var pattern (`SKIP_CONSUMER_CHECKS=1`) that elsewhere in the repo uses (e.g., `npm run release:doc-counts:check`'s skip semantics). Consistent with the project's "always verifiable, never forced" stance on local automation.

## Open follow-ups

- After PR merge: confirm the hook fires on the next push to engine `main` and both consumers verify green. If a consumer's build hits a sibling-checkout issue (e.g., the dndbnb sibling has no `node_modules` on the dev's machine), the hook reports it and skips — running `npm install` in the affected sibling resolves it.
- Future consideration: a `pre-commit` hook for each consumer that runs `npm run typecheck` against the current engine state. Symmetrical to this slice (engine checks consumers; consumers check themselves against the engine). Deferred until needed.
