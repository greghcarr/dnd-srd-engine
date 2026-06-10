// Spell-by-spell smoke test. For each spell shipped in the starter pack,
// we cast it under a controlled scenario and assert that the engine
// emits the events a D&D-knowledgeable reader expects to see. A leveled
// spell that ships in the pack with no mechanical effect at all (Magic
// Missile, Bless before they were wired up) fails this test, surfacing
// the gap.
//
// The intent table below is the source of truth for "what should this
// spell do, mechanically?". Each entry is short: just enough to identify
// the expected event kinds. Damage values aren't asserted (those are
// owned by tighter unit tests); we're catching omissions and shape
// drift here, not exact dice.
//
// `skip` is used for spells that have their own dedicated planner
// (counterspell, dispel-magic, identify) where planCastSpell isn't the
// right entry point, and for pure utility cantrips whose entire effect
// is narrative (mage-hand, prestidigitation, light, detect-magic). Every
// `skip` line carries a reason so it stays auditable.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { CasterChoice } from '../../../src/engine/plan/cast-spell.js';

type Expectation =
  | { kind: 'attack'; casterChoice?: CasterChoice }
  | { kind: 'save'; casterChoice?: CasterChoice }
  | { kind: 'heal' }
  | { kind: 'auto-hit'; minDarts: number }
  | { kind: 'buff'; conditionId: string; casterChoice?: CasterChoice }
  | { kind: 'remove-condition'; seedConditionId: string }
  | { kind: 'hp-pool-knockout' }
  | { kind: 'summon' }
  | { kind: 'temp-hp' }
  | { kind: 'trap'; casterChoice?: CasterChoice }
  | { kind: 'destroy' }
  | { kind: 'zone' }
  | { kind: 'create-item'; minItems: number }
  // Slice 583: aura-damage spells (Spirit Guardians, Cloud of
  // Daggers, etc.) — cast emits ConcentrationStarted only, the
  // mechanical action fires via engine.plan.tickAura per-turn. The
  // harness casts the spell with the appropriate caster class +
  // slot level, then calls tickAura against a target and asserts
  // the expected event chain (SaveRolled when the aura carries a
  // save; DamageApplied when the aura emits damage regardless of
  // save outcome — halfOnSuccess: true or no save at all).
  | {
      kind: 'aura-damage';
      castingClass: 'cleric' | 'druid' | 'wizard';
      slotLevel: number;
      expectsSave: boolean;
      expectsDamage: boolean;
    }
  | { kind: 'skip'; reason: string };

