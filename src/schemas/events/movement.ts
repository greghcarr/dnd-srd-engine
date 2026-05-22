import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { PositionSchema } from '../runtime/encounter.js';
import { EventEnvelopeSchema } from './envelope.js';

export const CombatantMovedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('CombatantMoved'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  fromPosition: PositionSchema.optional(),
  toPosition: PositionSchema,
  feetTraveled: z.number().min(0),
});
export type CombatantMovedEvent = z.infer<typeof CombatantMovedEventSchema>;

export const DashedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('Dashed'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
});
export type DashedEvent = z.infer<typeof DashedEventSchema>;

export const DisengagedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('Disengaged'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  // Rogue Withdraw (Cunning Strike): instead of full-turn Disengage, the
  // bearer's movement doesn't provoke only up to this many feet (RAW "move
  // up to half your Speed without provoking"). When set, the reducer stamps
  // a no-provoke high-water-mark on turnUsage rather than the full-turn
  // `disengaged` flag. Omitted for the normal Disengage action.
  limitedToFeet: z.number().int().min(0).optional(),
});
export type DisengagedEvent = z.infer<typeof DisengagedEventSchema>;

// Record-only notification. RAW 2024 PHB ch.1 "Opportunity Attack":
// when a creature moves out of an enemy's reach, that enemy can take
// a Reaction to make a melee attack against them. The engine surfaces
// the moment of opportunity here so consumers can decide (per
// reactor) whether to dispatch `engine.plan.opportunityAttack`. No
// state effect — the apply() reducer for this event is intentionally
// a no-op.
export const OpportunityAvailableEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('OpportunityAvailable'),
  encounterId: ULIDSchema,
  // The combatant who moved out of reach (would-be target of the OA).
  moverId: ULIDSchema,
  // The combatant who is eligible to take the reaction.
  reactorId: ULIDSchema,
  // Positions captured at the moment of opportunity. fromPosition is
  // where the mover started; toPosition is where they ended up.
  reactorPosition: PositionSchema,
  fromPosition: PositionSchema,
  toPosition: PositionSchema,
});
export type OpportunityAvailableEvent = z.infer<typeof OpportunityAvailableEventSchema>;
