# Archive: slices 517-519

This file holds the per-slice changelog detail for slices 517-519, archived from the live CHANGELOG.md in slice 523 to keep that file under the 60 KB single-Read ceiling. Cohort: the L1-RAW-strict Pact boon completion arc — the ChoiceResolved cascade primitive + Pact of the Tome canonical user (517), Pact of the Blade + GrantPactBlade marker + planConjurePactWeapon (518), Pact of the Chain + GrantPactChain marker + at-will Find Familiar free-cast (519). This trio completes the five strict-RAW L1 Warlock invocations.

Picks up where [archive-slices-513-516.md](archive-slices-513-516.md) leaves off.

The global per-cohort archive index lives at [README.md](README.md).

---

**Engine + content (slice 519): Pact of the Chain invocation + `GrantPactChain` marker + at-will Find Familiar free-cast**

Wires the third L1 Pact boon. Pact of the Chain authors two effects on the same feat: `GrantSpell find-familiar 'at-will'` (CHA spellcasting ability) and the new `GrantPactChain` presence marker. Slice 513's at-will + free-cast pathway makes the granted Find Familiar slot-free. The marker is the gate for any future Chain-specific surface (special-form enforcement, the "forgo one Attack-action attack" reaction arm) without disturbing the feat-side authoring. **This completes the five strict-RAW L1 Warlock invocations** (Armor of Shadows, Eldritch Mind, Pact of the Blade, Pact of the Chain, Pact of the Tome).

RAW (Pact of the Chain): "You learn the _Find Familiar_ spell and can cast it as a Magic action without expending a spell slot. When you cast the spell, you choose one of the normal forms for your familiar or one of the following special forms: **Imp, Pseudodragon, Quasit, Skeleton, Sphinx of Wonder, Sprite,** or **Venomous Snake**... when you take the Attack action, you can forgo one of your own attacks to allow your familiar to make one attack of its own with its Reaction."

**Engine:**
- New `GrantPactChain` marker effect kind ([src/schemas/effects.ts](../../src/schemas/effects.ts), added to union, Zod, and `EFFECT_KINDS`; mirror of `GrantPactBlade`/`GrantRitualAdept`). Projected via `markPactChain()` / `hasPactChain()` accessor ([src/effects/builder.ts](../../src/effects/builder.ts)).
- No new planner. The free-cast surface piggybacks on the existing at-will GrantSpell pathway (slice 513): cast-spell's `noSlotCost` derivation reads `buildEffectStack(...).grantedSpells()` for `preparation: 'at-will'` on the cast spell id and skips slot consumption. The Find Familiar spell schema already lives in the pack with its `summon` mechanical effect.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `pact-of-the-chain` Feat (category: 'invocation', repeatable: false). Effects: `[GrantSpell find-familiar at-will (CHA), GrantPactChain]`.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 15 -> 16 (Pact of the Chain added).

**Doc-count guards:**
- `EFFECT_KINDS` 58 -> 59 (57 -> 58 primitives + Custom). Updated [docs/authoring-content-packs.md](../../docs/authoring-content-packs.md) (CI-guarded prose regex) and [docs/concepts.md](../../docs/concepts.md) ("about 57 effect primitives" -> "about 58").
- Feats 33 -> 34 (15 -> 16 invocation). Updated [docs/getting-started.md](../../docs/getting-started.md).
- Features coverage snapshot ([tests/coverage/__snapshots__/features.test.ts.snap](../../tests/coverage/__snapshots__/features.test.ts.snap)) gains `invocation:pact-of-the-chain`.

