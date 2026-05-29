# CHANGELOG archive: slices 491-495 (post-alpha.15 cohort D: charge/web/disease monster traits + spell primitives)

Per-slice detail for slices 491-495, moved out of the live [CHANGELOG.md](../../CHANGELOG.md) in slice 499 to keep it under the 60 KB single-Read ceiling. Cohort: the close of the iconic-monster trait sweep plus the start of the L1-spell-tail wiring. Picks up where [archive-slices-487-490.md](archive-slices-487-490.md) leaves off. Highlights:
- Slice 491: Boar Gore (charge rider) + the `event.attackerChargedThisTarget` consumer-coordinated fact.
- Slice 492: Web Walker (Giant Spider / Drider / Ettercap) + the `restrained-by-web` source-tagged condition.
- Slice 493: Death Dog disease (onHit + 24h cure save) + RecurringSave `'longRest'` trigger.
- Slice 494: True Strike + the `weaponAttack` spell mechanic + `abilityOverride` on attacks.
- Slice 495: the positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness.

Slices 496-499 (zone-cohort sweep + spell-catalog reconcile; Ice Knife + `targetScope`; Sorcerous Burst + `explodeOnMaxDie`; Goodberry + `create-item`) stay in the live CHANGELOG as the most-recent cohort.

---

**Engine + content (slice 495): positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness**

