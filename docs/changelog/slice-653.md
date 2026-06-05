# Slice 653 — tests: L3 floor Section 6 — OfferChoice cascade verification

**Type:** Tests (audit-only). First slice of the L3 RAW-completeness push (the post-surface-complete hardening cycle).

After the user's "we need to achieve L3 raw-completeness" directive, I scoped the remaining work into 8 slices. Slice 653 is the cheapest — verify the L3 OfferChoices the slice-649 + slice-652 content edits wired actually fire via `engine.plan.offerCharacterChoices` for a fresh L3 character.

Mirror of the L2 floor's Section 4 Wizard Scholar test (slice 633). Three L3 OfferChoices to verify:

| Class / subclass | OfferChoice key | Expected options |
|---|---|---|
| Barbarian L3 | `barbarian-primal-knowledge` | 6 skill ids (animal-handling, athletics, intimidation, nature, perception, survival) |
| Druid Circle of the Land L3 | `circle-of-the-land-cantrip` | 11 druid cantrips |
| Druid Circle of the Land L3 | `circle-of-the-land-type` | 4 SRD lands (arid, polar, temperate, tropical) |

All 3 pass on first run — the cascade is sound. The slice-618 `offerCharacterChoices` planner walks every effect on the character (including class features at each enrolled level + subclass `levelGrants` at the enrolled level + subclass), filters by `when: 'onAcquire'`, dedupes by `promptKey`, and emits a `ChoiceRequired` per unresolved choice. The L3 OfferChoices route through unchanged.

## What this confirms

| Surface | Confirmed |
|---|---|
| Class-level L3 OfferChoice (Primal Knowledge) | ✓ |
| Subclass `levelGrants['3']` OfferChoice (Circle Cantrip, Circle Spells) | ✓ |
| Multiple OfferChoices on the same character firing in one `offerCharacterChoices` call | ✓ (the Druid test exercises both Circle choices) |

## Files

- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**:
  - New imports for the behavioral path (`createEngine`, `seededRNG`, `commit`, `CharacterSchema`, etc.).
  - New Section 6 with 3 tests, one per L3 OfferChoice.

## Tests

- `npx vitest run tests/audit/srd-l3-complete.test.ts`: 36/36 pass (was 33; +3 Section 6 tests).
- Full suite: 512 files / 3585 passing + 173 skipped (was 512 / 3582; +3 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: each test title names the class + the OfferChoice that should fire. The local `findChoice(events, promptKey)` helper makes the lookup pattern reusable for future emission tests at L4+.
- **DRY**: shared `buildL3Character` helper inside Section 6; mirrors the L2 floor's `buildL2Character` helper from slice 633. Could be lifted to a per-tier shared helper later, but with 2 floors it's premature.
- **SRP**: Section 6 has one job (verify OfferChoice cascades fire); doesn't try to verify the resolved choice's effect application (that's per-feature unit testing's domain).
- **Magic numbers / strings**: option ids and promptKeys come from the pack content; the expected-options arrays are alphabetically sorted to match the assertion's `.sort()` output.
- **Pattern-check**: the slice-633 L2 floor's Section 4 had one OfferChoice cascade test (Wizard Scholar). The L1 floor (slice 619) also has one (Fighter Fighting Style). Same pattern; when L4 lands, its floor should ship a similar section.

## Open follow-ups

L3 RAW-completeness punch list (slice 653 of 8):

- ~~653 (this slice)~~: L3 OfferChoice emission tests. Landed.
- **654**: Subclass-selection cascade — verify levelUp from L2 → L3 emits a subclass `ChoiceRequired`; wire it through `offerCharacterChoices` (or a sibling planner) if not.
- **655**: Subclass spell-list scaffolding pin (Life Domain / Devotion / Fiend / Draconic / Circle of the Land Spells verify each ships expected `GrantSpell` shape).
- **656**: L3 multiclass build audit — extend slice 642's L1+L1 pairs to L1+L2 / L2+L1 / total-L3 combinations.
- **657**: `partialShortFullLong` recharge primitive — closes Channel Divinity (Cleric + Paladin) and Wild Shape (Druid) RAW deviations.
- **658**: Deflect Attacks counter arm (Focus Point spend + DEX save + 2× MA die counter damage).
- **659**: Primal Knowledge ability-substitution (STR for Acrobatics / Intimidation / Perception / Stealth / Survival while Rage active).
- **660**: Circle of the Land long-rest swap (`onLongRest` OfferChoice cascade primitive).
- **Then**: tag `v0.3.0-alpha.0` (L2 complete) + `v0.4.0-alpha.0` (L3 RAW-complete).
