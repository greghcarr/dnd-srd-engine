// Shared engine-internal constants. Anything used by more than one planner
// or reducer lives here so values stay consistent across the engine.

export const D20_SIDES = 20;
export const NAT_20 = 20;
export const NAT_1 = 1;
// RAW PHB 2024 Exhaustion: -2 per level on every d20 Test (ability
// checks, saving throws, attack rolls); -5 ft per level on Speed.
// The existing _SAVE_PENALTY_PER_LEVEL is the legacy name (predated the
// 2024 unification); slice 569 introduces _ATTACK_PENALTY_PER_LEVEL and
// _SPEED_PENALTY_PER_LEVEL with the same numeric value, distinct names
// so the per-dimension wiring is greppable.
export const EXHAUSTION_SAVE_PENALTY_PER_LEVEL = -2;
export const EXHAUSTION_ATTACK_PENALTY_PER_LEVEL = -2;
export const EXHAUSTION_SPEED_PENALTY_PER_LEVEL = -5;
export const CANTRIP_LEVEL = 0;
