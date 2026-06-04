# Archive: slices 536-540

Per-slice detail extracted from the live [CHANGELOG.md](../../CHANGELOG.md) (slice 545, to keep the live file under the 60 KB single-Read ceiling). Active-cycle work continues in the live CHANGELOG.

---

**Engine + content (slice 540): Dwarf Stonecunning — per-Long-Rest Bonus Action tremorsense**

Wires the Dwarf's Stonecunning trait per RAW. The dwarf species gains a `GrantResource { resourceId: 'stonecunning', max: profBonus, recharge: 'longRest' }` declaration; a new `stonecunning-active` condition projects `GrantSense tremorsense 60` while active; new `planStonecunning` planner consumes Bonus Action + ResourceSpent + applies the condition.

RAW (SRD 5.2.1 Dwarf): "_Stonecunning._ As a Bonus Action, you gain Tremorsense with a range of 60 feet for 10 minutes. You must be on a stone surface or touching a stone surface to use this Tremorsense. The stone can be natural or worked. You can use this Bonus Action a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest."

**Engine:**
- New `planStonecunning` ([src/engine/plan/stonecunning.ts](../../src/engine/plan/stonecunning.ts)). Intent: `{ dwarfId, onStoneSurface }`. Validates dwarf species + has resource > 0 + active combatant + BA available + on-stone-surface flag from intent. Emits `ActionEconomyConsumed(bonusAction)` + `ResourceSpent(stonecunning, 1)` + `ConditionApplied(stonecunning-active)`. Mirror of `planAdrenalineRush` shape.
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts) (interface + type re-export + factory), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`Stonecunning` dispatch entry).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Dwarf species gains `{ kind: 'GrantResource', resourceId: 'stonecunning', max: { kind: 'profBonus' }, recharge: 'longRest' }`.
- New `stonecunning-active` Condition: `effects: [{ kind: 'GrantSense', sense: 'tremorsense', range: 60 }]`, non-stackable, no autoExpiry (consumer-managed 10-min duration).

**Doc-count updates:** conditions 131 → 132 (116 → 117 mechanic-rider, 114 → 115 with effects). Updated [docs/getting-started.md](../getting-started.md), [docs/starter-pack-gaps.md](../starter-pack-gaps.md), [docs/status.md](../status.md) (both rows).

**Documented RAW deviations (consumer-managed):**
- **10-minute duration**: the engine doesn't tick wall-clock outside encounters; the consumer ends the condition after 10 in-fiction minutes (or whatever rule they enforce). Inside encounters, the consumer can stamp `expiresOnRound: currentRound + 100` if they want; the planner doesn't auto-stamp.
- **On-stone-surface gate**: consumer signals via `intent.onStoneSurface`. The engine has no surface-contact model.
- **Resource auto-population**: the species `GrantResource` declaration is read at character-build time by consumers; the runtime `character.resources` array is consumer-populated (mirror of Orc Adrenaline Rush). The test fixture demonstrates the convention.

**Tests** ([tests/unit/engine/slice-540-dwarf-stonecunning.test.ts](../../tests/unit/engine/slice-540-dwarf-stonecunning.test.ts), 8 cases): species trait shape; condition shape with GrantSense tremorsense 60; L1 dwarf carries 2 uses (PB +2); planner emits 3-event chain; post-commit tremorsense projects via effect stack + resource decrements; throws without onStoneSurface gate; throws for non-dwarf; throws when uses exhausted.

**Audit:** Names mirror planAdrenalineRush. DRY: 2 sibling planners, no factoring. SRP: planner consumes BA + grants tremorsense. Magic numbers: `60` (RAW) in the condition, not the planner. at-threading: resolved once.

**Pattern-check:** "species per-rest resource + condition projector + planner that consumes BA and grants condition" shape now used by Orc Adrenaline Rush + Dwarf Stonecunning. Future similar traits mirror.

---

**Engine (slice 539): Halfling Luck — complete the primitive at save + ability-check sites**

