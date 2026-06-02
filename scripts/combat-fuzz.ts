// Combat fuzz simulator (slice 585) — drives random L1 1v1 battles
// to completion and writes markdown transcripts to disk for human
// review. Surfaces emergent-interaction bugs the unit + golden
// tests don't cover (condition interactions mid-cast, reaction
// windows in the wrong slot, action-economy edge cases, etc.).
//
// Run: npx tsx scripts/combat-fuzz.ts [--count N] [--seed S] [--out DIR]
//
// Each battle:
//   1. Builds two random L1 characters (class × species × background
//      × equipment, with class-appropriate spell selections).
//   2. Creates an encounter, rolls initiative, starts combat.
//   3. Loop: on each turn pick an action via a class-aware policy,
//      attempt it; if it throws, fall back to a simpler action.
//      Advance the turn.
//   4. Stops when one combatant drops to ≤ 0 HP OR a round cap
//      elapses (default 20 rounds).
//   5. Emits a markdown transcript via formatTranscript().

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createEngine,
  loadStarterPack,
  seededRNG,
  newCharacterId,
  newItemInstanceId,
  newEventId,
  CharacterSchema,
  type Character,
  type ContentPack,
} from '../src/index.js';
import { commit, type Campaign } from '../src/engine/commit.js';
import { resolveContent } from '../src/content/pack.js';
import { performIntent } from '../src/engine/conveniences.js';
import { formatTranscript } from '../tests/transcript.js';
import type { ItemInstance } from '../src/schemas/runtime/item-instance.js';
import type { Event } from '../src/schemas/events/index.js';

const MAX_ROUNDS = 20;
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
const SPECIES = ['human', 'elf', 'dwarf', 'halfling', 'tiefling', 'dragonborn', 'gnome', 'goliath', 'orc'] as const;
const BACKGROUNDS = ['acolyte', 'criminal', 'sage', 'soldier'] as const;
// Slice 593: max character level the fuzz tool can build to. The
// engine's level-up planner supports L1-L20 but the fuzz's level-up
// helper auto-resolves only the choices needed to reach this cap
// (subclass selection at L3 for half the classes; ASI/feat at L4
// auto-picks an ability; no further choices L2-L5). Going beyond
// L5 would need richer choice auto-resolution.
const FUZZ_MAX_LEVEL = 5;

type AbilityScore = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
type Pack = ContentPack;

// Per-class build spec: which ability gets the 15, what weapon / armor
// they start with, what cantrips + L1 spells they prepare, what
// resources they need (Rage uses, Bardic Inspiration die count, etc.).
interface ClassBuild {
  readonly classId: string;
  readonly primary: AbilityScore;
  readonly secondary: AbilityScore;
  readonly weaponId: string;
  readonly armorId?: string;
  // Slice 591: equip a shield (+2 AC) for classes that are proficient
  // with shields AND wield a one-handed primary weapon.
  readonly useShield?: boolean;
  readonly cantrips: ReadonlyArray<string>;
  readonly l1Spells: ReadonlyArray<string>;
  readonly resources?: ReadonlyArray<{ resourceId: string; current: number; max: number }>;
}

const CLASS_BUILDS: ReadonlyArray<ClassBuild> = [
  {
    classId: 'barbarian',
    primary: 'STR', secondary: 'CON',
    weaponId: 'greataxe', armorId: 'leather-armor',
    cantrips: [], l1Spells: [],
    resources: [{ resourceId: 'rage', current: 2, max: 2 }],
  },
  {
    classId: 'bard',
    primary: 'CHA', secondary: 'DEX',
    weaponId: 'rapier', armorId: 'leather-armor',
    cantrips: ['vicious-mockery'],
    l1Spells: ['cure-wounds', 'healing-word', 'bless'],
    resources: [{ resourceId: 'bardic-inspiration', current: 4, max: 4 }],
  },
  {
    classId: 'cleric',
    primary: 'WIS', secondary: 'STR',
    weaponId: 'mace', armorId: 'chain-shirt',
    useShield: true,
    cantrips: ['sacred-flame'],
    l1Spells: ['cure-wounds', 'guiding-bolt', 'bless'],
  },
  {
    classId: 'druid',
    primary: 'WIS', secondary: 'CON',
    weaponId: 'scimitar', armorId: 'leather-armor',
    cantrips: ['produce-flame'],
    l1Spells: ['cure-wounds', 'entangle', 'faerie-fire'],
  },
  {
    classId: 'fighter',
    primary: 'STR', secondary: 'CON',
    weaponId: 'longsword', armorId: 'chain-mail',
    useShield: true,
    cantrips: [], l1Spells: [],
    resources: [{ resourceId: 'second-wind', current: 2, max: 2 }],
  },
  {
    classId: 'monk',
    primary: 'DEX', secondary: 'WIS',
    weaponId: 'shortsword',
    cantrips: [], l1Spells: [],
  },
  {
    classId: 'paladin',
    primary: 'STR', secondary: 'CHA',
    weaponId: 'longsword', armorId: 'chain-mail',
    useShield: true,
    cantrips: [], l1Spells: ['divine-favor', 'searing-smite'],
    resources: [{ resourceId: 'lay-on-hands', current: 5, max: 5 }],
  },
  {
    classId: 'ranger',
    primary: 'DEX', secondary: 'WIS',
    weaponId: 'longbow', armorId: 'studded-leather',
    cantrips: [],
    l1Spells: ['hunters-mark', 'cure-wounds'],
    resources: [{ resourceId: 'hunters-mark', current: 2, max: 2 }],
  },
  {
    classId: 'rogue',
    primary: 'DEX', secondary: 'INT',
    weaponId: 'shortsword', armorId: 'leather-armor',
    cantrips: [], l1Spells: [],
  },
  {
    classId: 'sorcerer',
    primary: 'CHA', secondary: 'CON',
    weaponId: 'dagger',
    cantrips: ['fire-bolt', 'ray-of-frost'],
    l1Spells: ['magic-missile', 'shield', 'mage-armor'],
    resources: [{ resourceId: 'innate-sorcery', current: 2, max: 2 }],
  },
  {
    classId: 'warlock',
    primary: 'CHA', secondary: 'CON',
    weaponId: 'dagger', armorId: 'leather-armor',
    cantrips: ['eldritch-blast'],
    l1Spells: ['hex'],
  },
  {
    classId: 'wizard',
    primary: 'INT', secondary: 'DEX',
    weaponId: 'quarterstaff',
    cantrips: ['fire-bolt'],
    l1Spells: ['magic-missile', 'mage-armor', 'shield'],
  },
];

