# Slice 689 — infra: extract dndbnb into its own sibling project + repo

**Type:** Infra / doc cleanup. The dndbnb consumer app (~6093 LOC of React + TypeScript) and its Supabase migrations move out of this monorepo into a sibling [greghcarr/dndbnb](https://github.com/greghcarr/dndbnb) repo, mirroring the structure already used by [greghcarr/dnd-web](https://github.com/greghcarr/dnd-web). The engine is consumed as a sibling source checkout via Vite alias, exactly the pattern dnd-web uses.

## Why

The previous co-located arrangement was helpful when both projects iterated on each engine slice — engine edits hot-reloaded into dndbnb with no version-bump step. After the spatial cycle + GUI retirement (slices 683-686), the user has settled into a multi-project layout where each consumer (dnd-web, dndbnb, future VTTs) lives in its own repo. This slice closes the last in-repo consumer and brings dndbnb's structure in line with dnd-web's.

The engine itself stays focused on rules + content + audits, with no React / Supabase / @vitejs/plugin-react / etc. in its devDeps. Engine CI no longer runs dndbnb builds; dndbnb's own CI handles that. A `notify-dndbnb` workflow fires `repository_dispatch` at the dndbnb repo on every push to engine `main`, so engine slices still auto-redeploy dndbnb (just via a cross-repo dispatch instead of a single-repo build).

## What's deleted

- **`dndbnb/`** (~6093 LOC across 61 files): the React app — `index.html`, `styles.css`, `src/`, `BACKLOG.md`, `README.md`, `tsconfig.json`, `.env.local`, `.env.local.example`.
- **`supabase/`** (13 migrations `0001_init.sql` through `0013_characters_sort_order.sql`): dndbnb's DB schema; nothing in the engine references it.
- **`vite.dndbnb.config.ts`**: the dedicated Vite config for the in-repo dndbnb build.
- **`dist-dndbnb/`**: build artifact directory (was gitignored; cleaned from working tree).
- **`.github/workflows/deploy-dndbnb.yml`**: the deploy workflow that pushed the built bundle to greghcarr/dndbnb's `gh-pages` branch. Replaced by an in-repo `deploy-pages.yml` workflow on the sibling project.

## What's edited

- **`package.json`**: removed `dev:dndbnb`, `build:dndbnb`, `preview:dndbnb` scripts; removed dndbnb-only devDeps (`@supabase/supabase-js`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `obscenity`, `pdf-lib`, `react`, `react-dom`, `react-router-dom`, `zustand`). The engine's devDeps now contain only the test + build toolchain (`@types/node`, `@vitest/coverage-v8`, `fast-check`, `typescript`, `vite`, `vite-plugin-dts`, `vitest`).
- **`package-lock.json`**: regenerated after the devDep prune — 68 packages removed.
- **`README.md`**: removed the `[dndbnb/]` and `[supabase/]` rows from the "What lives in this repo" table.
- **`DEVELOPMENT.md`**: "Consumer integration" section rewritten to document the Vite-alias + sibling-checkout pattern (matching dnd-web and the new dndbnb), with the `file:../dnd-srd-engine` and `npm link` paths kept as alternatives. Names dndbnb and dnd-web as the two canonical sibling consumers.
- **`.github/workflows/notify-dndbnb.yml`** (new): fires `repository_dispatch: engine-updated` at greghcarr/dndbnb on every push to engine `main`. No-ops silently when the `DNDBNB_DISPATCH_TOKEN` secret is absent. Mirrors the pattern dnd-web already uses.
- **`tests/audit/doc-links.test.ts`**: added `.claude` to `SKIP_DIRS` (the local-only agent notes dir, gitignored, analogous to `node_modules`). Surfaces because the doc-links audit walks the filesystem, not git, and `.claude/notes/build-ideas.md` had a `../../dndbnb/` reference that the dir-move broke.
- **`docs/changelog/slice-632.md`**: one inline `../../dndbnb/` link rewritten to point at `https://github.com/greghcarr/dndbnb` with the parenthetical note that the consumer was co-located at the time of slice 632 and extracted in slice 689. The historical narrative of what was true at slice 632 is preserved; the link target just moves to the new home.

## What's preserved

- All mentions of "dndbnb" as an *example consumer* in source comments / test comments / docs (`tests/unit/engine/aura-of-protection.test.ts`, `src/schemas/events/combat.ts`, `docs/trustworthiness-roadmap.md`, etc.). These mentions are accurate: dndbnb still IS a canonical consumer; it just lives in a sibling repo now.
- All mentions inside frozen historical narrative (`docs/changelog/slice-686.md`, `docs/changelog/slice-632.md`). These document the monorepo state at the time of those slices.
- `docs/starter-pack-gaps.md`'s "Consumer-coordinated fact slots" section, which names dndbnb's encounter manager as one such consumer.

## What's set up on the sibling project (greghcarr/dndbnb)

(Out-of-scope-for-this-commit but documented here for the record.)

- New `main` branch with the extracted dndbnb source + standalone `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `CLAUDE.md`, `AGENTS.md`, `.github/workflows/deploy-pages.yml`.
- Default branch flipped from `gh-pages` to `main`.
- `gh-pages` branch left untouched (the deploy-pages-from-Actions flow doesn't write there; the existing gh-pages content is the prior deploy snapshot and is harmless to keep).
- One-time GitHub config required for the deploy to work (user task):
  - Repo Settings -> Pages -> Source = "GitHub Actions"
  - Repo Settings -> Secrets and variables -> Actions: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (copy from the engine repo's existing secrets, since the same Supabase project backs both layouts)
- Optional cross-repo trigger (user task): generate a fine-grained PAT scoped to greghcarr/dndbnb with `Actions: write` + `Metadata: read`, store as `DNDBNB_DISPATCH_TOKEN` in the engine repo's secrets. Without it, dndbnb only rebuilds on its own commits + manual `workflow_dispatch`.

The pre-existing `DNDBNB_DEPLOY_TOKEN` secret in the engine repo can be deleted (no longer used).

## Files

- Deleted: `dndbnb/` (61 files), `supabase/` (13 migrations), `vite.dndbnb.config.ts`, `dist-dndbnb/`, `.github/workflows/deploy-dndbnb.yml`.
- Edited: `package.json`, `package-lock.json`, `README.md`, `DEVELOPMENT.md`, `tests/audit/doc-links.test.ts`, `docs/changelog/slice-632.md`.
- Added: `.github/workflows/notify-dndbnb.yml`, `docs/changelog/slice-689.md`.

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run`: full suite green (state unchanged — engine code untouched).
- `npm run build`: ESM + CJS + `.d.ts` produced clean (no React-aware plugin left over).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.
- `npm run build`: clean.
- `npm install`: 68 packages removed without conflicts.
- Engine surface byte-identical: no schema, planner, derivation, reducer, or content change.

## RNG impact / Breaking change

**No engine-API change.** The deleted surface was a separate Vite-built React app + its dedicated CI workflow + its DB migrations. Every engine entry point, schema, planner, derivation, and reducer is byte-identical. Anyone who had `npm run dev:dndbnb` muscle memory uses the sibling project (`cd ../dndbnb && npm run dev`) now.

## Audit (Uncle Bob)

- **Scope**: deletion is scoped to the dndbnb-specific surface — its source tree, its DB migrations, its build config, its deploy workflow, its npm scripts, and its dev-only deps. Nothing engine-internal touched.
- **Pattern-check**: greppd the engine codebase for remaining live (non-archive, non-historical-doc) references to `dndbnb` and `supabase`. The remaining matches are all (a) accurate "example consumer" mentions in test/source comments, (b) frozen historical narrative in per-slice changelog files, or (c) Consumer-coordinated fact slots in starter-pack-gaps.md. None describe a co-located arrangement.
- **Workflow inventory**: confirmed `ci.yml` and `nightly-fuzz.yml` are unchanged. `deploy-dndbnb.yml` was deleted and `notify-dndbnb.yml` was added.

## Open follow-ups

- User completes the sibling-repo one-time GitHub setup (Pages source, Supabase secrets, optional dispatch token). Documented above.
- Engine repo's `DNDBNB_DEPLOY_TOKEN` secret can be deleted once user confirms the new flow works.
