# Spell gaps catalog

Per-spell catalog of which entries in the starter pack are **wired** (the engine emits a mechanical event chain on cast, fires a zone tick, or routes through a dedicated planner) versus **deferred** (ships in the pack but emits no mechanical event yet, pending an unbuilt primitive) versus **narrative** (intentionally emits nothing: rituals, divination, utility). Extracted from [starter-pack-gaps.md](starter-pack-gaps.md) in slice 249.

## Source of truth

The canonical per-spell status is **[tests/unit/engine/spell-coverage.test.ts](../tests/unit/engine/spell-coverage.test.ts)** joined with the pack's `mechanicalEffects`. That test casts every shipped spell and asserts the event chain a D&D-knowledgeable reader expects; every `skip` carries a reason. This doc is a human-readable reconciliation of that test. **When the two disagree, the test wins.** The per-level count headers below are guarded against drift by [tests/audit/gaps-spells-counts.test.ts](../tests/audit/gaps-spells-counts.test.ts), so a stale count fails CI rather than misleading the next contributor.

A prior version of this doc tracked the **full PHB 2024 spell list** as its denominator (e.g. "L2: 63/63") and listed non-SRD PHB spells (Frostbite, Mind Sliver, Crown of Madness, Toll the Dead, etc.) as if wired. The pack ships **SRD 5.2.1 + 12 non-SRD = 351 spells**, so those PHB-only entries were phantom rows. This catalog now counts only what is actually in the pack.

## Status legend

- **cast-time**: the spell carries `mechanicalEffects` the engine consumes at cast (`save`, `attack`, `heal`, `buff`, `summon`, `temp-hp`, `trap`, etc.); `engine.plan.castSpell` emits the chain.
- **zone-tick**: the spell carries an `aura-damage` or `movement-damage` mechanic. Cast emits only `ConcentrationStarted`; damage / conditions fire later via `engine.plan.tickAura({ casterId, targetIds, trigger? })` or `engine.plan.tickMovementDamage({ casterId, targetId, feetMoved })`, per-turn or per-traversal (slices 68-72). Wired, just not on the cast event.
- **zone-area**: the spell carries a `zone` mechanic (slice 495). Cast emits `ConcentrationStarted` carrying positioned-AOE metadata (`zone: { shape, size, center }`) read from the spell's `targeting` + the intent's `targetPosition`; the EffectInstance persists the zone and concentration drop removes it. The spell's RAW area effect (heavy obscurement, magical darkness, silence, gravity inversion, terrain shaking / reshaping) is consumer-managed against the zone — the engine tracks where the area is, not who's inside it.
- **weapon-attack**: the spell carries a `weaponAttack` mechanic (slice 494). `engine.plan.castSpell` makes a weapon attack with the named `weaponInstanceId` using the caster's spellcasting ability (canonical user: True Strike). Not exercised by the generic spell-coverage harness (it needs a weapon instance + target), so it's marked `skip` there with that reason.
- **planner**: handled by a dedicated planner (`planShield`, `planCounterspell`, `planPolymorph`, `planClairvoyance`, `planScrying`, `planArcaneEye`, `planSilentImage`, `planMajorImage`, `planRemoveCurse`, `planThunderStep`, `planDimensionDoor`, `planResurrect`, `planMistyStep`, `planHuntersMark`, `planMagicWeapon`, `planElementalWeapon`, `planSimulacrum`, `planWish`, `planAbsorbElements`). `mechanicalEffects` is empty by design.
- **deferred**: ships in the pack so the validator + consumer see it, but no mechanical event is emitted, pending the named primitive.
- **narrative**: intentionally emits nothing (rituals, divination, sensory / utility spells).

## Totals

**339 in pack**: **193 wired** (151 cast-time, 11 zone-tick, 24 dedicated planner, 6 zone-area, 1 weapon-attack), **69 narrative**, **77 deferred** (genuine mechanical gap, grouped by needed primitive per level below). The zone-area + weapon-attack rows landed in slices 494-496 (True Strike; Fog Cloud / Darkness / Silence / Move Earth / Reverse Gravity / Earthquake); slice 497 wired Ice Knife (multi-mechanic attack + AOE-save via the new `targetScope: 'first'` attack field); slice 498 wired Sorcerous Burst (exploding dice via the new `explodeOnMaxDie` attack field); slice 499 wired Goodberry (the new `create-item` mechanic minting consumables into inventory). Note: this catalog's per-spell split has accumulated drift since the slice-337 full reconcile — the per-level `inPack` totals are CI-guarded ([gaps-spells-counts.test.ts](../tests/audit/gaps-spells-counts.test.ts)) but the wired/narrative/deferred split is hand-maintained and a future slice-337-style full reconcile against [spell-coverage.test.ts](../tests/unit/engine/spell-coverage.test.ts) would catch any spells wired in slices 338-444 whose rows weren't moved.

