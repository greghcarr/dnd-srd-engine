# Slice 776 — cross-platform / fresh-agent hardening (Windows readiness)

**Type:** Infra / workflow. No engine change.

## Why

The dev session is moving to Windows. A fresh-agent audit of the onboarding path (`npm install` → hooks → per-slice test loop) surfaced three macOS-only assumptions that would bite a Windows checkout, where git-bash (CRLF-sensitive) and cmd.exe (npm's default `script-shell`) differ from zsh:

1. **No `.gitattributes`** — with `core.autocrlf=true` (the Windows default), `.githooks/pre-push` would be checked out with CRLF, breaking its `#!/usr/bin/env bash` shebang + `set -euo pipefail` under git-bash.
2. **`prepare`** ran `git config core.hooksPath .githooks 2>/dev/null || true` — the `/dev/null` redirect and `|| true` are POSIX-isms that misbehave under cmd.exe and can fail `npm install`.
3. **`test:fast`** single-quoted its `--exclude` glob — cmd.exe passes the quotes literally to vitest, so the exclusion silently fails and a fresh Windows agent runs the heavy property/integration/fuzz tiers on every "fast" run.

## How

- New [.gitattributes](../../.gitattributes): `*.sh` and `.githooks/**` forced to `text eol=lf` so the hook executes under git-bash regardless of `autocrlf`. Scoped narrowly (not `* text=auto`) to avoid renormalizing the rest of the tree.
- New [scripts/setup-hooks.mjs](../../scripts/setup-hooks.mjs): a shell-agnostic Node replacement for the inline `prepare` command (`execSync('git config core.hooksPath .githooks')` in a try/catch, so a tarball/dependency install outside a git tree can't fail the install). `prepare` now runs `node scripts/setup-hooks.mjs`.
- [package.json](../../package.json) `test:fast`: `--exclude` glob switched from single to double quotes (behavior-neutral under bash, correct under cmd).

## Tests

Verified: `node scripts/setup-hooks.mjs` sets `core.hooksPath=.githooks` (exit 0); `git check-attr eol -- .githooks/pre-push` → `lf`; `npm run test:fast` still excludes the heavy tiers (568 files vs 588 full) and is green. No engine code touched.

## Status

Onboarding is now cross-platform. The pre-push consumer-verify hook, the `prepare` hook-activation, and the per-slice `test:fast` loop all behave identically on macOS and Windows.
