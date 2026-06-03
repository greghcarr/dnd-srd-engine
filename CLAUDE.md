# dnd-srd-engine — working manual

A standalone, event-sourced TypeScript domain engine for D&D 5.5e (2024 rules). Schema-only library; consumers supply content packs. GitHub repo: `github.com/greghcarr/dnd-srd-engine`. Not currently distributed via npm (the alpha.0-alpha.5 releases were unpublished in May 2026 on IP-cleanup grounds; see CHANGELOG).

**This file is the working manual.** It is auto-loaded into the context of any Claude Code instance opened in this repo. Read it end-to-end before opening anything else. The conventions below are non-negotiable; the architecture below is locked.

## Quality bar

**Incorrect code is worse than no code.** This engine is designed to be the foundation other D&D tools rely on. A subtly-wrong rule implementation that *looks* correct will mislead consumers for months. Hold every change to that standard:

- If you cannot make a change correct, leave it deferred with a tracked row in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) and document the RAW deviation in the slice's CHANGELOG entry.
- Cite the SRD when content judgments are involved (see "SRD is canon" below). Never substitute web sources.
- The full test suite must be green and `tsc --noEmit` must be clean before every commit. No exceptions.
- Each commit ships one coherent slice. See "Slice cadence" below.

Everything below exists to keep that bar.

## Fresh-agent quickstart

If you (Claude or otherwise) are arriving at this repo for the first time, do this in order:

1. Skim [README.md](README.md) for the user-facing pitch, the roadmap, and the current "Status" section.
2. Read this file end-to-end. The norms in "Working norms" apply to every commit.
3. Confirm `references/srd-markdown/` exists in your worktree. If absent, ask before proceeding — never substitute web sources for SRD content. See "SRD is canon" below.
4. Read the priority queue at [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md). The "Future engine slices" table and "Deferred primitives backlog" are the next-slice candidates, sorted roughly by cohort payoff.
5. Pick a slice, follow [docs/slice-template.md](docs/slice-template.md), commit to `dev`, surface the work to the user.

If anything in the working norms below conflicts with how you would normally operate, the norms win.

## Working norms (read first)

### Branch structure

- `main`: stable, releasable. Tagged versions live here. Never commit slice work directly to main.
- `dev`: daily slice work. All slice commits land here first.
- **`dev` integrates into `main` through a CI-gated pull request, never a local merge** (adopted slice 440; see [DEVELOPMENT.md](DEVELOPMENT.md) "Branches" for the full flow and why). When the user decides a batch is ready: push `dev`, open the PR (`gh pr create --base main --head dev`), and merge it once CI is green. A push to `dev` runs only the fast cross-Node test matrix; the full coverage + build gate runs at the PR (slice 442).
- Branch off `dev` (it has the latest slice work). Commit to `dev`. Do not push, open a PR, or merge to `main` yourself without explicit instruction; surface the work and let the user decide. Branching off `main` would lose recent dev commits.
- For multi-track parallel work (engine slices + content authoring), see [docs/parallel-authoring.md](docs/parallel-authoring.md). Worktrees still commit to `dev` (or to per-worktree feature branches that merge to `dev`).

### Commit, don't push

- Treat `git commit` as a **local-only** operation.
- Never run `git push` (or any other remote-modifying operation: `git push --force`, `git push origin`, branch deletions on origin, etc.) unless the user explicitly asks.
- Never run `git commit --amend`, `git rebase`, `git reset --hard`, or any history-rewriting operation without explicit instruction.
- Never skip hooks (`--no-verify`) or bypass signing without explicit instruction.
- If a pre-commit hook fails, fix the underlying issue and create a NEW commit. Do not amend the failed commit.

### SRD is canon. Use the local clone.

- `references/srd-markdown/` is the **only** source of truth for SRD 5.2.1 rules text (spells, monsters, magic items, conditions, classes, species, backgrounds, feats).
- **Never WebFetch D&D content.** Web sources (Roll20 wiki, dndbeyond, third-party fan sites) are 2014-PHB-flavored or third-party variants and have introduced drift bugs in past slices.
- If you need an SRD lookup, grep `references/srd-markdown/`. The drift audit at [tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts) catches regressions automatically.
- The markdown ships as a **git submodule** pointing to [`github.com/greghcarr/dnd-5e-srd-markdown`](https://github.com/greghcarr/dnd-5e-srd-markdown) (CC-BY-4.0). Clone the repo with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` post-clone, to populate it. If the directory is empty after clone, that's the cause.
- The PDF source at `references/SRD_CC_v5.2.1.pdf` (heavy, downloadable from WotC) stays gitignored. The markdown is the canonical surface; the PDF is for occasional spot-checking.

Detailed SRD layout under "SRD source of truth" below.

### Slice cadence: primitive + canonical user

Each commit ships one focused unit. Three valid slice shapes:

1. **Engine primitive + canonical user**: a new effect kind, TriggerAction, planner, schema field, or condition + 1-2 RAW spells / features / items that exercise it.
2. **Content sweep**: pure JSON wires that exercise an existing primitive. No engine work.
3. **Doc / workflow / infra change**: rare. This file's most recent rewrite is an example.

See recent commits via `git log --oneline | head -40` for the pattern. Slices 88-122 are the most representative of the per-slice rhythm; slices 235-243 are recent examples of the primitive + canonical user cadence on the UseItem / ConsumeItem surface.

Detailed checklists per slice shape live in [docs/slice-template.md](docs/slice-template.md).

### Pre-commit Uncle Bob audit

Before every engine slice commit, write a 5-8-line audit in the commit message body covering:

- **Names**: are the new identifiers intention-revealing? Did you reuse the naming convention of the surrounding code?
- **DRY**: did you copy something instead of factoring? If so, justify in one line. Single-call-site duplication of < 10 lines is usually below the abstraction threshold; document the call when you decline.
- **SRP**: does each new function / module do one thing at one level of abstraction?
- **Magic numbers**: extracted to named constants? RAW values cited?
- **at-threading** (when the slice emits events): single `nowIso()` resolution per planner, passed through to every emitted event.
- **Mechanical outcomes asserted**: which observable behaviors do your tests pin?
- **Tests**: which bugs does each new test prevent? Did you over-test?

The audit is **mandatory** for engine slices. Pure content sweeps (JSON wires only) can use a shorter audit confirming the new wires match RAW.

The audit is a discipline tool, not paperwork: writing it forces you to notice the issues you would otherwise ship. If you cannot defend a decision in one line, reconsider it before committing.

### Pattern-check on bugs

When you find a bug, audit gap, or inconsistency in this codebase, do not fix only the surfaced instance. Check the codebase for the same pattern elsewhere; fix all instances; and if you can't fix them all in one slice, track the remaining ones explicitly (a new row in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) and an `Open follow-ups` block in the slice's CHANGELOG entry).

