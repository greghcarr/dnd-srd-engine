import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

// Slice 542: Heroic Inspiration as a first-class resource.
//
// RAW (SRD 5.2.1 "Heroic Inspiration"): "When you have Heroic
// Inspiration, you can expend it to reroll any die immediately after
// rolling it, and you must use the new roll. You can have only one
// Heroic Inspiration at a time."
//
// Granted by features with the GrantHeroicInspirationOnLongRest
// marker (Human Resourceful is the canonical user); planLongRest
// auto-emits HeroicInspirationGranted for each participant with the
// marker. Consumed via planConsumeHeroicInspiration.

export const HeroicInspirationGrantedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('HeroicInspirationGranted'),
  characterId: ULIDSchema,
  // Optional source descriptor for transparency (e.g.,
  // 'human-resourceful'). Narrative; not load-bearing.
  source: z.string().optional(),
});
export type HeroicInspirationGrantedEvent = z.infer<typeof HeroicInspirationGrantedEventSchema>;

export const HeroicInspirationConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('HeroicInspirationConsumed'),
  characterId: ULIDSchema,
  // Optional descriptor for what the inspiration was applied to
  // (e.g., 'attack', 'save', 'check', 'damage'). Narrative; the
  // engine does NOT auto-thread the reroll into a prior roll today
  // (consumer-managed reroll integration is deferred).
  appliedTo: z.string().optional(),
});
export type HeroicInspirationConsumedEvent = z.infer<typeof HeroicInspirationConsumedEventSchema>;
