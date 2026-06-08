// The auto-reaction policy's pure, RNG-free decision logic (slice 749).
// Given a reactor and the hit they just took, decide which single
// damage-mitigation reaction they should take — or none. Exported from
// the package so a consumer (the dnd-web viewer) can drive reactions by
// importing from the package, not from scripts/. The fuzz harness's glue
// (scripts/reactions/reaction-policy.ts) turns the decision into engine
// planner calls.
//
// Scope (slice 749): only the reactions that compose correctly when fired
// AFTER the triggering damage has committed — those whose planner emits a
// compensating `Healed` event, so the bearer's HP nets out correctly.
// That is Uncanny Dodge (Rogue), Deflect Attacks (Monk), and Stone's
// Endurance (Goliath). "Prevent-the-trigger" reactions (Shield, Cutting
// Words, Counterspell, Countercharm) need a pre-damage reaction window in
// the attack/cast pipeline and are a separate follow-up.

import type { Character } from '../schemas/runtime/character.js';
import {
  ROGUE_CLASS_ID,
  MONK_CLASS_ID,
  UNCANNY_DODGE_ROGUE_LEVEL,
  DEFLECT_ATTACKS_MONK_LEVEL,
  GOLIATH_SPECIES_ID,
  GIANT_ANCESTRY_RESOURCE_ID,
  REACTION_MIN_DAMAGE,
} from './reaction-constants.js';

export type PhysicalDamageType = 'bludgeoning' | 'piercing' | 'slashing';

export interface IncomingDamage {
  // Total damage the reactor took from the triggering hit (sum of all
  // components). Compared against REACTION_MIN_DAMAGE.
  readonly total: number;
  // The dominant Bludgeoning/Piercing/Slashing damage type, or undefined
  // when the hit dealt no physical damage. Deflect Attacks only applies
  // to B/P/S, so it's skipped when this is undefined.
  readonly physicalType?: PhysicalDamageType;
  // True when an AttackRolled preceded the damage (a weapon/attack hit).
  // Deflect Attacks is an attack-only reaction.
  readonly fromAttack: boolean;
}

export type DamageReaction =
  | { readonly kind: 'uncannyDodge' }
  | { readonly kind: 'deflectAttacks'; readonly physicalType: PhysicalDamageType }
  | { readonly kind: 'stonesEndurance' };

const classLevel = (character: Character, classId: string): number =>
  character.classes.find((c) => c.classId === classId)?.level ?? 0;

export const hasUncannyDodge = (character: Character): boolean =>
  classLevel(character, ROGUE_CLASS_ID) >= UNCANNY_DODGE_ROGUE_LEVEL;

export const hasDeflectAttacks = (character: Character): boolean =>
  classLevel(character, MONK_CLASS_ID) >= DEFLECT_ATTACKS_MONK_LEVEL;

export const hasStonesEndurance = (character: Character): boolean =>
  character.speciesId === GOLIATH_SPECIES_ID
  && character.resources.some(
    (r) => r.resourceId === GIANT_ANCESTRY_RESOURCE_ID && r.current > 0,
  );

// Pick the single damage-mitigation reaction a reactor should take, or
// null. Fixed priority (uncannyDodge > deflectAttacks > stonesEndurance)
// keeps a multi-eligible reactor deterministic and respects the
// one-reaction-per-round economy (the caller has already confirmed the
// reactor's reaction is available). These predicates are a cheap
// pre-filter; the engine planner enforces the authoritative gate.
export const pickDamageReaction = (
  reactor: Character,
  damage: IncomingDamage,
): DamageReaction | null => {
  if (damage.total < REACTION_MIN_DAMAGE) return null;
  if (hasUncannyDodge(reactor)) return { kind: 'uncannyDodge' };
  if (
    damage.fromAttack
    && damage.physicalType !== undefined
    && hasDeflectAttacks(reactor)
  ) {
    return { kind: 'deflectAttacks', physicalType: damage.physicalType };
  }
  if (hasStonesEndurance(reactor)) return { kind: 'stonesEndurance' };
  return null;
};