First wired users of a new zone primitive that lets concentration spells declare a positioned AOE (Fog Cloud's 20-ft fog sphere, Silent Image's 15-ft cube illusion, Darkness's 15-ft magical-darkness sphere). The engine now tracks where the zone is and its shape/size on the parent EffectInstance; consumers read the zone from state and apply the spell's RAW effect to creatures inside (heavy obscurement, illusion render, magical darkness — these stay consumer-managed since position-aware enforcement needs the consumer's scene model).

**Engine** ([src/schemas/runtime/effect-instance.ts](../../src/schemas/runtime/effect-instance.ts), [src/schemas/events/concentration.ts](../../src/schemas/events/concentration.ts), [src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts), [src/engine/reducers/concentration.ts](../../src/engine/reducers/concentration.ts)):
- New `ZoneShape` enum (`'sphere' | 'cube' | 'cylinder' | 'line' | 'cone'`) + `Zone` schema (shape + size + center).
- New optional `zone` field on `EffectInstance` — persists the zone on the parent concentration effect. Concentration drop deletes the EffectInstance, removing the zone naturally (no separate state field, no separate cleanup).
- New optional `zone` field on `ConcentrationStartedEvent` — carries the same metadata on the event log so transcripts trace zone creation alongside the concentration start.
- New SpellMechanic kind `zone` (16th in the discriminated union). Pure marker — the cast-spell planner reads the spell's existing `targeting` (shape + size) and the intent's `targetPosition` and stamps the zone on ConcentrationStarted. The dispatch case is a no-op since the zone is constructed inline at the ConcentrationStarted construction site.
- New optional `targetPosition?: { x, y }` field on `CastSpellIntent`. Required by zone-mechanic spells; throws if absent.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Fog Cloud (L1, sphere 20), Silent Image (L1, cube 15), Darkness (L2, sphere 15): `mechanicalEffects: []` -> `[{ kind: 'zone' }]`. Each spell's existing `targeting` metadata supplies the shape + size.

**Tests** at [tests/unit/engine/slice-495-zone-spells.test.ts](../../tests/unit/engine/slice-495-zone-spells.test.ts) - 8 cases:
1-3. (it.each) Each of Fog Cloud / Silent Image / Darkness ships with a `zone` mechanic + the expected targeting shape/size.
4. Casting Fog Cloud with `targetPosition: { x: 25, y: 10 }` emits ConcentrationStarted with `zone: { shape: 'sphere', size: 20, center: { x: 25, y: 10 } }`.
5. The reducer persists the zone on `state.effectInstances[eid].zone`.
6. Casting a zone spell without `targetPosition` throws.
7. Silent Image uses cube 15 targeting.
8. Concentration drop (caster starts a second concentration spell) removes the first effect instance + its zone, and the new effect instance carries its own zone.

**Audit:**
- *Names*: `Zone` / `ZoneShape` mirror the existing `Targeting` / `TargetingShape` shape on the spell side. `targetPosition` follows the existing `targetIds` / `casterChoice` per-cast field naming.
- *DRY*: zone metadata folds into the existing EffectInstance + ConcentrationStarted plumbing; no separate `zoneInstances` state field, no separate ZoneCreated / ZoneRemoved event pair. Concentration cleanup already deletes the effect instance.
- *SRP*: one new schema, one new optional field per surface, one new mechanic kind. The dispatch case is intentionally a no-op (the zone is built inline at the ConcentrationStarted site so the metadata + the event commit together).
- *Magic numbers*: none added; zone size/shape come from each spell's existing `targeting` block.
- *Mechanical outcomes asserted*: 8 cases pin the three canonical spell wires, the event-side zone, the state-side zone, the no-position guard, and the concentration-drop teardown.

**Deferred RAW arms (consumer-managed for now, documented)**:
- Heavy obscurement enforcement (Fog Cloud / Darkness) — the engine knows where the zone is but doesn't auto-apply a Blinded-style condition to creatures inside it. The consumer reads `effectInstance.zone` + its own scene positions and applies obscurement effects via the existing `bearer.canSeeAttacker` / `targetCanSeeAttacker` consumer-coordinated facts (slice 278). The engine isn't the source of truth for "who is inside which zone" because zone-occupancy depends on the consumer's positional model.
- Silent Image's illusion-render mechanic (Investigation save to disbelieve) — consumer-managed.
- Darkness's "creatures with Darkvision can't see through it" arm — consumer's Darkvision logic checks for any active Darkness zone overlapping the line of sight.

**Pattern-check**: the zone primitive is reusable for any concentration spell with positioned AOE. 13 schema-only zone-style concentration spells in the pack today (aura-of-life L4 sphere 30; globe-of-invulnerability L6 sphere 10; move-earth L6 cube 40; reverse-gravity L7 cylinder 100; antimagic-field L8 sphere 10; earthquake L8 cylinder 100; dragons-breath L2 cone 15; phantasmal-force L2 cube 10; silence L2 sphere 20; slow L3 cube 40; plus the 3 wired here). Each of those can opt into the zone primitive by adding `{ kind: 'zone' }` to its `mechanicalEffects`; their existing `targeting` metadata already declares shape + size. No engine change needed for the remaining 10 — pure content sweep.

**Engine + content (slice 494): True Strike (2024) + `weaponAttack` spell mechanic + `abilityOverride` on attacks**

Closes True Strike from the L1 schema-only spell tail. New SpellMechanic kind `weaponAttack` that delegates to a real weapon attack with the caster's spellcasting ability driving the attack + damage rolls. The mechanic is the canonical user but is intentionally a pure marker so future "cast spell, make weapon attack" shapes (Booming Blade, Green-Flame Blade) reuse the same shape.

RAW (SRD 5.2.1 True Strike, cantrip, Bard / Sorcerer / Warlock / Wizard): "you make one attack with the weapon used in the spell's casting. The attack uses your spellcasting ability for the attack and damage rolls instead of using Strength or Dexterity. If the attack deals damage, it can be Radiant damage or the weapon's normal damage type (your choice). _Cantrip Upgrade._ The attack deals extra Radiant damage when you reach levels 5 (1d6), 11 (2d6), and 17 (3d6)."

**Engine** ([src/derive/attack.ts](../../src/derive/attack.ts), [src/engine/plan/attack.ts](../../src/engine/plan/attack.ts), [src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- New optional `abilityOverride?: 'STR'|'DEX'|'CON'|'INT'|'WIS'|'CHA'` on `ComputeAttackInput`, `AttackIntent`, and `ResolveAttackInput`. When set, `attackAbility` returns the override instead of `chooseAttackAbility`'s weapon-property-driven default; `chooseDamageAbility` in the resolver mirrors it for damage rolls. Threaded through the three plumbing sites (computeAttackBonus / attack-bonus call site / damage-mod call site). Existing callers without an override behave unchanged.
- New SpellMechanic kind `weaponAttack` (15th in the discriminated union). Pure marker (no inner fields) in this first ship; the mechanic dispatches to a new `planWeaponAttackMechanic` that:
  - Requires `intent.weaponInstanceId` (throws otherwise).
  - Reads the caster's spellcasting ability from the slice-487 `resolveCastingAbility`.
  - Calls `resolveAttack` with the weapon + abilityOverride set + the first targetId.
  - Stamps `causedByEventId: declaredEventId` on the first emitted event (the `AttackRolled`) so transcripts trace the chain.
- New `weaponInstanceId?: string` field on `CastSpellIntent`. Required when the spell's mechanicalEffects include a `weaponAttack` mechanic.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- `true-strike` spell: `mechanicalEffects: []` -> `mechanicalEffects: [{ kind: 'weaponAttack' }]`.

**Deferred RAW arms (documented in the mechanic + cast-spell.ts comments)**:
- Damage-type choice (Radiant or weapon-normal). The attack deals the weapon's printed type for now; the caster can't opt into Radiant via the engine yet.
- Cantrip Upgrade — extra Radiant damage at character L5 (+1d6), L11 (+2d6), L17 (+3d6). Needs a follow-up that runs cantrip scaling against a flat radiant rider; documented as deferred.

**Tests** at [tests/unit/engine/slice-494-true-strike.test.ts](../../tests/unit/engine/slice-494-true-strike.test.ts) - 4 cases:
1. True Strike's mechanicalEffects shape.
2. An L1 wizard with INT 18 / STR 8 casts True Strike + quarterstaff -> AttackRolled.attackBonus = +4 (INT, not STR-1). Wizard has no weapon proficiency in the 2024 pack, so PB is correctly absent.
3. Casting without `weaponInstanceId` throws the slice-494 intent-revealing error.
4. On a hit, the DamageRoll's modifier is INT +4 (not STR -1) — confirms the override threads to the damage path.

**Audit:**
- *RAW match*: the immediate "attack with the weapon, use spellcasting ability for attack + damage" arm is exact. The deferred arms (damage-type choice + cantrip scaling) are documented with the specific RAW text + the primitive each needs.
- *Names*: `abilityOverride` mirrors slice-487's `castingAbility` override on `ComputeSpellDCInput` exactly. `weaponAttack` follows the lowercase-mechanic-kind convention (`save`, `attack`, `buff`, etc.).
- *DRY*: `planWeaponAttackMechanic` is a thin wrapper around the existing `resolveAttack`; no duplicate attack-resolution logic. The override-or-default fallback at `attackAbility` is a one-liner.
- *SRP*: one new optional field per signature; one new mechanic dispatch case; one new mechanic-planner function. Existing code paths untouched.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: 4 cases cover the wire shape, attack-bonus override, weaponInstanceId guard, and damage-mod override.

**Pattern-check**: the `weaponAttack` mechanic + `abilityOverride` pair is reusable for any future "cast spell, make weapon attack" cantrip. Booming Blade and Green-Flame Blade (XGtE / 2024 backports if ever added) reuse the same mechanic + add their on-hit riders. The override path is also reusable for any future feature that lets a non-spellcaster use a different ability for weapon attacks (e.g. Hexblade's Hex Warrior, if added). No regression risk: `abilityOverride` is opt-in throughout; without it, the existing chooseDamageAbility / chooseAttackAbility paths apply.

**Engine + content (slice 493): Death Dog disease (onHit + 24h cure save) + RecurringSave `'longRest'` trigger**

Closes the last remaining slot in the slice-477 iconic beast/monstrosity traits queue. The Death Dog's disease arm now applies the immediate Poisoned + the 24-hour cure-save loop; two documented RAW arms (HP-max-doesn't-restore-on-long-rest, HP-max-decreases-on-subsequent-failures) stay deferred until the engine grows an HP-max-decay accumulator.

RAW (SRD 5.2.1 Death Dog, CR 1): "Bite. Hit: 1d4 piercing. CON DC 12. First Failure: The target has the Poisoned condition. While Poisoned, the target's Hit Point maximum doesn't return to normal when finishing a Long Rest, and it repeats the save every 24 hours that elapse, ending the effect on itself on a success. Subsequent Failures: HP max decreases by 1d10."

**Engine** ([src/schemas/content/condition.ts](../../src/schemas/content/condition.ts)):
- `RecurringSave.trigger` enum gains `'longRest'`. Purely declarative metadata — the consumer drives ticks at their chosen cadence; the engine doesn't track hours. Existing `'turnStart'` / `'turnEnd'` semantics unchanged.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `death-dog-disease-active` condition: carries Poisoned's effects directly (Disadvantage on attacks + ability checks) + `recurringSave: { ability: 'CON', fixedDC: 12, trigger: 'longRest', onSuccess: 'removeCondition' }` + `category: 'disease'` (slice-134 removal-taxonomy tag so Lesser Restoration / Greater Restoration can strip it).
- `death-dog-bite` weapon gains the slice-319 onHit save rider: `{ save: { ability: 'CON', dc: 12, conditionOnFail: 'death-dog-disease-active' } }`. Same shape as Ghoul's Claw and Cockatrice's Petrifying Bite.

**Deferred RAW arms (still consumer-managed, documented in the condition's description)**:
- "HP max doesn't return on long rest" — engine doesn't model HP-max-restore semantics; the long-rest reducer leaves max untouched anyway (no HP-max-decay mechanism shipping yet).
- "Subsequent Failures: HP max decreases by 1d10" — needs an HP-max-decay accumulator + a new onFail variant (similar shape to slice 488's `escalateToCondition`). Tracked for a future slice.

**Doc-count update**: conditions 129 -> 130 (15 RAW + 114 -> 115 rider; effect-bearing 112 -> 113).

**Tests** at [tests/unit/engine/slice-493-death-dog-disease.test.ts](../../tests/unit/engine/slice-493-death-dog-disease.test.ts) - 5 cases: bite weapon shape with the save rider; condition shape (Poisoned effects + recurringSave fields + category); end-to-end bite path (hit + failed save -> condition applied); cure-save tick (passed save -> ConditionRemoved); category tag for removal-spell coverage.

**Audit:**
- *RAW match*: the immediate Poisoned arm + 24-hour cure-save are both wired exactly per SRD. The deferred arms (HP-max behaviors) are documented in the condition description with the specific RAW text + the primitive each needs.
- *Names*: `death-dog-disease-active` follows the `*-active` source-tag convention; the `'longRest'` trigger value mirrors the existing `'turnStart'` / `'turnEnd'` enum.
- *DRY*: the condition copies Poisoned's effects directly (same pattern as slice-488 Cockatrice Restrained + slice-492 restrained-by-web). The save rider shape mirrors Ghoul's Claw / Cockatrice's Petrifying Bite.
- *SRP*: one new enum value, one new condition, one new save rider on an existing weapon.
- *Magic numbers*: DC 12 + 1d4 base + 1d10 deferred-decay all cite the SRD entry inline.

**Pattern-check**: the `'longRest'` trigger value unlocks any future "lingering disease" or "curse with periodic cure save" mechanic on a non-encounter cadence (Mummy Rot, Werewolf Lycanthropy curse, future affliction-style spells). Each future user populates `trigger: 'longRest'` and the consumer ticks at long-rest time. The HP-max-decay accumulator + `onFail: 'decreaseHPMax'` (or similar) variant remains the natural next primitive for the Death Dog's "subsequent failures" arm + Mummy Rot's "max HP can't be restored" arm + similar.

**Cohort summary**: with this slice, the **slice-477 "iconic beast/monstrosity traits" deferred list is empty**. All five iconic CR ≤ 1 monster traits that were tracked there — Boar Bloodied Fury (483), Worg Bite (484), Cockatrice Petrification (488), Hippogriff Flyby (489), Stirge Blood Drain (490), Boar Gore (491), Spider Web Walker (492), Death Dog disease (493) — have wired arms or carry tracked RAW deviations with their next-primitive cited.

**Content (slice 492): Web Walker (Giant Spider / Drider / Ettercap) + `restrained-by-web` source-tagged condition**

Closes the Giant Spider Web Walker slot on the slice-477 deferred follow-up. Pure content slice — no engine change. The existing `conditionImmunities` array on MonsterStatblock auto-projects to `GrantConditionImmunity` effects (effect-stack.ts), and the existing `isImmuneToCondition` gate enforces the immunity at apply time.

RAW (SRD 5.2.1 Web Walker — Giant Spider, Drider, Ettercap): "The spider ignores movement restrictions caused by webs, and the spider knows the location of any other creature in contact with the same web."

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `restrained-by-web` condition: a direct copy of `restrained`'s effects (ModifySpeed walk 0, Disadvantage on attacks, Disadvantage on DEX saves, GrantAdvantageToAttackers). The distinct id lets Web Walker creatures carry an immunity to it without being immune to Restrained from other sources (Entangle, grapple, Ensnaring Strike). A web-source application uses this id; a plant- / grapple- / spell-source application keeps the generic `restrained` id and bypasses the immunity.
- Web spell ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)): `conditionOnFail` changed from `restrained` to `restrained-by-web`. Future web-source applications (Giant Spider's Web action, Ettercap's Web action when authored) will use the same id.
- Giant Spider / Drider / Ettercap statblocks: gain `traits: [{ kind: 'GrantConditionImmunity', conditionId: 'restrained-by-web' }]`. The trait array (not the `conditionImmunities` literal) is the right place because Web Walker is a body-text trait in the SRD, not an entry on the `**Immunities**` line that srd-drift mirrors literally.

**Deferred (RAW arm not wired)**: the "knows the location of any other creature in contact with the same web" arm. The engine has no web-occupancy tracker and no per-creature web-membership graph. Documented as consumer-managed (the consumer's scene model is the source of truth for web positions).

**Doc-count update**: conditions 128 -> 129 (15 RAW + 113 -> 114 rider; effect-bearing 111 -> 112).

**Tests** at [tests/unit/engine/slice-492-web-walker.test.ts](../../tests/unit/engine/slice-492-web-walker.test.ts) - 9 cases (3 monsters x 2 it.each tables + 3 standalone):
1. `restrained-by-web` carries the same effects as `restrained` (direct copy).
2. Web spell's `conditionOnFail` is now `restrained-by-web`.
3-5. (it.each) Each of Giant Spider / Drider / Ettercap carries the Web Walker trait (GrantConditionImmunity restrained-by-web).
6-8. (it.each) `isImmuneToCondition` returns true for `restrained-by-web` AND false for generic `restrained` on each Web Walker monster (the source-tag distinction holds).
9. A hero (no Web Walker trait) is NOT immune to `restrained-by-web`.

**Audit (content slice):**
- *RAW match*: the immunity targets web-source restraints only; non-web Restrained (Entangle, grapple) still applies. Three Web Walker users wired (the complete SRD 5.2.1 set).
- *Names*: `restrained-by-web` follows the existing `*-active` / `*-targeted` convention for source-tagged variants.
- *DRY*: effects are a direct copy from `restrained`; the source-tag distinction is the only difference. No effect-stack code change.
- *Mechanical outcomes asserted*: the spell-side redirect + the three statblock immunities + the isImmuneToCondition source-distinction.

**Pattern-check**: the `restrained-by-web` source-tag pattern is reusable for any future source-keyed condition immunity (e.g., a "frightened-by-divine" immunity for unholy creatures vs. paladin auras, or a "charmed-by-fey" immunity). The current pack has no other source-keyed immunities — the pattern is canonical for "immune to X from a specific source family without breaking X from other sources."

**Engine + content (slice 491): Boar Gore (charge rider) + `event.attackerChargedThisTarget` fact**

Closes the Boar Gore slot on the slice-477 deferred follow-up. The Boar's signature charge-and-knockdown shape now ships as content via a consumer-coordinated fact, matching the established pattern for predicates the engine can't observe (movement direction + "immediately before the hit" timing).

RAW (SRD 5.2.1 Boar, CR 1/4): "Gore. Melee Attack Roll: +3, reach 5 ft. Hit: 4 (1d6 + 1) Piercing damage. If the target is a Medium or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit, the target takes an extra 3 (1d6) Piercing damage and has the Prone condition."

**Engine** ([src/engine/plan/attack.ts](../../src/engine/plan/attack.ts)):
- New optional `chargedAtTarget?: boolean` field on AttackIntent + ResolveAttackInput. Same opt-in shape as `bearer.lightLevel` (slice 451) / `attackerHasAllyAdjacentToTarget` (slice 445): the engine doesn't track movement direction or "movement immediately before the hit," so the consumer signals the combined predicate (≥20 ft + straight + toward this target + immediately-prior) as one boolean. Undefined evaluates to false, preserving pre-491 onHit-rider behavior.
- The fact surfaces as `event.attackerChargedThisTarget` in the riderFacts map at the onHit-rider predicate site, alongside the existing slice-446 `target.creatureSize` and slice-318/319 type facts.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `boar-gore` natural weapon (1d6 piercing) with a single onHit rider carrying BOTH extra 1d6 piercing AND `applyConditionId: 'prone'`, gated on a compound `all` predicate: (a) `target.creatureSize ∈ {Tiny, Small, Medium}` AND (b) `event.attackerChargedThisTarget === true`. The +1 damage / +3 attack come from the wielder's STR + PB.
- Boar statblock unchanged (the slice-483 Bloodied Fury trait stays; Gore is a natural weapon consumers instantiate).

**Doc-count update**: weapons 74 -> 75, items 537 -> 538.

**Tests** at [tests/unit/engine/slice-491-boar-gore.test.ts](../../tests/unit/engine/slice-491-boar-gore.test.ts) - 4 cases:
1. `boar-gore` ships with the compound size+charge rider shape.
2. Non-charged Gore on a Medium target: 1d6 piercing only, no Prone.
3. Charged Gore on a Medium target: 1d6 primary + extra 1d6 + Prone.
4. Charged Gore on a Large target (Hippogriff statblock): rider blocked by size gate, primary only.

**Audit:**
- *RAW match*: the compound predicate captures both halves of the RAW gate (size + charge). The "20+ feet straight" + "immediately before the hit" portions are documented as consumer-coordinated since the engine has no movement-direction model.
- *Names*: `chargedAtTarget` mirrors the existing `attackerHasAllyAdjacentToTarget` / `bearerCanSeeFearSource` / `lightLevel` naming on the consumer-coordinated fact family.
- *DRY*: same `kind: 'all'` / `kind: 'any'` predicate combinators that wired Wolf / Dire Wolf / Brown Bear / Mastiff knock-prone (slices 446 / 454 / 479). No new effect kind.
- *SRP*: one new field, one new fact entry, one new weapon, one new predicate.
- *Magic numbers*: none added (the "20 ft" threshold lives in the consumer's signal, not in engine code).
- *Mechanical outcomes asserted*: 4 cases pin the wire shape + both rider arms (extra damage + Prone) + the size gate.

**Pattern-check**: the `event.attackerChargedThisTarget` fact unlocks any future "charge"-style rider with the same shape (Allosaurus Pounce, Triceratops Trampling Charge, Rhinoceros Charge, Centaur Charge — all 2024 MM creatures with the "moved 20+ ft straight" trigger, not yet in the pack). Each future user adds a similarly-gated onHit rider on its natural weapon. No regression risk: the fact is additive; unconditional onHit riders that don't reference it are unaffected.
