# Breaking changes queued for the next release

Items that landed on `dev` after the most-recent tagged release ([0.3.0-alpha.0](../CHANGELOG.md), 2026-06-05) and constitute consumer-facing breaking changes. When the next release tag is cut, these become the release-notes "Breaking" section.

Per [VERSIONING.md](../VERSIONING.md), the pre-1.0 escape hatch is the minor bump: `0.x.y-alpha.N` may ship breaking API changes without a major bump as long as they're announced in the release notes. This doc keeps the announcement queue durable across slices.

## Public API changes

(none queued)

## RNG-stream changes (per-seed reproducibility shifts)

Per [docs/determinism.md](determinism.md), per-seed RNG reproducibility is version-sensitive. (none queued)

## Format

Future breaking changes append a new `### Slice N: <one-line headline>` section here. Each section: pre-slice behavior, post-slice behavior, why (with RAW citation if applicable), migration steps, detection guidance.

At the next release-tag cut, copy this file's content into the release notes' "Breaking" section, then clear the file.
