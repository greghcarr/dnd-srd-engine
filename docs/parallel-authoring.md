# Parallel authoring with git worktrees

When engine-slice work and content authoring (monsters, magic items, future bulk content) can both make useful progress, run them in parallel via two git worktrees, two VS Code windows, and two Claude Code chats. The two sessions share git history but hold independent working files on different branches.

The engine session stays on `main` in the primary worktree. The content session lives in a sibling worktree directory on its own short-lived branch. At coordination points the content branch merges back to `main`.

## Setup

From the primary worktree's terminal:

```bash
git worktree add ../dnd-srd-engine-content -b content/authoring-batch-1
code ../dnd-srd-engine-content
```

In the new VS Code window's terminal:

```bash
npm install
ln -s ../dnd-srd-engine/references references
npx vitest run
```

`npm install` is required because `node_modules` is gitignored and per-worktree. The `references/` symlink points at the primary worktree's copy of the SRD markdown and PDF, which are gitignored. Without it the sibling sessions will try to fetch 5e content from the web (typically getting 2014-PHB-flavored answers that produce drift bugs). Confirm the suite is green (~2060 tests as of slice 361) and the symlink resolves (`ls references/srd-markdown/classes.md` shows the file) before starting Claude in the new window.

For subsequent batches, after merging batch N back to `main`, branch off again from inside the worktree. `main` is already checked out in the primary worktree, so you can't `git checkout main` here. Branch directly off the freshly-fetched remote tip instead: `git fetch origin && git checkout -b content/authoring-batch-2 origin/main`. Or reuse the same branch name if you removed the worktree at cleanup.

## File-footprint discipline

This is what keeps the two sessions from clobbering each other. The forbidden lists are enforced by convention, not tooling, so both sessions read them at the start of each slice.

### Engine session (primary worktree, `main`)

Allowed:
- All of `src/engine/`, `src/derive/`, `src/schemas/`, `src/effects/`, `src/handlers/`, `src/migrations/`, `src/rng/`, `src/internal/`, `src/index.ts`
- `src/content/packs/starter-pack.json` — spells, conditions, classes, subclasses, species, backgrounds, feats arrays
- All `tests/`
- All shared docs (`CHANGELOG.md`, `docs/starter-pack-gaps.md`, `docs/api-overview.md`, `README.md`, `CLAUDE.md`)

### Monster session (sibling worktree at `../dnd-srd-engine-monsters`, branch `content/monsters-batch-N`)

Allowed:
- `src/content/packs/starter-pack.json` — `monsters[]` array only, append-only, no modification of existing entries. No edits to any other top-level array.
- `docs/starter-pack-gaps.md` — Monsters section plus its row in the "Coverage at a glance" table.
- `CHANGELOG.md` — a clearly-labeled subhead like `**Content authoring: monsters batch N**` under `## Unreleased`.

Forbidden:
- All of `src/engine/`, `src/derive/`, `src/schemas/`, `tests/`. If a monster needs a schema field that doesn't exist, document the deferral in the gaps doc and skip the entry; do not extend the schema.
- All other arrays in `starter-pack.json` (items, spells, classes, subclasses, etc.).
- `README.md` — the engine session owns coverage-count edits at merge time.
- `CLAUDE.md` and the auto-memory directory.
- `tests/coverage/__snapshots__/features.test.ts.snap` — slice 126 narrowed the per-id catalog snapshots to wired-only entries, so pure stub additions don't move this snapshot. If it does move, stop and surface the diff; do not refresh with `-u` until coordinated with the engine session.

### Item session (sibling worktree at `../dnd-srd-engine-items`, branch `content/items-batch-N`)

Allowed:
- `src/content/packs/starter-pack.json` — `items[]` array only, append-only, no modification of existing entries. No edits to any other top-level array.
- `docs/starter-pack-gaps.md` — Items section plus its row in the "Coverage at a glance" table.
- `CHANGELOG.md` — a clearly-labeled subhead like `**Content authoring: items batch N**` under `## Unreleased`.

Forbidden:
- All of `src/engine/`, `src/derive/`, `src/schemas/`, `tests/`. Same schema-extension rule as the monster session.
- All other arrays in `starter-pack.json` (monsters, spells, classes, subclasses, etc.).
- `README.md`, `CLAUDE.md`, auto-memory directory.
- `tests/coverage/__snapshots__/features.test.ts.snap` — pure stub additions don't move it. If a wired magic item (effects or charges) moves it, stop and surface the diff.

