// Shared actor-state guards.
//
// RAW 2024 PHB Appendix "Conditions" puts several conditions in a
// blocking posture: an Incapacitated creature can't take Actions,
// Bonus Actions, or Reactions. Stunned / Paralyzed / Petrified /
// Unconscious all RAW-include Incapacitated as part of their
// definitions, so they're action-blocking too.
//
// HP at 0 is also treated as Unconscious by the engine even when the
// 'unconscious' condition entry isn't explicitly applied (see
// src/engine/reducers/combat.ts which uses `hp.current <= 0` as the
// proxy for "downed"). This module mirrors that convention.
//
// The Restrained and Grappled conditions zero out a creature's speed.
// They don't block actions, only movement, so they're handled by
// `getEffectiveSpeed` rather than `assertActorCanAct`.

import type { Character } from '../../schemas/runtime/character.js';
import type { ItemInstance } from '../../schemas/runtime/item-instance.js';
import type { PendingChoice } from '../../schemas/runtime/pending-choice.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { MovementMode } from '../../schemas/primitives.js';
import { collectEffectsFromCharacter } from '../../derive/effect-stack.js';

const ACTION_BLOCKING_CONDITIONS: ReadonlySet<string> = new Set([
  'incapacitated',
  'stunned',
  'paralyzed',
  'petrified',
  'unconscious',
  // Spell-bound variants that RAW-include Incapacitated. These carry
  // their base condition's mechanical effects but a distinct id, so the
  // id-keyed guard must list them explicitly. `held-paralyzed-active`
  // (Hold Person / Hold Monster) was missing pre-slice 339 — a held
  // creature could still take actions; `power-word-stunned-active`
  // (Power Word Stun, slice 339) is the new entry.
  'held-paralyzed-active',
  'power-word-stunned-active',
]);

/**
 * Returns the id of the first action-blocking condition the character
 * carries, or `'unconscious'` (synthetic) if their HP has dropped to 0,
 * or `undefined` if they can act.
 */
export const findActorBlockingCondition = (character: Character): string | undefined => {
  if (character.hp.current <= 0) return 'unconscious';
  const blocker = character.appliedConditions.find((c) => ACTION_BLOCKING_CONDITIONS.has(c.conditionId));
  return blocker?.conditionId;
};

/**
 * Throws if the character is in any action-blocking condition. The
 * `actionLabel` is interpolated into the error message so the surface
 * reads naturally ("Alyx cannot Attack while Stunned"). Every planner
 * that lets a character do something on their turn must call this
 * before doing any work; missing the call is the bug class the audit
 * at tests/audit/raw-compliance.test.ts probes for.
 */
export const assertActorCanAct = (character: Character, actionLabel: string): void => {
  const blocker = findActorBlockingCondition(character);
  if (blocker !== undefined) {
    throw new Error(
      `${character.name} cannot ${actionLabel} while ${blocker.charAt(0).toUpperCase()}${blocker.slice(1)}`,
    );
  }
};

export interface GetEffectiveSpeedInput {
  readonly character: Character;
  readonly content: ResolvedContent;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly pendingChoices?: Readonly<Record<string, PendingChoice>>;
}

// Slice 288. Resolves the per-mode base speed before effect-stack
// modifiers. Walk reads `character.speedFeet` (slice 1 origin).
// Non-walk modes (`fly` / `swim` / `climb` / `burrow`) read from the
// character's species `speed` map (PCs / NPCs) or monster statblock
// `speed` map (creatures via statblockId), defaulting to 0 when the
// mode isn't natively present. Most PCs have non-walk base = 0;
// non-walk speed comes from effect-stack `ModifySpeed { mode, op:
// 'set' }` entries (Cloak of the Bat fly 40, Gaseous Form fly 10,
// Spider Climb climb=walk, etc.). A monster with a base fly speed
// (Dragon, Pegasus) reports it here as the natural floor.
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

// Slice 288. Shared per-mode resolver behind `getEffectiveSpeed`
// (walk) and the four non-walk siblings. Walks the character's full
// effect stack and applies every `ModifySpeed { mode }` entry per
// RAW (same algorithm as slice 1's walk-only path):
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
const getEffectiveSpeedForMode = (
  input: GetEffectiveSpeedInput,
  mode: MovementMode,
): number => {
  const { character, content, itemInstances, pendingChoices } = input;
  const effects = collectEffectsFromCharacter({ character, content, itemInstances, pendingChoices });
  let addSum = 0;
  let highestSet: number | undefined;
  let zeroSet = false;
  let highestMultiplier = 1;
  // Slice 290. `matchWalkSpeed` entries say "set this mode's speed to
  // the bearer's effective walk speed" (RAW: Cloak of Arachnida and
  // Spider Climb both grant "Climb Speed equal to your walking
  // Speed"). Records that a matchWalkSpeed entry was seen; the actual
  // walk-speed resolution happens after the loop. The op is no-op for
  // walk mode itself (would be circular); silently skip.
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
  // matchWalkSpeed treated as a set-to-walk-speed: a non-zero set
  // wins over the natural base + add (same precedence rule as
  // `op: 'set'`). When both an explicit `set` and `matchWalkSpeed`
  // are present, the larger value wins (RAW: highest set wins).
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
 * Effective walking speed in feet. See `getEffectiveSpeedForMode`
 * for the resolution algorithm. Public-API alias for the walk mode;
 * the slice 1 origin shape (existing callers across move / dash /
 * Dodge / OA-threat geometry).
 */
export const getEffectiveSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'walk');

/**
 * Slice 288. Effective fly speed in feet. Mirrors `getEffectiveSpeed`
 * for the `fly` mode. Returns 0 when the character has no native
 * fly speed and no `ModifySpeed { mode: 'fly' }` entries project.
 * Canonical users: Cloak of the Bat fly 40 (slice-227 row half b;
 * pending the Toggle wire), Gaseous Form fly 10 (slice 287
 * declarative entry), Fly spell, Pegasus / Dragon natural fly speeds.
 */
export const getEffectiveFlySpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'fly');

/**
 * Slice 288. Effective swim speed in feet. Canonical users: Gloves
 * of Swimming and Climbing swim 30 (slice 132 retrofit), Ring of
 * Swimming swim 40, Aquatic species natural swim speeds, Alter
 * Self's Aquatic Adaptation arm (pending the `matchWalkSpeed`
 * ModifySpeed op).
 */
export const getEffectiveSwimSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'swim');

/**
 * Slice 288. Effective climb speed in feet. Canonical users: Gloves
 * of Swimming and Climbing climb 30, Slippers of Spider Climbing
 * climb 30 (slice-227 row was approximated; this slice projects it
 * mechanically), Spider Climb spell (climb=walk), Cloak of Arachnida
 * (pending the `matchWalkSpeed` ModifySpeed op).
 */
export const getEffectiveClimbSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'climb');

/**
 * Slice 288. Effective burrow speed in feet. Most natural burrowers
 * are monsters (Ankheg, Bulette, etc.); native burrow speeds come
 * from the monster statblock. Few PC effects target burrow today,
 * but the helper exists for completeness and future content.
 */
export const getEffectiveBurrowSpeed = (input: GetEffectiveSpeedInput): number =>
  getEffectiveSpeedForMode(input, 'burrow');

export { ACTION_BLOCKING_CONDITIONS };