const pickRandom = <T>(arr: ReadonlyArray<T>, r: number): T => arr[Math.floor(r * arr.length)]!;

// Distribute STANDARD_ARRAY across abilities, prioritizing primary +
// secondary. Remaining 4 abilities get the lower values in declared
// order.
const assignAbilityScores = (build: ClassBuild): Record<AbilityScore, number> => {
  const all: AbilityScore[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const others = all.filter((a) => a !== build.primary && a !== build.secondary);
  const scores: Record<AbilityScore, number> = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  scores[build.primary] = STANDARD_ARRAY[0]!;
  scores[build.secondary] = STANDARD_ARRAY[1]!;
  others.forEach((a, i) => {
    scores[a] = STANDARD_ARRAY[2 + i] ?? 10;
  });
  return scores;
};

interface BuiltCharacter {
  readonly character: Character;
  readonly weaponInstance: ItemInstance;
  readonly armorInstance?: ItemInstance;
  // Slice 591: shield item if build.useShield is set. Equipped to
  // character.equipped.shield; +2 AC contribution flows through the
  // existing AC derive.
  readonly shieldInstance?: ItemInstance;
  // Slice 591: a single healing potion in the inventory. The policy's
  // step 1 (low-HP self-heal) drinks it when no other heal path exists.
  readonly potionInstance: ItemInstance;
  readonly build: ClassBuild;
}

// Slice 588: at L1 the proficiency bonus is +2 and class level is 1.
// Species GrantResource declarations use simple formulas (`profBonus`,
// `level`) or literal numbers; we evaluate against these L1 values.
const FUZZ_L1_PROF_BONUS = 2;
const FUZZ_L1_LEVEL = 1;

// Slice 589: classes that get Weapon Mastery at L1 per PHB 2024.
// Other classes can still equip a mastery-capable weapon but the
// engine refuses any planWeaponMastery call (canUseWeaponMastery
// gate at src/derive/weapon-mastery.ts).
const MASTERY_CLASSES = new Set(['fighter', 'barbarian', 'paladin', 'ranger', 'rogue']);

// Slice 589: per-weapon mastery property in the fuzz weapon list.
// Drives the on-hit mastery-fire policy hook. Masteries that need a
// second target (Cleave), an offhand weapon (Nick), or extra plumbing
// the fuzz doesn't model (Push depends on combatant positions) are
// excluded so the planner doesn't no-op silently.
const WEAPON_MASTERY: Readonly<Record<string, 'Sap' | 'Vex' | 'Slow' | 'Topple'>> = {
  longsword: 'Sap',
  shortsword: 'Vex',
  rapier: 'Vex',
  longbow: 'Slow',
};

// Slice 588: classes in CLASS_BUILDS that get 2 L1 slots (full casters).
// The half-casters (paladin, ranger) get zero slots at L1 in RAW; we
// don't track those here because the CLASS_BUILDS table doesn't put a
// slot-costing spell in their l1Spells list (Ranger uses Hunter's Mark
// via the free-cast resource path; Paladin's self-heal is Lay on Hands,
// not a slot spell).
const FULL_CASTER_L1_SLOTS = 2;
const FULL_CASTER_CLASSES = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);

const hasUnusedL1Slot = (character: Character): boolean => {
  if (!FULL_CASTER_CLASSES.has(character.classes[0]!.classId)) return false;
  const used = character.spellSlotsUsed['1'] ?? 0;
  return used < FULL_CASTER_L1_SLOTS;
};

// Slice 592: check that the defender can legally react with Shield --
// wizard or sorcerer with `shield` prepared, an L1 slot remaining, and
// reaction not yet used this round. Returns true if all gates pass.
const tryShieldReaction = (
  _engine: unknown,
  campaign: Campaign,
  defender: Combatant,
  _hit: { id: string },
): boolean => {
  const defChar = campaign.state.characters[defender.built.character.id]!;
  const classId = defChar.classes[0]!.classId;
  if (classId !== 'wizard' && classId !== 'sorcerer') return false;
  if (!defChar.preparedSpells.includes('shield')) return false;
  if (!hasUnusedL1Slot(defChar)) return false;
  const encounter = Object.values(campaign.state.encounters)[0];
  if (!encounter) return false;
  const cb = encounter.combatants.find((x) => x.combatantId === defChar.id);
  if (!cb) return false;
  if (cb.turnUsage.reactionUsedThisRound === true) return false;
  return true;
};

// Slice 588: evaluate a GrantResource `max` formula at L1. Handles the
// shapes the SRD species traits actually use (literal numbers,
// `profBonus`, `level`); anything else falls back to 1 so the resource
// at least exists (no silent zero-grant).
const evalL1ResourceMax = (max: number | { kind: string; [k: string]: unknown }): number => {
  if (typeof max === 'number') return max;
  if (max.kind === 'profBonus') return FUZZ_L1_PROF_BONUS;
  if (max.kind === 'level') return FUZZ_L1_LEVEL;
  return 1;
};

