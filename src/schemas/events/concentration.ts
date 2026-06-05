import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';
import { AppliedConditionRefSchema, ZoneSchema } from '../runtime/effect-instance.js';

export const ConcentrationStartedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ConcentrationStarted'),
  effectInstanceId: ULIDSchema,
  casterId: ULIDSchema,
  spellId: z.string(),
  targetIds: z.array(ULIDSchema).default([]),
  conditionsApplied: z.array(AppliedConditionRefSchema).default([]),
  durationRounds: z.number().int().min(0).optional(),
  // Wall-clock duration in in-game minutes (parsed from the spell's
  // duration string at plan time). The reducer pairs this with the
  // current state.inGameTime to populate EffectInstance.durationMinutes
  // and startedAtMinutes, used by planExpireSpellDurations.
  durationMinutes: z.number().int().min(0).optional(),
  // The slot level the spell was cast at, copied onto the EffectInstance
  // so later planners (planTickAura for Spirit Guardians, etc.) can
  // scale per-cast effects without the consumer holding onto the cast
  // intent.
  slotLevel: z.number().int().min(0).optional(),
  // Slice 495: AOE-zone metadata for concentration spells whose area
  // persists in space (Fog Cloud, Darkness, Silent Image, etc.).
  // Carried on the event log AND on the EffectInstance the reducer
  // creates, so consumers can read the zone's center / shape / size
  // both from the transcript and from live state. Concentration drop
  // removes the EffectInstance, removing the zone.
  zone: ZoneSchema.optional(),
});
export type ConcentrationStartedEvent = z.infer<typeof ConcentrationStartedEventSchema>;

// Slice 665: non-concentration spell effect started. Mirrors
// ConcentrationStartedEventSchema's payload but without the
// concentration claim — used for spells that persist as positioned
// AOEs but don't tie up the caster's concentration slot
// (Zone of Truth, Tiny Hut, etc.). The reducer creates an
// EffectInstance with `requiresConcentration: false` and DOES NOT
// set `caster.concentrationEffectId`. Cleanup uses the same
// ConcentrationBroken event (the cleanup helper is type-agnostic);
// `planExpireSpellDurations` emits it for any EffectInstance whose
// listed duration has elapsed.
export const SpellEffectStartedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SpellEffectStarted'),
  effectInstanceId: ULIDSchema,
  casterId: ULIDSchema,
  spellId: z.string(),
  targetIds: z.array(ULIDSchema).default([]),
  conditionsApplied: z.array(AppliedConditionRefSchema).default([]),
  durationRounds: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(0).optional(),
  slotLevel: z.number().int().min(0).optional(),
  zone: ZoneSchema.optional(),
});
export type SpellEffectStartedEvent = z.infer<typeof SpellEffectStartedEventSchema>;

export const ConcentrationBrokenReasonSchema = z.enum([
  'failedSave',
  'newConcentrationSpell',
  'voluntary',
  'incapacitated',
  'unconscious',
  'dead',
  'durationEnded',
  'used',
]);
export type ConcentrationBrokenReason = z.infer<typeof ConcentrationBrokenReasonSchema>;

export const ConcentrationBrokenEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ConcentrationBroken'),
  effectInstanceId: ULIDSchema,
  casterId: ULIDSchema,
  reason: ConcentrationBrokenReasonSchema,
});
export type ConcentrationBrokenEvent = z.infer<typeof ConcentrationBrokenEventSchema>;
