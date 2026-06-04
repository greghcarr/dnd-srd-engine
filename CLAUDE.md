# CLAUDE.md — Claude Code working file

You're an AI coding agent (Claude Code, or another tool that loaded this file) working in `dnd-srd-engine`. This file holds **agent-specific safety rules** plus pointers to the universal documentation. It is auto-loaded into your context for every session in this repo.

Most of what used to live here moved into general docs in slice 629. Read those once at the start of every session:

| What | Where | Why |
|---|---|---|
| Contributor manual (quality bar, slice cadence, Uncle Bob audit, SRD canon, doc-update obligations, pre-commit checks, code style, versioning) | [CONTRIBUTING.md](CONTRIBUTING.md) | Universal — applies to every contributor, human or AI. |
| Architecture internals (event sourcing, plan/commit, effect primitives, source map, planner shape, testing standard, system-agnostic seam) | [docs/architecture.md](docs/architecture.md) | Locked. Reference these when you need to know where things go and why. |
| Engine scope (what the engine tracks vs what the consumer tracks: positions, line of sight, light, narrative choices) | [docs/engine-scope.md](docs/engine-scope.md) | Reference when you're unsure whether a fact belongs in the engine or in a consumer's intent. |
| User-facing pitch + roadmap + status | [README.md](README.md), [docs/status.md](docs/status.md), [docs/roadmap.md](docs/roadmap.md) | Skim once per session. |
| Priority queue for next slices | [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) | Pick from "Future engine slices" or "Deferred primitives backlog." |
| Per-shape slice checklist | [docs/slice-template.md](docs/slice-template.md) | New planner vs new content vs new derivation. |

## Fresh-session quickstart

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/architecture.md](docs/architecture.md) before opening any code. The norms apply to every commit you make.
2. Skim [README.md](README.md) for the user-facing pitch and current "Status."
3. Confirm `references/srd-markdown/` exists in your worktree. If absent, surface that and run `git submodule update --init --recursive` rather than proceeding with web sources. **Never WebFetch D&D content** — past slices have shipped drift bugs from web sources.
4. Read [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) for the next-slice priority queue.
5. Pick a slice, follow [docs/slice-template.md](docs/slice-template.md), commit to `dev`, surface the work to the user.

## Agent safety rules (load-bearing — these duplicate CONTRIBUTING.md on purpose)

These rules are safety-critical for autonomous agents and are repeated here so they're in your context at every session, not just when you happen to open CONTRIBUTING.md.

### Commit, don't push

- Treat `git commit` as a **local-only** operation.
- Never run `git push` (or any other remote-modifying operation: `git push --force`, `git push origin`, branch deletions on origin, etc.) unless the user explicitly asks.
- Never run `git commit --amend`, `git rebase`, `git reset --hard`, or any history-rewriting operation without explicit instruction.
- Never skip hooks (`--no-verify`) or bypass signing without explicit instruction.
- If a pre-commit hook fails, fix the underlying issue and create a NEW commit. Do not amend the failed commit.

### SRD canon, never web sources

- [references/srd-markdown/](references/srd-markdown/) is the **only** valid source for SRD 5.2.1 rules text.
- **Never WebFetch D&D content** (Roll20 wiki, dndbeyond, third-party fan sites). They are 2014-PHB-flavored or third-party variants and have introduced drift bugs.
- If the submodule directory is empty, stop and surface that — don't substitute web lookups.

### Branch and slice rules

- All slice work goes to `dev`, never directly to `main`. See [DEVELOPMENT.md](DEVELOPMENT.md#branches) for the flow.
- One coherent slice per commit. Three valid shapes: engine primitive + canonical user, content sweep, doc / workflow / infra change. See [CONTRIBUTING.md](CONTRIBUTING.md#slice-cadence).
- Engine slices ship with the pre-commit Uncle Bob audit in the commit body. See [CONTRIBUTING.md](CONTRIBUTING.md#pre-commit-uncle-bob-audit) for the checklist.

### Pattern-check on bugs

When you find a bug, audit gap, or inconsistency, do not fix only the surfaced instance. Check the codebase for the same pattern elsewhere; fix all instances, or fix the canonical case and track the rest. The pattern is well-established in this repo and easy to forget under task-completion pressure. Full treatment with examples + the two failure modes (filter-too-narrow / under-walking-references) in [CONTRIBUTING.md](CONTRIBUTING.md#pattern-check-on-bugs).

### Doc updates per slice

Every slice writes a per-slice file at `docs/changelog/slice-NNN.md` plus a 3-line pointer in [CHANGELOG.md](CHANGELOG.md). Other doc updates (starter-pack-gaps, status, api-overview, roadmap) trigger only when the slice touches the relevant surface. Full list + templates in [CONTRIBUTING.md](CONTRIBUTING.md#doc-updates-per-slice) and [CONTRIBUTING.md](CONTRIBUTING.md#changelog-entry-shape).

### Pre-commit checks (run all three)

- `npx tsc --noEmit` — vitest does not typecheck. Always run separately.
- `npx vitest run` — full suite. Must be green.
- `npx vitest run -u` — only when adding wired conditions, items, or other content that feeds the coverage snapshot. Inspect the diff.

If a check fails, fix the cause. Never `--no-verify` or skip.

## Engineering quality framing (internal, not for marketing copy)

The "Quality bar" section of [CONTRIBUTING.md](CONTRIBUTING.md#quality-bar) is the user-facing framing. Internally, the engine is held to a library-quality standard: TypeScript strict mode (`noUncheckedIndexedAccess`), deterministic replay, plan/commit RNG capture, 80%+ coverage on `src/engine/` / `src/derive/` / `src/effects/`, golden transcripts on every behavior change, drift-audited content against the SRD markdown clone.

Do not advertise this framing on public-facing surfaces (README, package.json description, repo description, marketing). The work speaks through the code, tests, and transcripts. Quality labels in marketing copy are noise.

## If anything below conflicts with above

The norms in [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/architecture.md](docs/architecture.md) are canonical. This file is a safety-rail summary + pointer index for agents. If you find a contradiction, the linked docs win and this file needs updating.
