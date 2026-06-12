import type { Character } from '../schemas/runtime/character.js';
import type { MonsterStatblock } from '../schemas/content/monster.js';
import type { Size } from '../schemas/primitives.js';
import { newCharacterId } from '../ids.js';

export interface SpawnOverrides {
  // Defaults to the statblock average HP. An ooze Split sets half the parent's
  // current HP for each new copy.
  readonly hpCurrent?: number;
  readonly hpMax?: number;
  // An ooze Split's copies are "one size smaller" — a sizeOverride (read first
  // by `creatureSize`) without touching the shared statblock.
  readonly sizeOverride?: Size;
}

// Slice 233 / 836: build a runtime Character snapshot from a monster statblock
// for a spawn. Canonical users: the Troll's Loathsome Limbs (→ a Troll Limb)
// and an ooze's Split (→ two one-smaller copies at half HP). The runtime
// monster-trait fold (`collectMonsterEffects`) reads through `statblockId`, so
// the spawn picks up its own traits/AC/attacks without further authoring —
// minimal runtime state otherwise (no inventory / spells / equipment).
//
// Extracted from dispatch.ts's inline `fireSpawnCreature` literal (the
// rule-of-two) so the full required-field list lives in one place — it has
// drifted before (e.g. `expendedSaveActionIds` in slice 829).
export const buildSpawnedCharacter = (
  statblock: MonsterStatblock,
  overrides: SpawnOverrides = {},
): Character => {
  const hpMax = overrides.hpMax ?? overrides.hpCurrent ?? statblock.hp.average;
  const hpCurrent = overrides.hpCurrent ?? statblock.hp.average;
  return {
    id: newCharacterId(),
    kind: 'creature',
    name: statblock.name,
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: statblock.id,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: statblock.abilityScores,
    ...(overrides.sizeOverride !== undefined ? { sizeOverride: overrides.sizeOverride } : {}),
    hp: { current: hpCurrent, max: hpMax, temp: 0, maxBonus: 0 },
    deathSaves: { successes: 0, failures: 0, stable: false },
    exhaustion: 0,
    speedFeet: statblock.speed.walk ?? 30,
    armorClass: statblock.ac,
    inventory: [],
    equipped: { attuned: [] },
    resources: [],
    appliedConditions: [],
    knownSpells: [],
    preparedSpells: [],
    spellSlotsUsed: {},
    pactSlotsUsed: 0,
    usedFreeCastSpellIds: [],
    perDayCastsUsed: {},
    weaponMasteries: [],
    triggerCounters: {},
    featsTaken: [],
    pendingChoiceIds: [],
    breathWeaponExpended: false,
    expendedSaveActionIds: [],
    legendaryResistanceUsed: 0,
    heroicInspiration: false,
    damageTypesTakenThisTurn: [],
    heroPoints: 0,
    xp: 0,
    moraleBroken: false,
  };
};
