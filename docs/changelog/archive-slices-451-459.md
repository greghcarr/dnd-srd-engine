# CHANGELOG archive: slices 451-459 (L1 playability arc, part 2)

Per-slice detail for slices 451-459 of the level-by-level L1 playability arc, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 460 to keep it under the 60 KB single-Read ceiling. Cohort: the second batch of the L1-arc, picking up where [archive-slices-444-450.md](archive-slices-444-450.md) leaves off — Kobold Sunlight Sensitivity (451) and the Undead Sunlight sweep (452), Orc Adrenaline Rush (453, with the slice-459 PB-uses-per-rest correction folded in), Brown Bear / Mastiff knock-prone (454), Goblin Nimble Escape (455), Zombie Undead Fortitude (456), Wizard Ritual Adept marker (457), Orc Relentless Endurance (458), and the slice-453 Adrenaline Rush regression fix (459).

---

**Fix (slice 459): Orc Adrenaline Rush PB-uses-per-rest correction - L1 playability arc**

Closes the slice-458 regression follow-up: slice 453 shipped Adrenaline Rush as at-will, but RAW (SRD 5.2.1 Orc, character-origins.md L317-319) actually says: "You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest." Resource-gated, not at-will.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): orc species traits gain `GrantResource { resourceId: 'adrenaline-rush', max: { kind: 'profBonus' }, recharge: 'shortRest' }`. The pool refunds on short or long rest via the existing rest reducer.

**Planner** ([src/engine/plan/adrenaline-rush.ts](../../src/engine/plan/adrenaline-rush.ts)): added a gate after the species check that requires `current >= 1` of the `adrenaline-rush` resource, and a `ResourceSpent { amount: 1 }` event emitted between `ActionEconomyConsumed` and `Dashed`. Event chain is now 4 events instead of 3.

