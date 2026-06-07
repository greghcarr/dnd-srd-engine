# Slice 710 — fix: derived character + AC now reflect effective ability scores (not base)

**Type:** Engine bug fix (derive layer). Found by the L4 SRD audit. No event schema change; no RNG-stream change.

## The bug

`computeDerivedCharacter` computed `abilityModifiers` from **base** `character.abilityScores` (`abilityModifier(base)`), and `computeArmorAC` used **base** DEX for the armored / plain-unarmored AC contribution. So `IncreaseAbilityScore` / `OverrideAbilityScore` / ability-score-floor effects — **ASI** (every L4+ character), Ioun Stones, Belt of Dwarvenkind, Amulet of Health, Barkskin-style floors — did **not** show in:

- `engine.derive.character.abilityModifiers` (the headline ability mods)
- `buildCharacterSheet` (it spreads `...derived`) and its **initiative** (derived from `abilityModifiers.DEX`)
- **AC** for light/medium armor + plain unarmored (the Unarmored Defense *override* path already used effective, so Barbarian/Monk were fine; everyone else's AC ignored DEX boosts)

Saves, ability checks, skills, attacks, and spell DCs were already correct (they call `effectiveAbilityScore`), so this was an internal inconsistency: a sheet showed STR mod **+3** next to a STR save computed at **+4** after a +2 ASI. Pre-existing since the slice-308 `IncreaseAbilityScore` primitive; **universal and obvious once L4 gave every character an ASI**, which is how the L4 audit surfaced it.

## The fix

- [src/derive/character-view.ts](../../src/derive/character-view.ts): `computeDerivedCharacter` now derives `abilityModifiers` from `effectiveAbilityScore(base, floor, increase)` (one shared effect-stack build, also reused for `hpMaxBonus`), and **exposes a new `abilityScores` field** (the effective scores) so a sheet can show "STR 18 (+4)" not just the mod. Initiative auto-corrects (it reads the now-effective `abilityModifiers.DEX`).
- [src/derive/ac.ts](../../src/derive/ac.ts): `computeArmorAC` takes the effect stack and computes the DEX contribution from `effectiveAbilityScore` (mirroring the override path's existing `modForAbility`).

## Pattern-check (per CONTRIBUTING)

Swept every `abilityModifier(...base...)` site in `src/derive` / `src/query`. Fixed the two visible/combat-critical ones above. Three remaining low-impact edges are **tracked, not fixed here** (each needs the effect stack threaded into a function that lacks it, for a near-zero real-world scenario):

- [src/derive/mirror-image.ts:36](../../src/derive/mirror-image.ts) — Mirror Image *duplicate* AC uses base DEX (only matters for a DEX-boosted caster with Mirror Image active).
- [src/derive/attack.ts:83](../../src/derive/attack.ts) — `chooseAttackAbility` picks DEX-vs-STR for finesse/monk by comparing **base** mods (the attack *bonus* itself is already effective; only the rare base≤ / effective> flip is wrong).
- [src/derive/fatal-damage-intercept.ts:231](../../src/derive/fatal-damage-intercept.ts) — a monster-only per-trait save (Undead Fortitude) uses the raw mod **by documented design** (it deliberately skips statblock save bonuses); monsters effectively never carry ability-increase effects.

## Files

- [src/derive/character-view.ts](../../src/derive/character-view.ts), [src/derive/ac.ts](../../src/derive/ac.ts).
- [tests/unit/derive/effective-ability-scores-in-view.test.ts](../../tests/unit/derive/effective-ability-scores-in-view.test.ts) (new): 5 tests — baseline (base==effective), Ioun Stone of Strength raises derived score + mod (and the save now agrees with the mod), cap-at-20, AC reflects a DEX boost (plain unarmored + light armor).
- [docs/api-overview.md](../../docs/api-overview.md): `DerivedCharacter` now documents effective `abilityScores` + `abilityModifiers`.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green (contract + coverage snapshots unaffected; the new field is additive, existing tests use no ability-boost effects so base==effective).
- No event schema / RNG-stream change.

## Audit (Uncle Bob)

- **Root-cause fix**: the derived view now uses the same `effectiveAbilityScore` the per-roll derivations already use — one source of truth for "what's this creature's STR right now."
- **DRY**: `computeArmorAC` mirrors the override path's `modForAbility`; `computeDerivedCharacter` builds the effect stack once and reuses it.
- **Pattern-check**: swept all base-score modifier sites; fixed the impactful ones, documented the three minor edges with file:line + why they're deferred.
- **No defensive noise**: the fix is a substitution (base → effective), not added guards.

## Open follow-ups

- The three tracked Tier-2 sites above (mirror-image duplicate AC, finesse ability choice, fatal-save) — fix when an effect stack is threaded through those paths.
- Per-character feat-eligibility filter for the L4 ASI menu (Grappler's prereq) — carried from slice 707.
- `0.7.0-alpha.0` release tag remains held (user's call); this fix joins the Unreleased cohort.
