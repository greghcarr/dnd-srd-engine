# Slice 747 — docs: freshness sweep for the 737-746 cohort

**Type:** Docs. No source change. Reconciles the documentation with everything shipped on `dev` since the v0.9.0-alpha.0 release (slices 737-746): fuzz-to-L20, L7 SRD complete, the Rage / active-state bug fixes, and the test-workflow + perf changes.

## Method

Parallel read-only audit across the headline / API / gaps / architecture+dev docs, each agent briefed with the exact current state, returning specific `file:line` staleness with suggested fixes; the edits were then applied and verified. The CI-guarded numeric counts (EFFECT_KINDS / conditions / spells via doc-counts) were already accurate — the target was stale **prose**.

## Fixes

- [README.md](../../README.md): fuzz CLI flag `--level 1..5` → `--level 1..20` (FUZZ_MAX_LEVEL is 20 since slice 737; the line was internally inconsistent with the surrounding "L1-L20 PCs" prose).
- [docs/api-overview.md](../api-overview.md): effect-vocabulary count `53 kinds (52 primitives)` → `68 kinds (67 primitives)`; added the five newer `engine.plan.*` methods that the planner enumeration omitted — `naturalRecovery`, `wildResurgence`, `memorizeSpell`, `countercharm` (class-specific) and `naturalRecovery` + `darkOnesOwnLuck` (subclass-feature, outcome-returning).
- [docs/architecture.md](../architecture.md): `52 primitives` → `67`. [docs/concepts.md](../concepts.md): dropped a stale `~30 effect primitives` (now unnumbered, deferring to the authoring guide).
- [docs/starter-pack-gaps.md](../starter-pack-gaps.md): the Coverage rows + a new "Current cadence" callout now state L1-L7 are SRD-complete (floor-audited) and **L8 is the next level cycle**, instead of the pre-completion "most L2+ rows ship empty."
- [docs/gaps-deferred-primitives.md](../gaps-deferred-primitives.md): added the two deferrals the cohort introduced — Rage's full duration/maintenance lifecycle ("Scope B", slices 743/744) and Barbarian Instinctive Pounce positional movement (slice 741).
- [DEVELOPMENT.md](../../DEVELOPMENT.md) + [AGENTS.md](../../AGENTS.md): the per-commit "full `vitest run`" framing → the slice-745 local-fast / push-full norm (`test:changed` / `test:fast` locally; full `npm test` is the push/CI gate), and the two scripts added to the command list.

## Durability

The two prose EFFECT_KINDS citations that had silently drifted (api-overview `53`, architecture `52`) were the only EFFECT_KINDS mentions not yet covered by the doc-counts guard — both are now **pinned** in [tests/audit/doc-counts.test.ts](../../tests/audit/doc-counts.test.ts), so a future `EFFECT_KINDS` bump fails CI until they're updated, the same way the README/status/concepts/authoring citations already do.

## Audited, already current (no change)

status.md, roadmap.md, trustworthiness-roadmap.md (point-in-time snapshots that defer to status.md), getting-started.md, engine-scope.md, determinism.md, authoring-content-packs.md.

## Verification

- `npx tsc --noEmit`: clean. `doc-counts` (now 21 cases, +2 pins) + `doc-links` green. Docs-only; no behavior change.
