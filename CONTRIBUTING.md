# Contributing to dnd-srd-engine

Thanks for your interest. This engine is built to be the foundation other D&D 5.5e tools rely on, so contributions are held to a higher bar than typical app code. This file is the contributor manual: read it end-to-end before opening a PR. AI coding agents working in this repo should read it too — the working norms below apply to every commit, regardless of who or what made the change.

## Quality bar

**Incorrect code is worse than no code.** A subtly-wrong rule implementation that *looks* correct will mislead downstream tools and tables for months. Hold every change to that standard:

- If you cannot make a change correct, leave it deferred with a tracked row in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) and document the RAW deviation in the slice's CHANGELOG entry.
- Cite the SRD when content judgments are involved (see "SRD is canon" below). Never substitute web sources.
- The full test suite must be green and `tsc --noEmit` must be clean before every commit. No exceptions.
- Each commit ships one coherent slice. See "Slice cadence" below.

Everything below exists to keep that bar.

## Before you start

1. Read [README.md](README.md) for the user-facing pitch, roadmap, and current status.
2. Read this file end-to-end.
3. Read [docs/architecture.md](docs/architecture.md) for the engine internals (event sourcing, plan/commit, effect primitives, source map, planner shape, testing standard).
4. Read [docs/engine-scope.md](docs/engine-scope.md) if you're integrating: it answers "what does the engine track vs what does my app track?"
5. Read [DEVELOPMENT.md](DEVELOPMENT.md) for the branch flow, dev commands, and house rules.
6. Confirm `references/srd-markdown/` is populated in your worktree. If you cloned without `--recurse-submodules`, run `git submodule update --init --recursive`.

## Working with an AI agent (Claude Code or similar)

The repo is set up so AI coding agents pick up the working norms automatically. Claude Code auto-loads [CLAUDE.md](CLAUDE.md); other agents land via [AGENTS.md](AGENTS.md) (Codex CLI) or [.cursorrules](.cursorrules) (Cursor). Both pointer files redirect to this manual plus [docs/architecture.md](docs/architecture.md).

Two rules are load-bearing and apply to every commit regardless of who or what made the change:

- **Commit, don't push.** `git commit` is local-only. Never `git push`, amend, force-push, or rewrite history without explicit instruction from a human collaborator.
- **Slice work goes to `dev`, never to `main`.** See "Branch structure" below.

## Scope: what this engine does and does not do

**Does**: model every printed mechanic in the 2024 PHB, DMG, and Monster Manual. Provide a schema-only library that consumers extend with their own content packs. Run an event-sourced state machine with deterministic replay.

**Does not**: ship any D&D content. Adjudicate situations the rules text delegates to the DM (improvised actions, table houserules, ambiguous spell interactions). Replace a human DM. Track distance, line of sight, or carry weight — see [docs/engine-scope.md](docs/engine-scope.md) for the full engine-tracks-vs-consumer-tracks split.

If a contribution would put copyrighted Wizards of the Coast text or stat blocks into this repo, it does not belong here. Content goes in separate, consumer-owned content packs.

## Architecture is locked

The decisions in [docs/architecture.md](docs/architecture.md) are not up for debate as part of a contribution. If you think one needs to change, open an issue first.

## Branch structure

- `main`: stable, releasable. Tagged versions live here. Never commit slice work directly to main.
- `dev`: daily slice work. All slice commits land here first.
- **`dev` integrates into `main` through a CI-gated pull request, never a local merge** (adopted slice 440; see [DEVELOPMENT.md](DEVELOPMENT.md) "Branches" for the full flow). When a batch is ready: push `dev`, open the PR (`gh pr create --base main --head dev`), and merge it once CI is green. A push to `dev` runs only the fast cross-Node test matrix; the full coverage + build gate runs at the PR.
- Branch off `dev` (it has the latest slice work). Commit to `dev`. Branching off `main` would lose recent dev commits.
- For multi-track parallel work (engine slices + content authoring), see [docs/parallel-authoring.md](docs/parallel-authoring.md).

