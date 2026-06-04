# Slice 629 — CLAUDE.md split + engine-scope reference + tone polish

**Type:** Docs.

The repo's working manual was 464 lines, auto-loaded for every Claude Code session, and conflated three distinct audiences: agent-specific safety rules (apply only to Claude), universal contributor norms (apply to every human + AI), and architecture facts (describe the engine, not how to work on it). Non-Claude agents (Codex CLI, Cursor) and human contributors had to read 400+ lines to find the ~150 lines that applied to them. This slice splits the manual along audience boundaries and adds a sibling reference doc that answers the integration question "do I need to track this, or does the engine?"

## Changes

### New documents

- **Created [../architecture.md](../architecture.md)** — engine internals (the locked architectural decisions, source map, planner shape, export discipline, testing standard, system-agnostic seam). 182 lines. Extracted verbatim from the prior CLAUDE.md with link-rooting adjustments for the new location. Single source of truth for "where things live and why."
- **Created [../engine-scope.md](../engine-scope.md)** — engine-tracks-vs-consumer-tracks reference. Three sections: what the engine tracks (HP, action economy, conditions, slots, concentration, initiative, etc.); what your app tracks (positions, line of sight, ambient light, narrative DM choices, area target selection, etc.); consumer-coordinated fact slots (the middle category where the engine ships the predicate plumbing and your app supplies the per-intent value: `bearerCanSeeFearSource`, `targetCanSeeAttacker`, `lightLevel`, `attackerHasAllyAdjacentToTarget`). Each fact slot documents its default-undefined semantic so consumers know whether the engine fires the RAW arm by default or only when wired. 81 lines. Cross-links to [../starter-pack-gaps.md](../starter-pack-gaps.md) for the per-row entry-point + RAW citation detail.

### Restructured documents

