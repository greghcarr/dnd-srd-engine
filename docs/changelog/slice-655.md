# Slice 655 — tests: L3 floor Section 7 — subclass L3 spell-list RAW pin

**Type:** Tests (audit-only). Third slice of the L3 RAW-completeness push.

Pins the exact L3 spell list each "domain-spells"-style subclass feature ships, verified inline against SRD 5.2.1. Slice 645's Section 2 confirmed the feature ids exist; Section 7 now confirms the GrantSpell contents match RAW.

## What's pinned

| Subclass | Feature | RAW L3 spells (SRD 5.2.1) |
|---|---|---|
| Life Domain (Cleric) | `life-domain-spells` | Aid, Bless, Cure Wounds, Lesser Restoration |
| Oath of Devotion (Paladin) | `devotion-spells` | Protection from Evil and Good, Shield of Faith |
| Fiend Patron (Warlock) | `fiend-spells` | Burning Hands, Command, Scorching Ray, Suggestion |
| Draconic Sorcery (Sorcerer) | `draconic-spells` | Alter Self, Chromatic Orb, Command, Dragon's Breath |

All 4 pack lists match SRD 5.2.1 exactly. The pin catches future drift in three ways:
1. **Spell list drift**: the array of granted spell ids must match RAW.
2. **Preparation arm drift**: every GrantSpell must use `preparation: 'always-prepared'` (RAW: "you always have these spells prepared"). A regression to `'prepared'` or `'known'` would silently change the slot economy.
3. **Phantom-spell drift**: every granted spell id must exist in the pack's `spells` catalog (catches `spellId: 'foo'` typos that silently grant nothing).

The 5th L3 subclass spell-list source — Druid Circle of the Land — ships an OfferChoice over 4 land types (not a fixed list). It's pinned by slice 653's Section 6 OfferChoice cascade tests; not re-pinned here.

## Files

- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**:
  - New Section 7 with 4 tests, one per subclass spell-list feature. Table-driven; adding a 5th fixed-list subclass is one row.

## Tests

- `npx vitest run tests/audit/srd-l3-complete.test.ts`: 40/40 pass (was 36; +4 Section 7 tests).
- Full suite: 513 files / 3593 passing + 173 skipped (was 513 / 3589; +4 tests).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

None. Pure audit addition.

## Audit (Uncle Bob)

- **Names**: `L3_SUBCLASS_SPELL_LISTS` rows carry the full spec (subclassId + featureId + expectedSpellIds). Test title format `${subclassId} / ${featureId} ships the RAW L3 spell list` makes the failing scope immediately scannable.
- **DRY**: shared `findL3SubclassFeature` helper from Section 2 is reused. Adding a 5th subclass is one table row, no new test code.
- **SRP**: Section 7 has one job (pin the L3 spell-list contents per subclass). Doesn't try to verify the spells' own RAW correctness (that's per-spell unit testing's domain) or that the consumer can cast them.
- **Magic numbers / strings**: every spell id is a pack-canonical id (verified against `PACK.spells` by the audit itself — defensive against a typo here too).
- **Pattern-check**: the 5 subclass spell-list features fall into two shapes — fixed-list (4 subclasses, pinned by Section 7) and OfferChoice-driven (Circle of the Land, pinned by Section 6). When L5 lands, each subclass's L5 spell-list expansion gets a similar pin in the L5 floor.

## Open follow-ups

L3 RAW-completeness punch list (slice 655 of 8):

- ~~653~~: L3 OfferChoice emission tests. Landed.
- ~~654~~: Subclass-selection cascade. Landed.
- ~~655 (this slice)~~: Subclass spell-list scaffolding pin. Landed.
- **656**: L3 multiclass build audit.
- **657**: `partialShortFullLong` recharge primitive.
- **658**: Deflect Attacks counter arm.
- **659**: Primal Knowledge ability-substitution.
- **660**: Circle of the Land long-rest swap.
