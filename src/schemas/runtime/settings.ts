import { z } from 'zod';

export const CampaignSettingsSchema = z.object({
  grittyRest: z.boolean().default(false),
  heroPoints: z.boolean().default(false),
  sanity: z.boolean().default(false),
  massCombat: z.boolean().default(false),
  feaCharacterFlaws: z.boolean().default(false),
  // Slice 898: enforce the SRD 5.2.1 Long Rest cadence — "After you finish a
  // Long Rest, you must wait at least 16 hours before starting another one."
  // Opt-in (default off) because the rule needs the consumer's in-game clock
  // (`inGameTime`, advanced via InGameTimeAdvanced); with no clock every rest
  // sits at the same minute, so a default-on gate would reject the common
  // rest-fight-rest loop for consumers that don't track time.
  enforceLongRestCadence: z.boolean().default(false),
  customHouserules: z.array(z.string()).default([]),
});
export type CampaignSettings = z.infer<typeof CampaignSettingsSchema>;

export const defaultCampaignSettings = (): CampaignSettings => ({
  grittyRest: false,
  heroPoints: false,
  sanity: false,
  massCombat: false,
  feaCharacterFlaws: false,
  enforceLongRestCadence: false,
  customHouserules: [],
});