## Starter prompt for the monster session

Paste this into the new Claude Code chat in the monster worktree's VS Code window:

```
We're running a parallel monster-authoring session for dnd-srd-engine in a separate git worktree. The engine / SRD-audit session is on `main` in another VS Code window, and an item-authoring session is in a third worktree handling magic items. This session is on branch `content/monsters-batch-N` in worktree `../dnd-srd-engine-monsters` and is restricted to monster content. No engine code, no schema changes, no item / class / spell work.

**SRD source of truth.** Treat `references/srd-markdown/` as the canonical SRD 5.2.1 source. Grep it for any rules text or statblock you're matching against; never fetch 5e content from the web (most web sources are 2014-PHB-flavored and have caused drift bugs in past slices). If `references/srd-markdown/` doesn't exist in this worktree, surface that immediately rather than proceeding; the primary worktree has it, and a symlink (`ln -s ../dnd-srd-engine/references references`) makes it visible here.

Confirm setup before starting: run `git status` (should show clean working tree), `git branch --show-current` (should print `content/monsters-batch-N`), `pwd` (should end in `dnd-srd-engine-monsters`), and `ls references/srd-markdown/monsters-A-Z.md` (should show the file).

Allowed edits:
- `src/content/packs/starter-pack.json` — appending entries to the `monsters[]` array only. Do not touch any other top-level array; do not modify existing monster entries.
- `docs/starter-pack-gaps.md` — the Monsters section plus its row in the "Coverage at a glance" table only.
- `CHANGELOG.md` — add a subhead like `**Content authoring: monsters batch N**` under `## Unreleased`. Don't touch other sessions' entries.

Forbidden:
- All of `src/engine/`, `src/derive/`, `src/schemas/`, `tests/`. If a monster needs a schema field that doesn't exist, document the deferral in the gaps doc and skip the entry; do not extend the schema.
- All other arrays in `starter-pack.json` (items, spells, classes, subclasses, etc.).
- `README.md` — the engine session owns coverage-count edits at merge time.
- `CLAUDE.md` and any auto-memory files.
- `tests/coverage/__snapshots__/features.test.ts.snap` — slice 126 narrowed the per-id catalog snapshots to wired-only entries, so pure stub additions don't move this snapshot. If it does move, stop and surface the diff rather than refreshing with `-u`.

Slice cadence (mirrors the engine session):
1. Pick a batch by reading [docs/starter-pack-gaps.md](starter-pack-gaps.md) Monsters section and the existing `monsters[]` entries in [src/content/packs/starter-pack.json](../src/content/packs/starter-pack.json).
2. Add the JSON entries matching [src/schemas/content/monster.ts](../src/schemas/content/monster.ts). Reference entries: Goblin, Orc, Wolf, Skeleton, Ogre, Young Red Dragon, Adult Red Dragon.
3. Update the gaps doc Monsters section and bump the "Coverage at a glance" count.
4. Add a CHANGELOG entry under `## Unreleased` with the rigid subhead label above.
5. `npx vitest run` — full suite green. The content-pack validator catches malformed entries.
6. `npx tsc --noEmit` — clean.
7. Pre-commit Uncle Bob self-review: no schema drift; `git diff --name-only` only shows files in the allowed list; full vitest green; intention-revealing IDs and names.
8. Commit locally with message format `content (monsters batch N.M): <cohort name>`. Never push.

Pack reference conventions:
- IDs are kebab-case (e.g. `bugbear`, `young-blue-dragon`).
- Monster CR is a string (`"1/4"`, `"1/2"`, `"1"`, etc.). See the Goblin entry for canonical shape.
- Skip any entry whose mechanics need an engine primitive that isn't shipped yet. Document the deferral in the gaps doc rather than half-wiring.

Coordination notes:
- The engine session is on `main`; the item session is on `content/items-batch-N` in `../dnd-srd-engine-items`. JSON conflicts on `monsters[]` are unlikely since neither other session writes there.
- Doc conflicts on `CHANGELOG.md` and `docs/starter-pack-gaps.md` happen when sessions land near simultaneously. Resolve by keeping both blocks.
- Each worktree maintains its own `node_modules`. If the engine session lands a dependency change in `package.json`, this worktree needs its own `npm install` to pick it up.

