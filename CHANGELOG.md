# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 519): Pact of the Chain invocation + `GrantPactChain` marker + at-will Find Familiar free-cast**

Wires the third L1 Pact boon. Pact of the Chain authors two effects on the same feat: `GrantSpell find-familiar 'at-will'` (CHA spellcasting ability) and the new `GrantPactChain` presence marker. Slice 513's at-will + free-cast pathway makes the granted Find Familiar slot-free. The marker is the gate for any future Chain-specific surface (special-form enforcement, the "forgo one Attack-action attack" reaction arm) without disturbing the feat-side authoring. **This completes the five strict-RAW L1 Warlock invocations** (Armor of Shadows, Eldritch Mind, Pact of the Blade, Pact of the Chain, Pact of the Tome).

RAW (Pact of the Chain): "You learn the _Find Familiar_ spell and can cast it as a Magic action without expending a spell slot. When you cast the spell, you choose one of the normal forms for your familiar or one of the following special forms: **Imp, Pseudodragon, Quasit, Skeleton, Sphinx of Wonder, Sprite,** or **Venomous Snake**... when you take the Attack action, you can forgo one of your own attacks to allow your familiar to make one attack of its own with its Reaction."

**Engine:**
- New `GrantPactChain` marker effect kind ([src/schemas/effects.ts](src/schemas/effects.ts), added to union, Zod, and `EFFECT_KINDS`; mirror of `GrantPactBlade`/`GrantRitualAdept`). Projected via `markPactChain()` / `hasPactChain()` accessor ([src/effects/builder.ts](src/effects/builder.ts)).
- No new planner. The free-cast surface piggybacks on the existing at-will GrantSpell pathway (slice 513): cast-spell's `noSlotCost` derivation reads `buildEffectStack(...).grantedSpells()` for `preparation: 'at-will'` on the cast spell id and skips slot consumption. The Find Familiar spell schema already lives in the pack with its `summon` mechanical effect.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `pact-of-the-chain` Feat (category: 'invocation', repeatable: false). Effects: `[GrantSpell find-familiar at-will (CHA), GrantPactChain]`.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 15 -> 16 (Pact of the Chain added).

**Doc-count guards:**
- `EFFECT_KINDS` 58 -> 59 (57 -> 58 primitives + Custom). Updated [docs/authoring-content-packs.md](docs/authoring-content-packs.md) (CI-guarded prose regex) and [docs/concepts.md](docs/concepts.md) ("about 57 effect primitives" -> "about 58").
- Feats 33 -> 34 (15 -> 16 invocation). Updated [docs/getting-started.md](docs/getting-started.md).
- Features coverage snapshot ([tests/coverage/__snapshots__/features.test.ts.snap](tests/coverage/__snapshots__/features.test.ts.snap)) gains `invocation:pact-of-the-chain`.