- **Expanded [../../CONTRIBUTING.md](../../CONTRIBUTING.md)** from 112 to 288 lines. Now carries every universal contributor norm previously in CLAUDE.md: quality bar, slice cadence, SRD canon, pre-commit Uncle Bob audit (full 7-bullet checklist), pattern-check on bugs (with the filter-shape + under-walking-references refinements), doc updates per slice, CHANGELOG entry shape (both pointer + per-slice file templates), doc size discipline, pre-commit checks, code style, versioning, parallel sessions, bug reporting. Adds an "Architecture is locked" section pointing at [../architecture.md](../architecture.md) and a "Working with an AI agent" section pointing at [../../CLAUDE.md](../../CLAUDE.md) / [../../AGENTS.md](../../AGENTS.md).
- **Slimmed [../../CLAUDE.md](../../CLAUDE.md)** from 464 to 72 lines. Now holds only: a pointer index to the new triad ([../../CONTRIBUTING.md](../../CONTRIBUTING.md), [../architecture.md](../architecture.md), [../engine-scope.md](../engine-scope.md)) with one-line rationale per target; the fresh-session quickstart; agent safety rules duplicated from CONTRIBUTING.md (commit-don't-push, SRD canon, branch/slice rules, pattern-check, doc updates, pre-commit checks) so they're in context at every session even when the agent hasn't opened CONTRIBUTING.md yet; the internal engineering-quality framing note; and a tiebreaker rule (canonical lives in CONTRIBUTING / architecture).
- **Updated [../../AGENTS.md](../../AGENTS.md)** to point at the new triad. Same shape as before — a pointer file for agents that don't auto-load CLAUDE.md — but the pointers now route to CONTRIBUTING.md + docs/architecture.md + docs/engine-scope.md rather than the single CLAUDE.md.
- **Updated [../../.cursorrules](../../.cursorrules)** with the same retargeting.

### Cross-reference updates

- **[../../README.md](../../README.md)**: added a new "New here?" section above "Try it in your browser" — three short bullets routing using-the-library, integrating-it, and contributing readers to the right document. Updated the Quick start sub-bullets and the Documentation table to surface `docs/engine-scope.md` and `docs/architecture.md`. The "What lives in this repo" table now lists [../../CONTRIBUTING.md](../../CONTRIBUTING.md) / [../architecture.md](../architecture.md) as the contributor manual + engine internals row, with CLAUDE.md / AGENTS.md / .cursorrules as a separate agent-pointers row. The Contributing section at the bottom re-ordered: contributors land at CONTRIBUTING + architecture first; agents land via CLAUDE.md / AGENTS.md.
- **[../slice-template.md](../slice-template.md)**: planner-shape and slice-workflow pointers retargeted to [../architecture.md](../architecture.md); CHANGELOG-entry-shape pointer retargeted to [../../CONTRIBUTING.md](../../CONTRIBUTING.md#changelog-entry-shape).
- **[../starter-pack-gaps.md](../starter-pack-gaps.md)**: "Read CLAUDE.md first" → "Read CONTRIBUTING.md first"; "Doc size discipline" cross-link retargeted to CONTRIBUTING.md.
- **[../plugin-api-design.md](../plugin-api-design.md)**: locked-architecture pointer retargeted to [../architecture.md](../architecture.md).

### Audit update

- **[../../tests/audit/doc-size.test.ts](../../tests/audit/doc-size.test.ts)**: added the three new front-door docs (`CONTRIBUTING.md`, `docs/architecture.md`, `docs/engine-scope.md`) to the `fixedFiles` list so they're guarded against the 60 KB single-Read ceiling. Updated the failure message to point at CONTRIBUTING.md's "Doc size discipline" section (formerly in CLAUDE.md). All three new files comfortably under the ceiling (CONTRIBUTING.md ~13 KB, architecture.md ~10 KB, engine-scope.md ~7 KB).

## Verification

- `npx vitest run tests/audit/doc-size.test.ts tests/audit/doc-links.test.ts tests/audit/doc-counts.test.ts tests/audit/doc-examples.test.ts` — 28 tests passing (was 25; +3 are the new front-door docs added to doc-size).
- `npx vitest run` — 501 files / 3364 tests passing (+3 over slice 628, all in doc-size).
- `npx tsc --noEmit` — clean.
- Manual: opened the new CLAUDE.md as a fresh agent would. The agent safety rules + the pointer index are in the first 30 lines; CONTRIBUTING.md and docs/architecture.md are linked from Step 1 of the fresh-session quickstart.

## Audit

- **Names**: `docs/architecture.md` and `docs/engine-scope.md` follow the existing `docs/<topic>.md` convention. CONTRIBUTING.md was already there; expanded in place rather than renamed.
- **DRY**: the agent safety rules appear in both CONTRIBUTING.md (canonical) and CLAUDE.md (auto-loaded summary). The duplication is intentional — without it, a Claude Code session won't see the safety rules until it opens CONTRIBUTING.md, defeating the purpose of an auto-loaded safety file. CLAUDE.md's "If anything below conflicts with above" tiebreaker makes the canonical relationship explicit.
- **SRP**: each new doc has a single audience. CONTRIBUTING.md = "how to contribute"; architecture.md = "how the engine is built"; engine-scope.md = "what the engine tracks vs what you track." CLAUDE.md = "agent-specific safety + pointers."
- **Pattern-check**: swept `docs/`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `.cursorrules` for live cross-references to CLAUDE.md sections that moved (architecture, slice-workflow, planner-shape, CHANGELOG-entry-shape, doc-size-discipline). Five live files updated (slice-template, starter-pack-gaps, plugin-api-design, README, AGENTS, .cursorrules, doc-size.test.ts). The frozen `docs/changelog/archive-*.md` and `docs/changelog/released-versions-*.md` files keep their historical CLAUDE.md references — they're a historical record, not live guidance.

## Risk / rollback

Medium. The CLAUDE.md auto-load contract is real: 392 lines moved out, and a Claude Code session opened in this repo will see only the new 72-line file by default. Mitigations:

- Duplicated the 6 most safety-critical rules (commit-don't-push, SRD canon, branch/slice rules, pattern-check, doc updates, pre-commit checks) verbatim in CLAUDE.md even though they also live in CONTRIBUTING.md. The auto-load still buys safety even before the agent opens CONTRIBUTING.md.
- CLAUDE.md's first table is a "what moved" pointer index naming each piece of content's new home, so a returning agent immediately sees where each former section lives.
- Fresh-session quickstart Step 1 explicitly: "Read CONTRIBUTING.md and docs/architecture.md before opening any code."
- AGENTS.md, .cursorrules, and the README contributor section all retargeted in the same slice — no agent or human entry point still points at the old CLAUDE.md structure.

Rollback is `git revert` of this slice. CHANGELOG restructure (628) and the tutorial / numerical sweep (630/631) are independent and not affected.

## Open follow-ups

- **Slice 630**: comprehensive feature tutorial (`docs/tutorial.md` walking install → character → combat → spells → reactions → masteries → rests → level-up → custom content → consuming events → save/load/replay → determinism → cross-link to engine-scope).
- **Slice 631**: numerical accuracy sweep + audit extension (extend `doc-counts.test.ts` with mechanical-wiring percentage CHECKS; sweep all docs for unguarded numerical claims).