const speciesGrantedResources = (
  pack: Pack,
  speciesId: string,
): ReadonlyArray<{ resourceId: string; current: number; max: number }> => {
  const species = pack.species?.find((s) => s.id === speciesId);
  if (species === undefined) return [];
  const out: Array<{ resourceId: string; current: number; max: number }> = [];
  for (const trait of species.traits) {
    if (trait.kind !== 'GrantResource') continue;
    const max = evalL1ResourceMax(trait.max as number | { kind: string; [k: string]: unknown });
    out.push({ resourceId: trait.resourceId, current: max, max });
  }
  return out;
};

// Slice 596: low-CR monsters the fuzz can spawn as L1-appropriate
// opponents. Each entry maps a statblock id to a natural-weapon item
// the engine has wired so the monster can attack via the standard
// plan.attack path.
// Slice 597: expanded from 1 → 10 monsters covering CR 1/8 → CR 1.
// Each monster's traits (Pack Tactics, Bloodied Fury, Magic Resistance,
// Web, Knock Prone onHit, poison riders, etc.) fire passively via the
// engine's effect-stack derivation when the monster attacks.
const MONSTER_OPTIONS: ReadonlyArray<{ id: string; weaponId: string; classBuild: ClassBuild }> = [
  { id: 'wolf', weaponId: 'wolf-bite',
    classBuild: { classId: 'companion', primary: 'STR', secondary: 'DEX', weaponId: 'wolf-bite', cantrips: [], l1Spells: [] } },
  { id: 'venomous-snake', weaponId: 'venomous-snake-bite',
    classBuild: { classId: 'companion', primary: 'DEX', secondary: 'CON', weaponId: 'venomous-snake-bite', cantrips: [], l1Spells: [] } },
  { id: 'giant-centipede', weaponId: 'giant-centipede-bite',
    classBuild: { classId: 'companion', primary: 'DEX', secondary: 'CON', weaponId: 'giant-centipede-bite', cantrips: [], l1Spells: [] } },
  { id: 'imp', weaponId: 'imp-sting',
    classBuild: { classId: 'companion', primary: 'DEX', secondary: 'INT', weaponId: 'imp-sting', cantrips: [], l1Spells: [] } },
  { id: 'boar', weaponId: 'boar-gore',
    classBuild: { classId: 'companion', primary: 'STR', secondary: 'CON', weaponId: 'boar-gore', cantrips: [], l1Spells: [] } },
  { id: 'mastiff', weaponId: 'mastiff-bite',
    classBuild: { classId: 'companion', primary: 'STR', secondary: 'DEX', weaponId: 'mastiff-bite', cantrips: [], l1Spells: [] } },
  { id: 'worg', weaponId: 'worg-bite',
    classBuild: { classId: 'companion', primary: 'STR', secondary: 'CON', weaponId: 'worg-bite', cantrips: [], l1Spells: [] } },
  { id: 'pseudodragon', weaponId: 'pseudodragon-bite',
    classBuild: { classId: 'companion', primary: 'DEX', secondary: 'CHA', weaponId: 'pseudodragon-bite', cantrips: [], l1Spells: [] } },
  { id: 'giant-spider', weaponId: 'giant-spider-bite',
    classBuild: { classId: 'companion', primary: 'DEX', secondary: 'STR', weaponId: 'giant-spider-bite', cantrips: [], l1Spells: [] } },
  { id: 'cockatrice', weaponId: 'cockatrice-bite',
    classBuild: { classId: 'companion', primary: 'DEX', secondary: 'CON', weaponId: 'cockatrice-bite', cantrips: [], l1Spells: [] } },
];

// Build a Character snapshot from a monster statblock + equip the
// natural weapon. Mirrors fireSpawnCreature in
// src/engine/triggers/dispatch.ts (the canonical engine path for
// instantiating a monster mid-combat).
const buildMonster = (name: string, pack: Pack, rngFloat: () => number): BuiltCharacter => {
  const choice = pickRandom(MONSTER_OPTIONS, rngFloat());
  const statblock = pack.monsters?.find((m) => m.id === choice.id);
  if (statblock === undefined) {
    throw new Error(`Monster ${choice.id} not in pack`);
  }
  const weaponInstance: ItemInstance = {
    id: newItemInstanceId(),
    definitionId: choice.weaponId ?? 'dagger',
    quantity: 1,
    attuned: false,
    identifiedByCharacterIds: [],
  };
  const potionInstance: ItemInstance = {
    id: newItemInstanceId(),
    definitionId: 'healing-potion',
    quantity: 1,
    attuned: false,
    identifiedByCharacterIds: [],
  };
  const character = CharacterSchema.parse({
    id: newCharacterId(),
    name,
    kind: 'creature',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: statblock.id,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: statblock.abilityScores,
    hp: { current: statblock.hp.average, max: statblock.hp.average, temp: 0 },
    armorClass: statblock.ac,
    speedFeet: statblock.speed.walk ?? 30,
    inventory: [weaponInstance.id, potionInstance.id],
    equipped: { mainHand: weaponInstance.id, attuned: [] },
    knownSpells: [],
    preparedSpells: [],
    resources: [],
  });
  return { character, weaponInstance, potionInstance, build: choice.classBuild };
};

