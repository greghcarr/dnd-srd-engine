# Versioning

This package follows [Semantic Versioning](https://semver.org/), with project-specific rules for what each kind of bump means while still pre-1.0. The goal is that an adopter reading a release tag can predict whether upgrading is safe without reading the diff.

## Two version numbers

The package carries two independent versions:

- **Package version** in [package.json](package.json). Follows semver per the rules below. Bumps when behavior, API surface, or content changes in a way users should know about.
- **`SCHEMA_VERSION`** in [src/version.ts](src/version.ts). A monotonic integer that bumps only when the persisted shape of `Event` or `CampaignState` changes in a way that breaks loading old saves. Each `SCHEMA_VERSION` bump ships with a migration in [src/migrations/](src/migrations/).

Schema migrations are decoupled from the package version: a new feature may not bump SCHEMA_VERSION (if it doesn't change persisted shape), and a SCHEMA_VERSION bump may not require a package bump if the migration is transparent.

## What each pre-release tag means

- **`0.x.y-alpha.N`**: feature-complete per the roadmap, all CI gates green, no external consumers have validated the API in production-ish use yet. APIs may change without a major bump. **Adopt only if you're willing to follow API changes during the alpha cycle.**
- **`0.x.y-beta.N`**: at least one external consumer has shipped against this API and reported it stable. APIs are unlikely to break but might. **Reasonable for non-critical production use, with a willingness to upgrade through one beta cycle.**
- **`0.x.y-rc.N`**: no API changes expected; bug-fix tickets only. **Adopt if you want the first stable release. Migration from rc to 1.0.0 is a no-op.**

`pre-alpha` is no longer used; the project is past that stage.

## Bump triggers

Within a pre-release line (e.g., `0.1.0-alpha.0` -> `0.1.0-alpha.1`):

- **Patch within pre-release** (`alpha.0` -> `alpha.1`): bug fixes, doc updates, performance improvements, internal refactors, test additions, new content in the starter pack. No public API changes.

Across pre-release stages (e.g., `0.1.0-alpha.N` -> `0.1.0-beta.0`):

- **Promotion**: see [Promotion criteria](#promotion-criteria). The version number under the tag stays the same; only the tag advances.

Across versions:

- **Minor pre-1.0** (`0.1.0` -> `0.2.0`): new features, new public exports, **breaking changes** to the public API (this is the pre-1.0 escape hatch). May reset the pre-release tag (e.g., `0.1.0-beta.3` -> `0.2.0-alpha.0` if the new features need their own validation cycle).
- **Major** (`0.x.y` -> `1.0.0`): first stable release. Promise: no breaking API changes within the `1.x` line without a major bump.
- **Major post-1.0** (`1.x.y` -> `2.0.0`): breaking change considered unavoidable. Minimum: a deprecation period of one beta cycle in `1.x`, and a migration script in `src/migrations/` if persistence is affected.

Once stable (`1.0.0+`), standard semver applies:

- **Patch** (`1.0.0` -> `1.0.1`): bug fixes only. No new exports, no behavior changes documented users could depend on.
- **Minor** (`1.0.0` -> `1.1.0`): new features, new exports. Backward-compatible.
- **Major** (`1.0.0` -> `2.0.0`): breaking changes.

## Promotion criteria

These are the gates that move the project from one pre-release tag to the next.

### Alpha -> Beta

All of:

1. At least one external consumer has shipped a real app against the package (a private project counts; a published artifact is stronger).
2. The public API has not changed in the last 2 weeks of alpha (no breaking changes, only patch and content bumps).
3. No open bug reports against architectural invariants (event-sourcing, plan/commit, RNG capture, replay equivalence).
4. CHANGELOG entry attributes the consumer or describes the validation.

The version number under the tag stays the same. Only the tag advances (`0.1.0-alpha.N` -> `0.1.0-beta.0`).

### Beta -> Release candidate

All of:

1. 4 weeks of beta with no API-breaking changes.
2. At least 3 external consumers reporting stable integration (or 1 production consumer at small scale).
3. The CHANGELOG is up to date and reads as release notes.

`0.1.0-beta.N` -> `0.1.0-rc.0`.

### Release candidate -> 1.0.0

All of:

1. 2 weeks of rc with no API changes (patches okay).
2. No open critical bugs.
3. Documentation reviewed end to end.

`0.1.0-rc.N` -> `1.0.0`.

This is a roadmap, not a promise. Promotion is gated on **external-consumer validation**, not on the calendar. If nobody tries the alpha, beta doesn't happen until somebody does.

## What counts as a breaking change

**Breaking** (requires pre-1.0 minor bump or post-1.0 major bump):

- Removing or renaming a public export from [src/index.ts](src/index.ts).
- Changing a function signature in a way that breaks existing callers (new required argument, narrower parameter type, removed return field, etc.).
- Changing a Zod schema in a way that makes previously-valid input invalid (adding a required field, narrowing an enum, tightening a regex).
- Changing the shape of a returned object that documented users depend on.
- Changing event reducer behavior in a way that makes existing event logs replay to different states.
- Changing the meaning of a `SCHEMA_VERSION` without a migration.

**Not breaking** (patch bump only):

- Adding a new optional field to a schema (Zod treats missing fields as undefined).
- Adding a new public export.
- Adding a new event type (existing logs continue to work, because the old reducer never encounters the new type).
- Adding a new planner.
- Performance improvements that don't change observable behavior.
- Bug fixes, unless they change documented behavior; if so, breaking.
- Adding content to the starter pack.

## CHANGELOG discipline

Every release bumps [CHANGELOG.md](CHANGELOG.md). Unreleased changes accumulate under an `## Unreleased` header until the bump. Each release entry includes:

- Version + ISO date.
- Changes grouped by category: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**. Categories with no entries are omitted.
- Any schema migration is called out under **Changed** with the prior and new `SCHEMA_VERSION` numbers and a link to the migration file.
- Promotion entries (alpha -> beta, beta -> rc, rc -> 1.0.0) include attribution for the external-consumer validation that gated the promotion.

## Schema versioning specifics

When you ship a change that breaks the on-disk shape of `Event` or `CampaignState`:

1. Bump `SCHEMA_VERSION` in [src/version.ts](src/version.ts).
2. Add a migration function in [src/migrations/](src/migrations/) that transforms a state at the prior version to the new one.
3. Register the migration so `migrate(json)` walks the chain.
4. Add a test that verifies the migration round-trips correctly against a representative state.
5. CHANGELOG entry under **Changed** with the old and new `SCHEMA_VERSION` and the migration file path.

Schema migrations are automatic on load: `loadCampaign(json)` walks `SCHEMA_VERSION` forward before replay. Consumers don't write migration code unless they fork the engine and add their own persisted shapes.

## Current roadmap

Concrete next bumps:

| Version | When | What |
|---|---|---|
| **0.1.0-alpha.0** | 2026-05-12 | First alpha. Phases A through E complete (Slices 1–46). Originally published to npm; later unpublished on IP-cleanup grounds. |
| **0.1.0-alpha.5** | 2026-05-14 | Tier 3 content-stub sweep; class-feature matrix to 48 wired / 0 stub at L1–7; 48-probe RAW-compliance audit; 1009 tests. Originally published; later unpublished. |
| **0.1.0-alpha.6** | 2026-05-18 | Cumulative post-alpha.5 release. 204 vocabulary-expansion slices (47–250). Package renamed from `ttrpg-engine-dnd` to `dnd-srd-engine` (slice 247); SRD 5.2.1 pack-presence complete in every category; 49 wired effect primitives + `Custom`; SRD markdown shipped as git submodule (slice 245); fresh-agent discovery surface polished (slices 246–250). Test count 1643 across 244 files. See [CHANGELOG.md](CHANGELOG.md). |
| **0.1.0-alpha.7+** | as needed | Continued primitive + canonical-user vocabulary expansion. Nothing API-breaking. |
| **0.2.0-alpha.0** | only if needed | Breaking API change discovered during validation, OR substantial new features that warrant their own alpha cycle. Pre-1.0 escape hatch. |
| **0.1.0-beta.0** | when an external consumer ships | First validated alpha promotes to beta. See [Promotion criteria](#promotion-criteria). |
| **0.1.0-rc.0** | 4 weeks of stable beta | API frozen, bug-fix tickets only. |
| **1.0.0** | 2 weeks of stable rc | First stable release. API stability promised within the 1.x line. |
| **1.x.y** | ongoing | Bug fixes (patch), new features (minor) within the 1.x compatibility line. |
| **2.0.0** | only if unavoidable | Major breaking change with deprecation period and migration. |

This is not a calendar commitment. The gate is external-consumer validation; the dates are estimates.

## Notes for adopters

- **If you're starting today**: pin to a specific version (e.g., `0.1.0-alpha.0`), not a tag range. The pre-1.0 alpha contract permits breaking changes in subsequent minor bumps.
- **When upgrading**: read the CHANGELOG between your version and the target. Every breaking change is documented.
- **If a SCHEMA_VERSION bump appears**: your old saves will migrate transparently on load via `loadCampaign(json)`. No action needed.
- **If you find a breaking change that isn't documented**: that's a bug; please open an issue.

## Notes for maintainers

- Don't bump the version on every commit. The version is a user-facing signal, not a build counter.
- When in doubt about whether a change is breaking, treat it as breaking. The cost of an over-cautious minor bump is small; the cost of a silently-breaking patch bump is consumer trust.

### Release workflow

The engine is not currently distributed through a package registry (`private: true` is set in `package.json`); the alpha.0 through alpha.5 npm releases were unpublished in May 2026 on IP-cleanup grounds. The version field still bumps as documented above to keep a consistent signal across CHANGELOG entries, dist build outputs, and any consumers pinning to a git ref.

When a release-worthy commit lands on `main`:

1. Bump `package.json` `version` per the rules above.
2. Move the `## Unreleased` heading in `CHANGELOG.md` to `## X.Y.Z-stage.N - YYYY-MM-DD` and open a fresh `## Unreleased` block.
3. Tag the commit: `git tag vX.Y.Z-stage.N` (push the tag only on explicit instruction, per the commit-don't-push rule in CLAUDE.md / DEVELOPMENT.md). Consumers pinning to a tag get a stable reference; consumers pinning to `github:greghcarr/dnd-srd-engine` get the moving tip.
