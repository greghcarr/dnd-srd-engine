// Combat fuzz simulation core (slice 600) — extracted from
// scripts/combat-fuzz.ts so the same simulator drives both the CLI
// transcript-writer and the web demo's step-through replay viewer.
//
// Pure: no node:fs / process / argv. Every input is a function
// argument; every output is a returned data structure. Safe to
// import from a browser bundle.

import {
  createEngine,
  seededRNG,
  newCharacterId,
  newItemInstanceId,
  newEventId,
  CharacterSchema,
  type Character,
  type ContentPack,
} from '../src/index.js';
import { commit, type Campaign } from '../src/engine/commit.js';
import { performIntent } from '../src/engine/conveniences.js';
import type { ItemInstance } from '../src/schemas/runtime/item-instance.js';
import type { Event } from '../src/schemas/events/index.js';

export const MAX_ROUNDS = 20;
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
const SPECIES = ['human', 'elf', 'dwarf', 'halfling', 'tiefling', 'dragonborn', 'gnome', 'goliath', 'orc'] as const;
const BACKGROUNDS = ['acolyte', 'criminal', 'sage', 'soldier'] as const;
// Max character level the fuzz tool can build to. The engine's
// level-up planner supports L1-L20 but the fuzz's level-up helper
// auto-resolves only the choices needed to reach this cap (subclass
// selection at L3 for half the classes; ASI/feat at L4 auto-picks an
// ability; no further choices L2-L5). Going beyond L5 would need
// richer choice auto-resolution.
export const FUZZ_MAX_LEVEL = 5;

type AbilityScore = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
type Pack = ContentPack;

export type FuzzRest = 'none' | 'short' | 'long';
export type FuzzVs = 'pc' | 'monster';

// Per-class build spec: which ability gets the 15, which weapon /
// armor / cantrips / L1 spells were drawn from the pool for THIS
// character. Filled by buildL1; pickIntent reads it and the character's
// `preparedSpells` to choose actions. The compact ClassPool below is
// the source from which buildL1 draws.
interface ClassBuild {
  readonly classId: string;
  readonly primary: AbilityScore;
  readonly secondary: AbilityScore;
  readonly weaponId: string;
  readonly armorId?: string;
  readonly useShield?: boolean;
  readonly cantrips: ReadonlyArray<string>;
  readonly l1Spells: ReadonlyArray<string>;
  readonly resources?: ReadonlyArray<{ resourceId: string; current: number; max: number }>;
}

// Slice 622: pools-of-loadouts replacing the single-weapon /
// single-armor / fixed-spell-list CLASS_BUILDS. buildL1 picks weapon,
// armor, shield, N cantrips, and N L1 spells per character. Pools are
// hand-curated against pack `weaponProficiencies`/`armorProficiencies`
// so attacks always have proficiency bonus. Two-handed weapons + shield
// are mutually exclusive: the build filters out 2H weapons when a
// shield rolls in.
//
// armorPool entries of `null` mean "unarmored". (Monk + caster classes
// rely on Unarmored Defense or just AC 10 + DEX; the engine accepts no
// armor cleanly.) `useShieldChance` is the 0..1 probability the build
// equips a shield, gated on (a) the class has shield proficiency and
// (b) the chosen weapon isn't 2H. numCantrips / numL1Spells are
// without-replacement draws via `pickN`.
interface ClassPool {
  readonly classId: string;
  readonly primary: AbilityScore;
  readonly secondary: AbilityScore;
  readonly weaponPool: ReadonlyArray<string>;
  readonly armorPool: ReadonlyArray<string | null>;
  readonly useShieldChance?: number;
  readonly cantripPool?: ReadonlyArray<string>;
  readonly numCantrips?: number;
  readonly l1SpellPool?: ReadonlyArray<string>;
  readonly numL1Spells?: number;
  readonly resources?: ReadonlyArray<{ resourceId: string; current: number; max: number }>;
}

