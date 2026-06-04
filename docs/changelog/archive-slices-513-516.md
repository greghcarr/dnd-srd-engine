# Archive: slices 513-516

This file holds the per-slice changelog detail for slices 513-516, archived from the live CHANGELOG.md in slice 520 to keep that file under the 60 KB single-Read ceiling. Cohort: the post-foundation Warlock invocation content sweep, opening with six L1-eligible invocations + the at-will GrantSpell slot bypass (513), batch 2 Ascendant Step + Gift of the Depths (514), Eldritch Mind + the new `event.isConcentrationCheck` save fact (515), and Repelling Blast + the new `PushTarget` TriggerAction + the `event.source` damage fact + cast-spell trigger dispatch (516).

Picks up where [archive-slices-506-512.md](archive-slices-506-512.md) leaves off.

The global per-cohort archive index lives at [README.md](README.md).

---

**Engine + content (slice 516): Repelling Blast invocation + `PushTarget` TriggerAction + `event.source` damage fact + cast-spell trigger dispatch**

Wires Repelling Blast (warlock invocation: push 10 ft on Eldritch Blast hits). The work touches four engine surfaces, each surgical:

RAW (Repelling Blast): "When you hit a creature with Eldritch Blast, you can push that creature up to 10 feet away from you in a straight line."

**Engine:**
- New **`PushTarget { distanceFeet: number }`** TriggerAction ([src/schemas/effects.ts](../../src/schemas/effects.ts)) + dispatcher branch ([src/engine/triggers/dispatch.ts](../../src/engine/triggers/dispatch.ts)) that emits a `CreaturePushed` event targeting the triggering event's target (`AttackRolled` and `DamageApplied` both carry `targetId`). The engine doesn't model positions; the event is informational for consumers to apply the position change.
- New **`event.source`** fact added to DamageApplied trigger facts ([src/engine/triggers/dispatch.ts](../../src/engine/triggers/dispatch.ts) `buildEventFacts`). The `source` field is already on the event (set by cast-spell to the spell id for spell damage); the fact surfaces it to predicates so per-spell on-hit riders can gate on it (canonical user here: `eq event.source 'eldritch-blast'`).
- **Cast-spell now dispatches OnEvent triggers** on the spell-attack `DamageApplied` it emits ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts) `planAttackMechanic`). Mirrors the resolveAttack damageTriggers dispatch in attack.ts. Previously OnEvent riders attached to spell-cast damage (anything granted via GrantFeat / OnEvent on the caster's effect stack) never fired because cast-spell built its own DamageApplied events without invoking the trigger dispatcher.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `repelling-blast` Feat (category: 'invocation', repeatable: false). Single OnEvent: trigger on DamageApplied where `sourceIsSelf` + `source == 'eldritch-blast'`; action `PushTarget distanceFeet: 10`.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 12 → 13.

**Doc-count update**: feats 30 → 31 (13 invocation feats). Features snapshot gains `invocation:repelling-blast`.

**Documented RAW deviation (minor)**: RAW says "when you hit" — engine fires post-damage (the trigger event is DamageApplied, not AttackRolled-then-DamageApplied). RAW doesn't specify damage-vs-push ordering, so the outcome (target damaged + pushed) is the same.

**Tests** at [tests/unit/engine/slice-516-repelling-blast.test.ts](../../tests/unit/engine/slice-516-repelling-blast.test.ts) - 4 cases: feat ships the expected OnEvent shape; a warlock with Repelling Blast hitting with Eldritch Blast emits `CreaturePushed targetId distanceFeet: 10 sourceCharacterId`; a warlock WITHOUT the invocation doesn't push on EB hits; a warlock WITH Repelling Blast casting fire-bolt does NOT push (gated on `event.source == eldritch-blast`).

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

**Engine** ([src/derive/save.ts](../../src/derive/save.ts), [src/engine/plan/concentration.ts](../../src/engine/plan/concentration.ts)):
- `ComputeSaveInput` gains an optional `isConcentrationCheck?: boolean` field. When true, the SetAdvantage condition facts include `event.isConcentrationCheck: true` (else false).
- `planConcentrationBreakOnDrop` passes `isConcentrationCheck: true` to `computeSavingThrow`. All other CON-save callers (spell saves, recurring-save planners, etc.) leave it false. Safe addition: no existing predicate references this fact, so behavior is unchanged for every save except the new gated Eldritch Mind one.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `eldritch-mind` Feat (category: 'invocation', repeatable: false). Single effect: `SetAdvantage on: { kind: 'save', ability: 'CON' } mode: 'advantage' condition: eq event.isConcentrationCheck true`.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 11 → 12.

**Doc-count update**: feats 29 → 30 (12 invocation feats). Features snapshot gains `invocation:eldritch-mind`.

**Tests** at [tests/unit/engine/slice-515-eldritch-mind.test.ts](../../tests/unit/engine/slice-515-eldritch-mind.test.ts) - 4 cases: feat shape; a warlock with Eldritch Mind gets advantage on a concentration CON save but NOT on an ordinary CON save (the condition fires correctly per-fact); a warlock without the invocation gets NO advantage on the concentration save; L1 OfferChoice exposes Eldritch Mind.

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

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- 2 new Feat rows (category: 'invocation', repeatable: false), one and two effects respectively.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 9 → 11.

**Doc-count update**: feats 27 → 29 (11 invocation feats). Features snapshot gains 2 new wired feat ids. Slice-513's "exactly 9" assertions relaxed to subset checks (added invocations are still PRESENT, but other slices may add more).

**Documented RAW deviation**: Gift of the Depths' "breathe underwater" arm is consumer-managed (engine doesn't model breathing/drowning); the swim speed + once-per-rest Water Breathing cover the mechanically-load-bearing parts.

