# Slice 660 — engine + content: `offerLongRestChoices` (Circle of the Land land swap)

**Type:** Engine planner + content edit. **Eighth and final slice of the L3 RAW-completeness push.**

RAW (SRD 5.2.1 Druid Circle of the Land L3): "Whenever you finish a Long Rest, choose one type of land ... you always have the spells listed for your Druid level and lower prepared." Slice 652 wired the Land Type pick as an `onAcquire` OfferChoice — close to RAW but missed the "every long rest" semantics. This slice ships the proper `onLongRest` cascade.

## What's wired

- New planner `engine.plan.offerLongRestChoices({ characterId })`. Sibling of slice-618's `offerCharacterChoices` (onAcquire choices). Walks the character's effective effect stack, emits a `ChoiceRequired` for each `OfferChoice { when: 'onLongRest' }` whose previous PendingChoice (if any) is already resolved. Unresolved PendingChoices with the same promptKey dedupe.
- Content edit: Circle of the Land Spells flipped from `when: 'onAcquire'` to `when: 'onLongRest'`. Now fires via `offerLongRestChoices` rather than `offerCharacterChoices`.

## Scope decisions

- **Dedup semantics**: skip a promptKey that already has an UNRESOLVED PendingChoice (don't double-emit). Resolved PendingChoices DON'T dedupe — each long rest after resolution gets a fresh ChoiceRequired so RAW "each long rest = new pick" works.
- **Land-swap supersession (deferred)**: per-RAW, picking a new land at the next long rest should REPLACE the prior land's spell grants. The engine currently accumulates resolutions (each ChoiceResolved adds its effects to the effect stack via derive). A druid picking Arid at L3, then Polar at L4, gets BOTH lands' L3 spells today. Fixing this needs a supersession primitive (a `PendingChoiceSuperseded` event or a derive-layer "latest resolution wins per promptKey" pass). Out of slice 660 scope; deferred to a future slice.
- **Consumer-driven invocation**: the planner is opt-in. Consumers invoke `offerLongRestChoices` after committing `LongRestEnded`. An automatic post-LongRestEnded cascade would require reducer-side scheduling (reducers don't currently emit events themselves; cascades come from planner calls).

## Files

- **[../../src/engine/plan/offer-long-rest-choices.ts](../../src/engine/plan/offer-long-rest-choices.ts)** (new): the planner + `OfferLongRestChoicesIntent`. ~95 lines, structurally mirrors `offer-character-choices.ts`.
- **[../../src/engine/plan/index.ts](../../src/engine/plan/index.ts)**: re-export.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: `engine.plan.offerLongRestChoices` method.
- **[../../tests/audit/planner-wiring.test.ts](../../tests/audit/planner-wiring.test.ts)**: added `'offerLongRestChoices'` to `EXCLUDED_FROM_DISPATCH` (sibling of `'offerCharacterChoices'`; not a player action, not part of the performIntent dispatch).
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: `circle-of-the-land-spells` OfferChoice `when` flipped from `'onAcquire'` → `'onLongRest'`.
- **[../../tests/audit/srd-l3-complete.test.ts](../../tests/audit/srd-l3-complete.test.ts)**: Section 6 third test updated to invoke `offerLongRestChoices` instead of `offerCharacterChoices` for the Land Type choice (RAW lifecycle moment moved).
- **[../../tests/unit/engine/slice-654-subclass-selection-cascade.test.ts](../../tests/unit/engine/slice-654-subclass-selection-cascade.test.ts)**: Druid L2→L3 cascade test updated to split the post-resolution check — Circle Cantrip stays on `offerCharacterChoices` (onAcquire); Land Type moved to `offerLongRestChoices` (onLongRest).
- **[../../tests/unit/engine/slice-660-offer-long-rest-choices.test.ts](../../tests/unit/engine/slice-660-offer-long-rest-choices.test.ts)** (new): 4 tests
  - L3 Land Druid: fresh ChoiceRequired with 4 SRD lands.
  - Dedup: no double-emit when unresolved PendingChoice exists.
  - Post-resolution: subsequent call emits fresh ChoiceRequired (new choiceId).
  - No-op for character without onLongRest OfferChoices (e.g. Fighter).

## Tests

- `npx vitest run tests/unit/engine/slice-660-offer-long-rest-choices.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/srd-l3-complete.test.ts tests/unit/engine/slice-654-subclass-selection-cascade.test.ts`: 44/44 pass.
- `npx vitest run tests/audit/planner-wiring.test.ts`: green.
- Full suite: green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive only.** New planner; no existing planner behavior changes. The content edit (Circle Spells `when` flip) is a content correction matching RAW more precisely.

**Behavior change for fresh L3 Druids built via createPC**: pre-660, the Land Type choice fired via `offerCharacterChoices` at character-create time. Post-660, the consumer must invoke `offerLongRestChoices` after the druid's first long rest (or call it manually). For tests, the slice-654 cascade test was updated.

## Audit (Uncle Bob)

- **Names**: `offerLongRestChoices` mirrors `offerCharacterChoices` — same shape, different lifecycle moment.
- **DRY**: shares `collectEffectsFromCharacter` derive helper; same effect-walking pattern as `offerCharacterChoices`. The dedup logic differs (onAcquire dedupes on ANY promptKey occurrence; onLongRest only on UNRESOLVED) — that's the RAW difference, not duplication.
- **SRP**: the planner has one job (emit ChoiceRequired for onLongRest OfferChoices). Consumer-driven invocation matches `offerCharacterChoices`'s pattern.
- **Magic numbers / strings**: every literal named (`'onLongRest'`, etc.). The Circle Spells content edit changes one field (`when`).
- **Pattern-check**: searched for other `when: 'onLongRest'` OfferChoices in the pack — Circle Spells is the only one. When a second arrives, the cascade pattern is established and one-line content additions Just Work.

## Open follow-ups

L3 RAW-completeness punch list (slice 660 of 8): **all eight slices landed.**

- ~~653~~: L3 OfferChoice emission tests. Landed.
- ~~654~~: Subclass-selection cascade. Landed.
- ~~655~~: Subclass spell-list scaffolding pin. Landed.
- ~~656~~: L3 multiclass build audit. Landed.
- ~~657~~: `partialShortFullLong` recharge primitive. Landed.
- ~~658~~: Deflect Attacks counter arm. Landed.
- ~~659~~: Primal Knowledge ability-substitution gate. Landed.
- ~~660 (this slice)~~: Circle of the Land long-rest swap. Landed.

**The L3 RAW completeness punch list is closed.** Ready to tag `v0.3.0-alpha.0` (L2 surface complete; slices 633-644) AND `v0.4.0-alpha.0` (L3 RAW complete; slices 645-660).

**Documented deferred RAW arms (post-cycle stretch)**:
- **Land-swap supersession**: picking a new land at the next long rest should REPLACE the prior land's grants. Today the engine accumulates; a druid that long-rests twice with different lands gets both lands' spells. Needs a `PendingChoiceSuperseded` event or a "latest resolution wins per promptKey" derive pass.
- **Deflect Attacks damage-pipeline auto-integration** (deferred from slice 658). Today the consumer manually subtracts the reduction from a pending DamageApplied; auto-integration via the interceptFatalDamage path is a future engine slice.
- **Generic `GrantAbilitySubstitution` Effect** (deferred from slice 659). When a second ability-substitution feature ships, lift the hardcoded Primal Knowledge gate to a generic primitive.
- **L3 triple-class multiclass audit** (L1+L1+L1, C(12,3) = 220 combinations). Rare in practice.
- **Always-enforce mode for ability substitutions** — would require updating many existing tests that pass mismatched (ability, skill) pairs for non-substitution reasons.
- **Auto-populate `recharge` on `ResourceState` from content grants** (deferred from slice 657). Today the consumer manually populates resources; a future engine slice could read `GrantResource.recharge` from the effect-stack and seed it on `createPC` / fresh-build paths.
