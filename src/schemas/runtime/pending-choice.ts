import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EffectSchema } from '../effects.js';

export const ChoiceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  effects: z.array(EffectSchema).default([]),
});
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;

export const PendingChoiceSchema = z.object({
  id: ULIDSchema,
  prompt: z.string(),
  options: z.array(ChoiceOptionSchema).min(1),
  oneOf: z.number().int().min(1).default(1),
  forCharacterId: ULIDSchema,
  triggerEventId: ULIDSchema,
  // Slice 618: stable content-id for the originating OfferChoice
  // (`effect.choiceId`). Lets the choice-emitter planner dedupe across
  // repeated calls (planOfferCharacterChoices skips choices already
  // present for the character). Optional for backward compat with
  // events committed before slice 618; the dedupe degrades to "no
  // match" for legacy choices, which is acceptable since the bug it
  // closes is for fresh L1 characters.
  promptKey: z.string().optional(),
  // Slice 654: when set, marks this pending choice as the
  // subclass-selection cascade for the named classId. planResolveChoice
  // detects this marker on the PendingChoice and emits a
  // SubclassChosen event alongside ChoiceResolved so the reducer
  // assigns the enrollment's subclassId.
  subclassChoiceForClassId: z.string().optional(),
  resolution: z
    .object({
      selectedOptionIds: z.array(z.string()).min(1),
      atEventId: ULIDSchema,
    })
    .optional(),
});
export type PendingChoice = z.infer<typeof PendingChoiceSchema>;