Claude wrote most of this code across hundreds of slices. A mistake made once is very likely repeated in many places. Concrete examples that established the norm:

- Slice 258 surfaced one effect kind (`SetAdvantage`) dropping its `condition` field; auditing siblings found three more (`GrantResistance`, `ModifyActionEconomy`, `GrantAdvantageToAttackers`) with the same shape. Slice 258 fixed the canonical one + tracked the others.
- Slice 254 surfaced one coverage-matrix filter missing `onUse` wires; sweeping the other category matrices confirmed they were sound but established the pattern-check as the right move.
- Slice 252 surfaced one broken link in a newly-written archive file; the audit found 207 broken root-relative paths across 14 archive files (slice 248 had silently propagated the same bug 11 archives wide). Fixing only the new file would have widened the inconsistency.

Reading "found a bug" or "noticed an inconsistency" in your own thinking is the trigger. Before fixing, ask: "Same shape, elsewhere?" — grep for the pattern, check sibling files, look at recent CHANGELOG entries for similar-shape work. Then fix all of it in one slice if scoped right, or fix the canonical case + add concrete tracking for the others.

**Filter shape determines what a sweep can find.** The starting bug's shape is a clue, not the boundary. If the bug you spotted is "narrow disadvantage on per-ability check," widening past the literal filter (`kind:'check' + mode:'disadvantage'`) to its conceptual family (`SetAdvantage` / `ImposeDisadvantageOnAttackers` / `GrantAdvantageToAttackers`, any mode, any target) and cross-checking each result against RAW catches adjacent shapes. Slice 264 swept narrowly for the literal filter and missed three RAW-deviating wires in adjacent shapes (Dodge's missing LoS gate on `ImposeDisadvantageOnAttackers`, Dodge's missing Incapacitated/Speed-0 disabler on its DEX-save advantage, Blur's missing attacker-sense bypass on `ImposeDisadvantageOnAttackers`); slice 267 tracked them after a wider sweep. When sweeping, ask: "what's the family of effects that can express this RAW intent?" then check all members.

**Promote repeatable sweeps to permanent audits.** When a pattern-check is something a script can verify repeatably, don't leave it as a throwaway grep — promote it to an audit test under [tests/audit/](tests/audit/) so CI catches regressions at commit time instead of relying on a future agent remembering to sweep. This is an established path: srd-drift ([tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts), slice 195, from the slices 177-194 ad-hoc drift fixes), doc-size ([tests/audit/doc-size.test.ts](tests/audit/doc-size.test.ts), slice 285, from the slices 270/277 recurring archives), and pack-integrity ([tests/audit/pack-integrity.test.ts](tests/audit/pack-integrity.test.ts), slice 303, from the slice-298 duplicate-entry + slice-301 orphan-condition sweeps).

**Under-walking references is the false-positive trap** (the mirror of the filter-shape false-negative trap above). When an audit checks "is X referenced anywhere?", it must account for *every* way X can be referenced, or it will flag legitimate uses as bugs. The slice-301 orphan-condition sweep produced ~13 false positives because its first pass walked only content-side `conditionId` refs and missed (a) planner-emitted conditions referenced as string literals in `src/engine/plan/`, and (b) conditions applied via runtime string interpolation (`absorb-elements-charged-${type}-active`) that no static scan can see. The pack-integrity audit handles (a) by also scanning the engine source and (b) with an explicit documented allowlist. Before trusting a "found N unreferenced things" sweep, ask: "what reference forms am I NOT looking at — interpolation, indirection, code vs. data, cross-category?"

When a later slice closes a tracked follow-up, mark the original line in the prior slice's CHANGELOG entry with `~~strikethrough~~` + `**Closed by slice N.**` (slice 260's convention). Items that stay open get an explicit `**Still open.**` so a reader can tell "open" from "stale, not yet annotated."

### Doc updates per slice

At the close of every slice, update the docs the slice touched:

- [CHANGELOG.md](CHANGELOG.md) — **always**. One entry per slice under `## Unreleased`. Include the Uncle Bob audit summary. See "CHANGELOG entry shape" below for the standard template.
- [docs/breaking-changes-queued.md](docs/breaking-changes-queued.md) — when the slice ships a consumer-facing breaking change (public API behavior shift, RNG-stream change, removed export). Append an entry; it'll roll into the next release's release notes.
- [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) — when a deferred row is closed (strike it through with `~~...~~`), when a new deferral is noted, or when "Coverage at a glance" counts change.
- [docs/api-overview.md](docs/api-overview.md) — when the public surface changes.
- [docs/status.md](docs/status.md) — when "Known gaps" closes, when a status row's cell shifts, or when the test count moves significantly.
- [docs/roadmap.md](docs/roadmap.md) — when a phase-level milestone closes.
- [README.md](README.md) — only when the at-a-glance Status / Roadmap summary needs to reflect the new state. Most slices don't touch README directly.

**Headline content counts are CI-guarded.** When a slice changes a count that the front-door docs cite (conditions, items-by-kind, monsters, spell total, feats / species / backgrounds, `EFFECT_KINDS`), [tests/audit/doc-counts.test.ts](tests/audit/doc-counts.test.ts) fails until the docs are updated in the **same** slice. This is the structural backstop against count drift accumulating between periodic batch reconciliations (slices 337 and 361 were such reconciliations; slice 362 added the audit so they shouldn't recur). The audit names the exact doc + stale count when it fires. If you intentionally rephrase a guarded citation, update the regex in that test in the same slice so the guard stays live. The spell wired/narrative/deferred split has its own guard at [tests/audit/gaps-spells-counts.test.ts](tests/audit/gaps-spells-counts.test.ts). Counts that are NOT auto-guarded (test totals, mechanical-wiring percentages, the spell-mechanic / planner sub-splits) still need a manual eye when they move materially.

**Doc accuracy: CI-guarded or not stated.** Periodic deep doc reviews are a smell: they exist only because prose claims drift unchecked. The standing rule, so reviews stop being necessary: a precise, drift-prone claim in a doc must be either (a) CI-guarded against its source, or (b) not stated as a precise figure. Apply it both ways:

- **Prefer a guard.** The count audits above are the model (derive from source, fail until the doc matches). [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) (slice 432) guards every internal markdown link (resolved from the file's own dir, the way GitHub resolves them), so the link-rot class that used to need manual sweeps now fails CI. [tests/audit/doc-examples.test.ts](tests/audit/doc-examples.test.ts) (slice 434) compiles the doc code examples we present as runnable against the real public barrel, so a renamed / removed export or a method that never existed (the bogus `engine.handlers.register(...)` a review once found) breaks CI in the same commit. [tests/audit/coverage-ledger.test.ts](tests/audit/coverage-ledger.test.ts) pins the ledger's cited probe / boundary counts. When you add a new drift-prone citation a script could check, add it to a guard rather than relying on memory.
- **Otherwise don't cite the number.** Exact test totals, transcript line counts, and similar volatile figures were removed from prose precisely because they are not worth guarding and drift every slice. Write the qualitative claim ("a comprehensive test suite") and let the guarded numbers (content counts, ledger anchors) carry the precision.

The doc-examples guard is **opt-in**: most doc `ts` blocks are reference sketches (intentional `...` / `/* ... */` elisions, undeclared setup variables, signature-only pseudo-syntax) that would be all false positives if compiled. A block is checked only when the line directly above its fence is the GitHub-invisible marker `<!-- typecheck -->` (starts a synthetic module) or `<!-- typecheck:continue -->` (appends to that doc's current module, for multi-step walkthroughs). **When you add or edit a doc block you present as copy-paste-runnable, mark it** so the guard pins it; leave illustrative sketches unmarked.

Still un-guarded by design and needing a manual eye on material change: mechanical-wiring percentages, prose feature lists, and cross-doc narrative currency (e.g. a roadmap's slice-by-slice history).

### CHANGELOG entry shape

A standard slice entry to keep the live file tight and the prose consistent. The framing reflects what hands-off readers reach for first (what changed, where, how to verify) rather than narrating the dev journey. Slice 617 set the template after the slice 601-616 cycle showed the entries trending verbose enough to force back-to-back archive operations.

```
**<Type> (slice N): <one-line headline>**

<1-2 sentences: what changed and why. Skip the "pre-slice the engine
did X; now it does Y" if the headline already conveys it.>

<Optional 1-3 sub-bullets when the slice has multiple parts. Each
bullet ≤ 2 lines.>

**Files**: [a](path/to/a) ([b](path/to/b)), ...

**Tests:** [test-file](path), N cases — <one-line summary>.

**Verification:** N files / M tests pass, tsc clean. <Any extra
verification step, e.g., "fuzz seed=X shows the expected behavior",
in one sentence.>

**RNG impact** / **Breaking change**: ONLY when the slice changes
RNG-stream consumption or public API behavior. Otherwise omit.

**Audit:** 2-3 bullets. Names, DRY, magic numbers, pattern-check —
each one short. The audit is the Uncle Bob discipline check; don't
expand into a self-review essay.

**Pattern-check** (when surfacing a same-shape-elsewhere sweep):
filter shape in parens; result summary (sweep clean / N other sites
fixed / N tracked as follow-ups).

**Open follow-ups:** only when the slice surfaces work that didn't
ship. Each item: one line. If the slice closes prior follow-ups,
mark those in the closing slice's CHANGELOG section, not here.
```

Aim for ~25-40 lines per entry. The pre-slice narrative + "here's how I thought about it" detail belongs in the commit message body, not the CHANGELOG. The live file holds one active release cycle's worth of entries; verbose entries force archiving more often, which is friction the next agent has to navigate.

### Doc size discipline (the single-Read ceiling)

Index-type docs in this repo (README.md, CHANGELOG.md, docs/status.md, docs/roadmap.md, docs/starter-pack-gaps.md, the docs/gaps-*.md per-category catalogs, and every file under docs/changelog/) must each fit in a single Read tool call. The Claude Code Read tool refuses files over **~25,000 tokens** (roughly **60 KB** for our dense technical prose, give or take). Beyond that ceiling an agent has to read with offset/limit, which is fine for spot lookups but breaks the fresh-agent discovery path (the very first Read on the front-door doc errors out).

**How to check** if a file fits:

- `wc -c <file>` — anything safely under **60,000 bytes** will fit. **40-50 KB** is comfortable; **55+** is borderline and worth verifying with an actual Read.
- Or, attempt to read the file with the Read tool (no offset/limit). If it returns the content, you're fine. If it errors with "exceeds maximum allowed tokens", split it.

**When a file gets too big**, split with the playbook below. Don't bypass with offset/limit — the goal is that any agent or contributor can read the front-door doc in one call.

**CHANGELOG: keep only the active cycle (the rule that stops the split treadmill).** The live CHANGELOG.md holds only the current `## Unreleased` work plus the single most-recent tagged release, then a compact "Older releases" pointer. **On every release, evict the previously-latest release narrative (and its cohort pointers) to a `docs/changelog/released-versions-<range>.md` file** — never leave completed release entries inline. This is structural, not reactive: before slice 437 the live file had accreted eight frozen release narratives (alpha.6-13, ~84% of its bytes) plus a 33-entry archive index, so reactively archiving per-slice *detail* and leaving a pointer barely moved the floor (each "split" reclaimed detail but added a pointer and left the release narratives, so the file kept hovering at 57-59 KB). With active-cycle-only, the live file is bounded by one release cycle (~10 KB) regardless of project age. Released narratives split by version range as they grow (`released-versions.md` = alpha.0-5; [released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md) = alpha.6-13; the next range file when alpha.14+ is evicted), each under the ceiling; the global per-cohort archive index lives in [docs/changelog/README.md](docs/changelog/README.md), not inline. Per-slice detail still archives to `archive-slices-NNN-MMM.md` cohort files during a cycle (the playbook below); that part is unchanged.

**Splitting playbook:**

1. **Pick a clean boundary.** For CHANGELOG, that's slice numbers; for README, that's H2 sections; for archives, that's natural cohorts (slice ranges, content batches, or topical groupings).
2. **Move the bulk to a focused sub-doc.** Examples in this repo:
   - CHANGELOG-Unreleased archived to per-cohort files under [docs/changelog/](docs/changelog/) (`archive-slices-NNN-MMM.md`, `archive-monsters-batch-X.md`, `archive-items-batch-X.md`, `archive-rollup-narrative-X.md`).
   - CHANGELOG released versions split out to [docs/changelog/released-versions.md](docs/changelog/released-versions.md).
   - README "Status" / "Coverage at a glance" / "Known gaps" split out to [docs/status.md](docs/status.md).
   - README "Roadmap" split out to [docs/roadmap.md](docs/roadmap.md).
3. **Leave a pointer** in the original doc — a one-paragraph summary plus a markdown link to the new sub-doc. The pointer should be enough that an agent reading the front-door doc still understands the topology.
4. **Update cross-references.** Every doc that linked to the old structure (sibling archives' "see also" lines, the CHANGELOG pointer block, any source-map mentions) needs to point at the new files. `grep -rn '<old-filename>' docs/ CHANGELOG.md README.md` to find them.
5. **Verify each new sub-doc also fits** the ceiling. Some splits need to be split again. Don't leave a 100 KB archive thinking "it's an archive, agents won't read it whole" — they will.
6. **Add an entry to this slice's CHANGELOG** noting the split, so a future reader can trace why files moved.

**Where pointers live:** the live CHANGELOG.md carries a compact "Older releases" pointer to the released-versions archives plus the [docs/changelog/README.md](docs/changelog/README.md) index (not an inline list of every archive — that index moved to README.md in slice 437); the live README.md has prose summaries pointing to docs/status.md and docs/roadmap.md. When you split a new doc, decide where its pointer belongs (usually the parent that previously contained the content) and add it there.

### Pre-commit checks

Run all of these before committing. Each is mandatory:

- `npx tsc --noEmit` — vitest does not typecheck. Always run this separately.
- `npx vitest run` — full suite. Must be green.
- `npx vitest run -u` — only when adding wired conditions, items, or other content that feeds the coverage snapshot at [tests/coverage/__snapshots__/](tests/coverage/__snapshots__/). Inspect the diff to confirm only intentional additions land.

If a check fails, fix the cause. Never `--no-verify` or skip.

## Goal

**Full mechanical coverage of˜ the 2024 PHB + DMG + MM.** The engine models every printed mechanic: every class, subclass, species, background, feat, spell, weapon, armor, magic item, condition, monster statblock. Rules that are genuinely DM-discretion (improvised actions, narrative rulings, houserules) drop to the `CustomEffect` code-handler escape hatch.

This is a long-running build. The roadmap lives in [docs/roadmap.md](docs/roadmap.md) as six phases (A: engine mechanics, B: state schemas, C: combat fill-in, D: adoption surface, E: 2024 content, F: optional core extraction). Phases A through E completed at slice 46 (alpha.5). Slice 47 (Phase F, optional `ttrpg-engine-core` extraction) is still unstarted. Work since alpha.5 has been "primitive + canonical user" vocabulary expansion: each slice adds a focused Effect kind, TriggerAction, or planner that unblocks a cohort of currently schema-only content. The exact slice count drifts; check `git log --oneline | head -5` for the latest. The per-primitive future-slice queue and per-spell wired/schema-only catalog live in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md).

## SRD source of truth

**The local markdown clone at `references/srd-markdown/` is the canonical source for SRD 5.2.1 rules text.** Never fetch 5e content from the web (Roll20 wiki, dndbeyond, third-party sites). The web sources are 2014-PHB-flavored or third-party variants and have introduced drift bugs in past slices.

The drift audit at [tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts) parses the markdown clone and asserts every pack spell, monster, magic item, and class progression table matches SRD on the script-detectable fields (school, level, components, classes, concentration, ritual, casting time / range / duration, V/S/M presence, AC, HP, CR, ability scores, condition / damage immunities, resistances, speed, rarity, attunement, plus per-class Proficiency Bonus and feature presence/placement, etc.). It skips itself when the clone is absent (e.g., a fresh worktree without the symlink). Slices 177-194 used this same logic ad-hoc and shipped ~310 drift fixes; the harness now catches regressions automatically. The class-feature checks (slice 377) cover only the table columns the pack models (PB + feature names per level); the per-feature numeric values that live in body prose (e.g. Roving's "+10 feet") are not table-parseable and stay manual.

When auditing content (monsters, spells, items, class features, magic items) against RAW, grep `references/srd-markdown/` and treat its text as authoritative. The PDF source at `references/SRD_CC_v5.2.1.pdf` is the original; the markdown is a faithful fork that was spot-checked against the PDF during the monster audit. The markdown ships as a git submodule (slice 245); the PDF stays gitignored.

Layout:
- `references/srd-markdown/classes.md` — class + subclass features tables and body text
- `references/srd-markdown/spells.md` — every SRD 5.2.1 spell, `#### Spell Name` headers
- `references/srd-markdown/monsters.md`, `monsters-A-Z.md` — bestiary
- `references/srd-markdown/magic-items.md` — DMG items
- `references/srd-markdown/character-creation.md` — species, backgrounds, feats
- `references/srd-markdown/rules-glossary.md` — conditions, damage types, generic rules

If `references/srd-markdown/` is empty (fresh clone without `--recurse-submodules`), surface that immediately and run `git submodule update --init --recursive` rather than proceeding with web sources. Never substitute web lookups.

## Engineering standards (internal, not for marketing copy)

The "Quality bar" section above is the user-facing framing. Internally, the engine is held to a library-quality standard: TypeScript strict mode (`noUncheckedIndexedAccess`), deterministic replay, plan/commit RNG capture, 80%+ coverage on `src/engine/` `src/derive/` `src/effects/`, golden transcripts on every behavior change, drift-audited content against the SRD markdown clone.

Do not advertise this framing on public-facing surfaces (README, package.json description, repo description, marketing). The work speaks through the code, tests, and transcripts. Quality labels in marketing copy are noise.

## Known gaps (canonical list lives in README)

The engine architecture is locked. Original Phase A–E combat / state / adoption work all shipped at alpha.5. Remaining work falls into three categories:

1. **Engine vocabulary** — focused primitives that each unblock a cohort of currently schema-only content. ~15–25 still on the catalog at [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) under "Future engine slices."
2. **Content authoring** — most of what's left. The bulk of the MM bestiary (~365 statblocks), most subclasses (~38), the long tail of schema-only spells (~247), the DMG magic-item catalog. None requires engine work, just JSON. See [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) for the catalog.
3. **Phase F** (optional) — `ttrpg-engine-core` extraction. Unstarted. Only do this if multi-system support becomes a real goal.

For the slice cadence ("primitive + canonical user"), see the "Working norms" section above plus [docs/slice-template.md](docs/slice-template.md) for the per-shape checklist.

## System-agnostic core seam (forward-looking)

dnd-srd-engine has a conceptual split between system-agnostic architecture and D&D-specific rules. Slice 47 (Phase F in the README roadmap) optionally extracts the agnostic layer into a `ttrpg-engine-core` package if multi-system support ever becomes a real goal. The seam is conceptual today, not enforced in code: several files that belong on the agnostic side already bake in D&D specifics. That's fine; Phase A was the right time to ship D&D shapes. The rule going forward is **stop the bleeding, don't fix the past.**

**Genuinely clean today (keep that way):**
- [src/ids.ts](src/ids.ts): branded strings, no D&D coupling.
- [src/engine/replay.ts](src/engine/replay.ts), [commit.ts](src/engine/commit.ts), [undo-redo.ts](src/engine/undo-redo.ts): operate on opaque events.
- [src/schemas/runtime/session.ts](src/schemas/runtime/session.ts): sessions + journal, no D&D concepts.
- [src/schemas/runtime/in-game-time.ts](src/schemas/runtime/in-game-time.ts): minute-counting only.

**Partially coupled today (don't make worse; Slice 47 cleans up):**
- [src/schemas/runtime/currency.ts](src/schemas/runtime/currency.ts): cp/sp/ep/gp/pp hardcoded.
- [src/schemas/runtime/party.ts](src/schemas/runtime/party.ts): clean except the embedded `Currency`.
- [src/content/pack.ts](src/content/pack.ts): D&D content categories baked into the schema shape.
- [src/schemas/predicate.ts](src/schemas/predicate.ts), [formula.ts](src/schemas/formula.ts): machinery is agnostic, vocabulary is D&D.
- [src/engine/apply.ts](src/engine/apply.ts): hardcoded switch over D&D event types.

**Genuinely D&D-specific (no need to abstract):**
- All `src/schemas/content/*` schemas.
- `src/schemas/runtime/character.ts`, `encounter.ts`, `item-instance.ts`, `effect-instance.ts`, `pending-choice.ts`.
- D&D-mechanics event schemas (combat, spellcasting, rest, level-up, action-economy, concentration, attack, checks).
- All reducers, planners, and derivations.
- Effect primitive vocabulary in `src/schemas/effects.ts` (the *pattern* is agnostic; the *primitives* are D&D).

### Rule for new code

- Adding to a **genuinely clean** file: keep it clean. Don't bake in six ability scores, d20+AC, 13 damage types, spell slot architecture, etc. unless there's a concrete D&D reason that won't exist in other systems.
- Adding to a **partially coupled** file: don't deepen the coupling. If you're extending currency, party, the pack loader, predicate/formula DSLs, or the apply dispatcher, prefer shapes that fit a future generic split. Don't refactor preemptively, but don't make Slice 47 worse either.
- Adding to a **D&D-specific** file: build what 5.5e needs. No abstraction required.

The seam doesn't need to be perfect today, just clean enough that Slice 47 is a manageable refactor rather than a rewrite. Don't add to the debt; don't pay it down preemptively either.

## Architecture (locked)

- **Event-sourced.** State changes are events. `apply(state, event) -> state` is pure.
- **Plan/commit split.** `engine.plan(state, intent)` is the only place RNG is consumed; resolution events carry baked rolls. `apply()` never touches RNG. Replays read baked rolls.
- **Effect primitives.** Features are described via a fixed vocabulary of 52 primitives (53 `EFFECT_KINDS` entries counting the `Custom` escape hatch). Wild Shape, Polymorph, Wish and similar drop to code handlers (the `CustomEffect` escape hatch). Canonical list: `EFFECT_KINDS` in [src/schemas/effects.ts](src/schemas/effects.ts).
- **Branded IDs + ULIDs.** Per-kind branded string types (`CharacterId`, `SpellId`, `ItemDefinitionId` versus `ItemInstanceId`, etc.) backed by ULIDs.
- **Normalized state.** Entities live in `Record<Id, Entity>` maps under `CampaignState`, not nested arrays.
- **Immer internally, immutable externally.** `apply()` uses Immer for clean reducers; output is frozen.
- **Zod.** Single source of truth for schemas; types via `z.infer`. Parse at boundaries (loading content, deserializing campaigns). `apply()` trusts types.
- **Schema versioning.** Every persisted doc carries `schemaVersion`. Migration machinery lives in `src/migrations/` from day one.
- **PendingChoice protocol.** Deferred player decisions (ASI vs feat, subclass selection, spell selection, target selection) are first-class. `ChoiceRequired` events install a `PendingChoice` in state; `ChoiceResolved` records the selection; the effect-stack reads resolved choices and applies the selected option's effects to derivations.

## Source map (where things live)

- [src/schemas/events/](src/schemas/events/), event payload schemas (one file per category: attack, combat, action-economy, rest, etc.); aggregated in [src/schemas/events/index.ts](src/schemas/events/index.ts).
- [src/schemas/runtime/](src/schemas/runtime/), persisted-state shapes (campaign, character, encounter, item-instance, etc.).
- [src/schemas/content/](src/schemas/content/), content-pack shapes (classes, species, spells, items, etc.).
- [src/schemas/effects.ts](src/schemas/effects.ts), [predicate.ts](src/schemas/predicate.ts), [formula.ts](src/schemas/formula.ts), effect primitives + DSLs.
- [src/engine/apply.ts](src/engine/apply.ts), the master switch over event types; pure, RNG-free.
- [src/engine/reducers/](src/engine/reducers/), one file per event category; each exports `applyFoo(draft, event)`.
- [src/engine/plan/](src/engine/plan/), planners; the only place RNG is consumed. One file per intent.
- [src/engine/triggers/](src/engine/triggers/), trigger dispatch (Sneak Attack, opportunity attacks, etc.) called from planners post-event.
- [src/engine/replay.ts](src/engine/replay.ts), [commit.ts](src/engine/commit.ts), [undo-redo.ts](src/engine/undo-redo.ts), event-sourced infrastructure.
- [src/derive/](src/derive/), computed-over-state functions (AC, attack bonus, spell slots, ability checks, etc.).
- [src/effects/](src/effects/), `EffectAccumulator` builder and effect-stack composition.
- [src/content/packs/starter-pack.json](src/content/packs/starter-pack.json), the wired SRD content pack.
- [src/handlers/](src/handlers/), `CustomEffect` code handlers (escape hatch for Wild Shape, Wish, etc.).
- [src/index.ts](src/index.ts), the single public barrel.
- [tests/unit/](tests/unit/), reducer + derivation tests.
- [tests/golden/](tests/golden/), end-to-end scenarios + replay-equivalence + transcripts.
- [tests/audit/](tests/audit/), the 48-probe RAW compliance audit (intentionally monolithic).

## Export discipline

`src/index.ts` is the only public barrel. Nothing under `src/internal/` is exported. Anything not re-exported from `src/index.ts` is internal and may change without notice.

## Testing standard

Tests are valued for what they catch, not for ceremony. The bar is high on the layers that protect architectural invariants and rulebook correctness; everything else gets cut.

### Required test layers (value-dense, keep these)

1. **Reducer unit tests** ([tests/unit/reducers/](tests/unit/reducers/)). One file per event type. Cover the happy path plus every rulebook edge case (damage at 0 HP, temp HP interactions, exhaustion stacking, etc.) and invalid-input rejection. The rulebook lives here as executable code.
2. **Derivation unit tests** ([tests/unit/derive/](tests/unit/derive/)). Table-driven where a rulebook table exists (ability mod, proficiency bonus, spell slot multiclass table). For other derivations, cover the meaningful branches, not every branch.
3. **Golden-file scenarios** ([tests/golden/](tests/golden/)). End-to-end event streams plus expected final state. Doubles as living documentation of how the API is meant to be used.
4. **Replay equivalence** (hard architectural invariant). For every golden scenario: `replay(events).state` deep-equals `campaign.state`. Catches non-determinism in `apply()` reducers.
5. **RNG capture proof** (hard architectural invariant). `apply()` is RNG-free; `ThrowOnCallRNG` test double on `applyAll()` for a planned event stream must not throw. Proves the plan/commit split holds.
6. **Transcript snapshots** ([tests/golden/transcripts/](tests/golden/transcripts/)). Every golden scenario emits a human-readable markdown transcript via `formatTranscript()` from [tests/transcript.ts](tests/transcript.ts) and asserts it against a checked-in file. When a slice changes engine behavior, the transcript diff shows up in the PR alongside the code change. Update transcripts intentionally with `npx vitest run -u`. Use intent-revealing character names in golden tests (`'Alyx'`, `'Goblin A'`) since they appear in the transcript.
7. **Public API contract tests** ([tests/contract/](tests/contract/)). Two complementary locks on the public barrel ([src/index.ts](src/index.ts)): `exports.test.ts` snapshots the exported symbol surface (runtime names plus type-only exports, extracted by parsing the barrel) so an accidental add / remove / rename surfaces as a reviewable snapshot diff; `types.test.ts` pins the load-bearing signatures via `expectTypeOf` so a same-name signature change (a renamed param, a newly-required argument) fails even when the name snapshot wouldn't notice. The engine is a foundation other tools build on, so an intentional, reviewed record of every public-surface change earns the snapshot update. Update with `npx vitest run -u tests/contract/exports.test.ts` and review the diff in the commit; it is the canonical record of what changed about the public API.

### Coverage gates (enforced in [vitest.config.ts](vitest.config.ts))

Single floor of **80% lines + statements** on `src/engine/`, `src/derive/`, `src/effects/`. No global threshold. No per-file 100% targets. Coverage is a smoke alarm, not an accomplishment.

### Explicitly NOT required (cut as ceremony)

- ~~Public API contract snapshot tests. Breaks on every legitimate new export; signal-to-noise is too low.~~ **Reversed (slice 435): now a required layer (listed above).** The "breaks on every export" concern didn't bear out: the contract tests only move when the public surface actually changes (untouched across the 15 slices 420-434), which is the signal, not noise. For a foundation library consumers pin against, the reviewed per-change diff is worth keeping.
- Schema round-trip tests. Zod already guarantees parse stability for valid input.
- Effect-primitive coverage matrix as a separate file. Real features are exercised through golden scenarios and reducer tests.
- Property tests at fixed-iteration CI gates. Useful as one-off fuzz runs locally, not as a permanent gate.
- Coverage-filler tests written purely to hit thresholds.

### When adding new code

- New event type: reducer test + at least one golden scenario that uses it + transcript snapshot + a case in [tests/transcript.ts](tests/transcript.ts) `formatEvent`.
- New planner: planner test asserting the resolution chain shape + RNG-capture test if it consumes randomness + golden scenario with transcript.
- New derivation: table-driven tests for rulebook tables, branch tests for the rest.
- New effect primitive: exercised through a real-feature golden scenario, not a coverage-matrix entry.

If a test would only exist to satisfy a coverage threshold, do not write it. Add a test when you can name the bug it prevents.

## Code style

Defers to the global house style in `~/.claude/CLAUDE.md` (not a repo file, so not linked here) for the full conventions. Project-specific additions:

- TypeScript strict mode (enforced in [tsconfig.json](tsconfig.json) with `noUncheckedIndexedAccess`)
- No inline magic numbers/strings: extract to named module-scope constants. The 5.5e rules contain many of these (death-save thresholds, hit die averages, ability score range). Each gets a name.
- No defensive error handling for impossible cases. `invariant()` is for assertions at boundaries (event reducers verifying preconditions before mutating state), not for "this can never happen" checks inside pure helpers.
- Reducers must be small. If `applyFoo` grows past ~30 lines, extract intent-revealing helpers (`absorbTempHP`, `isMassiveDamage`, `resetDeathSaves`). The reducer reads as a sequence of named operations, not a procedure.
- Path alias `@/` = `src/`
- No em dashes or en dashes in any file (comments, docs, error messages). Use commas, parentheses, colons, or separate sentences.

## Versioning

- Format: `MAJOR.MINOR.PATCH[-pre-alpha|-alpha|-beta]`
- Bump on meaningful surface changes, not on every commit.
- `SCHEMA_VERSION` (in [src/version.ts](src/version.ts)) is independent of package version. Bump only when persisted shapes change, and ship a migration in the same PR.

## Parallel sessions

When engine-slice work and content authoring (monsters, magic items) can both make useful progress, run them in parallel via two git worktrees: engine on `dev` in the primary worktree, content on a sibling branch in `../dnd-srd-engine-content`. Both worktrees share `.git` history but hold independent working files. See [docs/parallel-authoring.md](docs/parallel-authoring.md) for setup commands, the file-footprint rules each session must respect, the starter prompt for the content-session Claude chat, and merge/cleanup steps.

## Slice workflow

Each slice typically touches the same set of layers. When working on a new slice:

1. **Event schemas** in [src/schemas/events/](src/schemas/events/). Include intent / resolution / notification events as appropriate. Resolution events carry baked RNG.
2. **Reducers** in [src/engine/reducers/](src/engine/reducers/), one file per event category. Wire into [src/engine/apply.ts](src/engine/apply.ts) (both the import and the switch case, both edits are easy to forget).
3. **Planners** in [src/engine/plan/](src/engine/plan/). RNG-consuming logic lives here, never in reducers.
4. **Public API** in [src/engine/index.ts](src/engine/index.ts) (the `Engine` interface and the `planNs` factory) and re-exports in [src/index.ts](src/index.ts).
5. **Tests**: reducer unit tests, planner tests with RNG-capture proof, at least one golden scenario per slice exercising replay-equivalence.

Common gotchas: forgetting to wire a new case into the apply.ts switch produces an "Unhandled event" runtime error. Forgetting the import causes a `ReferenceError` at apply time, not at typecheck time. The architectural invariant tests catch both but only if a golden scenario actually emits the new event.

For task-shape checklists (new planner vs new content type vs new derivation), see [docs/slice-template.md](docs/slice-template.md).

### Planner shape

Every planner in [src/engine/plan/](src/engine/plan/) follows the same skeleton. New planners should match it unless there's a documented reason not to.

```ts
export interface FooIntent {
  readonly type: 'Foo';
  readonly actorId: string;
  // …other intent fields…
  readonly at?: string; // optional timestamp override
}

export const planFoo = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG, // omit if the planner consumes no randomness
  intent: FooIntent,
): ReadonlyArray<Event> => {
  // 1. Resolve referenced entities; throw on unknown IDs.
  const actor = state.characters[intent.actorId];
  if (!actor) throw new Error(`Unknown actor ${intent.actorId}`);

  // 2. Validate preconditions (action economy, resource availability,
  //    blocking conditions, RAW restrictions). Throw with a
  //    user-readable message on violation.
  assertActorCanAct(actor, 'Foo');

  // 3. Resolve `at` once.
  const at = intent.at ?? nowIso();

  // 4. Consume RNG (rollDie, rollAdvantage, etc.). All RNG calls live
  //    in the planner; never in reducers or derivations.

  // 5. Build the event sequence. Emit intent / resolution / notification
  //    events in causal order. Set `causedByEventId` on dependent events.

  // 6. Dispatch triggers via `dispatchTriggers({state, content, rng, event, at})`
  //    after committing intermediate events with `applyAll` if downstream
  //    events depend on post-event state.

  return [/* events in order */];
};
```

Conventions:
- Intent type uses `readonly` fields and a literal `type` discriminator.
- Throw `Error` with a sentence the consumer could surface; never return error tuples.
- ID-form fields use plain `string` on the intent (consumer-facing); cast to branded IDs only when constructing events.
- `at` defaults to `nowIso()`; pass-through to every emitted event so a single planner call gets one timestamp.
- Wire the planner into [src/engine/plan/index.ts](src/engine/plan/index.ts) and (if part of the public API) into [src/engine/index.ts](src/engine/index.ts) and the convenience surface in [src/engine/conveniences.ts](src/engine/conveniences.ts). The `performIntent` dispatch site is the one wiring site tsc does NOT enforce (the dispatch is a plain `Record`); [tests/audit/planner-wiring.test.ts](tests/audit/planner-wiring.test.ts) guards it. Every `engine.plan` method must be either routed by the `performIntent` dispatch or on that audit's `EXCLUDED_FROM_DISPATCH` allowlist (reactions, ticks, lifecycle, transformations, special casts). A new player-action planner that forgets its dispatch entry fails the audit; a new reaction/tick/lifecycle planner is added to the allowlist with its category.

Reference examples: [plan/sacred-weapon.ts](src/engine/plan/sacred-weapon.ts) (small, no RNG), [plan/attack.ts](src/engine/plan/attack.ts) (large, RNG + triggers + multi-event resolution chain).
