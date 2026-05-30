import { z } from 'zod';
import { EffectSchema } from '../effects.js';

export const FeatSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Slice 511: 'invocation' added for Warlock Eldritch Invocations, each
  // authored as a Feat content row and granted via `GrantFeat` from the
  // warlock's per-tier invocation OfferChoice.
  category: z.enum(['origin', 'general', 'fighting-style', 'epic-boon', 'invocation']),
  repeatable: z.boolean().default(false),
  prerequisites: z.array(z.string()).default([]),
  effects: z.array(EffectSchema).default([]),
});
export type Feat = z.infer<typeof FeatSchema>;
