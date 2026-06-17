# Slice 897 — Fighting Style feats at the L4+ feat menu (`l4-menu-no-fighting-style-feats`) — Area 5 fully closed

**Type:** Engine (level-up planner option-injection). Closes the L7 audit Area-5 quirk `l4-menu-no-fighting-style-feats` — arm 2 of the `l4-feat-menu-eligibility` split (slice 809 did arm 1, the ability prereq). **Area 5 (Build & leveling validation) is now fully closed.**

## RAW

The four Fighting Style feats (Archery, Defense, Great Weapon Fighting, Two-Weapon Fighting) each list **"the Fighting Style feature"** as their prerequisite. A class that has that feature — Fighter (L1), Paladin / Ranger (L2) — can therefore take one in place of an Ability Score Improvement. The constraint: *"You can't take the same Fighting Style twice, even if you get to choose again."*

## The fix (all in `src/engine/plan/level-up.ts`)

The L4+ improvement is modeled as an `OfferChoice` whose options grant a feat. Slice 809 made `planLevelUp` *filter* those options by ability prereq; this slice *injects* the Fighting Style feats when warranted. Three small helpers:

- **`hasFightingStyleFeature(character, content)`** — walks each enrollment's level table up to its current level and looks for a class FEATURE whose id starts with `fighting-style-` (the class feature is `fighting-style-{class}`; the Fighting Style *feats* live in `content.feats`, never the level table, so the prefix match only catches the feature).
- **`ownedFightingStyles(character, state)`** — the styles already owned, so none is offered twice: the resolved option ids of any `fighting-style-*` feature choice in `pendingChoices` (the feature-choice option id is the bare `{style}`) **plus** the `{style}` slice of any `fighting-style-*` id in `featsTaken`.
- **`eligibleFightingStyleFeatOptions(character, content, state)`** — every `category: 'fighting-style'` feat in `content.feats` not already owned, as `GrantFeat` options, sorted by feat id (`content.feats` iteration order isn't pack-stable, so the sort keeps the menu deterministic).

Injection point: an OfferChoice is treated as a **feat menu** when ≥1 of its options grants a feat (`o.effects.some(e => e.kind === 'GrantFeat')`). When it is, and the character has the Fighting Style feature, the eligible Fighting Style feat options are appended after the existing (already prereq-filtered) options. With no Fighting Style feature, or a non-feat-menu OfferChoice, the option list is byte-unchanged.

## Pattern-check

The only callers of the feat-menu option list are the L4+ `ability-score-improvement-N` choices; the injection is gated on `isFeatMenu` (a GrantFeat option present) so it can't leak into non-feat OfferChoices (e.g. a subclass or skill pick). De-dup reads from both fact sources a Fighting Style can be recorded in — the class-feature choice (`pendingChoices`) and a previously-taken feat (`featsTaken`) — not just one. Granting a Fighting Style feat from the menu reuses the same `GrantFeat` resolution path Grappler (slice 808) already exercises; no new resolution code.

## Tests

New `tests/unit/engine/slice-897-fighting-style-feat-menu.test.ts` (4 tests): a Fighter (has the feature) is offered all four Fighting Style feats + ASI + Grappler; a Wizard (no feature) is offered none; a style already taken as a feat (`featsTaken`) is de-duped; a style chosen via the class feature (a resolved `fighting-style-fighter` choice) is de-duped. The slice-707 end-to-end ASI test's pinned Fighter L4 menu list was extended to include the four Fighting Style feats (the new correct behavior); the slice-809 arm-1 test's header comment now points arm 2 at this slice.

## Counts

No count change — the Fighting Style feats already ship in the starter pack (granted by the class feature). This slice only makes them *reachable from the feat menu*; no new feat / condition / effect / spell.

## Audit

- Struck `l4-menu-no-fighting-style-feats`; Rollup: **Area 5** `1 → 0` open / `10 → 11` closed → ✅ **fully closed**; **Total** `22 → 21` open / `95 → 96` closed / `0/7/15 → 0/7/14`. Header now reads "Areas 1, 2, 4, 5, 6, and 7 are fully closed."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (668 files, 4949 passed / 165 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
