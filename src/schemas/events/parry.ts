import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

// Slice 831: the monster Parry reaction notification. RAW (SRD 5.2.1
// Knight / Bandit Captain / Gladiator / Noble / Warrior Veteran):
// "Trigger: hit by a melee attack roll while holding a weapon. Response:
// adds N to its AC against that attack, possibly causing it to miss."
//
// Pure notification (like ShieldCast / ProtectionUsed): the AC bump is
// resolved here into `preventedHit`, and the consumer omits the
// DamageRolled / DamageApplied chain when `preventedHit === true`. The
// reaction-economy bookkeeping rides on the accompanying
// ActionEconomyConsumed; this event carries the bump + outcome for the
// transcript and the consumer's branch.
export const ParryUsedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ParryUsed'),
  characterId: ULIDSchema,
  // The AttackRolled event id whose hit is being parried.
  triggeringAttackEventId: ULIDSchema,
  // The +N AC this creature's Parry adds (Knight/Captain/Noble/Veteran 2,
  // Gladiator 3).
  acBonus: z.number().int().min(1),
  // True when `acBonus` is enough to convert the triggering hit into a miss
  // (triggeringAttackTotal < originalAC + acBonus).
  preventedHit: z.boolean(),
});
export type ParryUsedEvent = z.infer<typeof ParryUsedEventSchema>;