Completes the slice-538 partial primitive. The save + check d20 sites now reroll on natural 1 when the bearer carries the `GrantHalflingLuck` marker, matching RAW's "D20 Test" scope (attack + save + check). `SaveResult` and `AbilityCheckResult` both gain a `hasHalflingLuck: boolean` flag surfaced from the bearer's effect stack; the three roll-site planners ([_save-roll.ts](../../src/engine/plan/_save-roll.ts) `rollSaveAgainstDC`, [checks.ts](../../src/engine/plan/checks.ts) `planSave` + `planAbilityCheck`) read the flag and reroll.

RAW (SRD 5.2.1 Halfling): "_Luck._ When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll."

**Engine:**
- `SaveResult.hasHalflingLuck: boolean` ([src/derive/save.ts](../../src/derive/save.ts)) — surfaced from `effects.hasHalflingLuck()`.
- `AbilityCheckResult.hasHalflingLuck: boolean` ([src/derive/ability-check.ts](../../src/derive/ability-check.ts)) — same.
- Reroll wire in [src/engine/plan/_save-roll.ts](../../src/engine/plan/_save-roll.ts) (used by recurring-save / Land's Aid / intimidating-presence / spell on-hit-save / breath-weapon save / etc.).
- Reroll wire in [src/engine/plan/checks.ts](../../src/engine/plan/checks.ts) `planSave` (the direct save planner) + `planAbilityCheck` (the direct check planner). All three sites are ~5-line `if usedD20 === 1 && hasLuck { reroll; rolls.push(reroll); usedD20 = reroll; }` blocks.

**Documented RAW deferrals (cohort-sweep follow-up):**
- **~25 other d20 sites** in planners still need the same insertion: initiative ([encounter.ts](../../src/engine/plan/encounter.ts) lines 127 + 202-210), death saves, concentration CON saves ([concentration.ts](../../src/engine/plan/concentration.ts) lines 111, 279), nimble-escape DEX ([nimble-escape.ts](../../src/engine/plan/nimble-escape.ts) line 112), cunning-action Hide ([cunning-action.ts](../../src/engine/plan/cunning-action.ts) line 143), reactive-spell rolls ([reactive-spells.ts](../../src/engine/plan/reactive-spells.ts) multiple sites), offhand-attack, weapon-mastery, trap, transformations, etc. Each is the same one-block insertion; a future sweep slice handles them all in one cohesive pass.
- The most user-visible sites (attack + save + check) are now covered, so the L1-Halfling-playing experience matches RAW for the three most-common D20 Tests.

**Tests** ([tests/unit/engine/slice-539-halfling-luck-save-check.test.ts](../../tests/unit/engine/slice-539-halfling-luck-save-check.test.ts), 7 cases): `SaveResult.hasHalflingLuck` projects true for Halfling, false for Human; same for `AbilityCheckResult`; end-to-end seed-iteration finds a natural-1 save for a halfling and confirms reroll fires + d20 array has 2 entries + total reflects the reroll; control case confirms Human's natural 1 stays a 1 with d20 length 1; same end-to-end test for ability checks.

**Audit:**
- **Names:** `hasHalflingLuck` field on both result types mirrors `hasAdvantage` / `hasDisadvantage`.
- **DRY:** the reroll block is duplicated across 3 sites (~5 lines each). Below the abstraction threshold; if the cohort sweep slice covers ~25 more sites, the helper extraction is the natural moment.
- **SRP:** each derive function surfaces the flag; each planner consumes it.
- **Magic numbers:** none beyond the existing literal `1`.
- **at-threading:** N/A.
- **Mechanical outcomes asserted:** flag projection (positive + negative control) for both result types, end-to-end reroll fires for save + check, control cases no reroll without Luck.

**Pattern-check:** the "derive surfaces a flag + planner consumes it" shape repeats from the existing `hasAdvantage` / `hasDisadvantage` precedent. The slice-538 attack-roll wire used a different pattern (read the EffectAccumulator directly in the planner) because attack.ts already has the effect stack handy. The save + check sites don't directly hold the stack, so surfacing via the derivation is the cleaner pattern. **Both patterns are valid**; the choice depends on what's available at the call site.

---

**Engine + content (slice 538): Halfling Luck — new `GrantHalflingLuck` marker + attack-roll reroll-on-natural-1 wire**

Wires Halfling's Luck trait per RAW (attack-roll arm). New effect kind `GrantHalflingLuck` (presence marker) + `markHalflingLuck()` / `hasHalflingLuck()` accessor on EffectAccumulator + the attack-roll site in `planAttack` reads the accessor and rerolls when the chosen d20 (post-advantage/disadvantage selection) is a natural 1. The reroll is appended to the `d20` array on the event so consumers can see it happened; RAW "you must use the new roll" means no second reroll even if the new die is also a 1.

RAW (SRD 5.2.1 Halfling): "_Luck._ When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll."

**Engine:**
- New `GrantHalflingLuck` effect kind ([src/schemas/effects.ts](../../src/schemas/effects.ts), added to union + Zod + `EFFECT_KINDS`).
- `markHalflingLuck()` + `hasHalflingLuck()` on EffectAccumulator ([src/effects/builder.ts](../../src/effects/builder.ts)).
- Attack-roll reroll wire at [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts) ~line 884 (the main attack `usedRoll` computation). Reads `attackerEffects.hasHalflingLuck()`; rerolls when chosen d20 === 1; appends the reroll to the d20 array.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Halfling traits gain `{ kind: 'GrantHalflingLuck' }`.

**Doc-count guards:** `EFFECT_KINDS` 59 → 60 (58 → 59 primitives + Custom). Updated [docs/authoring-content-packs.md](../authoring-content-packs.md) + [docs/concepts.md](../concepts.md).

**Documented RAW deferrals (follow-up slices):**
- **Save d20 sites** (rollSaveAgainstDC + computeSavingThrow): not yet wired. A Halfling making a saving throw with a natural-1 d20 does not yet reroll. Same one-block-insertion pattern as this slice; a follow-up slice can sweep.
- **Ability check d20 sites** (computeAbilityCheck + planAbilityCheck): same shape, not yet wired.
- **~25 other d20 sites** (initiative, death saves, concentration CON saves, nimble-escape DEX, cunning-action Hide, reactive-spell rolls, offhand-attack, weapon-mastery, trap, transformations, encounter rolls): each is the same insertion. A future cohort sweep covers them all.
- **Mirror-image deflection** (attack.ts ~line 115) is correctly NOT wired (it's a defender-side roll the attacker's Luck wouldn't affect).

**Audit:**
- **Names:** `GrantHalflingLuck` / `markHalflingLuck` / `hasHalflingLuck` mirror the slice-518 / slice-519 `GrantPactBlade` / `GrantPactChain` marker triad shape.
- **DRY:** the reroll logic is one ~5-line block in attack.ts; future sites copy the same block. At ~5 lines × 25 sites, this is below the abstraction threshold for now; if the cohort sweep slice extracts a helper, refactor then.
- **SRP:** marker + accessor + one site change. Each does one thing.
- **Magic numbers:** none beyond the existing `NAT_1` constant.
- **at-threading:** N/A (reroll is consumed during plan; the rolled value bakes into the existing event).
- **Mechanical outcomes asserted:** marker projection (positive + negative control), end-to-end reroll fires on attack with natural 1, control case no reroll without Luck.

**Tests** ([tests/unit/engine/slice-538-halfling-luck.test.ts](../../tests/unit/engine/slice-538-halfling-luck.test.ts), 5 cases): Halfling species ships the marker; `hasHalflingLuck()` projects true on Halflings + false on Humans (control); end-to-end seed-iteration finds a natural 1 attack and confirms reroll fires + d20 array has 2 entries + total reflects the reroll; control case confirms Human's natural 1 stays a 1 with d20 length 1.

**Pattern-check:** Halfling Luck closes one of the four remaining L1 SRD primitive gaps (attack arm only; save + check arms follow). The reroll-on-natural-1 mechanism is unique to Halflings in the SRD; no other species or feat shares the shape, so this primitive is canonical with one user. Future variants (e.g., a feat that grants reroll-on-1 with limited uses per day) would compose with this marker's plumbing.

---

**Content (slice 537): Human Resourceful — narrative marker trait**

Wires Human's Resourceful trait per RAW as a declarative Custom-handler marker. **Heroic Inspiration is not modeled in the engine at all today** (no field on Character, no events, no planner, no reroll mechanic). The full Heroic Inspiration primitive — grant on Long Rest + consume to reroll any d20 — is a substantial multi-slice primitive deferred to a future dedicated slice.

RAW (SRD 5.2.1 Human): "_Resourceful._ You gain Heroic Inspiration whenever you finish a Long Rest."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Human traits gain `{kind: 'Custom', handlerId: 'human-resourceful'}`. Audit allowlist documents why no engine handler is needed (engine has no Heroic Inspiration resource model yet). A consumer that DOES model Heroic Inspiration can detect this marker and grant an Inspiration token on Long Rest.

**Tests** ([tests/unit/engine/slice-537-human-resourceful.test.ts](../../tests/unit/engine/slice-537-human-resourceful.test.ts), 2 cases): human-resourceful Custom marker ships; pre-existing Human traits unchanged (Skillful + Versatile OfferChoices intact).

**Audit (content-sweep abbreviated):** zero new mechanism; reuses Custom-marker narrative-trait pattern.

**L1 SRD audit progress (10 of ~14 gaps closed):**
- ✓ slices 530-536 + Human Resourceful (this slice)
- ⏳ Halfling Luck (reroll-on-1 primitive), Dwarf Stonecunning (per-day BA tremorsense primitive), Dragonborn Breath Weapon (character-side primitive), **Heroic Inspiration primitive** (Resourceful's full implementation).

**Pattern-check:** 7 Custom-marker traits in the pack (martial-arts, nimble-escape × 2 monsters, halfling-nimbleness, halfling-naturally-stealthy, elf-trance, human-resourceful). The pattern remains the canonical "declaratively present but consumer-managed" shape. The Custom-marker class now segments cleanly into three sub-flavors: (a) "engine models the rule but keys off something other than the handlerId" (martial-arts, slow-fall), (b) "narrative rule the engine genuinely doesn't model" (halfling-nimbleness, halfling-naturally-stealthy, elf-trance), and (c) "engine could model this but hasn't yet" (human-resourceful awaiting the Heroic Inspiration primitive). Pattern is stable.

**Docs hygiene (slice 537 also)**: archived slices 525-529 detail to [docs/changelog/archive-slices-525-529.md](archive-slices-525-529.md) to keep the live CHANGELOG under the 60 KB single-Read ceiling (59.2 KB before the cut; ~44.5 KB after).

---

**Content (slice 536): Elf Trance — narrative marker trait**

Wires the Elf Trance trait per RAW. All three arms are narrative/consumer-managed (no-sleep state, magic-can't-put-to-sleep gate, 4-hour Long Rest). Ships as a Custom-handler marker (mirror of slice 535's Halfling markers + the long-established nimble-escape pattern). Added to pack-integrity's BACKED_INDIRECTLY allowlist.

RAW (SRD 5.2.1 Elf): "_Trance._ You don't need to sleep, and magic can't put you to sleep. You can finish a Long Rest in 4 hours if you spend those hours in a trancelike meditation, during which you retain consciousness."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): Elf traits gain `{kind: 'Custom', handlerId: 'elf-trance'}`. Audit allowlist entry documents why no engine handler is needed (engine doesn't model sleep state, magical-sleep gates, or rest-wall-clock duration).

**Tests** ([tests/unit/engine/slice-536-elf-trance.test.ts](../../tests/unit/engine/slice-536-elf-trance.test.ts), 2 cases): elf-trance Custom marker ships; pre-existing Elf traits unchanged (no regression on Darkvision / Fey Ancestry / Keen Senses / Elven Lineage).

**Audit (content-sweep abbreviated):** zero new mechanism; reuses Custom-marker narrative-trait pattern.

**L1 SRD audit progress (9 of ~14 gaps closed):**
- ✓ slices 530-535 + Elf Trance (this slice)
- ⏳ Halfling Luck (reroll-on-1 primitive), Dwarf Stonecunning (per-day BA tremorsense primitive), Dragonborn Breath Weapon (character-side primitive), Human Resourceful (Heroic Inspiration on Long Rest), Goliath Powerful Build / Giant Ancestry (need to re-audit Goliath specifically).

**Pattern-check:** 6 Custom-marker traits in the pack now (martial-arts, nimble-escape × 2 monsters, halfling-nimbleness, halfling-naturally-stealthy, elf-trance). The pattern is fully canonical for "RAW trait the engine cannot model + consumer should know about." Position-aware consumers, VTTs, character-sheet UIs all benefit from the declarative presence.
