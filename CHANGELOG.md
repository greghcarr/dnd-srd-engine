# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Content + fix (slice 496): zone-cohort sweep (Silence / Move Earth / Reverse Gravity / Earthquake) + slice-495 silent-image fix + spell-catalog reconcile**

Continues the slice-495 zone primitive across the rest of the genuine positioned-AOE concentration spells, fixes a slice-495 mis-wire, and reconciles the spell-coverage classification + gaps catalog for the whole zone + True-Strike cohort.

**RAW classification (the careful part).** The slice-495 pattern-check listed "~10 remaining zone spells," but that filter (`targeting + concentration + empty mechanicalEffects`) was too broad. Checked each against the SRD and wired only the 4 that are genuine caster-chosen-point persistent zones (the Fog Cloud shape):
- **Silence** (L2 sphere 20) — "centered on a point you choose within range."
- **Move Earth** (L6 cube 40) — "Choose an area of terrain... within range."
- **Reverse Gravity** (L7 cylinder 100) — "centered on a point within range."
- **Earthquake** (L8 cylinder 100) — "centered on that point."

Excluded 6 with documented reasons: **Aura of Life / Globe of Invulnerability / Antimagic Field** are caster-relative Emanations ("radiates from you" / "around you" / "surrounds you"), not point-zones — they'd need the aura system or a caster-anchor convention, not the fixed-`center` zone primitive; **Slow** is a save-on-cast applied to creatures in the cube at cast (a `save` mechanic, not a persistent zone); **Phantasmal Force** is a single-target mind illusion; **Dragon's Breath** is a buff on a willing creature. This is the "filter shape determines what a sweep can find" discipline (CLAUDE.md) — the starting filter's shape was a clue, not the boundary.

