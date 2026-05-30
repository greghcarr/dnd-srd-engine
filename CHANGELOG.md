# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 516): Repelling Blast invocation + `PushTarget` TriggerAction + `event.source` damage fact + cast-spell trigger dispatch**

Wires Repelling Blast (warlock invocation: push 10 ft on Eldritch Blast hits). The work touches four engine surfaces, each surgical:

RAW (Repelling Blast): "When you hit a creature with Eldritch Blast, you can push that creature up to 10 feet away from you in a straight line."

**Engine:**
- New **`PushTarget { distanceFeet: number }`** TriggerAction ([src/schemas/effects.ts](src/schemas/effects.ts)) + dispatcher branch ([src/engine/triggers/dispatch.ts](src/engine/triggers/dispatch.ts)) that emits a `CreaturePushed` event targeting the triggering event's target (`AttackRolled` and `DamageApplied` both carry `targetId`). The engine doesn't model positions; the event is informational for consumers to apply the position change.
- New **`event.source`** fact added to DamageApplied trigger facts ([src/engine/triggers/dispatch.ts](src/engine/triggers/dispatch.ts) `buildEventFacts`). The `source` field is already on the event (set by cast-spell to the spell id for spell damage); the fact surfaces it to predicates so per-spell on-hit riders can gate on it (canonical user here: `eq event.source 'eldritch-blast'`).
- **Cast-spell now dispatches OnEvent triggers** on the spell-attack `DamageApplied` it emits ([src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts) `planAttackMechanic`). Mirrors the resolveAttack damageTriggers dispatch in attack.ts. Previously OnEvent riders attached to spell-cast damage (anything granted via GrantFeat / OnEvent on the caster's effect stack) never fired because cast-spell built its own DamageApplied events without invoking the trigger dispatcher.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `repelling-blast` Feat (category: 'invocation', repeatable: false). Single OnEvent: trigger on DamageApplied where `sourceIsSelf` + `source == 'eldritch-blast'`; action `PushTarget distanceFeet: 10`.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 12 → 13.

**Doc-count update**: feats 30 → 31 (13 invocation feats). Features snapshot gains `invocation:repelling-blast`.

**Documented RAW deviation (minor)**: RAW says "when you hit" — engine fires post-damage (the trigger event is DamageApplied, not AttackRolled-then-DamageApplied). RAW doesn't specify damage-vs-push ordering, so the outcome (target damaged + pushed) is the same.

**Tests** at [tests/unit/engine/slice-516-repelling-blast.test.ts](tests/unit/engine/slice-516-repelling-blast.test.ts) - 4 cases: feat ships the expected OnEvent shape; a warlock with Repelling Blast hitting with Eldritch Blast emits `CreaturePushed targetId distanceFeet: 10 sourceCharacterId`; a warlock WITHOUT the invocation doesn't push on EB hits; a warlock WITH Repelling Blast casting fire-bolt does NOT push (gated on `event.source == eldritch-blast`).

**Audit:**
- *RAW match*: 10-ft push on Eldritch Blast hits, no spillover to other cantrips. Damage-then-push ordering is the documented minor deviation.
- *Names*: `PushTarget` mirrors `ApplyCondition` / `GrantTempHP` (TriggerAction naming); `event.source` mirrors `event.spellSchool` / `event.spellId`.
- *DRY*: PushTarget dispatch is one branch in the existing action loop; trigger dispatch in cast-spell mirrors the attack.ts pattern verbatim.
- *SRP*: PushTarget does one thing (emit CreaturePushed); the engine extension fills one gap (cast-spell never dispatched triggers).
- *Magic numbers*: 10 (RAW Repelling Blast distance).
- *Mechanical outcomes asserted*: feat shape, push fires on EB hit with correct fields, no push without invocation, no push on other cantrips.

**Pattern-check**: cast-spell never dispatched OnEvent triggers before this slice — only attack.ts did. That meant ANY on-hit / on-damage rider attached to a spell-caster's effect stack was silently inert for spell damage. Adding the dispatch here unlocks Repelling Blast and any future per-spell on-hit / on-damage rider (Empowered Smite-style rider on a damaging cantrip, etc.). The dispatch is added only at planAttackMechanic; other emission sites in cast-spell (planSaveMechanic damage, planAutoHitMechanic, planHpThresholdMechanic) still don't dispatch — a follow-up slice can extend if a content user appears. Tracked.

**Engine + content (slice 515): Eldritch Mind invocation + `event.isConcentrationCheck` save fact**

Wires Eldritch Mind, the warlock invocation that grants advantage on Constitution saves to maintain Concentration. The fix needs one new save fact so the SetAdvantage condition can fire ONLY for concentration checks (not for ordinary CON saves like poison or hold person).

RAW (Eldritch Mind): "You have advantage on Constitution saving throws that you make to maintain Concentration."

**Engine** ([src/derive/save.ts](src/derive/save.ts), [src/engine/plan/concentration.ts](src/engine/plan/concentration.ts)):
- `ComputeSaveInput` gains an optional `isConcentrationCheck?: boolean` field. When true, the SetAdvantage condition facts include `event.isConcentrationCheck: true` (else false).
- `planConcentrationBreakOnDrop` passes `isConcentrationCheck: true` to `computeSavingThrow`. All other CON-save callers (spell saves, recurring-save planners, etc.) leave it false. Safe addition: no existing predicate references this fact, so behavior is unchanged for every save except the new gated Eldritch Mind one.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `eldritch-mind` Feat (category: 'invocation', repeatable: false). Single effect: `SetAdvantage on: { kind: 'save', ability: 'CON' } mode: 'advantage' condition: eq event.isConcentrationCheck true`.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 11 → 12.

**Doc-count update**: feats 29 → 30 (12 invocation feats). Features snapshot gains `invocation:eldritch-mind`.

**Tests** at [tests/unit/engine/slice-515-eldritch-mind.test.ts](tests/unit/engine/slice-515-eldritch-mind.test.ts) - 4 cases: feat shape; a warlock with Eldritch Mind gets advantage on a concentration CON save but NOT on an ordinary CON save (the condition fires correctly per-fact); a warlock without the invocation gets NO advantage on the concentration save; L1 OfferChoice exposes Eldritch Mind.

**Audit:**
- *RAW match*: advantage on concentration CON saves only, no spillover to other CON saves.
- *Names*: `event.isConcentrationCheck` mirrors `event.isSpellSave` / `event.savePreventsCondition` (existing `event.*` save-facts).
- *DRY*: one new field on `ComputeSaveInput`; one new entry in the facts map; one inline content effect.
- *SRP*: the fact does one thing — flag "this save is a concentration check"; the SetAdvantage gates on it.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: feat shape, advantage on concentration save, no advantage on ordinary CON save, control case without invocation.

**Pattern-check**: the new save fact follows the established `event.*` per-save context pattern (slice 258's `event.isSpellSave`, slice 291's `event.savePreventsCondition`). Any future predicate that wants to discriminate concentration saves from other CON saves can use it. Only one caller (`planConcentrationBreakOnDrop`) currently sets the flag; non-concentration save paths default to false (safe).

**Content (slice 514): Warlock invocations batch 2 — Ascendant Step + Gift of the Depths**

Continuation of the post-slice-511 catalog sweep. Two more L1-eligible invocations, content-only (no engine work):
- **Ascendant Step** — cast Levitate at will. → `GrantSpell levitate 'at-will'`. Rides the slice-513 at-will slot bypass.
- **Gift of the Depths** — swim speed equal to walking speed + cast Water Breathing once per long rest. → `ModifySpeed swim matchWalkSpeed` + `GrantSpell water-breathing 'oncePerLongRest'`. Multi-effect.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- 2 new Feat rows (category: 'invocation', repeatable: false), one and two effects respectively.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 9 → 11.

**Doc-count update**: feats 27 → 29 (11 invocation feats). Features snapshot gains 2 new wired feat ids. Slice-513's "exactly 9" assertions relaxed to subset checks (added invocations are still PRESENT, but other slices may add more).

**Documented RAW deviation**: Gift of the Depths' "breathe underwater" arm is consumer-managed (engine doesn't model breathing/drowning); the swim speed + once-per-rest Water Breathing cover the mechanically-load-bearing parts.

