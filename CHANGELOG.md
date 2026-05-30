# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content (slice 527): at-will Invisibility for Imp / Quasit / Sprite via monster-trait GrantSpell**

Wires the Imp + Quasit + Sprite Invisibility actions per RAW. **Zero engine code** — the slice is pure-content. Discovered while scoping the next monster primitive: three independent pre-existing pieces compose to make at-will monster spellcasting work today, without any new schema or planner.

RAW (each, paraphrased): "The {monster} casts Invisibility on itself, requiring no spell components and using Charisma as the spellcasting ability."

**The discovery:** what looked like a substantial new primitive ("monster-action-self-cast-condition") was already supported by composing three slices that landed years apart:

1. **Slice 444-ish**: monster statblock `traits[]` array folds verbatim into the bearer's effect stack ([src/derive/effect-stack.ts](src/derive/effect-stack.ts) `collectMonsterEffects` line 223).
2. **Slice 212**: `characterKnowsSpell` consults the effect stack via `effectiveSpellList`, so GrantSpell entries projected from any source (subclass, item, **monster trait**) make the spell castable.
3. **Slice 513**: the cast-spell `noSlotCost` derivation detects `preparation: 'at-will'` on granted spells and skips SpellSlotConsumed emission entirely.

Together, an at-will GrantSpell trait on a monster makes the monster cast that spell for free. No new pathway needed.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Imp `traits` gain `{ kind: 'GrantSpell', spellId: 'invisibility', preparation: 'at-will', spellcastingAbility: 'CHA' }`.
- Quasit `traits` gain the same.
- Sprite `traits` (previously `[]`) become `[{ kind: 'GrantSpell', spellId: 'invisibility', ...}]`.

