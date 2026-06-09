// Cross-platform git-hooks activation, run by the `prepare` npm script.
// Points git at the in-repo .githooks dir (the pre-push consumer-verify hook).
//
// Replaces an inline `git config core.hooksPath .githooks 2>/dev/null || true`,
// whose POSIX redirect + `|| true` misbehave under cmd.exe (npm's default shell
// on Windows) and can fail `npm install`. Node is shell-agnostic, and any
// failure (e.g. a tarball install outside a git working tree) is swallowed so
// it never breaks an install.
import { execSync } from 'node:child_process';

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
  // Not a git working tree (tarball / dependency install) — nothing to wire.
}