const buildL1 = (name: string, rngFloat: () => number, pack: Pack): BuiltCharacter => {
  const build = pickRandom(CLASS_BUILDS, rngFloat());
  const speciesId = pickRandom(SPECIES, rngFloat());
  const backgroundId = pickRandom(BACKGROUNDS, rngFloat());
  const abilities = assignAbilityScores(build);
  // L1 HP = max(hitDie) + CON mod. Approximate hitDie from class
  // (d12 / d10 / d8 / d6) by lookup.
  const hitDieByClass: Readonly<Record<string, number>> = {
    barbarian: 12, fighter: 10, paladin: 10, ranger: 10,
    bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
    sorcerer: 6, wizard: 6,
  };
  const conMod = Math.floor((abilities.CON - 10) / 2);
  const hpMax = (hitDieByClass[build.classId] ?? 8) + conMod;

  const weaponInstance: ItemInstance = {
    id: newItemInstanceId(),
    definitionId: build.weaponId,
    quantity: 1,
    attuned: false,
    identifiedByCharacterIds: [],
  };
  const armorInstance: ItemInstance | undefined = build.armorId !== undefined
    ? {
      id: newItemInstanceId(),
      definitionId: build.armorId,
      quantity: 1,
      attuned: false,
      identifiedByCharacterIds: [],
    }
    : undefined;
  const shieldInstance: ItemInstance | undefined = build.useShield === true
    ? {
      id: newItemInstanceId(),
      definitionId: 'shield',
      quantity: 1,
      attuned: false,
      identifiedByCharacterIds: [],
    }
    : undefined;
  // Slice 591: a single healing potion. Drinking heals 2d4+2 HP via
  // the engine's onConsume pipeline; the fuzz tool gives every
  // combatant one to exercise the consume-item flow as a backstop
  // self-heal.
  const potionInstance: ItemInstance = {
    id: newItemInstanceId(),
    definitionId: 'healing-potion',
    quantity: 1,
    attuned: false,
    identifiedByCharacterIds: [],
  };

  const character = CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId,
    backgroundId,
    classes: [{ classId: build.classId, level: 1, hitDiceRemaining: 1 }],
    abilityScores: abilities,
    hp: { current: hpMax, max: hpMax, temp: 0 },
    inventory: [
      weaponInstance.id,
      ...(armorInstance ? [armorInstance.id] : []),
      ...(shieldInstance ? [shieldInstance.id] : []),
      potionInstance.id,
    ],
    equipped: {
      mainHand: weaponInstance.id,
      ...(armorInstance ? { armor: armorInstance.id } : {}),
      ...(shieldInstance ? { shield: shieldInstance.id } : {}),
      attuned: [],
    },
    knownSpells: [...build.cantrips, ...build.l1Spells],
    preparedSpells: [...build.cantrips, ...build.l1Spells],
    // Slice 588: merge class-granted (Rage, Second Wind, ...) with
    // species-granted (Orc Relentless Endurance, Dwarven Stonecunning,
    // Dragonborn Breath Weapon, Goliath Giant Ancestry) so species
    // traits gated on resource availability actually fire.
    resources: [...(build.resources ?? []), ...speciesGrantedResources(pack, speciesId)],
    // Slice 589: pre-master the wielded weapon for the 5 Weapon Mastery
    // classes (Fighter / Barbarian / Paladin / Ranger / Rogue). At L1 the
    // mastery budget is 3 for Fighter and 2 for the others, but the fuzz
    // build only equips a single weapon so a single mastery suffices.
    // Non-mastery classes get an empty list (engine guard refuses use).
    weaponMasteries: MASTERY_CLASSES.has(build.classId) ? [build.weaponId] : [],
  });

  return { character, weaponInstance, armorInstance, shieldInstance, potionInstance, build };
};

interface Combatant {
  readonly built: BuiltCharacter;
  // Tracks whether the first-turn BA buff (Rage, Hunter's Mark, Hex,
  // Divine Favor) has been attempted, to avoid retrying every turn.
  firstTurnBuffTried?: boolean;
  // Slice 590: tracks whether the first-turn Action buff (Bless,
  // Mage Armor, Faerie Fire) has been attempted. Separate from BA
  // since Action buffs replace the turn's damaging cantrip / attack.
  firstTurnActionBuffTried?: boolean;
  // Tracks whether the once-per-LR Innate Sorcery / Lay on Hands
  // self-heal has been used, so the policy doesn't loop on it.
  innateSorceryActivated?: boolean;
  // Slice 589: when set, the next pickIntent returns a WeaponMastery
  // intent (Sap / Vex / Slow / Topple) keyed to a previously-landed
  // attack. The runBattle loop populates this after each AttackRolled
  // with hit=true, and pickIntent clears it after returning the intent.
  pendingMasteryFire?: { mastery: string; weaponInstanceId: string; targetId: string };
}

