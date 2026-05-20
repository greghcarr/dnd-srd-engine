# Spell gaps catalog

Per-spell catalog of which entries in the starter pack are **wired** (the engine emits a mechanical event chain on cast, fires a zone tick, or routes through a dedicated planner) versus **deferred** (ships in the pack but emits no mechanical event yet, pending an unbuilt primitive) versus **narrative** (intentionally emits nothing: rituals, divination, utility). Extracted from [starter-pack-gaps.md](starter-pack-gaps.md) in slice 249.

## Source of truth

The canonical per-spell status is **[tests/unit/engine/spell-coverage.test.ts](../tests/unit/engine/spell-coverage.test.ts)** joined with the pack's `mechanicalEffects`. That test casts every shipped spell and asserts the event chain a D&D-knowledgeable reader expects; every `skip` carries a reason. This doc is a human-readable reconciliation of that test. **When the two disagree, the test wins.** The per-level count headers below are guarded against drift by [tests/audit/gaps-spells-counts.test.ts](../tests/audit/gaps-spells-counts.test.ts), so a stale count fails CI rather than misleading the next contributor.

A prior version of this doc tracked the **full PHB 2024 spell list** as its denominator (e.g. "L2: 63/63") and listed non-SRD PHB spells (Frostbite, Mind Sliver, Crown of Madness, Toll the Dead, etc.) as if wired. The pack ships **SRD 5.2.1 + 12 non-SRD = 351 spells**, so those PHB-only entries were phantom rows. This catalog now counts only what is actually in the pack.

## Status legend

- **cast-time**: the spell carries `mechanicalEffects` the engine consumes at cast (`save`, `attack`, `heal`, `buff`, `summon`, `temp-hp`, `trap`, etc.); `engine.plan.castSpell` emits the chain.
- **zone-tick**: the spell carries an `aura-damage` or `movement-damage` mechanic. Cast emits only `ConcentrationStarted`; damage / conditions fire later via `engine.plan.tickAura({ casterId, targetIds, trigger? })` or `engine.plan.tickMovementDamage({ casterId, targetId, feetMoved })`, per-turn or per-traversal (slices 68-72). Wired, just not on the cast event.
- **planner**: handled by a dedicated planner (`planShield`, `planCounterspell`, `planPolymorph`, `planClairvoyance`, `planScrying`, `planArcaneEye`, `planSilentImage`, `planMajorImage`, `planRemoveCurse`, `planThunderStep`, `planResurrect`, `planMistyStep`, `planHuntersMark`, `planMagicWeapon`, `planElementalWeapon`, `planSimulacrum`, `planWish`, `planAbsorbElements`). `mechanicalEffects` is empty by design.
- **deferred**: ships in the pack so the validator + consumer see it, but no mechanical event is emitted, pending the named primitive.
- **narrative**: intentionally emits nothing (rituals, divination, sensory / utility spells).

## Totals

**351 in pack**: **190 wired** (151 cast-time, 13 zone-tick, 26 dedicated planner), **70 narrative**, **91 deferred** (genuine mechanical gap, grouped by needed primitive per level below).

## Biggest deferred clusters (the priority queue)

The remaining mechanical gap fragments across ~20 small primitives; there is no single large lever left (the persistent-damage-zone family already shipped via `aura-damage` / `movement-damage`). The clusters worth a focused slice, roughly by payoff:

- **Cross-plane travel / long-range teleport** (~12): blink, banishment, dimension-door, etherealness, plane-shift, teleport, word-of-recall, transport-via-plants, tree-stride, astral-projection, gate, maze. Most of the long-range ones are DM / consumer-side; **dimension-door** is the cleanest mechanical one (a multi-target `planMistyStep` sibling).
- **HP-threshold tier effect** (3 remaining): divine-word, power-word-stun, power-word-heal. The `hp-threshold` mechanic shipped in slice 338 (power-word-kill: destroy at or below 100 HP, 12d12 psychic above). The remaining three need new arm kinds: a `condition` arm (power-word-stun: Stunned with a recurring CON save, else Speed 0), a multi-threshold tiered variant (divine-word), and a heal + multi-condition-remove arm (power-word-heal).
- **Non-damage area zones** (~7): darkness, silence, zone-of-truth, tiny-hut, wind-wall, guardian-of-faith, compulsion. Need obscurement / silence / ward zone shapes distinct from the damage-zone `aura-damage` mechanic.
- **Beyond-image illusion** (~5): seeming, mislead, project-image, programmed-illusion, mirage-arcane.
- **Multi-damage AoE** (4): flame-strike, prismatic-spray, meteor-swarm, prismatic-wall.
- **Terrain shaping** (~5): hallucinatory-terrain, passwall, wall-of-stone, move-earth, mirage-arcane (mostly consumer-side; the engine models no positions).
- **On-hit smite rider via `castSpell`** (3): divine-smite, shining-smite, ensnaring-strike (the always-on smites already wire as one-shot buff conditions; these three need the cast-spell on-hit-rider path).
- **Multi-target movement-restriction / force cage** (3): resilient-sphere, forcecage, wall-of-force.
- **Advanced / cross-plane summon** (~5): summon-dragon (needs the Draconic Spirit statblock), conjure-fey, planar-binding, planar-ally, create-undead.
- **Controllable spell-construct (action menu)** (3): arcane-hand, arcane-sword, animate-objects.

