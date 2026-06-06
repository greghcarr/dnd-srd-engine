# Slice 692 — doc: clean-agent tune-up after the slice-689/690/691 cross-repo cycle

**Type:** Doc-only. Surfaces the sibling-consumer arrangement + slice-690 pre-push hook in the two places a fresh agent will look first: the auto-loaded CLAUDE.md and the README's "What lives in this repo" section. Engine surface byte-identical; no API change; no test change.

## Why

After the cross-repo cycle (slice 689 extracted dndbnb, slice 690 added the consumer-verification pre-push hook, slice 691 reverted the cross-repo auto-dispatch), three things became invisible to a fresh agent landing in this repo cold:

1. **The sibling consumers exist.** A fresh agent reading CLAUDE.md + README has no signal that dndbnb or dnd-web exist as separate downstream repos consuming this engine. They might propose breaking changes without knowing consumers will silently break.
2. **The pre-push hook exists.** A fresh agent that runs `git push origin main` (which they shouldn't anyway per the existing safety rule, but still) would see the push hang for 30+ seconds running unfamiliar consumer builds, with no doc surface explaining what's happening.
3. **Engine `main` is now load-bearing for two downstream apps.** Both consumers' deploys check out engine `main` at deploy time with no version pin. The "main always builds" contract is no longer just an internal nicety — it's the consumers' production pin.

This slice closes all three gaps with two targeted doc edits.

## What's edited

- **[../../CLAUDE.md](../../CLAUDE.md)**: new "Sibling-consumer awareness" subsection under "Agent safety rules", placed after "Pre-commit checks". Names the two consumer repos (with GitHub links + sibling-checkout paths), explains the pre-push hook, restates the engine-only conversation-scope rule already saved in memory ([[scope-engine-only-in-this-repo]]), notes that engine `main` IS the consumers' pin, and explicitly states consumers redeploy only on their own commits (no cross-repo auto-rebuild post-691). The closing sentence reassures: if a sibling consumer dir doesn't exist, the hook skips it with a warning — engine work doesn't require either consumer to be checked out.
- **[../../README.md](../../README.md)**: new `[.githooks/]` row in the "What lives in this repo" table, plus a new "Sibling consumers (separate repos)" subsection right after the table. The subsection has its own 2-row table naming the two consumer repos with live URLs + stack + one-line descriptions, plus a closing paragraph pointing at DEVELOPMENT.md's "Consumer integration" section for the Vite-alias pattern.

## What's NOT edited

- **[../../docs/architecture.md](../../docs/architecture.md)**: pre-edit grep confirmed zero stale `dndbnb`/`supabase`/co-located/`vite.dndbnb` mentions. The consumer-integration shape isn't an engine-internal concern — it belongs in DEVELOPMENT.md (already updated in slice 689) and in README/CLAUDE for discoverability. Architecture.md describes how the engine works; the consumer relationship doesn't change any of that.
- **[../../CONTRIBUTING.md](../../CONTRIBUTING.md)**: slice 690 already added the "Pre-push consumer verification" section. No further changes needed.
- **[../../DEVELOPMENT.md](../../DEVELOPMENT.md)**: slice 689 already rewrote the "Consumer integration" section. No further changes needed.

## Files

- Edited: `CLAUDE.md`, `README.md`.
- Added: `docs/changelog/slice-692.md`, CHANGELOG.md pointer.

## Tests

- `npx tsc --noEmit`: clean (no source touched).
- `npx vitest run tests/audit/doc-links.test.ts tests/audit/doc-size.test.ts tests/audit/doc-examples.test.ts`: green.

## Verification

- `npx vitest run tests/audit/`: full doc-audit pass.
- Manual: re-read CLAUDE.md top-to-bottom in agent-first-session mindset. The sibling-consumer subsection appears in the load-bearing rules block where a scanning agent will see it.
- Manual: load README at the "What lives in this repo" section. The new row + sub-section flow naturally; no broken layout.

## RNG impact / Breaking change

**No engine-API change.** Doc-only. Engine source, schemas, planners, derivations, reducers all byte-identical.

## Audit (Uncle Bob)

- **Scope**: only the two files where a fresh agent will first look. Targeted, no scattershot edits.
- **Pattern-check**: greppd `dndbnb`/`supabase`/`web/`/`vite.dndbnb`/`vite.web`/`deploy-dndbnb`/`deploy-demo`/`co-located`/`notify-dndbnb` across `docs/architecture.md`, `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md` pre-edit — confirmed all earlier slices (686, 689, 690, 691) had already pruned stale infra references in living docs. Only gap was "no positive mention of the sibling-consumer arrangement in the discoverability path"; this slice fills it.
- **DRY**: the load-bearing facts (consumer names, hook existence, main-is-pin) are stated once in CLAUDE.md and once in README. Cross-linked rather than duplicated.

## Open follow-ups

None. The cross-repo cycle (689-692) is closed; a fresh agent in any future session has a discoverable, accurate picture of the multi-repo structure.
