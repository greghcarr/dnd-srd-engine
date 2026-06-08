// Tunables for the auto-reaction policy (slice 749). Pure data, no engine
// dependency, so the decision helpers in ./reactions.ts stay free of
// runtime imports. The fuzz harness's reaction glue (scripts/reactions/
// reaction-policy.ts) wires these into the engine planners; the public
// barrel exposes the decision FUNCTIONS, not these tunables (mirrors
// tactical-constants.ts).

// Class/level gates for the damage-mitigation reactions this policy fires.
export const ROGUE_CLASS_ID = 'rogue';
export const MONK_CLASS_ID = 'monk';
export const UNCANNY_DODGE_ROGUE_LEVEL = 5;
export const DEFLECT_ATTACKS_MONK_LEVEL = 3;

// Goliath Stone's Endurance. Mirrors the engine's
// GIANT_ANCESTRY_RESOURCE_ID (src/engine/plan/_giant-ancestry.ts) — the
// resource a Goliath spends to use the reaction. Kept as a literal here
// so the pure layer has no engine-internal import.
export const GOLIATH_SPECIES_ID = 'goliath';
export const GIANT_ANCESTRY_RESOURCE_ID = 'giant-ancestry';

// A limited (one-per-round) reaction shouldn't be spent on a trivial hit,
// so the policy only reacts to hits dealing at least this much damage.
export const REACTION_MIN_DAMAGE = 5;

// Deflect Attacks only applies to Bludgeoning / Piercing / Slashing.
export const PHYSICAL_DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const;

// Pre-damage (prevent-the-trigger) reactions, slice 750. Shield (the spell)
// is +5 AC against the triggering attack; the classes that prepare it in
// the starter pack are Wizard and Sorcerer. Cutting Words reduces the
// attacker's roll for a Bard.
export const SHIELD_SPELL_ID = 'shield';
export const SHIELD_AC_BONUS = 5;
export const SHIELD_CASTER_CLASS_IDS: readonly string[] = ['wizard', 'sorcerer'];
export const BARD_CLASS_ID = 'bard';
