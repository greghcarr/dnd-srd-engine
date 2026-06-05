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