**Slice-495 bug fix.** Slice 495 added a `zone` mechanic to **silent-image**, but silent-image routes through the dedicated `planSilentImage` planner (which already tracks the illusion's position + concentration + the Investigation-to-disbelieve arm). The zone mechanic created a conflicting second cast path (`planCastSpell` vs `planSilentImage`). Reverted silent-image's `mechanicalEffects` to `[]`; it stays "wired, planner." The slice-495 test's silent-image cases were corrected (one dropped, one flipped to assert silent-image carries NO zone mechanic).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Silence / Move Earth / Reverse Gravity / Earthquake: `mechanicalEffects: []` -> `[{ kind: 'zone' }]`. Each spell's existing `targeting` block supplies shape + size.
- silent-image: `[{ kind: 'zone' }]` -> `[]` (slice-495 revert).

**Test reconcile** ([tests/unit/engine/spell-coverage.test.ts](tests/unit/engine/spell-coverage.test.ts)):
- New `{ kind: 'zone' }` expectation kind: casts with a `targetPosition` and asserts ConcentrationStarted carries a `zone` with the right center.
- fog-cloud + darkness flipped from `skip` to `zone` (slice 495 wired them in the pack but left them `skip` in coverage — they were never actually exercised). silence / move-earth / reverse-gravity / earthquake flipped from `skip` to `zone`.
- silent-image stays `skip` (planner-routed); true-strike's `skip` reason updated to reflect it's now wired via the slice-494 `weaponAttack` mechanic (the generic harness can't supply the required weaponInstanceId).

**Doc reconcile** ([docs/gaps-spells.md](docs/gaps-spells.md), [docs/getting-started.md](docs/getting-started.md), [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md), [docs/status.md](docs/status.md)):
- New `zone-area` + `weapon-attack` status-legend entries.
- Moved 7 spells deferred/narrative -> wired across L0 (true-strike, slice 494), L1 (fog-cloud, slice 495), L2 (darkness slice 495 + silence), L6 (move-earth), L7 (reverse-gravity), L8 (earthquake). Each level's `wired + narrative + deferred === inPack` invariant preserved (verified by [tests/audit/gaps-spells-counts.test.ts](tests/audit/gaps-spells-counts.test.ts)).
- Spell totals: **183 -> 190 wired** (148 cast-time, 11 zone-tick, 24 planner, 6 zone-area, 1 weapon-attack), **70 -> 69 narrative**, **86 -> 80 deferred**. Aligned the three prose citations (getting-started / starter-pack-gaps / status), which had pre-existing drift (status.md said 182/87 vs the others' 183/86).
- Flagged in the gaps-spells.md totals that the wired/narrative/deferred split has accumulated additional drift since the slice-337 full reconcile (spells wired in slices 338-444 whose catalog rows may not have moved); a future slice-337-style full reconcile would close it. This slice fixed the cohort it touched, not the whole backlog.

**Audit:**
- *RAW match*: each wired spell is a genuine caster-chosen-point zone; the 6 exclusions are documented with their RAW reason. The in-zone effects (silence/obscurement/gravity/terrain) stay consumer-managed against the positioned record, consistent with slice 495.
- *DRY*: no new engine code — pure content + classification, reusing slice 495's `zone` mechanic + the existing ConcentrationStarted/EffectInstance plumbing.
- *Pattern-check*: surfaced + fixed the slice-495 silent-image mis-wire AND the slice-495 fog-cloud/darkness coverage-staleness AND the slice-494 true-strike coverage-staleness — all the same "wired-in-pack-but-classified-skip / mis-routed" shape. Fixed every instance in the cohort; flagged the broader pre-337 split-drift as a tracked follow-up rather than leaving it silent.
- *Mechanical outcomes asserted*: spell-coverage's new `zone` case verifies each wired zone spell emits ConcentrationStarted with the positioned zone; the slice-495 test pins the silent-image revert.

**Engine + content (slice 495): positioned AOE-zone primitive + Fog Cloud / Silent Image / Darkness**

First wired users of a new zone primitive that lets concentration spells declare a positioned AOE (Fog Cloud's 20-ft fog sphere, Silent Image's 15-ft cube illusion, Darkness's 15-ft magical-darkness sphere). The engine now tracks where the zone is and its shape/size on the parent EffectInstance; consumers read the zone from state and apply the spell's RAW effect to creatures inside (heavy obscurement, illusion render, magical darkness — these stay consumer-managed since position-aware enforcement needs the consumer's scene model).

**Engine** ([src/schemas/runtime/effect-instance.ts](src/schemas/runtime/effect-instance.ts), [src/schemas/events/concentration.ts](src/schemas/events/concentration.ts), [src/schemas/content/spell.ts](src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts), [src/engine/reducers/concentration.ts](src/engine/reducers/concentration.ts)):
- New `ZoneShape` enum (`'sphere' | 'cube' | 'cylinder' | 'line' | 'cone'`) + `Zone` schema (shape + size + center).
- New optional `zone` field on `EffectInstance` — persists the zone on the parent concentration effect. Concentration drop deletes the EffectInstance, removing the zone naturally (no separate state field, no separate cleanup).
- New optional `zone` field on `ConcentrationStartedEvent` — carries the same metadata on the event log so transcripts trace zone creation alongside the concentration start.
- New SpellMechanic kind `zone` (16th in the discriminated union). Pure marker — the cast-spell planner reads the spell's existing `targeting` (shape + size) and the intent's `targetPosition` and stamps the zone on ConcentrationStarted. The dispatch case is a no-op since the zone is constructed inline at the ConcentrationStarted construction site.
- New optional `targetPosition?: { x, y }` field on `CastSpellIntent`. Required by zone-mechanic spells; throws if absent.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- Fog Cloud (L1, sphere 20), Silent Image (L1, cube 15), Darkness (L2, sphere 15): `mechanicalEffects: []` -> `[{ kind: 'zone' }]`. Each spell's existing `targeting` metadata supplies the shape + size.

**Tests** at [tests/unit/engine/slice-495-zone-spells.test.ts](tests/unit/engine/slice-495-zone-spells.test.ts) - 8 cases:
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

**Engine** ([src/derive/attack.ts](src/derive/attack.ts), [src/engine/plan/attack.ts](src/engine/plan/attack.ts), [src/schemas/content/spell.ts](src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- New optional `abilityOverride?: 'STR'|'DEX'|'CON'|'INT'|'WIS'|'CHA'` on `ComputeAttackInput`, `AttackIntent`, and `ResolveAttackInput`. When set, `attackAbility` returns the override instead of `chooseAttackAbility`'s weapon-property-driven default; `chooseDamageAbility` in the resolver mirrors it for damage rolls. Threaded through the three plumbing sites (computeAttackBonus / attack-bonus call site / damage-mod call site). Existing callers without an override behave unchanged.
- New SpellMechanic kind `weaponAttack` (15th in the discriminated union). Pure marker (no inner fields) in this first ship; the mechanic dispatches to a new `planWeaponAttackMechanic` that:
  - Requires `intent.weaponInstanceId` (throws otherwise).
  - Reads the caster's spellcasting ability from the slice-487 `resolveCastingAbility`.
  - Calls `resolveAttack` with the weapon + abilityOverride set + the first targetId.
  - Stamps `causedByEventId: declaredEventId` on the first emitted event (the `AttackRolled`) so transcripts trace the chain.
- New `weaponInstanceId?: string` field on `CastSpellIntent`. Required when the spell's mechanicalEffects include a `weaponAttack` mechanic.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- `true-strike` spell: `mechanicalEffects: []` -> `mechanicalEffects: [{ kind: 'weaponAttack' }]`.

**Deferred RAW arms (documented in the mechanic + cast-spell.ts comments)**:
- Damage-type choice (Radiant or weapon-normal). The attack deals the weapon's printed type for now; the caster can't opt into Radiant via the engine yet.
- Cantrip Upgrade — extra Radiant damage at character L5 (+1d6), L11 (+2d6), L17 (+3d6). Needs a follow-up that runs cantrip scaling against a flat radiant rider; documented as deferred.

**Tests** at [tests/unit/engine/slice-494-true-strike.test.ts](tests/unit/engine/slice-494-true-strike.test.ts) - 4 cases:
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

**Engine** ([src/schemas/content/condition.ts](src/schemas/content/condition.ts)):
- `RecurringSave.trigger` enum gains `'longRest'`. Purely declarative metadata — the consumer drives ticks at their chosen cadence; the engine doesn't track hours. Existing `'turnStart'` / `'turnEnd'` semantics unchanged.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `death-dog-disease-active` condition: carries Poisoned's effects directly (Disadvantage on attacks + ability checks) + `recurringSave: { ability: 'CON', fixedDC: 12, trigger: 'longRest', onSuccess: 'removeCondition' }` + `category: 'disease'` (slice-134 removal-taxonomy tag so Lesser Restoration / Greater Restoration can strip it).
- `death-dog-bite` weapon gains the slice-319 onHit save rider: `{ save: { ability: 'CON', dc: 12, conditionOnFail: 'death-dog-disease-active' } }`. Same shape as Ghoul's Claw and Cockatrice's Petrifying Bite.

**Deferred RAW arms (still consumer-managed, documented in the condition's description)**:
- "HP max doesn't return on long rest" — engine doesn't model HP-max-restore semantics; the long-rest reducer leaves max untouched anyway (no HP-max-decay mechanism shipping yet).
- "Subsequent Failures: HP max decreases by 1d10" — needs an HP-max-decay accumulator + a new onFail variant (similar shape to slice 488's `escalateToCondition`). Tracked for a future slice.

**Doc-count update**: conditions 129 -> 130 (15 RAW + 114 -> 115 rider; effect-bearing 112 -> 113).

**Tests** at [tests/unit/engine/slice-493-death-dog-disease.test.ts](tests/unit/engine/slice-493-death-dog-disease.test.ts) - 5 cases: bite weapon shape with the save rider; condition shape (Poisoned effects + recurringSave fields + category); end-to-end bite path (hit + failed save -> condition applied); cure-save tick (passed save -> ConditionRemoved); category tag for removal-spell coverage.

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

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `restrained-by-web` condition: a direct copy of `restrained`'s effects (ModifySpeed walk 0, Disadvantage on attacks, Disadvantage on DEX saves, GrantAdvantageToAttackers). The distinct id lets Web Walker creatures carry an immunity to it without being immune to Restrained from other sources (Entangle, grapple, Ensnaring Strike). A web-source application uses this id; a plant- / grapple- / spell-source application keeps the generic `restrained` id and bypasses the immunity.
- Web spell ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)): `conditionOnFail` changed from `restrained` to `restrained-by-web`. Future web-source applications (Giant Spider's Web action, Ettercap's Web action when authored) will use the same id.
- Giant Spider / Drider / Ettercap statblocks: gain `traits: [{ kind: 'GrantConditionImmunity', conditionId: 'restrained-by-web' }]`. The trait array (not the `conditionImmunities` literal) is the right place because Web Walker is a body-text trait in the SRD, not an entry on the `**Immunities**` line that srd-drift mirrors literally.

**Deferred (RAW arm not wired)**: the "knows the location of any other creature in contact with the same web" arm. The engine has no web-occupancy tracker and no per-creature web-membership graph. Documented as consumer-managed (the consumer's scene model is the source of truth for web positions).

**Doc-count update**: conditions 128 -> 129 (15 RAW + 113 -> 114 rider; effect-bearing 111 -> 112).

**Tests** at [tests/unit/engine/slice-492-web-walker.test.ts](tests/unit/engine/slice-492-web-walker.test.ts) - 9 cases (3 monsters x 2 it.each tables + 3 standalone):
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

**Engine** ([src/engine/plan/attack.ts](src/engine/plan/attack.ts)):
- New optional `chargedAtTarget?: boolean` field on AttackIntent + ResolveAttackInput. Same opt-in shape as `bearer.lightLevel` (slice 451) / `attackerHasAllyAdjacentToTarget` (slice 445): the engine doesn't track movement direction or "movement immediately before the hit," so the consumer signals the combined predicate (≥20 ft + straight + toward this target + immediately-prior) as one boolean. Undefined evaluates to false, preserving pre-491 onHit-rider behavior.
- The fact surfaces as `event.attackerChargedThisTarget` in the riderFacts map at the onHit-rider predicate site, alongside the existing slice-446 `target.creatureSize` and slice-318/319 type facts.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `boar-gore` natural weapon (1d6 piercing) with a single onHit rider carrying BOTH extra 1d6 piercing AND `applyConditionId: 'prone'`, gated on a compound `all` predicate: (a) `target.creatureSize ∈ {Tiny, Small, Medium}` AND (b) `event.attackerChargedThisTarget === true`. The +1 damage / +3 attack come from the wielder's STR + PB.
- Boar statblock unchanged (the slice-483 Bloodied Fury trait stays; Gore is a natural weapon consumers instantiate).

**Doc-count update**: weapons 74 -> 75, items 537 -> 538.

**Tests** at [tests/unit/engine/slice-491-boar-gore.test.ts](tests/unit/engine/slice-491-boar-gore.test.ts) - 4 cases:
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
