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
  bardicInspirationDieFor,
  BARDIC_INSPIRATION_RESOURCE_ID,
} from '../engine/plan/cutting-words.js';
import {
  ROGUE_CLASS_ID,
  MONK_CLASS_ID,
  UNCANNY_DODGE_ROGUE_LEVEL,
  DEFLECT_ATTACKS_MONK_LEVEL,
  GOLIATH_SPECIES_ID,
  GIANT_ANCESTRY_RESOURCE_ID,
  REACTION_MIN_DAMAGE,
  SHIELD_SPELL_ID,
  SHIELD_AC_BONUS,
  SHIELD_CASTER_CLASS_IDS,
  BARD_CLASS_ID,
  COUNTERSPELL_SPELL_ID,
  COUNTERCHARM_BARD_LEVEL,
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

// Pre-damage (prevent-the-trigger) reactions on the attack-roll window
// (slice 750). These decide whether a reactor should spend a reaction to
// turn a hit into a miss; the engine planner enforces the hard gates
// (slot / Bardic Inspiration die / reaction economy), so these are the
// "is it worth it" filter — class eligibility + would-it-actually-prevent.

// A defender should cast Shield when it's a Wizard/Sorcerer with the spell
// prepared AND the +5 AC would convert the hit into a miss (so the slot
// isn't wasted on an attack that lands anyway). Slot + reaction
// availability are enforced by planShield.
export const shouldShield = (
  defender: Character,
  attackTotal: number,
  targetAC: number,
): boolean => {
  const classId = defender.classes[0]?.classId;
  if (classId === undefined || !SHIELD_CASTER_CLASS_IDS.includes(classId)) return false;
  if (!defender.preparedSpells.includes(SHIELD_SPELL_ID)) return false;
  return attackTotal < targetAC + SHIELD_AC_BONUS;
};

// A Bard should use Cutting Words when the attack hit AND a maximum
// Bardic Inspiration die reduction could drop the attacker's total below
// the target's AC (i.e. there's a real chance to convert the hit to a
// miss). The BI resource + reaction economy are enforced by planCuttingWords.
export const shouldCuttingWords = (
  bard: Character,
  attackTotal: number,
  targetAC: number,
): boolean => {
  const bardClass = bard.classes.find((c) => c.classId === BARD_CLASS_ID);
  if (bardClass === undefined) return false;
  if (!bard.resources.some((r) => r.resourceId === BARDIC_INSPIRATION_RESOURCE_ID && r.current > 0)) {
    return false;
  }
  if (attackTotal < targetAC) return false;
  return attackTotal - bardicInspirationDieFor(bardClass.level) < targetAC;
};

// A caster should Counterspell when they have it prepared and the incoming
// spell is leveled (a cantrip isn't worth a 3rd-level slot, and the fuzz's
// counter always spends a 3rd-level slot). The 3rd-level slot + reaction
// economy are enforced by the engine planner / the resolver's slot check.
export const shouldCounterspell = (
  counterCaster: Character,
  originalSlotLevel: number,
): boolean =>
  originalSlotLevel >= 1 && counterCaster.preparedSpells.includes(COUNTERSPELL_SPELL_ID);

// A Bard at L7+ has Countercharm — a Reaction to reroll a nearby creature's
// failed Charmed/Frightened save with Advantage. The save context (DC,
// ability, bonus) and the affected-team / reaction-economy checks live in
// the resolver glue.
export const hasCountercharm = (character: Character): boolean =>
  (character.classes.find((c) => c.classId === BARD_CLASS_ID)?.level ?? 0) >= COUNTERCHARM_BARD_LEVEL;
