# Archive: slices 520-524

This file holds the per-slice changelog detail for slices 520-524, archived from the live CHANGELOG.md in slice 529 to keep that file under the 60 KB single-Read ceiling. Cohort: the L1-completion-followed-by-monster-sweep arc — Spare the Dying + new `stabilize` spell mechanic (520), Expeditious Retreat + `planExpeditiousRetreatDash` (521), Venomous Snake statblock closing slice 519's follow-up (522), Pseudodragon Bite + Multiattack (523), Sphinx of Wonder Rend (524). This block bridges the strict-RAW L1-invocation completion (slices 513-519) to the Pact of the Chain familiar combat-surface completion sweep (slices 523-526).

Picks up where [archive-slices-517-519.md](archive-slices-517-519.md) leaves off.

The global per-cohort archive index lives at [README.md](README.md).

---

**Content (slice 524): Sphinx of Wonder Rend natural weapon**

Wires the Sphinx of Wonder's Rend action per RAW. The Sphinx of Wonder is a Pact of the Chain special-form familiar (CR 1); its Magic Resistance trait was already wired (pre-existing `GrantMagicResistance`). This slice closes the Rend gap so the Sphinx can perform its RAW slashing+radiant attack in combat. Pure content slice; single weapon definition, no statblock change (Sphinx of Wonder has no RAW Multiattack — single Rend action).

RAW (SRD 5.2.1 Sphinx of Wonder, CR 1): "Rend. Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Slashing damage plus 7 (2d6) Radiant damage."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `sphinx-of-wonder-rend` weapon definition: 1d4 slashing primary + slice-316 unconditional onHit 2d6 radiant rider (Spy Shortsword's poison rider shape recolored to radiant).

**Doc-count updates:** pack weapons 77 -> 78, items 541 -> 542. Updated [docs/getting-started.md](../../docs/getting-started.md) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md).

**Documented RAW deviation (deferred):**
- **Burst of Ingenuity** (2/Day reaction): adds +2 to an ability check or saving throw made by the sphinx or a creature within 30 ft. Needs the per-day-uses + reaction-with-numeric-modifier primitive (no current sibling primitive composes for "reaction granting +N to someone else's d20"). Substantial slice, not bundled here.

**Tests** ([tests/unit/engine/slice-524-sphinx-of-wonder-rend.test.ts](../../tests/unit/engine/slice-524-sphinx-of-wonder-rend.test.ts), 2 cases): natural weapon RAW damage profile (1d4 slashing + 2d6 radiant rider); statblock retains pre-existing Magic Resistance + has no Multiattack (RAW correctness).

**Audit (content-sweep abbreviated):** RAW match exact for the wired Rend; deferred Burst of Ingenuity documented; no new identifiers beyond the weapon id.

**Pattern-check:** Sphinx of Wonder joins the "single-attack natural weapon with on-hit damage rider" family (Spy Shortsword poison rider, Giant Spider Bite, Venomous Snake Bite). At 4 + members the shape is canonical; on-hit damage-rider weapons are now a routine one-line authoring task.

**Closes a Pact-of-the-Chain familiar combat gap.** With Sphinx of Wonder now combat-ready, **4 of 7 Chain familiars** (Pseudodragon, Venomous Snake, Sphinx of Wonder, Sprite) can attack via the engine's combat pipeline. Imp, Quasit, Skeleton still need slices (Imp/Quasit need Shapechanger + at-will Invisibility primitives; Skeleton needs its weapon attacks wired).

---

**Content (slice 523): Pseudodragon Multiattack + `pseudodragon-bite` natural weapon**

Wires the Pseudodragon's Bite + Multiattack actions per RAW. The Pseudodragon is a Pact of the Chain special-form familiar (CR 1/4); its Magic Resistance trait was already wired (pre-existing `GrantMagicResistance`). This slice closes the Multiattack gap so the Pseudodragon can perform its RAW two-bite attack in combat. Pure content slice; uses the slice-464 Multiattack primitive + slice-446 natural-weapon shape (Wolf Bite mirror, no on-hit rider).