const CLASS_POOLS: ReadonlyArray<ClassPool> = [
  {
    classId: 'barbarian',
    primary: 'STR', secondary: 'CON',
    weaponPool: ['greataxe', 'halberd', 'greatsword', 'glaive', 'maul', 'battleaxe', 'warhammer', 'longsword', 'morningstar', 'javelin'],
    armorPool: ['hide-armor', 'leather-armor', null],
    resources: [{ resourceId: 'rage', current: 2, max: 2 }],
  },
  {
    classId: 'bard',
    // Bard is simple-only at L1 in 2024 SRD (slice 589 audit). Stick to
    // simple weapons so attacks land at proficiency.
    primary: 'CHA', secondary: 'DEX',
    weaponPool: ['dagger', 'handaxe', 'sickle', 'dart', 'light-hammer', 'quarterstaff', 'mace', 'spear', 'club', 'shortbow', 'crossbow-light'],
    armorPool: ['leather-armor', 'padded-armor', 'studded-leather'],
    cantripPool: ['vicious-mockery', 'dancing-lights', 'prestidigitation', 'mage-hand', 'light'],
    numCantrips: 2,
    l1SpellPool: ['bless', 'healing-word', 'cure-wounds', 'dissonant-whispers', 'bane', 'heroism', 'thunderwave', 'charm-person'],
    numL1Spells: 3,
    resources: [{ resourceId: 'bardic-inspiration', current: 4, max: 4 }],
  },
  {
    classId: 'cleric',
    primary: 'WIS', secondary: 'STR',
    weaponPool: ['mace', 'spear', 'quarterstaff', 'light-hammer', 'club', 'javelin', 'sling', 'crossbow-light'],
    armorPool: ['chain-shirt', 'scale-mail', 'breastplate', 'half-plate', 'hide-armor'],
    useShieldChance: 0.7,
    cantripPool: ['sacred-flame', 'guidance', 'light', 'spare-the-dying'],
    numCantrips: 2,
    l1SpellPool: ['cure-wounds', 'guiding-bolt', 'bless', 'healing-word', 'inflict-wounds', 'command', 'bane'],
    numL1Spells: 3,
  },
  {
    classId: 'druid',
    primary: 'WIS', secondary: 'CON',
    weaponPool: ['quarterstaff', 'sickle', 'club', 'dart', 'sling', 'javelin', 'spear'],
    armorPool: ['leather-armor', 'padded-armor', 'studded-leather', 'hide-armor', null],
    useShieldChance: 0.3,
    cantripPool: ['produce-flame', 'druidcraft', 'shillelagh', 'poison-spray'],
    numCantrips: 2,
    l1SpellPool: ['entangle', 'faerie-fire', 'cure-wounds', 'healing-word', 'thunderwave', 'ice-knife', 'goodberry'],
    numL1Spells: 3,
  },
  {
    classId: 'fighter',
    primary: 'STR', secondary: 'CON',
    weaponPool: ['longsword', 'greatsword', 'greataxe', 'halberd', 'glaive', 'warhammer', 'battleaxe', 'maul', 'rapier', 'longbow', 'crossbow-light', 'spear', 'flail', 'morningstar', 'war-pick'],
    armorPool: ['chain-mail', 'scale-mail', 'splint', 'half-plate', 'breastplate', 'ring-mail'],
    useShieldChance: 0.5,
    resources: [{ resourceId: 'second-wind', current: 2, max: 2 }],
  },
  {
    classId: 'monk',
    // Simple + martial-light (per pack class entry).
    primary: 'DEX', secondary: 'WIS',
    weaponPool: ['shortsword', 'scimitar', 'quarterstaff', 'dagger', 'club', 'sickle', 'dart', 'javelin', 'handaxe', 'light-hammer'],
    armorPool: [null],
  },
  {
    classId: 'paladin',
    primary: 'STR', secondary: 'CHA',
    weaponPool: ['longsword', 'greatsword', 'warhammer', 'battleaxe', 'maul', 'halberd', 'glaive', 'mace', 'flail', 'morningstar', 'rapier'],
    armorPool: ['chain-mail', 'scale-mail', 'splint', 'half-plate', 'breastplate'],
    useShieldChance: 0.5,
    l1SpellPool: ['divine-favor', 'searing-smite', 'bless', 'command', 'heroism'],
    numL1Spells: 2,
    resources: [{ resourceId: 'lay-on-hands', current: 5, max: 5 }],
  },
  {
    classId: 'ranger',
    primary: 'DEX', secondary: 'WIS',
    weaponPool: ['longbow', 'crossbow-light', 'shortbow', 'rapier', 'shortsword', 'scimitar', 'longsword', 'handaxe'],
    armorPool: ['leather-armor', 'studded-leather', 'hide-armor', 'chain-shirt'],
    l1SpellPool: ['hunters-mark', 'cure-wounds', 'ensnaring-strike', 'goodberry'],
    numL1Spells: 2,
    resources: [{ resourceId: 'hunters-mark', current: 2, max: 2 }],
  },
  {
    classId: 'rogue',
    // Simple + martial-finesse + martial-light. Excludes blowgun
    // (martial but neither finesse nor light) -- caught by the pool
    // proficiency audit in tests/integration/combat-fuzz-pool-loadouts.
    primary: 'DEX', secondary: 'INT',
    weaponPool: ['shortsword', 'rapier', 'scimitar', 'dagger', 'handaxe', 'shortbow', 'crossbow-hand', 'crossbow-light', 'whip'],
    armorPool: ['leather-armor', 'studded-leather'],
  },
  {
    classId: 'sorcerer',
    primary: 'CHA', secondary: 'CON',
    weaponPool: ['dagger', 'quarterstaff', 'dart', 'crossbow-light', 'sling', 'light-hammer'],
    armorPool: [null],
    cantripPool: ['fire-bolt', 'ray-of-frost', 'shocking-grasp', 'poison-spray', 'chill-touch', 'acid-splash', 'sorcerous-burst', 'light'],
    numCantrips: 2,
    l1SpellPool: ['shield', 'mage-armor', 'magic-missile', 'burning-hands', 'chromatic-orb', 'ice-knife', 'thunderwave', 'ray-of-sickness'],
    numL1Spells: 3,
    resources: [{ resourceId: 'innate-sorcery', current: 2, max: 2 }],
  },
  {
    classId: 'warlock',
    primary: 'CHA', secondary: 'CON',
    weaponPool: ['dagger', 'light-hammer', 'sickle', 'crossbow-light', 'sling', 'dart', 'spear', 'mace'],
    armorPool: ['leather-armor', 'studded-leather', null],
    cantripPool: ['eldritch-blast'],
    numCantrips: 1,
    l1SpellPool: ['hex', 'hellish-rebuke'],
    numL1Spells: 1,
  },
  {
    classId: 'wizard',
    primary: 'INT', secondary: 'DEX',
    weaponPool: ['quarterstaff', 'dagger', 'crossbow-light', 'sling', 'club', 'dart', 'light-hammer'],
    armorPool: [null],
    cantripPool: ['fire-bolt', 'ray-of-frost', 'shocking-grasp', 'light', 'mage-hand', 'prestidigitation'],
    numCantrips: 2,
    l1SpellPool: ['magic-missile', 'mage-armor', 'shield', 'burning-hands', 'chromatic-orb', 'ice-knife', 'thunderwave'],
    numL1Spells: 3,
  },
];

