# Slice 726 — release: bump to 0.8.0-alpha.0

**Type:** Release. Promotes the post-0.7.0 cohort (slices 712-725) to a tagged release. No engine/content change beyond the version bump.

## Version

- `package.json` + `package-lock.json`: `0.7.0-alpha.0` → `0.8.0-alpha.0` (minor pre-1.0 bump per [VERSIONING.md](../../VERSIONING.md)).
- `SCHEMA_VERSION`: stays **1**. The cohort's two new events (`SpellSlotsRegained`, `PreparedSpellsChanged`) and new optional event fields (`ShortRestEnded.resourceDeltas`, `RecoverResource.limitedByResourceId`) are additive — no existing persisted shape changed, so a consumer on 0.8.0 replays a 0.7.0 log unchanged.

## What ships

**L5 SRD complete** (slices 718-725). The marquee L5 mechanics (Extra Attack, 3rd/2nd-level slots, Uncanny Dodge, Stunning Strike, Sneak Attack 3d6) were already wired; the cycle closed the real gaps:

- 718: `RecoverResource` wired on a Short Rest → Bard Font of Inspiration + Sorcerer Sorcerous Restoration (gated, floor(level/2)).
- 719: Warlock Eldritch Invocation count labels corrected to SRD 5.2.1.
- 720: Cleric Sear Undead (Turn Undead radiant rider).
- 721: Druid Wild Resurgence (slot ↔ Wild Shape; new `SpellSlotsRegained` event).
- 722: Paladin Faithful Steed (Find Steed always prepared + free cast).
- 723: Fighter Tactical Shift (half-Speed no-provoke on Second Wind).
- 724: Wizard Memorize Spell (prepared-spell swap; new `PreparedSpellsChanged` event).
- 725: `srd-l5-complete` floor audit (24/24) + fuzz matrix extended to L1-L5 (60 cells × 30 seeds = 1,800 battles/run).

**Interactive-play affordances + Free Duel** (slices 712-717):

- 713/716: enriched `engine.query.castableSpells` (castingTime / rangeFeet / discriminated `target` / `resolves` / `concentration` / multi-target `maxTargets`) + `engine.query.legalSpellTargets`.
- 714/715: `engine.query.bonusActions` + the generic `engine.plan.useOption` executor for the duel's Bonus Actions menu.
- 717: `runBattle({ playerClass })` Free-Duel class pin on an isolated RNG cursor (opponent + map byte-identical with or without it).
- 712: docs backlog (L4-cycle follow-ups queued in gaps-deferred-primitives).

## Compatibility

**Breaking:** none. **Additive surface:** two new events, two new optional event fields, new `engine.query.*` / `engine.plan.*` methods (`bonusActions`, `useOption`, `legalSpellTargets`, `wildResurgence`, `memorizeSpell`), and new exported types. **RNG stream:** sub-L5 and default paths byte-identical (new behavior gated on L5 / the relevant arm; golden + replay-equivalence + rng-capture unchanged); the L5 fuzz tier is new, so no prior per-seed transcript is pinned across the boundary.

## CHANGELOG hygiene

Promoted `## Unreleased` → `## 0.8.0-alpha.0 - 2026-06-07`; evicted the 0.7.0-alpha.0 narrative to [released-versions-0.7.0-alpha.0.md](released-versions-0.7.0-alpha.0.md) (re-rooted links) and added it to the "Older releases" pointer, keeping the live CHANGELOG to the active cycle + newest release.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. `release:doc-review`: figures confirmed (the content-catalog percentages are unchanged by this cohort — no new spells/monsters/items).