**Documented RAW deviations (consumer-managed):**
- Special familiar form list (Imp / Pseudodragon / Quasit / Skeleton / Sphinx of Wonder / Sprite / Venomous Snake) is not engine-enforced. The consumer picks the familiar statblock at cast/conjure time. 6 of 7 forms ship in the pack; **`venomous-snake` is missing** (flagged in the slice-519 test via `console.info` so a future content-authoring slice closes it).
- The "cast as a Magic action" arm: Find Familiar's authored casting time stays "1 hour" (RAW for the spell itself; the invocation overrides it). Casting-time override not modeled.
- The "forgo one Attack-action attack to let the familiar make one attack with its Reaction" arm is not modeled (requires a multi-attack action-economy reroute + a familiar-as-puppet attacker that doesn't exist yet).
- As with all invocations (and slices 513-518), `prerequisites` is informational only; the engine doesn't enforce the per-invocation level/feature gates. Of the 16 invocations now offered at L1, only the five canonical strict-RAW L1 invocations are level-eligible; the other 11 require Warlock L2+ at strict RAW (documented deviation since slice 511).

**Tests** ([tests/unit/engine/slice-519-pact-of-the-chain.test.ts](tests/unit/engine/slice-519-pact-of-the-chain.test.ts), 5 cases): feat shape + effects (GrantSpell find-familiar at-will CHA + GrantPactChain); `hasPactChain()` projection after picking; absent-without-pick (negative control); `grantedSpells()` contains Find Familiar at-will with CHA spellcasting ability; special-form roster presence (asserts at least 5 of 7 forms ship in the pack, surfaces the missing one for a future content slice).

**Uncle Bob audit:**
- **Names:** `GrantPactChain` / `markPactChain` / `hasPactChain` mirror the slice-518 `PactBlade` triad exactly. No new identifiers beyond the marker triplet.
- **DRY:** zero new mechanism, the free-cast piggybacks on the slice-513 at-will pathway; the marker piggybacks on slice-505's `markRitualAdept` pattern. The two-effect feat shape reuses the slice-518 invocation-as-feat authoring pattern.
- **SRP:** marker only flags presence; the GrantSpell sibling provides the spell; existing cast-spell + summon mechanics do all the work.
- **Magic numbers:** none.
- **Mechanical outcomes asserted:** feat shape; marker projection (both presence and absence); GrantSpell projection with correct preparation + ability; special-form roster coverage.
- **Tests:** 5 unit tests + 1 coverage-snapshot entry. Each test names a specific gap it closes (marker exists, marker projects, marker doesn't project without pick, free-cast wiring intact, special forms reachable).

**Pattern-check:** the GrantSpell + marker pair is now the canonical shape for any "you learn spell X and can cast it without a slot, plus you gain Y" invocation, Aspect of the Moon and Mask of Many Faces both fit but are L2+ feature-gated, so they wait. The marker presence pattern (introduced slice 505 with `GrantRitualAdept`) is now used 5 times (RitualAdept, PotentCantrip, Evasion, PactBlade, PactChain); the duplication is below the abstraction threshold (each marker has a distinct trigger gate and zero shared state) so no factoring needed yet, but slice 6+ would be the threshold to consider a marker registry.

**Open follow-ups** (tracked, not blocking):
- `venomous-snake` monster statblock not in pack, content-authoring slice. **Still open.**
- Find Familiar Magic-action casting-time override, consumer-managed; future slice could add a per-grant `castingTimeOverride` field to `GrantSpell`. **Still open.**
- "Forgo one attack for familiar reaction-attack" arm, requires multi-attack action-economy reroute. **Still open.**
- Strict-RAW L1 prerequisite enforcement across all invocations, documented engine deviation since slice 511. **Still open.**

---

**Engine + content (slice 518): Pact of the Blade invocation + `GrantPactBlade` marker + `planConjurePactWeapon` planner**

Wires the second L1 Pact boon. The bond reuses slice-501's `temporaryBuff` shape: at conjure time the planner stamps `abilityOverride: 'CHA'` (so attack + damage use CHA mod, not STR/DEX) and an optional `damageTypeOverride` (Necrotic / Psychic / Radiant) on the freshly-conjured weapon instance. The attack resolver reads the buff at next attack — no new attack-time code.

RAW (Pact of the Blade): "As a Bonus Action, you can conjure a pact weapon in your hand — a Simple or Martial Melee weapon of your choice with which you bond... Whenever you attack with the bonded weapon, you can use your Charisma modifier for the attack and damage rolls instead of using Strength or Dexterity; and you can cause the weapon to deal Necrotic, Psychic, or Radiant damage or its normal damage type."

**Engine:**
- New `GrantPactBlade` marker effect kind ([src/schemas/effects.ts](src/schemas/effects.ts) — added to union, Zod, and `EFFECT_KINDS`; mirror of `GrantPactBlade` / `GrantRitualAdept` presence markers). Projected via `markPactBlade()` / `hasPactBlade()` accessor on the effect builder.
- New planner `planConjurePactWeapon` ([src/engine/plan/conjure-pact-weapon.ts](src/engine/plan/conjure-pact-weapon.ts)). Intent shape: `{ characterId, weaponDefinitionId, damageTypeOverride? }`. Validates the bearer has `hasPactBlade()` + the weapon is a Simple or Martial Melee weapon + the damage-type override (if any) is Necrotic / Psychic / Radiant. Consumes Bonus Action when the caster is the active combatant in an active encounter. Emits `ItemAcquired` (new weapon instance) + `ItemEquipped(mainHand)` + `ItemBuffApplied` with the overrides.
- Wired through `plan/index` + `engine/index` (Engine interface + `planNs` factory) + `conveniences.ts` (`ConjurePactWeapon` dispatch entry — picked up automatically by the planner-wiring audit).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `pact-of-the-blade` Feat (category: 'invocation', repeatable: false). Single effect: `GrantPactBlade` marker.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 14 → 15 (Pact of the Blade added).

**Doc-count update**: `EFFECT_KINDS` 57 → 58 (56 → 57 primitives + `Custom`). Updated [docs/authoring-content-packs.md](docs/authoring-content-packs.md) + [docs/concepts.md](docs/concepts.md). Feats 32 → 33 (15 invocation feats) in [docs/getting-started.md](docs/getting-started.md). Features snapshot gains `invocation:pact-of-the-blade`.

**Documented RAW deviations (consumer-managed):**
- Per-hit damage-type choice (RAW: "you can cause the weapon to deal Necrotic, Psychic, or Radiant damage or its normal damage type") is collapsed to a single conjure-time choice (mirror of slice 501's Shillelagh). Picking Radiant once means every subsequent attack with the bonded weapon deals Radiant; re-conjuring to change types is the consumer's path.
- Bonded-weapon proficiency arm (RAW grants proficiency with the bonded weapon while bonded). Not modeled — a warlock conjuring a martial weapon they're not class-proficient with attacks without proficiency bonus. A future slice extending `temporaryBuff` with `grantsProficiency` + threading instance through `isWeaponProficient` would close it.
- Spellcasting Focus arm consumer-managed (engine doesn't model focus-vs-component requirements at cast time).
- Bond-ends conditions (re-conjure, weapon-distance, death) consumer-managed.
- Each conjure call creates a new instance; prior-bond cleanup is the consumer's responsibility (the conjure planner doesn't unconjure prior pact weapons).

**Tests** at [tests/unit/engine/slice-518-pact-of-the-blade.test.ts](tests/unit/engine/slice-518-pact-of-the-blade.test.ts) - 8 cases: feat shape; effect stack projects `hasPactBlade === true` after picking the invocation; conjure without the invocation throws; conjure emits the 3 events with `abilityOverride: 'CHA'` and `source: 'pact-blade'`; `damageTypeOverride: 'necrotic'` stamps on the buff; ranged weapons rejected (Melee only); invalid damage type (e.g. 'fire') rejected; **end-to-end** — after conjuring a longsword with `damageTypeOverride: 'radiant'`, the warlock's attack with the pact weapon shows `attackBonus === 4` (CHA mod +4, no PB since warlock isn't class-proficient with martial), the damage modifier is +4 (CHA), and the damage type is `radiant`.

**Audit:**
- *RAW match*: CHA-for-attack/damage + optional Necrotic/Psychic/Radiant override; Simple/Martial Melee weapon filter; Bonus Action consumption. Documented deviations above.
- *Names*: `GrantPactBlade` mirrors `GrantRitualAdept` / `GrantPotentCantrip` (marker effects); `planConjurePactWeapon` mirrors `planSacredWeapon` (Bonus Action + resource/event emission pattern).
- *DRY*: reuses slice-501 `temporaryBuff` fields (`abilityOverride`, `damageTypeOverride`, `source`) — no new buff state; reuses the slice-507/513 GrantSpell `at-will` and feat-marker patterns; the planner mirrors `planSacredWeapon`'s structure (BA consumption + event sequence).
- *SRP*: the marker presence-flags one thing; the planner does one thing (conjure + bond a pact weapon); the buff fields already in place do the per-attack work.
- *Magic numbers*: none. Damage-type allowlist `{Necrotic, Psychic, Radiant}` is RAW.
- *Mechanical outcomes asserted*: feat shape, marker projection, conjure validation (no invocation / not melee / invalid type), event-sequence shape + buff fields, end-to-end attack + damage with CHA override + damage-type override.

**Pattern-check**: the conjure-pact-weapon shape generalizes to any future "summon a bonded item" feature (Find Steed's spectral mount has different mechanics but a similar bond pattern; Spectral Shield, etc.). The five documented deviations are a clear menu of follow-up slices when needed — proficiency arm is the most-mechanically-visible (changes attack-bonus math for martial weapons) and is the natural next step if a content user appears.

**Engine + content (slice 517): `ChoiceResolved` cascade primitive + Pact of the Tome canonical user**

Closes the L1-RAW gap: only **5 invocations are L1-eligible per RAW** (Armor of Shadows + Eldritch Mind, both already wired, plus the 3 Pact boons — Pact of the Blade / Chain / Tome). Every other invocation has a Level 2+ Warlock prereq (the engine doesn't enforce feat prereqs today, so the slice-513/514/515/516 invocations are still pickable at L1 — documented deviation, no engine gate). Slice 517 ships Pact of the Tome plus the engine primitive (ChoiceResolved cascade) needed for invocations that carry nested OfferChoices.

RAW (Pact of the Tome): "Stitching together strands of shadow, you conjure forth a book... choose three cantrips, and choose two level 1 spells that have the Ritual tag. The spells can be from any class's spell list... While the book is on your person, you have the chosen spells prepared, and they function as Warlock spells for you."

**Engine** ([src/engine/plan/level-up.ts](src/engine/plan/level-up.ts) `planResolveChoice`):
- Cascade mechanism: when a resolved option's effects (post-`expandGrantFeatEffects` — slice 511 indirection) include `OfferChoice` entries (`when !== 'onLongRest'`, mirror of planLevelUp's filter), `planResolveChoice` now emits follow-up `ChoiceRequired` events for each nested choice. Previously a feat granted by an OfferChoice option could not carry its own player picks (the level-up planner only walks NEW class features for OfferChoice installation; nested OfferChoices in resolved-option effects were silently inert).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `pact-of-the-tome` Feat (category: 'invocation', repeatable: false). Two inline `OfferChoice` effects: choose 3 cantrips from the pack's 27 cantrips (`oneOf: 3`); choose 2 L1 ritual spells from the pack's 11 L1 rituals (`oneOf: 2`). Each option's effects is one `GrantSpell preparation: 'always-prepared' spellcastingAbility: 'CHA'`. Pack file grew ~7 KB.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 13 → 14 (Pact of the Tome added).

**Doc-count update**: feats 31 → 32 (14 invocation feats). Features snapshot gains `invocation:pact-of-the-tome`.

**Documented RAW deviations:**
- **"While the book is on your person" preparation gate** is consumer-managed. The engine has no item-bound preparation primitive; the picked spells stay prepared as long as the invocation is active.
- **Cross-class cantrip / ritual spell pool**: RAW says "from any class's spell list." The pack enumerates ALL cantrips + ALL L1 rituals; this is broader than any single class's list but matches RAW's "any class" intent.
- **Feat-prereq enforcement** (general engine gap): the L1 OfferChoice currently exposes invocations whose RAW prereq is Level 2+ Warlock (10 of the 14 options). The engine doesn't read `feat.prerequisites` at choice-offering or resolution time; consumers / UIs filter by level. A future prereq-evaluation slice would gate the L1 options to just the 5 L1-eligible invocations.

**Tests** at [tests/unit/engine/slice-517-pact-of-the-tome.test.ts](tests/unit/engine/slice-517-pact-of-the-tome.test.ts) - 4 cases: feat ships the two nested OfferChoices (3 cantrips / 2 rituals); `planResolveChoice` cascades — resolving the L1 invocation OfferChoice with Pact of the Tome emits the two follow-up `ChoiceRequired` events; end-to-end (resolve outer + commit + resolve both nested + commit) the warlock's effect stack has all 5 chosen spells granted as `always-prepared`; an `OfferChoice when: 'onLongRest'` option does NOT cascade (filter matches planLevelUp).

**Audit:**
- *RAW match*: 3 cantrips + 2 L1 ritual spells, any class. Documented deviations above.
- *Names*: cascade lives in `planResolveChoice` mirroring `planLevelUp`'s OfferChoice install pattern (same filter, same event shape).
- *DRY*: the cascade reuses `expandGrantFeatEffects` (slice 511) so feat-indirection works through it; the content effects are generated from the pack's existing spell list (no copy-paste).
- *SRP*: the cascade does one thing — turn nested OfferChoices in resolved-option effects into ChoiceRequired events. The content adds one Feat row.
- *Magic numbers*: 3 (cantrip picks) and 2 (ritual picks) are RAW.
- *Mechanical outcomes asserted*: feat shape, cascade event emission, end-to-end projection through cascade + double-resolve, `onLongRest` filter.

**Pattern-check**: the cascade closes a class of deferrals — any feat / invocation that grants other content via its own OfferChoices now works without inline-duplication. Lessons of the First Ones (when added) can use it; magic-initiate variants granted via Lessons would also work; future Pact of the Chain (familiar form pick) will use it. The `expandGrantFeatEffects` integration means the cascade ALSO works when an option grants a feat that itself contains OfferChoices (recursive indirection). Pact of the Blade and Pact of the Chain stay deferred — Blade needs a summon-weapon mechanism; Chain needs find-familiar-as-action + the special-form-list.

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

Per-slice detail for slices 506-512 (Cleric Divine Order test; Floating Disk reclassification; Skilled origin feat; stale-note sweep; Warlock invocation foundation — choice mechanism + Agonizing Blast + `event.spellId` + `GrantFeat` indirection + per-cantrip variants) is archived at [docs/changelog/archive-slices-506-512.md](docs/changelog/archive-slices-506-512.md) (slice 517, to keep this file under the 60 KB single-Read ceiling).

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