The long tail (composite-buff conditions, domination-distinct-from-charmed, recurring-rider, possession, magic-suppression, environment / physics primitives, etc.) is mostly singletons; see the per-level breakdown.

---

## Level 0 (28 in pack): 14 wired, 11 narrative, 3 deferred

**Wired, cast-time (14):** acid-splash, blade-ward, chill-touch, eldritch-blast, fire-bolt, guidance, poison-spray, produce-flame, ray-of-frost, resistance, sacred-flame, shocking-grasp, starry-wisp, vicious-mockery.

**Deferred (3):**
- **open-die scaling:** sorcerous-burst.
- **weapon-attack rebrand, not wired through `castSpell`:** shillelagh, true-strike.

**Narrative (11):** dancing-lights, druidcraft, elementalism, light, mage-hand, mending, message, minor-illusion, prestidigitation, spare-the-dying, thaumaturgy.

## Level 1 (60 in pack): 41 wired, 13 narrative, 6 deferred

**Wired, cast-time (34):** armor-of-agathys, bane, bless, burning-hands, cause-fear, charm-person, chromatic-orb, color-spray, command, cure-wounds, dissonant-whispers, divine-favor, faerie-fire, false-life, feather-fall, find-familiar, guiding-bolt, healing-word, hellish-rebuke, heroism, hex, hideous-laughter, inflict-wounds, longstrider, mage-armor, magic-missile, protection-from-evil-and-good, ray-of-sickness, sanctuary, searing-smite, shield-of-faith, sleep, thunderwave, unseen-servant.

**Wired, zone-tick (2):** entangle, grease (STR / DEX save to restrained / prone on enter; `aura-damage` condition-only variant, fires via `tickAura`).

**Wired, planner (5):** absorb-elements, hunters-mark, identify, shield, silent-image.

**Deferred (6):**
- **on-hit trigger system (smite via `castSpell`):** divine-smite, ensnaring-strike.
- **carry-capacity entity:** floating-disk.
- **condition target restriction (beast-only Charm):** animal-friendship.
- **item-creation mechanic for spells:** goodberry.
- **multi-mechanic shape (attack + AoE-on-hit-or-miss):** ice-knife.

**Narrative (13):** alarm, comprehend-languages, create-or-destroy-water, detect-evil-and-good, detect-magic, detect-poison-and-disease, disguise-self, expeditious-retreat, fog-cloud, illusory-script, jump, purify-food-and-drink, speak-with-animals.

## Level 2 (60 in pack): 36 wired, 15 narrative, 9 deferred

**Wired, cast-time (31):** acid-arrow, aid, barkskin, blindness-deafness, blur, calm-emotions, cordon-of-arrows, darkvision, enhance-ability, enlarge-reduce, find-steed, flame-blade, gust-of-wind, heat-metal, hold-person, invisibility, lesser-restoration, mind-spike, mirror-image, moonbeam, pass-without-trace, prayer-of-healing, protection-from-poison, scorching-ray, shatter, spider-climb, spiritual-weapon, suggestion, summon-beast, warding-bond, web. (Mirror Image carries a `buff` condition on cast plus the slice-124 `planAttack` deflection pool.)

**Wired, zone-tick (3):** cloud-of-daggers (4d4 no-save `aura-damage`), flaming-sphere (DEX save 2d6 `aura-damage`), spike-growth (2d4-per-5ft `movement-damage`).

**Wired, planner (2):** magic-weapon, misty-step.

**Deferred (9):**
- **non-damage area zone:** darkness (obscurement + visibility condition), silence, zone-of-truth.
- **on-hit rider via `castSpell`:** shining-smite, ray-of-enfeeblement.
- **recurring-rider primitive:** phantasmal-force.
- **flight / hover condition:** levitate.
- **on-action rider:** dragons-breath.
- **perception-buff condition:** enthrall.

**Narrative (15):** alter-self, animal-messenger, arcane-lock, arcanists-magic-aura, augury, continual-flame, detect-thoughts, find-traps, gentle-repose, knock, locate-animals-or-plants, locate-object, magic-mouth, rope-trick, see-invisibility.

## Level 3 (47 in pack): 32 wired, 10 narrative, 5 deferred