No counts move (traits aren't doc-count guarded; the spell + condition are pre-existing).

**Tests** ([tests/unit/engine/slice-527-monster-at-will-invisibility.test.ts](tests/unit/engine/slice-527-monster-at-will-invisibility.test.ts), 9 cases — 3 monsters × 3 assertions each via `it.each`): trait shape ships correctly; effect stack projects `grantedSpells().invisibility` with `at-will` + `CHA`; `engine.plan.castSpell` resolves with `ConditionApplied(invisible)` + `ConcentrationStarted` and **no** `SpellSlotConsumed` / `PactSlotConsumed`.

**Documented RAW deviations (deferred, all three monsters):**
- "Requiring no spell components" — the engine doesn't gate cast-spell on V/S/M availability (components are narrative); non-deviation in practice.
- Imp + Quasit Shape-Shift action stays deferred (needs monster-action polymorph primitive).
- Quasit Scare (1/Day) reaction stays deferred (needs per-day-uses + reaction-with-save-or-condition primitive).
- Sprite Enchanting Bow (ranged 1-piercing + Charmed-on-hit) stays deferred (small slice; would be a slice-321 mirror).

**Audit (content-sweep abbreviated):**
- **Names:** GrantSpell trait shape matches the existing slice-513 invocation pattern verbatim.
- **DRY:** zero new mechanism; three pre-existing slices compose. No new identifiers anywhere.
- **SRP:** each composed slice still does one thing; this slice authors three monster traits.
- **Magic numbers:** none.
- **Mechanical outcomes asserted:** trait shape, effect-stack projection, end-to-end cast emits the right events and skips the slot consumption event.

**Pattern-check:** this slice changes how to think about monster spellcasting going forward. The deferred-mechanics doc ([docs/gaps-monsters-deferred-mechanics.md](docs/gaps-monsters-deferred-mechanics.md)) lists "Innate Spellcasting (per-spell envelope flavor)" as a substantial deferred primitive needing "monster-spellcasting deferral... per-spell at-will / per-day usage envelope." **For the at-will arm specifically, that primitive already exists.** Authoring a monster trait `{kind: 'GrantSpell', spellId: X, preparation: 'at-will', spellcastingAbility: Y}` is the canonical shape. **The per-day arm still needs a new primitive** (per-spell usage counter + per-day reset trigger), but the at-will arm should be migrated from the "deferred" list to the "wire as content" list.

The at-will-spell monsters in the pack that should next get this treatment (per the deferred-mechanics doc's Innate Spellcasting list): Cloud Giant (Detect Magic, Fog Cloud), Storm Giant (Detect Magic, Feather Fall, Levitate, Light), Couatl (Detect Evil and Good, Detect Magic, Detect Thoughts), Unicorn (Detect Evil and Good, Druidcraft, Pass without Trace), Deva, Planetar, Solar (Detect Evil and Good, Invisibility self-only). Each is a 1-3-line content slice now, not a new-primitive slice. Tracked.

---

**Content (slice 526): Quasit Rend natural weapon — completes the Pact of the Chain familiar combat surface**

Wires the Quasit's Rend action per RAW. Same shape as Giant Centipede Bite (slice 477) but slashing instead of piercing. Quasit's Magic Resistance was already wired; Invisibility / Shape-Shift / Scare stay deferred (each requires its own primitive). **This closes the Pact of the Chain familiar combat surface: all 7 RAW special-form familiars (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite, Imp, Quasit, Skeleton) now have wired primary-attack routes.** (Skeleton uses generic Shortsword/Shortbow + has no RAW Multiattack.)

RAW (SRD 5.2.1 Quasit, CR 1, Tiny Fiend (Demon)): "Rend. Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Slashing damage, and the target has the Poisoned condition until the start of the quasit's next turn."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `quasit-rend` weapon definition: 1d4 slashing primary + slice-321 unconditional onHit `applyConditionId: 'poisoned'` rider (Giant Centipede Bite mirror, recolored to slashing).

**Doc-count updates:** pack weapons 79 -> 80, items 543 -> 544.

**Documented RAW deviations (still deferred):**
- **Invisibility** (action, at-will, self-cast): sibling gap with Imp + Sprite. Needs the monster-action-self-cast-condition primitive.
- **Shape-Shift** (action; polymorph between true form / bat / centipede / toad with speed-only stat changes): sibling gap with Imp. Needs the monster-action-polymorph primitive composed with the existing spell-side polymorph planner.
- **Scare** (1/Day reaction, WIS DC 10 -> Frightened with recurring end-of-turn save, 1-min auto-success): needs the per-day-uses + reaction-with-save-or-condition primitive. Sibling shape with Burst of Ingenuity (Sphinx of Wonder, slice 524) on the per-day-uses + reaction half.
- Poisoned condition duration ("until the start of the quasit's next turn") is consumer-managed (mirror of slice 286, shared with all per-turn condition-rider weapons).

**Tests** ([tests/unit/engine/slice-526-quasit-rend.test.ts](tests/unit/engine/slice-526-quasit-rend.test.ts), 3 cases): natural weapon RAW damage profile + Poisoned rider; statblock retains pre-existing Magic Resistance + has no Multiattack; **all 7 Pact of the Chain familiars now have a wired primary-attack route** (5 monster-specific natural weapons + Skeleton's generic Shortsword/Shortbow).

**Audit (content-sweep abbreviated):** RAW match exact for the wired Rend; deferred Invisibility / Shape-Shift / Scare documented; no new identifiers beyond the weapon id.

**Pattern-check:** the Pact of the Chain familiar cohort (slices 518-526) is the clearest case study yet of "complete a cohort via incremental natural-weapon slices." Eight slices touched the cohort directly or indirectly:
- 518 (Pact of the Blade primitive)
- 519 (Pact of the Chain primitive + 6-of-7 familiars in pack)
- 522 (Venomous Snake statblock — closed 519 follow-up)
- 523 (Pseudodragon Bite + Multiattack)
- 524 (Sphinx of Wonder Rend)
- 525 (Imp Sting)
- 526 (Quasit Rend)

The natural-weapon-with-onHit-rider shape (slices 316/321) carried 5 of these slices in essentially one-line authoring tasks each. The remaining Pact-Chain-cluster gaps (at-will Invisibility, Shape-Shift, monster reaction-with-save) are sibling-shaped across familiars and would unblock multiple monsters per slice — those are the natural next L1-monster-sweep primitives, but each is a substantial slice on its own. Documented above per-familiar so a future slice can scope them as a cluster.

---

**Content (slice 525): Imp Sting natural weapon**

Wires the Imp's Sting action per RAW. Same shape as slice 524's Sphinx of Wonder Rend (single attack + on-hit damage rider) but with a piercing primary + poison rider instead of slashing + radiant. Imp's Magic Resistance was already wired (pre-existing `GrantMagicResistance`); its Shape-Shift, at-will Invisibility, and Devil's Sight stay deferred (each requires its own primitive — see deviations below).

RAW (SRD 5.2.1 Imp, CR 1, Tiny Fiend (Devil)): "Sting. Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage plus 7 (2d6) Poison damage."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `imp-sting` weapon definition: 1d6 piercing primary + slice-316 unconditional onHit 2d6 poison rider (Spy Shortsword mirror).

**Doc-count updates:** pack weapons 78 -> 79, items 542 -> 543.

**Documented RAW deviations (still deferred):**
- **Invisibility** (action, at-will, self-cast): needs the monster-action-self-cast-condition primitive. Sibling gap with Quasit, Sprite (the Pact-Chain Invisibility cluster).
- **Shape-Shift** (action; polymorph between true form / rat / raven / spider with speed-only stat changes): needs the monster-action-polymorph primitive composed with the existing spell-side polymorph planner. Sibling gap with Quasit.
- **Devil's Sight**: narrative (magical-darkness vision; the engine doesn't model magical darkness as obscurement).

**Tests** ([tests/unit/engine/slice-525-imp-sting.test.ts](tests/unit/engine/slice-525-imp-sting.test.ts), 2 cases): natural weapon RAW damage profile; statblock retains pre-existing Magic Resistance + has no Multiattack (RAW correctness).

**Audit (content-sweep abbreviated):** RAW match exact for the wired Sting; deferred Invisibility / Shape-Shift / Devil's Sight documented; no new identifiers beyond the weapon id.

**Pattern-check:** Imp Sting joins the "single-attack natural weapon with on-hit damage rider" family (now Spy Shortsword poison, Giant Spider Bite, Venomous Snake Bite, Sphinx of Wonder Rend, Imp Sting). At 5+ members the shape is fully routine; on-hit damage-rider weapons are one-line authoring tasks. **Quasit Claws is the natural next sibling** (same shape: 1d4 slashing + 2d4 poison per Quasit RAW, but Quasit also has the same Shape-Shift + Invisibility cluster).

**Closes another Pact-of-the-Chain familiar combat gap.** With Imp's primary attack wired, **5 of 7 Chain familiars** (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite, Imp) can attack via the engine's combat pipeline. Quasit + Skeleton (Skeleton is already combat-complete via generic Shortsword/Shortbow + no RAW Multiattack — surfaced this slice; was previously listed as a remaining gap in slice 524's CHANGELOG, corrected here) round out the cohort.

---

**Content (slice 524): Sphinx of Wonder Rend natural weapon**

Wires the Sphinx of Wonder's Rend action per RAW. The Sphinx of Wonder is a Pact of the Chain special-form familiar (CR 1); its Magic Resistance trait was already wired (pre-existing `GrantMagicResistance`). This slice closes the Rend gap so the Sphinx can perform its RAW slashing+radiant attack in combat. Pure content slice; single weapon definition, no statblock change (Sphinx of Wonder has no RAW Multiattack — single Rend action).

RAW (SRD 5.2.1 Sphinx of Wonder, CR 1): "Rend. Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Slashing damage plus 7 (2d6) Radiant damage."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `sphinx-of-wonder-rend` weapon definition: 1d4 slashing primary + slice-316 unconditional onHit 2d6 radiant rider (Spy Shortsword's poison rider shape recolored to radiant).

**Doc-count updates:** pack weapons 77 -> 78, items 541 -> 542. Updated [docs/getting-started.md](docs/getting-started.md) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md).

**Documented RAW deviation (deferred):**
- **Burst of Ingenuity** (2/Day reaction): adds +2 to an ability check or saving throw made by the sphinx or a creature within 30 ft. Needs the per-day-uses + reaction-with-numeric-modifier primitive (no current sibling primitive composes for "reaction granting +N to someone else's d20"). Substantial slice, not bundled here.

**Tests** ([tests/unit/engine/slice-524-sphinx-of-wonder-rend.test.ts](tests/unit/engine/slice-524-sphinx-of-wonder-rend.test.ts), 2 cases): natural weapon RAW damage profile (1d4 slashing + 2d6 radiant rider); statblock retains pre-existing Magic Resistance + has no Multiattack (RAW correctness).

**Audit (content-sweep abbreviated):** RAW match exact for the wired Rend; deferred Burst of Ingenuity documented; no new identifiers beyond the weapon id.

**Pattern-check:** Sphinx of Wonder joins the "single-attack natural weapon with on-hit damage rider" family (Spy Shortsword poison rider, Giant Spider Bite, Venomous Snake Bite). At 4 + members the shape is canonical; on-hit damage-rider weapons are now a routine one-line authoring task.

**Closes a Pact-of-the-Chain familiar combat gap.** With Sphinx of Wonder now combat-ready, **4 of 7 Chain familiars** (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite) can attack via the engine's combat pipeline. Imp, Quasit, Skeleton still need slices (Imp/Quasit need Shapechanger + at-will Invisibility primitives; Skeleton needs its weapon attacks wired).

---

**Content (slice 523): Pseudodragon Multiattack + `pseudodragon-bite` natural weapon**

Wires the Pseudodragon's Bite + Multiattack actions per RAW. The Pseudodragon is a Pact of the Chain special-form familiar (CR 1/4); its Magic Resistance trait was already wired (pre-existing `GrantMagicResistance`). This slice closes the Multiattack gap so the Pseudodragon can perform its RAW two-bite attack in combat. Pure content slice; uses the slice-464 Multiattack primitive + slice-446 natural-weapon shape (Wolf Bite mirror, no on-hit rider).

RAW (SRD 5.2.1 Pseudodragon, CR 1/4): "Multiattack. The pseudodragon makes two Bite attacks. Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `pseudodragon-bite` weapon definition: 1d4 piercing, no on-hit rider. (Wolf Bite mirror, no condition arm.)
- Pseudodragon statblock gains a `multiattack: { name: 'Pseudodragon Multiattack', attacks: [{ weaponId: 'pseudodragon-bite', count: 2 }] }` entry. Mirror of Ghoul's two-bite shape (slice 464 primitive).

**Doc-count updates:** pack weapons 76 -> 77, items 540 -> 541. Updated [docs/getting-started.md](docs/getting-started.md) and [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md).

**Documented RAW deviations (still deferred):**
- **Sting action** (CON DC 12, 2d4 poison + Poisoned 1 hour, with fail-by-5+ Unconscious arm) stays deferred. The fail-by-5+ tier is a degree-of-failure save primitive shared with Giant Centipede + Ghost (tracked in [docs/gaps-monsters-deferred-mechanics.md](docs/gaps-monsters-deferred-mechanics.md)). Until that primitive lands, Sting would need to ship as a binary save (which is a partial RAW deviation worse than not shipping at all).

**Tests** ([tests/unit/engine/slice-523-pseudodragon-multiattack.test.ts](tests/unit/engine/slice-523-pseudodragon-multiattack.test.ts), 3 cases): Multiattack entry shape (Pseudodragon Multiattack, two pseudodragon-bite); natural weapon RAW damage profile (1d4 piercing, no onHit); pre-existing Magic Resistance trait still present.

**Audit (content-sweep abbreviated):** RAW match exact for the wired Bite + Multiattack; deferred Sting deviation documented; no new identifiers beyond the weapon id + multiattack name.

**Pattern-check:** the "CR ≤ 1 Pact of the Chain familiar with a clean Multiattack" pattern now wires Pseudodragon. Imp, Quasit, Sphinx of Wonder are sibling Pact familiars — each has actions that need similar wiring (Imp Sting and Bite, Quasit Claw, Sphinx claws) but each carries additional gaps (Shapechanger, at-will Invisibility) that won't ship in one slice. The clean-natural-weapon-with-Multiattack shape is the canonical small slice for this cohort; sibling familiars need bigger slices.

**Closes a Pact-of-the-Chain familiar combat gap.** With Pseudodragon now combat-ready, 3 of 7 Chain familiars (Pseudodragon, Venomous Snake from slice 522, Sprite via prior slice) can attack via the engine's combat pipeline. Imp, Quasit, Skeleton, Sphinx of Wonder still need slices.

---

**Content (slice 522): Venomous Snake monster statblock + `venomous-snake-bite` natural weapon**

Closes slice 519's tracked open follow-up: the 7th Pact of the Chain RAW special-form familiar (Imp / Pseudodragon / Quasit / Skeleton / Sphinx of Wonder / Sprite / **Venomous Snake**) was missing from the pack despite the other 6 shipping. This pure-content slice authors the statblock + its natural weapon. No engine work.

RAW (SRD 5.2.1 Venomous Snake, CR 1/8, Tiny Beast, Unaligned): "AC 12; HP 5 (2d4); Speed 30 ft., Swim 30 ft. STR 2 (-4) DEX 15 (+2) CON 11 (+0) INT 1 (-5) WIS 10 (+0) CHA 3 (-4). Senses Blindsight 10 ft.; Passive Perception 10. Languages None. PB +2; XP 25. Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage plus 3 (1d6) Poison damage."

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `venomous-snake-bite` weapon definition: 1d4 piercing + slice-316 unconditional onHit 1d6 poison rider (mirror of Giant Spider Bite scaled down).
- New `venomous-snake` monster statblock: full RAW shape per above. No traits (Venomous Snake has no RAW traits — Blindsight is in senses, not a trait).

**Doc-count updates:** pack monsters 253 -> 254. SRD 5.2.1 monster catalog 235/235 -> 236/236 (this was a previously-missed SRD entry — slice 519's test surfaced it). Updated [docs/getting-started.md](docs/getting-started.md), [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md), [docs/status.md](docs/status.md) (both Conditions-rivaling rows).

**Tests** ([tests/unit/engine/slice-522-venomous-snake.test.ts](tests/unit/engine/slice-522-venomous-snake.test.ts), 3 cases): statblock ships RAW shape (AC 12, HP 5/2d4, Speed 30+swim30, abilities, blindsight 10, CR 1/8, PB +2); weapon ships RAW damage profile (1d4 piercing + 1d6 poison rider); all 7 Pact of the Chain special-form familiars are now present (closes slice 519 follow-up).

**Audit (content-sweep abbreviated form):** RAW match exact per SRD entry; no engine work; weapon mirrors Giant Spider Bite shape (which mirrors Spy Shortsword shape). No new identifiers beyond the two content ids.

**Pattern-check:** the slice surfaced an SRD-counting drift — the prior "235/235 SRD complete" claim was off by one (missed Venomous Snake). The drift audit ([tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts)) parses statblock fields against the SRD markdown but doesn't sweep for "every SRD monster exists in pack." A future audit slice could promote that check from manual to CI-guarded — same shape as the existing per-spell coverage audit. Tracked, not blocking.

**Closes slice 519 open follow-up:** ~~`venomous-snake` monster statblock not in pack, content-authoring slice.~~ **Closed by slice 522.**

---

**Engine + content (slice 521): Expeditious Retreat + `planExpeditiousRetreatDash` Bonus-Action-Dash arm + `expeditious-retreat-active` marker condition**

Wires Expeditious Retreat, the second L1 spell that grants a per-turn Bonus-Action-Dash capability (sibling to Rogue's Cunning Action and Orc Adrenaline Rush). The cast itself consumes the bearer's Bonus Action (handled by the existing `castingTime: "Bonus Action"` path) and stamps the new `expeditious-retreat-active` marker condition on Self via the existing `buff` mechanic; on subsequent turns the bearer invokes the new `planExpeditiousRetreatDash` to spend their BA on a Dash, gated on the marker condition being active.

RAW (Expeditious Retreat, 1st-level transmutation, V/S, Self, Concentration up to 10 minutes): "Cast this spell as a Bonus Action. Until the spell ends, you can take the Dash action as a Bonus Action on each of your turns."

**Engine:**
- New `planExpeditiousRetreatDash` ([src/engine/plan/expeditious-retreat.ts](src/engine/plan/expeditious-retreat.ts)). Intent: `{ actorId }`. Validates the actor exists + can act + carries the `expeditious-retreat-active` condition + is the active combatant in an active encounter + has BA available + hasn't already dashed this turn. Mirrors `planCunningAction`'s dash arm verbatim (intent-revealing names, same error messages, same event sequence). Emits `ActionEconomyConsumed(bonusAction)` + `Dashed`.
- Wired through [src/engine/plan/index.ts](src/engine/plan/index.ts) (export), [src/engine/index.ts](src/engine/index.ts) (import + `ExpeditiousRetreatDashIntent` type re-export + `expeditiousRetreatDash` method on the Engine interface + `planNs` factory), [src/engine/conveniences.ts](src/engine/conveniences.ts) (`ExpeditiousRetreatDash` dispatch entry — auto-picked-up by the planner-wiring audit).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- `expeditious-retreat` `mechanicalEffects`: `[]` -> `[{ kind: 'buff', conditionId: 'expeditious-retreat-active' }]`. No other fields changed (castingTime + concentration + class list all RAW-correct).
- New `expeditious-retreat-active` Condition: marker only (no inline effects), `stackable: false`, no `endsOn` triggers (concentration cleanup handles removal).

**Doc-count guards:**
- Spell wired count: 197 -> 198 (dedicated-planner bucket 24 -> 25). Narrative count: 69 -> 68. Updated [docs/getting-started.md](docs/getting-started.md), [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) Coverage table, [docs/gaps-spells.md](docs/gaps-spells.md) Totals + L1 breakdown (44 -> 45 wired, 13 -> 12 narrative; L1 gains a "Wired, planner-companion (1)" line for expeditious-retreat).
- The conditions count moves 130 -> 131. The doc-counts audit guards the headline "130 conditions" citation; updating it in this slice as part of the count discipline.

**Documented RAW deviations (consumer-managed):**
- "Cast this spell as a Bonus Action" — the cast turn itself: the bearer's BA is consumed by the cast, so they cannot also BA-Dash that turn (the planner correctly throws on the second BA attempt). RAW-correct; documented for clarity.
- "10 minutes" concentration timer is consumer-managed (the engine doesn't tick wall-clock; concentration cleanup happens on cast-of-a-new-concentration-spell, damage CON-save fail, or the consumer signaling end-of-spell).
- The dash itself is positional (the engine doesn't move tokens); the consumer applies the doubled movement budget per their own movement model. Same deviation as planDash / planCunningAction / planAdrenalineRush.

**Tests** ([tests/unit/engine/slice-521-expeditious-retreat.test.ts](tests/unit/engine/slice-521-expeditious-retreat.test.ts), 6 cases): spell wires the buff mechanic correctly; the new marker condition ships with empty effects + non-stackable; casting applies the condition + starts concentration on the caster; without the buff the BA-Dash planner throws with an intent-revealing message; with the buff active on a subsequent turn the planner emits `ActionEconomyConsumed(bonusAction)` + `Dashed`; on the cast turn itself BA-Dash is blocked because cast already consumed the BA.

**Uncle Bob audit:**
- **Names:** `planExpeditiousRetreatDash` / `ExpeditiousRetreatDashIntent` mirror the slice-446 `planAdrenalineRush` and slice-180 `planCunningAction` naming. `expeditious-retreat-active` matches the existing `<spell-id>-active` convention. The internal `EXPEDITIOUS_RETREAT_CONDITION` module-scope constant follows the slice-180 cunning-action convention.
- **DRY:** zero new event types, zero new reducers, zero new effect primitives. The planner is a near-verbatim mirror of `planCunningAction`'s dash arm (the differences: gate is "has condition" instead of "is Rogue L2+", and there's no mode parameter since RAW only allows Dash). Single-call-site duplication of ~50 lines is below the abstraction threshold; documented in the planner header comment.
- **SRP:** the planner does one thing (emit BA + Dashed when the bearer qualifies). The condition is a pure marker (no inline effects). The cast-spell envelope handles the cast economy.
- **Magic numbers:** none. The condition id is the single named constant.
- **at-threading:** planner resolves `at ?? nowIso()` once and threads to both emitted events.
- **Mechanical outcomes asserted:** spell shape, condition shape, cast-time state flip, gate-throws-without-buff, BA-Dash event sequence on subsequent turn, BA-Dash blocked on cast turn.
- **Tests:** 6 unit tests. Each names a specific bug it prevents (wiring intact, marker shape correct, concentration starts, gate works, dash emits, cast-turn double-BA blocked).

**Pattern-check:** the family of "spell or feature that lets you Dash as a Bonus Action" now has three siblings — planCunningAction (Rogue L2 + Spy statblock), planAdrenalineRush (Orc trait, per-rest), planStepOfTheWind (Monk Bonus Action Dash/Disengage), and now planExpeditiousRetreatDash (spell-buff-gated). All four share the same skeleton: validate active combatant + BA available + per-feature gate, emit `ActionEconomyConsumed(bonusAction)` + `Dashed`. At 4 siblings the duplication remains below the abstraction threshold; a factor-out would need to also unify the per-feature gate shape (eligibility predicate vs. condition presence vs. per-rest tracker), which would over-couple. Documenting the family here so a future "create a shared planBonusActionMovementAction(actorId, mode, gate)" refactor has the inventory ready. Other L1 spells with similar "grant per-turn capability" shapes (Hunter's Mark already wired, Hex via concentration buff) follow the slice-180/521 pattern; **the family is well-established**.

**Open follow-ups:** none for this slice. The Hide and Disengage arms of Expeditious Retreat-style buffs don't exist in RAW (Expeditious Retreat is Dash-only).

---

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

Per-slice detail for slices 517-519 (L1-RAW-strict Pact boon completion arc: ChoiceResolved cascade primitive + Pact of the Tome canonical user; Pact of the Blade + `GrantPactBlade` marker + `planConjurePactWeapon`; Pact of the Chain + `GrantPactChain` marker + at-will Find Familiar free-cast) is archived at [docs/changelog/archive-slices-517-519.md](docs/changelog/archive-slices-517-519.md) (slice 523, to keep this file under the 60 KB single-Read ceiling).

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
