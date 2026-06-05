import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { ChoiceOptionSchema } from '../runtime/pending-choice.js';
import { EventEnvelopeSchema } from './envelope.js';

export const HPStrategySchema = z.enum(['roll', 'average']);
export type HPStrategy = z.infer<typeof HPStrategySchema>;

export const LevelUpResolvedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('LevelUpResolved'),
  characterId: ULIDSchema,
  classId: z.string(),
  newClassLevel: z.number().int().min(2).max(20),
  hpStrategy: HPStrategySchema,
  hpRoll: z.number().int().min(1).optional(),
  hpGained: z.number().int().min(1),
});
export type LevelUpResolvedEvent = z.infer<typeof LevelUpResolvedEventSchema>;

export const ChoiceRequiredEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ChoiceRequired'),
  choiceId: ULIDSchema,
  characterId: ULIDSchema,
  promptKey: z.string(),
  prompt: z.string(),
  options: z.array(ChoiceOptionSchema).min(1),
  oneOf: z.number().int().min(1),
  // Slice 654: when set, this ChoiceRequired is the
  // subclass-selection cascade at the class's `subclassLevel`.
  // planResolveChoice detects this marker and emits a
  // SubclassChosen event alongside ChoiceResolved so the
  // reducer sets the enrollment's subclassId.
  subclassChoiceForClassId: z.string().optional(),
  // Slice 661: when 'supersede', only the latest resolution for
  // this promptKey contributes to the effective effect stack
  // (older resolutions for the same promptKey are dropped from
  // the derive layer). Default 'accumulate' preserves slice-618
  // behavior. Set by planOfferLongRestChoices when the source
  // OfferChoice has `lifecycle: 'supersede'`. Threaded onto
  // PendingChoice by applyChoiceRequired so derive doesn't need
  // to cross-look-up the source OfferChoice.
  lifecycle: z.enum(['accumulate', 'supersede']).optional(),
});
export type ChoiceRequiredEvent = z.infer<typeof ChoiceRequiredEventSchema>;

export const ChoiceResolvedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ChoiceResolved'),
  choiceId: ULIDSchema,
  characterId: ULIDSchema,
  selectedOptionIds: z.array(z.string()).min(1),
});
export type ChoiceResolvedEvent = z.infer<typeof ChoiceResolvedEventSchema>;

// Slice 654: emitted by planResolveChoice when the resolved
// choice's `subclassChoiceForClassId` is set. The reducer assigns
// `subclassId` on the matching class enrollment. After this event
// applies, the character's effective effect-stack picks up the
// subclass's levelGrants at the enrollment's current level; any
// nested OfferChoices (Druid Circle Cantrip + Spells, etc.) the
// consumer re-surfaces via a subsequent
// `engine.plan.offerCharacterChoices` call.
export const SubclassChosenEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SubclassChosen'),
  characterId: ULIDSchema,
  classId: z.string(),
  subclassId: z.string(),
});
export type SubclassChosenEvent = z.infer<typeof SubclassChosenEventSchema>;
