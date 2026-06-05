# Slice 645 — tests: CI-guarded "L3 SRD complete" floor audit

**Type:** Tests (audit-only, no engine or content change).

Companion to slice 619's L1 floor and slice 633's L2 floor. Defines the exit criteria for a future "L3 SRD complete" release (0.4.0-alpha.0) by pinning the L3 surface area as a 32-test audit: 22 invariants green today, 3 planner xfails + 7 content-stub pins marking the L3 punch list.

L3 is structurally bigger than L2: every class picks a subclass at L3 (all 12 classes ship `subclassLevel: 3`), and the pack ships one canonical L3 subclass per class. So the floor pins **both** per-class L3 features AND per-subclass L3 features.

## Sections

| Section | Tests | What it pins |
|---|---|---|
| 1: per-class L3 features | 4 | Barbarian / Monk / Paladin / Rogue have named class-only L3 features in SRD. Others (Bard, Cleric, Druid, Fighter, Ranger, Sorcerer, Warlock, Wizard) have only subclass selection at L3; their class L3 row is `effects:[]` by design and not pinned. |
| 2: per-subclass L3 features | 13 | One canonical subclass per class (12 total) with 1-4 L3 features each in `levelGrants['3']`. Subclass content uses `levelGrants`, not `levelTable.features` — schema deviation predates this audit. |
| 3: planner presence | 8 | 5 wired (Frenzy, Cutting Words, Preserve Life, Land's Aid, Sacred Weapon) + 3 xfail (Steady Aim, Fast Hands, Deflect Attacks). |
| 4: empty-content stubs | 7 | L3 features whose pack entry is `effects:[]` today. Pin the stub list so a future content slice converts each row from "effects:[] expected" to "effects:>0 expected" deliberately. |

## L3 punch list (xfails + stubs)

**Planner xfails (3):**
- `rogue / steady-aim` → `planSteadyAim` (BA self-advantage + speed=0 self-debuff until end of turn).
- `thief / fast-hands` → `planFastHands` (BA thieves' tools / sleight of hand / disarm-trap / use object).
- `monk / deflect-attacks` → `planDeflectAttacks` (reaction: reduce weapon damage by 1d10 + DEX + monk level; optional Focus-Point counter or weapon throwback).

**Empty content stubs (7):**
- `barbarian / primal-knowledge` — needs OfferChoice over rogue skill subset.
- `rogue / steady-aim` — paired with planSteadyAim xfail.
- `monk / deflect-attacks` — paired with planDeflectAttacks xfail.
- `circle-of-the-land / circle-of-the-land-cantrip` — needs OfferChoice over druid cantrips.
- `circle-of-the-land / circle-of-the-land-spells` — needs OfferChoice over land type + per-land GrantSpell list.
- `hunter / hunters-lore` — may be content-only (narrative ability).
- `thief / fast-hands` — paired with planFastHands xfail.

When all xfails + stubs flip, the L3 floor goes fully green and `0.4.0-alpha.0` ("L3 SRD complete") is unblocked.

## What this audit deliberately does NOT cover

Mirror of L2 cycle's stagger — L3 hardening (resource scaffolding, fuzz matrix extension, subclass spell-list scaffolding) comes as follow-up slices once the punch list closes:

- L3 resource scaffolding (Paladin Channel Divinity comes online here; Sorcerer Sorcery Points scale to 3; Barbarian Rage uses scale to 3; Monk Focus Points scale to 3).
- Subclass spell-list `GrantSpell` scaffolding (Life Domain Spells, Devotion Spells, Fiend Spells, Draconic Spells, Circle of the Land Spells — Section 2 pins their presence but not the granted-spell content).
- Subclass-selection `ChoiceRequired` cascade at L3 (every class with `subclassLevel: 3` should emit it on level-up; this needs careful design and probably its own slice).
- L3 spell wiring counts (already guarded by the slice-641 per-level floor — L3 floor = 27 wired).
- L3 fuzz floor (mirrors slice 643/644's place in the L2 cycle).

## Files

- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)** (new): 32-test audit, 4 sections.

## Tests

- `npx vitest run tests/audit/srd-l3-complete.test.ts`: 32/32 pass (22 plain + 3 xfail-as-pass + 7 stub pins).
- Full suite: 509 files / 3558 passing + 173 skipped (was 508 / 3526; +1 file, +32 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: each section's intent is in its describe label. Per-pair test titles include class + subclass id so a regression names the exact owner. The "empty-content stubs" section title (`still effects:[] (${reason})`) makes the stub state explicit — when a content slice wires real effects, the assertion fires loudly with a directive to flip the row to a wired check.
- **DRY**: each section drives from one data table. Adding a 13th class (Artificer) is one entry per relevant table; adding a second canonical subclass per class is one entry in `REQUIRED_L3_SUBCLASS_FEATURES`. Same shape as the L1 and L2 floors.
- **SRP**: file's one job is to define L3-complete. Defers wiring depth + RAW-correctness to per-feature unit tests, defers spell wiring to the existing per-level floor, defers fuzz to a future L3 fuzz matrix.
- **Magic numbers / strings**: canonical ids are content-stable promises (matching L1 + L2 floor convention). The 32-test count is the sum of the four sections, not a magic number.
- **Pattern-check**: searched for other "stub-list pin" audits — none exist; this is the first. The pattern is reusable for any future tier with known content stubs (L4 / L5+ when those cycles begin). Sibling floor audits (L1, L2) don't pin stubs explicitly because their stub surfaces were already cleared.

## Open follow-ups

L3-complete punch list:

- **646**: `planSteadyAim` (rogue L3 class feature; content + planner).
- **647**: `planFastHands` (thief subclass L3 feature; content + planner).
- **648**: `planDeflectAttacks` (monk L3 class feature; content + planner — biggest of the three, introduces a damage-reduction reaction primitive).
- **649**: empty-content sweep for the 4 non-planner stubs (primal-knowledge OfferChoice, circle-of-the-land-cantrip OfferChoice, circle-of-the-land-spells OfferChoice + GrantSpell, hunters-lore decision: wire or document as narrative-only).
- **650+**: L3 hardening — resource scaffolding pin, subclass spell-list pin, subclass-selection cascade, L3 fuzz matrix extension.

When the punch list closes, tag `0.4.0-alpha.0` ("L3 SRD complete").
