# Archive: slices 496-500

This file holds the per-slice changelog detail for slices 496-500, archived from the live CHANGELOG.md in slice 503 to keep that file under the 60 KB single-Read ceiling.

Slices covered: 496 (zone-cohort sweep: Silence / Move Earth / Reverse Gravity / Earthquake + the slice-495 silent-image revert + spell-catalog reconcile), 497 (Ice Knife + `targetScope` on the attack mechanic), 498 (Sorcerous Burst + `explodeOnMaxDie`), 499 (Goodberry + `create-item` mechanic + `ItemAcquired` inventory grant), 500 (Animal Friendship + save-mechanic `targetCreatureType` + `conditionEndsOnDamage`).

The global per-cohort archive index lives at [README.md](README.md).

---

**Engine + content (slice 500): Animal Friendship + save-mechanic `targetCreatureType` + `conditionEndsOnDamage`**

Wires Animal Friendship, the L1 Beast-charming enchantment. Two small additive fields on the existing `save` mechanic: a target-creature-type filter + a condition-ends-on-damage stamp.

RAW (SRD 5.2.1 Animal Friendship, Bard/Druid/Ranger): "Target a Beast that you can see within range. The target must succeed on a Wisdom saving throw or have the Charmed condition for the duration. If you or one of your allies deals damage to the target, the spell ends."

