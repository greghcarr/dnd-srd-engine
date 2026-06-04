# CHANGELOG archive: slices 482-486 (post-alpha.15 cohort B: bestiary + L1 spellcaster onboarding)

Per-slice detail for slices 482-486, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 490 to keep it under the 60 KB single-Read ceiling. Cohort: the second post-alpha.15 batch, picking up where [archive-slices-472-481.md](archive-slices-472-481.md) leaves off. Highlights:
- Slice 482: Animated Armor + Death Dog Multiattacks (the last simple-shape monster-Multiattack users).
- Slice 483: Boar Bloodied Fury + the engine-derived `bearer.bloodied` predicate fact.
- Slice 484: Worg Bite + `consumeOnIncomingAttack` schema field + onHit `autoExpiry` stamping (canonical user of all three).
- Slice 485: Magic Initiate (Druid), the third Magic Initiate variant - closes the three-variant cohort.
- Slice 486: once-per-long-rest free-cast resource tracker (`useFreeCast` flag + `FreeCastUsed` event + long-rest reset).

Slices 487-490 (non-spellcaster Magic Initiate cast + this archive; Cockatrice Petrification + `escalateToCondition` recurring-save arm; Hippogriff Flyby + `MovementMode` on MoveIntent; Stirge Blood Drain + attach/drain/detach planners) stay in the live CHANGELOG as the most-recent cohort.

---

**Engine (slice 486): once-per-long-rest free-cast resource tracking**

Closes the slice-469 open follow-up. Adds engine-enforced tracking of which `oncePerLongRest`-granted spells have used their free cast since the last long rest, so Magic Initiate's L1 spell, Warlock Contact Patron, and any future `oncePerLongRest` GrantSpell stop being consumer-managed.

RAW (SRD 5.2.1 Magic Initiate): "You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have."

**Engine surface (additive, no breaking changes):**
- New `useFreeCast?: boolean` flag on `CastSpellIntent` ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)). When `true`, validates: (a) the spell has a `GrantSpell` entry with `preparation: 'oncePerLongRest'` in the bearer's effect stack; (b) the spell is not in `character.usedFreeCastSpellIds`. Throws an intent-revealing error on either failure. Implies `noSlotCost: true` and emits a `FreeCastUsed` event after `SpellCastDeclared`.
- New `usedFreeCastSpellIds: string[]` field on the runtime `Character` schema ([src/schemas/runtime/character.ts](../../src/schemas/runtime/character.ts)). Defaults to `[]`; pre-slice-486 saves load clean.
- New `FreeCastUsedEvent` ([src/schemas/events/spellcasting.ts](../../src/schemas/events/spellcasting.ts)) with reducer `applyFreeCastUsed` appending the spellId (deduped by id).
- `applyLongRestEnded` ([src/engine/reducers/rest.ts](../../src/engine/reducers/rest.ts)) clears `usedFreeCastSpellIds` alongside the existing `spellSlotsUsed = {}` / `pactSlotsUsed = 0` resets.
- Transcript formatting case for `FreeCastUsed` ([tests/transcript.ts](../../tests/transcript.ts)).

**Tests** at [tests/unit/engine/slice-486-free-cast.test.ts](../../tests/unit/engine/slice-486-free-cast.test.ts) - 5 cases:
1. A Magic Initiate (Cleric) cast with `useFreeCast: true` emits `FreeCastUsed`, no `SpellSlotConsumed` or `PactSlotConsumed`.
2. After the cast, `character.usedFreeCastSpellIds` includes the spellId.
3. A second `useFreeCast: true` cast of the same spell before a long rest throws.
4. `useFreeCast: true` on a spell lacking an `oncePerLongRest` grant throws.
5. `LongRestEnded` clears the list and the next free cast succeeds.

**Audit:**
- *RAW match*: the free-cast / slot-cast / long-rest-reset semantics match the 2024 Magic Initiate text. Whether the player chooses to cast via the free cast or a regular slot is preserved (the existing slot path is untouched; `useFreeCast` is the new opt-in).
- *Names*: `useFreeCast` mirrors `noSlotCost` / `ignorePreparation` (existing per-cast modifier flags). `usedFreeCastSpellIds` mirrors `spellSlotsUsed` / `pactSlotsUsed` (per-character per-rest tracking).
- *DRY*: the long-rest reset reuses the same `applyLongRestEnded` loop that already resets slots, exhaustion, hit-dice, item time budgets. The event + reducer follow the existing `SpellSlotConsumed` pattern.
- *SRP*: each new piece does one thing (validate / emit / reduce / reset). The existing `findCastingClass` + slot-consumption logic is unchanged.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: 5 cases pin validation gates, event emission, state mutation, and long-rest reset.
- *Tests*: every new code path has a case that would fail without the change (the validate gate, the FreeCastUsed emission, the reducer, the long-rest clear).

