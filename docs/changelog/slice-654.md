# Slice 654 — engine + schema: subclass-selection cascade

**Type:** Engine primitive + event schema additions + reducer + behavioral tests.

Closes the second L3 RAW-completeness gap. The previous engine only set `subclassId` if the consumer supplied it at character creation (`createPC`). Leveling a character from L2 to L3 didn't surface "pick your subclass" as a ChoiceRequired — a real RAW gap because **every** 2024 SRD class has `subclassLevel: 3`.

The cascade now flows end-to-end:

```
planLevelUp(L2→L3 enrollment)
  ↳ emits ChoiceRequired { promptKey: 'subclass-<classId>',
                            options: <available subclasses>,
                            subclassChoiceForClassId: <classId> }

applyChoiceRequired
  ↳ persists `subclassChoiceForClassId` onto the PendingChoice

planResolveChoice(choiceId, [chosenSubclassId])
  ↳ emits ChoiceResolved + SubclassChosen { classId, subclassId }

applySubclassChosen
  ↳ assigns enrollment.subclassId = subclassId

(consumer re-invokes) engine.plan.offerCharacterChoices
  ↳ surfaces the subclass's nested OfferChoices (Druid Circle
    Cantrip + Spells, etc.) now that subclassId is set
```

## Scope decisions

- **Marker on ChoiceRequired vs new event type for the choice**: chose the marker (`subclassChoiceForClassId?: string` on `ChoiceRequiredEventSchema`). Reuses the existing choice infrastructure end-to-end; planResolveChoice routes the resolved option's id as the chosen subclassId. Cleaner than a parallel `SubclassChoiceRequired` event.
- **Cascade nesting**: chosen-option's `effects: []` is intentional — subclass effects come online via the effect-stack derive once `subclassId` is set, not via per-option effects. Nested OfferChoices (Circle Cantrip, etc.) surface when the consumer re-invokes `offerCharacterChoices`. Auto-cascading via post-SubclassChosen re-walk is a future engine slice (the planner can't re-emit from within itself with the current shape).
- **Guard on enrollment.subclassId === undefined**: skips the cascade if the consumer already set subclassId via createPC. Prevents a "choose again" prompt on existing characters.

## Files

### Schema + reducer (new event + extended choice + new PendingChoice field)

- **[../../src/schemas/events/level-up.ts](../../src/schemas/events/level-up.ts)**:
  - `ChoiceRequiredEventSchema`: new optional `subclassChoiceForClassId: z.string()` field.
  - New `SubclassChosenEventSchema` (characterId + classId + subclassId).
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: five touchpoints for `SubclassChosen` (import, discriminated union, name array, public schema export, public type export).
- **[../../src/schemas/runtime/pending-choice.ts](../../src/schemas/runtime/pending-choice.ts)**: new optional `subclassChoiceForClassId: z.string()` field on `PendingChoiceSchema`.
- **[../../src/engine/reducers/level-up.ts](../../src/engine/reducers/level-up.ts)**:
  - `applyChoiceRequired` now persists `subclassChoiceForClassId` onto the PendingChoice (conditional spread to keep the field optional).
  - New `applySubclassChosen` reducer: looks up the enrollment by `classId`, assigns `subclassId`.
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: import + dispatch case for `'SubclassChosen'`.
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: format case for `SubclassChosen`.

### Planner

- **[../../src/engine/plan/level-up.ts](../../src/engine/plan/level-up.ts)**:
  - `planLevelUp`: at `cls.subclassLevel === newClassLevel` AND `enrollment.subclassId === undefined`, emit a subclass-selection ChoiceRequired with the available subclasses (`content.subclasses` filtered by `parentClassId`) as options. Sets `subclassChoiceForClassId: intent.classId` on the event.
  - `planResolveChoice`: reads `subclassChoiceForClassId` from the PendingChoice; if set AND `selectedOptionIds.length === 1`, appends a `SubclassChosen` event to the return list.

### Behavioral tests

