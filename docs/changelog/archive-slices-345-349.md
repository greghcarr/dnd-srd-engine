# CHANGELOG archive: slices 345-349 (post-alpha.11 cohort, part 1)

Per-slice detail for slices 345-349, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 350 when it approached the 60 KB single-Read ceiling. These are part of the post-alpha.11 Unreleased cohort; the live CHANGELOG keeps a cohort summary + pointer, with the most recent slice (350) inline.

Cohort theme: the subclass-documentation reconciliation (345); the Tier-A subclass-authoring slices off the reconciled queue (346 Devotion Spells + Draconic Resilience HP, 347 Evocation Savant); and the first Tier-B subclass features (348 Hunter Colossus Slayer, 349 Fiend Dark One's Blessing).

---

**Engine + content: Fiend Patron Dark One's Blessing + `GrantTempHP` trigger action (slice 349)**

New `GrantTempHP` `TriggerAction` (sibling of the on-event `Heal` action): grants Temporary Hit Points to the rider's **bearer** (not the triggering event's target), with a `number | Formula` amount resolved against the bearer's formula context (so it scales with level + ability mods). Emits the existing `TempHPGranted` event (max-not-additive semantics, slice 75). Handled in [src/engine/triggers/dispatch.ts](../../src/engine/triggers/dispatch.ts) `fireTrigger`; `buildFormulaContext` is now exported from [src/derive/effect-stack.ts](../../src/derive/effect-stack.ts) for the resolution.

Two new DamageApplied event facts: `event.sourceIsSelf` (the bearer dealt this damage) and `event.targetReducedToZero` (the target is at 0 HP after this damage; the DamageApplied trigger dispatch runs post-damage). Canonical user **Dark One's Blessing** (Fiend Warlock L3): an always-on `OnEvent` DamageApplied rider gated on both facts, granting `max(1, CHA mod + Warlock level)` temp HP when the warlock drops an enemy to 0.

Supporting fix: the weapon-attack planner now sets `DamageApplied.sourceCharacterId` to the attacker (previously unset on weapon attacks, though the spell / trap emitters already set it). This is what lets `event.sourceIsSelf` work, and is generally more correct attribution.