## SRD is canon. Use the local clone.

- [references/srd-markdown/](references/srd-markdown/) is the **only** source of truth for SRD 5.2.1 rules text (spells, monsters, magic items, conditions, classes, species, backgrounds, feats).
- **Never WebFetch D&D content.** Web sources (Roll20 wiki, dndbeyond, third-party fan sites) are 2014-PHB-flavored or third-party variants and have introduced drift bugs in past slices.
- If you need an SRD lookup, grep `references/srd-markdown/`. The drift audit at [tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts) catches regressions automatically.
- The markdown ships as a git submodule pointing at [`github.com/greghcarr/dnd-5e-srd-markdown`](https://github.com/greghcarr/dnd-5e-srd-markdown) (CC-BY-4.0). Populate it with `git submodule update --init --recursive` if absent.
- The PDF source at `references/SRD_CC_v5.2.1.pdf` (heavy, downloadable from WotC) stays gitignored. The markdown is the canonical surface; the PDF is for occasional spot-checking.

Layout:

- [references/srd-markdown/classes.md](references/srd-markdown/) — class + subclass features tables and body text
- [references/srd-markdown/spells.md](references/srd-markdown/) — every SRD 5.2.1 spell, `#### Spell Name` headers
- [references/srd-markdown/monsters.md](references/srd-markdown/), `monsters-A-Z.md` — bestiary
- [references/srd-markdown/magic-items.md](references/srd-markdown/) — DMG items
- [references/srd-markdown/character-creation.md](references/srd-markdown/) — species, backgrounds, feats
- [references/srd-markdown/rules-glossary.md](references/srd-markdown/) — conditions, damage types, generic rules

If the directory is empty, surface that immediately and run `git submodule update --init --recursive` rather than proceeding with web sources.

## Slice cadence

Each commit ships one focused unit. Three valid slice shapes:

1. **Engine primitive + canonical user**: a new effect kind, TriggerAction, planner, schema field, or condition + 1-2 RAW spells / features / items that exercise it.
2. **Content sweep**: pure JSON wires that exercise an existing primitive. No engine work.
3. **Doc / workflow / infra change**: rare.

See recent commits via `git log --oneline | head -40` for the pattern. Detailed checklists per slice shape live in [docs/slice-template.md](docs/slice-template.md).

## Pre-commit Uncle Bob audit

Before every engine slice commit, write a 5-8-line audit in the commit message body covering:

- **Names**: are the new identifiers intention-revealing? Did you reuse the naming convention of the surrounding code?
- **DRY**: did you copy something instead of factoring? If so, justify in one line. Single-call-site duplication of < 10 lines is usually below the abstraction threshold; document the call when you decline.
- **SRP**: does each new function / module do one thing at one level of abstraction?
- **Magic numbers**: extracted to named constants? RAW values cited?
- **at-threading** (when the slice emits events): single `nowIso()` resolution per planner, passed through to every emitted event.
- **Mechanical outcomes asserted**: which observable behaviors do your tests pin?
- **Tests**: which bugs does each new test prevent? Did you over-test?

The audit is **mandatory** for engine slices. Pure content sweeps (JSON wires only) can use a shorter audit confirming the new wires match RAW. The audit is a discipline tool, not paperwork: writing it forces you to notice the issues you would otherwise ship. If you cannot defend a decision in one line, reconsider it before committing.

## Pattern-check on bugs

When you find a bug, audit gap, or inconsistency in this codebase, do not fix only the surfaced instance. Check the codebase for the same pattern elsewhere; fix all instances; and if you can't fix them all in one slice, track the remaining ones explicitly (a new row in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) and an `Open follow-ups` block in the slice's per-slice file).

A mistake made once is very likely repeated in many places. Concrete examples that established the norm:

- Slice 258 surfaced one effect kind (`SetAdvantage`) dropping its `condition` field; auditing siblings found three more (`GrantResistance`, `ModifyActionEconomy`, `GrantAdvantageToAttackers`) with the same shape. Slice 258 fixed the canonical one + tracked the others.
- Slice 254 surfaced one coverage-matrix filter missing `onUse` wires; sweeping the other category matrices confirmed they were sound but established the pattern-check as the right move.
- Slice 252 surfaced one broken link in a newly-written archive file; the audit found 207 broken root-relative paths across 14 archive files (slice 248 had silently propagated the same bug 11 archives wide).

Reading "found a bug" or "noticed an inconsistency" in your own thinking is the trigger. Before fixing, ask: "Same shape, elsewhere?" Grep for the pattern, check sibling files, look at recent CHANGELOG entries for similar-shape work. Then fix all of it in one slice if scoped right, or fix the canonical case + add concrete tracking for the others.

**Filter shape determines what a sweep can find.** The starting bug's shape is a clue, not the boundary. If the bug you spotted is "narrow disadvantage on per-ability check," widening past the literal filter to its conceptual family (any mode, any target) catches adjacent shapes. Slice 264 swept narrowly and missed three RAW-deviating wires in adjacent shapes; slice 267 tracked them after a wider sweep. When sweeping, ask: "what's the family of effects that can express this RAW intent?" then check all members.

**Promote repeatable sweeps to permanent audits.** When a pattern-check is something a script can verify repeatably, don't leave it as a throwaway grep — promote it to an audit test under [tests/audit/](tests/audit/) so CI catches regressions at commit time instead of relying on a future agent remembering to sweep. Established examples: srd-drift ([tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts), slice 195), doc-size ([tests/audit/doc-size.test.ts](tests/audit/doc-size.test.ts), slice 285), pack-integrity ([tests/audit/pack-integrity.test.ts](tests/audit/pack-integrity.test.ts), slice 303).

**Under-walking references is the false-positive trap.** When an audit checks "is X referenced anywhere?", it must account for *every* way X can be referenced, or it will flag legitimate uses as bugs. Slice 301's orphan-condition sweep produced ~13 false positives because its first pass walked only content-side `conditionId` refs and missed (a) planner-emitted conditions referenced as string literals in `src/engine/plan/`, and (b) conditions applied via runtime string interpolation that no static scan can see. Before trusting a "found N unreferenced things" sweep, ask: "what reference forms am I NOT looking at — interpolation, indirection, code vs. data, cross-category?"

When a later slice closes a tracked follow-up, mark the original line in the prior slice's per-slice file with `~~strikethrough~~` + `**Closed by slice N.**` (slice 260's convention). Items that stay open get an explicit `**Still open.**` so a reader can tell "open" from "stale, not yet annotated."

## Doc updates per slice

At the close of every slice, update the docs the slice touched:

- **Per-slice file at `docs/changelog/slice-NNN.md` + pointer entry in [CHANGELOG.md](CHANGELOG.md)** — **always**. Slice 628 split the verbose entry out of the live CHANGELOG: full Files / Tests / Verification / Audit / Open-follow-ups blocks live in `docs/changelog/slice-NNN.md`; the live CHANGELOG gets a 3-line pointer. See "CHANGELOG entry shape" below for the templates.
- [docs/breaking-changes-queued.md](docs/breaking-changes-queued.md) — when the slice ships a consumer-facing breaking change (public API behavior shift, RNG-stream change, removed export). Append an entry; it'll roll into the next release's release notes.
- [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) — when a deferred row is closed, when a new deferral is noted, or when "Coverage at a glance" counts change.
- [docs/api-overview.md](docs/api-overview.md) — when the public surface changes.
- [docs/status.md](docs/status.md) — when "Known gaps" closes, when a status row's cell shifts.
- [docs/roadmap.md](docs/roadmap.md) — when a phase-level milestone closes.
- [README.md](README.md) — only when the at-a-glance Status / Roadmap summary needs to reflect the new state. Most slices don't touch README directly.