const pickRandom = <T>(arr: ReadonlyArray<T>, r: number): T => arr[Math.floor(r * arr.length)]!;

// Slice 622: without-replacement draw of `n` items from `pool` using
// the existing deterministic `rngFloat` cursor. Consumes exactly `n`
// floats; the chosen items are returned in deterministic order so the
// same seed always produces the same selection. Used for cantrip + L1
// spell selection at build time.
const pickN = <T>(pool: ReadonlyArray<T>, rngFloat: () => number, n: number): T[] => {
  const remaining = [...pool];
  const out: T[] = [];
  const take = Math.min(n, remaining.length);
  for (let i = 0; i < take; i += 1) {
    const idx = Math.floor(rngFloat() * remaining.length);
    out.push(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  return out;
};

const assignAbilityScores = (
  build: Pick<ClassBuild, 'primary' | 'secondary'>,
): Record<AbilityScore, number> => {
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
  readonly shieldInstance?: ItemInstance;
  readonly potionInstance: ItemInstance;
  readonly build: ClassBuild;
}

const FUZZ_L1_PROF_BONUS = 2;
const FUZZ_L1_LEVEL = 1;

const MASTERY_CLASSES = new Set(['fighter', 'barbarian', 'paladin', 'ranger', 'rogue']);

// Slice 622: the local mastery table became a coverage cap the moment
// we randomized weapons from a pool. Read mastery off the pack item as
// the single source of truth — pool weapons surface every RAW mastery
// (Sap / Vex / Slow / Cleave / Graze / Push / Topple / Nick) automatically.
const weaponOf = (pack: Pack, weaponId: string):
  | { mastery?: string; properties?: ReadonlyArray<string> } | undefined => {
  const item = pack.items.find((i) => i.id === weaponId);
  if (item === undefined || item.itemKind !== 'weapon') return undefined;
  return item as { mastery?: string; properties?: ReadonlyArray<string> };
};
const masteryOf = (pack: Pack, weaponId: string): string | undefined =>
  weaponOf(pack, weaponId)?.mastery;
const isTwoHandedWeapon = (pack: Pack, weaponId: string): boolean =>
  (weaponOf(pack, weaponId)?.properties ?? []).includes('two-handed');

const CLASS_SHIELD_PROFICIENT = new Set(['fighter', 'paladin', 'barbarian', 'cleric', 'druid', 'ranger']);

const FULL_CASTER_L1_SLOTS = 2;
const FULL_CASTER_CLASSES = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);

const hasUnusedL1Slot = (character: Character): boolean => {
  if (!FULL_CASTER_CLASSES.has(character.classes[0]!.classId)) return false;
  const used = character.spellSlotsUsed['1'] ?? 0;
  return used < FULL_CASTER_L1_SLOTS;
};

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

// Slice 622: expanded from 10 to 25 entries covering CR <= 1/2
// statblocks. Mix of natural-weapon beasts and humanoid/mundane-weapon
// monsters so transcripts surface a wider monster sampling. Each entry
// is { monsterId, weaponId, classBuild }; the weaponId points at a real
// pack item (natural weapon for beasts, simple/martial weapon for
// humanoids). The build shape stays the placeholder 'companion' classId
// pickIntent uses to route monsters through the default attack branch.
const monsterEntry = (
  id: string,
  weaponId: string,
  primary: AbilityScore,
  secondary: AbilityScore,
): { id: string; weaponId: string; classBuild: ClassBuild } => ({
  id,
  weaponId,
  classBuild: { classId: 'companion', primary, secondary, weaponId, cantrips: [], l1Spells: [] },
});

const MONSTER_OPTIONS: ReadonlyArray<{ id: string; weaponId: string; classBuild: ClassBuild }> = [
  // Beasts with natural-weapon definitions.
  monsterEntry('wolf', 'wolf-bite', 'STR', 'DEX'),
  monsterEntry('venomous-snake', 'venomous-snake-bite', 'DEX', 'CON'),
  monsterEntry('giant-centipede', 'giant-centipede-bite', 'DEX', 'CON'),
  monsterEntry('imp', 'imp-sting', 'DEX', 'INT'),
  monsterEntry('boar', 'boar-gore', 'STR', 'CON'),
  monsterEntry('mastiff', 'mastiff-bite', 'STR', 'DEX'),
  monsterEntry('worg', 'worg-bite', 'STR', 'CON'),
  monsterEntry('pseudodragon', 'pseudodragon-bite', 'DEX', 'CHA'),
  monsterEntry('giant-spider', 'giant-spider-bite', 'DEX', 'STR'),
  monsterEntry('cockatrice', 'cockatrice-bite', 'DEX', 'CON'),
  monsterEntry('stirge', 'stirge-proboscis', 'DEX', 'CON'),
  monsterEntry('giant-wolf-spider', 'giant-spider-bite', 'DEX', 'STR'),
  monsterEntry('black-bear', 'black-bear-rend', 'STR', 'CON'),
  monsterEntry('sprite', 'sprite-needle-sword', 'DEX', 'CHA'),
  // Humanoid + undead monsters using mundane pack weapons.
  monsterEntry('goblin-warrior', 'shortsword', 'DEX', 'CON'),
  monsterEntry('kobold-warrior', 'dagger', 'DEX', 'CON'),
  monsterEntry('skeleton', 'shortsword', 'DEX', 'CON'),
  monsterEntry('zombie', 'unarmed-strike', 'STR', 'CON'),
  monsterEntry('bandit', 'shortsword', 'DEX', 'CON'),
  monsterEntry('cultist', 'scimitar', 'STR', 'WIS'),
  monsterEntry('guard', 'spear', 'STR', 'CON'),
  monsterEntry('scout', 'shortsword', 'DEX', 'WIS'),
  monsterEntry('hobgoblin-warrior', 'longsword', 'STR', 'CON'),
  monsterEntry('gnoll-warrior', 'spear', 'STR', 'CON'),
  monsterEntry('warrior-infantry', 'spear', 'STR', 'CON'),
];

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

// Slice 622: pool-driven build. Per character, draw weapon / armor /
// (optional) shield / N cantrips / N L1 spells from the class's pool.
// Two-handed weapons exclude shields. The returned `build: ClassBuild`
// is the per-character snapshot pickIntent reads -- pickIntent itself
// stays RNG-free.
const buildL1 = (name: string, rngFloat: () => number, pack: Pack): BuiltCharacter => {
  const pool = pickRandom(CLASS_POOLS, rngFloat());
  const speciesId = pickRandom(SPECIES, rngFloat());
  const backgroundId = pickRandom(BACKGROUNDS, rngFloat());
  const abilities = assignAbilityScores(pool);
  const hitDieByClass: Readonly<Record<string, number>> = {
    barbarian: 12, fighter: 10, paladin: 10, ranger: 10,
    bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
    sorcerer: 6, wizard: 6,
  };
  const conMod = Math.floor((abilities.CON - 10) / 2);
  const hpMax = (hitDieByClass[pool.classId] ?? 8) + conMod;

  // Draw a weapon; if a shield will be equipped (rolled below), prefer
  // a non-two-handed pick. Falls back to whatever the pool gives if no
  // valid one-handed option exists.
  const wantShield =
    pool.useShieldChance !== undefined
    && CLASS_SHIELD_PROFICIENT.has(pool.classId)
    && rngFloat() < pool.useShieldChance;
  const weaponCandidates = wantShield
    ? pool.weaponPool.filter((w) => !isTwoHandedWeapon(pack, w))
    : pool.weaponPool;
  const weaponId = pickRandom(weaponCandidates.length > 0 ? weaponCandidates : pool.weaponPool, rngFloat());
  const armorPick = pickRandom(pool.armorPool, rngFloat());
  const cantrips = pool.cantripPool !== undefined && pool.numCantrips !== undefined
    ? pickN(pool.cantripPool, rngFloat, pool.numCantrips)
    : [];
  const l1Spells = pool.l1SpellPool !== undefined && pool.numL1Spells !== undefined
    ? pickN(pool.l1SpellPool, rngFloat, pool.numL1Spells)
    : [];

  const build: ClassBuild = {
    classId: pool.classId,
    primary: pool.primary,
    secondary: pool.secondary,
    weaponId,
    armorId: armorPick ?? undefined,
    useShield: wantShield && !isTwoHandedWeapon(pack, weaponId),
    cantrips,
    l1Spells,
    resources: pool.resources,
  };

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
    resources: [...(build.resources ?? []), ...speciesGrantedResources(pack, speciesId)],
    weaponMasteries: MASTERY_CLASSES.has(build.classId) ? [build.weaponId] : [],
  });

  return { character, weaponInstance, armorInstance, shieldInstance, potionInstance, build };
};

