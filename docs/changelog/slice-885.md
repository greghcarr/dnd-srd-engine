# Slice 885 — per-target Cover on spell saving throws (`aoe-save-ignores-cover`)

**Type:** Engine (cast-spell save block) + schema flag + content. Closes the L7 audit Area-3 DIVERGENCE `aoe-save-ignores-cover`.

## RAW

Cover: *"A target with Half Cover has a +2 bonus to AC and Dexterity saving throws. A target with Three-Quarters Cover has a +5 bonus to AC and Dexterity saving throws."*

## What was wrong

The hand-rolled single-target save sites (`rollSaveAgainstDC`, slice 550) honor cover, but the **cast-spell AoE/save block** — the path every spell save runs through (Fireball, Burning Hands, …) — had no cover channel. `CastSpellIntent` had no `cover` field at all, so a creature behind Half Cover got **no +2 Dex save vs Fireball**. An asymmetry an expert would notice immediately.

## The fix

- New consumer-supplied **`CastSpellIntent.coverByTargetId?: Record<string, CoverKind>`** — per-target (an AoE's targets each have their own cover), since the engine doesn't model positions (the seam like `lightLevel` / `aim` / `unwillingTargetIds`).
- The main save block applies `coverDexSaveBonus(cover)` (+2 Half / +5 Three-Quarters) to the save **bonus** for **Dex** saves only, with a `cover (half)` / `cover (three-quarters)` breakdown entry — the exact mirror of the `rollSaveAgainstDC` cover path. Threaded into the buff `unwillingSave` site too (inert for its current CON saves, future-proof for a Dex one).
- Targets absent from the map (or an omitted map) get no cover — prior behavior, byte-unchanged.

### The Sacred Flame exception

Sacred Flame is the one DEX-save spell whose RAW says *"The target gains no benefit from Half Cover or Three-Quarters Cover for this save."* Without handling it, adding cover would introduce a **new** divergence for that cantrip. So a new save-mechanic flag **`saveIgnoresCover`** (set on `sacred-flame`) skips the cover bonus when set — the consumer can pass cover uniformly and the engine drops it for Sacred Flame. A corpus grep confirms Sacred Flame is the only spell with the no-cover clause (pattern-check).

## Tests

New `tests/unit/engine/slice-885-aoe-save-cover.test.ts` (4 tests, same-seed isolation so only the cover bonus differs): Half cover adds +2 to a Fireball Dex save (+ breakdown entry); Three-Quarters adds +5; cover is per-target (only the covered creature in a multi-target blast gets it; the exposed one is unchanged); Sacred Flame grants no cover benefit (the `saveIgnoresCover` exception — no bonus, no breakdown entry).

## Counts

No count change — `saveIgnoresCover` is a new field on an existing save-mechanic schema (not a new mechanic kind), and `coverByTargetId` is a plain `CastSpellIntent` input. Sacred Flame stays a wired spell. No new condition / effect kind / wired spell; the coverage snapshot is unchanged.

## Docs

- Struck `aoe-save-ignores-cover`; Rollup: **Area 3** `13 → 12` open / `1 → 2` closed / `0/6/7 → 0/5/7`; **Total** `33 → 32` open / `84 → 85` closed / `0/13/20 → 0/12/20`.
- Registered the `coverByTargetId` fact slot in the three consumer-facing registries: [engine-scope.md](../engine-scope.md), [starter-pack-gaps.md](../starter-pack-gaps.md) (table row + call-site + default-behavior bullets), and [api-overview.md](../api-overview.md).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (659 files, 4908 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