**Tests** at [tests/unit/engine/slice-514-warlock-invocations-batch-2.test.ts](../../tests/unit/engine/slice-514-warlock-invocations-batch-2.test.ts) - 5 cases: pack ships 11 invocation feats (slice 513's 9 + 2 new); warlock L1 OfferChoice exposes both; Ascendant Step grants Levitate at-will; Levitate casts without consuming a slot (at-will bypass); Gift of the Depths sets swim speed = walk speed (30 ft for human) AND grants Water Breathing oncePerLongRest.

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

**Engine** ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- The cast pathway's `noSlotCost` gate now also fires when the bearer has an `at-will` `GrantSpell` for the cast spell id (mirror of the existing `useFreeCast` and `intent.noSlotCost` arms). Detection: walk the caster's `buildEffectStack(...).grantedSpells()` for any entry whose `spellId` matches and `preparation === 'at-will'`. Cantrips short-circuit (already bypass slots). **Previously**: `preparation: 'at-will'` was schema-recognized but not load-bearing — the cast still consumed a slot unless the consumer explicitly passed `noSlotCost: true`. **Now**: any at-will-granted spell casts free. Safe addition: zero existing at-will GrantSpell content in the pack before this slice (verified), so no regression.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- 6 new Feat rows (above), all `category: 'invocation'`, `repeatable: false`, prerequisites name the relevant prereq (e.g., "Warlock"). Effects are one each (GrantSpell at-will or GrantSense).
- Warlock L1 `eldritch-invocations-2` OfferChoice's options: 3 → 9 (added one GrantFeat option per new invocation).

**Doc-count update**: `getting-started.md` feats total 21 → 27 (9 invocation feats now). Features snapshot gains 6 new wired feat ids.

**Documented RAW deviations:**
- **Devil's Sight**: the "see through magical darkness" arm is not modeled (the engine has no magical-darkness obscurement enforcement to bypass). Standard 120 ft darkvision IS granted, which is the load-bearing arm for sight-in-dim-light scenarios.
- **Mask of Many Faces / Misty Visions / Disguise Self illusion arms**: the perception-vs-illusion mechanic is consumer-managed (no engine model for "the illusion is detected on close inspection / a successful Investigation check").
- **The L2+ warlock invocation tiers (eldritch-invocations-3 through -9)** still ship `effects: []`. A warlock at L2 with only the L1 OfferChoice wired knows 1 invocation, not the RAW 2. Per-tier wiring is a separate content slice each; the L1 OfferChoice expansion this slice ships is the L1-only fix.

**Tests** at [tests/unit/engine/slice-513-warlock-invocations-batch.test.ts](../../tests/unit/engine/slice-513-warlock-invocations-batch.test.ts) - 10 cases: pack ships exactly 9 invocation feats; warlock L1 OfferChoice exposes all 9; each of the 5 new at-will GrantSpell invocations projects its `GrantSpell preparation: 'at-will'` into the bearer's effective spell list (table-driven `it.each`); Devil's Sight grants 120 ft darkvision via `senseRange`; **end-to-end the at-will slot bypass works** (a warlock with Armor of Shadows casts Mage Armor with no `SpellSlotConsumed` / `PactSlotConsumed` event); control case (warlock without the invocation casting Mage Armor via knownSpells consumes a slot as normal).

**Audit:**
- *RAW match*: each invocation grants what RAW says. Deviations documented above.
- *Names*: feat ids match the canonical invocation names (kebab-case).
- *DRY*: all 5 at-will spell invocations are one-line GrantSpell rows; the cast-spell engine extension is one ~10-line block at the existing `noSlotCost` derivation site.
- *SRP*: each invocation does one thing; the engine extension does one thing (detect at-will → bypass slot).
- *Magic numbers*: 120 (Devil's Sight darkvision range) is RAW.
- *Mechanical outcomes asserted*: catalog shape, OfferChoice shape, per-invocation projection, sense range, slot-bypass end-to-end, control case.

**Pattern-check**: the at-will slot bypass mechanism generalizes to any future invocation or feat granting an at-will spell (Magic Initiate's `oncePerLongRest` was the only previous "free-cast"-style flag; `at-will` was schema-only). The 5 sibling at-will invocations all use the same one-effect Feat shape — any future at-will-spell invocation (Ascendant Step → Levitate, Eldritch Sight → Detect Magic, etc.) is one content row + one OfferChoice option. The L2-L18 OfferChoice tiers staying stubbed is the next-cohort content sweep work.
