import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

export const ACTION_ECONOMY_KINDS = ['action', 'bonusAction', 'reaction', 'attack'] as const;
export const ActionEconomyKindSchema = z.enum(ACTION_ECONOMY_KINDS);
export type ActionEconomyKind = z.infer<typeof ActionEconomyKindSchema>;

export const ActionEconomyConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ActionEconomyConsumed'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  kind: ActionEconomyKindSchema,
});
export type ActionEconomyConsumedEvent = z.infer<typeof ActionEconomyConsumedEventSchema>;

// Barbarian Reckless Attack toggle. Set on the combatant's turnUsage
// before their first attack. Persists until their next TurnStarted.
export const RecklessAttackActivatedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('RecklessAttackActivated'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
});
export type RecklessAttackActivatedEvent = z.infer<typeof RecklessAttackActivatedEventSchema>;

// Monk Stunning Strike attempt marker. Records the monk used their
// once-per-turn Stunning Strike; the reducer sets the corresponding
// turnUsage flag. The actual save + condition application are emitted
// as separate SaveRolled + ConditionApplied events.
export const StunningStrikeAttemptedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('StunningStrikeAttempted'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  targetId: ULIDSchema,
});
export type StunningStrikeAttemptedEvent = z.infer<typeof StunningStrikeAttemptedEventSchema>;

// Slice 467: Savage Attacker (Origin Feat) marker. Records the
// attacker used their once-per-turn weapon-damage-dice reroll; the
// reducer sets the turnUsage.savageAttackerUsedThisTurn flag. Emitted
// only when the reroll actually fired (the attack hit and the
// alternate set was rolled), so a missed swing with useSavageAttacker
// true does NOT consume the per-turn use. `discardedRolls` carries
// the rejected set for transcript visibility; the kept set lives on
// the sibling DamageRolled event.
export const SavageAttackerUsedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SavageAttackerUsed'),
  attackerId: ULIDSchema,
  targetId: ULIDSchema,
  weaponInstanceId: ULIDSchema,
  encounterId: ULIDSchema.optional(),
  combatantId: ULIDSchema.optional(),
  discardedRolls: z.array(z.number().int().min(1)),
  causedByEventId: ULIDSchema.optional(),
});
export type SavageAttackerUsedEvent = z.infer<typeof SavageAttackerUsedEventSchema>;
