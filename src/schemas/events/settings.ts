import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

export const CampaignSettingsChangedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('CampaignSettingsChanged'),
  grittyRest: z.boolean().optional(),
  heroPoints: z.boolean().optional(),
  sanity: z.boolean().optional(),
  massCombat: z.boolean().optional(),
  feaCharacterFlaws: z.boolean().optional(),
  enforceLongRestCadence: z.boolean().optional(),
  customHouserulesAdd: z.array(z.string()).optional(),
  customHouserulesRemove: z.array(z.string()).optional(),
});
export type CampaignSettingsChangedEvent = z.infer<typeof CampaignSettingsChangedEventSchema>;

export const HeroPointGrantedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('HeroPointGranted'),
  characterId: ULIDSchema,
  // Signed amount: positive for a grant, negative for an out-of-band
  // adjustment (the GM takes one back for a story reason). Typical
  // value: 5 + max(0, totalLevel - 1) on a long rest reset.
  amount: z.number().int(),
});
export type HeroPointGrantedEvent = z.infer<typeof HeroPointGrantedEventSchema>;

export const HeroPointSpentEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('HeroPointSpent'),
  characterId: ULIDSchema,
  // The d6 the engine rolled when this point was spent. Consumers add
  // it to whichever attack / save / check the character is making.
  d6: z.number().int().min(1).max(6),
  // Optional reference for transcript clarity — the event being
  // augmented (an AttackRolled, SaveRolled, AbilityCheckRolled).
  appliedToEventId: ULIDSchema.optional(),
  // What kind of roll the d6 augments. Purely informational.
  appliedTo: z.enum(['attack', 'save', 'check', 'stabilize']).optional(),
});
export type HeroPointSpentEvent = z.infer<typeof HeroPointSpentEventSchema>;
