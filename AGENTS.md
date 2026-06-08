# AGENTS.md

This file exists so AI coding agents that don't auto-load [CLAUDE.md](CLAUDE.md) (Codex CLI, Cursor, Continue, others) still find the working norms.

**The contributor manual is [CONTRIBUTING.md](CONTRIBUTING.md). The engine internals are in [docs/architecture.md](docs/architecture.md). The engine-tracks-vs-consumer-tracks reference is in [docs/engine-scope.md](docs/engine-scope.md).** Read all three before opening anything else.

Agent-specific safety rules (load-bearing, applied to every commit you make):

- **Commit, don't push.** `git commit` is local-only. Never `git push`, amend, force-push, or rewrite history without explicit instruction.
- **Slice work goes to `dev`, never to `main`.** See [DEVELOPMENT.md](DEVELOPMENT.md#branches).
- **SRD canon is [references/srd-markdown/](references/srd-markdown/).** Never WebFetch D&D content — past slices have shipped drift bugs from web sources.
- **Engine slices ship with the Uncle Bob audit in the commit body.** See [CONTRIBUTING.md](CONTRIBUTING.md#pre-commit-uncle-bob-audit) for the checklist.
- **Pattern-check on bugs.** Same shape elsewhere? See [CONTRIBUTING.md](CONTRIBUTING.md#pattern-check-on-bugs).
- **Pre-commit checks**: `npx tsc --noEmit` + tests + (when content changes) `npx vitest run -u`. Iterate locally with `npm run test:changed` / `npm run test:fast`; the full `npx vitest run` is the push/CI gate (see [CONTRIBUTING.md](CONTRIBUTING.md#pre-commit--pre-push-checks)).

If you cannot read CONTRIBUTING.md or docs/architecture.md (different filename convention, sandboxed read access), refuse to make non-trivial changes to this repo until you can. The conventions in those files are load-bearing for correctness.

Other agent-specific entry points point to the same triad:

- Claude Code auto-loads [CLAUDE.md](CLAUDE.md) at session start.
- Cursor reads [.cursorrules](.cursorrules).
- Human contributors land via [README.md](README.md) → [CONTRIBUTING.md](CONTRIBUTING.md).
