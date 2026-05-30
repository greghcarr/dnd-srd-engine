# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 520): Spare the Dying + new `stabilize` spell mechanic**

Wires Spare the Dying, the most-picked L0 healing-utility cantrip in the SRD and one of the last remaining narrative-only L0 cantrips with concrete in-engine mechanics. Adds a new `mechanicalEffects.kind: 'stabilize'` to the spell schema; the cast-spell planner dispatches to `planStabilizeMechanic`, which emits a `Stabilized` event on the first targetId when the target is at 0 HP and not already stable. The reducer side (`applyStabilized`) predates this slice; no reducer / event-schema work needed.

RAW (Spare the Dying, 2024 cantrip): "Choose a creature within range that has 0 Hit Points and isn't dead. The creature becomes Stable."

**Engine:**
- New `SpellStabilizeMechanicSchema` ([src/schemas/content/spell.ts](src/schemas/content/spell.ts), added to the `SpellMechanic` discriminated union; mirror of `create-item` / `weapon-attack` in shape, no fields beyond `kind`).
- New `planStabilizeMechanic` inline helper ([src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts), mirror of `planCreateItemMechanic`). Validates a targetId is supplied; gates on `hp.current === 0` AND `deathSaves.stable !== true`; ineligible targets produce zero events (matches RAW "spell does nothing" outcome). Wired into the cast-spell dispatch loop.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- `spare-the-dying` mechanicalEffects: `[]` -> `[{ kind: 'stabilize' }]`. No other changes (cleric / druid class list, range, components all stay RAW-correct).

**Doc-count guards:**
- Spell wired count: 196 -> 197 (cast-time bucket 153 -> 154). Narrative count: 70 -> 69. Updated [docs/getting-started.md](docs/getting-started.md), [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) Coverage table, [docs/gaps-spells.md](docs/gaps-spells.md) Totals + L0 breakdown (16 -> 17 wired, 11 -> 10 narrative).
- L0 breakdown gains a new "Wired, stabilize (1): spare-the-dying" line. `spare-the-dying` moved out of the L0 Narrative list.
- The `EFFECT_KINDS` count is unchanged (this is a spell-mechanic schema entry, not an effect primitive); existing guard regexes stay accurate.

**Documented RAW deviations (consumer-managed):**
- "Choose a creature within range" — the 15-foot range gate is not engine-enforced (consumer-managed, mirror of all other range gates).
- "isn't dead" — the planner gates on `hp.current === 0 + !stable`. A creature with `deathSaves.failures >= 3` is "dead" per the standard rules but is filtered out by the existing reducer (`applyStabilized` checks the failure count); the planner doesn't re-check. The compound effect is RAW-correct (a dead creature can't be stabilized) but the gate split between planner and reducer is documented here.

**Tests** ([tests/unit/engine/slice-520-spare-the-dying.test.ts](tests/unit/engine/slice-520-spare-the-dying.test.ts), 5 cases): spell shape includes `stabilize`; casting on a downed (0-HP, unstable) target emits Stabilized and flips `deathSaves.stable -> true` on commit; casting on a healthy target (hp.current > 0) emits no Stabilized; casting on an already-stable target emits no Stabilized (idempotent no-op); empty `targetIds` throws with an intent-revealing message.

**Uncle Bob audit:**
- **Names:** `SpellStabilizeMechanicSchema` / `planStabilizeMechanic` mirror the create-item / weapon-buff naming exactly. `stabilize` mechanic kind matches the existing `Stabilized` event verb form.
- **DRY:** no new event type, no new reducer; the planner emits the existing `Stabilized` event into the existing reducer. The shape mirrors create-item/weapon-attack which mirror each other.
- **SRP:** the mechanic helper does one thing (decide whether to emit Stabilized for the first target); the reducer does one thing (set `stable = true`); the cast-spell envelope does the spell-economy work.
- **Magic numbers:** none. The `0` HP and `true`/`false` stable values are RAW thresholds, named via field access.
- **at-threading:** the planner takes `at` from the surrounding cast-spell envelope (resolved once via the `at ?? nowIso()` in `planCastSpell`); the helper threads it into the emitted event without re-resolving.
- **Mechanical outcomes asserted:** spell shape, positive case (Stabilized emitted + state flip on commit), two negative cases (healthy, already-stable), input-validation throw.
- **Tests:** 5 unit tests. Each names a specific bug it prevents (stabilize wires the existing event; ineligibility gates work; missing target throws clearly).

**Pattern-check:** the `mechanicalEffects.kind` shape now has 18 members. Two patterns dominate: cast-time emitters (most kinds) and tick-time no-ops at cast (`aura-damage`, `movement-damage`, `recurring`, `zone`). `stabilize` joins the cast-time emitter family; it's the smallest member (zero RNG, zero schema-field beyond `kind`) and proves the shape scales down cleanly. Other obvious "tiny mechanic" candidates: `extinguish` (Snuff Out variants), `remove-curse`-style multi-condition strip (the engine has `remove-condition` already; future curse-family work would consider whether to extend that or add a new kind). No factoring needed; cast-spell's mechanic switch is the right level of abstraction.

**Pattern-check ii** (the broader L1 SRD playability arc): the L1 cantrip Wired catalog is now 17 of 27 (62%). The 10 remaining are all genuinely narrative (dancing-lights, druidcraft, light, mage-hand, mending, message, minor-illusion, prestidigitation, thaumaturgy, elementalism). No further mechanical wires are deferred at L0; L0 wiring is complete to the extent the engine models. **L1 cantrip surface is done.**

**Open follow-ups:**
- None for this slice — Spare the Dying's RAW is fully modeled. The 10 remaining narrative L0 cantrips are genuinely narrative.
- The README spell-count (line 120) cites "182/339 wired" and is stale (stale since pre-slice-444 by ~15 slices' worth of wires). A future doc-reconcile slice should refresh it; deferring here to keep this slice focused.

**Docs hygiene (slice 520 also)**: archived slices 513-516 detail to [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) to keep the live CHANGELOG under the 60 KB single-Read ceiling (it crossed 61.8 KB before the cut; ~48 KB after).

---

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

Per-slice detail for slices 513-516 (Warlock invocation content sweep: 6 invocations + at-will GrantSpell slot bypass; Ascendant Step + Gift of the Depths; Eldritch Mind + `event.isConcentrationCheck` save fact; Repelling Blast + `PushTarget` TriggerAction + `event.source` damage fact + cast-spell trigger dispatch) is archived at [docs/changelog/archive-slices-513-516.md](docs/changelog/archive-slices-513-516.md) (slice 520, to keep this file under the 60 KB single-Read ceiling).

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
