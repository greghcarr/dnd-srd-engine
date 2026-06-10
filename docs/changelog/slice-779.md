# Slice 779 — infra: Windows test-portability (the `npm test` gate goes green on Windows)

**Type:** Infra / test-portability. **Test-only** — no `src/` engine, content, or public-API change; engine behavior is untouched. Closes the gap slice 776 ("Windows readiness") left in the *test* layer.

When the suite first ran on the new Windows dev machine, `npx vitest run` failed **4 files** (4614 passed, 4 failed). All four were `/`-vs-`\` or CRLF assumptions baked into test infrastructure — they pass on the Linux CI and the prior macOS machine and fail on any Windows checkout, independent of product code. A pattern-check surfaced the same two bug classes latent in several more files; this slice fixes the whole class.

## Two bug classes, fixed at the source

**1. POSIX path assumptions** (`/`-separated literals vs Windows `\` `path` output):

- `doc-links.test.ts` — the `SKIP_PREFIXES` filter compared `path.relative(REPO_ROOT, f)` (which yields `docs\changelog\…` on Windows) against forward-slash prefixes, so the frozen `archive-*` / `released-versions*` changelogs were **not** skipped and their intentionally-stale `web/` links re-flagged (252 false "broken link" reports). Now normalizes the relative path to forward slashes (`.split(sep).join('/')`) before matching. **This was failure #1.**
- `doc-examples.test.ts` — the **same** `SKIP_PREFIXES` bug (latent: the wrongly-included submodule markdown has no `<!-- typecheck -->` blocks, so it produced no failure — but the skip was still broken). Fixed identically; added `sep` to the `node:path` import.
- `slice-581-frightened-movement-gate.test.ts` — resolved the planner source via `__dirname.replace('/tests/unit/engine', '/src/engine/plan')`, a string-replace of a POSIX path that no-ops against a `\`-separated `__dirname` → `ENOENT`. Now uses `path.resolve(__dirname, '../../../src/engine/plan/movement.ts')`. **This was failure #4.**

**2. CRLF-fragile SRD-markdown parsing** — the `references/srd-markdown` submodule checks out CRLF under the machine's global `core.autocrlf=true` (a root `.gitattributes` can't reach a submodule's working tree, so this is fixed parser-side, the portable layer):

- `srd-background-skill-conformance.test.ts` (#2) and `srd-species-speed-conformance.test.ts` (#3) — the per-section name regex `/^([A-Za-z][\w' -]*)\n/` can't match `Name\r\n` (the `\r` sits between the name and the `\n` anchor) → 0 sections parsed.
- Pattern-check siblings (latent — their mid-line regexes tolerate the trailing `\r` today, but the read pattern is identical): `srd-ac-conformance`, `srd-saving-throw-conformance`, `srd-weapon-conformance`, `srd-spell-dc-conformance`, and `srd-drift` (4 reads).

All SRD-markdown reads now normalize `\r\n → \n` at the read site. The transform is uniformly safe — it feeds the parsers exactly the LF text they already receive on Linux/CI, so behavior on the existing platforms is unchanged.

## Not addressed (separate, cosmetic)

Vitest rewrites `*.snap` files with LF; under `core.autocrlf=true` they then show as modified after every run. That's working-tree churn, not a gate failure, and the clean fix is a line-ending-policy decision (a targeted `*.snap text eol=lf` plus a renormalize, or `core.autocrlf=input`) deliberately left out of this test-only slice to honor slice 776's "no broad renormalization" stance. Revert the churn with `git checkout -- '**/*.snap'` after a run.

## Files

- `tests/audit/doc-links.test.ts`, `tests/audit/doc-examples.test.ts` — separator-normalized `SKIP_PREFIXES` matching.
- `tests/unit/engine/slice-581-frightened-movement-gate.test.ts` — `path.resolve` instead of POSIX string-replace.
- `tests/audit/srd-background-skill-conformance.test.ts`, `srd-species-speed-conformance.test.ts`, `srd-ac-conformance.test.ts`, `srd-saving-throw-conformance.test.ts`, `srd-weapon-conformance.test.ts`, `srd-spell-dc-conformance.test.ts`, `srd-drift.test.ts` — `\r\n → \n` on SRD-markdown read.

## Verification

- `npx tsc --noEmit`: clean.
- The 4 previously-failing files + the 6 latent siblings: 130 passed / 1 skipped.
- `npx vitest run` (full suite) on Windows: green.