// Action policy: returns the next intent for the active combatant,
// given the campaign state and the opponent. Returns null when the
// combatant has nothing to do this turn (skip to TurnEnded). Always
// safe to call multiple times per turn: action first, then bonus
// action, then nothing.
const pickIntent = (
  state: Campaign['state'],
  active: Combatant,
  opponent: Combatant,
): { readonly type: string } & Record<string, unknown> | null => {
  const c = state.characters[active.built.character.id]!;
  const oppId = opponent.built.character.id;
  const oppC = state.characters[oppId];
  if (!oppC || oppC.hp.current <= 0) return null;
  if (c.hp.current <= 0) return null;
  const encounter = state.encounters[state.activeEncounterId!]!;
  const cb = encounter.combatants.find((x) => x.combatantId === c.id)!;
  const build = active.built.build;
  const classId = build.classId;

  const lowHp = c.hp.current < c.hp.max / 2;

  // 1. Self-heal when low (BA or Action). Tried first since it
  // breaks the attack loop on the brink.
  if (lowHp) {
    if (classId === 'paladin' && !cb.turnUsage.bonusActionUsed) {
      const pool = c.resources.find((r) => r.resourceId === 'lay-on-hands');
      if (pool && pool.current >= 3) {
        return { type: 'LayOnHands', paladinId: c.id, targetId: c.id, mode: 'heal', amount: Math.min(pool.current, 5) };
      }
    }
    if (classId === 'fighter' && !cb.turnUsage.bonusActionUsed) {
      const sw = c.resources.find((r) => r.resourceId === 'second-wind');
      if (sw && sw.current > 0) {
        return { type: 'SecondWind', fighterId: c.id };
      }
    }
    if ((classId === 'cleric' || classId === 'druid' || classId === 'bard') && !cb.turnUsage.actionUsed) {
      // Cast cure-wounds on self. Slice 588: only when an L1 slot is
      // actually available; otherwise fall through so the turn doesn't
      // burn on a guaranteed throw (pre-slice the slot-exhausted druid
      // went silent for 4 rounds in fuzz seed 210).
      if (c.preparedSpells.includes('cure-wounds') && hasUnusedL1Slot(c)) {
        return { type: 'CastSpell', characterId: c.id, spellId: 'cure-wounds', slotLevel: 1, targetIds: [c.id] };
      }
    }
    // Slice 591: every combatant has a single healing potion as a
    // backstop. Drink it (Bonus Action per PHB 2024 self-drink rule)
    // when none of the class-specific heals matched above. Consumes
    // the bonus action; the engine's consume-item planner emits Heal +
    // ItemConsumed events.
    if (!cb.turnUsage.bonusActionUsed) {
      const potion = state.itemInstances[active.built.potionInstance.id];
      if (potion !== undefined && potion.quantity > 0) {
        return {
          type: 'ConsumeItem',
          characterId: c.id,
          instanceId: active.built.potionInstance.id,
          targetId: c.id,
        };
      }
    }
  }

  // 2. First-turn buff (BA).
  if (!active.firstTurnBuffTried && !cb.turnUsage.bonusActionUsed) {
    active.firstTurnBuffTried = true;
    if (classId === 'barbarian') {
      const rage = c.resources.find((r) => r.resourceId === 'rage');
      if (rage && rage.current > 0) {
        return { type: 'Rage', barbarianId: c.id };
      }
    }
    if (classId === 'ranger') {
      const huntersMark = c.resources.find((r) => r.resourceId === 'hunters-mark');
      if (huntersMark && huntersMark.current > 0) {
        return { type: 'CastSpell', characterId: c.id, spellId: 'hunters-mark', slotLevel: 1, targetIds: [oppId], useFreeCast: true };
      }
    }
    if (classId === 'warlock' && c.preparedSpells.includes('hex')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'hex', slotLevel: 1, targetIds: [oppId], casterChoice: { kind: 'variant', value: 'STR' } };
    }
    // Slice 590: Paladin Divine Favor (BA, 1st-level slot, self-target,
    // concentration). +1d4 radiant damage on weapon hits for 1 minute —
    // turn-1 buff that pairs with the longsword Sap mastery rider.
    if (classId === 'paladin' && c.preparedSpells.includes('divine-favor') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'divine-favor', slotLevel: 1, targetIds: [c.id] };
    }
    // Sorcerer Innate Sorcery is intentionally allowlisted out of
    // the performIntent dispatch (see tests/audit/planner-wiring.test.ts —
    // "Special-cast / placed-entity / multi-arg spell planners"
    // category). The fuzz tool routes everything via performIntent so
    // the policy skips Innate Sorcery; sorcerers just cast Fire Bolt
    // every turn. A future fuzz revision can route allowlisted
    // planners through their direct engine.plan.X calls.
  }

  // Slice 590: first-turn Action buff. Replaces the turn's damaging
  // cantrip / attack with a buff cast. Fires once per battle (gated by
  // firstTurnActionBuffTried) so the bearer eventually deals damage.
  // Each branch picks the buff most useful in a 1v1: Bless self-target
  // for Cleric / Bard (+1d4 attack + saves, concentration); Mage Armor
  // self-target for Wizard / Sorcerer (no concentration, 8 hr AC 13+DEX);
  // Faerie Fire on opponent for Druid (advantage on attacks vs target,
  // concentration, replaces Entangle which is positional).
  if (!active.firstTurnActionBuffTried && !cb.turnUsage.actionUsed) {
    active.firstTurnActionBuffTried = true;
    if (classId === 'paladin') {
      // Paladin's BA branch above already handles Divine Favor; the
      // Action slot stays available for an attack.
    } else if ((classId === 'cleric' || classId === 'bard') && c.preparedSpells.includes('bless') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'bless', slotLevel: 1, targetIds: [c.id] };
    } else if ((classId === 'wizard' || classId === 'sorcerer') && c.preparedSpells.includes('mage-armor') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'mage-armor', slotLevel: 1, targetIds: [c.id] };
    } else if (classId === 'druid' && c.preparedSpells.includes('faerie-fire') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'faerie-fire', slotLevel: 1, targetIds: [oppId] };
    }
  }

  // Slice 589: between buff and action, fire a queued WeaponMastery
  // intent if the last attack landed. Fires as a free rider on the same
  // attack-action (no extra action-economy spend); the engine's
  // canUseWeaponMastery gate at src/derive/weapon-mastery.ts has
  // already validated the weapon-character-mastery triple at build
  // time.
  if (active.pendingMasteryFire !== undefined) {
    const fire = active.pendingMasteryFire;
    delete active.pendingMasteryFire;
    return {
      type: 'WeaponMastery',
      mastery: fire.mastery,
      attackerId: c.id,
      targetId: fire.targetId,
      weaponInstanceId: fire.weaponInstanceId,
    };
  }

  // 3. Action: cast a damaging cantrip if caster, else attack.
  if (!cb.turnUsage.actionUsed) {
    if (build.cantrips.includes('eldritch-blast')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'eldritch-blast', slotLevel: 0, targetIds: [oppId] };
    }
    if (build.cantrips.includes('fire-bolt')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [oppId] };
    }
    if (build.cantrips.includes('sacred-flame')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'sacred-flame', slotLevel: 0, targetIds: [oppId] };
    }
    if (build.cantrips.includes('vicious-mockery')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'vicious-mockery', slotLevel: 0, targetIds: [oppId] };
    }
    if (build.cantrips.includes('produce-flame')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'produce-flame', slotLevel: 0, targetIds: [oppId] };
    }
    // Martial fallback: attack with main-hand weapon.
    return {
      type: 'Attack',
      attackerId: c.id,
      targetId: oppId,
      weaponInstanceId: active.built.weaponInstance.id,
    };
  }

  return null;
};