interface Combatant {
  readonly built: BuiltCharacter;
  firstTurnBuffTried?: boolean;
  firstTurnActionBuffTried?: boolean;
  firstTurnSpeciesBATried?: boolean;
  innateSorceryActivated?: boolean;
  pendingMasteryFire?: { mastery: string; weaponInstanceId: string; targetId: string };
}

const pickIntent = (
  state: Campaign['state'],
  active: Combatant,
  opponent: Combatant,
  allies: ReadonlyArray<Combatant> = [],
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
      if (c.preparedSpells.includes('cure-wounds') && hasUnusedL1Slot(c)) {
        return { type: 'CastSpell', characterId: c.id, spellId: 'cure-wounds', slotLevel: 1, targetIds: [c.id] };
      }
    }
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
    if (classId === 'paladin' && c.preparedSpells.includes('divine-favor') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'divine-favor', slotLevel: 1, targetIds: [c.id] };
    }
    if (classId === 'sorcerer') {
      const res = c.resources.find((r) => r.resourceId === 'innate-sorcery');
      if (res && res.current > 0) {
        return { type: 'InnateSorcery', characterId: c.id };
      }
    }
  }

  if (!active.firstTurnSpeciesBATried && !cb.turnUsage.bonusActionUsed) {
    active.firstTurnSpeciesBATried = true;
    const speciesId = c.speciesId;
    if (speciesId === 'orc') {
      const res = c.resources.find((r) => r.resourceId === 'adrenaline-rush');
      if (res && res.current > 0) {
        return { type: 'AdrenalineRush', orcId: c.id };
      }
    }
    if (speciesId === 'dwarf') {
      const res = c.resources.find((r) => r.resourceId === 'stonecunning');
      if (res && res.current > 0) {
        return { type: 'Stonecunning', dwarfId: c.id, onStoneSurface: true };
      }
    }
    if (speciesId === 'dragonborn') {
      const res = c.resources.find((r) => r.resourceId === 'dragonborn-breath-weapon');
      if (res && res.current > 0) {
        return {
          type: 'DragonbornBreath',
          dragonbornId: c.id,
          damageType: 'acid',
          areaShape: 'cone',
          targetIds: [oppId],
        };
      }
    }
    if (classId === 'bard' && allies.length > 0) {
      const res = c.resources.find((r) => r.resourceId === 'bardic-inspiration');
      const ally = allies.find((a) => state.characters[a.built.character.id]!.hp.current > 0);
      if (res && res.current > 0 && ally !== undefined) {
        return { type: 'BardicInspiration', bardId: c.id, recipientId: ally.built.character.id };
      }
    }
  }

  if (!active.firstTurnActionBuffTried && !cb.turnUsage.actionUsed) {
    active.firstTurnActionBuffTried = true;
    const notConcentrating = c.concentrationEffectId === undefined;
    if (classId === 'paladin') {
      // Paladin's BA branch above already handles Divine Favor; the
      // Action slot stays available for an attack.
    } else if ((classId === 'cleric' || classId === 'bard') && c.preparedSpells.includes('bless') && hasUnusedL1Slot(c) && notConcentrating) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'bless', slotLevel: 1, targetIds: [c.id] };
    } else if ((classId === 'wizard' || classId === 'sorcerer') && c.preparedSpells.includes('mage-armor') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'mage-armor', slotLevel: 1, targetIds: [c.id] };
    } else if (classId === 'druid' && c.preparedSpells.includes('faerie-fire') && hasUnusedL1Slot(c) && notConcentrating) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'faerie-fire', slotLevel: 1, targetIds: [oppId] };
    } else if (classId === 'druid' && c.preparedSpells.includes('entangle') && hasUnusedL1Slot(c) && notConcentrating) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'entangle', slotLevel: 1, targetIds: [oppId] };
    } else if (classId === 'bard' && c.preparedSpells.includes('heroism') && hasUnusedL1Slot(c) && notConcentrating && allies.length > 0) {
      const ally = allies.find((a) => state.characters[a.built.character.id]!.hp.current > 0);
      if (ally !== undefined) {
        return { type: 'CastSpell', characterId: c.id, spellId: 'heroism', slotLevel: 1, targetIds: [ally.built.character.id] };
      }
    } else if ((classId === 'bard' || classId === 'cleric') && c.preparedSpells.includes('bane') && hasUnusedL1Slot(c) && notConcentrating) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'bane', slotLevel: 1, targetIds: [oppId] };
    }
  }

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

  if (!cb.turnUsage.actionUsed) {
    // Slice 622: L1-spell direct-damage / control branches placed
    // BEFORE the cantrip fallback so casters with both prefer the slot
    // option that turn. Slots are limited (full caster L1 = 2) so the
    // priority gates ration them: spells with the strongest per-cast
    // payoff get cast first; the rest of the fight falls through to
    // the cantrip branch.
    if ((classId === 'wizard' || classId === 'sorcerer') && c.preparedSpells.includes('magic-missile') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'magic-missile', slotLevel: 1, targetIds: [oppId] };
    }
    if ((classId === 'sorcerer' || classId === 'wizard') && c.preparedSpells.includes('chromatic-orb') && hasUnusedL1Slot(c)) {
      return {
        type: 'CastSpell',
        characterId: c.id,
        spellId: 'chromatic-orb',
        slotLevel: 1,
        targetIds: [oppId],
        casterChoice: { kind: 'damageType', value: 'fire' },
      };
    }
    if ((classId === 'sorcerer' || classId === 'wizard' || classId === 'druid') && c.preparedSpells.includes('burning-hands') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'burning-hands', slotLevel: 1, targetIds: [oppId] };
    }
    if ((classId === 'sorcerer' || classId === 'wizard' || classId === 'druid') && c.preparedSpells.includes('ice-knife') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'ice-knife', slotLevel: 1, targetIds: [oppId] };
    }
    if ((classId === 'wizard' || classId === 'sorcerer' || classId === 'druid' || classId === 'bard') && c.preparedSpells.includes('thunderwave') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'thunderwave', slotLevel: 1, targetIds: [oppId] };
    }
    if (classId === 'cleric' && c.preparedSpells.includes('guiding-bolt') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'guiding-bolt', slotLevel: 1, targetIds: [oppId] };
    }
    if (classId === 'cleric' && c.preparedSpells.includes('inflict-wounds') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'inflict-wounds', slotLevel: 1, targetIds: [oppId] };
    }
    if ((classId === 'cleric' || classId === 'bard') && c.preparedSpells.includes('command') && hasUnusedL1Slot(c)) {
      return {
        type: 'CastSpell',
        characterId: c.id,
        spellId: 'command',
        slotLevel: 1,
        targetIds: [oppId],
        casterChoice: { kind: 'commandWord', value: 'flee' },
      };
    }
    if (classId === 'bard' && c.preparedSpells.includes('dissonant-whispers') && hasUnusedL1Slot(c)) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'dissonant-whispers', slotLevel: 1, targetIds: [oppId] };
    }
    // Cantrip fallback. Slice 622: read from c.preparedSpells (was
    // build.cantrips) so Magic-Initiate-granted cantrips (Sage's
    // wizard cantrip, Acolyte's cleric cantrip) actually get cast
    // when the slice-618 cascade attaches them to a fresh PC.
    if (c.preparedSpells.includes('eldritch-blast')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'eldritch-blast', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('fire-bolt')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('sacred-flame')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'sacred-flame', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('vicious-mockery')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'vicious-mockery', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('produce-flame')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'produce-flame', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('ray-of-frost')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'ray-of-frost', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('shocking-grasp')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'shocking-grasp', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('poison-spray')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'poison-spray', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('acid-splash')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'acid-splash', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('chill-touch')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'chill-touch', slotLevel: 0, targetIds: [oppId] };
    }
    if (c.preparedSpells.includes('sorcerous-burst')) {
      return { type: 'CastSpell', characterId: c.id, spellId: 'sorcerous-burst', slotLevel: 0, targetIds: [oppId] };
    }
    return {
      type: 'Attack',
      attackerId: c.id,
      targetId: oppId,
      weaponInstanceId: active.built.weaponInstance.id,
    };
  }

  return null;
};

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
  let camp = drainPendingChoices(engine, campaign, characterId);
  for (let lvl = 2; lvl <= targetLevel; lvl += 1) {
    const result = engine.plan.levelUp(camp.state, { characterId, classId, hpStrategy: 'average' });
    camp = commit(camp, result.events);
    camp = drainPendingChoices(engine, camp, characterId);
  }
  return camp;
};

