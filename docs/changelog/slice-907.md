# Slice 907 — release 0.12.0-alpha.0

**Type:** Release. Promotes the post-0.11.0 cohort (slices 778-906) to a tagged release.

## Version

`package.json` + `package-lock.json`: `0.11.0-alpha.0` → `0.12.0-alpha.0`. A **minor** pre-1.0 bump per [VERSIONING.md](../../VERSIONING.md): the cycle adds new public exports (new planners and effect kinds, below), which is a minor bump, not a patch.

`SCHEMA_VERSION` stays `1` — no `Event` / `CampaignState` persisted-shape break this cycle. Every slice was additive or opt-in (new optional intent/schema fields, new events the old reducer never encounters, state-record storage); old saves load clean.

## What's in this release (net over 0.11.0)

- **L7 SRD-completion audit driven to 3 open rows.** The audit (created at slice 775, ~95 findings across 9 areas) is now **3 open consumer QUIRKs**: Areas 1-7 and 9 are fully closed and Area 8's engine half is done. Everything still open is a consumer/docs hand-off ([consumer-handoff-dnd-web.md](../consumer-handoff-dnd-web.md)).
- **Edition drift corrected (Area 1).** Long Rest restores all Hit Dice (not half); Sleep / Color Spray are saving throws, not the 2014 HP-pool; the 2014 Small-creature-heavy-weapon rule is gone (2024 STR/DEX-13).
- **Spell mechanics L0-4 fully wired (Area 2).** The L4 summon / aura block (Aura of Life via the new `recurringHeal`, Faithful Hound via the non-concentration `tickAura`, Guardian of Faith via the aura damage-budget primitive, Giant Insect as the 2024 summon), Dominate / Compulsion via the shared `charmed`, Confusion's behavior table, and Chromatic Orb's leap.
- **Targeting / AoE seam (Area 3).** Corner-aware line of sight / line of effect (901); per-target cover on spell saves (885); `legalTargets` honors Total Cover (899); planners validate the consumer combat enums (900).
- **Monster runtime (Area 7).** The multiattack sweep, the on-hit rider families (grapple / prone / save-condition / recurring-damage), save-actions + recharge, legendary resistance / actions, the drain-undead lineage (max-HP / ability-score drain), ooze split, and monster Parry (`GrantParry`).
- **Base equipment (Area 6) + exploration (Area 8).** Ammunition consumption + recovery, suffocation, the Burning hazard, the climb/swim/crawl surcharge, rolled (not averaged) falling damage + Prone-on-landing, size-scaled carry capacity + jump distances, and the opt-in 16-hour Long Rest cadence.
- **Build & leveling validation (Area 5).** Multiclass-entry proficiencies, ASI distinctness, the L4 feat-menu ability-prereq + Fighting Style feats.
- **New effect primitives:** `WeaponDamageDelta` (875), `GrantParry` (831), `GrantTreeStride` (820), plus the `recurringHeal` / `recurringDamage` / aura-damage-budget / ability-score-drain condition primitives.
- **Docs:** the consumer hand-off doc (902) and its reconciliation after dnd-web wired the light / cover / AoE `aim` seams (906); CHANGELOG evictions (881, 889, 896, 903) keeping the live file under the single-Read ceiling.

## Compatibility

- **Breaking:** none. All public-surface changes are additive new exports or new optional fields that default to the prior behavior.
- **RNG / determinism:** golden / fuzz / property / replay-equivalence tiers green. Behavior changes that shifted RNG streams (rolled falling damage, etc.) regenerated their goldens in-slice; opt-in fields omitted → byte-identical.

## CHANGELOG hygiene

Promoted `## Unreleased` → `## 0.12.0-alpha.0 - 2026-07-09` with a fresh empty `## Unreleased`. The previous release (`0.11.0-alpha.0`) was already evicted to [released-versions-0.11.0-alpha.0.md](released-versions-0.11.0-alpha.0.md) (slice 812), so nothing to evict at release time; the promoted `0.12.0-alpha.0` narrative stays inline (55 KB, under the 60 KB ceiling) until doc-size pressure evicts it in a later slice. The "Earlier slices in this release" pointer block (778-866) re-labelled from "un-tagged cycle" to "ship as part of 0.12.0-alpha.0".

## Gate

`npx tsc --noEmit` clean; doc audits (size / links / counts) + `release:doc-counts:check` + `release:doc-review` green; full `npx vitest run` green (693 files, 5216 passed, 165 skipped). Remaining manual steps (per the commit-don't-push rule in CLAUDE.md): open PR `dev` → `main`, merge once CI is green, then `git tag v0.12.0-alpha.0` on the merged `main` and push the tag.