const SPELL_EXPECTATIONS: Record<string, Expectation> = {
  // Cantrips with explicit attack rolls
  'fire-bolt': { kind: 'attack' },
  'eldritch-blast': { kind: 'attack' },
  'ray-of-frost': { kind: 'attack' },
  'shocking-grasp': { kind: 'attack' },
  // Cantrip save spells
  'sacred-flame': { kind: 'save' },
  // L1+
  'magic-missile': { kind: 'auto-hit', minDarts: 3 },
  'fireball': { kind: 'save' },
  'burning-hands': { kind: 'save' },
  'thunderwave': { kind: 'save' },
  'hold-person': { kind: 'save' },
  'cure-wounds': { kind: 'heal' },
  'healing-word': { kind: 'heal' },
  'bless': { kind: 'buff', conditionId: 'blessed' },
  'spiritual-weapon': { kind: 'attack' },
  // Spells with dedicated planners (planCounterspell, planDispelMagic,
  // planIdentify) — castSpell isn't the right call site.
  'counterspell': { kind: 'skip', reason: 'has dedicated planCounterspell' },
  'dispel-magic': { kind: 'skip', reason: 'has dedicated planDispelMagic' },
  'identify': { kind: 'skip', reason: 'has dedicated planIdentify' },
  // Utility / narrative-only — cast emits no mechanical event.
  'mage-hand': { kind: 'skip', reason: 'utility cantrip, no mechanical effect' },
  'prestidigitation': { kind: 'skip', reason: 'utility cantrip, no mechanical effect' },
  'light': { kind: 'skip', reason: 'utility cantrip, no mechanical effect' },
  'detect-magic': { kind: 'skip', reason: 'detection only, no mechanical effect' },
  'guidance': { kind: 'buff', conditionId: 'guided' },
  // Defensive / movement spells not yet mechanically modeled.
  'shield': { kind: 'skip', reason: 'has dedicated planShield (reaction, not planCastSpell)' },
  'mage-armor': { kind: 'buff', conditionId: 'mage-armored' },
  'misty-step': { kind: 'skip', reason: 'has dedicated planMistyStep (bonus action teleport, not planCastSpell)' },
  // Control / crowd-control spells not yet mechanically modeled.
  'faerie-fire': { kind: 'save' },
  'bane': { kind: 'save' },
  'sleep': { kind: 'save' },
  'web': { kind: 'save' },
  'spirit-guardians': { kind: 'aura-damage', castingClass: 'cleric', slotLevel: 3, expectsSave: true, expectsDamage: true },
  // Buffs / utility spells with simple shapes not yet wired.
  'aid': { kind: 'heal' },
  'polymorph': { kind: 'skip', reason: 'has dedicated planPolymorph (not planCastSpell)' },
  'lesser-restoration': { kind: 'remove-condition', seedConditionId: 'poisoned' },
  // Additional PHB 2024 cantrips with attack rolls
  'chill-touch': { kind: 'attack' },
  'produce-flame': { kind: 'attack' },
  'starry-wisp': { kind: 'attack' },
  // Additional PHB 2024 cantrips with saves
  'acid-splash': { kind: 'save' },
  'poison-spray': { kind: 'attack' },
  'vicious-mockery': { kind: 'save' },
  // Utility / narrative cantrips with no wired mechanical effect yet.
  'blade-ward': { kind: 'buff', conditionId: 'blade-warded-active' },
  'dancing-lights': { kind: 'skip', reason: 'utility cantrip, no mechanical effect' },
  'druidcraft': { kind: 'skip', reason: 'utility cantrip, no mechanical effect' },
  'mending': { kind: 'skip', reason: 'utility repair, no mechanical effect' },
  'message': { kind: 'skip', reason: 'utility communication, no mechanical effect' },
  'minor-illusion': { kind: 'skip', reason: 'illusion cantrip, no mechanical effect' },
  'resistance': { kind: 'buff', conditionId: 'resisted' },
  'shillelagh': { kind: 'skip', reason: 'weapon-buff mechanic: requires intent.weaponInstanceId (a held weapon this harness does not set up); exercised by slice-501-shillelagh.test.ts' },
  'spare-the-dying': { kind: 'skip', reason: 'stabilize-only cantrip, no mechanical event yet' },
  'thaumaturgy': { kind: 'skip', reason: 'narrative cantrip, no mechanical effect' },
  'true-strike': { kind: 'skip', reason: '2024 weapon-attack rebrand, not wired through planCastSpell' },
  // PHB 2024 L1 spells with wired mechanics
  'cause-fear': { kind: 'save' },
  'charm-person': { kind: 'save' },
  'color-spray': { kind: 'hp-pool-knockout' },
  'dissonant-whispers': { kind: 'save' },
  'guiding-bolt': { kind: 'attack' },
  'hellish-rebuke': { kind: 'save' },
  'inflict-wounds': { kind: 'save' },
  'ray-of-sickness': { kind: 'attack' },
  'hideous-laughter': { kind: 'save' },
  // PHB 2024 L1 spells shipped schema-only (no mechanicalEffects yet).
  // Each line records why it's deferred so the gap is auditable.
  'absorb-elements': { kind: 'skip', reason: 'has dedicated engine.plan.absorbElements (reaction to a DamageApplied event of the matching type, not planCastSpell)' },
  'alarm': { kind: 'skip', reason: 'ritual alarm zone; no combat-event side' },
  'animal-friendship': { kind: 'skip', reason: 'wired (slice 500): WIS save -> charmed, gated to Beast targets via the save mechanic targetCreatureType filter. The generic harness targets are Humanoids (skipped by the Beast filter), so the dedicated slice-500 test exercises it with a real Beast.' },
  'armor-of-agathys': { kind: 'temp-hp' },
  'chromatic-orb': { kind: 'attack', casterChoice: { kind: 'damageType', value: 'fire' } },
  'command': { kind: 'save', casterChoice: { kind: 'variant', value: 'halt' } },
  'comprehend-languages': { kind: 'skip', reason: 'utility ritual, narrative only' },
  'create-or-destroy-water': { kind: 'skip', reason: 'utility, narrative only' },
  'detect-evil-and-good': { kind: 'skip', reason: 'detection ritual, narrative only' },
  'detect-poison-and-disease': { kind: 'skip', reason: 'detection ritual, narrative only' },
  'disguise-self': { kind: 'skip', reason: 'illusion utility, narrative only' },
  'divine-favor': { kind: 'buff', conditionId: 'divine-favor-active' },
  'ensnaring-strike': { kind: 'save' },
  'entangle': { kind: 'aura-damage', castingClass: 'druid', slotLevel: 1, expectsSave: true, expectsDamage: false },
  'expeditious-retreat': { kind: 'skip', reason: 'bonus-action speed buff, narrative only' },
  'false-life': { kind: 'temp-hp' },
  'feather-fall': { kind: 'buff', conditionId: 'feather-falling-active' },
  'find-familiar': { kind: 'summon' },
  'fog-cloud': { kind: 'zone' },
  'goodberry': { kind: 'create-item', minItems: 10 },
  'grease': { kind: 'skip', reason: 'non-concentration aura: planTickAura requires the caster\'s concentration effect, but Grease ends without concentration (RAW 1-minute duration with no concentration). An "on-enter zone" planner that fires the save on a consumer-supplied entry event is the proper RAW shape; deferred.' },
  'heroism': { kind: 'buff', conditionId: 'heroic-active' },
  'hex': { kind: 'buff', conditionId: 'hexed-STR-active', casterChoice: { kind: 'variant', value: 'STR' } },
  'hunters-mark': { kind: 'skip', reason: 'has dedicated planHuntersMark (concentration mark, not planCastSpell)' },
  'jump': { kind: 'skip', reason: 'utility movement, narrative only' },
  'longstrider': { kind: 'buff', conditionId: 'longstrider-active' },
  'protection-from-evil-and-good': { kind: 'buff', conditionId: 'protection-from-evil-and-good-active' },
  'purify-food-and-drink': { kind: 'skip', reason: 'utility ritual, narrative only' },
  'sanctuary': { kind: 'buff', conditionId: 'sanctuary-active' },
  'searing-smite': { kind: 'buff', conditionId: 'searing-smite-active' },
  'shield-of-faith': { kind: 'buff', conditionId: 'shield-of-faith-active' },
  'silent-image': { kind: 'skip', reason: 'has dedicated planSilentImage (creates a visual Illusion entity with concentration; Study action via planInvestigateIllusion rolls Investigation vs caster spell DC to disbelieve)' },
  'speak-with-animals': { kind: 'skip', reason: 'ritual, narrative only' },
  'unseen-servant': { kind: 'summon' },
  // PHB 2024 L2 spells with wired mechanics
  'blindness-deafness': { kind: 'save' },
  'flame-blade': { kind: 'attack' },
  'heat-metal': { kind: 'save' },
  'invisibility': { kind: 'buff', conditionId: 'invisible' },
  'acid-arrow': { kind: 'attack' },
  'moonbeam': { kind: 'save' },
  'prayer-of-healing': { kind: 'heal' },
  'protection-from-poison': { kind: 'remove-condition', seedConditionId: 'poisoned' },
  'scorching-ray': { kind: 'attack' },
  'shatter': { kind: 'save' },
  'suggestion': { kind: 'save' },
  // PHB 2024 L2 spells shipped schema-only. Reasons mirror the engine
  // primitive each one is waiting on; see docs/starter-pack-gaps.md.
  'alter-self': { kind: 'skip', reason: 'shapeshift utility; transformation handler not modeled for spells' },
  'animal-messenger': { kind: 'skip', reason: 'ritual utility, narrative only' },
  'arcane-lock': { kind: 'skip', reason: 'utility (sealed door); no combat-event side' },
  'augury': { kind: 'skip', reason: 'divination ritual, narrative only' },
  'barkskin': { kind: 'buff', conditionId: 'barkskin-active' },
  'blur': { kind: 'buff', conditionId: 'blurred-active' },
  'calm-emotions': { kind: 'save', casterChoice: { kind: 'variant', value: 'suppress' } },
  'cloud-of-daggers': { kind: 'aura-damage', castingClass: 'wizard', slotLevel: 2, expectsSave: false, expectsDamage: true },
  'continual-flame': { kind: 'skip', reason: 'utility (creates flame); no combat-event side' },
  'cordon-of-arrows': { kind: 'trap' },
  'darkness': { kind: 'zone' },
  'darkvision': { kind: 'buff', conditionId: 'darkvision-active' },
  'detect-thoughts': { kind: 'skip', reason: 'divination utility; detection mechanic not modeled' },
  'dragons-breath': { kind: 'skip', reason: 'grants ally a breath-weapon reaction-style; on-action rider not modeled' },
  'enhance-ability': { kind: 'buff', conditionId: 'bulls-strength-active', casterChoice: { kind: 'variant', value: 'bulls-strength' } },
  'enlarge-reduce': { kind: 'buff', conditionId: 'enlarged-active', casterChoice: { kind: 'variant', value: 'enlarge' } },
  'enthrall': { kind: 'save' },
  'find-steed': { kind: 'summon' },
  'find-traps': { kind: 'skip', reason: 'divination utility; detection mechanic not modeled' },
  'flaming-sphere': { kind: 'aura-damage', castingClass: 'druid', slotLevel: 2, expectsSave: true, expectsDamage: true },
  'gentle-repose': { kind: 'skip', reason: 'utility ritual (preserves corpse), narrative only' },
  'gust-of-wind': { kind: 'save' },
  'knock': { kind: 'skip', reason: 'utility (opens lock), narrative only' },
  'levitate': { kind: 'skip', reason: 'lifts a target; flight / hover condition not modeled' },
  'locate-animals-or-plants': { kind: 'skip', reason: 'divination utility, narrative only' },
  'locate-object': { kind: 'skip', reason: 'divination utility, narrative only' },
  'magic-mouth': { kind: 'skip', reason: 'utility (programmed illusion), narrative only' },
  'magic-weapon': { kind: 'skip', reason: 'has dedicated engine.plan.magicWeapon (needs a specific weaponInstanceId target, not planCastSpell)' },
  'mirror-image': { kind: 'buff', conditionId: 'mirror-image-active' },
  'arcanists-magic-aura': { kind: 'skip', reason: 'utility (anti-detect), narrative only' },
  'pass-without-trace': { kind: 'buff', conditionId: 'pass-without-trace-active' },
  'phantasmal-force': { kind: 'skip', reason: 'INT save illusion + recurring psychic damage; recurring-rider primitive not modeled' },
  'ray-of-enfeeblement': { kind: 'skip', reason: 'ranged attack with on-hit weapon-damage halving; on-hit rider primitive not modeled' },
  'rope-trick': { kind: 'skip', reason: 'utility (extradimensional space), narrative only' },
  'see-invisibility': { kind: 'skip', reason: 'utility (see invisible), narrative only' },
  'silence': { kind: 'zone' },
  'spider-climb': { kind: 'buff', conditionId: 'spider-climbing-active' },
  'spike-growth': { kind: 'skip', reason: 'movement-damage mechanic (2d4 piercing per 5 ft moved through zone, no save); fires via engine.plan.tickMovementDamage, not on cast. RAW difficult-terrain side-effect isn\'t expressed.' },
  'summon-beast': { kind: 'summon' },
  'warding-bond': { kind: 'buff', conditionId: 'warding-bond-active' },
  'zone-of-truth': { kind: 'skip', reason: 'area + CHA save against deception; area-effect mechanic not modeled' },
  // PHB 2024 L3 spells with wired mechanics
  'call-lightning': { kind: 'save' },
  'fear': { kind: 'save' },
  'hypnotic-pattern': { kind: 'save' },
  'lightning-bolt': { kind: 'save' },
  'mass-healing-word': { kind: 'heal' },
  'sleet-storm': { kind: 'save' },
  'vampiric-touch': { kind: 'attack' },
  // PHB 2024 L3 spells shipped schema-only; see docs/starter-pack-gaps.md.
  'animate-dead': { kind: 'summon' },
  'beacon-of-hope': { kind: 'skip', reason: 'multi-buff condition (advantage on WIS + death saves + max heal); composite-buff condition not modeled' },
  'bestow-curse': { kind: 'save', casterChoice: { kind: 'variant', value: 'ability-disadvantage-str' } },
  'clairvoyance': { kind: 'skip', reason: 'has dedicated planClairvoyance (places a remote Sensor entity with caster-mediated sight/hearing toggle and concentration-bound lifetime)' },
  'conjure-animals': { kind: 'summon' },
  'create-food-and-water': { kind: 'skip', reason: 'utility (food creation), narrative only' },
  'crusaders-mantle': { kind: 'buff', conditionId: 'crusaders-mantle-active' },
  'daylight': { kind: 'skip', reason: 'utility (creates bright light), narrative only' },
  'elemental-weapon': { kind: 'skip', reason: 'has dedicated engine.plan.elementalWeapon (needs a specific weaponInstanceId + damageType, not planCastSpell)' },
  'fly': { kind: 'buff', conditionId: 'flying-active' },
  'gaseous-form': { kind: 'buff', conditionId: 'gaseous-form-active' },
  'glyph-of-warding': { kind: 'trap', casterChoice: { kind: 'damageType', value: 'fire' } },
  'haste': { kind: 'buff', conditionId: 'hasted-active' },
  'hunger-of-hadar': { kind: 'skip', reason: 'multi-component aura-damage (cold-on-enter no save + acid-on-turn-end with DEX save); fires via engine.plan.tickAura with per-call intent.trigger, not on cast' },
  'tiny-hut': { kind: 'skip', reason: 'persistent shelter dome; area-effect mechanic not modeled' },
  'magic-circle': { kind: 'buff', conditionId: 'magic-circle-active' },
  'major-image': { kind: 'skip', reason: 'has dedicated planMajorImage (audiovisual Illusion entity with concentration; shares planInvestigateIllusion with Silent Image)' },
  'meld-into-stone': { kind: 'skip', reason: 'utility (merge with stone), narrative only' },
  'nondetection': { kind: 'skip', reason: 'utility (anti-detect buff), narrative only' },
  'phantom-steed': { kind: 'summon' },
  'plant-growth': { kind: 'skip', reason: 'area difficult terrain + agricultural utility; area-effect mechanic not modeled' },
  'protection-from-energy': { kind: 'buff', conditionId: 'protection-fire-active', casterChoice: { kind: 'variant', value: 'fire' } },
  'remove-curse': { kind: 'skip', reason: 'has dedicated planRemoveCurse (strips conditions tagged with category: curse from the touched target)' },
  'revivify': { kind: 'skip', reason: 'has dedicated engine.plan.resurrect (the resurrection planner handles revivify / raise-dead / reincarnate / resurrection / true-resurrection — not planCastSpell)' },
  'sending': { kind: 'skip', reason: 'utility (telepathic message), narrative only' },
  'slow': { kind: 'skip', reason: 'area + multi-effect WIS save (speed half + no reactions + delayed action); composite area condition not modeled' },
  'speak-with-dead': { kind: 'skip', reason: 'utility (question corpse), narrative only' },
  'speak-with-plants': { kind: 'skip', reason: 'utility (talk to plants), narrative only' },
  'spirit-shroud': { kind: 'buff', conditionId: 'spirit-shroud-cold-active', casterChoice: { kind: 'variant', value: 'cold' } },
  'stinking-cloud': { kind: 'aura-damage', castingClass: 'wizard', slotLevel: 3, expectsSave: true, expectsDamage: false },
  'thunder-step': { kind: 'skip', reason: 'has dedicated planThunderStep (action, teleport caster + ally, AoE thunder damage on origin)' },
  'tongues': { kind: 'skip', reason: 'utility (language understanding), narrative only' },
  'water-breathing': { kind: 'buff', conditionId: 'water-breathing-active' },
  'water-walk': { kind: 'skip', reason: 'utility (walk on water), narrative only' },
  'wind-wall': { kind: 'skip', reason: 'area STR save with object deflection; area-effect mechanic not modeled' },
  // Slice 223: SRD 5.2.1 completion sweep. 15 entries that were
  // SRD-listed but missing from the pack; each ships schema-only
  // unless the primary mechanic is a single-save shape the engine
  // already supports.
  'antilife-shell': { kind: 'skip', reason: 'positional 10-foot emanation barring most creature types; geometry primitive not modeled' },
  'befuddlement': { kind: 'save' },
  'blink': { kind: 'skip', reason: 'per-turn 1d6 ethereal-plane toggle; cross-plane mechanic not modeled' },
  'divine-smite': { kind: 'buff', conditionId: 'divine-smite-active' },
  'elementalism': { kind: 'skip', reason: '5-variant cosmetic utility cantrip (Beckon Air/Earth/Fire/Water + Sculpt Element); no mechanical effect' },
  'floating-disk': { kind: 'skip', reason: 'cast emits no mechanical events (consumer-side world entity); the 500-lb-capacity disk + follow-the-caster behavior is engine-out-of-scope per the no-positions stance. The cast path is exercised by slice-507-floating-disk.test.ts.' },
  'freezing-sphere': { kind: 'save' },
  'ice-knife': { kind: 'attack' },
  'illusory-script': { kind: 'skip', reason: 'imbues parchment with illusory writing for 10 days; narrative utility ritual' },
  'mind-spike': { kind: 'save' },
  'shining-smite': { kind: 'skip', reason: 'paladin smite + always-illuminate-target concentration buff; on-hit rider mechanic not yet wired through planCastSpell' },
  'sorcerous-burst': { kind: 'attack', casterChoice: { kind: 'damageType', value: 'fire' } },
  'summon-dragon': { kind: 'skip', reason: 'summons a Draconic Spirit; the Draconic Spirit statblock is not in the monster catalog yet' },
  'transport-via-plants': { kind: 'skip', reason: 'magical plant-to-plant link for movement; teleport-corridor primitive not modeled' },
  'vitriolic-sphere': { kind: 'save' },
  // PHB 2024 L4 spells with wired mechanics
  'blight': { kind: 'save' },
  'charm-monster': { kind: 'save' },
  'conjure-minor-elementals': { kind: 'summon' },
  'conjure-woodland-beings': { kind: 'summon' },
  'freedom-of-movement': { kind: 'buff', conditionId: 'freedom-of-movement-active' },
  'greater-invisibility': { kind: 'buff', conditionId: 'invisible' },
  'ice-storm': { kind: 'save' },
  'phantasmal-killer': { kind: 'save' },
  // PHB 2024 L4 spells shipped schema-only; see docs/starter-pack-gaps.md.
  'arcane-eye': { kind: 'skip', reason: 'has dedicated planArcaneEye (places a mobile Sensor entity with darkvision 30; caster moves it on a bonus action via planMoveSensor)' },
  'aura-of-life': { kind: 'skip', reason: 'paladin aura that holds allies above half-HP-floor + revives at 0 HP; sub-floor health mechanic not modeled' },
  'banishment': { kind: 'skip', reason: 'CHA save banishes target to another plane; cross-plane travel + return-on-concentration-drop not modeled' },
  'black-tentacles': { kind: 'aura-damage', castingClass: 'wizard', slotLevel: 4, expectsSave: true, expectsDamage: true },
  'compulsion': { kind: 'skip', reason: 'forced movement on WIS save with recurring re-save; recurring-save area mechanic not modeled' },
  'confusion': { kind: 'save' },
  'control-water': { kind: 'skip', reason: 'water-shape utility; terrain primitive not modeled' },
  'death-ward': { kind: 'buff', conditionId: 'death-ward-active' },
  'dimension-door': { kind: 'skip', reason: 'has dedicated planDimensionDoor (action teleport up to 500 ft + optional willing passenger, not planCastSpell)' },
  'divination': { kind: 'skip', reason: 'cleric ritual divination; DM-resolution primitive not modeled' },
  'dominate-beast': { kind: 'skip', reason: 'WIS save → controlled-mind; domination semantics distinct from Charmed not modeled' },
  'fabricate': { kind: 'skip', reason: '10-minute creation ritual; crafting / material-transformation primitive not modeled' },
  'faithful-hound': { kind: 'skip', reason: 'placed sentry that barks + attacks on intruders; alarm + delayed attack pattern not modeled' },
  'fire-shield': { kind: 'buff', conditionId: 'fire-shield-warm-active', casterChoice: { kind: 'variant', value: 'warm' } },
  'giant-insect': { kind: 'skip', reason: 'transforms ordinary insects into giant variants; transformation handler for non-self targets not modeled' },
  'guardian-of-faith': { kind: 'skip', reason: 'summoned guardian that radiates damage in a 10ft area; area-effect mechanic + delayed expiration not modeled' },
  'hallucinatory-terrain': { kind: 'skip', reason: 'large-area illusion; terrain primitive not modeled' },
  'locate-creature': { kind: 'skip', reason: 'divination locator; sensor / scrying primitive not modeled' },
  'private-sanctum': { kind: 'skip', reason: 'large-area ward against detection/sound/teleport; area-warding primitive not modeled' },
  'resilient-sphere': { kind: 'skip', reason: 'forced cage around target on DEX save; multi-target movement-restriction primitive not modeled' },
  'secret-chest': { kind: 'skip', reason: 'extradimensional storage utility; ethereal-stash primitive not modeled' },
  'stone-shape': { kind: 'skip', reason: 'utility shaping of stone; terrain primitive not modeled' },
  'stoneskin': { kind: 'buff', conditionId: 'stoneskin-active' },
  'wall-of-fire': { kind: 'aura-damage', castingClass: 'wizard', slotLevel: 4, expectsSave: true, expectsDamage: true },
  // PHB 2024 L5 spells with wired mechanics
  'cloudkill': { kind: 'save' },
  'cone-of-cold': { kind: 'save' },
  'conjure-elemental': { kind: 'summon' },
  'contagion': { kind: 'save' },
  'dominate-person': { kind: 'save' },
  'greater-restoration': { kind: 'remove-condition', seedConditionId: 'paralyzed' },
  'hold-monster': { kind: 'save' },
  'insect-plague': { kind: 'save' },
  'mass-cure-wounds': { kind: 'heal' },
  // PHB 2024 L5 spells shipped schema-only; see docs/starter-pack-gaps.md.
  'animate-objects': { kind: 'skip', reason: 'controllable summoned objects; treats inanimate matter as creature, not modeled' },
  'awaken': { kind: 'skip', reason: '8-hour ritual transformation; sapience-granting primitive not modeled' },
  'arcane-hand': { kind: 'skip', reason: 'controllable spell-construct with action menu; differs from passive summon shape' },
  'commune': { kind: 'skip', reason: 'cleric ritual divination; DM-resolution primitive not modeled' },
  'commune-with-nature': { kind: 'skip', reason: 'ritual divination utility, narrative only' },
  'contact-other-plane': { kind: 'skip', reason: 'ritual divination with cumulative INT-save madness risk; DM-resolution primitive not modeled' },
  'creation': { kind: 'skip', reason: 'utility creation of vegetable / mineral matter; creation primitive not modeled' },
  'dispel-evil-and-good': { kind: 'skip', reason: 'aura + on-touch dispel + reaction-style banish; multi-mode spell not modeled' },
  'dream': { kind: 'skip', reason: 'narrative communication / nightmare; DM-resolution primitive not modeled' },
  'flame-strike': { kind: 'save' },
  'geas': { kind: 'skip', reason: '30-day forced compulsion + recurring psychic damage on disobedience; long-duration compulsion primitive not modeled' },
  'hallow': { kind: 'skip', reason: '24-hour ritual area ward with caster-chosen sub-effect; area-warding + choice primitive not modeled' },
  'legend-lore': { kind: 'skip', reason: 'ritual divination; DM-resolution primitive not modeled' },
  'mislead': { kind: 'skip', reason: 'illusion duplicate with sensory swap; multi-image illusion primitive not modeled' },
  'modify-memory': { kind: 'skip', reason: 'WIS save with narrative memory edit; DM-resolution + narrative primitive not modeled' },
  'passwall': { kind: 'skip', reason: 'creates a passage through solid surfaces; terrain primitive not modeled' },
  'planar-binding': { kind: 'skip', reason: 'cross-plane forced summon; planar travel primitive not modeled' },
  'raise-dead': { kind: 'skip', reason: 'has dedicated engine.plan.resurrect (not planCastSpell)' },
  'telepathic-bond': { kind: 'skip', reason: 'utility telepathic link, narrative only' },
  'reincarnate': { kind: 'skip', reason: 'has dedicated engine.plan.resurrect with newSpeciesId intent param (not planCastSpell). The random-species-table roll is consumer-side; the engine accepts the chosen species id.' },
  'scrying': { kind: 'skip', reason: 'has dedicated planScrying (5th-level slot + WIS save by target; on fail a Sensor entity is placed with the target as a follow anchor, on save the spell fizzles and slot is still consumed)' },
  'seeming': { kind: 'skip', reason: 'mass illusion swap; illusion primitive not modeled' },
  'telekinesis': { kind: 'skip', reason: 'forced creature/object movement; contested check + movement primitive not modeled' },
  'teleportation-circle': { kind: 'skip', reason: 'ritual long-range teleport; teleport-network primitive not modeled' },
  'tree-stride': { kind: 'skip', reason: 'tree-to-tree teleport per action; tree-anchored teleport primitive not modeled' },
  'wall-of-force': { kind: 'skip', reason: 'impenetrable barrier (no damage, no save); area-wall primitive not modeled' },
  'wall-of-stone': { kind: 'skip', reason: 'terrain creation (panels of stone); terrain primitive not modeled' },
  // PHB 2024 L6 spells with wired mechanics
  'chain-lightning': { kind: 'save' },
  'circle-of-death': { kind: 'save' },
  'disintegrate': { kind: 'save' },
  'eyebite': { kind: 'save' },
  'flesh-to-stone': { kind: 'save' },
  'harm': { kind: 'save' },
  'heal': { kind: 'heal' },
  'mass-suggestion': { kind: 'save' },
  'sunbeam': { kind: 'save' },
  // PHB 2024 L6 spells shipped schema-only; see docs/starter-pack-gaps.md.
  'blade-barrier': { kind: 'aura-damage', castingClass: 'cleric', slotLevel: 6, expectsSave: true, expectsDamage: true },
  'conjure-fey': { kind: 'skip', reason: 'CR-6+ fey summon with subclass-flavored statblock; advanced summon primitive not modeled' },
  'contingency': { kind: 'skip', reason: 'pre-stored conditional spell; conditional-cast primitive not modeled' },
  'create-undead': { kind: 'skip', reason: 'creates ghoul / ghast servitors; undead-creation primitive not modeled' },
  'instant-summons': { kind: 'skip', reason: 'utility (recall enchanted item); ritual storage primitive not modeled' },
  'find-the-path': { kind: 'skip', reason: 'concentration locator; sensor / scrying primitive not modeled' },
  'forbiddance': { kind: 'skip', reason: 'creature-type-keyed area ward; area-warding primitive not modeled' },
  'globe-of-invulnerability': { kind: 'skip', reason: '10-ft globe blocking 5th-or-lower-level spells; spell-filtering primitive not modeled' },
  'guards-and-wards': { kind: 'skip', reason: 'multi-effect building ward (illusion + lock + obscure + restrain); composite ward primitive not modeled' },
  'heroes-feast': { kind: 'buff', conditionId: 'heroes-feasted-active' },
  'magic-jar': { kind: 'skip', reason: 'soul transfer between caster and target; possession primitive not modeled' },
  'move-earth': { kind: 'zone' },
  'irresistible-dance': { kind: 'skip', reason: 'target dances and has disadvantage on rolls; dancing condition + recurring save not modeled' },
  'planar-ally': { kind: 'skip', reason: 'requests aid from an other-planar entity; DM-resolution + cross-plane summon not modeled' },
  'programmed-illusion': { kind: 'skip', reason: 'long-duration triggered illusion; illusion + trigger primitive not modeled' },
  'true-seeing': { kind: 'buff', conditionId: 'true-seeing-active' },
  'wall-of-ice': { kind: 'aura-damage', castingClass: 'wizard', slotLevel: 6, expectsSave: true, expectsDamage: true },
  'wall-of-thorns': { kind: 'aura-damage', castingClass: 'druid', slotLevel: 6, expectsSave: true, expectsDamage: true },
  'wind-walk': { kind: 'buff', conditionId: 'wind-walking-active' },
  'word-of-recall': { kind: 'skip', reason: 'instant teleport to a designated sanctuary; teleport-network primitive not modeled' },
  // PHB 2024 L7 spells with wired mechanics
  'conjure-celestial': { kind: 'summon' },
  'delayed-blast-fireball': { kind: 'save' },
  'finger-of-death': { kind: 'save' },
  'fire-storm': { kind: 'save' },
  'regenerate': { kind: 'heal' },
  // PHB 2024 L7 spells shipped schema-only; see docs/starter-pack-gaps.md.
  'divine-word': { kind: 'skip', reason: 'tiered effect by HP threshold (stunned / blinded / deafened / killed); HP-threshold effect not modeled' },
  'etherealness': { kind: 'skip', reason: 'enter the Ethereal Plane; cross-plane travel primitive not modeled' },
  'forcecage': { kind: 'skip', reason: '20-ft cage of force; multi-target movement-restriction + saves-vs-teleport not modeled' },
  'mirage-arcane': { kind: 'skip', reason: 'large-area illusion terrain; terrain + illusion primitive not modeled' },
  'magnificent-mansion': { kind: 'skip', reason: 'extradimensional dwelling utility; extradimensional space primitive not modeled' },
  'arcane-sword': { kind: 'skip', reason: 'controllable floating force-sword with bonus-action attacks; on-action attack primitive not modeled' },
  'plane-shift': { kind: 'skip', reason: 'planar travel; cross-plane travel primitive not modeled' },
  'prismatic-spray': { kind: 'skip', reason: 'random-damage-type cone with 8 effect rolls; multi-damage AoE + RNG-table primitive not modeled' },
  'project-image': { kind: 'skip', reason: 'long-range illusion duplicate; illusion + sensor primitive not modeled' },
  'resurrection': { kind: 'skip', reason: 'has dedicated engine.plan.resurrect (not planCastSpell)' },
  'reverse-gravity': { kind: 'zone' },
  'sequester': { kind: 'skip', reason: 'time-stop / invisibility on target until trigger; trigger-resume primitive not modeled' },
  'simulacrum': { kind: 'skip', reason: 'has dedicated engine.plan.simulacrum (not planCastSpell)' },
  'symbol': { kind: 'skip', reason: 'placed glyph with caster-chosen trigger and effect; trap mechanic + choice not modeled' },
  'teleport': { kind: 'skip', reason: 'long-range teleport with familiarity table; teleport-network primitive not modeled' },
  // PHB 2024 L8 spells with wired mechanics
  'dominate-monster': { kind: 'save' },
  'incendiary-cloud': { kind: 'save' },
  'sunburst': { kind: 'save' },
  'tsunami': { kind: 'save' },
  // PHB 2024 L8 spells shipped schema-only; see docs/starter-pack-gaps.md.
  'animal-shapes': { kind: 'skip', reason: 'mass beast transformation; multi-target transformation primitive not modeled' },
  'antimagic-field': { kind: 'skip', reason: 'spherical suppression of magic; magic-suppression primitive not modeled' },
  'antipathy-sympathy': { kind: 'skip', reason: 'long-term Charm or Frightened on creature-type proximity; type-conditional buff not modeled' },
  'clone': { kind: 'skip', reason: 'soul-transferring backup; resurrection-on-death primitive not modeled' },
  'control-weather': { kind: 'skip', reason: 'large-scale weather shaping; environment primitive not modeled' },
  'demiplane': { kind: 'skip', reason: 'extradimensional room; extradimensional space primitive not modeled' },
  'earthquake': { kind: 'zone' },
  'glibness': { kind: 'skip', reason: 'utility (auto-success on CHA checks + lie detection immunity); narrative buff' },
  'holy-aura': { kind: 'buff', conditionId: 'holy-aura-active' },
  'maze': { kind: 'skip', reason: 'banishes a target to a demiplane labyrinth; cross-plane single-target primitive not modeled' },
  'mind-blank': { kind: 'buff', conditionId: 'mind-blanked-active' },
  'power-word-stun': { kind: 'buff', conditionId: 'power-word-stunned-active' },
  // PHB 2024 L9 spells with wired mechanics
  'mass-heal': { kind: 'heal' },
  'weird': { kind: 'save' },
  // PHB 2024 L9 spells shipped schema-only; see docs/starter-pack-gaps.md.
  'astral-projection': { kind: 'skip', reason: 'projects party to the Astral Plane; cross-plane travel primitive not modeled' },
  'foresight': { kind: 'buff', conditionId: 'foresight-active' },
  'gate': { kind: 'skip', reason: 'creates portal to another plane and can call a named being; cross-plane summon primitive not modeled' },
  'imprisonment': { kind: 'skip', reason: 'six variants of long-term imprisonment; multi-mode utility primitive not modeled' },
  'meteor-swarm': { kind: 'skip', reason: 'four 40-ft spheres dealing 20d6 fire + 20d6 bludgeoning; multi-AoE multi-damage primitive not modeled' },
  'power-word-heal': { kind: 'skip', reason: 'full heal + remove charmed/frightened/paralyzed/stunned; healing surge + remove-multiple-conditions composite' },
  'power-word-kill': { kind: 'destroy' },
  'prismatic-wall': { kind: 'skip', reason: 'multi-layer wall with seven distinct damage / save effects; area-wall + multi-damage primitive not modeled' },
  'shapechange': { kind: 'skip', reason: 'has dedicated transformation handler patterns (Wild Shape, Polymorph); a Shapechange-specific planner is the obvious follow-up' },
  'storm-of-vengeance': { kind: 'skip', reason: 'multi-round growing storm with stage-keyed damage; recurring multi-stage area-effect primitive not modeled' },
  'time-stop': { kind: 'skip', reason: 'caster gains 1d4 + 1 extra turns; turn-economy primitive not modeled' },
  'true-polymorph': { kind: 'skip', reason: 'has dedicated engine.plan.polymorph (not planCastSpell)' },
  'true-resurrection': { kind: 'skip', reason: 'has dedicated engine.plan.resurrect (not planCastSpell)' },
  'wish': { kind: 'skip', reason: 'has dedicated engine.plan.wish (not planCastSpell)' },
};