// Slice 593: walk the engine's level-up planner from L1 up to the
// target level. Auto-resolves any ChoiceRequired event by picking the
// first listed option, which covers subclass selection at L3 (Fighter
// Champion, Paladin Devotion, etc.) + ASI/feat at L4 (the first option
// in each list). Returns the new campaign with the leveled-up
// character. Throws (and the caller falls back to L1) if level-up
// fails at any rung.
// Auto-resolve pending choices for a character by picking the first
// `oneOf` option ids per choice. Safe-bounded to 20 iterations.
const drainPendingChoices = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  characterId: string,
): Campaign => {
  let camp = campaign;
  for (let safety = 0; safety < 40; safety += 1) {
    const pending = Object.values(camp.state.pendingChoices).find((p) => p.forCharacterId === characterId && p.resolution === undefined);
    if (!pending) break;
    const pickCount = pending.oneOf ?? 1;
    const selected = pending.options.slice(0, pickCount).map((o) => o.id);
    if (selected.length === 0) break;
    try {
      const choiceResult = engine.plan.resolveChoice(camp.state, {
        characterId,
        choiceId: pending.id,
        selectedOptionIds: selected,
      });
      camp = commit(camp, choiceResult.events);
    } catch {
      break;
    }
  }
  return camp;
};

const levelUpTo = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  characterId: string,
  classId: string,
  targetLevel: number,
): Campaign => {
  // Slice 593: a freshly-created character may already have pending
  // background / species / origin-feat choices (e.g. wizard sage's
  // Magic Initiate cantrip pick). Drain those first or the L2 plan
  // throws "Character has unresolved choices from a previous level-up."
  let camp = drainPendingChoices(engine, campaign, characterId);
  for (let lvl = 2; lvl <= targetLevel; lvl += 1) {
    const result = engine.plan.levelUp(camp.state, { characterId, classId, hpStrategy: 'average' });
    camp = commit(camp, result.events);
    camp = drainPendingChoices(engine, camp, characterId);
  }
  return camp;
};

