import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

// Slice 718: per-participant resource changes a rest applies beyond the
// per-resource recharge cadence — the resolved deltas of `RecoverResource`
// effects (Font of Inspiration, Sorcerous Restoration) plus any gate
// spend. Computed at plan time (amount 'all'/formula resolved against the
// pre-rest state) and applied (clamped to 0..max) by the rest reducer.
const ResourceDeltaSchema = z.object({
  characterId: ULIDSchema,
  resourceId: z.string(),
  delta: z.number().int(),
});

export const ShortRestStartedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ShortRestStarted'),
  participantIds: z.array(ULIDSchema).min(1),
  // The in-game minutes the rest is expected to last. Default standard
  // rules: 60 minutes for a short rest, 480 for a long rest. Gritty
  // realism (`CampaignSettings.grittyRest` true): 480 short / 10080
  // long. The planner stamps the value from the active settings so
  // consumers can advance the in-game clock by the right amount.
  expectedDurationMinutes: z.number().int().min(1).optional(),
});
export type ShortRestStartedEvent = z.infer<typeof ShortRestStartedEventSchema>;

export const ShortRestEndedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ShortRestEnded'),
  resourceDeltas: z.array(ResourceDeltaSchema).optional(),
});
export type ShortRestEndedEvent = z.infer<typeof ShortRestEndedEventSchema>;

export const LongRestStartedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('LongRestStarted'),
  participantIds: z.array(ULIDSchema).min(1),
  expectedDurationMinutes: z.number().int().min(1).optional(),
});
export type LongRestStartedEvent = z.infer<typeof LongRestStartedEventSchema>;

export const LongRestEndedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('LongRestEnded'),
  resourceDeltas: z.array(ResourceDeltaSchema).optional(),
});
export type LongRestEndedEvent = z.infer<typeof LongRestEndedEventSchema>;