- **[../../tests/unit/engine/slice-654-subclass-selection-cascade.test.ts](../../tests/unit/engine/slice-654-subclass-selection-cascade.test.ts)** (new): 4 tests
  - Barbarian L2→L3 emits subclass-selection ChoiceRequired with `path-of-the-berserker` as an option.
  - Resolving the choice emits SubclassChosen; reducer sets `enrollment.subclassId`.
  - Druid L2→L3 cascade end-to-end: subclass choice fires, picking Circle of the Land sets subclassId, re-invoking `offerCharacterChoices` surfaces both nested OfferChoices (Circle Cantrip + Land Type).
  - Pre-built character with subclassId set doesn't get the cascade on subsequent level-ups.

## Tests

- `npx vitest run tests/unit/engine/slice-654-subclass-selection-cascade.test.ts`: 4/4 pass.
- Full suite: green.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Schema additive.** Two new optional fields (`ChoiceRequiredEvent.subclassChoiceForClassId`, `PendingChoice.subclassChoiceForClassId`) + one new event type (`SubclassChosen`). Old campaigns that never logged the new event replay unchanged.

**Behavior addition** (not a behavior change): consumers calling `planLevelUp` to L3 on a character without a pre-set subclassId now receive a subclass-selection ChoiceRequired they may not have been expecting. Pre-slice, the call silently completed and left subclassId undefined; consumers handled subclass selection out-of-band. Post-slice, the engine surfaces the choice. **This is the RAW-correct behavior** and the per-test guard (subclassId-already-set short-circuits the cascade) means existing createPC paths are unaffected.

**No RNG consumption** in the cascade itself; only the existing `planLevelUp` HP roll consumes RNG.

## Audit (Uncle Bob)

- **Names**: `subclassChoiceForClassId`, `SubclassChosen`, `applySubclassChosen` — every name names exactly what the thing does. The promptKey format `subclass-<classId>` makes the choice's role visible in transcripts and event logs.
- **DRY**: leans on the existing ChoiceRequired + ChoiceResolved infrastructure. The subclass-selection cascade is just a typed marker on top of the existing choice machinery — no parallel infrastructure. The `subclassChoiceForClassId` field is the single source of truth, threaded ChoiceRequired → PendingChoice (via the reducer) → SubclassChosen (via planResolveChoice).
- **SRP**: each piece does one thing. planLevelUp emits the choice; applyChoiceRequired persists the marker; planResolveChoice routes the resolution; applySubclassChosen mutates the enrollment.
- **Magic numbers / strings**: the promptKey pattern `subclass-<classId>` is the only string convention. Used once in planLevelUp, mirrored in the audit's assertion. A single literal `'subclass-'` prefix could be extracted to a constant if we add more sentinel promptKeys; with one, it's premature.
- **Pattern-check**: searched for other "level-N triggers a one-time selection" features. Pact Boon (Warlock L3 — slice 517) uses an OfferChoice within the L3 row's content effects, not a separately-typed cascade. ASI/feat selection at L4/8/12/etc. is similar but uses standard OfferChoice. The subclass-selection cascade is the first "engine emits a choice not authored in content" pattern; pattern is justified because the subclass catalog isn't a content-row effect (it's a derived list from `content.subclasses`).

## Open follow-ups

L3 RAW-completeness punch list (slice 654 of 8):

- ~~653~~: L3 OfferChoice emission tests. Landed.
- ~~654 (this slice)~~: Subclass-selection cascade. Landed.
- **655**: Subclass spell-list scaffolding pin (Life Domain / Devotion / Fiend / Draconic / Circle of the Land Spells verify each ships expected `GrantSpell` shape).
- **656**: L3 multiclass build audit.
- **657**: `partialShortFullLong` recharge primitive.
- **658**: Deflect Attacks counter arm.
- **659**: Primal Knowledge ability-substitution.
- **660**: Circle of the Land long-rest swap.

**Deferred (post-655)**:
- Auto-cascade nested OfferChoices after SubclassChosen (today the consumer re-invokes `offerCharacterChoices` manually). Would require planResolveChoice to re-walk effects mid-planner with the post-SubclassChosen state.
- An L3 floor Section 6 test extension verifying the subclass-selection cascade for all 12 canonical subclasses (today the slice-654 unit tests cover Barbarian + Druid explicitly; pattern-check across 12 is a stretch).
