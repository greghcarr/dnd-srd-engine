# Slice 652 — content: Druid Circle of the Land Spells (L3 tier)

**Type:** Content sweep. **Closes the last L3 content stub.**

The slice-645 L3 floor's Section 4 had one remaining still-unwired content stub: `circle-of-the-land / circle-of-the-land-spells`. This slice ships it.

Per **SRD 5.2.1** (the PHB 2024 condensed version), Circle of the Land Spells offers **4 land types** (arid / polar / temperate / tropical — not the 8 land types from 2014). At L3 each land grants 3 always-prepared spells:

| Land | L3 spells |
|---|---|
| Arid | Blur, Burning Hands, Fire Bolt |
| Polar | Fog Cloud, Hold Person, Ray of Frost |
| Temperate | Misty Step, Shocking Grasp, Sleep |
| Tropical | Acid Splash, Ray of Sickness, Web |

All 12 spells are already wired in the pack (verified pre-edit). The slice wires the OfferChoice over land types + per-land GrantSpell list at L3. The L5/L7/L9 tier expansions (one additional spell per land per tier) are out of scope for L3; those land at the appropriate higher tier.

## Scope decisions

- **Land count**: SRD 5.2.1 = 4 lands (Arid / Polar / Temperate / Tropical). 2014 PHB had 8 (Arctic / Coast / Desert / Forest / Grassland / Mountain / Swamp / Underdark). The audit's earlier reason comment referenced the old 8 lands; the actual wiring uses the SRD 5.2.1 4-land set.
- **`preparation: 'always-prepared'`**: matches RAW "you always have the spells listed ... prepared." Distinct from `'known'` (consumes a prepared slot) or `'at-will'` (no slot consumption).
- **RAW deviation (deferred)**: RAW says "Whenever you finish a Long Rest, choose one type of land." That's a per-long-rest land swap. The engine doesn't have an `onLongRest` OfferChoice cascade today; this slice uses `'onAcquire'` (the once-at-L3 simplification). A future engine slice could add the long-rest swap when player demand surfaces.

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: `subclasses['circle-of-the-land'].levelGrants['3']['circle-of-the-land-spells'].effects`: was `[]`; now ships one `OfferChoice` over 4 land options, each granting 3 `GrantSpell { preparation: 'always-prepared' }` entries.
- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**: removed `circle-of-the-land-spells` from the `EMPTY_STUBS` table. The "Still-unwired content" subsection now reads "(No still-unwired content stubs remain — slice 652 wired circle-of-the-land-spells. If a future cycle introduces a new L3 stub, add it here with its reason.)"
- **[../../tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)**: regenerated via `-u` (one-line addition: `circle-of-the-land L3 circle-of-the-land-spells`).

## Tests

- `npx vitest run tests/audit/srd-l3-complete.test.ts`: 33/33 pass (was 34; -1 from the removed stub entry).
- Full suite: 512 files / 3582 passing + 173 skipped (was 512 / 3583; -1 from the audit shrink, no new file).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Content additive.** New OfferChoice on the L3 Druid Circle of the Land subclass feature. Old characters built before this slice don't auto-acquire the choice; new characters built post-slice will be prompted.

**No engine change.**

## Audit (Uncle Bob)

- **Names**: option ids match the canonical land names from SRD 5.2.1 (`arid`, `polar`, `temperate`, `tropical`). Spell ids match the existing pack-canonical spell ids verified pre-edit.
- **DRY**: each option ships the same 3-`GrantSpell` shape; the only variation is which spells the land grants. Repetition is intentional (declarative JSON).
- **SRP**: one content row does one thing (offer a land choice + grant the appropriate L3 spells). The L5/L7/L9 expansions belong in those tier rows.
- **Magic numbers / strings**: every spell id is verified against the pack pre-edit (the 12-spell `node -e` lookup). Choice id (`circle-of-the-land-type`) names the choice unambiguously, consistent with the slice-649 `circle-of-the-land-cantrip` naming.
- **Pattern-check**: applied the slice-649 lesson — verified `preparation: 'always-prepared'` against the schema enum (`'always-prepared' | 'prepared' | 'known' | 'at-will' | 'oncePerLongRest' | 'oncePerShortRest'`). The earlier `'atWill'` (camelCase) bug from slice 649 would have shipped silently here too if I hadn't checked.

## Open follow-ups

**L3 punch list is now fully closed for content + planners.**

L3-complete claim covers:
1. Every per-class L3 feature id is present (slice 645).
2. Every per-subclass L3 feature id is present (slice 645).
3. All 3 L3 planner xfails wired (slices 646-648: planSteadyAim, planFastHands, planDeflectAttacks).
4. The 3 planner-wired-stays-effects-empty intentional stubs documented (slice 649).
5. Hunter's Lore classified as intentionally narrative (slice 649).
6. Primal Knowledge + Circle of the Land Cantrip wired with OfferChoice (slice 649).
7. **Circle of the Land Spells wired with OfferChoice + per-land GrantSpell (this slice).**
8. L3 resource scaffolding pinned (max + recharge per resource at L3) (slice 650).
9. L3 fuzz matrix exercises 720 battles per CI run across L1-L3 (slice 651).

**Next step (consumer-gated)**: tag `v0.3.0-alpha.0` (post the L2 cycle commits 633-644) AND/OR `v0.4.0-alpha.0` ("L3 SRD complete") after the L3 cycle (645-652). The release flow is documented in [VERSIONING.md](../../VERSIONING.md); per [CLAUDE.md](../../CLAUDE.md) push / PR / merge / tag is explicit-user-instruction-only.

**Deferred (post-release stretch hardening, not blockers)**:
- L3 multiclass build audit (extend slice 642's L1+L1 pairs to L1+L2 and L2+L1 = 132 ordered or 66 unordered pairs at total level 3).
- Subclass spell-list scaffolding pin (Life Domain Spells, Devotion Spells, Fiend Spells, Draconic Spells, Circle of the Land Spells — verify each ships the expected GrantSpell shape).
- Circle of the Land Spells L5/L7/L9 tier expansions (when those subclass levels get their own hardening cycles).
- Circle of the Land "swap land on long rest" RAW arm (needs an onLongRest OfferChoice cascade primitive; deferred until player demand surfaces).
- Primal Knowledge ability-substitution arm (deferred until the broader use case motivates a new primitive).
- Counter arm of Deflect Attacks (deferred from slice 648).
- L3 OfferChoice cascade tests in Section 4 of the L3 floor (Wizard Scholar-style emission tests for the new L3 OfferChoices: Primal Knowledge, Circle Cantrip, Circle Spells).