const runBattle = (seed: number, pack: Pack, level: number, rest: 'none' | 'short' | 'long' = 'none', teamSize = 1, vs: 'pc' | 'monster' = 'pc'): { events: ReadonlyArray<Event>; finalState: Campaign['state']; winner: string | null; rounds: number } => {
  const engine = createEngine({ contentPacks: [pack], rng: seededRNG(seed) });
  // Per-battle RNG used for character generation; separate from the
  // engine RNG so the build doesn't drift from the action seed.
  let cursor = seed * 13 + 7;
  const rngFloat = (): number => {
    cursor = (cursor * 9301 + 49297) % 233280;
    return cursor / 233280;
  };

  // Slice 595: build teamSize PCs per side. Team A names suffixed -1, -2;
  // Team B same. For teamSize=1 (default 1v1), names are bare "Aria" / "Bran".
  const teamNames = (base: 'Aria' | 'Bran'): string[] =>
    teamSize === 1 ? [base] : Array.from({ length: teamSize }, (_, i) => `${base}-${i + 1}`);
  const teamA: BuiltCharacter[] = teamNames('Aria').map((n) => buildL1(n, rngFloat, pack));
  // Slice 596: opposing team is one or more monsters when vs='monster',
  // mirroring the PC team's size for symmetric encounters.
  const teamB: BuiltCharacter[] = vs === 'monster'
    ? teamNames('Beast').map((n) => buildMonster(n, pack, rngFloat))
    : teamNames('Bran').map((n) => buildL1(n, rngFloat, pack));

  const now = (offsetSec = 0): string => new Date(Date.UTC(2026, 0, 1, 0, 0, offsetSec)).toISOString();
  let eventCounter = 0;
  const nextAt = (): string => now(eventCounter++);

  let campaign = engine.createCampaign({ name: `fuzz-${seed}` });
  const acquire = (instance: ItemInstance): Event =>
    ({ id: newEventId(), at: nextAt(), type: 'ItemAcquired', instance }) as Event;
  const setupEvents: Event[] = [];
  for (const pc of [...teamA, ...teamB]) {
    setupEvents.push(acquire(pc.weaponInstance));
    if (pc.armorInstance) setupEvents.push(acquire(pc.armorInstance));
    if (pc.shieldInstance) setupEvents.push(acquire(pc.shieldInstance));
    setupEvents.push(acquire(pc.potionInstance));
  }
  for (const pc of [...teamA, ...teamB]) {
    setupEvents.push({ id: newEventId(), at: nextAt(), type: 'CharacterCreated', snapshot: pc.character } as Event);
  }
  campaign = commit(campaign, setupEvents);

  if (level > 1) {
    for (const pc of [...teamA, ...teamB]) {
      try { campaign = levelUpTo(engine, campaign, pc.character.id, pc.build.classId, level); } catch { /* keep at current level */ }
    }
  }

  const allCharacterIds = [...teamA.map((pc) => pc.character.id), ...teamB.map((pc) => pc.character.id)];
  const enc = engine.plan.createEncounter(campaign.state, {
    combatantIds: allCharacterIds,
    name: 'Fuzz arena',
  });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

  const combatants: Record<string, Combatant> = {};
  for (const pc of [...teamA, ...teamB]) {
    combatants[pc.character.id] = { built: pc };
  }
  const teamAIds = new Set(teamA.map((pc) => pc.character.id));
  const teamBIds = new Set(teamB.map((pc) => pc.character.id));

  // Slice 595: select the opposing team's first-living combatant for
  // the active actor's policy choices. Returns undefined if no living
  // opponent remains (battle should end).
  const chooseOpponent = (activeId: string): Combatant | undefined => {
    const opposing = teamAIds.has(activeId) ? teamB : teamA;
    const alive = opposing.find((pc) => campaign.state.characters[pc.character.id]!.hp.current > 0);
    return alive !== undefined ? combatants[alive.character.id] : undefined;
  };

  // Battle ends when one team is fully downed.
  const teamWiped = (): 'A' | 'B' | null => {
    const aliveA = teamA.some((pc) => campaign.state.characters[pc.character.id]!.hp.current > 0);
    const aliveB = teamB.some((pc) => campaign.state.characters[pc.character.id]!.hp.current > 0);
    if (!aliveA) return 'B';
    if (!aliveB) return 'A';
    return null;
  };

  let rounds = 1;
  let winner: string | null = null;
  while (rounds < MAX_ROUNDS) {
    const encState = campaign.state.encounters[enc.encounterId]!;
    const activeCb = encState.combatants[encState.activeIndex]!;
    const active = combatants[activeCb.combatantId]!;
    const opponentSelected = chooseOpponent(activeCb.combatantId);
    if (opponentSelected === undefined) {
      const t = teamWiped();
      if (t !== null) {
        winner = t === 'A' ? teamA[0]!.character.id : teamB[0]!.character.id;
      }
      break;
    }
    const opponent = opponentSelected;

    // Active dead → advance turn (death save loop handled by engine).
    const activeChar = campaign.state.characters[activeCb.combatantId]!;
    if (activeChar.hp.current <= 0) {
      try {
        campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
      } catch {
        break;
      }
      rounds = campaign.state.encounters[enc.encounterId]?.round ?? rounds;
      continue;
    }

    // Drain actions until policy says nothing left.
    let actions = 0;
    while (actions < 4) {
      const intent = pickIntent(campaign.state, active, opponent);
      if (intent === null) break;
      try {
        // Slice 591: ConsumeItem is allowlisted out of the
        // performIntent dispatch (see tests/audit/planner-wiring.test.ts
        // EXCLUDED_FROM_DISPATCH "Items / inventory" category). Route
        // directly to engine.plan.consumeItem; the result events still
        // flow through commit + reducer as normal.
        if (intent.type === 'ConsumeItem') {
          const { events } = engine.plan.consumeItem(campaign.state, {
            characterId: intent.characterId as string,
            instanceId: intent.instanceId as string,
            ...(intent.targetId !== undefined ? { targetId: intent.targetId as string } : {}),
          });
          campaign = commit(campaign, events);
        } else {
          campaign = performIntent(engine, campaign, intent);
        }
      } catch {
        break;
      }
      // Slice 592: reaction window. After the active intent commits, scan
      // its emitted AttackRolled events for hits against the opponent
      // (the defender). If the defender is a Shield-prepared caster
      // (wizard / sorcerer) with reaction + L1 slot available, cast
      // Shield as a reaction. The +5 AC applies until the start of the
      // defender's next turn so subsequent attacks this round see the
      // bumped AC. RAW Shield can retroactively convert hit→miss; the
      // fuzz fires Shield post-hit (the damage already applied), which
      // exercises the slot / reaction / condition wiring + bumped AC
      // for *subsequent* attacks but not the retroactive conversion.
      // Documented limitation.
      const tail = campaign.events.slice(-12);
      const hitOnDefender = [...tail].reverse().find((e): e is Event & { type: 'AttackRolled'; hit: boolean; targetId: string; total: number; targetAC: number; id: string } =>
        e.type === 'AttackRolled' && (e as { targetId: string }).targetId === opponent.built.character.id && (e as { hit: boolean }).hit === true);
      if (hitOnDefender !== undefined && tryShieldReaction(engine, campaign, opponent, hitOnDefender)) {
        const { events: shieldEvents } = engine.plan.shield(campaign.state, {
          casterId: opponent.built.character.id,
          triggeringAttackEventId: hitOnDefender.id,
          triggeringAttackTotal: hitOnDefender.total,
          originalAC: hitOnDefender.targetAC,
          slotLevel: 1,
        });
        try {
          campaign = commit(campaign, [...shieldEvents]);
        } catch {
          // Shield post-hit may collide with already-applied damage
          // events; in that case skip silently.
        }
      }
      actions += 1;
      // Slice 589: if this intent emitted a hit AttackRolled with the
      // active char's main weapon, queue the matching Weapon Mastery
      // intent for the next pickIntent call. Mastery classes only —
      // anyone else's planWeaponMastery would throw on the
      // canUseWeaponMastery gate.
      if (
        intent.type === 'Attack'
        && MASTERY_CLASSES.has(active.built.build.classId)
      ) {
        const weaponId = active.built.weaponInstance.definitionId;
        const mastery = WEAPON_MASTERY[weaponId];
        if (mastery !== undefined) {
          const recent = campaign.events.slice(-12);
          const atk = [...recent].reverse().find(
            (e): e is Event & { type: 'AttackRolled'; hit: boolean; attackerId: string; weaponInstanceId?: string } =>
              e.type === 'AttackRolled'
              && (e as { attackerId: string }).attackerId === active.built.character.id,
          );
          if (atk?.hit === true) {
            active.pendingMasteryFire = {
              mastery,
              weaponInstanceId: active.built.weaponInstance.id,
              targetId: opponent.built.character.id,
            };
          }
        }
      }
      // Slice 595: stop if the entire opposing team is downed.
      const t = teamWiped();
      if (t !== null) {
        winner = t === 'A' ? teamA[0]!.character.id : teamB[0]!.character.id;
        break;
      }
    }

    if (winner !== null) break;

    // Advance turn.
    try {
      campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
    } catch {
      break;
    }
    const newRound = campaign.state.encounters[enc.encounterId]?.round ?? rounds;
    if (newRound > rounds) rounds = newRound;
  }

  // Slice 594: after battle ends, optionally perform a post-battle rest
  // on the SURVIVING characters (HP > 0). End the encounter first
  // (RAW: you can't rest in combat). The rest planner emits the
  // recharge events for resources / slots and the HP regen for long
  // rests; the transcript surfaces them naturally via formatEvent.
  if (rest !== 'none') {
    try {
      campaign = commit(campaign, engine.plan.endEncounter(campaign.state, { encounterId: enc.encounterId, outcome: winner !== null ? 'victory' : 'fled' }).events);
      const survivors = [...teamA, ...teamB]
        .filter((pc) => campaign.state.characters[pc.character.id]!.hp.current > 0)
        .map((pc) => pc.character.id);
      if (survivors.length > 0) {
        const restPlan = rest === 'long'
          ? engine.plan.longRest(campaign.state, { participantIds: survivors })
          : engine.plan.shortRest(campaign.state, { participantIds: survivors });
        campaign = commit(campaign, restPlan.events);
      }
    } catch { /* end-encounter / rest threw; transcript truncates at battle end */ }
  }

  return { events: campaign.events, finalState: campaign.state, winner, rounds };
};

