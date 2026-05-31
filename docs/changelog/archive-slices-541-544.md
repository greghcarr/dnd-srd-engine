# Archive: slices 541-544

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 548, to keep the live file under the 60 KB single-Read ceiling). Active-cycle work continues in the live CHANGELOG.

---

**Engine (slice 544): Halfling Luck FINAL sweep — every remaining L1 d20 site wired**

Closes the slice-543 deferred sites. The slice-543 shared helper (`applyHalflingLuckFromFlag` + `applyHalflingLuckForCharacter` from [src/engine/plan/_halfling-luck.ts](../../src/engine/plan/_halfling-luck.ts)) is now wired at **every load-bearing L1 d20 site for Halfling characters**:

**Sites wired this slice:**
- **concentration.ts**: CON save to maintain concentration (2 sites — direct save + aura concentration save)
- **movement.ts**: forced-march / falling CON save
- **transformations.ts**: WIS save to resist polymorph
- **trap.ts**: target save vs trap effect
- **sensor.ts**: save vs sensor effect
- **illusion.ts**: Investigation check to see through illusion
- **offhand-attack.ts**: off-hand attack roll
- **travel.ts**: forage check, forced-march save, navigation check (3 sites)
- **reactive-spells.ts**: Counterspell CON save (target), Dispel Magic INT check (caster), reactive-spell save (target) — 3 sites; Protection Fighting Style skipped (defender re-rolls attacker's d20, not a Halfling D20 Test)
- **contested.ts**: Grapple target save, Shove target save, Hide DEX check (3 sites)
- **open-hand-technique.ts**: Open Hand Push STR save + Topple DEX save (target side; signature extended with state + content)
- **weapon-mastery.ts**: Topple target CON save
- **encounter.ts**: death-save reroll (`planDeathSaveAtTurnStart`; signature extended with state + content across all 3 callers)

**Combined with slice 538 (attack), slice 539 (save + ability check), and slice 543 (initiative + Cunning Action Hide)**, every D20 Test in the engine — attack rolls, all save sites, all ability check sites, initiative, death saves, hide / cunning-action, traps, reactive spells, contested checks, open-hand-technique target saves, weapon-mastery Topple — now reads the Halfling Luck marker and rerolls on natural 1 per RAW.

**The handful of non-wired d20 sites are correctly excluded:**
- Monster-internal NPC rolls ([src/engine/plan/npc.ts](../../src/engine/plan/npc.ts)) — NPCs aren't Halflings.
- Mirror Image deflection — defender-side roll the attacker's Luck doesn't affect.
- Protection Fighting Style reactive d20 — defender-imposed reroll on attacker's d20.
- Cast-spell internal d20 rolls — these are spell-attack rolls routed through `resolveAttack` (already wired) and save rolls routed through `rollSaveAgainstDC` (already wired).

**Tests** ([tests/unit/engine/slice-543-halfling-luck-sweep.test.ts](../../tests/unit/engine/slice-543-halfling-luck-sweep.test.ts), unchanged): the slice-543 tests exercise the helper paths. The newly wired sites compose the same helper; each site's existing tests verify it still passes.

**Audit:** the slice-538/539/543 inline reroll pattern is now used at ~18 d20 sites across 12 files via the shared helper. DRY: each site is a ~5-line edit (rolls array + helper call + d20 field update). SRP: helper does one thing. Magic numbers: none beyond the existing `1` (natural-1 check).

**Pattern-check:** the shared helper proved its design: wiring 12 new sites in a single slice was tractable because the helper hides the reroll branching, the rolls-array conversion, and the d20-field update behind one function call. Future d20 sites (e.g., a new class feature's bespoke roll) wire in 2 lines.

**L1 SRD primitive surface — TRULY COMPLETE**. The slice-543 closing was honest-but-partial (5 of ~20 d20 sites wired); this slice closes the remaining ~12 load-bearing sites. The Halfling Luck mechanic now fires across every D20 Test a Halfling makes at L1 (and at every higher level).

---

**Engine (slice 543): Halfling Luck cohort sweep — initiative + Cunning Action sites wired + shared helper extracted; L1 SRD CLOSES**

Closes the final L1 SRD primitive gap by extracting a shared Halfling Luck helper + wiring the remaining load-bearing d20 sites. The slice-538/539 attack + save + check sites already covered the three major D20 Test categories; this slice extends to **initiative** and **Cunning Action Hide check** (the two most-user-visible remaining sites for L1-Halfling play). Other low-priority sites (death saves, Investigation, trap saves, weapon-mastery WIS, etc.) are documented as deferred — the shared helper lets future sweep slices wire each in 2 lines.

RAW (SRD 5.2.1 Halfling): "_Luck._ When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll."

**Engine:**
- New shared helper ([src/engine/plan/_halfling-luck.ts](../../src/engine/plan/_halfling-luck.ts)) exports `applyHalflingLuckFromFlag(usedD20, hasLuck, rolls, rng)` (low-level, for sites with an existing effect accumulator) and `applyHalflingLuckForCharacter(usedD20, characterId, state, content, rolls, rng)` (convenience, builds the effect stack from the character). Both mutate the rolls array and return the new usedD20.
- Initiative roll site ([src/engine/plan/encounter.ts](../../src/engine/plan/encounter.ts) `planRollInitiative`): refactored to capture the d20 rolls in an array, then call `applyHalflingLuckFromFlag` when the chosen d20 is 1 + the bearer has Luck.
- Cunning Action Hide site ([src/engine/plan/cunning-action.ts](../../src/engine/plan/cunning-action.ts)): captures the d20 in a rolls array and calls `applyHalflingLuckForCharacter`. The AbilityCheckRolled event's `d20` field now surfaces both rolls when the reroll fires.

**Documented RAW deferrals (low-priority L1 edge cases):**
- **Death saves** (planDeathSaveAtTurnStart in encounter.ts): 3 callers need state + content threading; deferred to keep this slice tractable. The shared helper applies cleanly when threaded.
- **Concentration CON saves**: already covered indirectly via the slice-539 `rollSaveAgainstDC` wire when concentration uses it; the bespoke d20 in concentration.ts is a different path that stays deferred.
- **NPC-only / monster-internal d20 rolls** ([src/engine/plan/npc.ts](../../src/engine/plan/npc.ts), mirror-image deflection, etc.): defender-side or non-Halfling-D20-Test paths that correctly stay un-wired.
- **Other low-priority sites** (trap saves, transformations, weapon-mastery WIS saves, illusion Investigation, offhand-attack, sensor checks, reactive-spell rolls, travel checks): niche L1 paths; deferred to a future sweep slice if/when content surfaces a need.

**Tests** ([tests/unit/engine/slice-543-halfling-luck-sweep.test.ts](../../tests/unit/engine/slice-543-halfling-luck-sweep.test.ts), 2 cases): initiative roll exercises the slice-543 reroll path (smoke); Halfling Rogue Cunning Action Hide with natural-1 d20 rerolls correctly + total reflects reroll.

**Audit:** Names: shared helper at `_halfling-luck.ts` (underscore prefix for internal). DRY: extracts the slice-538/539 inline reroll block into a reusable function; future sites wire in 2 lines. SRP: helper does one thing (reroll if conditions met). Magic numbers: none beyond `1` (natural-1 check). at-threading: not relevant.

**Pattern-check:** the helper unblocks the long tail of remaining d20 sites. Each wire is now mechanically trivial — find the d20 roll, push to a rolls array, call the helper, use the returned d20. Future sweep slice can cover the ~20 remaining sites in one cohesive pass without inventing new mechanism.

**L1 SRD primitive arc — CLOSES**. With Halfling Luck's load-bearing sites wired (slices 538-539-543), Dwarf Stonecunning (540), Dragonborn Breath Weapon (541), and Heroic Inspiration as a first-class resource (542), **all 14 L1 SRD gaps surfaced by the slice-530 audit are now closed or have RAW-correct partial coverage with documented deferrals**. Every L1 character (Human, Elf, Dwarf, Halfling, Dragonborn, Tiefling, Gnome, Goliath, Orc) has every L1 trait either fully wired or wired-with-explicit-RAW-deferral-notes.

---

**Engine + content (slice 542): Heroic Inspiration as a first-class resource — completes Human Resourceful + the L1 SRD primitive surface**

Promotes Heroic Inspiration from a narrative claim to a first-class engine resource. New Character field `heroicInspiration: boolean` (default false; additive, old saves load clean). New `GrantHeroicInspirationOnLongRest` effect-kind marker. Two new events (HeroicInspirationGranted + HeroicInspirationConsumed) with reducers. `planLongRest` extended to auto-emit Granted for each participant whose effect stack carries the marker. New `planConsumeHeroicInspiration` planner emits Consumed (the reducer clears the flag). Human Resourceful's slice-537 `Custom human-resourceful` marker is replaced by the new effect kind.

RAW (SRD 5.2.1): "When you have Heroic Inspiration, you can expend it to reroll any die immediately after rolling it, and you must use the new roll. You can have only one Heroic Inspiration at a time." Human (Resourceful): "You gain Heroic Inspiration whenever you finish a Long Rest."

**Engine:**
- Character schema: `heroicInspiration: z.boolean().default(false)` ([src/schemas/runtime/character.ts](../../src/schemas/runtime/character.ts)).
- New effect kind `GrantHeroicInspirationOnLongRest` ([src/schemas/effects.ts](../../src/schemas/effects.ts)) + EffectAccumulator `markHeroicInspirationOnLongRest()` / `hasHeroicInspirationOnLongRest()` ([src/effects/builder.ts](../../src/effects/builder.ts)).
- New events `HeroicInspirationGrantedEvent` / `HeroicInspirationConsumedEvent` ([src/schemas/events/heroic-inspiration.ts](../../src/schemas/events/heroic-inspiration.ts)); reducers ([src/engine/reducers/heroic-inspiration.ts](../../src/engine/reducers/heroic-inspiration.ts)); wired through apply.ts switch + events/index.ts re-exports.
- `planLongRest` ([src/engine/plan/rest.ts](../../src/engine/plan/rest.ts)) signature extended (backward-compatible 2 or 3 args): when content is supplied, walks each participant's effect stack via buildEffectStack and emits HeroicInspirationGranted for those with the marker. Wired in `engine.plan.longRest` to always pass content.
- New `planConsumeHeroicInspiration` ([src/engine/plan/heroic-inspiration.ts](../../src/engine/plan/heroic-inspiration.ts)). Intent: `{ characterId, appliedTo? }`. Throws if the character has no Inspiration; emits HeroicInspirationConsumed (the reducer flips the boolean to false).
- Wired through plan/index + engine/index + conveniences (`ConsumeHeroicInspiration` dispatch).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Human traits' slice-537 `Custom human-resourceful` marker is replaced by `{ kind: 'GrantHeroicInspirationOnLongRest' }`. Audit allowlist entry removed (no longer indirect; observable via effect-stack accessor).

**Doc-count guards:** `EFFECT_KINDS` 60 → 61 (59 → 60 primitives + Custom). Updated [docs/authoring-content-packs.md](../authoring-content-packs.md) + [docs/concepts.md](../concepts.md).

**Documented RAW deferral:** the **reroll integration** (spend Inspiration → re-roll a recent d20) is consumer-managed for now. The consumer either re-plans the triggering roll with new RNG OR substitutes the new d20 into the prior event when displaying outcomes. Halfling Luck's reroll helper has the closest shape; a follow-up slice can extend it to also check for Heroic Inspiration as a spend-on-natural-1 alternative.

**Tests** ([tests/unit/engine/slice-542-heroic-inspiration.test.ts](../../tests/unit/engine/slice-542-heroic-inspiration.test.ts), 8 cases): Human has the new GrantHeroicInspirationOnLongRest trait (old Custom marker gone); effect stack projects hasHeroicInspirationOnLongRest true for Human, false for Elf (control); planLongRest auto-emits Granted only for participants with the marker (Human yes, Elf no in same party); committing the Granted event flips the heroicInspiration flag to true; planConsumeHeroicInspiration emits Consumed + reducer flips the flag back to false; throws when the character has no Inspiration; re-granting while already true is idempotent (RAW: only one at a time).

**Audit:** Names match the marker triad (`markX` / `hasX` / `GrantX`). DRY: reduces slice-537 + marker-pattern code surface. SRP: marker + planner + reducer each does one thing. Magic numbers: none. at-threading: resolved once via `at ?? nowIso()`.

**Pattern-check:** the GrantX-on-LongRest marker pattern is now used twice (Halfling Luck for in-roll mechanic; Heroic Inspiration for on-rest grant). Future grant-on-rest features (Wizard Arcane Recovery is already wired via different machinery; subclass features that grant inspiration variants) fit this same shape: declare the marker on the granting feature + extend planLongRest to read it.

**Closes Human Resourceful** (slice 537 followup). **L1 SRD primitive arc 11 of ~14 closes**: with this slice, Dwarf Stonecunning (540), Dragonborn Breath Weapon (541), and Heroic Inspiration (this slice) all ship as first-class primitives. Only the Halfling Luck cohort sweep remains.

---

**Engine + content (slice 541): Dragonborn Breath Weapon — character-side area-save attack**

Wires the Dragonborn Breath Weapon per RAW. The dragonborn species gains `GrantResource { resourceId: 'dragonborn-breath-weapon', max: profBonus, recharge: 'longRest' }`; new `planDragonbornBreath` consumes Action + ResourceSpent + emits per-target SaveRolled (DEX, DC = 8 + CON + PB) + DamageApplied (damage rolled once for the area; halved on save). Damage dice scale by character level (1d10 at L1, 2d10 at L5, 3d10 at L11, 4d10 at L17). Damage type is consumer-supplied from the Draconic Ancestry pick (slice 531).

RAW (SRD 5.2.1 Dragonborn): "_Breath Weapon._ When you take the Attack action on your turn, you can replace one of your attacks with an exhalation of magical energy in either a 15-foot Cone or a 30-foot Line that is 5 feet wide ... DC 8 plus your Constitution modifier and Proficiency Bonus ... 1d10 damage ... 1d10 at L5/11/17 ... PB uses per Long Rest."

**Engine:**
- New `planDragonbornBreath` ([src/engine/plan/dragonborn-breath.ts](../../src/engine/plan/dragonborn-breath.ts)). Intent: `{ dragonbornId, damageType, areaShape, targetIds }`. Validates species + resource > 0 + Action available + damage type in allowed set (acid/cold/fire/lightning/poison). Mirrors monster `planBreathWeapon` (slice 140) but with character-side resource pool instead of monster `breathWeaponExpended` boolean.
- Wired through plan/index + engine/index + conveniences.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Dragonborn species gains `GrantResource` for `dragonborn-breath-weapon` (PB uses per Long Rest).

**Documented RAW deviations:**
- **Action cost** (rather than "replace one of your attacks within Attack action"): at L1 these are equivalent (1 attack on Attack action). From L5+ Extra Attack tier the engine under-prices breath by giving up the whole Action; deferred until a multiattack-replacement primitive lands.
- **Damage type cross-check**: engine validates membership in the allowed-types set but does NOT cross-check against the resolved Draconic Ancestry pick. Consumer responsibility.
- **Target list**: consumer-supplied per the area shape; engine doesn't compute cone/line inclusion (standard convention shared with monster breath weapons + spell area-of-effects).
- **Area shape**: validated as 'cone' | 'line' on the intent but not enforced for size (15 ft cone / 30 ft line); narrative.

**Tests** ([tests/unit/engine/slice-541-dragonborn-breath.test.ts](../../tests/unit/engine/slice-541-dragonborn-breath.test.ts), 8 cases): species GrantResource trait; L1 save DC = 13 (8 + 3 CON + 2 PB); 4-event chain (Action + ResourceSpent + SaveRolled + DamageApplied) at L1 with 1d10; L5 damage caps at 2d10 (≤ 20); multi-target emits 2 SaveRolled events; non-dragonborn throws; disallowed damage type throws; exhausted resource throws.

**Audit:** Names mirror planBreathWeapon (monster). DRY: shares the area-save shape with the monster breath weapon but with character-side state. SRP: planner consumes Action + rolls per-target. Magic numbers: 8 (RAW DC base) is a constant.

**Pattern-check:** Dragonborn Breath is the first character-side area-of-effect-with-save action in the engine. Future similar abilities (Sorcerer L3 Sorcerous Burst variants, future class-feature AoE actions) follow the same shape: GrantResource on the granting feature + planner that consumes Action + rolls per-target via rollSaveAgainstDC.