**Tests** at [tests/unit/engine/slice-514-warlock-invocations-batch-2.test.ts](tests/unit/engine/slice-514-warlock-invocations-batch-2.test.ts) - 5 cases: pack ships 11 invocation feats (slice 513's 9 + 2 new); warlock L1 OfferChoice exposes both; Ascendant Step grants Levitate at-will; Levitate casts without consuming a slot (at-will bypass); Gift of the Depths sets swim speed = walk speed (30 ft for human) AND grants Water Breathing oncePerLongRest.

Pure content slice — no engine changes.

**Engine + content (slice 513): Warlock invocation content sweep — 6 new invocations + at-will GrantSpell slot bypass**

First batch of the post-slice-511 Warlock invocation catalog expansion. Six invocations authored as Feat content rows (category: 'invocation') and added to the warlock L1 OfferChoice. Five are at-will GrantSpell invocations (cast a 1st-level spell without expending a slot, unlimited uses); one is a sense grant.

RAW + wired (each, slice 513):
- **Armor of Shadows** — cast Mage Armor at will. → `GrantSpell mage-armor 'at-will'`.
- **Devil's Sight** — see in nonmagical darkness within 120 ft. → `GrantSense darkvision 120`.
- **Fiendish Vigor** — cast False Life at will. → `GrantSpell false-life 'at-will'`.
- **Mask of Many Faces** — cast Disguise Self at will. → `GrantSpell disguise-self 'at-will'`.
- **Misty Visions** — cast Silent Image at will. → `GrantSpell silent-image 'at-will'`.
- **Otherworldly Leap** — cast Jump at will. → `GrantSpell jump 'at-will'`.

**Engine** ([src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- The cast pathway's `noSlotCost` gate now also fires when the bearer has an `at-will` `GrantSpell` for the cast spell id (mirror of the existing `useFreeCast` and `intent.noSlotCost` arms). Detection: walk the caster's `buildEffectStack(...).grantedSpells()` for any entry whose `spellId` matches and `preparation === 'at-will'`. Cantrips short-circuit (already bypass slots). **Previously**: `preparation: 'at-will'` was schema-recognized but not load-bearing — the cast still consumed a slot unless the consumer explicitly passed `noSlotCost: true`. **Now**: any at-will-granted spell casts free. Safe addition: zero existing at-will GrantSpell content in the pack before this slice (verified), so no regression.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- 6 new Feat rows (above), all `category: 'invocation'`, `repeatable: false`, prerequisites name the relevant prereq (e.g., "Warlock"). Effects are one each (GrantSpell at-will or GrantSense).
- Warlock L1 `eldritch-invocations-2` OfferChoice's options: 3 → 9 (added one GrantFeat option per new invocation).

**Doc-count update**: `getting-started.md` feats total 21 → 27 (9 invocation feats now). Features snapshot gains 6 new wired feat ids.

**Documented RAW deviations:**
- **Devil's Sight**: the "see through magical darkness" arm is not modeled (the engine has no magical-darkness obscurement enforcement to bypass). Standard 120 ft darkvision IS granted, which is the load-bearing arm for sight-in-dim-light scenarios.
- **Mask of Many Faces / Misty Visions / Disguise Self illusion arms**: the perception-vs-illusion mechanic is consumer-managed (no engine model for "the illusion is detected on close inspection / a successful Investigation check").
- **The L2+ warlock invocation tiers (eldritch-invocations-3 through -9)** still ship `effects: []`. A warlock at L2 with only the L1 OfferChoice wired knows 1 invocation, not the RAW 2. Per-tier wiring is a separate content slice each; the L1 OfferChoice expansion this slice ships is the L1-only fix.

**Tests** at [tests/unit/engine/slice-513-warlock-invocations-batch.test.ts](tests/unit/engine/slice-513-warlock-invocations-batch.test.ts) - 10 cases: pack ships exactly 9 invocation feats; warlock L1 OfferChoice exposes all 9; each of the 5 new at-will GrantSpell invocations projects its `GrantSpell preparation: 'at-will'` into the bearer's effective spell list (table-driven `it.each`); Devil's Sight grants 120 ft darkvision via `senseRange`; **end-to-end the at-will slot bypass works** (a warlock with Armor of Shadows casts Mage Armor with no `SpellSlotConsumed` / `PactSlotConsumed` event); control case (warlock without the invocation casting Mage Armor via knownSpells consumes a slot as normal).

**Audit:**
- *RAW match*: each invocation grants what RAW says. Deviations documented above.
- *Names*: feat ids match the canonical invocation names (kebab-case).
- *DRY*: all 5 at-will spell invocations are one-line GrantSpell rows; the cast-spell engine extension is one ~10-line block at the existing `noSlotCost` derivation site.
- *SRP*: each invocation does one thing; the engine extension does one thing (detect at-will → bypass slot).
- *Magic numbers*: 120 (Devil's Sight darkvision range) is RAW.
- *Mechanical outcomes asserted*: catalog shape, OfferChoice shape, per-invocation projection, sense range, slot-bypass end-to-end, control case.

**Pattern-check**: the at-will slot bypass mechanism generalizes to any future invocation or feat granting an at-will spell (Magic Initiate's `oncePerLongRest` was the only previous "free-cast"-style flag; `at-will` was schema-only). The 5 sibling at-will invocations all use the same one-effect Feat shape — any future at-will-spell invocation (Ascendant Step → Levitate, Eldritch Sight → Detect Magic, etc.) is one content row + one OfferChoice option. The L2-L18 OfferChoice tiers staying stubbed is the next-cohort content sweep work.

**Content + test (slice 512): per-cantrip generalization for Agonizing Blast — 3 invocation Feat variants**

Closes the slice-510/511 documented RAW deviation: Agonizing Blast was hardcoded to Eldritch Blast; RAW lets the warlock pick any known Warlock damage cantrip. The starter pack lists three such cantrips (Eldritch Blast, Chill Touch, Poison Spray), and this slice authors one Feat variant per cantrip — the warlock's L1 invocation OfferChoice now exposes three labeled options ("Agonizing Blast (Eldritch Blast)" / "(Chill Touch)" / "(Poison Spray)"), each granting its corresponding feat. The player's pick at acquisition time IS the cantrip choice; no nested OfferChoice or ChoiceResolved-cascade needed for the one-cantrip-pick case.

RAW (Agonizing Blast): "Choose one of your known Warlock cantrips that deals damage. You can add your Charisma modifier to that spell's damage rolls."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- `agonizing-blast` Feat renamed to `agonizing-blast-eldritch-blast` (the Eldritch Blast variant; same effects).
- New `agonizing-blast-chill-touch` and `agonizing-blast-poison-spray` Feat rows (category: 'invocation', repeatable: false, prerequisites name the cantrip), each with `AddModifier(damage, CHA-mod)` gated on its own `event.spellId`.
- Warlock L1 `eldritch-invocations-2` OfferChoice's options: 1 → 3 (one per variant), each `[{ kind: 'GrantFeat', featId: '<variant>' }]`.

**Tests** at [tests/unit/engine/slice-512-agonizing-blast-per-cantrip.test.ts](tests/unit/engine/slice-512-agonizing-blast-per-cantrip.test.ts) - 4 cases: the pack ships all three variants with the right per-cantrip `event.spellId` condition; the warlock L1 OfferChoice exposes all three; picking the Chill Touch variant adds +CHA-mod to Chill Touch only (not Eldritch Blast or Poison Spray); picking the Poison Spray variant adds +CHA-mod to Poison Spray only. Updated slice-510 + slice-511 tests to reference the renamed feat id.

**Doc-count update**: `getting-started.md` feats total 19 → 21 (3 invocation feats instead of 1). Features snapshot updated to include the two new wired feat ids.

**Documented design note** (deferred): the per-cantrip-variant content pattern (1 invocation × N cantrips = N feats) is intentionally simple. A future multi-pick invocation — Pact of the Tome lets the warlock pick 3 cantrips — will need a real `ChoiceResolved`-cascade mechanism in `applyChoiceResolved` (so a resolved option's effects can install follow-up PendingChoices for nested OfferChoices in the granted feat's effects). The per-variant pattern doesn't scale to multi-pick combinatorics. Tracked.

**Audit:**
- *RAW match*: any of the 3 warlock damage cantrips can now be chosen as the Agonizing Blast target. Repeatability is across variants (the warlock could pick a different cantrip's variant at a later tier).
- *Names*: feat id `agonizing-blast-<cantrip-id>` is the established sibling-feat pattern (parallel to `magic-initiate-{cleric,druid,wizard}`).
- *DRY*: each variant feat is one AddModifier; the only field that differs is the spellId in the condition.
- *SRP*: each variant does one thing — gate the CHA-mod fold on one cantrip's id.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: schema shape, OfferChoice shape, per-variant projection isolation (each variant fires only for its named cantrip).

**Pattern-check**: the renamed feat id propagated symmetrically into slice-510 + slice-511 (sed across both test files; one assertion's `repeatable` flag flipped from `true` to `false` since per-variant feats don't repeat). Any future invocation with a single-pick parameter (Whispers of the Grave's chosen-language, Mask of Many Faces' chosen alternate form when added) can mirror this per-variant content pattern without engine work.

**Engine + content (slice 511): `GrantFeat` primitive + refactor Agonizing Blast as a Feat content row**

Adds the indirection primitive that makes the Warlock invocation catalog (and any future "feat-as-content" cohort) scale cleanly. Before this slice each invocation's effects would have to be inline-duplicated in every tier OfferChoice's option list — for the Warlock's 8 tiers and ~30 invocations that's a quadratic content explosion. After this slice each invocation is a single Feat row; each tier OfferChoice's option just grants the feat by id.

**Engine:**
- New `GrantFeat { featId: string }` effect kind ([src/schemas/effects.ts](src/schemas/effects.ts) — added to union, Zod, and `EFFECT_KINDS`). Indirection primitive: lets an effect projection include another Feat's effects by id.
- New `expandGrantFeatEffects(effects, content, visited?)` helper in [src/derive/effect-stack.ts](src/derive/effect-stack.ts): walks an effects array, recursively replaces each `GrantFeat { featId }` with the referenced feat's expanded effects, with cycle protection (visited set; a feat that transitively grants itself is broken at the second visit). Unknown `featId` references are silently dropped (graceful degradation).
- Wired into `buildEffectStack` at every source loop (species, background, class, feat, item, monster, resolved-choice) AND into `collectEffectsFromCharacter`. The builder switch treats raw `GrantFeat` as a no-op so any path that bypasses expansion degrades gracefully.
- `category: 'invocation'` added to the FeatSchema enum (mirror of the existing `'origin'` / `'general'` / `'fighting-style'` / `'epic-boon'` values).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `agonizing-blast` Feat (category: 'invocation', repeatable: true, prerequisites: `['Warlock', 'Eldritch Blast cantrip']`) with the inline `AddModifier(damage, CHA-mod)` gated on `event.spellId == eldritch-blast`. Moved verbatim from the slice-510 inline option.
- Warlock L1 `eldritch-invocations-2` OfferChoice option's effects: `[AddModifier ...]` → `[{ kind: 'GrantFeat', featId: 'agonizing-blast' }]`. **Behavior identical to slice 510 end-to-end** (the slice-510 test continues to pass without modification); only the wire shape changed.

**Doc-count update** (CI-guarded): `EFFECT_KINDS` 56 → 57 (55 → 56 primitives + `Custom`). Updated [docs/authoring-content-packs.md](docs/authoring-content-packs.md) + [docs/concepts.md](docs/concepts.md).

**Documented deferral**: the per-cantrip generalization (RAW Agonizing Blast lets the warlock pick any known Warlock damage cantrip, not just Eldritch Blast) stays open. Modeling it needs either (a) a `ChoiceResolved`-cascade mechanism in `applyChoiceResolved` (so a resolved option's effects can install follow-up PendingChoices for nested OfferChoices in the granted feat's effects), or (b) a parameterized invocation shape (the OfferChoice option carries a cantrip-id parameter the feat reads). Both are architectural decisions worth a dedicated design slice. The `GrantFeat` indirection this slice ships is the necessary precondition for either path.

**Tests** at [tests/unit/engine/slice-511-grant-feat.test.ts](tests/unit/engine/slice-511-grant-feat.test.ts) - 6 cases: the pack ships Agonizing Blast as a Feat with the expected inline effects; the warlock L1 OfferChoice option uses `GrantFeat` (not inline effects); `expandGrantFeatEffects` recursively resolves a `GrantFeat` to the feat's effects; the expansion breaks self-referential cycles via the `visited` set; an unknown `featId` is dropped gracefully (no throw); end-to-end the warlock's effect stack projects the AddModifier through the choice → GrantFeat → expansion → builder chain.

**Audit:**
- *RAW match*: behavior identical to slice 510 (CHA-mod added to Eldritch Blast damage rolls when the invocation is picked). The hardcoded-to-Eldritch-Blast deviation is unchanged and documented above.
- *Names*: `GrantFeat` parallels `GrantSpell` (indirection by id). `expandGrantFeatEffects` is intention-revealing.
- *DRY*: the expansion lives in one place; every source loop in `buildEffectStack` wraps its effects with the same helper.
- *SRP*: the helper does one thing (recursive expansion); the schema entry is one new effect kind.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: schema shape, content shape, expansion semantics (happy / cycle / unknown), end-to-end projection.

**Pattern-check**: every effect-source loop in `buildEffectStack` got the same expansion wrapper — species, background, class, feat, item, monster, AND resolved-choice. The builder switch's no-op for `GrantFeat` is a safety net for any path that bypasses expansion (the conditions loop currently doesn't expand — conditions don't reference invocation feats today, and the no-op preserves correctness).

**Engine + content (slice 510): Warlock L1 Eldritch Invocations choice mechanism + Agonizing Blast canonical user + `event.spellId` damage fact**

Opens the Warlock invocations arc. The L1 `eldritch-invocations-2` feature was an `effects: []` stub; now ships an `OfferChoice oneOf: 1` whose first option is **Agonizing Blast** with inline effects (`AddModifier target:'damage' value:abilityMod-CHA condition: eq event.spellId 'eldritch-blast'`). Additional invocations are future content slices; this one establishes the wire shape.

RAW (SRD 5.2.1 Warlock L1 Eldritch Invocations): "You gain one invocation of your choice."
RAW (Agonizing Blast invocation): "Choose one of your known Warlock cantrips that deals damage. You can add your Charisma modifier to that spell's damage rolls."

**Engine** ([src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- Added `event.spellId: spell.id` to BOTH the attack-mechanic and save-mechanic damage-facts maps (lines ~441 and ~632), enabling per-spell damage riders via `AddModifier ... condition: eq event.spellId '<id>'`. Mirror of how slice 359 added `event.spellSchool` for Empowered Evocation.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Warlock L1 `eldritch-invocations-2`: `effects: []` → single `OfferChoice oneOf: 1` over options `[{ agonizing-blast → AddModifier(damage, CHA-mod) gated on eldritch-blast }]`.

**Documented RAW deviations (this first ship):**
- The invocation is wired statically to Eldritch Blast. RAW lets the warlock pick any known Warlock damage cantrip; modeling that needs an inner sub-choice inside the option (an OfferChoice within an OfferChoice option's effects, or a `damageBoostsSpell` parameterized field). Deferred. Eldritch Blast is the only Warlock-class-listed damage cantrip in the pack, so the deviation rarely matters in practice.
- The full invocation catalog (Mask of Many Faces, Devil's Sight, Pact of the Tome/Blade/Chain, etc.) is a multi-slice content authoring effort; this slice ships only the L1 choice mechanism + Agonizing Blast.
- The L1 feature is still named `eldritch-invocations-2` ("(2 known)") — off-by-one from RAW (L1 grants 1, not 2). Renaming has blast radius across the slice-377 drift audit and content references; left for a separate cleanup slice. The `OfferChoice oneOf: 1` correctly grants 1 invocation regardless of the misleading name.

**Tests** at [tests/unit/engine/slice-510-agonizing-blast.test.ts](tests/unit/engine/slice-510-agonizing-blast.test.ts) - 4 cases: the L1 feature ships the OfferChoice with Agonizing Blast as the first option; a warlock who picks Agonizing Blast adds +4 CHA-mod to Eldritch Blast damage (verified via both `modifierSum` on the effect stack with `event.spellId` facts AND end-to-end via DamageRolled.rolls[0].modifier === 4); a warlock who has NOT picked the invocation deals no extra damage; the invocation does NOT add CHA-mod to other cantrips (gated on spellId, fire-bolt unaffected).

**Audit:**
- *RAW match*: 1 invocation choice at L1; Agonizing Blast adds CHA-mod to Eldritch Blast damage rolls. The hardcoded-Eldritch-Blast vs. per-cantrip-choice is the documented deviation.
- *Names*: `event.spellId` mirrors `event.spellSchool` / `event.damageType` (existing per-spell-property fact pattern).
- *DRY*: reuses the existing AddModifier + condition + modifierSum chain (precedent: Empowered Evocation slice 359). The OfferChoice option is inline; future invocations will inline-duplicate effects too unless a `GrantFeat` primitive ships first to deduplicate.
- *SRP*: `event.spellId` is one field on two facts maps; the invocation is one inline effect on one option.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: feature shape, effect-stack `modifierSum` projection (both matching and non-matching spellId), end-to-end damage delta with/without the invocation.

**Pattern-check**: both damage paths in cast-spell.ts (attack + save) got the new `event.spellId` fact symmetrically. Any future per-spell damage rider (e.g., Bloodbond Hex variants) can gate on it. No regression: existing AddModifier predicates that don't reference `event.spellId` evaluate identically.

**Docs (slice 509): strike two more stale L1-feature notes (Bardic Inspiration formula + Barbarian L1 Weapon Mastery)**

Pattern-check sweep continuing from slice 504's stale-stub discoveries. Two more notes in [docs/gaps-class-features.md](docs/gaps-class-features.md) describe gaps that no longer exist:
- **Bardic Inspiration use-count formula** claimed "still hardcoded at 3 instead of CHA-mod-with-floor-1." The L1 `bardic-inspiration` feature actually ships `GrantResource.max = max(1, abilityMod CHA)` — exactly RAW.
- **Barbarian L1 Weapon Mastery** claimed "not in the current pack — the L1 row only ships Rage + Unarmored Defense." Closed by slice 378 (noted at the top of the same doc, but this open-item line wasn't struck). The Barbarian L1 features array ships `weapon-mastery-barbarian` with `GrantWeaponMastery` (slots: 2, all 8 RAW masteries), enforced by the slice-502 gate.

Both notes struck with closed-by annotations. Pure docs slice — no engine / content / test changes.

**Content + test (slice 508): Skilled origin feat — wire the 3-pick OfferChoice over 18 skills + 37 tools**

Closes the last gettable L1 origin-feat gap. The `skilled` feat previously shipped `effects: []` (a no-op stub) — content authoring with no engine block. Now ships an `OfferChoice` with `oneOf: 3` over 55 options (18 skills + 37 tools, each option granting `GrantProficiency` for the picked target).

RAW (SRD 5.2.1 Skilled, Origin Feat, Repeatable): "You gain proficiency in any combination of three skills or tools of your choice."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- `skilled` feat: `effects: []` -> single OfferChoice with `oneOf: 3, options: [...18 skill + 37 tool...]`. Each option's effects array is one `GrantProficiency` grant for that skill or tool. Pack file grew ~9 KB; JSON parses, schema validates.

**Tests** at [tests/unit/engine/slice-508-skilled.test.ts](tests/unit/engine/slice-508-skilled.test.ts) - 3 cases: the feat ships the OfferChoice with exactly 55 options (18 skills + 37 tools); a mixed pick (1 skill + 2 tools) projects all three proficiencies; a pure-skills pick (3 skills) also projects. Mirror of the slice-215 / slice-506 OfferChoice-resolution template (seed `ChoiceRequired` + `ChoiceResolved`, read `proficiencyLevel` from the effect stack).

**Pure content + test slice — no engine changes.**

**Audit (short):**
- *RAW match*: any-three-from-skills-or-tools, repeatable. `OfferChoice.oneOf: 3` is the engine's standard multi-pick shape (precedent: `magic-initiate-*-cantrips` use `oneOf: 2`, `rogue-expertise-l1/l6` use `oneOf: 2`).
- *Names*: option ids reuse the canonical skill/tool ids already in the pack.
- *DRY*: option list generated mirroring the existing Human Skillful skill-option shape + the pack's tool catalog; no hand-curated copy.
- *Mechanical outcomes asserted*: 18+37 = 55 options shape, mixed-pick projection, all-skills-pick projection.

**Pattern-check**: every other 2024 origin feat shipping in the pack is now either fully wired or correctly using an engine-recognized-by-id pattern (`savage-attacker` via the attack planner's `getEffectiveFeatIds` consumer, like Monk Martial Arts). The remaining feat stubs are deliberately outside L1 scope (general feat `grappler`, 5 epic-boon feats — all L4+/L19+ entries).

**Test + docs (slice 507): Floating Disk — reclassify the last L1 "deferred" entry as consumer-side narrative + lock the cast path**

Closes the last L1 spell formerly classified as "deferred." Floating Disk is misclassified: the *cast* itself works through `planCastSpell` (Action consumes a slot; Ritual doesn't; neither emits mechanical events), but the *disk* is a positional carry-capacity world entity (500-lb capacity, follows the caster within 20 ft, can't cross 10-ft elevation changes, falls off when overloaded) that the engine explicitly doesn't model per the no-positions stance. It belongs in the narrative bucket alongside the other consumer-side utility spells, not in the deferred queue.

RAW (SRD 5.2.1 Floating Disk, L1 Wizard Conjuration, Action or Ritual, 30 ft range, 1 hour, NOT concentration, IS ritual): see the spell text in [references/srd-markdown/spells.md](references/srd-markdown/spells.md).

**No engine or content changes** — pure reclassification + cast test.

[tests/unit/engine/slice-507-floating-disk.test.ts](tests/unit/engine/slice-507-floating-disk.test.ts) - 3 cases: the spell ships `mechanicalEffects: []` (ritual: true, concentration: false); cast as Action consumes a spell slot and emits no downstream effect events (no ConcentrationStarted / DamageApplied / SaveRolled / AttackRolled / ConditionApplied); cast as Ritual does NOT consume a slot and similarly emits no downstream events. spell-coverage skip reason updated to point at this file.

**Doc-count update**: L1 row 44 wired / 12 narrative / 1 deferred -> 44 wired / 13 narrative / 0 deferred. Headline 196 wired / 69 narrative / 74 deferred -> 196 wired / 70 narrative / 73 deferred. **The L1 spell surface is now formally complete: 0 deferred entries.** Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Documented RAW deviations (consumer-managed, never engine-modeled)**: the disk's 500-lb capacity, the follow-the-caster behavior (immobile within 20 ft of caster; follows when caster moves > 20 ft away), the 10-ft elevation gate, and the fall-off-when-overloaded behavior all stay engine-out-of-scope, consistent with the "engine doesn't model positions" stance ([CLAUDE.md](CLAUDE.md)).

**Test (slice 506): Cleric L1 Divine Order — lock both sub-feature projections via PendingChoice resolution**

Closes the slice-504 tracked follow-up: Divine Order was already wired as an `OfferChoice` (Protector / Thaumaturge), but no test pinned the projection of each chosen sub-feature.

[tests/unit/engine/slice-506-divine-order.test.ts](tests/unit/engine/slice-506-divine-order.test.ts) seeds the `ChoiceRequired` + `ChoiceResolved` pair (mirror of the slice-215 [druid-primal-order.test.ts](tests/unit/engine/druid-primal-order.test.ts) template) and asserts:
- **Protector**: `proficiencyLevel('weapon', 'martial')` and `('armor', 'heavy')` both resolve to `'proficient'`; no Guidance grant.
- **Thaumaturge**: `grantedSpells()` lists `guidance` (always-prepared); `computeAbilityCheck` returns the expected totals — Arcana (INT) = 0 + WIS(+3) + sage PB(+2) = 5; Religion (WIS) = WIS(+3) + WIS(+3) = 6. Martial / heavy-armor proficiency NOT granted.

Doc: [docs/gaps-class-features.md](docs/gaps-class-features.md) — slice-504's "Open follow-up" line struck with a closed-by annotation referencing the new test file.

Pure test slice — no engine or content changes.

Per-slice detail for slices 501-505 (Shillelagh + `weapon-buff` mechanic; Ensnaring Strike + `largeCreatureAdvantage` + `extraDicePerSlotLevel`; Weapon Mastery enforcement; Rogue Thieves' Cant stale-stub sweep; Wizard Ritual Adept marker promotion) is archived at [docs/changelog/archive-slices-501-505.md](docs/changelog/archive-slices-501-505.md) (slice 511, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 496-500 (zone-cohort sweep: Silence / Move Earth / Reverse Gravity / Earthquake; Ice Knife + `targetScope`; Sorcerous Burst + `explodeOnMaxDie`; Goodberry + `create-item` + inventory grant; Animal Friendship + `targetCreatureType` + `conditionEndsOnDamage`) is archived at [docs/changelog/archive-slices-496-500.md](docs/changelog/archive-slices-496-500.md) (slice 503, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 491-495 (Boar Gore + `event.attackerChargedThisTarget`; Web Walker + `restrained-by-web`; Death Dog disease + RecurringSave `'longRest'`; True Strike + `weaponAttack`; the positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness) is archived at [docs/changelog/archive-slices-491-495.md](docs/changelog/archive-slices-491-495.md) (slice 499, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 487-490 (non-spellcaster Magic Initiate cast path; Cockatrice Petrifying Bite + `escalateToCondition`; Hippogriff Flyby + `MovementMode`; Stirge Blood Drain) is archived at [docs/changelog/archive-slices-487-490.md](docs/changelog/archive-slices-487-490.md) (slice 494, to keep this file under the 60 KB single-Read ceiling).

Per-slice detail for slices 482-486 (Animated Armor / Death Dog Multiattacks, Boar Bloodied Fury, Worg Bite + `consumeOnIncomingAttack`, Magic Initiate Druid, once-per-long-rest free-cast tracker) is archived at [docs/changelog/archive-slices-482-486.md](docs/changelog/archive-slices-482-486.md) (slice 490, to keep this file under the 60 KB single-Read ceiling).
Per-slice detail for slices 472-481 (the post-alpha.15 iconic-encounter content sweep: Scout / Cultist / Spy / Pack Tactics / Giant Spider+Centipede / Hippogriff / Brown Bear / Black Bear / Pirate Multiattacks and weapons) is archived at [docs/changelog/archive-slices-472-481.md](docs/changelog/archive-slices-472-481.md) (slice 487, to keep this file under the 60 KB single-Read ceiling).

## 0.1.0-alpha.15 - 2026-05-26

**Release (slice 471): bump to 0.1.0-alpha.15**

Promotes the post-alpha.14 cohort (slices 437-470) to a tagged release. `package.json` bumped from `0.1.0-alpha.14` to `0.1.0-alpha.15`; `package-lock.json` updated to match. `SCHEMA_VERSION` stays 1: the cohort's two persisted-shape touches (slice 467 added `turnUsage.savageAttackerUsedThisTurn`, slice 468 added the `InitiativeSwapped` event) are both purely additive with safe defaults, so old saves parse unchanged. The full suite is green; doc-counts + doc-links + doc-size audits all pass.

Cohort, in two arcs:

- **Infra + docs sustainability (437-443):** the active-cycle CHANGELOG invariant that finally stopped the split-treadmill (437, `58.9 KB -> 9.5 KB` by evicting eight frozen release narratives to the per-range archives), the doc-links audit blind-spot fix for empty hrefs that the bulk re-rooting briefly produced (437 also), the broken-link fix in CLAUDE.md (438), the case-only link-mismatch hardening (439), documenting the PR-based `dev` -> `main` integration as standard (440), de-numbering the stale "Layer N" test labels (441), cutting CI turnaround from ~7 min per push to fast per-slice feedback (442), and syncing CLAUDE.md's branch section for fresh-agent readiness (443).
- **L1 playability arc (444-470):** the level-by-level direction shift. Three batches landed: species trait sweep (444-465) - Halfling Brave, Elf Fey Ancestry + Keen Senses, Darkvision / Dwarven Resilience / Gnomish Cunning, Rogue Thieves' Cant + Sprite natural weapons, Wolf / Dire Wolf / Brown Bear / Mastiff knock-prone, Goblin Nimble Escape, Zombie Undead Fortitude, Wizard Ritual Adept, Orc Adrenaline Rush + Relentless Endurance, Kobold Sunlight Sensitivity + the Undead sunlight sweep, Sprite + Ghoul Bite natural weapons, Cleric Turn Undead, monster Multiattack content declaration (canonical user: Ghoul), Human Skillful, Goliath species (closing the last empty playable species); background mechanics (466-469) - backgrounds auto-project their Origin Feat + Sage RAW correction (466), Savage Attacker (467, the Soldier mechanic), Alert (468, the Criminal mechanic), Magic Initiate (Cleric / Wizard) (469, the Sage / Acolyte mechanics); plus CHANGELOG cohort archives (454 → slices 444-450, 460 → slices 451-459, 470 → slices 460-468). Net result: every L1 species has wired traits, every L1 class feature is wired, every 2024 SRD background lights up end-to-end (proficiencies + Origin Feat mechanics) through the slice-466 auto-projection, and the monster Multiattack primitive is shipped for the next-arc encounter sweep.

Per-slice detail for the whole cohort is in the per-cohort archives under [docs/changelog/](docs/changelog/):
- [archive-slices-444-450.md](docs/changelog/archive-slices-444-450.md) (L1 arc part 1)
- [archive-slices-451-459.md](docs/changelog/archive-slices-451-459.md) (L1 arc part 2)
- [archive-slices-460-468.md](docs/changelog/archive-slices-460-468.md) (L1 arc part 3 - background mechanics)
- The pre-arc infra slices (437-443) plus slices 461 + 469-470 remain on the live release narrative below; future archive slices will continue to evict cohorts as they age.

**Content (slice 469): Magic Initiate x 2 (Cleric + Wizard) - Sage and Acolyte light up end-to-end**

The final pair of Origin Feats. After slice 466's auto-projection (background -> effective feat list -> effect stack) and slices 467 / 468's mechanic wiring for Savage Attacker / Alert, the only remaining "background ships with no effect" rows were Sage and Acolyte, both pending their Magic Initiate origin feats. This slice closes both with a pure-content slice: no engine work beyond what the slice-212 `GrantSpell` consumer already does.

RAW (SRD 5.2.1 Magic Initiate):
- **Two Cantrips**: "Learn two cantrips of your choice from the Cleric, Druid, or Wizard spell list."
- **Level 1 Spell**: "Choose a level 1 spell from the same list... You always have that spell prepared. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have."
- **Repeatable**: different list each time. The pack already ships separate `magic-initiate-cleric` / `magic-initiate-wizard` feats, one per list; each background's Origin Feat fixes the list (Acolyte -> Cleric list, Sage -> Wizard list).

**Each feat ships two OfferChoice traits** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)), `when: 'onAcquire'`, each carrying `GrantSpell` per option:
- Cantrip OfferChoice (`oneOf: 2`): over the full SRD list for that class (7 Cleric, 15 Wizard). `preparation: 'always-prepared'` so the chosen cantrips appear on the bearer's effective spell list and can be cast at-will via the existing `cast-spell` planner.
- L1 OfferChoice (`oneOf: 1`): over the full SRD L1 list (15 Cleric, 30 Wizard). `preparation: 'oncePerLongRest'` — the slice-219 marker for "free cast" semantics. The spell still appears on `effectiveSpellList` so it's also castable using slots per RAW; the once-per-long-rest gate is consumer-tracked (same sibling-deferral as the slice-353 Warlock Contact Patron and slice-219 Cleric Divine Intervention).
- `spellcastingAbility`: hard-coded to the canonical default per RAW (`WIS` for Cleric list, `INT` for Wizard list). The player's choice across INT/WIS/CHA is deferred as a future refinement; for the auto-projected origin-feat path, the canonical default is the right out-of-the-box behavior.

**End-to-end through the background pipeline**: a consumer building an Acolyte / Sage character does **not** seed `featsTaken`. The slice-466 auto-projection delivers `magic-initiate-cleric` / `magic-initiate-wizard` to the effect stack from the background's `originFeatId`. The OfferChoice surfaces a pending choice on character acquisition; the consumer resolves it; the GrantSpell entries land on the bearer's `grantedSpells()` accumulator + `effectiveSpellList`.

**Tests** at [tests/unit/engine/slice-469-magic-initiate.test.ts](tests/unit/engine/slice-469-magic-initiate.test.ts) — 7 cases: (1, 2) Acolyte without choices resolved has no granted spells, Acolyte who picks Sacred Flame + Guidance + Cure Wounds has them granted with the right preparation modes and WIS ability; (3) the L1 spell appears on `effectiveSpellList` (castable via slots); (4, 5) Sage equivalents for Wizard list with INT ability; (6, 7) catalog-conformance checks pinning the OfferChoice shapes to the SRD list sizes (7 / 15 cleric, 15 / 30 wizard) so any future spell add / remove that walks past the catalog fails the audit.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Magic Initiate exactly. The cantrip + L1 spell selection arms ship via OfferChoice over the full SRD lists. The "Spell Change at each level" arm (replace one chosen spell on level-up) is deferred — needs a `when: 'onLevelUp'` mode for OfferChoice the engine supports today but the SRD-replace shape is not yet conveyed by the OfferChoice schema. The free-cast-per-long-rest gate is consumer-tracked, matching the established pattern from slices 219 + 353.
- *Names*: `magic-initiate-cleric-cantrips` / `magic-initiate-cleric-l1` (and Wizard variants) mirror the existing `wizard-scholar` / `rogue-expertise-l1` / `rogue-expertise-l6` choice-id naming (subject-feature-variant).
- *DRY*: a single helper in the generator script produces both feats' OfferChoice arrays from the same SRD lists; the pack carries the resulting JSON inline so there's no runtime indirection.
- *SRP*: feat ships the choice surface; OfferChoice + GrantSpell are the existing primitives; `effectiveSpellList` does the union; no engine code touched.
- *Magic numbers*: only the `oneOf: 2` and `oneOf: 1` per RAW; the cantrip / spell counts are content-driven from the SRD lists.
- *Mechanical outcomes asserted*: no-choice-resolved -> no grants; chosen cantrips -> always-prepared; chosen L1 -> oncePerLongRest; spellcasting ability matches list (WIS / INT); spells appear on `effectiveSpellList`; OfferChoice shapes match the SRD list sizes.

**Closes the L1 background arc.** Every 2024 SRD background that ships in the starter pack (Soldier, Sage, Criminal, Acolyte) now lights up end-to-end: ability-score options, skill / tool proficiencies, languages, and Origin Feat mechanics. A consumer building any of the four with default `featsTaken: []` gets the RAW behavior automatically through the slice-466 auto-projection.

**Open follow-ups:**
- ~~**Once-per-long-rest free-cast gate**: a per-feat resource the engine auto-tracks (granted via the GrantSpell `oncePerLongRest` preparation, consumed by a cast with `noSlotCost: true`) would close the consumer-responsibility gap for Magic Initiate's L1-spell free cast, Warlock Contact Patron, and any other future once-per-long-rest cast. Sibling primitive opportunity.~~ **Closed by slice 486.**
- **Spell Change at level-up** (RAW: "Whenever you gain a new level, you can replace one of the spells you chose for this feat"): needs an OfferChoice mode that exposes a "replace one of your prior selections" semantic on level-up. The schema's `when: 'onLevelUp'` is there but the replace-prior-pick shape isn't expressed. *Still open.*
- **spellcastingAbility player choice** (RAW: pick INT/WIS/CHA at feat acquisition): a third OfferChoice on each feat over the three abilities, with each option re-projecting the GrantSpell entries with that ability. Deferred for now; the canonical defaults match the linked backgrounds' ability options. *Still open.*
- ~~**Magic Initiate (Druid)**: not currently in the pack as a feat; would mirror the Cleric / Wizard wiring over the Druid list once that list is fully present.~~ **Closed by slice 485.**

**Docs (slice 470): archive slices 460-468 (L1 background-mechanics arc) to free CHANGELOG headroom**

Pure CHANGELOG-archive operation. The live CHANGELOG had reached 62 KB after the slice-466 / 467 / 468 / 469 background arc — over the comfortable single-Read threshold. Moved the nine-slice cohort 460-468 to [docs/changelog/archive-slices-460-468.md](docs/changelog/archive-slices-460-468.md), continuing from [docs/changelog/archive-slices-451-459.md](docs/changelog/archive-slices-451-459.md) (L1 arc part 2). Slice 469 stays inline as the most-recent slice. Live CHANGELOG drops to ~25 KB; archive holds the full per-slice detail with sibling-rooted links (`../../src/...`, `../../tests/...`). Archive index in [docs/changelog/README.md](docs/changelog/README.md) updated.

**Docs (slice 443): sync CLAUDE.md's branch section to the PR flow (fresh-agent readiness)**

CLAUDE.md is the auto-loaded manual a fresh agent reads first, but its "Branch structure" still described the old "user merges `dev` into `main` on his cadence" local-merge framing and never mentioned the PR-based integration adopted in slice 440 (only DEVELOPMENT.md did). A fresh agent would get the correct "don't push without instruction" rule but a stale mental model of *how* integration happens. Updated [CLAUDE.md](CLAUDE.md) "Branch structure" to state `dev` integrates into `main` only through a CI-gated PR (with the `gh pr create` command + the per-push-vs-PR-gate split from slice 442), pointing to DEVELOPMENT.md for the full flow; broadened the git-safety line to "don't push, open a PR, or merge to `main` without instruction." Also fixed a stale parallel-authoring summary line that said "engine on `main`" (contradicting the dev-only rule; the underlying parallel-authoring.md was corrected in slice 433 but this CLAUDE.md summary wasn't). Pattern-checked the front-door docs for other local-merge framing: none remain. No code/content/public-surface change.

**Infra (slice 442): cut CI turnaround (~7 min per push -> fast per-slice feedback)**

CI ran a 3-way Node matrix (20/22/24) where every entry did `npm ci` + typecheck + coverage-instrumented suite + build, so the expensive trio ran 3x, with no concurrency cancellation (a re-push left the stale run going). Restructured [.github/workflows/ci.yml](.github/workflows/ci.yml) so the felt per-slice cost drops without weakening the gate on `main`:

- **Fast per-push `test` matrix**: Node 20/22/24 each run `npm test` (`vitest run`, no coverage) on every push/PR. Cross-Node compatibility is still exercised on all three; coverage % is Node-invariant for this no-native-deps library, so it no longer runs 3x.
- **Integration-time `quality` job**: typecheck + coverage (80% thresholds) + build, once on Node 22, gated via `if:` to pull requests and pushes to `main`. Routine `dev` pushes skip it; `main` is never shipped without it (dev -> main is PR-only). The CI coverage run drops the `html` reporter (text + json-summary suffice; thresholds read json-summary); local `npm run test:coverage` still emits html.
- **Concurrency cancellation**: a top-level `concurrency` group keyed on workflow + ref cancels a ref's in-flight run on re-push (no more ~14-min double-waits). Does not affect the deploy-*.yml workflows.
- **Nightly deep fuzz**: new [.github/workflows/nightly-fuzz.yml](.github/workflows/nightly-fuzz.yml) runs the property suite at `FAST_CHECK_NUM_RUNS=1000` on a daily schedule (+ manual dispatch), so deep fuzzing is continuous instead of never-in-CI while per-push fuzz stays at the smoke level (50).
- **`structuredClone` in [tests/property/content-pack-validator.test.ts](tests/property/content-pack-validator.test.ts)**: replaces the `JSON.parse(JSON.stringify())` whole-pack deep clone done each fast-check iteration. Identical semantics on the plain-JSON pack; the file drops from ~43s to ~36s (the per-iteration Zod parse of the full pack, not the clone, is the remaining dominant cost) and the local pre-commit suite benefits too.

Quality is preserved: no tests deleted, coverage thresholds enforced before any merge to `main`, replay / RNG-capture / contract layers all still run, and local pre-commit still runs the full `vitest run` + `tsc` per slice. Documented the per-push-vs-gate split in DEVELOPMENT.md. Deliberately not done (low-risk bundle): test sharding + coverage-merge (the lever for sub-3-min single-run wall-clock, more plumbing) and hardcoding vitest `maxForks` (helps a 4-vCPU runner but can slow many-core local machines). No engine/content/public-surface change.

**Infra (slice 441): de-number the stale "Layer N" test labels (closes the slice-435 follow-up)**

Test-file headers and a few docs carried "Layer N" labels from an older 9+-layer testing scheme that no longer matched CLAUDE.md's current 1-7 Required-layers list (property tests were "Layer 7" and the feature-coverage matrix "Layer 8", but neither is a required layer; replay / RNG were "Layer 5 / 6" but are now 4 / 5). The numbers had drifted twice, so rather than re-number (which re-bitrots on the next reorder) the labels are now **de-numbered** to reference the standard by name. Updated `tests/property/*.test.ts` (7 files), `tests/coverage/features.test.ts`, and the `describe` labels in `tests/golden/{s2-combat-round,replay-equivalence,rng-capture}.test.ts` + `tests/integration/property.test.ts`; reconciled the stale inventory in [docs/status.md](docs/status.md) (was citing "Layers 5-11") and [docs/web-demo-plan.md](docs/web-demo-plan.md) ("Layer 9 contract test"); softened the one CLAUDE.md cross-reference. Left untouched by design: the SRD audit's own internally-consistent "Layer 1-4" scheme ([docs/srd-5.2.1-audit-classes.md](docs/srd-5.2.1-audit-classes.md), a different domain) and the frozen CHANGELOG archives (historical record). Verified the de-numbered `describe` labels carry no snapshot keys (only `tests/coverage/features.test.ts` uses snapshots, and only its comment changed) and the affected tests pass. No code/content/public-surface change.

**Docs (slice 440): document the PR-based dev -> main integration as standard**

Adopted a pull-request integration flow for `dev` -> `main` (replacing the local `git merge` that shipped a broken doc link straight to a red `main` in the slice-438 episode). Updated DEVELOPMENT.md: the "Branches" / "Working flow" now states that `main` is integrated only through a CI-gated PR (`gh pr create --base main --head dev`, merge when green), the branch-from rules note `dev` is the sole branch that integrates into `main` (via PR), and the "Cutting a release" step 7 ships through the PR before tagging on the merged `main`. The git-safety rule is unchanged: the PR process changes *how* `dev` integrates into `main`, not the rule that a human authorizes the push / PR / merge. Doc-only.

**Infra (slice 439): doc-links audit now catches case-only link mismatches**

The third and last of the "passes on a dev Mac, fails on Linux CI / GitHub" link classes (after empty hrefs in slice 437 and repo-escaping links in slice 438). macOS resolves `[x](docs/Status.md)` against the real `docs/status.md` (case-insensitive filesystem), so a wrong-case link passed the audit locally but would 404 on case-sensitive Linux CI and on GitHub. [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) now resolves each within-repo link by walking its path segments and requiring an exact-case match at each level (replacing the case-insensitive `existsSync`); on a mismatch it reports the correct casing (e.g. "case mismatch: should be docs/status.md"). Also dropped a stale unused `statSync` import. Verified it catches both wrong-case directory and wrong-case file segments and still passes clean. No code/content change.

**Fix (slice 438): CI doc-links failure - repo-escaping link in CLAUDE.md**

The doc-links audit failed in CI (but not locally): the project CLAUDE.md linked the global house-style file as `[~/.claude/CLAUDE.md](../../../.claude/CLAUDE.md)`, a path that resolves *above* the repo root. It passed on the dev machine (whose home dir has `~/.claude/CLAUDE.md` at exactly that relative position) but 404s in CI and on GitHub, neither of which can escape the repo. Two fixes: (1) the global config isn't a repo file, so it's now referenced as plain `~/.claude/CLAUDE.md` code text rather than a dead link; (2) hardened [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts) to flag any link resolving above the repo root as broken, deterministically, so a non-portable link can no longer pass locally and fail in CI. Verified the audit catches an injected repo-escaping link and still passes clean. No code/content change.

**Docs (slice 437): make the CHANGELOG sustainable - live file holds only the active cycle**

The live CHANGELOG kept hovering at 57-59 KB despite repeated "splits" because the splits only moved per-slice *detail* to cohort archives while eight frozen release narratives (alpha.6-13, ~84% of the bytes) plus a 33-entry archive index stayed inline forever; each split reclaimed detail but added a pointer, so the floor never dropped. Restructured to an active-cycle-only invariant: the live CHANGELOG now holds only `## Unreleased` + the latest tagged release + a compact "Older releases" pointer (58.9 KB -> 9.5 KB). Evicted the alpha.6-13 release narratives to [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md) and moved the global per-cohort archive index to [docs/changelog/README.md](docs/changelog/README.md), both link-re-rooted and under the ceiling. Codified the rule in CLAUDE.md "Doc size discipline" (on every release, evict the previously-latest release narrative + its cohort pointers; released narratives split by version range as they grow) and added the eviction step to the DEVELOPMENT.md "Cutting a release" checklist. The bulk re-rooting surfaced (and the slice fixed) a blind spot in [tests/audit/doc-links.test.ts](tests/audit/doc-links.test.ts): its link regex required a non-empty href, so an empty `[text]()` link (which renders dead on GitHub, and which the re-rooting briefly produced) slipped through; hardened it to flag empty hrefs. Test-only audit change otherwise; doc-links + doc-size green.


## Older releases

Tagged release `0.1.0-alpha.14` lives in [docs/changelog/released-versions-alpha-14.md](docs/changelog/released-versions-alpha-14.md); `0.1.0-alpha.6` through `0.1.0-alpha.13` live in [docs/changelog/released-versions-alpha-6-13.md](docs/changelog/released-versions-alpha-6-13.md); `0.1.0-alpha.0` through `0.1.0-alpha.5` (the pre-rename `ttrpg-engine-dnd` package, all unpublished from npm in May 2026 on IP-cleanup grounds) live in [docs/changelog/released-versions.md](docs/changelog/released-versions.md). Per-cohort slice-detail archives are indexed in [docs/changelog/README.md](docs/changelog/README.md).
