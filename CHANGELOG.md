# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The bump policy and pre-release roadmap are documented in [VERSIONING.md](VERSIONING.md).

## Unreleased

**Engine + content (slice 501): Shillelagh + `weapon-buff` spell mechanic + item-buff weapon-transformation overrides**

Wires Shillelagh, the L0 Druid weapon-imbue cantrip, closing the last deferred Level 0 spell (L0 is now 16 wired / 0 deferred). Generalizes the existing `temporaryBuff` (Magic Weapon / Elemental Weapon) with three transformation overrides the attack path reads back.

RAW (SRD 5.2.1 Shillelagh, Transmutation cantrip, Druid): "A Club or Quarterstaff you are holding is imbued with nature's power. For the duration, you can use your spellcasting ability instead of Strength for the attack and damage rolls of melee attacks using that weapon, and the weapon's damage die becomes a d8. If the attack deals damage, it can be Force damage or the weapon's normal damage type (your choice)." 1 minute, NOT concentration.

**Engine**:
- [src/schemas/runtime/item-instance.ts](src/schemas/runtime/item-instance.ts): `ItemTemporaryBuff` gains `abilityOverride` / `damageDieOverride` / `damageTypeOverride`; `sourceEffectInstanceId` made optional (non-concentration buffs omit it).
- [src/schemas/events/inventory.ts](src/schemas/events/inventory.ts) + [src/engine/reducers/inventory.ts](src/engine/reducers/inventory.ts): `ItemBuffApplied` carries the three overrides; the reducer conditionally spreads them.
- [src/derive/attack.ts](src/derive/attack.ts): `computeAttackBonus` reads `temporaryBuff.abilityOverride` (precedence: per-attack input override > buff override > weapon default).
- [src/engine/plan/attack.ts](src/engine/plan/attack.ts) `resolveAttack`: the damage path folds `temporaryBuff.abilityOverride` into the damage ability, `damageDieOverride` into the base damage expression (over the versatile/printed die), and `damageTypeOverride` into the effective damage type (over an enchantment's / weapon's type).
- [src/schemas/content/spell.ts](src/schemas/content/spell.ts) + [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts): new `weapon-buff` SpellMechanic (`useSpellcastingAbility` / `damageDieOverride` / `damageTypeChoice`) + `planWeaponBuffMechanic`, which resolves the caster's spellcasting ability and stamps one `ItemBuffApplied` (no concentration link) onto `intent.weaponInstanceId`.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- shillelagh: `mechanicalEffects: [{ weapon-buff, useSpellcastingAbility: true, damageDieOverride: '1d8', damageTypeChoice: { allowed: ['force'] } }]`.

**Deferred / RAW deviations (documented)**: Shillelagh's damage-type choice is per-hit ("can be Force or the weapon's normal type"); the engine collapses it to a single cast-time choice via `intent.casterChoice`. Force is universally at-least-as-good as bludgeoning, so the collapse rarely changes outcomes. The 1-minute duration and the "ends if you let go of the weapon" / "ends if recast" clauses are consumer-managed (the buff is non-concentration; the consumer removes it via `ItemBuffRemoved`). The Club / Quarterstaff weapon restriction is a targeting constraint left to the consumer (the mechanic is weapon-agnostic; it validates only that the target is a weapon).

**Doc-count update**: spell totals 194 -> 195 wired (new `weapon-buff` row, 1), 76 -> 75 deferred (L0 16 wired / 0 deferred). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-501-shillelagh.test.ts](tests/unit/engine/slice-501-shillelagh.test.ts) - 7 cases: the mechanic shape; the cast stamps an `ItemBuffApplied` with WIS override + d8 die + chosen Force type and no concentration link; an imbued club attacks with the WIS mod (+6 vs the +1 a STR club would roll); damage on hit rolls a d8 with the WIS mod and Force type; without a damage-type choice the type stays bludgeoning (die still d8); a cast without `weaponInstanceId` throws; a cast targeting a non-weapon throws. spell-coverage keeps shillelagh `skip` with an updated reason (the generic harness sets up no held weapon; the dedicated test does).