export interface FuzzBattleOptions {
  readonly seed: number;
  readonly pack: Pack;
  readonly level?: number;
  readonly rest?: FuzzRest;
  readonly teamSize?: number;
  readonly vs?: FuzzVs;
}

export interface FuzzBattleResult {
  readonly campaign: Campaign;
  readonly winner: string | null;
  readonly rounds: number;
  /** Character ids on the "Aria" team. Slice 607: lets the web demo color-code teams. */
  readonly teamACharacterIds: ReadonlyArray<string>;
  /** Character ids on the "Bran" (or "Beast") team. Slice 607: lets the web demo color-code teams. */
  readonly teamBCharacterIds: ReadonlyArray<string>;
}

export const runBattle = (opts: FuzzBattleOptions): FuzzBattleResult => {
  const seed = opts.seed;
  const pack = opts.pack;
  const level = opts.level ?? 1;
  const rest: FuzzRest = opts.rest ?? 'none';
  const teamSize = opts.teamSize ?? 1;
  const vs: FuzzVs = opts.vs ?? 'pc';

  const engine = createEngine({ contentPacks: [pack], rng: seededRNG(seed) });
  let cursor = seed * 13 + 7;
  const rngFloat = (): number => {
    cursor = (cursor * 9301 + 49297) % 233280;
    return cursor / 233280;
  };

  // Slice 606: monsters wear the "Beast" name so the transcript reads
  // unambiguously in `--vs monster` mode. Pre-slice the core-extraction
  // refactor (slice 600) lost the slice-596 "Beast" naming and used
  // "Bran" for both PC and monster opposing teams, making spell-cast vs
  // bite events look identical.
  const teamNames = (base: 'Aria' | 'Bran' | 'Beast'): string[] =>
    teamSize === 1 ? [base] : Array.from({ length: teamSize }, (_, i) => `${base}-${i + 1}`);
  const teamA: BuiltCharacter[] = teamNames('Aria').map((n) => buildL1(n, rngFloat, pack));
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

  const chooseOpponent = (activeId: string): Combatant | undefined => {
    const opposing = teamAIds.has(activeId) ? teamB : teamA;
    const alive = opposing.find((pc) => campaign.state.characters[pc.character.id]!.hp.current > 0);
    return alive !== undefined ? combatants[alive.character.id] : undefined;
  };

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

    let actions = 0;
    while (actions < 4) {
      const activeTeam = teamAIds.has(active.built.character.id) ? teamA : teamB;
      const allies = activeTeam
        .filter((pc) => pc.character.id !== active.built.character.id
          && campaign.state.characters[pc.character.id]!.hp.current > 0)
        .map((pc) => combatants[pc.character.id]!);
      const intent = pickIntent(campaign.state, active, opponent, allies);
      if (intent === null) break;
      try {
        if (intent.type === 'ConsumeItem') {
          const { events } = engine.plan.consumeItem(campaign.state, {
            characterId: intent.characterId as string,
            instanceId: intent.instanceId as string,
            ...(intent.targetId !== undefined ? { targetId: intent.targetId as string } : {}),
          });
          campaign = commit(campaign, events);
        } else if (intent.type === 'InnateSorcery') {
          const { events } = engine.plan.innateSorcery(campaign.state, {
            characterId: intent.characterId as string,
          });
          campaign = commit(campaign, events);
        } else {
          campaign = performIntent(engine, campaign, intent);
        }
      } catch {
        break;
      }
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
      if (
        intent.type === 'Attack'
        && MASTERY_CLASSES.has(active.built.build.classId)
      ) {
        const weaponId = active.built.weaponInstance.definitionId;
        // Slice 622: read mastery off the pack so pool weapons surface
        // every RAW mastery (was a 4-entry local table pre-slice).
        const mastery = masteryOf(pack, weaponId);
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
      const t = teamWiped();
      if (t !== null) {
        winner = t === 'A' ? teamA[0]!.character.id : teamB[0]!.character.id;
        break;
      }
    }

    if (winner !== null) break;

    try {
      campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
    } catch {
      break;
    }
    const newRound = campaign.state.encounters[enc.encounterId]?.round ?? rounds;
    if (newRound > rounds) rounds = newRound;
  }

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

  return {
    campaign,
    winner,
    rounds,
    teamACharacterIds: teamA.map((pc) => pc.character.id),
    teamBCharacterIds: teamB.map((pc) => pc.character.id),
  };
};
