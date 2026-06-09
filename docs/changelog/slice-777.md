# Slice 777 — release 0.11.0-alpha.0

**Type:** Release. Promotes the post-0.10.0 cohort (slices 749-776) to a tagged release.

## Version

`package.json` + `package-lock.json`: `0.10.0-alpha.0` → `0.11.0-alpha.0`. A **minor** pre-1.0 bump per [VERSIONING.md](../../VERSIONING.md): the cycle adds new public exports (the two-phase attack API and the completed affordance/query layer), which is a minor bump, not a patch.

`SCHEMA_VERSION` stays `1` — no `Event` / `CampaignState` persisted-shape change this cycle (the two-phase attack API is event-shape-preserving; everything else is additive query surface, a read-model field, docs, or infra).

## What's in this release (net over 0.10.0)

- **Two-phase attack API (749-755).** `engine.plan.attackRoll` / `attackDamage` split `resolveAttack` into a roll phase (emitting `AttackRolled`) and a damage phase, so a consumer opens a reaction window between them and a prevented hit never rolls damage dice / on-hit riders. `engine.plan.attack` composes the two byte-identically. The combat-fuzz pre-damage reaction layer (Shield / Protection / Cutting Words) was re-wired onto the new seam.
- **Affordance / intent-query layer completed through L7 (756-774).** Reaction discovery + trigger correlation (`availableReactions` / `reactionsForTrigger`, 9 reactions across 5 trigger kinds), general + class-feature action options (`actionOptions` / `useActionOption` / `actionTargets`), the bonus-action registry (`bonusActions` / `bonusActionTargets` / `useOption`, incl. metered amounts), post-hit Paladin's Smite (`postHitOptions` / `postHitIntent`), and creature-target enumeration — each verified planner-faithful by dispatching the built intent to its planner.
- **Fix (770):** `buildEncounterView` surfaces `hp.maxBonus`.
- **Docs (775):** the [L7 SRD-completion audit worklist](../l7-completion-audit.md) — the finite, severity-tagged list of remaining L1-7 divergences (engine + consumer seam).
- **Infra (776):** cross-platform / Windows fresh-agent hardening (`.gitattributes` LF for hooks, shell-agnostic `prepare`, `test:fast` glob quoting).

## Compatibility

- **Breaking:** none. All public-surface changes are additive new exports.
- **RNG / determinism:** `'none'` (positionless) combat-fuzz transcripts are byte-identical to 0.10.0; the golden / fuzz / replay-equivalence net is green. The `'auto'` reaction path shifts only where a reaction prevents a hit (intended, still deterministic + replay-equivalent).

## CHANGELOG hygiene

Promoted `## Unreleased` → `## 0.11.0-alpha.0 - 2026-06-09` with a fresh empty `## Unreleased`. Evicted the stale inline `0.6.0-alpha.0` narrative — an orphan the 0.7-0.10 releases left behind (it was inline yet absent from the "Older releases" pointer) — to [released-versions-0.6.0-alpha.0.md](released-versions-0.6.0-alpha.0.md), re-rooting its links and adding it to the pointer. The live CHANGELOG now holds only the active cycle + the pointer.

## Gate

`npx tsc --noEmit` clean; doc audits (size / links / counts) + `release:doc-counts:check` green; full `npx vitest run` green. Shipped via PR `dev` → `main`; tagged `v0.11.0-alpha.0` on the merged `main`.
