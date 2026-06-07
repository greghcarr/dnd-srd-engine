# Slice 712 — docs: queue the L4-cycle follow-ups in the deferred-primitives backlog

**Type:** Docs (backlog hygiene). No source change.

The L4 cycle (slices 702-711) left three deferrals recorded only in per-slice changelogs + commit bodies, not in the forward-looking priority queue a fresh session actually consults ([gaps-deferred-primitives.md](../gaps-deferred-primitives.md)). Per the repo convention (CLAUDE.md: "add to the Deferred primitives backlog any new deferral noted in a slice commit body"), they belong in the backlog. Added as three rows:

1. **L4 ASI menu — per-character feat eligibility** (slice 707): the `ability-score-improvement-4` OfferChoice lists ASI + Grappler unconditionally; it ignores Grappler's STR/DEX 13+ prereq and omits Fighting-Style feats for classes with the Fighting Style feature. Unblocker: a feat-prereq parser + a dynamic `planLevelUp` menu builder (slice-654 cascade pattern). Also a consumer feat-picker query.
2. **ASI "+1 to two abilities" — distinctness not enforced** (slice 703, confirmed in the slice-710 RAW audit): `planResolveChoice` doesn't reject duplicate selections, so `['str','str']` is accepted (RAW wants two different abilities). Affects any multi-select OfferChoice. Unblocker: a uniqueness guard on multi-select choice resolutions.
3. **Derived ability modifiers from base — three residual sites** (slice 710 pattern-check; the visible/combat-critical sites were fixed in 710): mirror-image duplicate AC, the finesse STR/DEX ability *choice*, and a monster-only per-trait save still use `abilityModifier(base)` instead of `effectiveAbilityScore`. Each needs the effect stack threaded in; near-zero real-world impact.

## Files

- [docs/gaps-deferred-primitives.md](../gaps-deferred-primitives.md): three new backlog rows.

## Verification

- `npx vitest run` (doc-size / doc-links / doc-counts audits): green. No source / tsc change.

## Audit (Uncle Bob)

- **Single source of truth**: the backlog is the canonical actionable queue; these now live there, not only in historical changelogs.
- **Pattern-check**: this slice itself closes the doc-hygiene gap the user flagged — the three follow-ups were buried in changelogs; now discoverable in the queue with concrete unblockers + file:line.
