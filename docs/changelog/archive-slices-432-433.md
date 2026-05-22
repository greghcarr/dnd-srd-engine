# CHANGELOG archive: slices 432-433 (docs review: prevention + cleanup)

Per-slice detail for slices 432-433, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 434 to keep it under the 60 KB single-Read ceiling. Cohort: the docs review's prevention half (432, the doc-links audit + the "CI-guarded or not stated" norm) and its cleanup half (433, the front-door accuracy + staleness refresh). See also [archive-slices-428-431.md](archive-slices-428-431.md).

---

**Docs (slice 433): front-door doc accuracy + staleness refresh (the cleanup half of the review)**

The corrective half of the docs review (slice 432 was the prevention half). Fixed across README, status, roadmap, getting-started, authoring-content-packs, parallel-authoring, slice-template, and VERSIONING:

- **Factual errors / broken examples.** Removed the stale "2170 tests across 331 files" (README + status, twice; not a guardable figure so it's gone, not re-pinned). Fixed the broken `engine.handlers.register(...)` example in the authoring guide (no such method) to the real `createEngine({ handlers })` + `engine.plan.custom` form. Replaced the 10-to-40x-stale "~33 spells / 9 magic items / 6 monsters" intro and the false "any class feature past level 1, you write yourself" claim with an SRD-scope framing. Reconciled the roadmap's "399 PHB spells / ~152 wired" (contradicted the SRD-only pack) by deferring to the guarded counts in status.md. Dropped the stale "339-line transcript" figure. Fixed parallel-authoring.md, which described the whole workflow on `main` (contradicting the `dev`-only rule) to use `dev`. Annotated VERSIONING's `git push --tags` as explicit-instruction-only, per the commit-don't-push rule.
- **Staleness.** Added a pointer in roadmap.md that its themed history covers only through ~slice 122 (live record is CHANGELOG), with the major later cohorts named. De-specified other un-guardable pinned numbers (parallel-authoring "~2060 tests", slice-template "slices 88-100").
- **Missing coverage.** Added the consumer read/query view-model layer (slices 411-419) and the SRD conformance/ledger arc (420-427) to README ("Why this engine" + Status), status.md (a coverage row + the test-infrastructure inventory), and getting-started ("What's next"). Both surfaces were previously invisible in every front-door doc.

No code/content/public-surface change. doc-links / doc-counts / doc-size / coverage-ledger audits green.

**Infra (slice 432): doc-links CI audit + "doc accuracy is CI-guarded or not stated" norm**

The prevention half of the docs review: stop needing periodic deep reviews by making staleness fail CI. New [tests/audit/doc-links.test.ts](../../tests/audit/doc-links.test.ts) scans every internal markdown link in the repo, resolves it from the linking file's own directory (the way GitHub resolves relative links), and fails on any that 404, so the link-rot class that slice 431 cleaned up by hand can never silently return. It ignores external links, in-page anchors, and links inside code spans (so documented example code with parens isn't mistaken for a link).

Added a "Doc accuracy: CI-guarded or not stated" norm to CLAUDE.md alongside the existing count-guard rule: a precise, drift-prone claim in a doc must be either CI-guarded against its source (the count audits, the link audit, the coverage-ledger anchors are the model) or not stated as a precise figure (volatile numbers like exact test totals belong in qualitative prose, with the guarded counts carrying the precision). It also flags the next high-value guard to build: typechecking the `ts` code examples in the front-door docs against the real public API. No code/content change; doc-links + doc-size green.
