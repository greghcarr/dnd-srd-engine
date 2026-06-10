# Slice 780 — infra: pin `*.snap` to LF (kill the post-test snapshot churn on Windows)

**Type:** Infra / line-ending hygiene. One `.gitattributes` line. No code, no engine or test-logic change.

Slice 779 made the Windows `npm test` gate green but left one cosmetic nuisance: vitest rewrites its snapshot files with LF, and under the machine's global `core.autocrlf=true` the two tracked snapshots (`tests/contract/__snapshots__/exports.test.ts.snap`, `tests/coverage/__snapshots__/features.test.ts.snap`) showed as modified in `git status` after every run — a pure CRLF↔LF working-tree round-trip (the committed blobs are already LF), which risks accidental EOL-only commits and muddies a clean tree.

## Fix

Added `*.snap text eol=lf` to `.gitattributes`. With the attribute in effect, git stops applying the `autocrlf` CRLF round-trip to snapshot files: they check out LF, vitest writes LF, and `git status` stays clean. The committed blobs were already LF (verified by byte count — an earlier "blobs are CRLF" reading was a `grep -c $'\r'` artifact on this shell, where `$'\r'` degraded to an empty pattern and counted every line), so **no blob renormalization was needed** — the attribute alone closes it. Still narrowly scoped (only generated snapshots), consistent with slice 776's deliberate "no broad `text=auto`" stance.

## Verification

Ran the two snapshot-owning tests (`tests/contract/exports.test.ts`, `tests/coverage/features.test.ts`), which rewrite the `.snap` files, then checked `git status`: clean apart from `.gitattributes` itself. Before this slice, that same run left both `.snap` files modified.

## Files

- `.gitattributes`: add `*.snap text eol=lf`.
