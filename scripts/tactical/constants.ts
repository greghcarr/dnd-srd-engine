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
// squad case (1v1 and 2v2 are the only fuzz modes). Slice 700: enlarged a
// little so the rock border + features leave a comfortable interior.
export const ARENA_DIMS = {
  duel: { widthCells: 18, heightCells: 13 },
  squad: { widthCells: 22, heightCells: 16 },
} as const;

// Spawn columns sit this many cells in from each edge — far enough in to
// clear the thickest rock border (BORDER_MIN + BORDER_MAX_EXTRA = 3).
export const SPAWN_COLUMN_INSET_CELLS = 4;

// Slice 700 — irregular rock border. Every edge carries at least
// BORDER_MIN_THICKNESS_CELLS of rock, thickened inward by a smooth
// per-position random walk up to BORDER_MAX_EXTRA_CELLS more, so the
// playable region is an irregular blob whose shape varies by seed.
export const BORDER_MIN_THICKNESS_CELLS = 1;
export const BORDER_MAX_EXTRA_CELLS = 2;

// Cells around each spawn kept clear of every obstacle (fair starts).
export const SPAWN_CLEARANCE_RADIUS_CELLS = 1;

// Slice 700 — obstacle densities (fractions of the open interior). Lower
// than the slice-694 single-type 0.18: fewer hard blocks, plus softer
// difficult / water texture that slows movement without blocking it.
export const IMPASSABLE_COVER_DENSITY = 0.07;
export const DIFFICULT_TERRAIN_DENSITY = 0.06;
export const WATER_DENSITY = 0.04;

// Slice 700 — a fenced-in pen (an impassable ring with a one-cell gate)
// appears this fraction of the time, and only when the interior has room
// (so in practice only on the larger / squad map).
export const FENCE_CHANCE = 0.4;
export const FENCE_MIN_INTERIOR_WIDTH_CELLS = 18;
export const FENCE_SIDE_MIN_CELLS = 4;
export const FENCE_SIDE_MAX_CELLS = 6;

// --- Movement policy tunables (slice 695) ---

// Below this fraction of max HP, a combatant flees: retreats to the cell
// that maximizes distance (preferring to break line of sight) and uses
// Disengage to avoid an opportunity attack on the way out.
export const FLEE_HP_FRACTION = 0.3;

// A ranged combatant kites when an enemy is within this distance (or when
// it has lost line of sight and needs to reposition to shoot).
export const MELEE_THREAT_DISTANCE_FEET = 10;

// Melee reach in feet: 5 normally, 10 with a reach weapon.
export const MELEE_REACH_FEET = 5;
export const REACH_WEAPON_FEET = 10;

// Effective attack ranges used to gate kiting (sit at max in-range
// distance). A ranged weapon without an authored range falls back to the
// default; spellcasters use a flat cantrip range (most damaging cantrips
// reach 120 ft, beyond any arena, so kiting just maximizes distance).
export const RANGED_WEAPON_DEFAULT_RANGE_FEET = 80;
export const CASTER_CANTRIP_RANGE_FEET = 120;

// Scoring weights for the destination total order. LoS-break dominates the
// flee score; KITE_IN_RANGE_BONUS dominates the kite score; the small
// bonuses are sub-one-cell (< 5 ft) so they only break ties, never flip
// the distance ordering.
export const LOS_BREAK_BONUS = 1000;
export const KITE_IN_RANGE_BONUS = 1000;
export const COVER_ADJACENT_BONUS = 3;
export const CORNER_TIEBREAK_WEIGHT = 0.5;
