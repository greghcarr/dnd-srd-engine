# Slice 752 — save reaction window (Countercharm) + charm-person in the fuzz AI

**Type:** Driver/infra (combat-fuzz). Composes the existing `planCountercharm` planner; adds an `'auto'`-gated AI behavior so the window can occur. Completes the reaction set (749 damage / 750 attack / 751 cast / 752 save).

## Why

The save window: when a creature fails a save against Charmed or Frightened, a Bard L7 (itself or an ally) rerolls with Advantage and, on success, the condition is removed. Unlike the other windows, the fuzz never produced a charm/frighten save — charm-person sat in the Bard pool but was never *cast*, `fear` is L3 / unpooled, no monster fear traits. Per the user ("make it actually fire"), this slice also teaches the AI to cast charm-person under `reactions: 'auto'`, so the window occurs and dnd-web can show it.

## How (post-commit, not two-phase)

Countercharm doesn't prevent the cast — it rerolls the failed save after the fact and removes the condition on success. So it extends the slice-749 **post-commit** reaction policy ([reaction-policy.ts](../../scripts/reactions/reaction-policy.ts)):

1. **AI** ([combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) `pickIntent`): gains `enableCharmPerson` (passed `reactions === 'auto'`); a Bard with charm-person prepared + an L1 slot casts it (high priority, first-turn action). Under `'none'` the flag is false → the AI is unchanged → byte-identical.
2. **Team thread**: `ReactionPolicyContext` gains `teamACharacterIds` / `teamBCharacterIds` (populated at the call site) so the resolver can find a Bard on the *charmed* creature's team.
3. **Resolver**: after the damage-mitigation loop, a second loop scans `producedEvents` for `ConditionApplied('charmed'/'frightened')`; correlates the preceding failed `SaveRolled` for that target (for the DC / ability / bonus — `SaveRolled` doesn't record which condition it gated); finds a Bard L7 on the target's team (the target counts) with a reaction; calls `engine.plan.countercharm` (reroll with Advantage); on success commits `[...counterEvents, ConditionRemoved{ targetId, conditionId }]`.

## Demonstrability

Even with the AI casting charm-person, the full chain (a bard casts it → the target's team has a Bard L7 → a failed save → a successful reroll) is rare: across 600 L7 2v2 PC seeds, charm-person landed 31× and Countercharm fired 6× (~1%). So the **stable correctness gate is a constructed unit test** (a charmed Bard L7 → resolver rerolls → removes on a low DC, keeps on an unreachable DC); a **golden anchor** over the firing seeds (112/206/275/281/391) asserts it fires in real fuzz (aggregate, so single-seed RNG drift doesn't break the suite — same anchor pattern as the tactical-OA golden). Frightened has no fuzz source even now (charm-person/Charmed only); the resolver handles `'frightened'` for correctness/future content.

## Files

- [scripts/combat-fuzz-core.ts](../../scripts/combat-fuzz-core.ts) — `enableCharmPerson` on `pickIntent` + the bard charm-person branch; `teamACharacterIds`/`teamBCharacterIds` on `ReactionPolicyContext` + populated at the call.
- [scripts/reactions/reaction-policy.ts](../../scripts/reactions/reaction-policy.ts) — the Countercharm post-commit branch (`precedingFailedSave` correlation + `fireCountercharm` + `ConditionRemoved`).
- [src/ai/reactions.ts](../../src/ai/reactions.ts) + [reaction-constants.ts](../../src/ai/reaction-constants.ts) + [src/ai/index.ts](../../src/ai/index.ts) — `hasCountercharm` + `COUNTERCHARM_BARD_LEVEL` / `COUNTERCHARM_CONDITIONS`.

## Tests

- [tests/unit/ai/reactions.test.ts](../../tests/unit/ai/reactions.test.ts) — `hasCountercharm` (Bard L7 → true; L6 / non-Bard → false).
- [tests/unit/reactions/countercharm-resolver.test.ts](../../tests/unit/reactions/countercharm-resolver.test.ts) — NEW. Constructed deterministic gate: reroll removes the condition on a low DC, keeps it on an unreachable DC.
- [tests/integration/fuzz-reactions-default-guard.test.ts](../../tests/integration/fuzz-reactions-default-guard.test.ts) — `'none'` never casts charm-person (AI change auto-gated) + explicit `'none'` normalized-equals the default.
- [tests/golden/s-reactions.test.ts](../../tests/golden/s-reactions.test.ts) — Countercharm fires (a `charmed` removal) across the anchor seeds.

No existing goldens/fuzz change (`'none'` AI + path untouched). No doc-counts impact.

## Open follow-ups

- Protection (needs positions); the clean engine two-phase attack API. The reaction layer's reactive windows (damage / attack / cast / save) are now covered.

## Verification

`npx tsc --noEmit` clean. Reaction tests green (41). Full `npx vitest run`: green, zero pre-existing tests changed. Smoke: 600 L7 2v2 PC `'auto'` battles → 31 charm-person lands, 6 Countercharm removals, 0 replay mismatches, 0 charm-person under `'none'`.
