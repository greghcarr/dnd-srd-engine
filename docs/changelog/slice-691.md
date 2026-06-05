# Slice 691 — infra: revert the cross-repo `notify-dndbnb` auto-dispatch

**Type:** Infra reversal. Removes the engine-side `notify-dndbnb` workflow added in slice 689. Engine surface byte-identical; no API change.

## Why

Slice 689's cross-repo dispatch was set up so that every push to engine `main` auto-redeployed dndbnb. The user prefers the symmetric "consumers rebuild only on their own main commits" model — both consumers behave identically (manual or own-commit-triggered redeploy), and engine slices land on their own cadence without auto-fanning out to consumer deploys.

The asymmetry that slice 689 introduced (dndbnb auto-redeploys, dnd-web doesn't) was the trigger for the question; the resolution is to remove the engine-side dispatch entirely rather than add the symmetric dnd-web one.

## What's deleted

- **[.github/workflows/notify-dndbnb.yml]**: the workflow that fired `repository_dispatch: engine-updated` at greghcarr/dndbnb on every engine main push. Gone.

## What's preserved

- [.github/workflows/ci.yml] (engine's own CI). Unchanged.
- [.github/workflows/nightly-fuzz.yml] (nightly fuzz audit). Unchanged.
- The slice-690 `.githooks/pre-push` hook (verifies both consumers' builds when pushing engine main). Unchanged — the local pre-push verification is independent of the cross-repo auto-rebuild trigger.

## What's edited

- **[docs/changelog/slice-689.md]**: the `notify-dndbnb.yml` bullet in slice 689's "What's edited" section now carries a strikethrough + "Reverted by slice 691" annotation, per the standing CHANGELOG closure-annotation convention (later slices that close or reverse a prior decision get strikethrough + a "Closed/Reverted by slice N" tag in-place; preserves the historical accuracy of the prior slice's narrative while making the current state discoverable).

## Consumer-side cleanup (out-of-scope-for-this-commit, user task)

Two optional cleanups in the consumer repos. Each is a one-line change in the consumer's deploy workflow + a secret deletion. The user can do them in the consumer-side Claude Code sessions per the engine-only scope rule for this conversation.

- **greghcarr/dndbnb `.github/workflows/deploy-pages.yml`**: drop the `repository_dispatch: types: [engine-updated]` listener (nothing fires it now). Cosmetic; the listener is harmless either way.
- **greghcarr/dnd-web `.github/workflows/deploy-pages.yml`**: same drop, same cosmetic-only.
- **greghcarr/dnd-srd-engine repo secrets**: delete `DNDBNB_DISPATCH_TOKEN` (no longer referenced by any workflow). Optional.

## Tests

- `npx tsc --noEmit`: clean (no source code touched).
- `npx vitest run`: green (no test surface touched).

## Verification

- `ls .github/workflows/`: lists `ci.yml`, `nightly-fuzz.yml`. `notify-dndbnb.yml` is gone.
- `gh workflow list`: should show only the two remaining workflows once the merge commit lands on main.

## RNG impact / Breaking change

**No engine-API change.** Engine source, schemas, planners, derivations, reducers all byte-identical. The only behavior change is: post-merge, pushing engine `main` no longer triggers a dndbnb redeploy. dndbnb will redeploy on its own main commits or a manual `workflow_dispatch`.

## Audit (Uncle Bob)

- **Scope**: single-file deletion + one annotation on slice 689's doc. Nothing else touched.
- **Pattern-check**: confirmed no other workflow (`ci.yml`, `nightly-fuzz.yml`) references `notify-dndbnb`. Confirmed no live doc outside the per-slice changelog references the workflow. Slice 689's narrative is preserved with a closure annotation (historical accuracy of what shipped at slice 689 stays; current-state pointer added).
- **Consumer impact**: the dispatch was a one-way push from engine to dndbnb. Removing the source-side workflow stops the push; dndbnb's listener becomes dead code (harmless) until the consumer-side Claude removes it.

## Open follow-ups

None on the engine side. Consumer-side cleanups listed above are user tasks for the consumer Claude sessions; deferred until the user picks them up.
