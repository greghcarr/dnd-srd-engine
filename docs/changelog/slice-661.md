# Slice 661 — engine + content: OfferChoice `lifecycle: 'supersede'` (land-swap supersession)

**Type:** Engine primitive + content edit. **First slice of the post-L3-RAW completeness push (closes the slice-660 documented deferral).**

RAW (SRD 5.2.1 Druid Circle of the Land L3): "Whenever you finish a Long Rest, choose one type of land ... you always have the spells listed for your Druid level and lower prepared." The RAW intent is per-long-rest selection. Slice 660 wired the `onLongRest` cascade so a fresh ChoiceRequired fires every long rest, but didn't address the *replacement* semantics — a druid who picked Arid at L3 then Polar at L4 accumulated BOTH lands' L3 spell grants in the effect stack. This slice ships the supersession primitive so the new land's spells REPLACE the prior land's per RAW.

## What's wired

- New optional field `lifecycle?: 'accumulate' | 'supersede'` on `OfferChoiceEffect`. Default `'accumulate'` preserves the slice-618 behavior for every existing onAcquire / onLevelUp OfferChoice (Fighter Fighting Style, Eldritch Invocations picks, etc.). Set to `'supersede'` on choices where each new resolution should REPLACE prior resolutions for the same promptKey.
- The field is threaded through:
  1. `ChoiceRequiredEvent` (event schema).
  2. `PendingChoice` (runtime schema), persisted by `applyChoiceRequired`.
  3. `collectResolvedChoiceEffects` in [src/derive/effect-stack.ts](../../src/derive/effect-stack.ts) — the derive layer walks `character.pendingChoiceIds` and, for each promptKey marked `'supersede'`, contributes only the LATEST resolved PendingChoice's option-effects. Older resolutions stay in `state.pendingChoices` for replay honesty; only the derive layer drops them.
- Content edit: Circle of the Land Spells OfferChoice ships `lifecycle: 'supersede'`. Each long rest replaces the prior land.

## Scope decisions

- **Explicit `lifecycle` field, not derived from `when`**: a future OfferChoice might want supersession on `onLevelUp` (e.g., re-picking an Eldritch Invocation that the warlock can swap at level-up per RAW) without coupling the semantics to a lifecycle moment. The field defaults to `'accumulate'`, so existing content is untouched.
- **Latest-by-`pendingChoiceIds`-order, not by timestamp**: `applyChoiceRequired` pushes onto `character.pendingChoiceIds` in commit order, so the array position is the canonical "newest first" signal. No need to compare event ULIDs or timestamps.
- **Replay-honest, derive-only drop**: prior resolutions stay in `state.pendingChoices`. The derive layer interprets them. This preserves event-sourcing replay determinism and lets a future audit reconstruct the full sequence of choices the player made.
- **Default preservation**: every existing OfferChoice (Fighter Fighting Style, Wizard Scholar, Bard Expertise, Eldritch Invocation slots, Channel Divinity picks, etc.) has no `lifecycle` field, so the accumulate behavior is unchanged. The post-661 derive layer behavior on those choices is byte-identical to pre-661.

## Files

- **[../../src/schemas/effects.ts](../../src/schemas/effects.ts)**: added `lifecycle?: 'accumulate' | 'supersede'` to the `OfferChoice` discriminated-union shape and Zod schema.
- **[../../src/schemas/events/level-up.ts](../../src/schemas/events/level-up.ts)**: added `lifecycle` to `ChoiceRequiredEventSchema`.
- **[../../src/schemas/runtime/pending-choice.ts](../../src/schemas/runtime/pending-choice.ts)**: added `lifecycle` to `PendingChoiceSchema`.
- **[../../src/engine/reducers/level-up.ts](../../src/engine/reducers/level-up.ts)**: `applyChoiceRequired` persists `lifecycle` onto the PendingChoice when set.
- **[../../src/engine/plan/offer-long-rest-choices.ts](../../src/engine/plan/offer-long-rest-choices.ts)**: threads `effect.lifecycle` from the source OfferChoice through to the emitted `ChoiceRequired`. Header comment updated (the slice-660 "deferred" callout becomes the slice-661 wired-here note).
- **[../../src/engine/plan/offer-character-choices.ts](../../src/engine/plan/offer-character-choices.ts)**: same threading for consistency (no onAcquire OfferChoice uses `'supersede'` today, but the field is passed through).
- **[../../src/derive/effect-stack.ts](../../src/derive/effect-stack.ts)**: `collectResolvedChoiceEffects` now dedupes `'supersede'` resolutions by promptKey, taking only the latest.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: Circle of the Land Spells OfferChoice ships `lifecycle: 'supersede'`.
- **[../../tests/unit/engine/slice-661-land-swap-supersession.test.ts](../../tests/unit/engine/slice-661-land-swap-supersession.test.ts)** (new): 4 tests
  - After picking Arid then Polar, only Polar's grants are in the effect stack (Arid's fire-bolt / burning-hands / blur are dropped).
  - Three resolutions (Arid -> Polar -> Tropical): only Tropical's grants remain.
  - All prior resolutions persist in `state.pendingChoices` (replay-honest; derive-only drop).
  - Default lifecycle (accumulate) is unchanged for Fighter Fighting Style: emitted `ChoiceRequired.lifecycle` stays `undefined`.

