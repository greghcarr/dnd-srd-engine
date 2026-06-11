import { z } from 'zod';
import { EffectSchema } from '../effects.js';
import { AbilityScoreSchema } from '../primitives.js';

export const FeatSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Slice 511: 'invocation' added for Warlock Eldritch Invocations, each
  // authored as a Feat content row and granted via `GrantFeat` from the
  // warlock's per-tier invocation OfferChoice.
  category: z.enum(['origin', 'general', 'fighting-style', 'epic-boon', 'invocation']),
  repeatable: z.boolean().default(false),
  prerequisites: z.array(z.string()).default([]),
  // Slice 809: the machine-checkable ability-score prerequisite (the
  // free-text `prerequisites` array is display-only). A character
  // qualifies when at least one listed ability's effective score meets
  // `min` (RAW Grappler: "Strength or Dexterity 13+"). Read by the feat-
  // menu eligibility filter in planLevelUp; absent → no ability gate.
  abilityPrerequisite: z
    .object({
      abilities: z.array(AbilityScoreSchema).min(1),
      min: z.number().int().min(1),
    })
    .optional(),
  effects: z.array(EffectSchema).default([]),
});
export type Feat = z.infer<typeof FeatSchema>;