**Wired, cast-time (21):** animate-dead, bestow-curse, call-lightning, conjure-animals, crusaders-mantle, fear, fireball, fly, gaseous-form, glyph-of-warding, haste, hypnotic-pattern, lightning-bolt, magic-circle, mass-healing-word, phantom-steed, protection-from-energy, sleet-storm, spirit-shroud, vampiric-touch, water-breathing.

**Wired, zone-tick (3):** hunger-of-hadar (multi-component `aura-damage`), spirit-guardians, stinking-cloud (condition-only `aura-damage`).

**Wired, planner (8):** clairvoyance, counterspell, dispel-magic, elemental-weapon, major-image, remove-curse, revivify, thunder-step.

**Deferred (5):**
- **non-damage area zone:** tiny-hut, wind-wall.
- **composite area condition (speed-half + no-reaction + delayed-action):** slow.
- **composite-buff condition:** beacon-of-hope.
- **cross-plane (per-turn ethereal toggle):** blink.

**Narrative (10):** create-food-and-water, daylight, meld-into-stone, nondetection, plant-growth, sending, speak-with-dead, speak-with-plants, tongues, water-walk.

## Level 4 (34 in pack): 17 wired, 6 narrative, 11 deferred

**Wired, cast-time (13):** blight, charm-monster, confusion, conjure-minor-elementals, conjure-woodland-beings, death-ward, fire-shield, freedom-of-movement, greater-invisibility, ice-storm, phantasmal-killer, stoneskin, vitriolic-sphere.

**Wired, zone-tick (2):** black-tentacles (DEX save 3d6 + restrained `aura-damage`), wall-of-fire (DEX save 5d8 `aura-damage`).

**Wired, planner (2):** arcane-eye, polymorph.

**Deferred (11):**
- **cross-plane travel:** banishment, dimension-door (a multi-target `planMistyStep` sibling).
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

## Level 5 (38 in pack): 12 wired, 11 narrative, 15 deferred

**Wired, cast-time (9):** cloudkill, cone-of-cold, conjure-elemental, contagion, dominate-person, greater-restoration, hold-monster, insect-plague, mass-cure-wounds.

**Wired, planner (3):** raise-dead, reincarnate, scrying.

**Deferred (15):**
- **terrain primitive:** passwall, wall-of-stone.
- **area-wall (no damage, no save):** wall-of-force.
- **multi-damage AoE:** flame-strike.
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

## Level 6 (31 in pack): 16 wired, 1 narrative, 14 deferred

**Wired, cast-time (13):** chain-lightning, circle-of-death, disintegrate, eyebite, flesh-to-stone, freezing-sphere, harm, heal, heroes-feast, mass-suggestion, sunbeam, true-seeing, wind-walk.

**Wired, zone-tick (3):** blade-barrier (DEX save 6d10 `aura-damage`), wall-of-ice (DEX save 10d6 `aura-damage`), wall-of-thorns (DEX save 7d8 `aura-damage`).

**Deferred (14):**
- **area-warding primitive:** forbiddance, guards-and-wards, globe-of-invulnerability.
- **terrain primitive:** move-earth.
- **advanced / cross-plane summon:** conjure-fey, planar-ally, create-undead.
- **illusion + trigger:** programmed-illusion.
- **sensor / scrying locator:** find-the-path.
- **teleport-network / corridor:** word-of-recall, transport-via-plants.
- **conditional-cast (pre-stored spell):** contingency.
- **possession primitive:** magic-jar.
- **dancing condition + recurring save:** irresistible-dance.

**Narrative (1):** instant-summons.

## Level 7 (20 in pack): 7 wired, 1 narrative, 12 deferred

**Wired, cast-time (5):** conjure-celestial, delayed-blast-fireball, finger-of-death, fire-storm, regenerate.

**Wired, planner (2):** resurrection, simulacrum.

**Deferred (12):**
- **HP-threshold tier effect:** divine-word.
- **cross-plane travel:** etherealness, plane-shift, teleport.
- **illusion (+ sensor / terrain):** project-image, mirage-arcane.
- **multi-damage AoE + RNG table:** prismatic-spray.
- **multi-target movement-restriction (force cage):** forcecage.
- **controllable spell-construct (on-action attack):** arcane-sword.
- **trap mechanic + caster-chosen trigger / effect:** symbol.
- **trigger-resume (time-stop on target until trigger):** sequester.
- **physics primitive (gravity inversion):** reverse-gravity.

**Narrative (1):** magnificent-mansion.

## Level 8 (17 in pack): 7 wired, 1 narrative, 9 deferred

**Wired, cast-time (7):** befuddlement, dominate-monster, holy-aura, incendiary-cloud, mind-blank, sunburst, tsunami.

**Deferred (9):**
- **HP-threshold tier effect:** power-word-stun.
- **multi-stage area-effect (save + terrain destruction + collapse):** earthquake.
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