**Headline content counts are CI-guarded.** When a slice changes a count that the front-door docs cite (conditions, items-by-kind, monsters, spell total, feats / species / backgrounds, `EFFECT_KINDS`), [tests/audit/doc-counts.test.ts](tests/audit/doc-counts.test.ts) fails until the docs are updated in the **same** slice. The audit names the exact doc + stale count when it fires. If you intentionally rephrase a guarded citation, update the regex in that test in the same slice so the guard stays live. The spell wired/narrative/deferred split has its own guard at [tests/audit/gaps-spells-counts.test.ts](tests/audit/gaps-spells-counts.test.ts).

**Doc accuracy: CI-guarded or not stated.** Periodic deep doc reviews are a smell: they exist only because prose claims drift unchecked. The standing rule: a precise, drift-prone claim in a doc must be either (a) CI-guarded against its source, or (b) not stated as a precise figure. Apply it both ways:

- **Prefer a guard.** The count audits above are the model (derive from source, fail until the doc matches). [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) guards every internal markdown link. [tests/audit/doc-examples.test.ts](tests/audit/doc-examples.test.ts) compiles annotated doc code examples against the real public barrel. [tests/audit/coverage-ledger.test.ts](tests/audit/coverage-ledger.test.ts) pins the ledger's cited probe / boundary counts.
- **Otherwise don't cite the number.** Exact test totals, transcript line counts, and similar volatile figures were removed from prose precisely because they are not worth guarding and drift every slice. Write the qualitative claim and let the guarded numbers carry the precision.