RAW (SRD 5.2.1 Pseudodragon, CR 1/4): "Multiattack. The pseudodragon makes two Bite attacks. Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `pseudodragon-bite` weapon definition: 1d4 piercing, no on-hit rider. (Wolf Bite mirror, no condition arm.)
- Pseudodragon statblock gains a `multiattack: { name: 'Pseudodragon Multiattack', attacks: [{ weaponId: 'pseudodragon-bite', count: 2 }] }` entry. Mirror of Ghoul's two-bite shape (slice 464 primitive).

**Doc-count updates:** pack weapons 76 -> 77, items 540 -> 541. Updated [docs/getting-started.md](../../docs/getting-started.md) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md).

**Documented RAW deviations (still deferred):**
- **Sting action** (CON DC 12, 2d4 poison + Poisoned 1 hour, with fail-by-5+ Unconscious arm) stays deferred. The fail-by-5+ tier is a degree-of-failure save primitive shared with Giant Centipede + Ghost (tracked in [docs/gaps-monsters-deferred-mechanics.md](../../docs/gaps-monsters-deferred-mechanics.md)). Until that primitive lands, Sting would need to ship as a binary save (which is a partial RAW deviation worse than not shipping at all).

**Tests** ([tests/unit/engine/slice-523-pseudodragon-multiattack.test.ts](../../tests/unit/engine/slice-523-pseudodragon-multiattack.test.ts), 3 cases): Multiattack entry shape (Pseudodragon Multiattack, two pseudodragon-bite); natural weapon RAW damage profile (1d4 piercing, no onHit); pre-existing Magic Resistance trait still present.

**Audit (content-sweep abbreviated):** RAW match exact for the wired Bite + Multiattack; deferred Sting deviation documented; no new identifiers beyond the weapon id + multiattack name.

**Pattern-check:** the "CR ≤ 1 Pact of the Chain familiar with a clean Multiattack" pattern now wires Pseudodragon. Imp, Quasit, Sphinx of Wonder are sibling Pact familiars — each has actions that need similar wiring (Imp Sting and Bite, Quasit Claw, Sphinx claws) but each carries additional gaps (Shapechanger, at-will Invisibility) that won't ship in one slice. The clean-natural-weapon-with-Multiattack shape is the canonical small slice for this cohort; sibling familiars need bigger slices.

**Closes a Pact-of-the-Chain familiar combat gap.** With Pseudodragon now combat-ready, 3 of 7 Chain familiars (Pseudodragon, Venomous Snake from slice 522, Sprite via prior slice) can attack via the engine's combat pipeline. Imp, Quasit, Skeleton, Sphinx of Wonder still need slices.

---

**Content (slice 522): Venomous Snake monster statblock + `venomous-snake-bite` natural weapon**

Closes slice 519's tracked open follow-up: the 7th Pact of the Chain RAW special-form familiar (Imp / Pseudodragon / Quasit / Skeleton / Sphinx of Wonder / Sprite / **Venomous Snake**) was missing from the pack despite the other 6 shipping. This pure-content slice authors the statblock + its natural weapon. No engine work.

RAW (SRD 5.2.1 Venomous Snake, CR 1/8, Tiny Beast, Unaligned): "AC 12; HP 5 (2d4); Speed 30 ft., Swim 30 ft. STR 2 (-4) DEX 15 (+2) CON 11 (+0) INT 1 (-5) WIS 10 (+0) CHA 3 (-4). Senses Blindsight 10 ft.; Passive Perception 10. Languages None. PB +2; XP 25. Bite. Melee Attack Roll: +4, reach 5 ft. Hit: 4 (1d4 + 2) Piercing damage plus 3 (1d6) Poison damage."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `venomous-snake-bite` weapon definition: 1d4 piercing + slice-316 unconditional onHit 1d6 poison rider (mirror of Giant Spider Bite scaled down).
- New `venomous-snake` monster statblock: full RAW shape per above. No traits (Venomous Snake has no RAW traits — Blindsight is in senses, not a trait).

