// Tunables for the tactical fuzz battle mode (slices 693-695). Kept out
// of the 1,000-line combat-fuzz-core.ts so the harness doesn't grow magic
// numbers, and so the arena generator + movement policy read one source
// of truth. Map constants land here in slice 694; policy constants
// (flee threshold, melee-threat distance) join in slice 695.

// Salt for `seededRNG(seed).fork(MAP_SALT)`. The arena RNG stream is
// forked from a fresh same-seed instance, so it is independent of the
// engine's roll stream and is only ever constructed in tactical mode.
// Value is the ASCII for "MAP"; any fixed integer works.
export const MAP_SALT = 0x4d4150;

// Arena cell dimensions, scaled by team size. teamSize > 2 clamps to the
// squad case (1v1 and 2v2 are the only fuzz modes).
export const ARENA_DIMS = {
  duel: { widthCells: 16, heightCells: 12 },
  squad: { widthCells: 20, heightCells: 14 },
} as const;

// Spawn columns sit this many cells in from each edge.
export const SPAWN_COLUMN_INSET_CELLS = 1;

// Cover is confined to the middle band: columns at least this many cells
// away from each spawn column, so cover never sits on or adjacent to a
// spawn (adjacency is 1 cell; margin 2 keeps a clear gap).
export const COVER_BAND_MARGIN_CELLS = 2;

// Fraction of middle-band cells turned into impassable cover pillars.
export const COVER_DENSITY = 0.18;

// --- Movement policy tunables (slice 695) ---

// Below this fraction of max HP, a combatant flees: it backs off (toward
// the leashed standoff, preferring to break line of sight) and uses
// Disengage to avoid an opportunity attack on the way out. Slice 697:
// flee is bounded by the standoff leash below, so it can no longer retreat
// forever.
export const FLEE_HP_FRACTION = 0.3;

// Melee reach in feet: 5 normally, 10 with a reach weapon.
export const MELEE_REACH_FEET = 5;
export const REACH_WEAPON_FEET = 10;

// A ranged combatant's preferred standoff: far enough to stay out of melee,
// close enough to keep line of sight + be in range. The round leash (below)
// can pull this in over time.
export const RANGED_KITE_STANDOFF_FEET = 30;

// Effective attack ranges (used only as the in-range ceiling on the kite
// standoff). A ranged weapon without an authored range falls back to the
// default; spellcasters use a flat cantrip range.
export const RANGED_WEAPON_DEFAULT_RANGE_FEET = 80;
export const CASTER_CANTRIP_RANGE_FEET = 120;

// Slice 697 — round standoff leash. The convergence mechanism: the maximum
// standoff a combatant is allowed to keep from its enemy shrinks every
// round, so the gap trends monotonically down to melee instead of pinning
// at the arena width. `maxStandoff(round) = max(MIN, INITIAL - RATE*(round-1))`.
// INITIAL sits below the 1v1 spawn gap (~65 ft) so both sides close from
// turn one; by the time the leash reaches MIN everyone is forced to engage.
// This subsumes the "no-progress detector": pressure is unconditional.
export const INITIAL_STANDOFF_FEET = 50;
export const CLOSE_RATE_FEET_PER_ROUND = 10;
export const MIN_STANDOFF_FEET = 5;

// Scoring weights for the destination total order. An attacking combatant
// must see its enemy, so having line of sight dominates; among LoS cells the
// one nearest the desired distance wins. The remaining bonuses are
// sub-one-cell (< 5 ft) so they only break ties, never override the leashed
// distance. FLEE_BREAK_LOS_BONUS is deliberately a tiebreak (not a
// dominator): a fleeing combatant still backs off only to the leash edge and
// breaks line of sight when a covered cell sits at that distance, rather than
// sprinting to any sightless corner (the slice-695 unbounded-flee bug).
export const LOS_PREFERENCE_BONUS = 1000;
export const FLEE_BREAK_LOS_BONUS = 4;
export const COVER_ADJACENT_BONUS = 3;
export const CORNER_TIEBREAK_WEIGHT = 0.5;
// Smallest tiebreak: when the current cell is already as good as any
// reachable cell, prefer to hold rather than shuffle sideways to an
// equally-scored neighbour. Below CORNER_TIEBREAK_WEIGHT so a genuinely
// better cell (more cover, better corner) still wins.
export const STAY_BIAS_BONUS = 0.1;
