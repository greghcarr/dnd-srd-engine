# CHANGELOG archive: slices 428-431 (docs hygiene)

Per-slice detail for slices 428-431, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 433 to keep it under the 60 KB single-Read ceiling. Cohort: the em-dash sweep of the ledger + CHANGELOG (428), the slices-426-427 archive (429), the trustworthiness-roadmap "as content grows" note (430), and the broken-internal-link fix (431). See also [archive-slices-426-427.md](archive-slices-426-427.md).

---

**Docs (slice 431): fix 73 broken internal doc links (GitHub 404s)**

Found during a docs review: many links in `docs/*.md` and several CHANGELOG archives used repo-root-relative hrefs (e.g. a link in `docs/status.md` to `tests/audit/raw-compliance.test.ts`). GitHub resolves relative links from the file's own location, so these resolved to `docs/tests/audit/...` and 404'd. Rewrote 72 of them to correct file-relative paths (`../tests/...`, sibling `starter-pack-gaps.md`, `../../tests/...` from archives, etc.) via a link-resolution pass, plus one hand-fix (`../CLAUDE.md` to `../../CLAUDE.md` in a rollup archive) and un-linked one dead reference (the `phb-2024-extras.json` pack, since moved to the gitignored `content-packs/`). A repo-wide re-scan now reports zero broken internal links except two false positives that are inside backticks (code, not rendered links). Affected: status.md, roadmap.md, parallel-authoring.md, released-versions.md, and two slice archives. No code/content change.

**Docs (slice 430): trustworthiness-roadmap note on what the assurance measures do (and don't) cover as content grows**

Added an "As content grows: drift covers data, not wiring" subsection to [docs/trustworthiness-roadmap.md](../trustworthiness-roadmap.md), so a future agent filling out the remaining SRD content (schema-only spells, the MM bestiary, subclass features) knows the boundary: srd-drift, pack-integrity, and the count guards self-scale to verify each new entry's **metadata / presence** automatically, and the derivation conformance tests already cover the complete fixed categories, but **none of them verify that a wired feature's `mechanicalEffects` actually implement the SRD rule**. Every newly wired feature lands 🟡 (author-asserted) by default, and that unverified surface grows with the catalog. Guidance: reuse-of-a-verified-primitive is safe, but the new wire needs a coverage-ledger row and, where the SRD states a checkable value, a ground-truth assertion rather than an author-chosen one. No code/content change.

**Docs (slice 429): archive the slices 426-427 CHANGELOG cohort**

CHANGELOG.md had reached 59,980 bytes (20 under the 60 KB single-Read ceiling) after slice 428, so any further entry would have broken the doc-size audit. Moved the slices 426-427 per-slice detail to [archive-slices-426-427.md](archive-slices-426-427.md) and left the standard pointer, bringing the live CHANGELOG back to ~55 KB. The archive's internal links were re-rooted (../../tests, ../srd-coverage-ledger.md) and it ships em/en-dash-free. No code/content change.

**Docs (slice 428): remove em/en dashes from the coverage ledger + live CHANGELOG**

Honors the house "no em dashes or en dashes" rule in the two front-door docs most recently authored this session: replaced every em dash (U+2014) and en dash (U+2013) in [docs/srd-coverage-ledger.md](../srd-coverage-ledger.md) and CHANGELOG.md with a hyphen (the ledger's `-` N/A table cells and numeric ranges like `1-30` read naturally; prose appositives become hyphen-joined). Zero em/en dashes remain in either file; the coverage-ledger anchor guard and doc-size audit stay green.

Scope is deliberately bounded to these two files. The dashes are a long-standing repo-wide convention (roughly 250 files: source comments, test files, the gaps catalogs, the CHANGELOG archives, and CLAUDE.md itself), and many live inside string literals that golden / transcript / error-message tests assert on, so a blind global replace would risk breaking the suite. A full repo sweep, if wanted, is a separate careful effort (likely several commits, each verified), not a single mechanical pass. No code/content/public-surface change.