**Audit:**
- *RAW match*: spellcasting-ability attack+damage, d8 die, optional Force type. The per-hit -> cast-time type choice, duration, let-go/recast end, and weapon restriction are documented deviations / consumer-side.
- *Names*: `abilityOverride` / `damageDieOverride` / `damageTypeOverride` mirror the slice-494 `abilityOverride` and the existing buff-field naming; `weapon-buff` parallels the slice-494 `weaponAttack` mechanic.
- *DRY*: reuses `temporaryBuff` + the attack resolver's existing override-precedence chains rather than a parallel buff path; `planWeaponBuffMechanic` mirrors `planWeaponAttackMechanic`'s weapon-instance validation.
- *SRP*: each override field threads one value through one resolution point; the planner does one thing (stamp the buff).
- *Magic numbers*: none (the `1d8` die is content, not code).
- *at-threading*: the planner takes `at` from the cast and passes it to the single emitted event.
- *Mechanical outcomes asserted*: buff-stamp shape, attack-bonus delta (override landed), damage die + mod + type, no-choice type fallback, two throw paths.

**Pattern-check**: the override-precedence chains (`input ?? buff ?? default`) were added at all three attack read points (attack-bonus derive, damage ability, damage die, damage type) so no read point silently ignores a buff override. The three new buff fields are opt-in; the existing `temporaryBuff` users (Magic Weapon, Elemental Weapon) set none of them and resolve exactly as before. `sourceEffectInstanceId` going optional is backward-compatible: the concentration-cleanup walk skips buffs without it, which is correct for the non-concentration Shillelagh.

**Engine + content (slice 500): Animal Friendship + save-mechanic `targetCreatureType` + `conditionEndsOnDamage`**

Wires Animal Friendship, the L1 Beast-charming enchantment. Two small additive fields on the existing `save` mechanic: a target-creature-type filter + a condition-ends-on-damage stamp.

RAW (SRD 5.2.1 Animal Friendship, Bard/Druid/Ranger): "Target a Beast that you can see within range. The target must succeed on a Wisdom saving throw or have the Charmed condition for the duration. If you or one of your allies deals damage to the target, the spell ends."