const summarize = (
  pack: Pack,
  seed: number,
  result: ReturnType<typeof runBattle>,
): string => {
  const lines: string[] = [];
  lines.push(`# Combat fuzz seed=${seed}`);
  lines.push('');
  const pcs = Object.values(result.finalState.characters);
  for (const pc of pcs) {
    const cls = pc.classes[0]?.classId ?? 'unknown';
    lines.push(`- **${pc.name}** — ${cls} ${pc.speciesId} (${pc.backgroundId}). Final HP: ${pc.hp.current}/${pc.hp.max}.`);
  }
  lines.push('');
  if (result.winner !== null) {
    const w = result.finalState.characters[result.winner]!;
    lines.push(`**Winner**: ${w.name} (in ${result.rounds} rounds).`);
  } else {
    lines.push(`**No winner** after ${MAX_ROUNDS} rounds.`);
  }
  lines.push('');
  lines.push('## Transcript');
  lines.push('');
  lines.push(formatTranscript(result.events, resolveContent([pack])));
  return lines.join('\n');
};

const parseArgs = (argv: ReadonlyArray<string>): { count: number; seed: number; out: string; level: number; rest: 'none' | 'short' | 'long'; teamSize: number; vs: 'pc' | 'monster' } => {
  let count = 5;
  let seed = 1;
  let out = '/tmp/combat-fuzz';
  let level = 1;
  let rest: 'none' | 'short' | 'long' = 'none';
  let teamSize = 1;
  let vs: 'pc' | 'monster' = 'pc';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') count = Number(argv[++i] ?? count);
    else if (a === '--seed') seed = Number(argv[++i] ?? seed);
    else if (a === '--out') out = argv[++i] ?? out;
    else if (a === '--level') level = Math.max(1, Math.min(FUZZ_MAX_LEVEL, Number(argv[++i] ?? level)));
    else if (a === '--rest') {
      const v = (argv[++i] ?? 'none') as 'none' | 'short' | 'long';
      rest = v === 'short' || v === 'long' ? v : 'none';
    } else if (a === '--mode') {
      const m = argv[++i] ?? '1v1';
      teamSize = m === '2v2' ? 2 : 1;
    } else if (a === '--vs') {
      const v = argv[++i] ?? 'pc';
      vs = v === 'monster' ? 'monster' : 'pc';
    }
  }
  return { count, seed, out, level, rest, teamSize, vs };
};

const main = (): void => {
  const { count, seed, out, level, rest, teamSize, vs } = parseArgs(process.argv.slice(2));
  mkdirSync(out, { recursive: true });
  const pack = loadStarterPack();
  const indexLines: string[] = [
    `# Combat fuzz run — ${count} battles, seeds ${seed}..${seed + count - 1} (level ${level}${teamSize > 1 ? `, ${teamSize}v${teamSize}` : ''}${vs === 'monster' ? ', vs monster' : ''}${rest !== 'none' ? `, post-battle ${rest} rest` : ''})`,
    '',
  ];
  for (let i = 0; i < count; i++) {
    const s = seed + i;
    try {
      const result = runBattle(s, pack, level, rest, teamSize, vs);
      const fileName = `seed-${String(s).padStart(4, '0')}.md`;
      const filePath = resolve(out, fileName);
      const summary = summarize(pack, s, result);
      writeFileSync(filePath, summary, 'utf8');
      const winnerName = result.winner !== null
        ? result.finalState.characters[result.winner]!.name
        : '(no winner)';
      indexLines.push(`- [${fileName}](./${fileName}) — winner: ${winnerName}, ${result.rounds} rounds`);
      process.stdout.write(`seed=${s} → ${fileName} (winner: ${winnerName}, ${result.rounds} rounds)\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const fileName = `seed-${String(s).padStart(4, '0')}.error.txt`;
      writeFileSync(resolve(out, fileName), `error during battle:\n${msg}\n`, 'utf8');
      indexLines.push(`- [${fileName}](./${fileName}) — **error**: ${msg}`);
      process.stdout.write(`seed=${s} → ERROR: ${msg}\n`);
    }
  }
  writeFileSync(resolve(out, 'index.md'), indexLines.join('\n'), 'utf8');
  process.stdout.write(`\nWrote ${count} transcripts + index.md to ${out}\n`);
};

main();
