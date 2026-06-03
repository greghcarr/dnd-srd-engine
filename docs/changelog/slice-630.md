# Slice 630 — comprehensive feature tutorial

**Type:** Docs.

[../getting-started.md](../getting-started.md) is the 5-minute on-ramp (install + character + first attack + save/load). [../api-overview.md](../api-overview.md) is the symbol-by-symbol reference. Neither walks a real consumer through "here is how every major capability fits together." A user said yes to a "proper tutorial covering every feature" in the doc-overhaul plan. This slice closes that gap with a single sequential walkthrough that exercises every major capability the engine ships — and pins each runnable code block against the real public API via the doc-examples audit so the tutorial stays correct as the API evolves.

## Changes

- **Created [../tutorial.md](../tutorial.md)** (~21 KB, 20 sections in one running example):
  1. Install — pin to the GitHub ref, peer-dep note.
  2. Create the engine — `createEngine` + `loadStarterPack` + `seededRNG`.
  3. Build a character — `CharacterSchema.parse`, the L1 enrollment + ability scores + HP minimum.
  4. Drain the L1 choice cascade — `offerCharacterChoices` + `resolveChoice` walking `state.pendingChoices` filtered by `forCharacterId`.
  5. Acquire and equip a weapon — `ItemAcquired` event + `engine.plan.equip` with the `'mainHand' | 'offHand' | 'armor' | 'shield'` slot enum.
  6. Derive the character sheet — `engine.derive.ac` / `attackBonus` + `buildCharacterSheet({character, itemInstances, content, characters})` for the full view model.
  7. Start an encounter — the `createEncounter → rollInitiative → startEncounter → beginFirstTurn` lifecycle.
  8. Attack: plan, commit, observe — reading `AttackRolled.d20[0]` / `attackBonus` / `total` / `targetAC` / `hit` and `DamageApplied.components: [{type, amount, mitigation, rawAmount}]`.
  9. Cast a spell — `engine.plan.castSpell` with `targetIds`; notes on `casterChoice` / `noSlotCost` / `castingClassId`.
  10. Reactions — Shield as the canonical example: `casterId` + `triggeringAttackEventId` + `triggeringAttackTotal` + `originalAC`; gate on `shieldOutcome.preventedHit`. Cross-links to opportunityAttack, counterspell, protection, consumeGuidance, uncannyDodge, stonesEndurance.
  11. Weapon masteries — `chooseWeaponMasteries({weaponDefinitionIds})`, re-choosable on a Long Rest.
  12. Rests — `shortRest` / `longRest` with `participantIds`; note on `grittyRest`.
  13. Level up — `levelUp` with `hpStrategy` + draining the resulting `ChoiceRequired` events.
  14. Consume the event stream — branching on `DamageApplied.components` and `TurnStarted.combatantId`; pointer to `tests/transcript.ts` for a tested formatter.
  15. Save, load, replay — `serializeCampaign` / `loadCampaign` / `replay`.
  16. Undo and redo.
  17. Custom content via content packs — `loadContentPack` for a homebrew spell.
  18. Custom handlers (the plugin escape hatch) — the `ActionHandler` + `HandlerRegistry` shapes, action-vs-effect axes.
  19. Determinism guarantees — `apply()` RNG-free + replay equivalence + the RNG-stream caveat across engine versions.
  20. What the engine doesn't track — cross-link to [../engine-scope.md](../engine-scope.md).
- **Every typecheck-tagged block compiles.** Sections 2-16 form one `<!-- typecheck:continue -->` chain that builds up state across blocks; sections 17 and 18 are standalone `<!-- typecheck -->` modules (no shared `campaign` thread). Doc-examples audit green.
- **Updated [../../README.md](../../README.md)**: the new "New here?" pointer surfaces the tutorial; the Documentation table gets a new row routing "every major capability end-to-end" to `docs/tutorial.md`.
- **Updated [../getting-started.md](../getting-started.md)**: the "What's next" section now leads with the tutorial pointer.
- **Updated [../../tests/audit/doc-size.test.ts](../../tests/audit/doc-size.test.ts)**: added `docs/tutorial.md` to the `fixedFiles` list so it stays under the 60 KB single-Read ceiling.

## Verification

- `npx vitest run tests/audit/doc-examples.test.ts` — 2 cases passing; every typecheck-tagged block in `docs/tutorial.md` (16 modules, the section 2-16 chain plus the two standalone in 17 and 18) compiles against the real public API.
- `npx vitest run tests/audit/doc-size.test.ts tests/audit/doc-links.test.ts tests/audit/doc-counts.test.ts` — 27 cases passing (was 26; +1 for tutorial.md). Tutorial size is ~21 KB, comfortably under 60 KB.
- `npx vitest run` — 501 files / 3365 tests passing (+1 over slice 629, the tutorial doc-size case).
- `npx tsc --noEmit` — clean.

## Audit

- **Names**: `docs/tutorial.md` follows the existing `docs/<topic>.md` convention.
- **DRY**: the tutorial overlaps with [../getting-started.md](../getting-started.md) on sections 2-8 (create engine → first attack). The overlap is intentional: the tutorial is the standalone end-to-end walkthrough; getting-started is the 5-minute on-ramp that pivots off into the tutorial via its "What's next" link. Keeping both short and well-cross-linked beats forcing a tutorial reader to bounce mid-stride into the on-ramp.
- **SRP**: tutorial = "walk every major capability"; getting-started = "5-minute on-ramp"; api-overview = "symbol reference"; recipes = "isolated patterns." Each doc keeps its single purpose.
- **Pattern-check**: the doc-examples audit catches one class of doc rot at commit time (stale API signatures). What it doesn't catch: prose drift, broken example *logic* (the example might compile but produce silly output), or new capabilities the tutorial doesn't yet cover. Same shape elsewhere? Yes — getting-started.md, README.md, and recipes.md also have `<!-- typecheck -->` blocks; all green. The audit's coverage on this tutorial is now exercising 16 distinct modules; failure attribution to "which block of which doc broke" is line-precise.
- **Magic numbers**: none. The tutorial cites class levels and ability scores from RAW.

## Open follow-ups

- **Slice 631**: numerical accuracy sweep + audit extension (extend `doc-counts.test.ts` with mechanical-wiring percentage CHECKS; sweep all docs for unguarded numerical claims).