**Documented RAW deviations (consumer-managed):**
- Special familiar form list (Imp / Pseudodragon / Quasit / Skeleton / Sphinx of Wonder / Sprite / Venomous Snake) is not engine-enforced. The consumer picks the familiar statblock at cast/conjure time. 6 of 7 forms ship in the pack; **`venomous-snake` is missing** (flagged in the slice-519 test via `console.info` so a future content-authoring slice closes it).
- The "cast as a Magic action" arm: Find Familiar's authored casting time stays "1 hour" (RAW for the spell itself; the invocation overrides it). Casting-time override not modeled.
- The "forgo one Attack-action attack to let the familiar make one attack with its Reaction" arm is not modeled (requires a multi-attack action-economy reroute + a familiar-as-puppet attacker that doesn't exist yet).
- As with all invocations (and slices 513-518), `prerequisites` is informational only; the engine doesn't enforce the per-invocation level/feature gates. Of the 16 invocations now offered at L1, only the five canonical strict-RAW L1 invocations are level-eligible; the other 11 require Warlock L2+ at strict RAW (documented deviation since slice 511).

**Tests** ([tests/unit/engine/slice-519-pact-of-the-chain.test.ts](../../tests/unit/engine/slice-519-pact-of-the-chain.test.ts), 5 cases): feat shape + effects (GrantSpell find-familiar at-will CHA + GrantPactChain); `hasPactChain()` projection after picking; absent-without-pick (negative control); `grantedSpells()` contains Find Familiar at-will with CHA spellcasting ability; special-form roster presence (asserts at least 5 of 7 forms ship in the pack, surfaces the missing one for a future content slice).

**Uncle Bob audit:**
- **Names:** `GrantPactChain` / `markPactChain` / `hasPactChain` mirror the slice-518 `PactBlade` triad exactly. No new identifiers beyond the marker triplet.
- **DRY:** zero new mechanism, the free-cast piggybacks on the slice-513 at-will pathway; the marker piggybacks on slice-505's `markRitualAdept` pattern. The two-effect feat shape reuses the slice-518 invocation-as-feat authoring pattern.
- **SRP:** marker only flags presence; the GrantSpell sibling provides the spell; existing cast-spell + summon mechanics do all the work.
- **Magic numbers:** none.
- **Mechanical outcomes asserted:** feat shape; marker projection (both presence and absence); GrantSpell projection with correct preparation + ability; special-form roster coverage.
- **Tests:** 5 unit tests + 1 coverage-snapshot entry. Each test names a specific gap it closes (marker exists, marker projects, marker doesn't project without pick, free-cast wiring intact, special forms reachable).

**Pattern-check:** the GrantSpell + marker pair is now the canonical shape for any "you learn spell X and can cast it without a slot, plus you gain Y" invocation, Aspect of the Moon and Mask of Many Faces both fit but are L2+ feature-gated, so they wait. The marker presence pattern (introduced slice 505 with `GrantRitualAdept`) is now used 5 times (RitualAdept, PotentCantrip, Evasion, PactBlade, PactChain); the duplication is below the abstraction threshold (each marker has a distinct trigger gate and zero shared state) so no factoring needed yet, but slice 6+ would be the threshold to consider a marker registry.

**Open follow-ups** (tracked, not blocking):
- ~~`venomous-snake` monster statblock not in pack, content-authoring slice.~~ **Closed by slice 522.**
- Find Familiar Magic-action casting-time override, consumer-managed; future slice could add a per-grant `castingTimeOverride` field to `GrantSpell`. **Still open.**
- "Forgo one attack for familiar reaction-attack" arm, requires multi-attack action-economy reroute. **Still open.**
- Strict-RAW L1 prerequisite enforcement across all invocations, documented engine deviation since slice 511. **Still open.**

---

**Engine + content (slice 518): Pact of the Blade invocation + `GrantPactBlade` marker + `planConjurePactWeapon` planner**

Wires the second L1 Pact boon. The bond reuses slice-501's `temporaryBuff` shape: at conjure time the planner stamps `abilityOverride: 'CHA'` (so attack + damage use CHA mod, not STR/DEX) and an optional `damageTypeOverride` (Necrotic / Psychic / Radiant) on the freshly-conjured weapon instance. The attack resolver reads the buff at next attack — no new attack-time code.

RAW (Pact of the Blade): "As a Bonus Action, you can conjure a pact weapon in your hand — a Simple or Martial Melee weapon of your choice with which you bond... Whenever you attack with the bonded weapon, you can use your Charisma modifier for the attack and damage rolls instead of using Strength or Dexterity; and you can cause the weapon to deal Necrotic, Psychic, or Radiant damage or its normal damage type."

**Engine:**
- New `GrantPactBlade` marker effect kind ([src/schemas/effects.ts](../../src/schemas/effects.ts) — added to union, Zod, and `EFFECT_KINDS`; mirror of `GrantPactBlade` / `GrantRitualAdept` presence markers). Projected via `markPactBlade()` / `hasPactBlade()` accessor on the effect builder.
- New planner `planConjurePactWeapon` ([src/engine/plan/conjure-pact-weapon.ts](../../src/engine/plan/conjure-pact-weapon.ts)). Intent shape: `{ characterId, weaponDefinitionId, damageTypeOverride? }`. Validates the bearer has `hasPactBlade()` + the weapon is a Simple or Martial Melee weapon + the damage-type override (if any) is Necrotic / Psychic / Radiant. Consumes Bonus Action when the caster is the active combatant in an active encounter. Emits `ItemAcquired` (new weapon instance) + `ItemEquipped(mainHand)` + `ItemBuffApplied` with the overrides.
- Wired through `plan/index` + `engine/index` (Engine interface + `planNs` factory) + `conveniences.ts` (`ConjurePactWeapon` dispatch entry — picked up automatically by the planner-wiring audit).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `pact-of-the-blade` Feat (category: 'invocation', repeatable: false). Single effect: `GrantPactBlade` marker.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 14 → 15 (Pact of the Blade added).

**Doc-count update**: `EFFECT_KINDS` 57 → 58 (56 → 57 primitives + `Custom`). Updated [docs/authoring-content-packs.md](../../docs/authoring-content-packs.md) + [docs/concepts.md](../../docs/concepts.md). Feats 32 → 33 (15 invocation feats) in [docs/getting-started.md](../../docs/getting-started.md). Features snapshot gains `invocation:pact-of-the-blade`.

**Documented RAW deviations (consumer-managed):**
- Per-hit damage-type choice (RAW: "you can cause the weapon to deal Necrotic, Psychic, or Radiant damage or its normal damage type") is collapsed to a single conjure-time choice (mirror of slice 501's Shillelagh). Picking Radiant once means every subsequent attack with the bonded weapon deals Radiant; re-conjuring to change types is the consumer's path.
- Bonded-weapon proficiency arm (RAW grants proficiency with the bonded weapon while bonded). Not modeled — a warlock conjuring a martial weapon they're not class-proficient with attacks without proficiency bonus. A future slice extending `temporaryBuff` with `grantsProficiency` + threading instance through `isWeaponProficient` would close it.
- Spellcasting Focus arm consumer-managed (engine doesn't model focus-vs-component requirements at cast time).
- Bond-ends conditions (re-conjure, weapon-distance, death) consumer-managed.
- Each conjure call creates a new instance; prior-bond cleanup is the consumer's responsibility (the conjure planner doesn't unconjure prior pact weapons).

**Tests** at [tests/unit/engine/slice-518-pact-of-the-blade.test.ts](../../tests/unit/engine/slice-518-pact-of-the-blade.test.ts) - 8 cases: feat shape; effect stack projects `hasPactBlade === true` after picking the invocation; conjure without the invocation throws; conjure emits the 3 events with `abilityOverride: 'CHA'` and `source: 'pact-blade'`; `damageTypeOverride: 'necrotic'` stamps on the buff; ranged weapons rejected (Melee only); invalid damage type (e.g. 'fire') rejected; **end-to-end** — after conjuring a longsword with `damageTypeOverride: 'radiant'`, the warlock's attack with the pact weapon shows `attackBonus === 4` (CHA mod +4, no PB since warlock isn't class-proficient with martial), the damage modifier is +4 (CHA), and the damage type is `radiant`.

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

**Engine** ([src/engine/plan/level-up.ts](../../src/engine/plan/level-up.ts) `planResolveChoice`):
- Cascade mechanism: when a resolved option's effects (post-`expandGrantFeatEffects` — slice 511 indirection) include `OfferChoice` entries (`when !== 'onLongRest'`, mirror of planLevelUp's filter), `planResolveChoice` now emits follow-up `ChoiceRequired` events for each nested choice. Previously a feat granted by an OfferChoice option could not carry its own player picks (the level-up planner only walks NEW class features for OfferChoice installation; nested OfferChoices in resolved-option effects were silently inert).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `pact-of-the-tome` Feat (category: 'invocation', repeatable: false). Two inline `OfferChoice` effects: choose 3 cantrips from the pack's 27 cantrips (`oneOf: 3`); choose 2 L1 ritual spells from the pack's 11 L1 rituals (`oneOf: 2`). Each option's effects is one `GrantSpell preparation: 'always-prepared' spellcastingAbility: 'CHA'`. Pack file grew ~7 KB.
- Warlock L1 `eldritch-invocations-2` OfferChoice options: 13 → 14 (Pact of the Tome added).

**Doc-count update**: feats 31 → 32 (14 invocation feats). Features snapshot gains `invocation:pact-of-the-tome`.

**Documented RAW deviations:**
- **"While the book is on your person" preparation gate** is consumer-managed. The engine has no item-bound preparation primitive; the picked spells stay prepared as long as the invocation is active.
- **Cross-class cantrip / ritual spell pool**: RAW says "from any class's spell list." The pack enumerates ALL cantrips + ALL L1 rituals; this is broader than any single class's list but matches RAW's "any class" intent.
- **Feat-prereq enforcement** (general engine gap): the L1 OfferChoice currently exposes invocations whose RAW prereq is Level 2+ Warlock (10 of the 14 options). The engine doesn't read `feat.prerequisites` at choice-offering or resolution time; consumers / UIs filter by level. A future prereq-evaluation slice would gate the L1 options to just the 5 L1-eligible invocations.

**Tests** at [tests/unit/engine/slice-517-pact-of-the-tome.test.ts](../../tests/unit/engine/slice-517-pact-of-the-tome.test.ts) - 4 cases: feat ships the two nested OfferChoices (3 cantrips / 2 rituals); `planResolveChoice` cascades — resolving the L1 invocation OfferChoice with Pact of the Tome emits the two follow-up `ChoiceRequired` events; end-to-end (resolve outer + commit + resolve both nested + commit) the warlock's effect stack has all 5 chosen spells granted as `always-prepared`; an `OfferChoice when: 'onLongRest'` option does NOT cascade (filter matches planLevelUp).

**Audit:**
- *RAW match*: 3 cantrips + 2 L1 ritual spells, any class. Documented deviations above.
- *Names*: cascade lives in `planResolveChoice` mirroring `planLevelUp`'s OfferChoice install pattern (same filter, same event shape).
- *DRY*: the cascade reuses `expandGrantFeatEffects` (slice 511) so feat-indirection works through it; the content effects are generated from the pack's existing spell list (no copy-paste).
- *SRP*: the cascade does one thing — turn nested OfferChoices in resolved-option effects into ChoiceRequired events. The content adds one Feat row.
- *Magic numbers*: 3 (cantrip picks) and 2 (ritual picks) are RAW.
- *Mechanical outcomes asserted*: feat shape, cascade event emission, end-to-end projection through cascade + double-resolve, `onLongRest` filter.

**Pattern-check**: the cascade closes a class of deferrals — any feat / invocation that grants other content via its own OfferChoices now works without inline-duplication. Lessons of the First Ones (when added) can use it; magic-initiate variants granted via Lessons would also work; future Pact of the Chain (familiar form pick) will use it. The `expandGrantFeatEffects` integration means the cascade ALSO works when an option grants a feat that itself contains OfferChoices (recursive indirection). Pact of the Blade and Pact of the Chain stay deferred — Blade needs a summon-weapon mechanism; Chain needs find-familiar-as-action + the special-form-list.