const buildWizard = (preparedSpells: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Spell Tester',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level: 19, hitDiceRemaining: 19 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells,
  });

const buildCleric = (preparedSpells: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Spell Tester',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'cleric', level: 19, hitDiceRemaining: 19 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    hp: { current: 35, max: 35, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells,
  });

// Slice 583: Druid caster for aura-damage spells on the Druid spell
// list (entangle, flaming-sphere, wall-of-thorns). Mirrors the cleric
// build with the Druid class + WIS-keyed scores.
const buildDruid = (preparedSpells: string[]): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Spell Tester',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'druid', level: 19, hitDiceRemaining: 19 }],
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 35, max: 35, temp: 0 },
    featsTaken: ['savage-attacker'],
    preparedSpells,
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    featsTaken: ['savage-attacker'],
    armorClass: 8, // low so attack-roll spells reliably hit at a wizard's spell attack bonus
  });

const PACK = loadStarterPack();
const ALL_SPELL_IDS = PACK.spells.map((s) => s.id);

describe('spell coverage: each shipped spell emits the expected event kinds when cast', () => {
  it('every shipped spell has an entry in SPELL_EXPECTATIONS', () => {
    // The expectation table doubles as a check that the test wasn't
    // accidentally narrowed when new spells were added.
    const tableIds = new Set(Object.keys(SPELL_EXPECTATIONS));
    const missing = ALL_SPELL_IDS.filter((id) => !tableIds.has(id));
    expect(missing, `missing expectations for: ${missing.join(', ')}`).toEqual([]);
  });

  for (const spellId of ALL_SPELL_IDS) {
    const expectation = SPELL_EXPECTATIONS[spellId];
    if (expectation === undefined) continue;
    if (expectation.kind === 'skip') {
      it.skip(`${spellId}: ${expectation.reason}`, () => {});
      continue;
    }

    // Slice 583: aura-damage spells use a distinct flow — cast (which
    // emits only ConcentrationStarted) then call tickAura with a
    // target. Assertions check that the aura mechanic fires (SaveRolled
    // when configured; DamageApplied when the aura emits damage on
    // every tick — auto-damage zones like Cloud of Daggers, or
    // halfOnSuccess: true zones like Spirit Guardians).
    if (expectation.kind === 'aura-damage') {
      it(`${spellId}: cast emits ConcentrationStarted; tickAura emits the expected event chain`, () => {
        const spell = PACK.spells.find((s) => s.id === spellId)!;
        const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
        const caster = expectation.castingClass === 'cleric'
          ? buildCleric([spellId])
          : expectation.castingClass === 'druid'
            ? buildDruid([spellId])
            : buildWizard([spellId]);
        const target = buildTarget();
        let campaign = engine.createCampaign({ name: `aura-${spellId}` });
        campaign = commit(campaign, [
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ]);
        // Cast the spell (concentration; emits ConcentrationStarted).
        const castEvents = engine.plan.castSpell(campaign.state, {
          characterId: caster.id,
          spellId,
          slotLevel: expectation.slotLevel,
          targetIds: [caster.id],
        }).events as ReadonlyArray<Event>;
        const castTypes = castEvents.map((e) => e.type);
        expect(castTypes).toContain('SpellCastDeclared');
        expect(castTypes).toContain('SpellSlotConsumed');
        expect(castTypes).toContain('ConcentrationStarted');
        // Damage / save / condition events fire only on the tick, not
        // on cast.
        expect(castTypes).not.toContain('SaveRolled');
        expect(castTypes).not.toContain('DamageApplied');
        campaign = commit(campaign, castEvents);
        // Now tick the aura against the target.
        const tickEvents = engine.plan.tickAura(campaign.state, {
          casterId: caster.id,
          targetIds: [target.id],
        }).events as ReadonlyArray<Event>;
        const tickTypes = tickEvents.map((e) => e.type);
        if (expectation.expectsSave) {
          expect(tickTypes, `${spellId}: expected SaveRolled from tickAura`).toContain('SaveRolled');
        }
        if (expectation.expectsDamage) {
          expect(tickTypes, `${spellId}: expected DamageApplied from tickAura`).toContain('DamageApplied');
        }
      });
      continue;
    }

    it(`${spellId}: emits a ${expectation.kind} event chain`, () => {
      const spell = PACK.spells.find((s) => s.id === spellId)!;
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      // Use a cleric for heal / buff / remove-condition spells; wizard
      // for damage spells.
      const isClericalList = expectation.kind === 'heal'
        || expectation.kind === 'buff'
        || expectation.kind === 'remove-condition';
      const caster = isClericalList
        ? buildCleric([spellId])
        : buildWizard([spellId]);
      const t1 = buildTarget();
      const t2 = buildTarget();
      let campaign = engine.createCampaign({ name: `spell-${spellId}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t1 } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t2 } satisfies CharacterCreatedEvent,
      ]);
      // For remove-condition spells, seed the target with the condition
      // we expect to be removed.
      if (expectation.kind === 'remove-condition') {
        campaign = commit(campaign, [
          {
            id: eventId(),
            at: isoTimestamp(),
            type: 'ConditionApplied',
            targetId: t1.id,
            conditionId: expectation.seedConditionId,
          } as Extract<Event, { type: 'ConditionApplied' }>,
        ]);
      }
      // Magic Missile needs one target per dart; for other spells one or
      // two targets is fine.
      const targetIds = expectation.kind === 'auto-hit'
        ? Array.from({ length: expectation.minDarts }, () => t1.id)
        : [t1.id, t2.id];

      const casterChoice =
        (expectation.kind === 'attack'
          || expectation.kind === 'buff'
          || expectation.kind === 'save'
          || expectation.kind === 'trap')
          ? expectation.casterChoice
          : undefined;
      const events = engine.plan.castSpell(campaign.state, {
        characterId: caster.id,
        spellId,
        slotLevel: spell.level,
        targetIds,
        ...(casterChoice !== undefined ? { casterChoice } : {}),
        // Slice 495: zone spells require a target position (the AOE center).
        ...(expectation.kind === 'zone' ? { targetPosition: { x: 10, y: 10 } } : {}),
      }).events as ReadonlyArray<Event>;
      const types = events.map((e) => e.type);

      // Always: SpellCastDeclared.
      expect(types).toContain('SpellCastDeclared');
      // Leveled spells consume a slot.
      if (spell.level > 0) expect(types).toContain('SpellSlotConsumed');

      switch (expectation.kind) {
        case 'attack':
          expect(types, 'expected at least one AttackRolled').toContain('AttackRolled');
          break;
        case 'save':
          expect(types, 'expected at least one SaveRolled').toContain('SaveRolled');
          break;
        case 'heal':
          expect(types, 'expected at least one Healed').toContain('Healed');
          break;
        case 'auto-hit': {
          const damageEvents = events.filter((e): e is Extract<Event, { type: 'DamageApplied' }> => e.type === 'DamageApplied');
          expect(damageEvents.length, 'expected one DamageApplied per dart').toBeGreaterThanOrEqual(expectation.minDarts);
          break;
        }
        case 'buff': {
          const conditions = events.filter((e): e is Extract<Event, { type: 'ConditionApplied' }> => e.type === 'ConditionApplied');
          expect(conditions.length, 'expected at least one ConditionApplied').toBeGreaterThanOrEqual(1);
          expect(conditions.some((e) => e.conditionId === expectation.conditionId)).toBe(true);
          break;
        }
        case 'remove-condition': {
          const removals = events.filter((e): e is Extract<Event, { type: 'ConditionRemoved' }> => e.type === 'ConditionRemoved');
          expect(removals.length, 'expected at least one ConditionRemoved').toBeGreaterThanOrEqual(1);
          expect(removals.some((e) => e.conditionId === expectation.seedConditionId)).toBe(true);
          break;
        }
        case 'summon': {
          expect(types, 'expected CompanionSummoned').toContain('CompanionSummoned');
          break;
        }
        case 'temp-hp': {
          expect(types, 'expected TempHPGranted').toContain('TempHPGranted');
          break;
        }
        case 'trap': {
          expect(types, 'expected TrapArmed').toContain('TrapArmed');
          break;
        }
        case 'destroy': {
          // hp-threshold mechanic: the 50-HP dummy target is at or below
          // Power Word Kill's 100-HP threshold, so the destroy arm fires.
          expect(types, 'expected CreatureDestroyed').toContain('CreatureDestroyed');
          break;
        }
        case 'zone': {
          // Slice 495: a zone spell emits ConcentrationStarted carrying the
          // positioned-AOE metadata (shape + size + center).
          expect(types, 'expected ConcentrationStarted').toContain('ConcentrationStarted');
          const conc = events.find(
            (e): e is Extract<Event, { type: 'ConcentrationStarted' }> => e.type === 'ConcentrationStarted',
          );
          expect(conc?.zone, 'expected a zone on ConcentrationStarted').toBeDefined();
          expect(conc?.zone?.center).toEqual({ x: 10, y: 10 });
          break;
        }
        case 'create-item': {
          // Slice 499: an item-creation spell mints N ItemAcquired events
          // into the caster's inventory (Goodberry: 10 berries).
          const acquired = events.filter(
            (e): e is Extract<Event, { type: 'ItemAcquired' }> => e.type === 'ItemAcquired',
          );
          expect(acquired.length, `expected at least ${expectation.minItems} ItemAcquired`).toBeGreaterThanOrEqual(expectation.minItems);
          break;
        }
        case 'hp-pool-knockout': {
          // Sleep needs low-HP targets to knock out — Dummy's 50 HP exceeds
          // the typical 5d8 pool average. The smoke test asserts that at
          // least one creature in range gets the configured condition for
          // a pool that *does* cover one of them (so we use a targeted
          // wounded subject seeded directly).
          // Targets in this test default to 50 HP, which 5d8 (avg 22.5)
          // can't knock out. We re-cast against a target with 4 HP to
          // confirm the planner emits ConditionApplied when the pool fits.
          const lowTarget = CharacterSchema.parse({
            id: newCharacterId(),
            name: 'Sleepy',
            speciesId: 'human',
            backgroundId: 'soldier',
            classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
            abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
            hp: { current: 4, max: 4, temp: 0 },
            featsTaken: ['savage-attacker'],
          });
          let c2 = engine.createCampaign({ name: `spell-${spellId}-low` });
          c2 = commit(c2, [
            { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
            { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: lowTarget } satisfies CharacterCreatedEvent,
          ]);
          const lowEvents = engine.plan.castSpell(c2.state, {
            characterId: caster.id,
            spellId,
            slotLevel: spell.level,
            targetIds: [lowTarget.id],
          }).events;
          const applied = lowEvents.filter(
            (e): e is Extract<Event, { type: 'ConditionApplied' }> => e.type === 'ConditionApplied',
          );
          expect(applied.length, 'expected the low-HP target to be knocked out').toBeGreaterThanOrEqual(1);
          break;
        }
      }
    });
  }
});