**Engine** ([src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- New optional `targetCreatureType?: CreatureType` on the `save` mechanic. Targets whose `getCreatureType` doesn't match are skipped — no save rolled, no condition. Reusable for any type-gated save (beast / fiend / undead-only enchantments).
- New optional `conditionEndsOnDamage?: boolean` on the `save` mechanic. Stamps the slice-391 per-instance `endsOnDamage` flag on the `conditionOnFail` condition so the damage chokepoint lifts it on the next positive damage.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- animal-friendship: `mechanicalEffects: [{ save, ability: 'WIS', conditionOnFail: 'charmed', targetCreatureType: 'Beast', conditionEndsOnDamage: true }]`. Uses the base `charmed` condition (no new condition).

**Deferred / RAW deviations (documented)**: the slice-391 `endsOnDamage` fires on ANY positive damage, not just caster-side ("you or one of your allies") damage; the 24-hour duration is consumer-managed (engine doesn't track hours). The higher-level "one additional Beast per slot above 1" rides the consumer passing more targetIds (the filter handles each).

**Doc-count update**: spell totals 193 -> 194 wired (151 -> 152 cast-time), 77 -> 76 deferred (L1 43 wired / 2 deferred — only ensnaring-strike + floating-disk remain). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-500-animal-friendship.test.ts](../../tests/unit/engine/slice-500-animal-friendship.test.ts) - 4 cases: the mechanic shape; a Beast (wolf statblock) that fails the WIS save gets Charmed with `endsOnDamage` stamped; a Humanoid target is skipped entirely (no save, no charm); mixed [wolf, bandit] targets -> exactly ONE save (the wolf). spell-coverage keeps animal-friendship `skip` with an updated reason (the generic harness targets are Humanoids, filtered out; the dedicated test uses a real Beast).

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

**Engine** ([src/schemas/events/inventory.ts](../../src/schemas/events/inventory.ts), [src/engine/reducers/inventory.ts](../../src/engine/reducers/inventory.ts), [src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- New optional `characterId` on the `ItemAcquired` event. When set, `applyItemAcquired` also pushes the new instance id onto that character's `inventory` (so it's reachable by `engine.plan.consumeItem` / `useItem`). Omitted = the historical "register the instance in the world, ownership tracked elsewhere" flow (weapons referenced by id, loot pools) — byte-identical to before.
- New SpellMechanic kind `create-item` (`itemDefinitionId` + `quantity`). The cast-spell planner emits one `ItemAcquired`-with-`characterId` event per instance, minting fresh instances into the caster's inventory. Validates the item definition exists (typo fails at plan time).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- New `goodberry` consumable (`onConsume: [{ kind: 'Heal', flatAmount: 1 }]`). Modeled as a single-use consumable — 10 separate instances rather than one qty-10 stack, because the engine's consume path removes a whole instance (no per-unit decrement), matching RAW "eat ONE berry."
- goodberry spell: `mechanicalEffects: [{ kind: 'create-item', itemDefinitionId: 'goodberry', quantity: 10 }]`. Eating a berry is the existing `consumeItem` path (Heal 1).

**Deferred (consumer-managed)**: the 24-hour expiry of uneaten berries. The engine doesn't time-expire created items; the consumer removes them when the in-fiction timer runs out.

**Doc-count update**: spell totals 192 -> 193 wired (150 -> 151 cast-time), 78 -> 77 deferred (L1 42 wired / 3 deferred); consumables 69 -> 70, items 538 -> 539. Aligned across gaps-spells / getting-started / starter-pack-gaps / status (the latter's two stale spell-split citations + three consumable counts brought current).

**Tests** at [tests/unit/engine/slice-499-goodberry.test.ts](../../tests/unit/engine/slice-499-goodberry.test.ts) - 4 cases: the goodberry consumable heals 1; the spell's create-item shape; casting mints 10 instances into the caster's inventory (event + state); eating one berry heals 1 HP and leaves 9. spell-coverage gains a `create-item` expectation kind (asserts >= N ItemAcquired) and flips goodberry skip -> create-item.

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

**Engine** ([src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- New optional `explodeOnMaxDie?: boolean` on the `attack` spell mechanic. When true, each base + cantrip-scaling die that rolls its maximum face spawns one extra die of the same size (read from `damageDice`), chained (an extra die that also maxes spawns another), capped at a total number of extra dice equal to the caster's spellcasting ability modifier.
- New `rollExplodingExtras(initialRolls, dieSize, extraCap, rng)` helper: counts max-rolls as pending explosions, rolls extras while budget + pending remain, re-arms on each extra that maxes. `extraCap <= 0` produces no extras. Folded into `planAttackMechanic`'s damage-roll site after the base + scaling rolls; `extraCap = max(0, abilityModifier(caster's spellcasting ability score))`.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- sorcerous-burst: `mechanicalEffects: []` -> `[{ attack, damageDice: '1d8', attackKind: 'ranged', cantripScalingDice: '1d8', explodeOnMaxDie: true, casterChoosesDamageType: { allowed: [acid, cold, fire, lightning, poison, psychic, thunder] } }]`. The cantrip base-die scaling (1d8 -> 2d8/3d8/4d8) rides the existing `cantripScalingDice`; the caster-chosen type rides the existing `casterChoosesDamageType`; only the explosion is new.

**Doc-count update**: spell totals 191 -> 192 wired (149 -> 150 cast-time), 79 -> 78 deferred; L0 15 wired / 1 deferred (shillelagh the lone L0 holdout). Aligned across gaps-spells / getting-started / starter-pack-gaps / status.

**Tests** at [tests/unit/engine/slice-498-sorcerous-burst.test.ts](../../tests/unit/engine/slice-498-sorcerous-burst.test.ts) - 5 cases: the mechanic shape; caster-chosen fire damage on a hit; L1 (1 base die + <=4 CHA-mod extras, all d8 faces, explosion implies a rolled 8); L5 cantrip upgrade (2 base dice + <=4 extras); the CHA-mod cap (a CHA +0 sorcerer adds zero extras even when it rolls 8s). spell-coverage flips sorcerous-burst skip -> attack with a damageType casterChoice.

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

**Engine** ([src/schemas/content/spell.ts](../../src/schemas/content/spell.ts), [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)):
- New optional `targetScope?: 'first' | 'all'` on the `attack` spell mechanic. `'first'` makes the attack resolve against only `targetIds[0]`; `'all'` (default / unset) attacks every target (the historical behavior, unchanged). This lets a spell make ONE attack against the primary target while a sibling `save` mechanic resolves an AOE against the primary + splash creatures, all from one `intent.targetIds` list (the consumer passes `[primary, ...within5ft]`).
- `planAttackMechanic` slices `intent.targetIds` to the first entry when `targetScope === 'first'`.

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- ice-knife: `mechanicalEffects: []` -> `[{ attack 1d10 piercing, targetScope: 'first' }, { save DEX 2d6 cold, halfOnSuccess: false, extraDicePerSlotLevel: 1 }]`. The two existing mechanic kinds compose: the attack hits the primary, the save (hit or miss, since the planner dispatches each mechanic independently) covers the burst, and the upcast +1d6/slot rides the save's `extraDicePerSlotLevel`.

**Tests** at [tests/unit/engine/slice-497-ice-knife.test.ts](../../tests/unit/engine/slice-497-ice-knife.test.ts) - 4 cases: the two-mechanic shape; exactly ONE AttackRolled (the primary) + a SaveRolled per target when cast at `[primary, splash]`; the AOE save fires hit-or-miss (swept across hit + miss seeds); upcast at slot 2 still emits the DEX save chain. Plus spell-coverage flips ice-knife from `skip` to `{ kind: 'attack' }`.

**Doc-count update**: spell totals 190 -> 191 wired (148 -> 149 cast-time), 80 -> 79 deferred; L1 41 wired / 4 deferred. Aligned across gaps-spells.md + getting-started + starter-pack-gaps + status.

**Audit:**
- *RAW match*: 1d10 piercing on a hit vs the primary; 2d6 cold DEX save (no half) vs the primary + 5-ft splash, hit or miss; +1d6 per slot above L1. All four arms present.
- *Names*: `targetScope` mirrors the existing per-mechanic field naming (`damageType`, `attackKind`, `extraDicePerSlotLevel`).
- *DRY*: no new mechanic kind — composes the existing `attack` + `save` mechanics, adding only the scope discriminator. The planner change is a one-line slice of targetIds.
- *SRP*: the attack mechanic gains one optional behavior; the save mechanic is untouched.
- *Magic numbers*: none added.
- *Mechanical outcomes asserted*: single-attack scope, per-target save, hit-or-miss invariant, upcast scaling.

**Pattern-check**: `targetScope: 'first'` is reusable for any "one attack + splash save" spell. None other in the current pack (Ice Knife is the only SRD spell with this exact shape at any level), but the field generalizes cleanly. Verified no existing attack-mechanic spell relies on multi-target attack behavior that `'all'` (the default) would change: the default path is byte-identical to pre-497, so the 30+ existing attack-mechanic spells are unaffected.

**Audit hardening**: Ice Knife is the first pack spell with TWO damage mechanics (1d10 piercing attack + 2d6 cold save), which surfaced a too-narrow assertion in [tests/audit/srd-drift.test.ts](../../tests/audit/srd-drift.test.ts): the damage-dice check compared every pack damage mechanic to only the FIRST "Nd M <type> damage" die in the SRD body, so the cold component (2d6) was wrongly flagged against the piercing die (1d10). Fixed the audit to collect EVERY damage die in the SRD body (global regex -> set) and assert each pack die is a member — the correct invariant for multi-damage spells. Also added the explicit `attackKind: 'ranged'` to Ice Knife's attack mechanic to match the convention every other ranged-attack spell follows (16/17 wrote it explicitly; the drift audit's attackKind-presence check expects it).

**Content + fix (slice 496): zone-cohort sweep (Silence / Move Earth / Reverse Gravity / Earthquake) + slice-495 silent-image fix + spell-catalog reconcile**

Continues the slice-495 zone primitive across the rest of the genuine positioned-AOE concentration spells, fixes a slice-495 mis-wire, and reconciles the spell-coverage classification + gaps catalog for the whole zone + True-Strike cohort.

**RAW classification (the careful part).** The slice-495 pattern-check listed "~10 remaining zone spells," but that filter (`targeting + concentration + empty mechanicalEffects`) was too broad. Checked each against the SRD and wired only the 4 that are genuine caster-chosen-point persistent zones (the Fog Cloud shape):
- **Silence** (L2 sphere 20) — "centered on a point you choose within range."
- **Move Earth** (L6 cube 40) — "Choose an area of terrain... within range."
- **Reverse Gravity** (L7 cylinder 100) — "centered on a point within range."
- **Earthquake** (L8 cylinder 100) — "centered on that point."

Excluded 6 with documented reasons: **Aura of Life / Globe of Invulnerability / Antimagic Field** are caster-relative Emanations ("radiates from you" / "around you" / "surrounds you"), not point-zones — they'd need the aura system or a caster-anchor convention, not the fixed-`center` zone primitive; **Slow** is a save-on-cast applied to creatures in the cube at cast (a `save` mechanic, not a persistent zone); **Phantasmal Force** is a single-target mind illusion; **Dragon's Breath** is a buff on a willing creature. This is the "filter shape determines what a sweep can find" discipline (CLAUDE.md) — the starting filter's shape was a clue, not the boundary.

**Slice-495 bug fix.** Slice 495 added a `zone` mechanic to **silent-image**, but silent-image routes through the dedicated `planSilentImage` planner (which already tracks the illusion's position + concentration + the Investigation-to-disbelieve arm). The zone mechanic created a conflicting second cast path (`planCastSpell` vs `planSilentImage`). Reverted silent-image's `mechanicalEffects` to `[]`; it stays "wired, planner." The slice-495 test's silent-image cases were corrected (one dropped, one flipped to assert silent-image carries NO zone mechanic).

**Content** ([src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)):
- Silence / Move Earth / Reverse Gravity / Earthquake: `mechanicalEffects: []` -> `[{ kind: 'zone' }]`. Each spell's existing `targeting` block supplies shape + size.
- silent-image: `[{ kind: 'zone' }]` -> `[]` (slice-495 revert).

**Test reconcile** ([tests/unit/engine/spell-coverage.test.ts](../../tests/unit/engine/spell-coverage.test.ts)):
- New `{ kind: 'zone' }` expectation kind: casts with a `targetPosition` and asserts ConcentrationStarted carries a `zone` with the right center.
- fog-cloud + darkness flipped from `skip` to `zone` (slice 495 wired them in the pack but left them `skip` in coverage — they were never actually exercised). silence / move-earth / reverse-gravity / earthquake flipped from `skip` to `zone`.
- silent-image stays `skip` (planner-routed); true-strike's `skip` reason updated to reflect it's now wired via the slice-494 `weaponAttack` mechanic (the generic harness can't supply the required weaponInstanceId).

**Doc reconcile** ([docs/gaps-spells.md](../../docs/gaps-spells.md), [docs/getting-started.md](../../docs/getting-started.md), [docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md), [docs/status.md](../../docs/status.md)):
- New `zone-area` + `weapon-attack` status-legend entries.
- Moved 7 spells deferred/narrative -> wired across L0 (true-strike, slice 494), L1 (fog-cloud, slice 495), L2 (darkness slice 495 + silence), L6 (move-earth), L7 (reverse-gravity), L8 (earthquake). Each level's `wired + narrative + deferred === inPack` invariant preserved (verified by [tests/audit/gaps-spells-counts.test.ts](../../tests/audit/gaps-spells-counts.test.ts)).
- Spell totals: **183 -> 190 wired** (148 cast-time, 11 zone-tick, 24 planner, 6 zone-area, 1 weapon-attack), **70 -> 69 narrative**, **86 -> 80 deferred**. Aligned the three prose citations (getting-started / starter-pack-gaps / status), which had pre-existing drift (status.md said 182/87 vs the others' 183/86).
- Flagged in the gaps-spells.md totals that the wired/narrative/deferred split has accumulated additional drift since the slice-337 full reconcile (spells wired in slices 338-444 whose catalog rows may not have moved); a future slice-337-style full reconcile would close it. This slice fixed the cohort it touched, not the whole backlog.

**Audit:**
- *RAW match*: each wired spell is a genuine caster-chosen-point zone; the 6 exclusions are documented with their RAW reason. The in-zone effects (silence/obscurement/gravity/terrain) stay consumer-managed against the positioned record, consistent with slice 495.
- *DRY*: no new engine code — pure content + classification, reusing slice 495's `zone` mechanic + the existing ConcentrationStarted/EffectInstance plumbing.
- *Pattern-check*: surfaced + fixed the slice-495 silent-image mis-wire AND the slice-495 fog-cloud/darkness coverage-staleness AND the slice-494 true-strike coverage-staleness — all the same "wired-in-pack-but-classified-skip / mis-routed" shape. Fixed every instance in the cohort; flagged the broader pre-337 split-drift as a tracked follow-up rather than leaving it silent.
- *Mechanical outcomes asserted*: spell-coverage's new `zone` case verifies each wired zone spell emits ConcentrationStarted with the positioned zone; the slice-495 test pins the silent-image revert.

