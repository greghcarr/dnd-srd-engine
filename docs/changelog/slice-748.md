# Slice 748 — release: bump to 0.10.0-alpha.0

**Type:** Release. Promotes the post-0.9.0 cohort (slices 737-747) to a tagged release. No engine/content change beyond the version bump.

## Version

- `package.json` + `package-lock.json`: `0.9.0-alpha.0` → `0.10.0-alpha.0` (minor pre-1.0 bump per [VERSIONING.md](../../VERSIONING.md) — new public exports + a RAW-correctness behavior change).
- `SCHEMA_VERSION`: stays **1**. The cohort adds no new event types — Countercharm reuses `SaveRolled`, the L7 features reuse existing events / conditions / `Custom` markers — so a consumer on 0.10.0 replays a 0.9.0 log unchanged.

## What ships

**L7 SRD complete** (slices 738-742). Every L7 row — base class and subclass — is now wired:

- 738: Rogue Reliable Talent (new `GrantReliableTalent` marker — on an ability check that uses one of the rogue's proficiencies, a d20 of 9-or-lower is treated as 10; the half-proficiency floor doesn't count). `EFFECT_KINDS` 67 → 68.
- 739: Druid Elemental Fury (`OfferChoice` between Potent Spellcasting and Primal Strike) + the Cleric Blessed Strikes Potent Spellcasting closure — both ride a new `event.spellLevel == 0` (cantrip) fact, no new effect kind.
- 740: Bard Countercharm (`engine.plan.countercharm` → `{ events, d20, total, success }` — a Reaction rerolling a failed Charmed/Frightened save with Advantage; range / self-or-ally / Reaction economy / condition-removal stay consumer-managed). `Custom { handlerId: 'countercharm' }`.
- 741: Barbarian Instinctive Pounce (`Custom { handlerId: 'instinctive-pounce' }` — the half-Speed move on entering Rage is positional, so consumer-applied; deliberately not `Disengaged`, keeping `planRage` byte-identical).
- 742: `srd-l7-complete` floor audit (22 tests) + fuzz matrix extended to L1-L7 (84 cells × 30 seeds = 2,520 battles/run).

**Fuzz harness to L1-20** (slice 737): `FUZZ_MAX_LEVEL` 6 → 20 with a fail-loud auto-leveler (deterministic legal-choice resolver + dangling-choice / under-level guards), so `runBattle({ level })` reliably builds every `CLASS_POOLS` class and its opponent to any level 1-20 for the dnd-web picker instead of silently leaving a character at L1. L1-6 builds are byte-identical.

**Rage / active-state correctness** (slices 743-744): a Barbarian can no longer re-enter Rage while already raging (`planRage` throws; `engine.query.bonusActions` surfaces it disabled with reason `already-raging`), and a pattern hunt extended the same already-active guard to Innate Sorcery, Superior Defense, Sacred Weapon, Frenzy, Stonecunning (plus Dragon Wings for consistency). Each buff is taken at most once per battle, so the fuzz is byte-identical.

**Test workflow + perf** (slices 745-746): fast local lanes (`test:changed` / `test:fast`) and a local-fast / CI-full testing norm (745); a ~4.3× faster suite (746; the validated pack is cached + deep-frozen, and vitest runs with `isolate: false`, so the pack validates ~once per worker instead of once per file — ~611s → ~143s). **Docs freshness sweep** (slice 747) reconciled prose with the cohort.

## Compatibility

**Breaking:** none to the type surface. **Behavior change:** the active-state activators (Rage, Innate Sorcery, Superior Defense, Sacred Weapon, Frenzy, Stonecunning) now throw on re-activation while already active — a RAW-correctness fix; each is taken at most once per battle, so the fuzz / default paths are byte-identical. **Additive surface:** one new effect kind (`GrantReliableTalent`), one new `engine.plan.*` method (`countercharm`), two new `Custom` handler ids (`countercharm`, `instinctive-pounce`), a new `event.spellLevel` cast fact (inert for existing predicates), and the check-derivation's `hasReliableTalent` / `usesProficiency` fields. **RNG stream:** L7 features are gated, so default + sub-L7 paths are byte-identical (replay-equivalence + rng-capture unchanged); goldens unchanged; the L7 fuzz tier is new. The perf change is test-harness-only (no engine RNG impact). **Consumer note:** `loadStarterPack()` now returns a shared, deep-frozen instance — correct and faster for immutable content, but a consumer that mutated the pack in place would now throw (clone first).

## CHANGELOG hygiene

Promoted `## Unreleased` → `## 0.10.0-alpha.0 - 2026-06-08`; evicted the 0.9.0-alpha.0 narrative to [released-versions-0.9.0-alpha.0.md](released-versions-0.9.0-alpha.0.md) (re-rooted links) and added it to the "Older releases" pointer, keeping the live CHANGELOG to the active cycle + the newest release (and back under the 60 KB single-Read ceiling).

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. `release:doc-counts:check` + `release:doc-review`: figures confirmed (no new spells/monsters/items; the `EFFECT_KINDS` bump landed in its originating slice 738). `doc-size` + `doc-links` green post-eviction.