**Engine** ([src/schemas/content/spell.ts](src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- New optional `targetCreatureType?: CreatureType` on the `save` mechanic. Targets whose `getCreatureType` doesn't match are skipped — no save rolled, no condition. Reusable for any type-gated save (beast / fiend / undead-only enchantments).
- New optional `conditionEndsOnDamage?: boolean` on the `save` mechanic. Stamps the slice-391 per-instance `endsOnDamage` flag on the `conditionOnFail` condition so the damage chokepoint lifts it on the next positive damage.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- animal-friendship: `mechanicalEffects: [{ save, ability: 'WIS', conditionOnFail: 'charmed', targetCreatureType: 'Beast', conditionEndsOnDamage: true }]`. Uses the base `charmed` condition (no new condition).

**Deferred / RAW deviations (documented)**: the slice-391 `endsOnDamage` fires on ANY positive damage, not just caster-side ("you or one of your allies") damage; the 24-hour duration is consumer-managed (engine doesn't track hours). The higher-level "one additional Beast per slot above 1" rides the consumer passing more targetIds (the filter handles each).

**Doc-count update**: spell totals 193 -> 194 wired (151 -> 152 cast-time), 77 -> 76 deferred (L1 43 wired / 2 deferred — only ensnaring-strike + floating-disk remain). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-500-animal-friendship.test.ts](tests/unit/engine/slice-500-animal-friendship.test.ts) - 4 cases: the mechanic shape; a Beast (wolf statblock) that fails the WIS save gets Charmed with `endsOnDamage` stamped; a Humanoid target is skipped entirely (no save, no charm); mixed [wolf, bandit] targets -> exactly ONE save (the wolf). spell-coverage keeps animal-friendship `skip` with an updated reason (the generic harness targets are Humanoids, filtered out; the dedicated test uses a real Beast).

**Audit:**
- *RAW match*: Beast-only WIS save -> Charmed, ends on damage. The "you/ally" damage narrowing + 24h duration are documented deviations.
- *Names*: `targetCreatureType` mirrors the attack mechanic's target-fact naming; `conditionEndsOnDamage` mirrors the slice-391 `endsOnDamage` field it sets.
- *DRY*: reuses the base `charmed` condition + the existing save-resolution loop + the slice-391 endsOnDamage chokepoint. The two new fields are a skip-guard + a stamp.
- *SRP*: each field does one thing (filter / stamp); the save loop is otherwise unchanged.
- *Magic numbers*: none.
- *Mechanical outcomes asserted*: type-filter (beast affected, humanoid skipped, mixed = 1 save), charm-on-fail, endsOnDamage stamp.

**Pattern-check**: `targetCreatureType` generalizes to any creature-type-gated save (Charm Monster's type variants, beast/fey/fiend-only enchantments, Protection-style type gates). No regression: both fields are opt-in; the 30+ existing save-mechanic spells set neither and resolve against all targets exactly as before.

**Engine + content (slice 499): Goodberry + `create-item` spell mechanic + `ItemAcquired` inventory grant**

Wires Goodberry, the L1 item-creation spell — a clericless L1 party's main out-of-combat healing. New primitives: a `create-item` spell mechanic + an optional inventory-grant on the `ItemAcquired` event.

RAW (SRD 5.2.1 Goodberry, Druid/Ranger): "Ten berries appear in your hand... A creature can take a Bonus Action to eat one berry. Eating a berry restores 1 Hit Point... Uneaten berries disappear when the spell ends."

**Engine** ([src/schemas/events/inventory.ts](src/schemas/events/inventory.ts), [src/engine/reducers/inventory.ts](src/engine/reducers/inventory.ts), [src/schemas/content/spell.ts](src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- New optional `characterId` on the `ItemAcquired` event. When set, `applyItemAcquired` also pushes the new instance id onto that character's `inventory` (so it's reachable by `engine.plan.consumeItem` / `useItem`). Omitted = the historical "register the instance in the world, ownership tracked elsewhere" flow (weapons referenced by id, loot pools) — byte-identical to before.
- New SpellMechanic kind `create-item` (`itemDefinitionId` + `quantity`). The cast-spell planner emits one `ItemAcquired`-with-`characterId` event per instance, minting fresh instances into the caster's inventory. Validates the item definition exists (typo fails at plan time).

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- New `goodberry` consumable (`onConsume: [{ kind: 'Heal', flatAmount: 1 }]`). Modeled as a single-use consumable — 10 separate instances rather than one qty-10 stack, because the engine's consume path removes a whole instance (no per-unit decrement), matching RAW "eat ONE berry."
- goodberry spell: `mechanicalEffects: [{ kind: 'create-item', itemDefinitionId: 'goodberry', quantity: 10 }]`. Eating a berry is the existing `consumeItem` path (Heal 1).

**Deferred (consumer-managed)**: the 24-hour expiry of uneaten berries. The engine doesn't time-expire created items; the consumer removes them when the in-fiction timer runs out.

**Doc-count update**: spell totals 192 -> 193 wired (150 -> 151 cast-time), 78 -> 77 deferred (L1 42 wired / 3 deferred); consumables 69 -> 70, items 538 -> 539. Aligned across gaps-spells / getting-started / starter-pack-gaps / status (the latter's two stale spell-split citations + three consumable counts brought current).

**Tests** at [tests/unit/engine/slice-499-goodberry.test.ts](tests/unit/engine/slice-499-goodberry.test.ts) - 4 cases: the goodberry consumable heals 1; the spell's create-item shape; casting mints 10 instances into the caster's inventory (event + state); eating one berry heals 1 HP and leaves 9. spell-coverage gains a `create-item` expectation kind (asserts >= N ItemAcquired) and flips goodberry skip -> create-item.

**Audit:**
- *RAW match*: 10 berries, each a 1-HP single-use consumable in inventory, eaten one at a time. The 24h expiry is documented as consumer-managed.
- *Names*: `create-item` follows the lowercase-mechanic-kind convention; the `characterId` field mirrors `ItemEquipped` / `ItemConsumed`'s `characterId`.
- *DRY*: eating a berry reuses the existing consumeItem + `Heal` onConsume path; the create-item planner is a thin emit-loop. The inventory grant folds into the existing `applyItemAcquired` reducer.
- *SRP*: one new optional event field, one new mechanic kind, one emit-loop planner.
- *Magic numbers*: quantity (10) + heal (1) come from the spell + item definitions, not engine code.
- *Mechanical outcomes asserted*: item heal value, mint count + ownership, per-berry consumption.

**Pattern-check**: the `ItemAcquired`-with-`characterId` grant + `create-item` mechanic generalize to any "create item(s) into a creature's inventory" effect (Create Food and Water's rations, Heward's Handy Haversack contents, treasure grants, Continual Flame's torch). No regression: `characterId` is opt-in; every existing ItemAcquired call omits it and registers the instance exactly as before. Verified no other pack spell currently uses item-creation (Goodberry is the lone SRD item-creation spell at L1; Create Food and Water is narrative-utility today).

**Engine + content (slice 498): Sorcerous Burst + exploding-dice (`explodeOnMaxDie`) attack field**

Wires Sorcerous Burst, the sorcerer's L0 exploding-damage cantrip — the canonical "open-die" spell the gaps catalog tracked as deferred. New primitive is a one-field addition (`explodeOnMaxDie`) on the existing attack mechanic + a small chained-roll helper.

RAW (SRD 5.2.1 Sorcerous Burst, Sorcerer cantrip): "Make a ranged spell attack. On a hit, the target takes 1d8 damage of a type you choose: Acid, Cold, Fire, Lightning, Poison, Psychic, or Thunder. If you roll an 8 on a d8 for this spell, you can roll another d8, and add it to the damage... the maximum number of these d8s you can add to the spell's damage equals your spellcasting ability modifier. Cantrip Upgrade: The damage increases by 1d8 at levels 5 (2d8), 11 (3d8), 17 (4d8)."

**Engine** ([src/schemas/content/spell.ts](src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- New optional `explodeOnMaxDie?: boolean` on the `attack` spell mechanic. When true, each base + cantrip-scaling die that rolls its maximum face spawns one extra die of the same size (read from `damageDice`), chained (an extra die that also maxes spawns another), capped at a total number of extra dice equal to the caster's spellcasting ability modifier.
- New `rollExplodingExtras(initialRolls, dieSize, extraCap, rng)` helper: counts max-rolls as pending explosions, rolls extras while budget + pending remain, re-arms on each extra that maxes. `extraCap <= 0` produces no extras. Folded into `planAttackMechanic`'s damage-roll site after the base + scaling rolls; `extraCap = max(0, abilityModifier(caster's spellcasting ability score))`.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- sorcerous-burst: `mechanicalEffects: []` -> `[{ attack, damageDice: '1d8', attackKind: 'ranged', cantripScalingDice: '1d8', explodeOnMaxDie: true, casterChoosesDamageType: { allowed: [acid, cold, fire, lightning, poison, psychic, thunder] } }]`. The cantrip base-die scaling (1d8 -> 2d8/3d8/4d8) rides the existing `cantripScalingDice`; the caster-chosen type rides the existing `casterChoosesDamageType`; only the explosion is new.

**Doc-count update**: spell totals 191 -> 192 wired (149 -> 150 cast-time), 79 -> 78 deferred; L0 15 wired / 1 deferred (shillelagh the lone L0 holdout). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-498-sorcerous-burst.test.ts](tests/unit/engine/slice-498-sorcerous-burst.test.ts) - 5 cases: the mechanic shape; caster-chosen fire damage on a hit; L1 (1 base die + <=4 CHA-mod extras, all d8 faces, explosion implies a rolled 8); L5 cantrip upgrade (2 base dice + <=4 extras); the CHA-mod cap (a CHA +0 sorcerer adds zero extras even when it rolls 8s). spell-coverage flips sorcerous-burst skip -> attack with a damageType casterChoice.

**Audit:**
- *RAW match*: 1d8 chosen-type on hit, exploding on 8, capped at spellcasting mod, cantrip-scaled base. All arms present. The minimum-die / negative-mod edge resolves to "no extras" (cap clamped to >= 0).
- *Names*: `explodeOnMaxDie` mirrors per-mechanic field naming; `rollExplodingExtras` follows the `rollDamage` / `rollCantripScaling` helper convention.
- *DRY*: no new mechanic kind; composes with the existing cantrip-scaling + caster-chosen-type fields. The helper is the only new logic.
- *SRP*: the attack mechanic gains one optional behavior, isolated to one helper call at the damage-roll site.
- *Magic numbers*: die size derived from `damageDice` (not hard-coded); cap derived from the caster's ability mod.
- *Mechanical outcomes asserted*: chosen-type, base-die count by level, extra-die cap (both generous-CHA and zero-CHA), die-face bounds.

**Pattern-check**: `explodeOnMaxDie` is reusable for any future open-die spell or feature (no other SRD spell uses it today, but the 2024 MM / DMG have exploding-damage shapes). The cap is generic (spellcasting mod); a future content item wanting a fixed cap would extend the field to accept a number. No regression: the flag is opt-in; the 17 existing attack-mechanic spells don't set it and roll exactly as before.

**Engine + content (slice 497): Ice Knife + `targetScope` on the attack mechanic**

Wires Ice Knife, the L1 "ranged spell attack + hit-or-miss AOE save" shape — the canonical multi-mechanic spell that the gaps catalog tracked as deferred. The new primitive is a one-field addition (`targetScope`) on the existing attack mechanic; no new mechanic kind.

RAW (SRD 5.2.1 Ice Knife, Druid/Sorcerer/Wizard): "Make a ranged spell attack against the target. On a hit, the target takes 1d10 Piercing damage. Hit or miss, the shard then explodes. The target and each creature within 5 feet of it must succeed on a Dexterity saving throw or take 2d6 Cold damage. Using a Higher-Level Spell Slot: The Cold damage increases by 1d6 for each spell slot level above 1."

**Engine** ([src/schemas/content/spell.ts](src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](src/engine/plan/cast-spell.ts)):
- New optional `targetScope?: 'first' | 'all'` on the `attack` spell mechanic. `'first'` makes the attack resolve against only `targetIds[0]`; `'all'` (default / unset) attacks every target (the historical behavior, unchanged). This lets a spell make ONE attack against the primary target while a sibling `save` mechanic resolves an AOE against the primary + splash creatures, all from one `intent.targetIds` list (the consumer passes `[primary, ...within5ft]`).
- `planAttackMechanic` slices `intent.targetIds` to the first entry when `targetScope === 'first'`.

**Content** ([src/content/packs/starter-pack.json](src/content/packs/starter-pack.json)):
- ice-knife: `mechanicalEffects: []` -> `[{ attack 1d10 piercing, targetScope: 'first' }, { save DEX 2d6 cold, halfOnSuccess: false, extraDicePerSlotLevel: 1 }]`. The two existing mechanic kinds compose: the attack hits the primary, the save (hit or miss, since the planner dispatches each mechanic independently) covers the burst, and the upcast +1d6/slot rides the save's `extraDicePerSlotLevel`.

**Tests** at [tests/unit/engine/slice-497-ice-knife.test.ts](tests/unit/engine/slice-497-ice-knife.test.ts) - 4 cases: the two-mechanic shape; exactly ONE AttackRolled (the primary) + a SaveRolled per target when cast at `[primary, splash]`; the AOE save fires hit-or-miss (swept across hit + miss seeds); upcast at slot 2 still emits the DEX save chain. Plus spell-coverage flips ice-knife from `skip` to `{ kind: 'attack' }`.

**Doc-count update**: spell totals 190 -> 191 wired (148 -> 149 cast-time), 80 -> 79 deferred; L1 41 wired / 4 deferred. Aligned across gaps-spells.md + getting-started + starter-pack-gaps + status.

**Audit:**
- *RAW match*: 1d10 piercing on a hit vs the primary; 2d6 cold DEX save (no half) vs the primary + 5-ft splash, hit or miss; +1d6 per slot above L1. All four arms present.
- *Names*: `targetScope` mirrors the existing per-mechanic field naming (`damageType`, `attackKind`, `extraDicePerSlotLevel`).
- *DRY*: no new mechanic kind — composes the existing `attack` + `save` mechanics, adding only the scope discriminator. The planner change is a one-line slice of targetIds.
- *SRP*: the attack mechanic gains one optional behavior; the save mechanic is untouched.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: single-attack scope, per-target save, hit-or-miss invariant, upcast scaling.

**Pattern-check**: `targetScope: 'first'` is reusable for any "one attack + splash save" spell. None other in the current pack (Ice Knife is the only SRD spell with this exact shape at any level), but the field generalizes cleanly. Verified no existing attack-mechanic spell relies on multi-target attack behavior that `'all'` (the default) would change: the default path is byte-identical to pre-497, so the 30+ existing attack-mechanic spells are unaffected.

**Audit hardening**: Ice Knife is the first pack spell with TWO damage mechanics (1d10 piercing attack + 2d6 cold save), which surfaced a too-narrow assertion in [tests/audit/srd-drift.test.ts](tests/audit/srd-drift.test.ts): the damage-dice check compared every pack damage mechanic to only the FIRST "Nd M <type> damage" die in the SRD body, so the cold component (2d6) was wrongly flagged against the piercing die (1d10). Fixed the audit to collect EVERY damage die in the SRD body (global regex -> set) and assert each pack die is a member — the correct invariant for multi-damage spells. Also added the explicit `attackKind: 'ranged'` to Ice Knife's attack mechanic to match the convention every other ranged-attack spell follows (16/17 wrote it explicitly; the drift audit's attackKind-presence check expects it).

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
