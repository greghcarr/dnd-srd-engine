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

// Per-class build spec: which ability gets the 15, what weapon / armor
// they start with, what cantrips + L1 spells they prepare, what
// resources they need (Rage uses, Bardic Inspiration die count, etc.).
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
  readonly shieldInstance?: ItemInstance;
  readonly potionInstance: ItemInstance;
  readonly build: ClassBuild;
}

const FUZZ_L1_PROF_BONUS = 2;
const FUZZ_L1_LEVEL = 1;

const MASTERY_CLASSES = new Set(['fighter', 'barbarian', 'paladin', 'ranger', 'rogue']);

const WEAPON_MASTERY: Readonly<Record<string, 'Sap' | 'Vex' | 'Slow' | 'Topple'>> = {
  longsword: 'Sap',
  shortsword: 'Vex',
  rapier: 'Vex',
  longbow: 'Slow',
};

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
