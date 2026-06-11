import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

// Slice 829: lifecycle events for Recharge-gated monster save-actions
// (Air Elemental Whirlwind). The SaveRolled + DamageApplied + Condition
// Applied + CreaturePushed chain is emitted alongside these by
// planSaveAction; these two carry the higher-level "this save-action
// expended / recharged" signal so the reducer can add / remove the id
// from the bearer's `expendedSaveActionIds`. Mirrors the breath-weapon
// lifecycle pair, but keyed by save-action id (a monster could carry more
// than one recharge action). Non-recharge save-actions (Constrict) never
// emit these.

export const SaveActionExpendedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SaveActionExpended'),
  monsterId: ULIDSchema,
  // Stable id of the expended save-action (matches the
  // `MonsterStatblock.saveActions[].id` that carries `recharge`).
  saveActionId: z.string(),
});
export type SaveActionExpendedEvent = z.infer<typeof SaveActionExpendedEventSchema>;

export const SaveActionRechargedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SaveActionRecharged'),
  monsterId: ULIDSchema,
  saveActionId: z.string(),
  // The d6 roll that returned the action to ready. Surfaced for transcript
  // display ("Air Elemental's Whirlwind recharges on a 5!").
  roll: z.number().int().min(1).max(6),
});
export type SaveActionRechargedEvent = z.infer<typeof SaveActionRechargedEventSchema>;