RAW deviations (documented on the rider): the "an ally drops a nearby enemy" arm is consumer-side (positions aren't modeled); an overkill hit on an already-0-HP creature also reads as a reduction-to-zero (firing on an already-downed enemy is a documented edge approximation).

Closes the fifth original L3 `effects: []` stub (now seven). New [tests/unit/engine/slice-349-dark-ones-blessing.test.ts](../../tests/unit/engine/slice-349-dark-ones-blessing.test.ts): the rider grants CHA-mod + warlock-level temp HP when an attack drops an enemy to 0, and grants nothing when the enemy survives.

Uncle Bob audit: **Names** `GrantTempHP` / `event.sourceIsSelf` / `event.targetReducedToZero` read as what they are. **DRY** reuses the OnEvent rider machinery, the `TempHPGranted` event + reducer, and `buildFormulaContext`/`evaluateFormula` (no new temp-HP path); the action mirrors the existing `Heal` action's `number | Formula` shape. **SRP** the trigger action only emits the grant; the formula resolution and temp-HP max-semantics live in their existing layers. **Magic numbers** the min-1 + CHA-mod + level live in a RAW-cited content formula, not code. **at-threading** the emitted event reuses the dispatch `at`; no RNG. **Mechanical outcomes asserted** the grant amount + target (bearer) on a kill, and no grant on a survivor; the source-attribution fix is exercised by the rider firing at all. **Tests** prevent the rider firing when the enemy lives and the amount/target regressing. No em/en dashes. Full suite green (302 files), `tsc --noEmit` clean. 12 golden transcripts regenerated to show the attacker as the damage source (purely additive "from X" attribution; damage values, HP transitions, and RNG streams unchanged); coverage snapshot gained `fiend-patron L3 dark-ones-blessing`.

**Engine + content: Hunter Colossus Slayer (first Tier-B subclass feature) (slice 348)**

First subclass feature needing engine work. **Hunter's Prey** (Ranger Hunter L3) wired as an `OfferChoice` (Colossus Slayer / Horde Breaker). The **Colossus Slayer** option is an `OnEvent` AttackRolled rider (`oncePer: turn`, `AddDamage 1d8`) gated on a new `event.targetMissingHp` fact, mirroring Sneak Attack's structure. **Horde Breaker** stays a deferred stub (needs an extra-attack-against-a-different-target primitive), the same wired/deferred split as Defensive Tactics.

Engine: `buildEventFacts` ([src/engine/triggers/dispatch.ts](../../src/engine/triggers/dispatch.ts)) now sets `event.targetMissingHp` (= `target.hp.current < target.hp.max`) on AttackRolled. The AttackRolled trigger dispatch runs on the post-AttackRolled / pre-DamageApplied state, so the fact reflects whether the target was *already* wounded (RAW: the extra die applies to an already-injured target, not one this hit just brought below max). This fact also unblocks the L11 Superior Hunter's Prey follow-up.

The 1d8 damage type is a fixed `piercing` approximation of "the weapon's type" (same convention the pack already uses for Sneak Attack). Closes the fourth of the original twelve L3 `effects: []` stubs (now eight); only Hunter's Lore remains a Hunter L3 stub (intentionally narrative).

New [tests/unit/engine/slice-348-colossus-slayer.test.ts](../../tests/unit/engine/slice-348-colossus-slayer.test.ts): the offered choice (Colossus Slayer wired, Horde Breaker stub), the rider fires on a hit against an already-wounded target, and does not fire against a full-HP target.

Uncle Bob audit: **Names** `event.targetMissingHp` reads as the RAW gate; `colossus-slayer` rider id matches the feature. **DRY** reuses the entire OnEvent / `oncePer: turn` / AddDamage rider machinery (Sneak Attack's shape) and the OfferChoice wired/stub pattern (Defensive Tactics); the only new code is one fact line. **SRP** the fact is computed where the target is already resolved for `targetCreatureType`; no new lookup. **Magic numbers** 1d8 RAW-cited in content, not code. **at-threading** unchanged (no new events; the rider folds into the existing attack damage). **Mechanical outcomes asserted** the fact's pre-damage timing (wounded vs full target), once-per-turn via the shared mechanism, and the offered option shape. **Tests** prevent the rider firing on a full-HP target (the timing bug) and the choice shape regressing. No em/en dashes. Full suite + `tsc --noEmit` to follow.

**Content: wire Evoker Evocation Savant (slice 347)**

Last clean Tier-A subclass spell-grant. **Evocation Savant** (Evoker L3) wired as an `OfferChoice oneOf:2` over the ten L1-2 evocation wizard spells in the pack (Burning Hands, Chromatic Orb, Magic Missile, Thunderwave, Acid Arrow, Continual Flame, Darkness, Gust of Wind, Scorching Ray, Shatter); each option grants its spell with `preparation: 'known'` (added to the spellbook). Resolving the choice (`ChoiceResolved`) folds the two picked spells into the effect stack's granted-spell list.

RAW-scope decisions (documented on the feature prompt + this entry): SRD says "two Evocation spells no higher than level 2, add to your spellbook" — narrowed to **leveled** L1-2 spells because cantrips are not spellbook entries. The "in addition, add one evocation spell whenever you gain a new spell-slot level" arm is deferred (needs an on-slot-level-gain trigger the engine doesn't expose).

Audit finding (no change made): the pack's `circle-of-the-land-cantrip` ("Circle of the Land: Bonus Cantrip") is a **2014-PHB feature, not in SRD 5.2.1** — verified against `references/srd-markdown/classes.md`, where the 2024 Circle of the Land L3 grants only Circle of the Land Spells + Land's Aid. Flagged in gaps-class-features.md + status.md as a content-authoring extra rather than an SRD stub to wire.

Closes the third of the original twelve L3 `effects: []` stubs (now nine). New [tests/unit/engine/slice-347-evocation-savant.test.ts](../../tests/unit/engine/slice-347-evocation-savant.test.ts) pins the offered option set (ten spells, oneOf:2, each a `known` grant) and that resolving two picks grants exactly those two. No engine change (`OfferChoice` + `GrantSpell` already consumed); `tsc --noEmit` clean.

**Content: wire two Tier-A subclass L3 features (slice 346)**

First subclass-authoring slice off the reconciled queue. Pure content on existing, consumed primitives:

- **Oath of Devotion, Devotion Spells**: the always-prepared oath-spell progression (`GrantSpell preparation: 'always-prepared'`) wired across L3 (Protection from Evil and Good, Shield of Faith), L5 (Aid, Zone of Truth), L9 (Beacon of Hope, Dispel Magic), L13 (Freedom of Movement, Guardian of Faith), and L17 (Commune, Flame Strike), the full SRD 5.2.1 table. Mirrors the Draconic / Fiend / Life Domain spell lists; level-gated by the subclass `levelGrants` machinery (a L9 paladin gets the L3+L5+L9 spells, not L13/L17).
- **Draconic Sorcery, Draconic Resilience (HP)**: `AddModifier { target: 'hpMax', value: {kind:'level', classId:'sorcerer'} }`, i.e. HP max increases to match sorcerer level (RAW: +3 at L3, +1 per level thereafter), gated to L3+. Completes the feature (the AC half was already wired via `OverrideACFormula`).

This closes two of the twelve L3 `effects: []` stubs (now ten). New [tests/unit/engine/slice-346-subclass-l3-wires.test.ts](../../tests/unit/engine/slice-346-subclass-l3-wires.test.ts) pins the devotion-spell progression at L3 / L9 / L17 (and the no-subclass / level-gating cases) and the per-level HP-max bonus (L3 / L6 / L20, with L2 and no-subclass at 0). gaps-class-features.md + status.md L3-stub lists updated.

Content audit (RAW match): the devotion spell table and the Draconic Resilience HP formula match SRD 5.2.1 (`references/srd-markdown/classes.md`); all ten oath spells are in the pack. No engine change; both effect kinds (`GrantSpell`, `AddModifier` with a level Formula) were already consumed by `effective-spell-list` / `character-view`. `tsc --noEmit` clean.

**Docs: reconcile the subclass documentation against the pack + SRD audit (slice 345)**

Audit of the existing subclass work surfaced several stale / inaccurate doc claims (no code or content was wrong; the pack is SRD-accurate). Ground truth: 12 subclasses (one per class, all SRD 5.2.1-matched), 58 feature entries, 31 with effects, 27 `effects: []` (12 at L3, 15 at L6+). Corrected:

- [docs/gaps-class-features.md](../gaps-class-features.md): the subclass paragraph was frozen at the "batch 1.x" snapshot and never updated for slices 204-218. Fixed three stale claims: Draconic **Elemental Affinity** is a full wire (slice 204 added the `modifierSum('damage')` fold), not "deferred"; Life Domain **Spells** are wired (`GrantSpell` has had an engine consumer since slice 212), not "schema-only"; Hunter **Defensive Tactics** is partially wired (Escape the Horde arm, slice 206), not an all-deferred stub; and Life Domain **Supreme Healing** is a full wire (`GrantMaxHealingDice`, slice 205). Added the missing Evoker note (it carries an L6 row). Rewrote the L3-stub list, which had mislabeled **Sculpt Spells** as an L3 stub (it is an L6 feature, matching SRD 5.2.1), listed Fiend Patron Spells as a stub (it is wired), and listed a main-class feature (Wild Shape forms); the corrected list is the 12 actual L3 `effects: []` stubs.
- [docs/srd-5.2.1-audit-classes.md](../srd-5.2.1-audit-classes.md): the "Real level-placement drift (13 entries)" table presented already-fixed drifts as an open work queue, contradicting the prose ("all closed in slices 174-176"). Verified four entries plus Sculpt Spells against the current pack (all at their SRD levels) and relabeled the table as a resolved historical record. Reconciled the status-counts row, which still claimed "41 SRD-listed subclass features missing," with the post-batch figures (~40 beyond L3, ~8 wired/partial, ~13 outstanding; defers to Layer 4).
- [docs/status.md](../status.md): fixed the same Sculpt-Spells-as-L3-stub error in the Subclasses row and listed the full set of L3 stubs.

Pure docs reconciliation; no code, content, or counts in the pack changed. No new em/en dashes introduced (the three docs' pre-existing counts went down, not up). doc-size audit green.
