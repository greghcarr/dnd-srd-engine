# Slice 736 — release: bump to 0.9.0-alpha.0

**Type:** Release. Promotes the post-0.8.0 cohort (slices 727-735) to a tagged release. No engine/content change beyond the version bump.

## Version

- `package.json` + `package-lock.json`: `0.8.0-alpha.0` → `0.9.0-alpha.0` (minor pre-1.0 bump per [VERSIONING.md](../../VERSIONING.md) — new public exports + a RAW-correctness behavior change).
- `SCHEMA_VERSION`: stays **1**. The cohort adds no new event types (every new mechanic reuses existing events / conditions / the `SpellSlotsRegained` event from slice 721), so a consumer on 0.9.0 replays a 0.8.0 log unchanged.

## What ships

**L6 SRD complete** (slices 727-735). Every L6 row — base class and subclass — is now wired:

- 727: Fighter L6 Ability Score Improvement (the extra ASI at 6, reusing the L4 OfferChoice cascade).
- 728: Barbarian Berserker Mindless Rage (new `mindless-rage-active` Charmed/Frightened-immunity condition; ends those on entering Rage).
- 729: Druid Circle of the Land Natural Recovery (`planNaturalRecovery` — short-rest slot recovery, ≤ ceil(druid/2), once per long rest).
- 730: Warlock Fiend Dark One's Own Luck (`planDarkOnesOwnLuck` → `{ events, d10 }`, the Hero Points shape).
- 731: Cleric Life Domain Blessed Healer (`GrantBlessedHealer`: self-heal 2 + slot level when a slot heal lands on an ally).
- 732: Wizard Evoker Sculpt Spells (`GrantSculptSpells` + `sculptedTargetIds`: exclude up to 1 + slot level creatures from an Evocation save spell).
- 733: Bard College of Lore Magical Discoveries (cross-list `OfferChoice` granting Cleric/Druid/Wizard spells always-prepared).
- 734: `srd-l6-complete` floor audit (28/28) + fuzz matrix extended to L1-L6 (72 cells × 30 seeds = 2,160 battles/run).
- 735: Monk Empowered Strikes re-wired to SRD 5.2.1 (the Force-damage choice via `GrantUnarmedForceOption`), correcting a pre-existing 2014 "magical unarmed" drift surfaced by the L6 audit.

The already-present base-class L6 rows (Rogue 2nd Expertise, Paladin Aura of Protection, Barbarian/Cleric/Druid resource bumps, Ranger Roving) are pinned by the floor audit alongside the new ones.

## Compatibility

**Breaking:** none to the type surface. **Behavior change:** Monk L6 Empowered Strikes (slice 735) — unarmed strikes are no longer magical by default; the monk may instead opt a strike into Force damage. RAW-correctness fix; the s207 golden was rewritten. **Additive surface:** three new effect kinds (`GrantBlessedHealer`, `GrantSculptSpells`, `GrantUnarmedForceOption`), one new condition (`mindless-rage-active`), two new `engine.plan.*` methods (`naturalRecovery`, `darkOnesOwnLuck`), new optional intent fields (`CastSpellIntent.sculptedTargetIds`; `unarmedStrikeAsForce` on the attack / Flurry / off-hand intents). **RNG stream:** the L6 features are gated and the Force option is opt-in, so default + sub-L6 paths are byte-identical (replay-equivalence + rng-capture unchanged); goldens unchanged except the deliberately-rewritten s207; the L6 fuzz tier is new.

## CHANGELOG hygiene

Promoted `## Unreleased` → `## 0.9.0-alpha.0 - 2026-06-07`; evicted the 0.8.0-alpha.0 narrative to [released-versions-0.8.0-alpha.0.md](released-versions-0.8.0-alpha.0.md) (re-rooted links) and added it to the "Older releases" pointer, keeping the live CHANGELOG to the active cycle + the newest release.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green (570 files, 4417 passed). `release:doc-counts:check` + `release:doc-review`: figures confirmed (no new spells/monsters/items; the EFFECT_KINDS / conditions counts were bumped in their originating slices).
