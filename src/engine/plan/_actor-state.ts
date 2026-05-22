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

// Effective-speed derivation lives in the derive layer (src/derive/speed.ts);
// re-exported here so the slice-1-era planner + test call sites keep their
// import path. New code should import from '../../derive/speed.js' directly.
export {
  getEffectiveSpeed,
  getEffectiveFlySpeed,
  getEffectiveSwimSpeed,
  getEffectiveClimbSpeed,
  getEffectiveBurrowSpeed,
  type GetEffectiveSpeedInput,
} from '../../derive/speed.js';

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
  // `hideous-laughter-active` (Hideous Laughter) RAW-includes
  // Incapacitated; it was missing here pre-slice 366, so a creature
  // incapacitated by laughter could still take actions.
  'hideous-laughter-active',
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


export { ACTION_BLOCKING_CONDITIONS };
