import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { PositionSchema } from './encounter.js';

export const AppliedConditionRefSchema = z.object({
  targetId: ULIDSchema,
  conditionId: z.string(),
  appliedConditionId: ULIDSchema,
});
export type AppliedConditionRef = z.infer<typeof AppliedConditionRefSchema>;

// Slice 495: positioned AOE-zone metadata for concentration spells whose
// area persists in space (Fog Cloud, Darkness, Silent Image, Stinking
// Cloud, Silence, etc.). Bound to the parent EffectInstance, so when
// concentration breaks the zone is removed automatically (no separate
// state field). The engine treats the zone as opaque metadata — the
// "creatures in heavy obscurement are effectively Blinded" / "creatures
// in the area must save against being incapacitated" / etc. RAW arms
// stay consumer-managed (the consumer reads the zone + applies the
// effect to creatures inside). This slice ships the structural record;
// future slices may add auto-enforcement for specific zone types.
export const ZoneShapeSchema = z.enum(['sphere', 'cube', 'cylinder', 'line', 'cone']);
export type ZoneShape = z.infer<typeof ZoneShapeSchema>;

export const ZoneSchema = z.object({
  shape: ZoneShapeSchema,
  size: z.number().int().min(1),
  center: PositionSchema,
});
export type Zone = z.infer<typeof ZoneSchema>;

export const EffectInstanceSchema = z.object({
  id: ULIDSchema,
  spellId: z.string(),
  casterId: ULIDSchema,
  targetIds: z.array(ULIDSchema).default([]),
  conditionsApplied: z.array(AppliedConditionRefSchema).default([]),
  requiresConcentration: z.boolean(),
  durationRounds: z.number().int().min(0).optional(),
  // Wall-clock duration of the spell in in-game minutes. Set when the
  // effect starts; used by planExpireSpellDurations to clear effects
  // whose listed duration has elapsed (Bless 1 min, Heroes' Feast 24h).
  durationMinutes: z.number().int().min(0).optional(),
  // In-game time (state.inGameTime.totalMinutes) at which the effect
  // started. Combined with durationMinutes to determine expiry.
  startedAtMinutes: z.number().int().min(0).optional(),
  // The slot level the spell was cast at. Needed by planTickAura (and
  // any future planner that needs to scale per-cast effects based on the
  // upcasted slot level) since the consumer doesn't always have the cast
  // intent in hand at tick time.
  slotLevel: z.number().int().min(0).optional(),
  startedAtEventId: ULIDSchema,
  // Slice 495: positioned AOE-zone metadata for concentration spells
  // whose area persists in space. Read by consumers to know where the
  // zone is + apply the spell's RAW effect to creatures in/leaving the
  // zone. Removed automatically when concentration breaks (the parent
  // EffectInstance is deleted).
  zone: ZoneSchema.optional(),
  // Slice 873: remaining cumulative-damage budget for an `aura-damage`
  // mechanic that carries `damageBudget` (Guardian of Faith's 60). Initialized
  // at cast from the mechanic; `planTickAura` decrements it by the damage dealt
  // each tick and ends the effect (the guardian vanishes) when it reaches 0.
  auraDamageBudgetRemaining: z.number().int().optional(),
});
export type EffectInstance = z.infer<typeof EffectInstanceSchema>;