**Test updates** in [tests/unit/engine/slice-453-adrenaline-rush.test.ts](../../tests/unit/engine/slice-453-adrenaline-rush.test.ts): updated `buildOrc` helper to seed both `adrenaline-rush` (PB max, defaults to full pool) and `relentless-endurance` resources (the latter to keep slice-458's intercept tests happy if exercised). Updated the L1 success case to assert 4-event chain. Added a depletion case (orc with 0 `adrenaline-rush` resource is rejected with the no-uses-remaining error).

**Audit (fix slice):**
- *RAW match*: SRD 5.2.1 Orc Adrenaline Rush exactly. PB-uses per Short or Long Rest. `max: { kind: 'profBonus' }` resolves correctly because the engine's `profBonus` formula reads `computeTotalLevel`.
- *Names*: `ADRENALINE_RUSH_RESOURCE = 'adrenaline-rush'` constant matches the species trait's resourceId; both match the feature id used throughout.
- *DRY*: the planner pattern (resource gate -> emit ResourceSpent in the event chain) matches Step of the Wind's focus-spend arm + Patient Defense's focus-spend arm. Same shape.
- *Mechanical outcomes asserted*: 4-event chain confirmed; PB scaling at L1 (PB 2) and L5 (PB 3) unchanged; depletion rejected; non-orc rejected; bonus-action-already-used rejected; consecutive call still rejected (now via the bonus-action gate, which fires before the resource gate in the planner's order).

**Open follow-ups:**
- "Killed outright" massive-damage exception (carried from slice 458). *Still open.*

~~Open follow-up from slice 458: **Slice-453 Adrenaline Rush regression**: I implemented at-will, but RAW says PB uses per short/long rest. Needs GrantResource max: formula(PB) recharge: 'shortRest' + SpendResource in planAdrenalineRush.~~ **Closed by slice 459.**

**Engine + content (slice 458): Orc Relentless Endurance species trait - L1 playability arc**

The 2024 Orc species's signature drop-to-1-instead-of-0 mechanic. RAW (SRD 5.2.1 Orc): "Relentless Endurance. When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can't do so again until you finish a Long Rest." Unconditional (no save), resource-gated 1/Long Rest — a different shape than slice-456's save-gated `PreventFatalDamageOnSave`.

**RAW correction**: in 2024 SRD, Half-Orc doesn't exist as a separate species; it merged into Orc, which carries both Adrenaline Rush + Relentless Endurance. (Earlier follow-up text used the 2014 "Half-Orc" framing.)

**New effect kind** `PreventFatalDamageConsumingResource { resourceId }` in [src/schemas/effects.ts](../../src/schemas/effects.ts). Sibling of slice-111's condition-based `PreventFatalDamage` (Death Ward — removed on trigger) and slice-456's save-gated `PreventFatalDamageOnSave` (Undead Fortitude — not consumed). This one: scans the effect stack, checks the named resource has at least 1 available, and emits `ResourceSpent { amount: 1 }`. The bearing effect persists (species-built-in); the per-long-rest cadence comes from the resource's own recharge (the existing rest reducer already refunds it).

**interceptFatalDamage extension** ([src/derive/fatal-damage-intercept.ts](../../src/derive/fatal-damage-intercept.ts)): new arm between the existing Death-Ward path (PreventFatalDamage) and the slice-456 save-gated path (PreventFatalDamageOnSave). Order matters: condition-based intercepts fire before resource-based, which fire before save-based. extraEvents now also carry `ResourceSpentEvent`.

**Content**: Orc species in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json) gains two new traits alongside the existing darkvision-120 + adrenaline-rush marker:
- `GrantResource { resourceId: 'relentless-endurance', max: 1, recharge: 'longRest' }`
- `PreventFatalDamageConsumingResource { resourceId: 'relentless-endurance' }`

**Test** at [tests/unit/engine/slice-458-relentless-endurance.test.ts](../../tests/unit/engine/slice-458-relentless-endurance.test.ts) — 5 cases: fresh orc takes fatal damage -> drops to 1 HP + resource consumed; depleted-resource orc dies; non-fatal damage doesn't trigger; commit-then-second-hit dies (resource depletion is persistent); control case (Human with the resource manually granted) confirms the gate is on the species trait, not the resource alone.

**Doc updates**: effect-kinds count 54 -> 55 (53 -> 54 primitives) in [docs/concepts.md](../../docs/concepts.md) and [docs/authoring-content-packs.md](../../docs/authoring-content-packs.md).

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Orc Relentless Endurance text exactly. Unconditional drop-to-1; 1 per Long Rest via the resource.
- *Names*: `PreventFatalDamageConsumingResource` parallels the existing `PreventFatalDamage` + `PreventFatalDamageOnSave` shape; the `resourceId` field makes the gate explicit.
- *DRY*: shares `scaleToOne()` helper with the existing intercept arms. Reuses `collectEffectsFromCharacter` (the slice-456 path) to scan the effect stack so species traits and condition-based grants both qualify. The same shape would fit (a) a class-feature variant of Relentless Endurance, (b) a magic item that grants a one-use drop-to-1.
- *SRP / sticking to existing primitives*: declined to extend `PreventFatalDamage` with an optional `resourceId` (would overload the existing intercept's "remove the bearing condition" semantic). The new sibling effect is more intention-revealing.
- *Mechanical outcomes asserted*: 5-case matrix covers the success path (drop to 1 + ResourceSpent), the depleted-resource pass-through, the non-fatal control, the second-hit-after-commit case (proves resource persistence), and the species-gate control (Human can't trigger even with the resource present).

**Open follow-ups:**
- **Slice-453 Adrenaline Rush regression**: I implemented Adrenaline Rush as at-will in slice 453, but RAW (SRD 5.2.1 Orc, character-origins.md L317) actually says: "You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest." Resource-gated, not at-will. Needs a `GrantResource { resourceId: 'adrenaline-rush', max: formula(PB), recharge: 'shortRest' }` + a `SpendResource` step in `planAdrenalineRush`. *Still open.*
- **"Killed outright" massive-damage exception**: RAW says Relentless Endurance doesn't fire if the orc would be killed outright (HP <= -maxHP). The current intercept doesn't check this (same gap exists for Death Ward + Undead Fortitude). Acceptable edge case across all three intercepts. *Still open.*

~~Open follow-up from slice 456: **Half-Orc Relentless Endurance**: same effect kind + a `consumeOnTrigger` flag for one-shot + a long-rest recharge. PC-side, one-shot.~~ **Closed by slice 458** (with the 2024 RAW correction: Orc, not Half-Orc; resource-gated via a new sibling effect kind rather than a `consumeOnTrigger` flag on the slice-456 primitive).

**Content (slice 457): Wizard Ritual Adept marker - L1 playability arc**

Closes the slice-444 L1-audit Wizard Ritual Adept stub. RAW (SRD 5.2.1 Wizard L1): "You can cast any spell as a Ritual if that spell has the Ritual tag and the spell is in your spellbook. You needn't have the spell prepared." Engine already supports this by default — `characterKnowsSpell` in [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts) accepts either `knownSpells` (the wizard's spellbook) or `preparedSpells`, so `asRitual: true` on a ritual-tagged spellbook entry passes the gate without preparation. Wizard's empty `effects: []` ritual-adept feature now ships a `Custom { handlerId: 'ritual-adept' }` marker for discoverability; the `BACKED_INDIRECTLY` allowlist in [tests/audit/pack-integrity.test.ts](../../tests/audit/pack-integrity.test.ts) documents where the mechanic lives.

**Surprise RAW finding**: 2024 PHB / SRD 5.2.1 (rules-glossary.md, Ritual) states "If you have a spell prepared that has the Ritual tag, you can cast that spell as a Ritual." Ritual casting is NOT class-gated in 2024 — any caster with a prepared ritual-tagged spell can asRitual. Wizard Ritual Adept's unique contribution is extending the gate to *spellbook entries that aren't prepared*. The engine's permissive `characterKnowsSpell` (which treats knownSpells and preparedSpells equivalently) already permits this for wizards. The slice-453-style "discoverable Custom marker" closes the L1 audit stub cleanly without an engine change.

**Test** at [tests/unit/engine/slice-457-ritual-adept.test.ts](../../tests/unit/engine/slice-457-ritual-adept.test.ts) — 3 cases: L1 wizard with `detect-magic` in `knownSpells` (NOT `preparedSpells`) successfully casts asRitual with no slot consumed; wizard who doesn't know the spell at all is rejected; the marker is discoverable on the L1 feature.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 Wizard L1 Ritual Adept exact text. Engine's spellbook-equals-knownSpells modeling matches the RAW gate.
- *Names*: `ritual-adept` handlerId matches the feature id + the slice-453/455 marker convention.
- *DRY*: declined a new `GrantRitualCasting` effect kind + caster-side gate refactor. Two reasons: (a) the engine's current permissive ritual-cast path is RAW-correct for everyone (any prepared ritual spell is castable as ritual per 2024 PHB); (b) gating on a feature flag would regress other classes that don't yet have a wired counterpart trait, opening a worse gap than it closes.
- *Mechanical outcomes asserted*: spellbook-only ritual cast succeeds with no slot consumed; unknown-spell ritual cast rejected; marker present in pack.

**Open follow-ups:**
- **Wizard preparation-enforcement**: the engine's `characterKnowsSpell` accepts `knownSpells` for ANY cast (not just ritual), so a wizard can cast any spellbook spell directly without preparing — broader than RAW. Closing this gap requires (a) tightening characterKnowsSpell to require `preparedSpells` for non-ritual cast and (b) adding a `GrantRitualAdept` flag that re-permits spellbook ritual casts. Multi-touch refactor; defer. *Still open.*
- **Sorcerer / Warlock / Paladin / Ranger ritual casts**: the engine permits these classes to ritual-cast prepared spells, which is RAW per the 2024 rules-glossary entry. Pre-existing behavior preserved.

~~Open follow-up from slice 444's L1 audit: **wizard.ritual-adept**: needs a "treat this prepared spell as ritual" path.~~ **Closed by slice 457** (the engine already provides the mechanic; the marker now closes the stub).

**Engine + content (slice 456): Zombie Undead Fortitude - L1 playability arc**

The signature Zombie save-on-lethal-damage mechanic. RAW (SRD 5.2.1 Zombie): "Undead Fortitude. If damage reduces the zombie to 0 Hit Points, it makes a Constitution saving throw (DC 5 plus the damage taken) unless the damage is Radiant or from a Critical Hit. On a successful save, the zombie drops to 1 Hit Point instead." Zombies are the most-encountered Undead at L1 — a Cleric pulling Sacred Flame (radiant) on a Zombie should bypass the save; a fighter critical-hitting one should bypass; everything else triggers the CON save.

**New effect kind** `PreventFatalDamageOnSave { ability, baseDC, exemptDamageTypes?, exemptOnCrit? }` in [src/schemas/effects.ts](../../src/schemas/effects.ts). Distinct from slice-111's unconditional `PreventFatalDamage` (Death Ward shape): this rolls a save and is NOT consumed on success (Undead Fortitude is always-on, not one-shot). Same shape would fit Half-Orc Relentless Endurance (1/long-rest gate, not crit-exempt) and a few other undead variants.

**interceptFatalDamage refactor** ([src/derive/fatal-damage-intercept.ts](../../src/derive/fatal-damage-intercept.ts)):
- New optional `rng?: RNG` + `critical?: boolean` input fields. RNG threaded through all 14 active call sites (attack planner, trigger dispatcher x2, lands-aid, trap, thunder-step, weapon-mastery graze, breath-weapon, cast-spell x4, concentration ticks x3). `planFalling` doesn't have RNG in scope, so falling damage on a zombie passes through unsaved — documented limitation.
- New scan path: after the Death Ward (`PreventFatalDamage` on applied conditions) check passes through, scan the full effect stack via `collectEffectsFromCharacter` for `PreventFatalDamageOnSave` — covers monster traits (Zombie) AND condition-applied versions (future Half-Orc shape).
- Save: `d20 + abilityModifier(target.abilityScores[ability]) >= baseDC + totalDamage`. Bakes the roll into a `SaveRolled` event returned in `extraEvents` so replay stays RNG-free.
- RAW exemptions check before rolling: `exemptOnCrit && critical` -> passthrough; any damage component type in `exemptDamageTypes` -> passthrough (skip the save entirely, target drops).

**Content:** zombie monster in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json) gains `traits: [{ kind: 'PreventFatalDamageOnSave', ability: 'CON', baseDC: 5, exemptDamageTypes: ['radiant'], exemptOnCrit: true }]`. Discoverable via the standard effect-stack channel (`collectEffectsFromCharacter` includes `statblock.traits` per slice-179).

**Test** at [tests/unit/engine/slice-456-undead-fortitude.test.ts](../../tests/unit/engine/slice-456-undead-fortitude.test.ts) — 7 cases: non-fatal damage skips the save; fatal non-radiant non-crit rolls the save (DC = 5 + damage = 13 for 8 damage; on success damage scales so HP lands at 1); save failure passes damage unscaled; fatal radiant skips the save (passthrough); mixed components with one radiant skip the save; fatal critical hit skips the save; control case (Wolf, no trait) confirms only PreventFatalDamageOnSave-bearing creatures trigger the new path.

**Doc updates:** effect-kinds count 53 -> 54 (52 -> 53 primitives) in [docs/concepts.md](../../docs/concepts.md) and [docs/authoring-content-packs.md](../../docs/authoring-content-packs.md) (doc-counts audit caught both).

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Zombie text exactly. CON save, DC 5 + damage, Radiant + crit exempt. Always-on (no per-rest cap, condition not consumed).
- *Names*: `PreventFatalDamageOnSave` parallels the existing `PreventFatalDamage` shape; the "OnSave" suffix telegraphs the gate. `exemptDamageTypes` + `exemptOnCrit` are intention-revealing.
- *DRY*: shares `scaleToOne()` helper with the existing PreventFatalDamage path. Both arms emit through the same `extraEvents` channel (now widened to `SaveRolledEvent | ConditionRemovedEvent`). Declined to refactor the save-roll into a shared helper with `computeSavingThrow` — this path uses raw ability mod (RAW for monster traits) while computeSavingThrow folds in proficiency + effect-stack save bonuses; two different shapes.
- *SRP*: a single fatal-damage chokepoint handles both unconditional (Death Ward) and save-gated (Undead Fortitude) intercepts. Adding a new shape in the future is one new effect-kind branch + content authoring.
- *at-threading*: SaveRolled inherits the caller's `input.at` like every other intercept-emitted event.
- *Mechanical outcomes asserted*: 7-case matrix covers all 4 RAW gates (radiant exempt, crit exempt, save success, save failure) + non-fatal control + non-trait control.

**Open follow-ups:**
- **planFalling RNG threading**: planFalling doesn't have RNG in scope, so Undead Fortitude doesn't fire on falling damage. Acceptable edge case (zombies rarely fall in combat), but a follow-up could add an rng param to planFalling for completeness. *Still open.*
- **Half-Orc Relentless Endurance**: same effect kind + a `consumeOnTrigger` flag for one-shot + a long-rest recharge. Distinct from Undead Fortitude in that it's PC-side and consumed. *Still open.*

~~Open follow-up from slice 445: **Undead Fortitude (zombie):** save-on-lethal-damage rewrite. Same shape as Barbarian Relentless Rage (deferred).~~ **Closed by slice 456** (Barbarian Relentless Rage is a different shape — Rage uses Exhaustion-stack-on-success, not damage-scale-to-1 — so it stays its own follow-up).

**Engine + content (slice 455): Goblin Nimble Escape (Disengage or Hide as Bonus Action) - L1 playability arc**

Closes the monster-bonus-action surface across all 3 goblin variants (Warrior, Minion, Boss). RAW (SRD 5.2.1 each Goblin statblock): "Nimble Escape. The goblin takes the Disengage or Hide action [as a Bonus Action]." At-will. L1 wolf-pack and goblin-warren encounters have this as their signature evasion mechanic; previously the goblins shipped with empty `traits` arrays.

**New planner** [src/engine/plan/nimble-escape.ts](../../src/engine/plan/nimble-escape.ts): `planNimbleEscape({ goblinId, mode: 'disengage' | 'hide', dc?, at? })`. Hardcoded statblockId whitelist (`{goblin-warrior, goblin-minion, goblin-boss}`) — same gating shape as `planAdrenalineRush`'s species-id check. Both modes emit `ActionEconomyConsumed(bonusAction)` first. The `disengage` mode then emits a single `Disengaged` event (mirrors planDisengage's body without the Action gate); the `hide` mode rolls a Stealth check + emits `AbilityCheckRolled` + (on success) `ConditionApplied(invisible)` (mirrors planHide's body with bonus-action economy). DC defaults to 15 (matches planHide).

**Wired across the 4 standard sites:** plan/index.ts export, engine/index.ts import + type re-export + `Engine.plan.nimbleEscape` (type + impl), conveniences.ts `performIntent` dispatch. Slice-364 planner-wiring audit verified green.

**Content:** 3 goblin monsters in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json) each gain `traits: [{ kind: 'Custom', handlerId: 'nimble-escape' }]` — discoverable marker so consumers can surface the action.

**Test** at [tests/unit/engine/slice-455-nimble-escape.test.ts](../../tests/unit/engine/slice-455-nimble-escape.test.ts) — 6 cases: disengage emits the 2-event chain; hide success emits the 3-event chain with `invisible` applied; hide failure emits the 2-event chain without `invisible`; minion + boss both accepted; non-goblin rejected; consecutive call rejected (bonus already used).

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 Goblin Warrior / Minion / Boss exact text. Hide rolls DEX (Stealth) against DC, applies `invisible` on success (mirrors planHide's outcome shape).
- *Names*: `planNimbleEscape` / `NimbleEscapeIntent` mirror the `planAdrenalineRush` / `AdrenalineRushIntent` shape. `NIMBLE_ESCAPE_STATBLOCKS` constant centralizes the gating list. `NimbleEscapeMode` exported type for consumer-side discrimination.
- *DRY*: planner body inlines the planHide stealth-roll chain rather than calling planHide directly, because planHide bundles its own action-consume (the wrong economy slot here). Declined to refactor planHide into a "rollHideCheck" helper (only 2 callers; below threshold). Disengage path is the trivial parallel.
- *SRP*: a dedicated planner per "monster X as Bonus Action" trait is the established pattern (Step of the Wind, Patient Defense, Adrenaline Rush, Wholeness of Body). Declined to introduce a generic "monster bonus action" effect kind.
- *at-threading*: single `nowIso()` resolution shared across all emitted events.
- *Mechanical outcomes asserted*: per-mode chain shape; goblin-variant whitelist; non-goblin rejection; bonus-action gate.

**Open follow-ups:**
- **Gnoll Rampage**: 1/Day Bonus Action after damaging a Bloodied creature: half-Speed move + one Rend attack. Needs both a "Bloodied" target predicate and a DamageApplied-triggered bonus-action-attack grant. Distinct shape from Nimble Escape. *Still open.*
- **Goblin Boss Redirect Attack** (Reaction): swap places with a Small/Medium ally within 5 ft; the ally becomes the attack target instead. Positional + reaction primitive; defer. *Still open.*

**Content (slice 454): Brown Bear Claw + Mastiff Bite knock-prone-on-hit (L1)**

Two new natural-weapon items reusing the slice-446 size-gated onHit Prone primitive. **Brown Bear Claw** (1d4 slashing, Prone on Large or smaller per SRD 5.2.1 animals.md Brown Bear); **Mastiff Bite** (1d6 piercing, Prone on Medium or smaller per SRD Mastiff). Both wield via the standard natural-weapon pattern: the item carries the dice + onHit rider, the wielder STR + PB produces the RAW attack/damage totals (Brown Bear STR 17 +PB 2 = +5 to hit / 1d4+3 dmg; Mastiff STR 13 +PB 2 = +3 / 1d6+1). Pure content; no engine work.

**Test** at [tests/unit/engine/slice-454-bear-mastiff-prone.test.ts](../../tests/unit/engine/slice-454-bear-mastiff-prone.test.ts) — 5 cases: Brown Bear Claw on Medium target -> Prone; on Large target -> Prone (gate is Large or smaller); on Huge target -> no Prone; Mastiff Bite on Medium -> Prone; on Large -> no Prone (gate is Medium or smaller).

**Scope notes (corrections to slice 453's queue):** Worg Pack Tactics, Brown/Black Bear Keen Smell, and Blink Dog Keen Hearing/Sight/Smell are 2014 PHB traits that 2024 SRD dropped entirely (verified against SRD 5.2.1 animals.md + monsters-A-Z.md). Spider Climb on Giant Spider + Giant Wolf Spider is already modeled via their fixed `speed.climb` data field (2024 RAW grants fixed climb speeds, not "equal to walk speed"); no trait wire needed. So this slice ends up at 2 monsters' worth of new content rather than the originally-projected ~7.

**Doc updates:** weapons 58 -> 60 in [docs/getting-started.md](../../docs/getting-started.md) and [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) (the doc-counts audit also surfaced pre-existing 56 -> 58 drift from slice 449's sprite weapons that hadn't been reconciled; both fixes folded into this slice's update).

**Archive: slices 444-450 moved to [docs/changelog/archive-slices-444-450.md](archive-slices-444-450.md)** to keep the live CHANGELOG under the 60 KB single-Read ceiling. Live file now carries only the active cycle from slice 451 onward; the L1-arc detail (parts of which slice 454 builds on) is one click away in the archive. Index updated in [docs/changelog/README.md](README.md).

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 animals.md Brown Bear Claw and Mastiff Bite text verbatim. Same `any` over enumerated Size predicate as slice-446 wolf wires.
- *DRY*: identical shape to wolf-bite / dire-wolf-bite, just different dice + size gate. The 3- and 4-term `any` predicates are still cleaner inline than introducing a `creatureSizeAtMost` shorthand (4 callers now; threshold maybe close, but not yet justified).
- *Mechanical outcomes asserted*: per-size gate fires the expected ConditionApplied (or doesn't), per-weapon; hit prerequisite enforced (no prone on a miss).

**Open follow-ups:**
- Other prone-on-hit users in the SRD pack — Boar Gore (Medium or smaller + 20+ ft straight movement), Allosaurus Claws (Large or smaller + 30+ ft straight movement) — both gated on movement-derived facts the engine doesn't carry. Ankylosaurus Tail (Huge or smaller, unconditional) is also similar but Ankylosaurus isn't in the pack. *Still open.*
- The `creatureSizeAtMost` shorthand predicate would compress these 3- and 4-term `any` chains; 4 canonical users (Wolf, Dire Wolf, Brown Bear, Mastiff) but still inline-readable. Re-evaluate when a 5th lands. *Still open.*

**Engine + content (slice 453): Orc Adrenaline Rush species trait - L1 playability arc**

Closes slice-448's deferred Adrenaline Rush row. RAW (SRD 5.2.1 character-origins.md L317): "Dash as a Bonus Action; you gain Temp HP equal to your PB." At-will. (Scope note: the queue's "Orc Aggressive" was a 2014 monster trait; 2024 SRD has no Orc monster, and the species's bonus-action trait is Adrenaline Rush. Gnoll Rampage is a different shape, future slice.)

New planner [src/engine/plan/adrenaline-rush.ts](../../src/engine/plan/adrenaline-rush.ts) modeled on `planStepOfTheWind`: validates Orc species + active combatant + bonus available + not already dashed; emits `ActionEconomyConsumed(bonusAction)`, `Dashed`, `TempHPGranted(amount = proficiencyBonus(computeTotalLevel))`. Reuses the existing `Dashed` event so dashed-this-turn book-keeping layers in unchanged. Wired across the 4 standard sites; slice-364 planner-wiring audit verified green. Orc species in pack gains a `Custom { handlerId: 'adrenaline-rush' }` marker (discoverable signal; the planner reads species id directly).

Test at [tests/unit/engine/slice-453-adrenaline-rush.test.ts](../../tests/unit/engine/slice-453-adrenaline-rush.test.ts) — 4 cases: Orc L1 (PB 2 -> TempHP 2), Orc L5 (PB 3 -> TempHP 3), Human rejected, bonus-already-used rejected.

Audit: RAW match exactly; names mirror Step of the Wind; declined a "GrantBonusActionVariantOfAction" effect-kind abstraction (only 2 callers; below threshold); single at-threading; mechanical chain + PB scaling + species + economy gates all asserted. Open follow-ups: Gnoll Rampage (Bloodied predicate + damage-trigger bonus-action attack); other slice-448-deferred species traits.

**Content (slice 452): Sunlight Sensitivity / Weakness sweep across 4 SRD Undead - L1 playability arc**

Pure content sweep using the slice-451 primitive. RAW (SRD 5.2.1) gives four pack monsters a sunlight-gated disadvantage that previously shipped as `traits: []`:

| Monster | CR | RAW name | Wired this slice |
|---|---|---|---|
| Specter | 1 | Sunlight Sensitivity | attack-disadvantage + check-disadvantage (full RAW) |
| Wight | 3 | Sunlight Sensitivity | attack-disadvantage + check-disadvantage (full RAW) |
| Wraith | 5 | Sunlight Sensitivity | attack-disadvantage + check-disadvantage (full RAW) |
| Shadow | 1/2 | Sunlight Weakness | attack-disadvantage + check-disadvantage (partial; saves arm deferred) |

Each monster's `traits` array in [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json) gains two `SetAdvantage` entries (one `on: 'attack'`, one `on: { kind: 'check' }`) gated on `bearer.lightLevel == 'bright'`. Identical shape to Kobold Warrior's slice-451 wiring.

**Shadow's Sunlight Weakness saves-arm deferral:** SRD says "Disadvantage on D20 Tests" — which in 2024 includes saving throws as well as attack rolls and ability checks. This slice wires the attack + check arms (which use the existing `bearer.lightLevel` fact on `AttackIntent` and `ComputeAbilityCheckInput`); the saves arm would need `lightLevel` threaded through `ComputeSaveInput` too. That's a small symmetric engine extension but it would also need to thread through every planner that calls `computeSavingThrow` (cast-spell, recurring-save, stunning-strike, transformations, movement, etc.), so it's a slice of its own. Documented as Open follow-up below.

**Test** at [tests/unit/engine/slice-452-sunlight-sweep.test.ts](../../tests/unit/engine/slice-452-sunlight-sweep.test.ts) — 8 cases (4 monsters × {bright -> disadvantage, dim -> none}). Parametrized over the monster ids so adding a 5th sunlight-sensitive creature in a future slice extends the matrix by 2 lines.

**Audit (content slice):**
- *RAW match*: SRD 5.2.1 monsters-A-Z.md Specter / Wight / Wraith / Shadow Sunlight-Sensitivity / Weakness lines verbatim for the attack + check arms; Shadow's saves arm documented as deferred (not wired here).
- *DRY*: identical 2-entry pattern across 4 monsters; declined to extract a "sunlight-sensitive" trait template — the shape is small enough that inline duplication beats a content-side template indirection (there are no other shared dimensions, and adding a 5th user later costs the same 2 lines).
- *Mechanical outcomes asserted*: parametrized over all 4 monsters; bright -> disadvantage, dim -> none. Cross-monster confirms the slice-451 primitive doesn't accidentally couple to Kobold-specific state.

**Open follow-ups:**
- **Shadow's Sunlight Weakness saves arm** (closing slice 452 partial): thread `lightLevel?: 'bright' | 'dim' | 'darkness'` through `ComputeSaveInput` mirror-fashion (slice 279's check-side, slice 451's attack-side), and through every planner that calls `computeSavingThrow`. Wire a third `SetAdvantage on: { kind: 'save' }` arm on Shadow. *Still open.*
- Other Undead Sunlight users still in scope but not in the SRD pack (Vampire Spawn's Sunlight Hypersensitivity is a damage shape, not a disadvantage shape — different primitive needed). *Still open.*

~~Open follow-up from slice 451: **Other Sunlight Sensitivity / Sunlight Weakness users:** Shadow (CR 1/2), Wight (CR 3), Wraith (CR 5), Specter (CR 1).~~ **Closed by slice 452** (Shadow's saves arm reopened above as a narrower follow-up).

**Engine + content (slice 451): Sunlight Sensitivity on Kobold Warrior - L1 playability arc**

Completes the Kobold Warrior's RAW combat profile (Pack Tactics from slice 445 + Sunlight Sensitivity now). RAW (SRD 5.2.1 Kobold Warrior): "While in sunlight, the kobold has Disadvantage on ability checks and attack rolls." Slice 451 closes both arms by **extending slice 279's existing `bearer.lightLevel` consumer-coordinated fact** from the check-only intent (`ComputeAbilityCheckInput`) to the attack-side intents (`AttackIntent` + `ResolveAttackInput`); the check arm reuses slice 279 unchanged. The attack arm uses the same fact name + same opt-in semantic, so a consumer that already populates `lightLevel` on one intent populates the same value on the other.

**Engine** (small, mirrors the slice-279 shape):
- New `lightLevel?: 'bright' | 'dim' | 'darkness'` field on `AttackIntent` and `ResolveAttackInput` in [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts). Optional; `undefined` produces no Sunlight Sensitivity disadvantage (opt-in default, matching slice 279).
- Threaded into `attackerSelfAdvantageFacts` as `bearer.lightLevel` so attacker-side `SetAdvantage` entries can gate on it. Same fact-name namespace the existing slice-279 check-side path uses, so trait predicates are identical between the two paths.
- Threaded from `AttackIntent` to `ResolveAttackInput` in the `planAttack -> resolveAttack` call site.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): kobold-warrior's traits array gains two entries alongside the existing Pack Tactics:
- `SetAdvantage on:'attack' mode:'disadvantage' condition: eq bearer.lightLevel 'bright'`
- `SetAdvantage on:{kind:'check'} mode:'disadvantage' condition: eq bearer.lightLevel 'bright'`

**Test** at [tests/unit/engine/slice-451-sunlight-sensitivity.test.ts](../../tests/unit/engine/slice-451-sunlight-sensitivity.test.ts) — 5 cases:
- Kobold attack with `lightLevel: 'bright'` -> `used: 'disadvantage'`, 2× d20.
- Kobold attack with `lightLevel: 'dim'` -> `used: 'none'`.
- Kobold attack with `lightLevel: 'darkness'` -> `used: 'none'`.
- Kobold attack with `lightLevel` omitted -> `used: 'none'` (opt-in default).
- Kobold ability check in `'bright'` light has disadvantage; in `'dim'` does not (re-confirms the slice-279 check-side arm still works for the kobold's check-disadvantage arm using the same `bearer.lightLevel` fact).

**Catalog updates:** the consumer-coordinated fact slots row for `lightLevel` in [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md) now lists both check-side and attack-side entry points. Added a `Sunlight Sensitivity never fires (opt-in)` line to the until-consumer-wires-it section.

**Audit (engine + content slice):**
- *RAW match*: SRD 5.2.1 monsters-A-Z.md Kobold Warrior Sunlight Sensitivity exactly. The dim/darkness/undefined cases all correctly produce no disadvantage (the predicate is `eq 'bright'`, no other value matches).
- *Names*: `lightLevel` matches the existing slice-279 field name exactly. The fact-name `bearer.lightLevel` is consistent across both intent types.
- *DRY*: declined to introduce a separate "attack-side lightLevel" fact name; reused the slice-279 namespace so content gates on one canonical name regardless of whether it's a check or an attack.
- *SRP*: the change is mechanical-only (one field, one map entry, one passthrough). The Sunlight Sensitivity trait is pure content; the engine doesn't get a "sunlight-sensitive" concept of its own.
- *Mechanical outcomes asserted*: per-light-value gate fires correctly (`bright` -> disadvantage; everything else -> none) for both arms. The Pack Tactics trait on the same monster still works (cross-effect non-interference confirmed by the still-green slice-445 test).

**Open follow-ups:**
- ~~**Other Sunlight Sensitivity / Sunlight Weakness users:** Shadow (CR 1/2), Wight (CR 3), Wraith (CR 5), Specter (CR 1). All canonical 2024 candidates. Shadow + Specter are L1-encounter monsters. Same primitive shape, just content sweeps.~~ **Closed by slice 452** (Specter / Wight / Wraith fully; Shadow's attack + check arms; saves arm tracked as a narrower follow-up).
- **Population from a "sun is up" boolean** on the consumer's encounter would let the consumer set `lightLevel: 'bright'` once on a per-encounter basis rather than per-intent; that's a consumer concern (the engine doesn't model time-of-day). *Still open* as a future consumer ergonomics note.

*Slice detail for slices 444-450 (the L1 playability arc, part 1: Divine Smite, Pack Tactics, Wolf knock-prone, species sweep 1+2, Sprite + Thieves' Cant, noAbilityModifierDamage flag) moved to [docs/changelog/archive-slices-444-450.md](archive-slices-444-450.md) in slice 454 to fit the live CHANGELOG under the 60 KB single-Read ceiling. Slices 451-454 remain inline above.*