## Tests

- `npx vitest run tests/unit/engine/slice-661-land-swap-supersession.test.ts`: 4/4 pass.
- Full suite: 518 files / 3752 passing + 173 skipped. Previous baseline 517 / 3748: the +1 file / +4 tests are this slice's. No regressions; the slice-654, slice-660, and srd-l3 audits all still pass under the supersession-aware derive.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive only.** New optional field with default `'accumulate'`. Every existing OfferChoice in the pack has no `lifecycle` and behaves identically to pre-661.

**Behavior change for Circle of the Land druids who long-rest more than once with different land picks**: pre-661 the grants accumulated (a druid that long-rested with Arid then Polar got 6 always-prepared spells). Post-661 the grants supersede (only the most-recent land's 3 spells are prepared). This is RAW-correct; no other content path is affected.

## Audit (Uncle Bob)

- **Names**: `lifecycle: 'accumulate' | 'supersede'` is unambiguous and matches the RAW intent (per-resolution accumulation vs replacement). Both arms are explicit; defaulting to undefined-equals-accumulate is the legacy-preservation path. `latestSupersedeByPromptKey` reads as a transient lookup map.
- **DRY**: the supersession check is a single derive-layer pass. No reducer changes needed beyond persisting the field. The planner-threading is the same one-liner in both `offer-character-choices` and `offer-long-rest-choices`. No content-side duplication.
- **SRP**: the derive layer owns the supersession interpretation. The reducer only persists the field. The planner only threads it. The schemas only declare it. Each layer's job is single-step.
- **Magic numbers / strings**: `'accumulate'` / `'supersede'` are enum literals (Zod-validated). No hidden coupling.
- **Pattern-check**: searched for other OfferChoice users in the pack — every onAcquire / onLevelUp choice today is correctly default-accumulate. The Circle of the Land Spells edit is the only content row that needed the new field. Searched the derive layer for other "walk-resolved-choices" patterns: `collectResolvedChoiceEffects` is the sole consumer; no other code path enumerates resolved PendingChoices to extract effects. Single point of change.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 661 of ~16):

- ~~660~~: Circle of the Land long-rest swap (cascade only — accumulated). Landed.
- ~~661 (this slice)~~: Land-swap supersession (replace per RAW). Landed.
- **662**: Generic `GrantAbilitySubstitution` Effect primitive (replace the slice-659 hardcoded Primal Knowledge gate with a reusable primitive).
- **663**: Always-enforce ability substitutions (lift the opt-in `useAbilitySubstitution: true` gate; RAW says non-Primal-Knowledge Barbarians can't use STR for Acrobatics).
- **664**: Deflect Attacks damage-pipeline auto-integration (consumer no longer manually subtracts reduction).
- **665**: Non-damage area zone primitive (closes zone-of-truth, tiny-hut, wind-wall — 3 spell users across L2 + L3).
- **666**: On-hit rider via castSpell (closes shining-smite + ray-of-enfeeblement).
- **667**: Recurring-rider primitive (closes phantasmal-force).
- **668**: Flight/hover condition (closes levitate).
- **669**: On-action rider (closes dragons-breath).
- **670**: Composite area for slow (speed-half + no-reaction + delayed-action).
- **671**: Composite-buff for beacon-of-hope.
- **672**: Cross-plane per-turn ethereal toggle (closes blink).
- **673**: L3 triple-class multiclass audit (220 combos).
- **674**: L3 fuzz floor (mirrors slice 643/644 for L2; deferred per slice 645 until the L3 punch-list closed).
- **675**: Auto-populate `recharge` on `ResourceState` from `GrantResource.recharge` (deferred from slice 657).
- **676**: Multiclass fuzz support in combat-fuzz-core (deferred from slice 644).

**No new deferrals from this slice.** The slice-660 documented deferral (land-swap supersession) is now closed.