## Biggest deferred clusters (the priority queue)

The remaining mechanical gap fragments across ~20 small primitives; there is no single large lever left (the persistent-damage-zone family already shipped via `aura-damage` / `movement-damage`). The clusters worth a focused slice, roughly by payoff:

- **Cross-plane travel / long-range teleport** (~11 remaining): blink, banishment, etherealness, plane-shift, teleport, word-of-recall, transport-via-plants, tree-stride, astral-projection, gate, maze. The cleanest in-combat teleport, **dimension-door**, shipped in slice 342 (`planDimensionDoor`); the rest are mostly DM / consumer-side (long-range / cross-plane positioning the engine doesn't model).
- **HP-threshold tier effect** (2 remaining): divine-word, power-word-heal. The `hp-threshold` mechanic shipped in slice 338 (power-word-kill: destroy / 12d12 psychic) and gained a `condition` arm in slice 339 (power-word-stun: Stunned at or below 150 HP with a recurring CON save, else Speed 0). The remaining two need a multi-threshold tiered variant (divine-word) and a heal + multi-condition-remove arm (power-word-heal).
- **Non-damage area zones** (~5 remaining): zone-of-truth, tiny-hut, wind-wall, guardian-of-faith, compulsion. The slice-495 `zone` primitive wired the positioned-area record for darkness + silence (+ fog-cloud), so the engine now tracks where those zones are; the remaining five need their specific in-zone effect (truth compulsion, ward, deflection) on top of the positioned record.
- **Beyond-image illusion** (~5): seeming, mislead, project-image, programmed-illusion, mirage-arcane.
- **Multi-damage AoE** (3 remaining): prismatic-spray, meteor-swarm, prismatic-wall. The save mechanic gained an `additionalDamage` array in slice 341 (flame-strike: fire + radiant); the remaining three also need multi-AoE / RNG-damage-table shapes on top of multi-type.
- **Terrain shaping** (~4 remaining): hallucinatory-terrain, passwall, wall-of-stone, mirage-arcane (mostly consumer-side; the engine models no positions). Move Earth gained the slice-495 `zone` positioned-area record (the engine tracks the reshapeable 40-ft cube); the actual reshape stays consumer-side.
- **On-hit smite rider via `castSpell`** (2 remaining): shining-smite, ensnaring-strike. The unconditional-AddDamage path landed in slice 444 via the existing `buff` mechanic + `OnEvent`/`consumeOnTrigger` infrastructure (canonical user: **divine-smite** at L1, with a base 2d8 radiant rider and a Fiend/Undead-gated +1d8 rider on the same condition). The two remaining spells need primitives the slice-444 path doesn't cover: **shining-smite** needs a concurrent concentration buff (the "always-illuminate-target" aura that runs in parallel to the on-hit rider); **ensnaring-strike** needs a save-via-OnEvent TriggerAction (fires a STR save on hit and conditionally applies Restrained with recurring per-turn damage). Both are small, distinct next slices in the smite-rider family. Divine Smite's upcast (+1d8 per slot above L1) stays deferred until the buff mechanic gains slot-level-aware variant selection — L1 Paladins only have L1 slots, so the deviation only matters from L3+ paladin onward.
- **Multi-target movement-restriction / force cage** (3): resilient-sphere, forcecage, wall-of-force.
- **Advanced / cross-plane summon** (~5): summon-dragon (needs the Draconic Spirit statblock), conjure-fey, planar-binding, planar-ally, create-undead.
- **Controllable spell-construct (action menu)** (3): arcane-hand, arcane-sword, animate-objects.

The long tail (composite-buff conditions, domination-distinct-from-charmed, recurring-rider, possession, magic-suppression, environment / physics primitives, etc.) is mostly singletons; see the per-level breakdown.

---

## Level 0 (27 in pack): 15 wired, 11 narrative, 1 deferred

**Wired, cast-time (14):** acid-splash, chill-touch, eldritch-blast, fire-bolt, guidance, poison-spray, produce-flame, ray-of-frost, resistance, sacred-flame, shocking-grasp, sorcerous-burst (slice 498: exploding ranged spell attack — 1d8 of a caster-chosen type, each 8 spawns another d8 chained, capped at the caster's spellcasting mod, via the new `explodeOnMaxDie` attack field), starry-wisp, vicious-mockery.

**Wired, weapon-attack (1):** true-strike (slice 494: `weaponAttack` mechanic — makes a weapon attack with the caster's spellcasting ability; cast via `engine.plan.castSpell` with a `weaponInstanceId`).

**Deferred (1):**
- **weapon-enhancement cantrip, not wired through `castSpell`:** shillelagh.

**Narrative (11):** dancing-lights, druidcraft, elementalism, light, mage-hand, mending, message, minor-illusion, prestidigitation, spare-the-dying, thaumaturgy.

## Level 1 (57 in pack): 42 wired, 12 narrative, 3 deferred

**Wired, cast-time (35):** bane, bless, burning-hands, charm-person, chromatic-orb, color-spray, command, cure-wounds, dissonant-whispers, divine-favor, divine-smite (`buff` -> `divine-smite-active` with two melee-hit OnEvent riders: unconditional 2d8 radiant + a Fiend/Undead-gated +1d8 radiant, both `consumeOnTrigger`; slice 444), faerie-fire, false-life, feather-fall, find-familiar, goodberry (slice 499: `create-item` mechanic — mints 10 single-use `goodberry` Heal-1 consumables into the caster's inventory), guiding-bolt, healing-word, hellish-rebuke, heroism, hex, hideous-laughter, ice-knife (slice 497: two-mechanic — ranged spell attack 1d10 piercing vs the primary via `targetScope: 'first'`, then a DEX-save 2d6 cold burst, +1d6/slot, vs the primary + splash), inflict-wounds, longstrider, mage-armor, magic-missile, protection-from-evil-and-good, ray-of-sickness, sanctuary, searing-smite, shield-of-faith, sleep, thunderwave, unseen-servant.

**Wired, zone-tick (2):** entangle, grease (STR / DEX save to restrained / prone on enter; `aura-damage` condition-only variant, fires via `tickAura`).

**Wired, planner (4):** hunters-mark, identify, shield, silent-image.

**Wired, zone-area (1):** fog-cloud (slice 495: `zone` mechanic — 20-ft obscurement sphere positioned at `targetPosition`; in-zone Blinded-equivalent obscurement is consumer-managed).

**Deferred (3):**
- **on-hit trigger system (save-via-OnEvent variant):** ensnaring-strike (needs a TriggerAction that fires a save chain on hit and conditionally applies Restrained; the always-on smite path used for divine-smite in slice 444 only supports unconditional `AddDamage`).
- **carry-capacity entity:** floating-disk.
- **condition target restriction (beast-only Charm):** animal-friendship.

**Narrative (12):** alarm, comprehend-languages, create-or-destroy-water, detect-evil-and-good, detect-magic, detect-poison-and-disease, disguise-self, expeditious-retreat, illusory-script, jump, purify-food-and-drink, speak-with-animals.

## Level 2 (57 in pack): 36 wired, 15 narrative, 6 deferred

**Wired, cast-time (30):** acid-arrow, aid, barkskin, blindness-deafness, blur, calm-emotions, darkvision, enhance-ability, enlarge-reduce, enthrall (WIS save -> `enthralled-active`: -10 to Perception checks; slice 343), find-steed, flame-blade, gust-of-wind, heat-metal, hold-person, invisibility, lesser-restoration, mind-spike, mirror-image, moonbeam, pass-without-trace, prayer-of-healing, protection-from-poison, scorching-ray, shatter, spider-climb, spiritual-weapon, suggestion, warding-bond, web. (Mirror Image carries a `buff` condition on cast plus the slice-124 `planAttack` deflection pool.)

**Wired, zone-tick (2):** flaming-sphere (DEX save 2d6 `aura-damage`), spike-growth (2d4-per-5ft `movement-damage`).

**Wired, planner (2):** magic-weapon, misty-step.

**Wired, zone-area (2):** darkness (slice 495: 15-ft magical-darkness sphere; the Darkvision-can't-see-through-it arm is consumer-managed), silence (slice 496: 20-ft silence sphere; in-zone Deafened + Thunder immunity + no-verbal-casting is consumer-managed).

**Deferred (6):**
- **non-damage area zone (in-zone effect on top of the positioned record):** zone-of-truth.
- **on-hit rider via `castSpell`:** shining-smite, ray-of-enfeeblement.
- **recurring-rider primitive:** phantasmal-force.
- **flight / hover condition:** levitate.
- **on-action rider:** dragons-breath.

**Narrative (15):** alter-self, animal-messenger, arcane-lock, arcanists-magic-aura, augury, continual-flame, detect-thoughts, find-traps, gentle-repose, knock, locate-animals-or-plants, locate-object, magic-mouth, rope-trick, see-invisibility.

## Level 3 (42 in pack): 27 wired, 10 narrative, 5 deferred

**Wired, cast-time (19):** animate-dead, bestow-curse, call-lightning, conjure-animals, fear, fireball, fly, gaseous-form, glyph-of-warding, haste, hypnotic-pattern, lightning-bolt, magic-circle, mass-healing-word, phantom-steed, protection-from-energy, sleet-storm, vampiric-touch, water-breathing.

**Wired, zone-tick (2):** spirit-guardians, stinking-cloud (condition-only `aura-damage`).

**Wired, planner (6):** clairvoyance, counterspell, dispel-magic, major-image, remove-curse, revivify.

**Deferred (5):**
- **non-damage area zone:** tiny-hut, wind-wall.
- **composite area condition (speed-half + no-reaction + delayed-action):** slow.
- **composite-buff condition:** beacon-of-hope.
- **cross-plane (per-turn ethereal toggle):** blink.

**Narrative (10):** create-food-and-water, daylight, meld-into-stone, nondetection, plant-growth, sending, speak-with-dead, speak-with-plants, tongues, water-walk.

## Level 4 (34 in pack): 18 wired, 6 narrative, 10 deferred

**Wired, cast-time (13):** blight, charm-monster, confusion, conjure-minor-elementals, conjure-woodland-beings, death-ward, fire-shield, freedom-of-movement, greater-invisibility, ice-storm, phantasmal-killer, stoneskin, vitriolic-sphere.

**Wired, zone-tick (2):** black-tentacles (DEX save 3d6 + restrained `aura-damage`), wall-of-fire (DEX save 5d8 `aura-damage`).

**Wired, planner (3):** arcane-eye, dimension-door (`planDimensionDoor`: action teleport up to 500 ft + optional willing passenger; slice 342), polymorph.

**Deferred (10):**
- **cross-plane travel:** banishment.
- **non-damage area zone + delayed expiration:** guardian-of-faith.
- **recurring-save area mechanic:** compulsion.
- **multi-target movement-restriction (force cage):** resilient-sphere.
- **sub-floor health mechanic:** aura-of-life.
- **alarm + delayed-attack sentry:** faithful-hound.
- **domination distinct from Charmed:** dominate-beast.
- **transformation handler (non-self target):** giant-insect.
- **sensor / scrying locator:** locate-creature.
- **terrain primitive:** hallucinatory-terrain.

**Narrative (6):** control-water, divination, fabricate, private-sanctum, secret-chest, stone-shape.

## Level 5 (38 in pack): 13 wired, 11 narrative, 14 deferred

**Wired, cast-time (10):** cloudkill, cone-of-cold, conjure-elemental, contagion, dominate-person, flame-strike (`save` mechanic with `additionalDamage`: 5d6 fire + 5d6 radiant, DEX half, +1d6 each per slot; slice 341), greater-restoration, hold-monster, insect-plague, mass-cure-wounds.

**Wired, planner (3):** raise-dead, reincarnate, scrying.

**Deferred (14):**
- **terrain primitive:** passwall, wall-of-stone.
- **area-wall (no damage, no save):** wall-of-force.
- **illusion primitive:** seeming, mislead.
- **controllable spell-construct (action menu):** arcane-hand, animate-objects.
- **cross-plane / planar summon:** planar-binding.
- **advanced summon (needs the Draconic Spirit statblock):** summon-dragon.
- **tree-anchored teleport:** tree-stride.
- **contested-check forced movement:** telekinesis.
- **long-duration compulsion:** geas.
- **multi-mode spell (aura + dispel + banish):** dispel-evil-and-good.
- **positional emanation geometry:** antilife-shell.

**Narrative (11):** awaken, commune, commune-with-nature, contact-other-plane, creation, dream, hallow, legend-lore, modify-memory, telepathic-bond, teleportation-circle.

## Level 6 (31 in pack): 17 wired, 1 narrative, 13 deferred

**Wired, cast-time (13):** chain-lightning, circle-of-death, disintegrate, eyebite, flesh-to-stone, freezing-sphere, harm, heal, heroes-feast, mass-suggestion, sunbeam, true-seeing, wind-walk.

**Wired, zone-tick (3):** blade-barrier (DEX save 6d10 `aura-damage`), wall-of-ice (DEX save 10d6 `aura-damage`), wall-of-thorns (DEX save 7d8 `aura-damage`).

**Wired, zone-area (1):** move-earth (slice 496: `zone` mechanic — positioned 40-ft reshapeable-terrain cube; the actual terrain reshape is consumer-managed).

**Deferred (13):**
- **area-warding primitive:** forbiddance, guards-and-wards, globe-of-invulnerability.
- **advanced / cross-plane summon:** conjure-fey, planar-ally, create-undead.
- **illusion + trigger:** programmed-illusion.
- **sensor / scrying locator:** find-the-path.
- **teleport-network / corridor:** word-of-recall, transport-via-plants.
- **conditional-cast (pre-stored spell):** contingency.
- **possession primitive:** magic-jar.
- **dancing condition + recurring save:** irresistible-dance.

**Narrative (1):** instant-summons.

## Level 7 (20 in pack): 8 wired, 1 narrative, 11 deferred

**Wired, cast-time (5):** conjure-celestial, delayed-blast-fireball, finger-of-death, fire-storm, regenerate.

**Wired, planner (2):** resurrection, simulacrum.

**Wired, zone-area (1):** reverse-gravity (slice 496: `zone` mechanic — positioned 50-ft-radius / 100-ft cylinder; the fall-upward + DEX-save-to-grab arm is consumer-managed against the zone).

**Deferred (11):**
- **HP-threshold tier effect:** divine-word.
- **cross-plane travel:** etherealness, plane-shift, teleport.
- **illusion (+ sensor / terrain):** project-image, mirage-arcane.
- **multi-damage AoE + RNG table:** prismatic-spray.
- **multi-target movement-restriction (force cage):** forcecage.
- **controllable spell-construct (on-action attack):** arcane-sword.
- **trap mechanic + caster-chosen trigger / effect:** symbol.
- **trigger-resume (time-stop on target until trigger):** sequester.

**Narrative (1):** magnificent-mansion.

## Level 8 (17 in pack): 9 wired, 1 narrative, 7 deferred

**Wired, cast-time (8):** befuddlement, dominate-monster, holy-aura, incendiary-cloud, mind-blank, power-word-stun (`hp-threshold` condition arm: Stunned at or below 150 HP with a recurring CON save, else Speed 0; slice 339), sunburst, tsunami.

**Wired, zone-area (1):** earthquake (slice 496: `zone` mechanic — positioned 100-ft-radius cylinder; the per-turn DEX/CON saves + difficult terrain + fissure / structure-collapse arms are consumer-managed against the zone).

**Deferred (7):**
- **cross-plane single-target:** maze.
- **environment primitive (weather):** control-weather.
- **extradimensional space:** demiplane.
- **magic-suppression field:** antimagic-field.
- **multi-target transformation:** animal-shapes.
- **resurrection-on-death backup:** clone.
- **type-conditional proximity buff:** antipathy-sympathy.

**Narrative (1):** glibness.

## Level 9 (16 in pack): 8 wired, 1 narrative, 7 deferred

**Wired, cast-time (4):** foresight, mass-heal, power-word-kill (`hp-threshold`: destroy at or below 100 HP, 12d12 psychic above; slice 338), weird.

**Wired, planner (4):** shapechange, true-polymorph, true-resurrection, wish.

**Deferred (7):**
- **HP-threshold tier effect (heal + multi-condition remove arm):** power-word-heal.
- **multi-AoE multi-damage:** meteor-swarm.
- **area-wall + multi-damage (seven layers):** prismatic-wall.
- **recurring multi-stage area-effect:** storm-of-vengeance.
- **cross-plane travel / summon:** astral-projection, gate.
- **turn-economy primitive (extra turns):** time-stop.

**Narrative (1):** imprisonment.

## How this list is maintained

When a slice wires, defers, or adds a spell: update the affected level section here **and** its `## Level N (P in pack): W wired, R narrative, X deferred` header, then re-run `npx vitest run tests/audit/gaps-spells-counts.test.ts`. The audit asserts every header's `P` matches the pack's per-level spell count, that `W + R + X === P`, and that the levels sum to the pack total. The wired / narrative / deferred split itself is reconciled against [tests/unit/engine/spell-coverage.test.ts](../tests/unit/engine/spell-coverage.test.ts); keep that test's `SPELL_EXPECTATIONS` entry in sync first, then mirror it here.
