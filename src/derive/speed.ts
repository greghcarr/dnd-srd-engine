// Effective movement-speed derivation (slice 416 extraction; the logic
// originated in slice 288 inside engine/plan/_actor-state but is a pure
// derivation over state, so it lives in the derive layer and the planner
// re-exports it). Resolves a creature's per-mode speed by walking the
// effect stack and applying every `ModifySpeed` entry per RAW.
import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { PendingChoice } from '../schemas/runtime/pending-choice.js';
import type { ResolvedContent } from '../content/pack.js';
import type { MovementMode } from '../schemas/primitives.js';
import { collectEffectsFromCharacter } from './effect-stack.js';

export interface GetEffectiveSpeedInput {
  readonly character: Character;
  readonly content: ResolvedContent;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly pendingChoices?: Readonly<Record<string, PendingChoice>>;
}

// Resolves the per-mode base speed before effect-stack modifiers. Walk
// reads `character.speedFeet` (slice 1 origin). Non-walk modes
// (`fly` / `swim` / `climb` / `burrow`) read from the character's species
// `speed` map (PCs / NPCs) or monster statblock `speed` map (creatures via
// statblockId), defaulting to 0 when the mode isn't natively present. Most
// PCs have non-walk base = 0; non-walk speed comes from effect-stack
// `ModifySpeed { mode, op: 'set' }` entries (Cloak of the Bat fly 40,
// Gaseous Form fly 10, Spider Climb climb=walk, etc.). A monster with a
// base fly speed (Dragon, Pegasus) reports it here as the natural floor.
const baseSpeedForMode = (
  character: Character,
  content: ResolvedContent,
  mode: MovementMode,
): number => {
  if (mode === 'walk') return character.speedFeet;
  if (character.statblockId !== undefined) {
    const monster = content.monsters.get(character.statblockId);
    if (monster !== undefined) {
      return monster.speed[mode] ?? 0;
    }
  }
  const species = content.species.get(character.speciesId);
  if (species !== undefined) {
    return species.speed[mode] ?? 0;
  }
  return 0;
};

// Shared per-mode resolver behind `getEffectiveSpeed` (walk) and the four
// non-walk siblings. Walks the character's full effect stack and applies
// every `ModifySpeed { mode }` entry per RAW (same algorithm as slice 1's
// walk-only path):
//
//   1. Start from `baseSpeedForMode(mode)` — species / statblock /
//      `character.speedFeet` per mode.
//   2. Sum all `op: 'add'` entries (Fast Movement +10, Unarmored
//      Movement +10, Roving +5 etc. stack additively per RAW).
//   3. If any `op: 'set'` to 0 is present (Grappled / Restrained /
//      Paralyzed / Petrified / Unconscious all carry it on walk;
//      Earthbind sets fly to 0; etc.), the speed is 0 regardless of
//      other modifiers — zero-speed wins.
//   4. Otherwise, if any `op: 'set'` to a non-zero value is present,
//      use the highest set value (Phantom Steed walk=100; Gaseous
//      Form fly=10; Cloak of the Bat fly=40).
//   5. Apply the largest `op: 'multiply'` (RAW: doubling effects
//      don't stack — take the highest). Haste's ×2 lands here on
//      walk; non-walk multipliers (rare) work the same way.
//   6. Floor and clamp to >= 0.
export const getEffectiveSpeedForMode = (
  input: GetEffectiveSpeedInput,
  mode: MovementMode,
): number => {
  const { character, content, itemInstances, pendingChoices } = input;
  const effects = collectEffectsFromCharacter({ character, content, itemInstances, pendingChoices });
  let addSum = 0;
  let highestSet: number | undefined;
  let zeroSet = false;
  let highestMultiplier = 1;
  // `matchWalkSpeed` entries say "set this mode's speed to the bearer's
  // effective walk speed" (RAW: Cloak of Arachnida and Spider Climb both
  // grant "Climb Speed equal to your walking Speed"). Records that a
  // matchWalkSpeed entry was seen; the actual walk-speed resolution
  // happens after the loop. The op is no-op for walk mode itself (would
  // be circular); silently skip.
  let matchWalkSeen = false;
  for (const e of effects) {
    if (e.kind !== 'ModifySpeed') continue;
    if (e.mode !== mode) continue;
    if (e.op === 'add') {
      addSum += e.value;
    } else if (e.op === 'set') {
      if (e.value === 0) zeroSet = true;
      else if (highestSet === undefined || e.value > highestSet) highestSet = e.value;
    } else if (e.op === 'multiply') {
      if (e.value > highestMultiplier) highestMultiplier = e.value;
    } else if (e.op === 'matchWalkSpeed') {
      if (mode !== 'walk') matchWalkSeen = true;
    }
  }
  if (zeroSet) return 0;
  // matchWalkSpeed treated as a set-to-walk-speed: a non-zero set wins
  // over the natural base + add (same precedence rule as `op: 'set'`).
  // When both an explicit `set` and `matchWalkSpeed` are present, the
  // larger value wins (RAW: highest set wins).
  if (matchWalkSeen) {
    const walkSpeed = getEffectiveSpeedForMode(input, 'walk');
    if (highestSet === undefined || walkSpeed > highestSet) {
      highestSet = walkSpeed;
    }
  }
  const base = baseSpeedForMode(character, content, mode);
  const natural = highestSet ?? base + addSum;
  const scaled = Math.floor(natural * highestMultiplier);
  return Math.max(0, scaled);
};

