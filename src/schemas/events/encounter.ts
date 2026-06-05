import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';
import { PositionSchema } from '../runtime/encounter.js';

// Slice 683: per-combatant placement entry for EncounterCreated.
// The `position` is optional so consumers can pre-place some
// combatants and leave others positionless (the reducer leaves
// `combatant.position === undefined` in that case). When omitted,
// the legacy `combatantIds` array is used to seed combatants
// (no positions) — both fields are mutually exclusive: when
// `combatants` is set, `combatantIds` is ignored.
export const EncounterCombatantPlacementSchema = z.object({
  characterId: ULIDSchema,
  position: PositionSchema.optional(),
});
export type EncounterCombatantPlacement = z.infer<typeof EncounterCombatantPlacementSchema>;

// Slice 683: either-or invariant ("at least one of combatants /
// combatantIds is set") is enforced in `applyEncounterCreated` and
// `planCreateEncounter`, NOT via a .refine() on this schema — Zod's
// .refine() wraps the schema such that the EventSchema discriminated
// union can't narrow the type cleanly downstream (it sees the
// refined shape as an opaque object, not a literal-tagged member).
export const EncounterCreatedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('EncounterCreated'),
  encounterId: ULIDSchema,
  name: z.string().optional(),
  combatantIds: z.array(ULIDSchema).min(1).optional(),
  // Slice 683: when present, supersedes `combatantIds`. Carries
  // optional starting positions per combatant.
  combatants: z.array(EncounterCombatantPlacementSchema).min(1).optional(),
});
export type EncounterCreatedEvent = z.infer<typeof EncounterCreatedEventSchema>;

// Slice 683: mid-encounter placement (summons, teleports,
// dimension-door style relocations). Sets the named combatant's
// position; consumers can also use this to move a positionless
// combatant into the grid for the first time. The reducer
// validates that the combatant exists in the encounter and
// (optionally) that the new position is valid against the
// encounter's associated map (in-bounds, not impassable, not
// occupied by another combatant).
export const CombatantPlacedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('CombatantPlaced'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  position: PositionSchema,
});
export type CombatantPlacedEvent = z.infer<typeof CombatantPlacedEventSchema>;

export const InitiativeRollSchema = z.object({
  combatantId: ULIDSchema,
  d20: z.number().int().min(1).max(20),
  modifier: z.number().int(),
  total: z.number().int(),
});
export type InitiativeRoll = z.infer<typeof InitiativeRollSchema>;

export const InitiativeRolledEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('InitiativeRolled'),
  encounterId: ULIDSchema,
  rolls: z.array(InitiativeRollSchema).min(1),
});
export type InitiativeRolledEvent = z.infer<typeof InitiativeRolledEventSchema>;

// Slice 468: Alert (Origin Feat) Initiative Swap arm. RAW (SRD 5.2.1):
// "Immediately after you roll Initiative, you can swap your Initiative
// with the Initiative of one willing ally in the same combat. You can't
// make this swap if you or the ally has the Incapacitated condition."
// The reducer exchanges initiative values + recomputes initiativeOrder
// across the whole combatant list (the same sort the InitiativeRolled
// reducer runs). Only legal while encounter.status === 'planning',
// matching the InitiativeRolled gate.
export const InitiativeSwappedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('InitiativeSwapped'),
  encounterId: ULIDSchema,
  swapperId: ULIDSchema,
  allyId: ULIDSchema,
  swapperPreviousTotal: z.number().int(),
  allyPreviousTotal: z.number().int(),
});
export type InitiativeSwappedEvent = z.infer<typeof InitiativeSwappedEventSchema>;

export const EncounterStartedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('EncounterStarted'),
  encounterId: ULIDSchema,
});
export type EncounterStartedEvent = z.infer<typeof EncounterStartedEventSchema>;

export const TurnStartedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('TurnStarted'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  round: z.number().int().min(1),
});
export type TurnStartedEvent = z.infer<typeof TurnStartedEventSchema>;

export const TurnEndedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('TurnEnded'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  round: z.number().int().min(1),
});
export type TurnEndedEvent = z.infer<typeof TurnEndedEventSchema>;

export const RoundEndedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('RoundEnded'),
  encounterId: ULIDSchema,
  round: z.number().int().min(1),
});
export type RoundEndedEvent = z.infer<typeof RoundEndedEventSchema>;

export const EncounterEndedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('EncounterEnded'),
  encounterId: ULIDSchema,
  outcome: z.enum(['victory', 'defeat', 'fled', 'parley']),
});
export type EncounterEndedEvent = z.infer<typeof EncounterEndedEventSchema>;