To start: read the gaps doc's Monsters section, then propose a starting batch (e.g. "5 mid-CR aberrations" or "the canonical SRD trolls + ogre variants"). Wait for confirmation before authoring.
```

## Starter prompt for the item session

Paste this into the new Claude Code chat in the item worktree's VS Code window:

```
We're running a parallel item-authoring session for dnd-srd-engine in a separate git worktree. The engine / SRD-audit session is on `main` in another VS Code window, and a monster-authoring session is in a third worktree. This session is on branch `content/items-batch-N` in worktree `../dnd-srd-engine-items` and is restricted to magic-item content. No engine code, no schema changes, no monster / class / spell work.

**SRD source of truth.** Treat `references/srd-markdown/` as the canonical SRD 5.2.1 source. Grep `references/srd-markdown/magic-items.md` for item RAW text; never fetch 5e content from the web (most web sources are 2014-PHB-flavored and have caused drift bugs in past slices). If `references/srd-markdown/` doesn't exist in this worktree, surface that immediately rather than proceeding; the primary worktree has it, and a symlink (`ln -s ../dnd-srd-engine/references references`) makes it visible here.

Confirm setup before starting: run `git status` (should show clean working tree), `git branch --show-current` (should print `content/items-batch-N`), `pwd` (should end in `dnd-srd-engine-items`), and `ls references/srd-markdown/magic-items.md` (should show the file).

Allowed edits:
- `src/content/packs/starter-pack.json` — appending entries to the `items[]` array only. Do not touch any other top-level array; do not modify existing entries.
- `docs/starter-pack-gaps.md` — the Items section plus its row in the "Coverage at a glance" table only.
- `CHANGELOG.md` — add a subhead like `**Content authoring: items batch N**` under `## Unreleased`. Don't touch other sessions' entries.

Forbidden:
- All of `src/engine/`, `src/derive/`, `src/schemas/`, `tests/`. Same schema-extension rule as the monster session.
- All other arrays in `starter-pack.json`.
- `README.md`, `CLAUDE.md`, any auto-memory files.
- `tests/coverage/__snapshots__/features.test.ts.snap` — pure stub additions don't move it. If a wired magic item (effects or charges) moves it, stop and surface the diff rather than refreshing with `-u`.

Slice cadence (mirrors the engine session):
1. Pick a batch by reading [docs/starter-pack-gaps.md](starter-pack-gaps.md) Items section and the existing `items[]` entries.
2. Add the JSON entries matching [src/schemas/content/item.ts](../src/schemas/content/item.ts) with `itemKind: 'magic'` and a `rarity` field. Reference entries: Bag of Holding, Wand of Magic Missiles, Cloak of Protection.
3. Update the gaps doc Items section and bump the "Coverage at a glance" count.
4. Add a CHANGELOG entry under `## Unreleased`.
5. `npx vitest run` — full suite green.
6. `npx tsc --noEmit` — clean.
7. Pre-commit Uncle Bob self-review (same as the monster session).
8. Commit locally with message format `content (items batch N.M): <cohort name>`. Never push.

Pack reference conventions:
- IDs are kebab-case (e.g. `wand-of-fireballs`, `cloak-of-elvenkind`).
- Rarity is one of `common`, `uncommon`, `rare`, `very rare`, `legendary`, `artifact`.
- Skip any item whose mechanics need an engine primitive that isn't shipped yet. Document the deferral in the gaps doc rather than half-wiring.

Coordination notes: same shape as the monster session, just with `items[]` instead of `monsters[]`. The monster lane shouldn't collide; rebase if the engine session lands a schema change to items.