**Doc-count updates:** pack monsters 253 -> 254. SRD 5.2.1 monster catalog 235/235 -> 236/236 (this was a previously-missed SRD entry — slice 519's test surfaced it). Updated [docs/getting-started.md](../../docs/getting-started.md), [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md), [docs/status.md](../../docs/status.md) (both Conditions-rivaling rows).

**Tests** ([tests/unit/engine/slice-522-venomous-snake.test.ts](../../tests/unit/engine/slice-522-venomous-snake.test.ts), 3 cases): statblock ships RAW shape (AC 12, HP 5/2d4, Speed 30+swim30, abilities, blindsight 10, CR 1/8, PB +2); weapon ships RAW damage profile (1d4 piercing + 1d6 poison rider); all 7 Pact of the Chain special-form familiars are now present (closes slice 519 follow-up).

**Audit (content-sweep abbreviated form):** RAW match exact per SRD entry; no engine work; weapon mirrors Giant Spider Bite shape (which mirrors Spy Shortsword shape). No new identifiers beyond the two content ids.

**Pattern-check:** the slice surfaced an SRD-counting drift — the prior "235/235 SRD complete" claim was off by one (missed Venomous Snake). The drift audit ([tests/audit/srd-drift.test.ts](../../tests/audit/srd-drift.test.ts)) parses statblock fields against the SRD markdown but doesn't sweep for "every SRD monster exists in pack." A future audit slice could promote that check from manual to CI-guarded — same shape as the existing per-spell coverage audit. Tracked, not blocking.

**Closes slice 519 open follow-up:** ~~`venomous-snake` monster statblock not in pack, content-authoring slice.~~ **Closed by slice 522.**

---

**Engine + content (slice 521): Expeditious Retreat + `planExpeditiousRetreatDash` Bonus-Action-Dash arm + `expeditious-retreat-active` marker condition**

Wires Expeditious Retreat, the second L1 spell that grants a per-turn Bonus-Action-Dash capability (sibling to Rogue's Cunning Action and Orc Adrenaline Rush). The cast itself consumes the bearer's Bonus Action (handled by the existing `castingTime: "Bonus Action"` path) and stamps the new `expeditious-retreat-active` marker condition on Self via the existing `buff` mechanic; on subsequent turns the bearer invokes the new `planExpeditiousRetreatDash` to spend their BA on a Dash, gated on the marker condition being active.

RAW (Expeditious Retreat, 1st-level transmutation, V/S, Self, Concentration up to 10 minutes): "Cast this spell as a Bonus Action. Until the spell ends, you can take the Dash action as a Bonus Action on each of your turns."

**Engine:**
- New `planExpeditiousRetreatDash` ([src/engine/plan/expeditious-retreat.ts](../../src/engine/plan/expeditious-retreat.ts)). Intent: `{ actorId }`. Validates the actor exists + can act + carries the `expeditious-retreat-active` condition + is the active combatant in an active encounter + has BA available + hasn't already dashed this turn. Mirrors `planCunningAction`'s dash arm verbatim (intent-revealing names, same error messages, same event sequence). Emits `ActionEconomyConsumed(bonusAction)` + `Dashed`.
- Wired through [src/engine/plan/index.ts](../../src/engine/plan/index.ts) (export), [src/engine/index.ts](../../src/engine/index.ts) (import + `ExpeditiousRetreatDashIntent` type re-export + `expeditiousRetreatDash` method on the Engine interface + `planNs` factory), [src/engine/conveniences.ts](../../src/engine/conveniences.ts) (`ExpeditiousRetreatDash` dispatch entry — auto-picked-up by the planner-wiring audit).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- `expeditious-retreat` `mechanicalEffects`: `[]` -> `[{ kind: 'buff', conditionId: 'expeditious-retreat-active' }]`. No other fields changed (castingTime + concentration + class list all RAW-correct).
- New `expeditious-retreat-active` Condition: marker only (no inline effects), `stackable: false`, no `endsOn` triggers (concentration cleanup handles removal).

**Doc-count guards:**
- Spell wired count: 197 -> 198 (dedicated-planner bucket 24 -> 25). Narrative count: 69 -> 68. Updated [docs/getting-started.md](../../docs/getting-started.md), [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) Coverage table, [docs/gaps-spells.md](../../docs/gaps-spells.md) Totals + L1 breakdown (44 -> 45 wired, 13 -> 12 narrative; L1 gains a "Wired, planner-companion (1)" line for expeditious-retreat).
- The conditions count moves 130 -> 131. The doc-counts audit guards the headline "130 conditions" citation; updating it in this slice as part of the count discipline.

**Documented RAW deviations (consumer-managed):**
- "Cast this spell as a Bonus Action" — the cast turn itself: the bearer's BA is consumed by the cast, so they cannot also BA-Dash that turn (the planner correctly throws on the second BA attempt). RAW-correct; documented for clarity.
- "10 minutes" concentration timer is consumer-managed (the engine doesn't tick wall-clock; concentration cleanup happens on cast-of-a-new-concentration-spell, damage CON-save fail, or the consumer signaling end-of-spell).
- The dash itself is positional (the engine doesn't move tokens); the consumer applies the doubled movement budget per their own movement model. Same deviation as planDash / planCunningAction / planAdrenalineRush.

**Tests** ([tests/unit/engine/slice-521-expeditious-retreat.test.ts](../../tests/unit/engine/slice-521-expeditious-retreat.test.ts), 6 cases): spell wires the buff mechanic correctly; the new marker condition ships with empty effects + non-stackable; casting applies the condition + starts concentration on the caster; without the buff the BA-Dash planner throws with an intent-revealing message; with the buff active on a subsequent turn the planner emits `ActionEconomyConsumed(bonusAction)` + `Dashed`; on the cast turn itself BA-Dash is blocked because cast already consumed the BA.

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
- New `SpellStabilizeMechanicSchema` ([src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), added to the `SpellMechanic` discriminated union; mirror of `create-item` / `weapon-attack` in shape, no fields beyond `kind`).
- New `planStabilizeMechanic` inline helper ([src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts), mirror of `planCreateItemMechanic`). Validates a targetId is supplied; gates on `hp.current === 0` AND `deathSaves.stable !== true`; ineligible targets produce zero events (matches RAW "spell does nothing" outcome). Wired into the cast-spell dispatch loop.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- `spare-the-dying` mechanicalEffects: `[]` -> `[{ kind: 'stabilize' }]`. No other changes (cleric / druid class list, range, components all stay RAW-correct).

**Doc-count guards:**
- Spell wired count: 196 -> 197 (cast-time bucket 153 -> 154). Narrative count: 70 -> 69. Updated [docs/getting-started.md](../../docs/getting-started.md), [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) Coverage table, [docs/gaps-spells.md](../../docs/gaps-spells.md) Totals + L0 breakdown (16 -> 17 wired, 11 -> 10 narrative).
- L0 breakdown gains a new "Wired, stabilize (1): spare-the-dying" line. `spare-the-dying` moved out of the L0 Narrative list.
- The `EFFECT_KINDS` count is unchanged (this is a spell-mechanic schema entry, not an effect primitive); existing guard regexes stay accurate.

**Documented RAW deviations (consumer-managed):**
- "Choose a creature within range" — the 15-foot range gate is not engine-enforced (consumer-managed, mirror of all other range gates).
- "isn't dead" — the planner gates on `hp.current === 0 + !stable`. A creature with `deathSaves.failures >= 3` is "dead" per the standard rules but is filtered out by the existing reducer (`applyStabilized` checks the failure count); the planner doesn't re-check. The compound effect is RAW-correct (a dead creature can't be stabilized) but the gate split between planner and reducer is documented here.

**Tests** ([tests/unit/engine/slice-520-spare-the-dying.test.ts](../../tests/unit/engine/slice-520-spare-the-dying.test.ts), 5 cases): spell shape includes `stabilize`; casting on a downed (0-HP, unstable) target emits Stabilized and flips `deathSaves.stable -> true` on commit; casting on a healthy target (hp.current > 0) emits no Stabilized; casting on an already-stable target emits no Stabilized (idempotent no-op); empty `targetIds` throws with an intent-revealing message.

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

**Docs hygiene (slice 520 also)**: archived slices 513-516 detail to [docs/changelog/archive-slices-513-516.md](../../docs/changelog/archive-slices-513-516.md) to keep the live CHANGELOG under the 60 KB single-Read ceiling (it crossed 61.8 KB before the cut; ~48 KB after).