The doc-examples guard is **opt-in**: most doc `ts` blocks are reference sketches (intentional `...` elisions, undeclared setup variables) that would be all false positives if compiled. A block is checked only when the line directly above its fence is the GitHub-invisible marker `<!-- typecheck -->` (starts a synthetic module) or `<!-- typecheck:continue -->` (appends to that doc's current module). **When you add or edit a doc block you present as copy-paste-runnable, mark it** so the guard pins it; leave illustrative sketches unmarked.

## CHANGELOG entry shape

**Two-file convention (adopted slice 628)**: detail lives in a per-slice file under `docs/changelog/`; the live CHANGELOG gets a compact pointer. This decouples live-file growth from slice count (~150 bytes per pointer vs ~5 KB per verbose entry), so the live CHANGELOG no longer needs trimming every 5-6 slices.

**Pointer in CHANGELOG.md Unreleased section** (one per slice, 3 lines):

```
**<Type> (slice N): <one-line headline>**
<1-2 sentence summary: what changed at a glance.>
Detail: [slice-NNN.md](docs/changelog/slice-NNN.md).
```

**Per-slice file at `docs/changelog/slice-NNN.md`** (the full detail):

```markdown
# Slice N — <one-line headline>

**Type:** <Engine / Content / Tooling / Docs / Tests / Infra / Fix>.

<1-2 sentences: what changed and why.>

<Optional 1-3 sub-bullets when the slice has multiple parts.>

## Fix / Changes

<Bullets of changes, with file:line references where useful.>

## Tests

[../../tests/...](relative path), N cases — <one-line summary>.

## Verification

N files / M tests pass, tsc clean. <Any extra verification step in
one sentence.>

## RNG impact / Breaking change

ONLY when the slice changes RNG-stream consumption or public API
behavior. Otherwise omit.

## Audit

- **Names**, **DRY**, **magic numbers**, **pattern-check** — each
  one short. The audit is the Uncle Bob discipline check; don't
  expand into a self-review essay.

## Open follow-ups

Only when the slice surfaces work that didn't ship. Each item: one
line. If the slice closes prior follow-ups, mark them in the closing
slice's per-slice file with `~~strikethrough~~` + `**Closed by slice N.**`.
```

**Path convention in per-slice files**: links to repo files use `../../` to escape `docs/changelog/`. E.g. `[../../src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)`. The doc-links audit verifies these resolve.

**Per-slice file length** is loose — write what's useful. ~2-10 KB is typical. The live CHANGELOG no longer constrains the size of any individual slice's narrative.

## Doc size discipline (the single-Read ceiling)

Index-type docs in this repo (README.md, CHANGELOG.md, docs/status.md, docs/roadmap.md, docs/starter-pack-gaps.md, the docs/gaps-*.md per-category catalogs, and every file under docs/changelog/) must each fit in a single Read tool call. AI agents using the Claude Code Read tool see a refusal over **~25,000 tokens** (roughly **60 KB** for our dense technical prose, give or take). Beyond that ceiling an agent has to read with offset/limit, which is fine for spot lookups but breaks the fresh-agent discovery path (the very first Read on the front-door doc errors out).

**How to check** if a file fits:

- `wc -c <file>` — anything safely under **60,000 bytes** will fit. **40-50 KB** is comfortable; **55+** is borderline and worth verifying with an actual Read.
- Or, attempt to read the file with the Read tool (no offset/limit). If it errors with "exceeds maximum allowed tokens", split it.

**CHANGELOG (post-slice-628 pointer-per-slice structure).** The live `CHANGELOG.md` holds only:

- A compact 3-line pointer per Unreleased slice (`docs/changelog/slice-NNN.md` carries the detail).
- An "Older releases" pointer block to per-release-range files.

Two structural rules combine to bound the live file size regardless of project age:

1. **Per-slice detail lives outside the live file** (slice 628). Live-file growth per slice is ~150 bytes; pre-slice-628 it was 4-9 KB. The live file fits ~400 slices' worth of pointers.
2. **Released narratives migrate to per-release files on every release** (slice 437). On every release, evict the previously-latest release narrative to `docs/changelog/released-versions-<range>.md`. Released narratives split by version range as they grow.

Older `archive-slices-NNN-MMM.md` cohort files exist from the pre-slice-628 era and stay as-is — they're frozen historical records. New slices write per-slice files instead.

**Splitting playbook (for non-CHANGELOG docs that grow too big):**

1. **Pick a clean boundary.** For README, that's H2 sections; for archives, that's natural cohorts.
2. **Move the bulk to a focused sub-doc.** Existing examples: README "Status" / "Coverage at a glance" / "Known gaps" split out to [docs/status.md](docs/status.md); README "Roadmap" split out to [docs/roadmap.md](docs/roadmap.md).
3. **Leave a pointer** in the original doc — a one-paragraph summary plus a markdown link to the new sub-doc.
4. **Update cross-references.** Every doc that linked to the old structure needs to point at the new files. `grep -rn '<old-filename>' docs/ CHANGELOG.md README.md`.
5. **Verify each new sub-doc also fits** the ceiling.
6. **Add an entry to this slice's CHANGELOG** noting the split.

## Pre-commit / pre-push checks

The full suite is CPU-heavy (a content-pack validation tax paid by nearly every test file, plus the fuzz / property / integration tiers), so running it after every small edit is wasteful. Iterate fast locally; let the full run be the push / CI gate.

**Per slice (local, fast):**

- `npx tsc --noEmit` — vitest does not typecheck. Always run this separately.
- A fast test signal: `npm run test:changed` (runs only the tests affected by your edits — the tight iteration loop) and/or `npm run test:fast` (the whole suite minus the heavy fuzz / property / integration tiers) before committing the slice.
- `npx vitest run -u` — only when adding wired conditions, items, or other content that feeds the coverage snapshot at [tests/coverage/__snapshots__/](tests/coverage/__snapshots__/). Inspect the diff to confirm only intentional additions land.

**Before pushing (the full gate):**

- `npm test` (`npx vitest run`) — the full suite must be green. Run it before pushing a cohort and always before a release. CI also runs the full suite on every PR across Node 20/22/24, so anything that reaches `main` has had the full suite enforced regardless.

If a check fails, fix the cause. Never `--no-verify` or skip. (`test:changed` treats a change to `package.json` / a config file as a global invalidation and runs everything — expected; for ordinary source/test edits it runs only the affected files.)

## Pre-push consumer verification

`npm install` activates a git hook at [.githooks/pre-push](.githooks/pre-push) via the `prepare` script in [package.json](package.json), which runs `git config core.hooksPath .githooks`. When you push the local `main` ref, the hook runs `npm run typecheck` + `npm run build` in any sibling-checkout consumer it finds (`../dndbnb`, `../dnd-web`) and aborts the push if either fails.

The engine's own CI doesn't know either consumer exists, so an engine signature change that compiles fine here can still break a consumer's build — and the next consumer deploy is the first place you'd find out. The hook catches that locally before the engine commit reaches `main`.

Pushes to `dev` or other branches do not trigger the hook (only `main` does, since `main` is what consumers' deploy workflows check out via `ref: main`). Sibling dirs without `node_modules` are skipped with a warning rather than failing the push. Emergency override: `SKIP_CONSUMER_CHECKS=1 git push origin main`.

## Code style

- TypeScript strict mode (enforced in [tsconfig.json](tsconfig.json) with `noUncheckedIndexedAccess`).
- No inline magic numbers / strings: extract to named module-scope constants. The 5.5e rules contain many of these (death-save thresholds, hit die averages, ability score range). Each gets a name.
- No defensive error handling for impossible cases. `invariant()` is for assertions at boundaries (event reducers verifying preconditions before mutating state), not for "this can never happen" checks inside pure helpers.
- Small functions. Reducers should read as a sequence of named operations. If `applyFoo` grows past ~30 lines, extract intent-revealing helpers (`absorbTempHP`, `isMassiveDamage`, `resetDeathSaves`).
- Path alias `@/` = `src/`.
- No em dashes or en dashes in any file (comments, docs, error messages). Use commas, parentheses, colons, or separate sentences.
- File references in markdown as `[label](path)`, not backticks.

## Testing standard

See [docs/architecture.md](docs/architecture.md#testing-standard) for the full required-layers list, coverage gates, and "what's explicitly not required" cuts. Summary: reducer unit tests, derivation unit tests, golden scenarios, replay equivalence, RNG capture proof, transcript snapshots, public API contract tests. 80% line + statement floor on `src/engine/`, `src/derive/`, `src/effects/`.

If you cannot name a bug a test would prevent, do not write it.

## Commit and PR style

- One coherent change per commit. One slice per commit. Big features land as a series of slices.
- Slice commits land on `dev`, never directly on `main`.
- Commit messages: imperative mood, summary line under 72 chars, paragraph body explaining the *why*.
- Engine slices include the **pre-commit Uncle Bob audit** in the commit body (see above).
- PRs should include: what changed, why, what tests cover it, anything reviewers should look at closely.

## Versioning

- Format: `MAJOR.MINOR.PATCH[-pre-alpha|-alpha|-beta]`.
- Bump on meaningful surface changes, not on every commit.
- `SCHEMA_VERSION` (in [src/version.ts](src/version.ts)) is independent of package version. Bump only when persisted shapes change, and ship a migration in the same PR.

## Parallel sessions

When engine-slice work and content authoring (monsters, magic items) can both make useful progress, run them in parallel via two git worktrees: engine on `dev` in the primary worktree, content on a sibling branch. Both worktrees share `.git` history but hold independent working files. See [docs/parallel-authoring.md](docs/parallel-authoring.md) for setup commands, the file-footprint rules each session must respect, and merge/cleanup steps.

## Reporting bugs

Open an issue with:

- A minimal reproduction: ideally a failing test or a short script that triggers the bug.
- Expected vs actual behavior.
- The rulebook citation if the bug is about rules correctness (PHB page, errata).

## Reporting rules-correctness bugs

These are different from code bugs. The engine aims for full mechanical coverage of the printed 2024 rules. If you believe a mechanic is implemented incorrectly:

1. Cite the rulebook (PHB chapter / page) or official errata / Sage Advice.
2. Show a test case that demonstrates the discrepancy.
3. If the rules are genuinely ambiguous, that is a candidate for the `CustomEffect` escape hatch, not for the core engine.

## License

By contributing, you agree your contributions are licensed under the MIT License (see [LICENSE](LICENSE)).