**Documented separate gap (not closed here)**: `planCastSpell` still requires the bearer to have a spellcasting class (the `findCastingClass` gate). A Magic Initiate Fighter / Rogue / Barbarian can carry the `oncePerLongRest` grant but cannot reach the planner today. The test character is a Cleric to scope this slice tightly; the broader non-spellcaster-Magic-Initiate path needs its own slice (the planner would need to route DC computation through the `GrantSpell.spellcastingAbility` instead of the class's spellcasting ability when there's no spellcasting class).

**Pattern-check**: swept the codebase for other `oncePerLongRest`-shaped resources that could opt into the new mechanism. Divine Intervention (Cleric L10) is the only other current user of "free cast on a oncePerLongRest cadence" but is already wired through a dedicated `firedThisLongRest` trigger-counter mechanism (different shape — uses the trigger-counter family rather than per-spell tracking, since it's a one-shot per long rest rather than a specific spell grant). No other current pack content uses the GrantSpell `oncePerLongRest` preparation beyond Magic Initiate (3 variants) and Warlock Contact Patron, all of which now benefit from the new tracker.

**Content (slice 485): Magic Initiate (Druid) - third variant wired**

Closes the slice-469 open follow-up. Pure content: the `magic-initiate-druid` feat had been in the pack as an `effects: []` stub; this slice fills in the same OfferChoice + GrantSpell pattern slice 469 established for the Cleric and Wizard variants, scoped to the Druid spell list available in the starter pack.

RAW (SRD 5.2.1 Magic Initiate, Druid list): two Druid cantrips of the player's choice (always-prepared) + one Druid level-1 spell (oncePerLongRest free cast plus castable via owned slots).

Pack additions ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- `magic-initiate-druid-cantrips`: oneOf:2 OfferChoice across all 11 Druid cantrips currently in the pack (guidance, druidcraft, mending, message, poison-spray, produce-flame, resistance, shillelagh, spare-the-dying, starry-wisp, elementalism). Each option's effects: `GrantSpell preparation:'always-prepared' spellcastingAbility:'WIS'`.
- `magic-initiate-druid-l1`: oneOf:1 OfferChoice across all 18 Druid L1 spells in the pack (detect-magic, cure-wounds, healing-word, thunderwave, faerie-fire, charm-person, animal-friendship, create-or-destroy-water, detect-poison-and-disease, entangle, fog-cloud, goodberry, jump, longstrider, protection-from-evil-and-good, purify-food-and-drink, speak-with-animals, ice-knife). Each option's effects: `GrantSpell preparation:'oncePerLongRest' spellcastingAbility:'WIS'`.

The `spellcastingAbility` is hard-coded to WIS (the canonical Druid default per RAW); the player choice across INT/WIS/CHA stays deferred (same follow-up the Cleric / Wizard variants carry).

**Tests** at [tests/unit/engine/slice-485-magic-initiate-druid.test.ts](../../tests/unit/engine/slice-485-magic-initiate-druid.test.ts) - 4 cases: feat ships two OfferChoice effects with correct oneOf counts; every cantrip option grants a real druid cantrip with `always-prepared` + WIS; every L1 option grants a real druid L1 spell with `oncePerLongRest` + WIS; a PC who picks Druidcraft + Guidance + Goodberry has all three granted to the effect stack.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Magic Initiate. The Druid spell list matches the pack's wider Druid catalog. The `always-prepared` / `oncePerLongRest` preparation split matches the Cleric / Wizard variants exactly (and the RAW free-cast semantics).
- *Names*: choiceIds follow the `magic-initiate-{class}-{cantrips|l1}` convention.
- *DRY*: identical shape to the Cleric and Wizard variants from slice 469.
- *Mechanical outcomes asserted*: every option's GrantSpell shape is verified against the real spell catalog; the integration test pins one canonical choice path end-to-end.

**Pattern-check**: the three "Magic Initiate" variants now form a complete cohort (Cleric / Wizard / Druid). No background origin feat references Druid Magic Initiate yet (Acolyte -> Cleric, Sage -> Wizard, Criminal / Soldier -> other origin feats), so the feat is reachable only via repeatable-feat selection at level-up. That's RAW: the player can repeat Magic Initiate for a different list. The once-per-long-rest free-cast resource tracking (slice 469 open follow-up) is still consumer-managed across all three variants.

**Engine + content (slice 484): Worg Bite + `consumeOnIncomingAttack` + onHit autoExpiry stamping**

Closes the slice-477 deferred Worg row. Three coordinated additions: a new condition-schema field, an attack-resolver helper + call site, and an extension to the onHit `applyConditionId` rider so the condition's declarative `autoExpiry` actually fires.

RAW (SRD 5.2.1 Worg, CR 1/2): "Bite. Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage, and the next attack roll made against the target before the start of the worg's next turn has Advantage."

**Engine** ([src/schemas/content/condition.ts](../../src/schemas/content/condition.ts), [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)):
- New optional `consumeOnIncomingAttack: boolean` field on `ConditionSchema`, the target-side mirror of the slice-387 `consumeOnAttack`. When the bearer is the TARGET of an attack, the resolver removes any condition flagged `consumeOnIncomingAttack` so a rider (typically `GrantAdvantageToAttackers`) applies to exactly one incoming attack.
- New `buildConsumeOnIncomingAttackRemovals(target, content, at)` helper alongside the existing `buildConsumeOnAttackRemovals`. No source-keyed filter (RAW "next attack" doesn't constrain the attacker); can be added later if a future shape needs it.
- Call site folded into the same `applyAll` that processes the attacker-side consumption (line ~881), and the resulting events appended to both return branches (miss / hit).
- `applyRiderCondition` now reads the rider condition's `autoExpiry` and stamps `expiresOnRound` + `expiryTrigger` on the emitted `ConditionApplied` when inside an active encounter. Mirrors the [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts) treatment of spell buffs. Outside an encounter, the consumer manages expiry (existing slice-286 behavior preserved). Conditions without `autoExpiry` are unaffected.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New condition `worg-bite-targeted`: `effects: [GrantAdvantageToAttackers]`, `consumeOnIncomingAttack: true`, `autoExpiry: { afterRounds: 1, trigger: 'turnStart' }`.
- New natural weapon `worg-bite`: 1d8 piercing + `onHit: [{ applyConditionId: 'worg-bite-targeted' }]`. The +3 damage / +5 attack come from wielder STR 16 + PB 2.

**Doc-count update**: weapons 71 -> 72, items 534 -> 535, conditions 125 -> 126 (15 RAW + 110 -> 111 rider; effect-bearing 109 -> 110).

**Tests** at [tests/unit/engine/slice-484-worg-bite.test.ts](../../tests/unit/engine/slice-484-worg-bite.test.ts) - 5 cases: weapon shape; condition shape (effects + consumeOnIncomingAttack + autoExpiry); onHit applies the buff to the target; an attack against a buffed target rolls with Advantage AND the buff is consumed; a second attack rolls without Advantage (proves consumption).

**Audit:**
- *RAW match*: Bite damage + RAW phrasing pinned by `worg-bite` description; the `next attack roll made against the target` + `before the start of the worg's next turn` envelope is the union of `consumeOnIncomingAttack` (the "next attack" arm) + `autoExpiry afterRounds:1 turnStart` (the envelope when no attack happens). Both arms are exercised by separate tests.
- *Names*: `consumeOnIncomingAttack` mirrors the existing `consumeOnAttack` family naming exactly. `worg-bite-targeted` follows the `*-active` / `*-targeted` convention for transient applied conditions.
- *DRY*: the helper mirrors `buildConsumeOnAttackRemovals` line-for-line. The autoExpiry stamping pattern in `applyRiderCondition` mirrors the cast-spell.ts site. No new abstraction.
- *SRP*: each new piece does one thing. Helper = list removals. Resolver call site = thread them. Stamping = stamp expiry. New schema field = declare consumption-direction. New condition = declare buff shape. New weapon = declare delivery.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: 5 cases pin (a) the wire shapes, (b) the apply-on-hit path, (c) the consume-on-incoming-attack arm, (d) the post-consumption no-advantage second attack.
- *Tests*: would fail before the engine + content change (the schema field, the helper, the call site, the autoExpiry stamping, and both content entries are each load-bearing).

**Pattern-check**: the autoExpiry stamping extension may help close the slice-286 family of consumer-managed "until start of X's next turn" durations on other onHit applyConditionId riders (Couatl's Bite, Giant Centipede's Bite, Sprite's Enchanting Bow, Wyvern's Sting, Ettercap's Bite, Merrow's Bite — all currently consumer-managed because they share generic conditions like `poisoned` / `charmed` that can't carry autoExpiry without over-applying to other sources). Closing those needs per-source unique conditions (e.g. `couatl-poisoned`, `wyvern-poisoned`) that each carry their own autoExpiry; deferred as a separate authoring sweep. The Worg case is the first that owns a unique condition AND has a "next attack" arm, so it's the natural canonical user.

**Pattern-check (audit hardening)**: while writing this slice, the `worg-bite-targeted` condition failed [tests/audit/pack-integrity.test.ts](../../tests/audit/pack-integrity.test.ts)'s "every condition with effects is reachable" check because the audit's reference-walker enumerated only `conditionId` / `allyConditionId` / `conditionOnFail` / `bearerConditionId`, missing the `applyConditionId` and `conditionOnSuccess` keys on `onHit` riders + the `eligibleConditionIds` arrays on spell `remove-condition` mechanics. That was a pre-existing under-walking of reference shapes (mirror of the slice-301 false-positive lesson the audit's own comments warn about). Extended the walker to enumerate `applyConditionId` + `conditionOnSuccess` + `eligibleConditionIds` so the audit catches the full structural-reference surface, not just the legacy subset. Existing wired conditions stay reachable through unchanged paths; this only adds reference paths the audit previously missed.

**Engine + content (slice 483): Boar Bloodied Fury + `bearer.bloodied` predicate fact**

Smallest engine slice from the slice-477 deferred list (the Boar's Bloodied Fury trait was tracked there as needing a new predicate fact). Adds the fact and the canonical content user.

RAW (SRD 5.2.1 Boar): "Bloodied Fury. While Bloodied, the boar has Advantage on attack rolls." 2024 Bloodied semantics: HP at or below half the creature's HP maximum.

**Engine** ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)): adds `['bearer.bloodied', attacker.hp.current <= Math.floor(attacker.hp.max / 2)]` to the `attackerSelfAdvantageFacts` map. Unlike `bearer.lightLevel` (slice 451) and `bearer.canSeeFearSource` (slice 276) - scene facts the engine can't observe and that route through consumer input - bloodied is **derived engine-side** from character HP that the engine already owns. No consumer wiring is needed. The fact name follows the existing `bearer.*` naming convention so future "while bloodied" features (CR-1+ bestiary has several) gate on one canonical fact name.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Boar statblock gains one trait: `SetAdvantage on:'attack' mode:'advantage' condition: eq path:'bearer.bloodied' value:true`. Same shape as the existing `bearer.lightLevel`-gated SetAdvantage entries on the Kobold Warrior / Drow / Duergar / Goblin Boss family (slice 451/452 sunlight sensitivity).

**Tests** at [tests/unit/engine/slice-483-boar-bloodied-fury.test.ts](../../tests/unit/engine/slice-483-boar-bloodied-fury.test.ts) - 6 cases: trait shape on the statblock; boundary semantics at full HP, just above half, exactly half on odd max (floor), 1 HP, exactly half on even max.

**Audit:**
- *RAW match*: the Bloodied threshold matches the 2024 PHB glossary entry (`HP <= floor(max / 2)`); the boundary tests pin both the equal-to-half case (advantage fires) and the just-above case (no advantage).
- *Names*: `bearer.bloodied` mirrors the existing `bearer.lightLevel` / `bearer.canSeeFearSource` / `bearer.canSeeAttacker` / `bearer.hasIncapacitated` / `bearer.speedZero` family.
- *DRY*: re-used the half-HP idiom (`Math.floor(target.hp.max / 2)`) already established in [src/engine/plan/preserve-life.ts](../../src/engine/plan/preserve-life.ts).
- *SRP*: one fact added at one site; the SetAdvantage primitive already supports `bearer.*`-gated predicates.
- *Magic numbers*: the `2` divisor cites the 2024 Bloodied definition inline.
- *Mechanical outcomes asserted*: six boundary cases pin the predicate logic; trait shape pins the content wire.
- *Tests*: would have failed before the engine change (the fact wouldn't be in the facts map) and before the content change (Boar had `traits: []`).

**Pattern-check**: swept the bestiary + magic items for other RAW "while bloodied" mechanics that could now wire on the new fact. Boar is the only current pack user; the 2024 MM has several CR-2+ creatures with "Bloodied" triggers (e.g. Cyclops Wounded Fury, Tarrasque Frenzy, various dragons' Bloodied Breath recharge) that aren't in the starter pack yet but will all reuse this fact when authored. No regression risk: the fact is added to the attacker-side facts only, so existing predicates not referencing `bearer.bloodied` are unaffected.

**Content (slice 482): Animated Armor + Death Dog Multiattacks**

Seventh and eighth users of the slice-464 `MonsterMultiattack` content field. Both CR 1; both "two of same weapon" shapes.

RAW (SRD 5.2.1):
- **Animated Armor (CR 1)**: "Multiattack. The armor makes two Slam attacks. Slam: 1d6 bludgeoning."
- **Death Dog (CR 1)**: "Multiattack. The death dog makes two Bite attacks. Bite: 1d4 piercing + CON DC 12 disease arm (Poisoned + HP-max decay on repeated fails)."

Pure-content slice. Two new natural weapons (`animated-armor-slam`, `death-dog-bite`) + multiattack declarations on both statblocks.

**Deferred**: Death Dog's disease arm (CON save -> Poisoned + HP-max-decay on subsequent fails). Needs (a) repeating long-rest saves and (b) HP-max-decay accumulator. The base bite ships; the disease rider stays open.

**Doc-count update**: weapons 69 -> 71, items 532 -> 534.