/**
 * Effective walking speed in feet. See `getEffectiveSpeedForMode` for
 * the resolution algorithm. Public-API alias for the walk mode; the
 * slice 1 origin shape (existing callers across move / dash / Dodge /
 * OA-threat geometry).
 */
export const getEffectiveSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'walk');

/**
 * Effective fly speed in feet. Returns 0 when the character has no native
 * fly speed and no `ModifySpeed { mode: 'fly' }` entries project. Canonical
 * users: Cloak of the Bat fly 40, Gaseous Form fly 10, Fly spell,
 * Pegasus / Dragon natural fly speeds.
 */
export const getEffectiveFlySpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'fly');

/**
 * Effective swim speed in feet. Canonical users: Gloves of Swimming and
 * Climbing (swim = walk via matchWalkSpeed), Ring of Swimming swim 40,
 * Ranger Roving (swim = walk), aquatic species natural swim speeds.
 */
export const getEffectiveSwimSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'swim');

/**
 * Effective climb speed in feet. Canonical users: Gloves of Swimming and
 * Climbing, Slippers of Spider Climbing, Spider Climb spell, Cloak of
 * Arachnida, Thief Second-Story Work + Ranger Roving (all climb = walk).
 */
export const getEffectiveClimbSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'climb');

/**
 * Effective burrow speed in feet. Most natural burrowers are monsters
 * (Ankheg, Bulette, etc.); native burrow speeds come from the statblock.
 */
export const getEffectiveBurrowSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'burrow');

export interface EffectiveSpeeds {
  /** Walking speed in feet (always present). */
  readonly walk: number;
  readonly fly?: number;
  readonly swim?: number;
  readonly climb?: number;
  readonly burrow?: number;
}

const NON_WALK_MODES: ReadonlyArray<Exclude<MovementMode, 'walk'>> = ['fly', 'swim', 'climb', 'burrow'];

/**
 * Every effective movement speed in feet. `walk` is always present;
 * a non-walk mode appears only when its effective speed is > 0 (so a
 * grounded character reports just `{ walk }`).
 */
export const getEffectiveSpeeds = (input: GetEffectiveSpeedInput): EffectiveSpeeds => {
  const speeds: { -readonly [K in keyof EffectiveSpeeds]: number } = {
    walk: getEffectiveSpeedForMode(input, 'walk'),
  };
  for (const mode of NON_WALK_MODES) {
    const value = getEffectiveSpeedForMode(input, mode);
    if (value > 0) speeds[mode] = value;
  }
  return speeds;
};