To start: read the gaps doc's Items section, then propose a starting batch (e.g. "5 uncommon wondrous items" or "the canonical SRD +1/+2/+3 weapons across the weapon list"). Wait for confirmation before authoring.
```

## Coordination during parallel work

- `git log main` from either worktree shows the other's commits in real time. Use this to confirm the engine session hasn't landed something that affects the content session's footprint (e.g., a schema change to monster entries).
- JSON conflicts on `starter-pack.json` are rare in practice because the two sessions target disjoint top-level arrays.
- Doc conflicts on `CHANGELOG.md` and `docs/starter-pack-gaps.md` are the most common friction. Resolve by keeping both blocks; both sessions add new content rather than modifying shared text.
- The `features.test.ts` snapshot moves when an engine slice wires a new effect-bearing condition / feature / feat, or when a magic item gains effects or charges. Pure stub content additions don't move it (slice 126 narrowed the per-id catalogs to wired-only). When it does move, only one session should `-u` at a time; the other re-runs the suite after merge to absorb the new baseline.
- If the engine session changes `package.json` dependencies, the content worktree needs its own `npm install`.

## Cleanup when the content branch wraps

In the primary (engine / `main`) worktree's terminal:

```bash
git merge content/authoring-batch-1
git worktree remove ../dnd-srd-engine-content
git branch -d content/authoring-batch-1
```

If the merge has conflicts, VS Code's merge editor handles them. `git worktree remove` refuses if the worktree has uncommitted changes; commit or stash inside the worktree first.

For multiple batches you can keep the worktree around and just create a new branch from inside it after each merge instead of removing and recreating.

## Scaling beyond two sessions

The pattern accommodates a third (or fourth) parallel session if you can carve N disjoint file footprints. The constraint is unchanged: every session must have a clear, non-overlapping set of files it owns.

### Practical N=3 splits

| Split | Lane A (primary, `main`) | Lane B (worktree at `../dnd-srd-engine-monsters`) | Lane C (worktree at `../dnd-srd-engine-items`) |
|---|---|---|---|
| Default (current) | Engine + SRD audit + classes / spells / conditions / subclasses | Monsters only | Magic items only |
| Content + docs polish | Engine (defers README / api-overview edits while Lane C is active) | Monsters + items | README + api-overview + tutorial / examples |

The default keeps `starter-pack.json` writes to disjoint top-level arrays (`monsters[]` / `items[]` / everything-else), so JSON-level merge conflicts stay rare.

### New friction points at N≥3

- **CHANGELOG.md three-way contention.** All sessions add subheads under `## Unreleased`. Merge conflicts go from rare to routine but stay mechanical to resolve when each session uses a rigid subhead label: `**Engine slices**` or feature-specific, `**Content authoring: monsters batch N**`, `**Content authoring: items batch N**`.
- **Coverage-at-a-glance table in [docs/starter-pack-gaps.md](starter-pack-gaps.md).** Two content sessions touching adjacent rows in a single Markdown table conflict on every merge. Mitigation: designate the engine session as the scorekeeper. Content sessions update their per-category section bodies but leave the summary table to the engine session, which bumps counts at merge time.
- **features.test.ts snapshot.** The "only one session refreshes at a time" rule from the 2-session pattern still applies; the bottleneck just becomes more visible.
- **Disk and CPU.** Each worktree carries its own `node_modules` (~300 MB). Three concurrent `npx vitest run` invocations (90s each, property tests CPU-bound) compete for cores.
- **Mental overhead.** Three Claude chats is meaningfully harder to context-switch than two; expect to spend more time on "which lane is this again?" between interactions.

### Practical ceiling

Probably 3-4 sessions before the coordination tax exceeds the parallelization benefit. Beyond that, serialize or combine lanes into longer batched sessions.

### Setup for the default three-lane layout

The two sibling worktrees already exist at `../dnd-srd-engine-monsters` and `../dnd-srd-engine-items` (recreated fresh at slice 176). To start a new round of work in each, open that folder in a VS Code window and in its terminal:

```bash
npm install
npx vitest run
```

`npm install` is required per worktree because `node_modules` is gitignored. Confirm the suite is green, then paste the corresponding starter prompt below. The first time a worktree is set up the branch is created at the current `main`; for subsequent batches the worktree stays in place and the branch fast-forwards (or a new branch is created from `main`).

If a worktree was previously removed and needs to be recreated, from the primary worktree:

```bash
git worktree add ../dnd-srd-engine-monsters -b content/monsters-batch-N
```

(Substitute `items` and `items-batch-N` for the item lane.)

## When NOT to use this pattern

- For a single small content addition (one or two monsters), the overhead of a worktree isn't worth it. Add directly to `main` in the engine session.
- When the engine session is between slices and idle, parallel work has no benefit. Run serially.
- When a content addition requires a schema extension. That's an engine slice in disguise; do it on `main`.
